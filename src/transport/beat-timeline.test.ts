import { describe, expect, it } from 'vitest'
import { BeatTimeline } from './beat-timeline.js'

describe('純邏輯 BeatTimeline', () => {
  it('在 beat 與毫秒之間可逆換算', () => {
    const timeline = new BeatTimeline({ bpm: 120, startTimeMs: 1000 })
    expect(timeline.timeAtBeat(4)).toBe(3000)
    expect(timeline.beatAtTime(3000)).toBe(4)
    expect(timeline.timingOffsetMs(4, 3040)).toBe(40)
  })

  it('Tempo 只在下一個小節邊界切換', () => {
    const initial = new BeatTimeline({
      bpm: 120,
      beatsPerBar: 4,
      startTimeMs: 0,
    })
    const changed = initial.withTempoChange(60, 1.25)
    expect(changed.segments).toEqual([
      { startBeat: 0, startTimeMs: 0, bpm: 120 },
      { startBeat: 4, startTimeMs: 2000, bpm: 60 },
    ])
    expect(changed.timeAtBeat(5)).toBe(3000)
    expect(changed.beatAtTime(3000)).toBe(5)
  })

  it('暫停恢復可平移時間而不改變任何 beat', () => {
    const timeline = new BeatTimeline({ bpm: 100, startTimeMs: 200 })
    const resumed = timeline.shiftTime(2500)
    expect(resumed.timeAtBeat(0)).toBe(2700)
    expect(resumed.timeAtBeat(8) - timeline.timeAtBeat(8)).toBe(2500)
  })

  it('拒絕無效 BPM、拍號與時間', () => {
    expect(() => new BeatTimeline({ bpm: 0 })).toThrow('BPM 必須大於 0')
    expect(() => new BeatTimeline({ bpm: 120, beatsPerBar: 0 })).toThrow(
      '每小節拍數必須為正整數',
    )
    expect(() => new BeatTimeline({ bpm: 120, startTimeMs: Number.NaN })).toThrow(
      '起始時間必須是有限數值',
    )
  })
})
