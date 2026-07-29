import type { CounterGrade, Direction } from '../core/index.js'
import {
  directionToLane,
  eighthMillisecondsForTier,
  eighthSecondsForTier,
  gridPosition,
  isSectionBoundary,
  laneFrequency,
  lanePan,
  layersForTier,
  normalizeTempoTier,
  tempoForTier,
  tierForThreat,
  type AudioLane,
  type GridPosition,
  type TempoTier,
} from './music-model.js'

export type AudioBus = 'music' | 'effects' | 'interface'
type MusicStem = 'rhythm' | 'harmony' | 'melody'
type AudioTarget = AudioBus | MusicStem

export type AudioSettings = {
  muted: boolean
  music: number
  effects: number
  interface: number
}

export type TransportStartOptions = {
  tempoTier?: TempoTier
  startAtPerformanceMs?: number
}

export type AudioTransportSnapshot = {
  running: boolean
  tempoTier: TempoTier
  pendingTempoTier: TempoTier | null
  bpm: number
  eighthMs: number
  next: GridPosition
  nextSlotPerformanceMs: number | null
  calibrationOffsetMs: number
}

export type BossCallOptions = {
  lane: AudioLane
  callAtPerformanceMs?: number
  targetAtPerformanceMs?: number
  heavy?: boolean
}

type PendingBossCall = {
  timeoutId: number
  callAtPerformanceMs: number
  targetAtPerformanceMs: number | undefined
}

export type CounterHitOptions = {
  lane: AudioLane
  grade: 'perfect' | 'normal' | 'miss'
  atPerformanceMs?: number
}

/** 戰鬥結束時唯一允許播放的非操作收束音樂。 */
export type EncounterFinaleOutcome = 'victory' | 'defeat'

export type EncounterFinaleSnapshot = {
  outcome: EncounterFinaleOutcome
  startsAtPerformanceMs: number
  endsAtPerformanceMs: number
  /** 一個完整 4/4 收束小節加上尾韻，render 應在此後再切換畫面。 */
  durationMs: number
}

export type ModuleAudioKind =
  | 'echo-blade'
  | 'downbeat-capacitor'
  | 'cross-circuit'
  | 'syncopation-core'
  | 'silent-shield'

type VoiceOptions = {
  bus: AudioTarget
  frequency: number
  duration: number
  gain: number
  at?: number
  endFrequency?: number
  attack?: number
  filterFrequency?: number
  pan?: number
  type?: OscillatorType
}

type NoiseOptions = {
  bus: AudioTarget
  duration: number
  gain: number
  at: number
  filterFrequency: number
  filterType: BiquadFilterType
  pan?: number
}

const defaultSettings: AudioSettings = {
  muted: false,
  music: 0.64,
  effects: 0.78,
  interface: 0.58,
}

const harmony = [
  [50, 53, 57],
  [46, 50, 53],
  [41, 48, 53],
  [48, 52, 55],
] as const
const bass = [38, 34, 41, 36] as const
const callMelody = [
  [69, 72],
  [65, 69],
  [69, 77],
  [67, 76],
] as const

function midiFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

function decibelsToGain(decibels: number): number {
  return 10 ** (decibels / 20)
}

