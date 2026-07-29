import { describe, expect, it } from 'vitest'
import { BeatTimeline } from './beat-timeline.js'
import { RhythmTransport } from './rhythm-transport.js'

describe('共享 RhythmTransport 介面', () => {
  it('audio 與 render 可從同一 clock 取得拍位及判定偏移', () => {
    let nowMs = 1250
    const transport = new RhythmTransport(
      new BeatTimeline({ bpm: 120, startTimeMs: 0 }),
      { nowMs: () => nowMs },
    )
    expect(transport.position).toEqual({
      beat: 2.5,
      bar: 0,
      beatInBar: 2.5,
    })
    expect(transport.targetTimeMs(3)).toBe(1500)
    expect(transport.timingOffsetMs(2)).toBe(250)

    nowMs = 2000
    expect(transport.position.bar).toBe(1)
  })

  it('換速與暫停恢復會更新共享 timeline', () => {
    let nowMs = 750
    const transport = new RhythmTransport(
      new BeatTimeline({ bpm: 120, startTimeMs: 0 }),
      { nowMs: () => nowMs },
    )
    transport.scheduleTempoChange(90)
    expect(transport.timeline.segments[1]?.startBeat).toBe(4)

    const beforePause = transport.position.beat
    transport.shiftAfterPause(2000)
    nowMs += 2000
    expect(transport.position.beat).toBe(beforePause)
  })
})
