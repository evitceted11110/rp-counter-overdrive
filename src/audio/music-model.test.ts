import { describe, expect, it } from 'vitest'
import {
  EIGHTH_SLOTS_PER_BAR,
  directionToLane,
  eighthMillisecondsForTier,
  gridPosition,
  isSectionBoundary,
  laneFrequency,
  lanePan,
  layersForTier,
  normalizeTempoTier,
  normalizeThreat,
  tempoForThreat,
  tempoForTier,
  tierForThreat,
} from './music-model.js'

describe('0.3.0 共享節拍模型', () => {
  it('只使用 120、132、144 BPM 三段速度', () => {
    expect([0, 1, 2].map(tempoForTier)).toEqual([120, 132, 144])
    expect(Array.from({ length: 6 }, (_, threat) => tempoForThreat(threat))).toEqual(
      [120, 120, 132, 132, 144, 144],
    )
  })

  it('每拍格固定為八分音符', () => {
    expect(eighthMillisecondsForTier(0)).toBe(250)
    expect(eighthMillisecondsForTier(1)).toBeCloseTo(227.27, 2)
    expect(eighthMillisecondsForTier(2)).toBeCloseTo(208.33, 2)
  })

  it('將每小節切成呼叫、pickup 與完整四格回擊', () => {
    expect(Array.from({ length: EIGHTH_SLOTS_PER_BAR }, (_, slot) =>
      gridPosition(slot).phase,
    )).toEqual([
      'call',
      'call',
      'call',
      'pickup',
      'response',
      'response',
      'response',
      'response',
    ])
    expect(gridPosition(8).bar).toBe(1)
  })

  it('只在八小節 section 邊界允許換速', () => {
    expect(isSectionBoundary(0)).toBe(true)
    expect(isSectionBoundary(63)).toBe(false)
    expect(isSectionBoundary(64)).toBe(true)
  })

  it('速度層只會增加，不抽掉節拍骨架', () => {
    for (let tier = 1; tier <= 2; tier += 1) {
      expect(layersForTier(tier).slice(0, layersForTier(tier - 1).length)).toEqual(
        layersForTier(tier - 1),
      )
    }
    expect(layersForTier(2)).toContain('節拍骨架')
  })

  it('左右與中央同時以聲像和音色區分', () => {
    expect(lanePan('left')).toBeLessThan(0)
    expect(lanePan('right')).toBeGreaterThan(0)
    expect(lanePan('center')).toBe(0)
    expect(
      new Set((['left', 'right', 'center'] as const).map(laneFrequency)).size,
    ).toBe(3)
    expect(directionToLane('up')).toBe('center')
    expect(directionToLane('left')).toBe('left')
  })

  it('安全限制威脅與速度階級', () => {
    expect(normalizeThreat(-4)).toBe(0)
    expect(normalizeThreat(8)).toBe(5)
    expect(normalizeTempoTier(-2)).toBe(0)
    expect(normalizeTempoTier(9)).toBe(2)
    expect(tierForThreat(5)).toBe(2)
  })
})
