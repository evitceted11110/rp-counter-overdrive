import { BeatTimeline } from './beat-timeline.js'

export type RhythmClock = {
  nowMs: () => number
}

export type RhythmPosition = {
  beat: number
  bar: number
  beatInBar: number
}

export interface SharedRhythmTransport {
  readonly timeline: BeatTimeline
  readonly position: RhythmPosition
  targetTimeMs: (beat: number) => number
  timingOffsetMs: (targetBeat: number) => number
}

export class RhythmTransport implements SharedRhythmTransport {
  private currentTimeline: BeatTimeline
  private readonly clock: RhythmClock

  constructor(timeline: BeatTimeline, clock: RhythmClock) {
    this.currentTimeline = timeline
    this.clock = clock
  }

  get timeline(): BeatTimeline {
    return this.currentTimeline
  }

  get position(): RhythmPosition {
    const beat = this.currentTimeline.beatAtTime(this.clock.nowMs())
    const bar = Math.floor(beat / this.currentTimeline.beatsPerBar)
    return {
      beat,
      bar,
      beatInBar: beat - bar * this.currentTimeline.beatsPerBar,
    }
  }

  targetTimeMs(beat: number): number {
    return this.currentTimeline.timeAtBeat(beat)
  }

  timingOffsetMs(targetBeat: number): number {
    return this.currentTimeline.timingOffsetMs(
      targetBeat,
      this.clock.nowMs(),
    )
  }

  scheduleTempoChange(bpm: number): void {
    this.currentTimeline = this.currentTimeline.withTempoChange(
      bpm,
      this.position.beat,
    )
  }

  shiftAfterPause(pausedDurationMs: number): void {
    if (!Number.isFinite(pausedDurationMs) || pausedDurationMs < 0) {
      throw new Error('暫停時間必須是非負有限數值')
    }
    this.currentTimeline = this.currentTimeline.shiftTime(pausedDurationMs)
  }
}
