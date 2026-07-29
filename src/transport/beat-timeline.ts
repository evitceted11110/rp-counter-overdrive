export type BeatTimelineOptions = {
  bpm: number
  beatsPerBar?: number
  startTimeMs?: number
}

export type TempoSegment = {
  startBeat: number
  startTimeMs: number
  bpm: number
}

function assertPositiveFinite(value: number, message: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message)
}

function millisecondsPerBeat(bpm: number): number {
  return 60_000 / bpm
}

export class BeatTimeline {
  readonly beatsPerBar: number
  readonly segments: readonly TempoSegment[]

  constructor(options: BeatTimelineOptions, segments?: readonly TempoSegment[]) {
    assertPositiveFinite(options.bpm, 'BPM 必須大於 0')
    const beatsPerBar = options.beatsPerBar ?? 4
    if (!Number.isInteger(beatsPerBar) || beatsPerBar <= 0) {
      throw new Error('每小節拍數必須為正整數')
    }
    const startTimeMs = options.startTimeMs ?? 0
    if (!Number.isFinite(startTimeMs)) {
      throw new Error('起始時間必須是有限數值')
    }
    this.beatsPerBar = beatsPerBar
    this.segments =
      segments?.map((segment) => ({ ...segment })) ??
      [{ startBeat: 0, startTimeMs, bpm: options.bpm }]
  }

  timeAtBeat(beat: number): number {
    if (!Number.isFinite(beat)) throw new Error('beat 必須是有限數值')
    const segment = this.segmentForBeat(beat)
    return (
      segment.startTimeMs +
      (beat - segment.startBeat) * millisecondsPerBeat(segment.bpm)
    )
  }

  beatAtTime(timeMs: number): number {
    if (!Number.isFinite(timeMs)) throw new Error('時間必須是有限數值')
    const segment = this.segmentForTime(timeMs)
    return (
      segment.startBeat +
      (timeMs - segment.startTimeMs) / millisecondsPerBeat(segment.bpm)
    )
  }

  timingOffsetMs(targetBeat: number, inputTimeMs: number): number {
    return inputTimeMs - this.timeAtBeat(targetBeat)
  }

  withTempoChange(bpm: number, requestedAtBeat: number): BeatTimeline {
    assertPositiveFinite(bpm, 'BPM 必須大於 0')
    if (!Number.isFinite(requestedAtBeat) || requestedAtBeat < 0) {
      throw new Error('要求換速的 beat 必須是非負有限數值')
    }
    const changeBeat =
      Math.ceil(requestedAtBeat / this.beatsPerBar) * this.beatsPerBar
    const changeTimeMs = this.timeAtBeat(changeBeat)
    const retained = this.segments.filter(
      (segment) => segment.startBeat < changeBeat,
    )
    const nextSegments = [
      ...retained,
      { startBeat: changeBeat, startTimeMs: changeTimeMs, bpm },
    ]
    return new BeatTimeline(
      {
        bpm: nextSegments[0]?.bpm ?? bpm,
        beatsPerBar: this.beatsPerBar,
        startTimeMs: nextSegments[0]?.startTimeMs ?? changeTimeMs,
      },
      nextSegments,
    )
  }

  shiftTime(deltaMs: number): BeatTimeline {
    if (!Number.isFinite(deltaMs)) throw new Error('平移時間必須是有限數值')
    const shifted = this.segments.map((segment) => ({
      ...segment,
      startTimeMs: segment.startTimeMs + deltaMs,
    }))
    const first = shifted[0]
    if (first === undefined) throw new Error('節拍時間線不得為空')
    return new BeatTimeline(
      {
        bpm: first.bpm,
        beatsPerBar: this.beatsPerBar,
        startTimeMs: first.startTimeMs,
      },
      shifted,
    )
  }

  private segmentForBeat(beat: number): TempoSegment {
    let selected = this.segments[0]
    if (selected === undefined) throw new Error('節拍時間線不得為空')
    for (const segment of this.segments) {
      if (segment.startBeat > beat) break
      selected = segment
    }
    return selected
  }

  private segmentForTime(timeMs: number): TempoSegment {
    let selected = this.segments[0]
    if (selected === undefined) throw new Error('節拍時間線不得為空')
    for (const segment of this.segments) {
      if (segment.startTimeMs > timeMs) break
      selected = segment
    }
    return selected
  }
}
