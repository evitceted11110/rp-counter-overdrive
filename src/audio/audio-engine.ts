import type { CounterGrade, Direction } from '../core/index.js'
import {
  directionFrequency,
  directionPan,
  layersForThreat,
  normalizeThreat,
  tempoForThreat,
} from './music-model.js'

export type AudioBus = 'music' | 'effects' | 'interface'

export type AudioSettings = {
  muted: boolean
  music: number
  effects: number
  interface: number
}

type VoiceOptions = {
  bus: AudioBus
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

const defaultSettings: AudioSettings = {
  muted: false,
  music: 0.52,
  effects: 0.78,
  interface: 0.58,
}

function midiFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

export class CounterOverdriveAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Partial<Record<AudioBus, GainNode>> = {}
  private settings: AudioSettings = { ...defaultSettings }
  private schedulerId: number | null = null
  private nextStepAt = 0
  private step = 0
  private bar = 0
  private threat = 0

  get tempo(): number {
    return tempoForThreat(this.threat)
  }

  get currentSettings(): Readonly<AudioSettings> {
    return this.settings
  }

  async unlock(): Promise<void> {
    if (this.context === null) {
      this.context = new AudioContext()
      this.createMixGraph()
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  startMusic(): void {
    const context = this.context
    if (context === null || this.schedulerId !== null) return
    this.step = 0
    this.bar = 0
    this.nextStepAt = context.currentTime + 0.04
    this.schedulerId = window.setInterval(() => this.scheduleMusic(), 25)
    this.scheduleMusic()
  }

  stopMusic(): void {
    if (this.schedulerId === null) return
    window.clearInterval(this.schedulerId)
    this.schedulerId = null
  }

  setThreat(threat: number): void {
    this.threat = normalizeThreat(threat)
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

  playAttack(direction: Direction, breach: boolean, threat: number): void {
    this.duckMusic(0.72, breach ? 0.3 : 0.14)
    if (breach) {
      this.chord([116, 174], 0.18, 0.055, 'effects', 'sawtooth')
      this.voice({
        bus: 'effects',
        frequency: 310,
        endFrequency: 92,
        duration: 0.3,
        gain: 0.05,
        type: 'square',
      })
      return
    }
    const base = directionFrequency(direction)
    const speedAccent = normalizeThreat(threat) * 18
    this.voice({
      bus: 'effects',
      frequency: base + speedAccent,
      endFrequency: base * 0.72,
      duration: 0.095,
      gain: 0.042,
      pan: directionPan(direction),
      type: direction === 'up' || direction === 'down' ? 'triangle' : 'square',
    })
  }

  playResolution(grade: CounterGrade): void {
    this.duckMusic(grade === 'perfect' ? 0.58 : 0.7, 0.24)
    if (grade === 'perfect') {
      this.chord([523.25, 659.25, 783.99], 0.19, 0.062, 'effects', 'triangle')
      this.delayedVoice(0.09, {
        bus: 'effects',
        frequency: 1046.5,
        duration: 0.11,
        gain: 0.04,
        type: 'sine',
      })
    } else if (grade === 'normal') {
      this.voice({
        bus: 'effects',
        frequency: 420,
        endFrequency: 610,
        duration: 0.13,
        gain: 0.05,
        type: 'triangle',
      })
    } else if (grade === 'phase') {
      this.voice({
        bus: 'effects',
        frequency: 180,
        endFrequency: 1180,
        duration: 0.28,
        gain: 0.045,
        pan: -0.42,
        type: 'sine',
      })
      this.delayedVoice(0.04, {
        bus: 'effects',
        frequency: 1180,
        endFrequency: 240,
        duration: 0.24,
        gain: 0.035,
        pan: 0.42,
        type: 'triangle',
      })
    } else if (grade === 'core') {
      this.chord([73.42, 110, 146.83], 0.46, 0.075, 'effects', 'sawtooth')
      this.delayedVoice(0.16, {
        bus: 'effects',
        frequency: 440,
        endFrequency: 110,
        duration: 0.34,
        gain: 0.05,
        type: 'triangle',
      })
    } else {
      this.chord([92.5, 98], 0.34, 0.075, 'effects', 'sawtooth')
    }
  }

  playInterface(kind: 'start' | 'invalid' | 'open' | 'victory' | 'defeat'): void {
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
    limiter.threshold.value = -12
    limiter.knee.value = 8
    limiter.ratio.value = 8
    limiter.attack.value = 0.003
    limiter.release.value = 0.18
    master.gain.value = this.settings.muted ? 0 : 0.82
    master.connect(limiter)
    limiter.connect(context.destination)
    this.master = master
    for (const bus of ['music', 'effects', 'interface'] as const) {
      const gain = context.createGain()
      gain.gain.value = this.settings[bus]
      gain.connect(master)
      this.buses[bus] = gain
    }
  }

  private scheduleMusic(): void {
    const context = this.context
    if (context === null) return
    while (this.nextStepAt < context.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextStepAt)
      this.nextStepAt += 60 / this.tempo / 4
      this.step += 1
      if (this.step >= 16) {
        this.step = 0
        this.bar = (this.bar + 1) % 4
      }
    }
  }

  private scheduleStep(step: number, at: number): void {
    const layers = layersForThreat(this.threat)
    this.scheduleBackgroundMusic(step, at)
    if (layers.includes('低頻脈衝') && step % 8 === 0) {
      this.voice({
        bus: 'music',
        frequency: step === 0 ? 55 : 65.41,
        endFrequency: 42,
        duration: 0.32,
        gain: 0.052,
        at,
        type: 'sine',
      })
    }
    if (layers.includes('主拍') && step % 4 === 0) {
      this.voice({
        bus: 'music',
        frequency: 118,
        endFrequency: 48,
        duration: 0.105,
        gain: step === 0 ? 0.07 : 0.052,
        at,
        type: 'sine',
      })
    }
    if (layers.includes('切分脈衝') && step % 2 === 1) {
      this.voice({
        bus: 'music',
        frequency: 1760,
        endFrequency: 1320,
        duration: 0.025,
        gain: 0.012,
        at,
        pan: step % 4 === 1 ? -0.34 : 0.34,
        type: 'square',
      })
    }
    if (layers.includes('低音序列') && step % 4 === 2) {
      const notes = [38, 38, 41, 34]
      this.voice({
        bus: 'music',
        frequency: midiFrequency(notes[Math.floor(step / 4)] ?? 38),
        duration: 0.16,
        gain: 0.032,
        at,
        type: 'sawtooth',
      })
    }
    if (layers.includes('高頻琶音') && step % 2 === 0) {
      const notes = [62, 65, 69, 70, 69, 65, 62, 58]
      this.voice({
        bus: 'music',
        frequency: midiFrequency(notes[step / 2] ?? 62),
        duration: 0.075,
        gain: 0.018,
        at,
        pan: step < 8 ? -0.24 : 0.24,
        type: 'triangle',
      })
    }
    if (layers.includes('超載節拍') && (step === 3 || step === 7 || step === 10 || step === 15)) {
      this.voice({
        bus: 'music',
        frequency: 880,
        endFrequency: 1760,
        duration: 0.04,
        gain: 0.018,
        at,
        type: 'square',
      })
    }
  }

  private scheduleBackgroundMusic(step: number, at: number): void {
    const harmony = [
      [50, 53, 57],
      [46, 50, 53],
      [41, 48, 53],
      [48, 52, 55],
    ] as const
    const bass = [38, 34, 41, 36] as const
    const melody = [
      [69, 72, 74, 69],
      [65, 69, 70, 69],
      [69, 72, 77, 76],
      [67, 72, 76, 72],
    ] as const
    if (step === 0) {
      const chord = harmony[this.bar] ?? harmony[0]
      const barDuration = (60 / this.tempo) * 3.86
      chord.forEach((note, index) => {
        this.voice({
          bus: 'music',
          frequency: midiFrequency(note),
          duration: barDuration,
          gain: 0.014,
          at,
          attack: Math.min(0.12, barDuration * 0.15),
          filterFrequency: 1350,
          pan: (index - 1) * 0.34,
          type: 'triangle',
        })
      })
    }
    if (step === 0 || step === 8) {
      this.voice({
        bus: 'music',
        frequency: midiFrequency(bass[this.bar] ?? bass[0]),
        duration: (60 / this.tempo) * 0.72,
        gain: 0.028,
        at,
        attack: 0.018,
        filterFrequency: 520,
        type: 'sawtooth',
      })
    }
    if (step === 2 || step === 6 || step === 10 || step === 14) {
      const phrase = melody[this.bar] ?? melody[0]
      const note = phrase[Math.floor(step / 4)] ?? phrase[0]
      this.voice({
        bus: 'music',
        frequency: midiFrequency(note),
        duration: (60 / this.tempo) * 0.28,
        gain: this.threat >= 3 ? 0.018 : 0.013,
        at,
        attack: 0.012,
        filterFrequency: 2400,
        pan: step < 8 ? -0.18 : 0.18,
        type: 'triangle',
      })
    }
  }

  private sequence(frequencies: readonly number[], spacing: number, gain: number): void {
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
    bus: AudioBus,
    type: OscillatorType,
  ): void {
    frequencies.forEach((frequency, index) => {
      this.voice({
        bus,
        frequency,
        duration,
        gain: gain / Math.max(1, frequencies.length * 0.72),
        pan: (index - (frequencies.length - 1) / 2) * 0.24,
        type,
      })
    })
  }

  private delayedVoice(delay: number, options: VoiceOptions): void {
    const now = this.context?.currentTime
    if (now === undefined) return
    this.voice({ ...options, at: now + delay })
  }

  private duckMusic(depth: number, duration: number): void {
    const context = this.context
    const music = this.buses.music
    if (context === null || music === undefined) return
    const now = context.currentTime
    music.gain.cancelScheduledValues(now)
    music.gain.setTargetAtTime(this.settings.music * depth, now, 0.008)
    music.gain.setTargetAtTime(this.settings.music, now + duration, 0.045)
  }

  private voice(options: VoiceOptions): void {
    const context = this.context
    const bus = this.buses[options.bus]
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
      at + (options.attack ?? 0.006),
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
