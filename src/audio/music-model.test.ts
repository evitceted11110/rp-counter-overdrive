import { describe, expect, it } from 'vitest'
import {
  directionFrequency,
  directionPan,
  layersForThreat,
  normalizeThreat,
  tempoForThreat,
} from './music-model.js'

describe('動態音樂模型', () => {
  it('依威脅階級從 96 BPM 升至 166 BPM', () => {
    expect(Array.from({ length: 6 }, (_, threat) => tempoForThreat(threat))).toEqual([
      96, 110, 124, 138, 152, 166,
    ])
  })

  it('威脅愈高只會增加聲部，不會抽換既有資訊', () => {
    for (let threat = 1; threat <= 5; threat += 1) {
      expect(layersForThreat(threat).slice(0, -1)).toEqual(
        layersForThreat(threat - 1),
      )
    }
  })

  it('將超出範圍的威脅安全限制在 0 至 5', () => {
    expect(normalizeThreat(-4)).toBe(0)
    expect(normalizeThreat(8)).toBe(5)
  })

  it('左右聲像與上下音色可明確區分', () => {
    expect(directionPan('left')).toBeLessThan(0)
    expect(directionPan('right')).toBeGreaterThan(0)
    expect(directionFrequency('up')).not.toBe(directionFrequency('down'))
  })
})