export class CounterOverdriveAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Partial<Record<AudioBus, GainNode>> = {}
  private stems: Partial<Record<MusicStem, GainNode>> = {}
  private settings: AudioSettings = { ...defaultSettings }
  private schedulerId: number | null = null
  private nextSlotAt = 0
  private absoluteSlot = 0
  private tempoTier: TempoTier = 0
  private pendingTempoTier: TempoTier | null = null
  private calibrationOffsetMs = 0
  private lastLane: AudioLane = 'center'
  private noiseBuffer: AudioBuffer | null = null
  private interruptionHandler: (() => void) | null = null
  private pendingBossCalls = new Map<number, PendingBossCall>()
  private nextBossCallId = 0
  /**
   * 終曲開始後，戰鬥目標的 call／response 都必須靜音；只有 finale
   * 自己排出的收束小節可以繼續播放。
   */
  private finalizing = false

  get tempo(): number {
    return tempoForTier(this.tempoTier)
  }

  get currentSettings(): Readonly<AudioSettings> {
    return this.settings
  }

  async unlock(): Promise<void> {
    if (this.context === null) {
      this.context = new AudioContext()
      this.createMixGraph()
      this.noiseBuffer = this.createNoiseBuffer()
      this.context.addEventListener('statechange', () => {
        if (this.context?.state !== 'running') this.interruptionHandler?.()
      })
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  startTransport(options: TransportStartOptions = {}): AudioTransportSnapshot {
    const context = this.context
    if (options.tempoTier !== undefined) {
      this.tempoTier = normalizeTempoTier(options.tempoTier)
      this.pendingTempoTier = null
    }
    this.finalizing = false
    if (context === null || this.schedulerId !== null) {
      return this.getTransportSnapshot()
    }
    this.absoluteSlot = 0
    const requestedStart =
      options.startAtPerformanceMs === undefined
        ? context.currentTime + 0.06
        : this.performanceTimeToContextTime(options.startAtPerformanceMs)
    this.nextSlotAt = Math.max(context.currentTime + 0.02, requestedStart)
    this.schedulerId = window.setInterval(() => this.scheduleTransport(), 25)
    this.scheduleTransport()
    return this.getTransportSnapshot()
  }

  /** 舊版 render 相容名稱。 */
  startMusic(): void {
    this.startTransport()
  }

  stopTransport(): void {
    this.cancelBossCallsFrom(Number.NEGATIVE_INFINITY)
    if (this.schedulerId === null) return
    window.clearInterval(this.schedulerId)
    this.schedulerId = null
  }

  /** 舊版 render 相容名稱。 */
  stopMusic(): void {
    this.stopTransport()
  }

  setInterruptionHandler(handler: (() => void) | null): void {
    this.interruptionHandler = handler
  }

  setTempoTier(tier: TempoTier, atSectionBoundary = true): void {
    const normalized = normalizeTempoTier(tier)
    if (this.schedulerId === null || !atSectionBoundary) {
      this.tempoTier = normalized
      this.pendingTempoTier = null
      return
    }
    this.pendingTempoTier = normalized === this.tempoTier ? null : normalized
  }

  /** 舊版 threat 相容層；換速只會在八小節 section 邊界生效。 */
  setThreat(threat: number): void {
    this.setTempoTier(tierForThreat(threat))
  }

  getTransportSnapshot(): AudioTransportSnapshot {
    return {
      running: this.schedulerId !== null,
      tempoTier: this.tempoTier,
      pendingTempoTier: this.pendingTempoTier,
      bpm: this.tempo,
      eighthMs: eighthMillisecondsForTier(this.tempoTier),
      next: gridPosition(this.absoluteSlot),
      nextSlotPerformanceMs:
        this.context === null || this.schedulerId === null
          ? null
          : this.contextTimeToPerformanceTime(this.nextSlotAt),
      calibrationOffsetMs: this.calibrationOffsetMs,
    }
  }

  setCalibrationOffset(offsetMs: number): void {
    this.calibrationOffsetMs =
      Math.round(Math.max(-150, Math.min(150, offsetMs)) / 5) * 5
  }

  calibratedInputTime(eventPerformanceMs: number): number {
    return eventPerformanceMs + this.calibrationOffsetMs
  }

  performanceTimeToContextTime(performanceMs: number): number {
    const context = this.context
    if (context === null) return 0
    const timestamp = this.outputTimestamp()
    return (
      timestamp.contextTime +
      (performanceMs - timestamp.performanceTime) / 1000
    )
  }

  contextTimeToPerformanceTime(contextTime: number): number {
    const timestamp = this.outputTimestamp()
    return (
      timestamp.performanceTime +
      (contextTime - timestamp.contextTime) * 1000
    )
  }

  scheduleBossCall(options: BossCallOptions): void {
    if (this.finalizing) return
    const callAtPerformanceMs = options.callAtPerformanceMs ?? performance.now()
    const token = this.nextBossCallId++
    const schedule = (): void => {
      this.pendingBossCalls.delete(token)
      this.scheduleBossCallNow(options)
    }
    const delay = callAtPerformanceMs - performance.now()
    if (delay <= 4) {
      schedule()
      return
    }
    const timeoutId = window.setTimeout(schedule, delay)
    this.pendingBossCalls.set(token, {
      timeoutId,
      callAtPerformanceMs,
      targetAtPerformanceMs: options.targetAtPerformanceMs,
    })
  }

  /**
   * Target rewrites (for example Circuit Breaker) invalidate any Boss calls
   * that have not begun yet.  Keeping these as cancellable timers prevents a
   * removed lane from leaving an audible ghost hint in the next bar.
   */
  cancelBossCallsFrom(targetPerformanceMs: number): void {
    for (const [token, pending] of this.pendingBossCalls) {
      const targetAt = pending.targetAtPerformanceMs ?? pending.callAtPerformanceMs
      if (targetAt < targetPerformanceMs) continue
      window.clearTimeout(pending.timeoutId)
      this.pendingBossCalls.delete(token)
    }
  }

  private scheduleBossCallNow(options: BossCallOptions): void {
    const context = this.context
    if (context === null || this.finalizing) return
    this.lastLane = options.lane
    const callAt = this.resolveContextTime(options.callAtPerformanceMs)
    this.playLaneCue(options.lane, callAt, options.heavy ?? false, 'boss')
    this.duckMusicalBed(options.lane === 'center' ? 4.5 : 2.5, callAt, 0.11)

    // Pickup 是每小節 slot 3 的統一節拍事件，不隨每個 target 重複排程；
    // 因此 Boss cue 永遠不會滲入玩家的 response slots 4–7。
  }

  playCounterHit(options: CounterHitOptions): void {
    if (this.finalizing) return
    const at = this.resolveContextTime(options.atPerformanceMs)
    this.lastLane = options.lane
    if (options.grade === 'perfect') {
      this.playLaneCue(options.lane, at, true, 'player')
      const root = laneFrequency(options.lane) * 2
      this.chord(
        [root, root * 1.5, root * 2],
        0.18,
        0.074,
        'effects',
        'triangle',
        at,
      )
      this.voice({
        bus: 'effects',
        frequency: root * 2,
        endFrequency: root * 2.5,
        duration: eighthSecondsForTier(this.tempoTier) * 0.8,
        gain: 0.032,
        at: at + eighthSecondsForTier(this.tempoTier),
        pan: lanePan(options.lane) * 0.45,
        type: 'sine',
      })
      this.duckMusicalBed(4.5, at, 0.13)
    } else if (options.grade === 'normal') {
      this.playLaneCue(options.lane, at, false, 'player')
      this.duckMusicalBed(2.5, at, 0.09)
    } else {
      this.mutedThud(at, options.lane)
    }
  }

  playModuleResponse(
    kind: ModuleAudioKind,
    atPerformanceMs?: number,
  ): void {
    if (this.finalizing) return
    const at = this.resolveContextTime(atPerformanceMs)
    if (kind === 'echo-blade') {
      this.voice({
        bus: 'effects',
        frequency: laneFrequency(this.lastLane) * 2.4,
        endFrequency: laneFrequency(this.lastLane) * 1.4,
        duration: 0.11,
        gain: 0.032,
        at,
        pan: -lanePan(this.lastLane) * 0.6,
        type: 'triangle',
      })
    } else if (kind === 'downbeat-capacitor') {
      this.voice({
        bus: 'effects',
        frequency: 73.42,
        endFrequency: 55,
        duration: 0.26,
        gain: 0.052,
        at,
        type: 'sine',
      })
    } else if (kind === 'cross-circuit') {
      this.hat(at, 0.023, lanePan(this.lastLane) * 0.45)
      this.hat(at + eighthSecondsForTier(this.tempoTier) / 2, 0.016, 0)
    } else if (kind === 'syncopation-core') {
      this.rim(at, 0.033, -0.28)
      this.rim(at + eighthSecondsForTier(this.tempoTier), 0.024, 0.28)
    } else {
      this.noise({
        bus: 'effects',
        duration: 0.18,
        gain: 0.038,
        at,
        filterFrequency: 2700,
        filterType: 'bandpass',
      })
      this.voice({
        bus: 'effects',
        frequency: 880,
        endFrequency: 330,
        duration: 0.2,
        gain: 0.025,
        at,
        type: 'triangle',
      })
    }
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    const normalized = Math.max(0, Math.min(1, volume))
    this.settings = { ...this.settings, [bus]: normalized }
    const gain = this.buses[bus]?.gain
    const now = this.context?.currentTime ?? 0
    gain?.cancelScheduledValues(now)
    gain?.setTargetAtTime(normalized, now, 0.02)
  }

  setMuted(muted: boolean): void {
    this.settings = { ...this.settings, muted }
    this.master?.gain.setTargetAtTime(
      muted ? 0 : 0.82,
      this.context?.currentTime ?? 0,
      0.025,
    )
  }

  /**
   * 關閉操作用 transport、撤銷尚未發聲的 Boss call，並在同一首曲子內
   * 演出一個完整的 4/4 終曲。回傳的 endsAtPerformanceMs 是畫面進入結算
   * 前必須等待的界線，避免勝負判定看起來像被硬切掉。
   */
  playEncounterFinale(
    outcome: EncounterFinaleOutcome,
  ): EncounterFinaleSnapshot {
    const context = this.context
    const startsAtPerformanceMs = performance.now()
    const eighth = eighthSecondsForTier(this.tempoTier)
    const durationSeconds = eighth * 8 + 0.42
    const durationMs = Math.round(durationSeconds * 1000)

    this.finalizing = true
    this.stopTransport()

    if (context === null) {
      return {
        outcome,
        startsAtPerformanceMs,
        endsAtPerformanceMs: startsAtPerformanceMs + durationMs,
        durationMs,
      }
    }

    const at = context.currentTime + 0.025
    this.restoreMusicalBed(at)
    this.scheduleFinaleBar(outcome, at, eighth)
    return {
      outcome,
      startsAtPerformanceMs: this.contextTimeToPerformanceTime(at),
      endsAtPerformanceMs: this.contextTimeToPerformanceTime(at + durationSeconds),
      durationMs,
    }
  }

  /** 舊版四方向讀招相容層。 */
  playAttack(direction: Direction, breach: boolean, threat: number): void {
    this.setThreat(threat)
    this.scheduleBossCall({
      lane: directionToLane(direction, breach),
      heavy: breach,
    })
  }

  /** 舊版判定相容層；新 render 應改呼叫 playCounterHit 並傳入 lane。 */
  playResolution(grade: CounterGrade): void {
    if (grade === 'perfect' || grade === 'normal' || grade === 'miss') {
      this.playCounterHit({ lane: this.lastLane, grade })
    } else if (grade === 'phase') {
      this.playCounterHit({ lane: 'center', grade: 'perfect' })
    } else {
      this.playModuleResponse('downbeat-capacitor')
    }
  }

  playInterface(
    kind: 'start' | 'invalid' | 'open' | 'victory' | 'defeat',
  ): void {
    if (kind === 'start') {
      this.sequence([146.83, 220, 293.66], 0.07, 0.045)
    } else if (kind === 'invalid') {
      this.voice({
        bus: 'interface',
        frequency: 120,
        duration: 0.045,
        gain: 0.022,
        type: 'square',
      })
    } else if (kind === 'open') {
      this.sequence([440, 660], 0.045, 0.026)
    } else if (kind === 'victory') {
      this.sequence([261.63, 392, 523.25, 783.99], 0.14, 0.05)
    } else {
      this.sequence([220, 174.61, 110, 73.42], 0.16, 0.055)
    }
  }

  private createMixGraph(): void {
    const context = this.context
    if (context === null) return
    const master = context.createGain()
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 10
    limiter.attack.value = 0.003
    limiter.release.value = 0.16
    master.gain.value = this.settings.muted ? 0 : 0.86
    master.connect(limiter)
    limiter.connect(context.destination)
    this.master = master
    for (const bus of ['music', 'effects', 'interface'] as const) {
      const gain = context.createGain()
      gain.gain.value = this.settings[bus]
      gain.connect(master)
      this.buses[bus] = gain
    }
    const musicBus = this.buses.music
    if (musicBus === undefined) return
    for (const stem of ['rhythm', 'harmony', 'melody'] as const) {
      const gain = context.createGain()
      gain.gain.value = 1
      gain.connect(musicBus)
      this.stems[stem] = gain
    }
  }

  private scheduleTransport(): void {
    const context = this.context
    if (context === null) return
    while (this.nextSlotAt < context.currentTime + 0.14) {
      if (
        this.absoluteSlot > 0 &&
        isSectionBoundary(this.absoluteSlot) &&
        this.pendingTempoTier !== null
      ) {
        this.tempoTier = this.pendingTempoTier
        this.pendingTempoTier = null
      }
      const position = gridPosition(this.absoluteSlot)
      this.scheduleGridSlot(position, this.nextSlotAt)
      this.nextSlotAt += eighthSecondsForTier(this.tempoTier)
      this.absoluteSlot += 1
    }
  }

  private scheduleGridSlot(position: GridPosition, at: number): void {
    const layers = layersForTier(this.tempoTier)
    const eighth = eighthSecondsForTier(this.tempoTier)

    if (position.slot === 0 || position.slot === 4) {
      this.kick(at, position.slot === 0 ? 0.084 : 0.068)
    }
    if (layers.includes('反拍') && (position.slot === 2 || position.slot === 6)) {
      this.snare(at, position.slot === 6 ? 0.043 : 0.049)
    }
    if (
      layers.includes('八分刻度') ||
      position.slot === 0 ||
      position.slot === 2 ||
      position.slot === 4 ||
      position.slot === 6
    ) {
      this.hat(at, position.phase === 'response' ? 0.017 : 0.023)
    }
    if (position.slot === 3) {
      this.openHat(at, 0.03)
      this.pickup(at, 'center')
    }

    if (position.slot === 0) {
      const chord = harmony[position.bar % harmony.length] ?? harmony[0]
      const duration = eighth * 7.7
      chord.forEach((note, index) => {
        this.voice({
          bus: 'harmony',
          frequency: midiFrequency(note),
          duration,
          gain: 0.016,
          at,
          attack: Math.min(0.1, duration * 0.12),
          filterFrequency: 1250,
          pan: (index - 1) * 0.3,
          type: 'triangle',
        })
      })
    }

    if (
      layers.includes('低音推進') &&
      (position.slot === 0 || position.slot === 4)
    ) {
      const note = bass[position.bar % bass.length] ?? bass[0]
      this.voice({
        bus: 'harmony',
        frequency: midiFrequency(note),
        duration: eighth * 1.35,
        gain: 0.034,
        at,
        attack: 0.012,
        filterFrequency: 480,
        type: 'sawtooth',
      })
    }

    if (position.phase === 'call' && (position.slot === 0 || position.slot === 2)) {
      const phrase = callMelody[position.bar % callMelody.length] ?? callMelody[0]
      const note = phrase[position.slot === 0 ? 0 : 1] ?? phrase[0]
      this.voice({
        bus: 'melody',
        frequency: midiFrequency(note),
        duration: eighth * 0.62,
        gain: this.tempoTier === 0 ? 0.019 : 0.024,
        at,
        attack: 0.008,
        filterFrequency: 2300,
        pan: position.slot === 0 ? -0.16 : 0.16,
        type: 'triangle',
      })
    }

    if (
      layers.includes('高壓裝飾') &&
      position.phase === 'call'
    ) {
      this.hat(at + eighth / 2, 0.015, position.slot % 2 === 0 ? -0.2 : 0.2)
    }
  }

  /** 終曲只用既有原創合成聲部，避免將節奏提示誤當成下一組操作目標。 */
  private scheduleFinaleBar(
    outcome: EncounterFinaleOutcome,
    at: number,
    eighth: number,
  ): void {
    const victory = outcome === 'victory'
    const root = victory ? 65.41 : 55
    const chord = victory
      ? [root, root * 1.5, root * 2, root * 2.5]
      : [root, root * 1.1892, root * 1.4983]

    for (let slot = 0; slot < 8; slot += 1) {
      const slotAt = at + slot * eighth
      if (slot === 0 || slot === 4 || (victory && slot === 7)) {
        this.kick(slotAt, victory ? 0.108 : 0.084)
      }
      if (slot === 2 || slot === 6) {
        this.snare(slotAt, victory ? 0.074 : 0.058)
      }
      if (slot !== 7 || victory) {
        this.hat(slotAt, victory ? 0.032 : 0.022, slot % 2 === 0 ? -0.18 : 0.18)
      }
      if (slot === 0 || slot === 4 || slot === 6) {
        this.voice({
          bus: 'harmony',
          frequency: root / (slot === 6 ? 1 : 2),
          endFrequency: root / 2,
          duration: eighth * (slot === 6 ? 1.6 : 1.25),
          gain: victory ? 0.052 : 0.038,
          at: slotAt,
          attack: 0.004,
          filterFrequency: 720,
          type: 'sawtooth',
        })
      }
    }

    const chordAt = at + eighth * (victory ? 6 : 5)
    this.chord(
      chord,
      eighth * (victory ? 3.5 : 2.7),
      victory ? 0.095 : 0.068,
      'harmony',
      victory ? 'sawtooth' : 'triangle',
      chordAt,
    )
    this.noise({
      bus: 'effects',
      duration: victory ? 0.34 : 0.24,
      gain: victory ? 0.075 : 0.048,
      at: chordAt,
      filterFrequency: victory ? 3600 : 1200,
      filterType: victory ? 'highpass' : 'bandpass',
    })
    this.voice({
      bus: 'effects',
      frequency: victory ? root * 8 : root * 2,
      endFrequency: victory ? root * 10 : root * 0.75,
      duration: victory ? 0.38 : 0.32,
      gain: victory ? 0.048 : 0.042,
      at: chordAt,
      attack: 0.006,
      type: victory ? 'triangle' : 'sine',
    })
  }

  private playLaneCue(
    lane: AudioLane,
    at: number,
    heavy: boolean,
    role: 'boss' | 'player',
  ): void {
    const base = laneFrequency(lane)
    const pan = lanePan(lane)
    if (lane === 'center') {
      this.kick(at, heavy ? 0.09 : 0.07, 'effects')
      this.chord(
        [base, base * 1.5],
        heavy ? 0.24 : 0.16,
        heavy ? 0.07 : 0.052,
        'effects',
        'sawtooth',
        at,
      )
      this.noise({
        bus: 'effects',
        duration: heavy ? 0.18 : 0.11,
        gain: heavy ? 0.045 : 0.032,
        at,
        filterFrequency: 1700,
        filterType: 'bandpass',
      })
      return
    }
    this.voice({
      bus: 'effects',
      frequency: base * (role === 'boss' ? 1 : 1.18),
      endFrequency: base * 0.58,
      duration: heavy ? 0.18 : 0.12,
      gain: heavy ? 0.066 : 0.052,
      at,
      pan,
      type: lane === 'left' ? 'sine' : 'triangle',
    })
    this.noise({
      bus: 'effects',
      duration: lane === 'left' ? 0.065 : 0.035,
      gain: role === 'boss' ? 0.026 : 0.034,
      at,
      filterFrequency: lane === 'left' ? 900 : 3100,
      filterType: 'bandpass',
      pan,
    })
  }

  private pickup(at: number, lane: AudioLane, high = false): void {
    this.noise({
      bus: 'effects',
      duration: high ? 0.025 : 0.04,
      gain: high ? 0.018 : 0.023,
      at,
      filterFrequency: high ? 5200 : 3400,
      filterType: 'highpass',
      pan: lanePan(lane) * 0.45,
    })
  }

  private kick(
    at: number,
    gain: number,
    bus: AudioTarget = 'rhythm',
  ): void {
    this.voice({
      bus,
      frequency: 132,
      endFrequency: 46,
      duration: 0.115,
      gain,
      at,
      attack: 0.002,
      filterFrequency: 800,
      type: 'sine',
    })
  }

  private snare(at: number, gain: number): void {
    this.noise({
      bus: 'rhythm',
      duration: 0.085,
      gain,
      at,
      filterFrequency: 1800,
      filterType: 'highpass',
    })
    this.voice({
      bus: 'rhythm',
      frequency: 190,
      endFrequency: 130,
      duration: 0.07,
      gain: gain * 0.52,
      at,
      type: 'triangle',
    })
  }

  private rim(at: number, gain: number, pan: number): void {
    this.voice({
      bus: 'effects',
      frequency: 720,
      endFrequency: 430,
      duration: 0.035,
      gain,
      at,
      pan,
      type: 'triangle',
    })
    this.noise({
      bus: 'effects',
      duration: 0.02,
      gain: gain * 0.55,
      at,
      filterFrequency: 4200,
      filterType: 'highpass',
      pan,
    })
  }

  private hat(at: number, gain: number, pan = 0): void {
    this.noise({
      bus: 'rhythm',
      duration: 0.026,
      gain,
      at,
      filterFrequency: 5200,
      filterType: 'highpass',
      pan,
    })
  }

  private openHat(at: number, gain: number): void {
    this.noise({
      bus: 'rhythm',
      duration: 0.105,
      gain,
      at,
      filterFrequency: 4300,
      filterType: 'highpass',
      pan: 0.12,
    })
  }

  private mutedThud(at: number, lane: AudioLane): void {
    this.voice({
      bus: 'effects',
      frequency: 94,
      endFrequency: 70,
      duration: 0.11,
      gain: 0.047,
      at,
      pan: lanePan(lane) * 0.25,
      filterFrequency: 420,
      type: 'triangle',
    })
  }

  private sequence(
    frequencies: readonly number[],
    spacing: number,
    gain: number,
  ): void {
    const now = this.context?.currentTime
    if (now === undefined) return
    frequencies.forEach((frequency, index) => {
      this.voice({
        bus: 'interface',
        frequency,
        duration: spacing * 1.4,
        gain,
        at: now + index * spacing,
        type: 'triangle',
      })
    })
  }

  private chord(
    frequencies: readonly number[],
    duration: number,
    gain: number,
    bus: AudioTarget,
    type: OscillatorType,
    at?: number,
  ): void {
    frequencies.forEach((frequency, index) => {
      this.voice({
        bus,
        frequency,
        duration,
        gain: gain / Math.max(1, frequencies.length * 0.72),
        pan: (index - (frequencies.length - 1) / 2) * 0.24,
        type,
        ...(at === undefined ? {} : { at }),
      })
    })
  }

  private duckMusicalBed(
    decibels: number,
    at: number,
    duration: number,
  ): void {
    const amount = decibelsToGain(-Math.abs(decibels))
    for (const stem of ['harmony', 'melody'] as const) {
      const gain = this.stems[stem]?.gain
      if (gain === undefined) continue
      gain.cancelScheduledValues(at)
      gain.setTargetAtTime(amount, at, 0.005)
      gain.setTargetAtTime(1, at + duration, 0.04)
    }
  }

  private restoreMusicalBed(at: number): void {
    for (const stem of ['harmony', 'melody'] as const) {
      const gain = this.stems[stem]?.gain
      if (gain === undefined) continue
      gain.cancelScheduledValues(at)
      gain.setTargetAtTime(1, at, 0.008)
    }
  }

  private resolveContextTime(performanceMs?: number): number {
    const context = this.context
    if (context === null) return 0
    if (performanceMs === undefined) return context.currentTime
    return Math.max(
      context.currentTime + 0.002,
      this.performanceTimeToContextTime(performanceMs),
    )
  }

  private outputTimestamp(): {
    contextTime: number
    performanceTime: number
  } {
    const context = this.context
    if (context === null) {
      return { contextTime: 0, performanceTime: performance.now() }
    }
    try {
      const timestamp = context.getOutputTimestamp()
      const contextTime = timestamp.contextTime
      const performanceTime = timestamp.performanceTime
      if (
        contextTime !== undefined &&
        performanceTime !== undefined &&
        contextTime > 0 &&
        performanceTime > 0
      ) {
        return { contextTime, performanceTime }
      }
    } catch {
      // Safari 舊版可能宣告 API 但呼叫失敗，改用同一瞬間取樣。
    }
    return {
      contextTime: context.currentTime,
      performanceTime: performance.now(),
    }
  }

  private createNoiseBuffer(): AudioBuffer | null {
    const context = this.context
    if (context === null) return null
    const length = Math.ceil(context.sampleRate * 0.5)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    let state = 0x13579b
    for (let index = 0; index < length; index += 1) {
      state = (state * 48271) % 0x7fffffff
      data[index] = (state / 0x7fffffff) * 2 - 1
    }
    return buffer
  }

  private noise(options: NoiseOptions): void {
    const context = this.context
    const bus = this.resolveBus(options.bus)
    const buffer = this.noiseBuffer
    if (context === null || bus === undefined || buffer === null) return
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    const panner = context.createStereoPanner()
    source.buffer = buffer
    filter.type = options.filterType
    filter.frequency.value = options.filterFrequency
    filter.Q.value = options.filterType === 'bandpass' ? 1.4 : 0.7
    envelope.gain.setValueAtTime(Math.max(0.0001, options.gain), options.at)
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      options.at + options.duration,
    )
    panner.pan.value = options.pan ?? 0
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(panner)
    panner.connect(bus)
    source.start(options.at)
    source.stop(options.at + options.duration + 0.01)
  }

  private resolveBus(target: AudioTarget): GainNode | undefined {
    if (target === 'rhythm' || target === 'harmony' || target === 'melody') {
      return this.stems[target]
    }
    return this.buses[target]
  }

  private voice(options: VoiceOptions): void {
    const context = this.context
    const bus = this.resolveBus(options.bus)
    if (context === null || bus === undefined) return
    const at = options.at ?? context.currentTime
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const panner = context.createStereoPanner()
    const filter = context.createBiquadFilter()
    oscillator.type = options.type ?? 'triangle'
    oscillator.frequency.setValueAtTime(Math.max(20, options.frequency), at)
    if (options.endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.endFrequency),
        at + options.duration,
      )
    }
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, options.gain),
      at + Math.max(0.001, options.attack ?? 0.006),
    )
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + options.duration)
    panner.pan.value = options.pan ?? 0
    filter.type = 'lowpass'
    filter.frequency.value = options.filterFrequency ?? 18_000
    filter.Q.value = 0.7
    oscillator.connect(filter)
    filter.connect(envelope)
    envelope.connect(panner)
    panner.connect(bus)
    oscillator.start(at)
    oscillator.stop(at + options.duration + 0.02)
  }
}

export const audioDirector = new CounterOverdriveAudio()
