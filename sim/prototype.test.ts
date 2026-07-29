import { describe, expect, it } from 'vitest'
import {
  generateRunPlan,
  runPrototype,
  runSeedWithCore,
  validateContent,
  type CoreId,
} from './prototype.js'

describe('反擊超載 0.3.0 Gate 2 原型', () => {
  it('內容只有合法三軌 phrase，且符合逐戰生成邊界', () => {
    expect(validateContent()).toEqual([])
  })

  it('同 seed 與核心產生完全相同的 Run 與摘要', () => {
    expect(generateRunPlan('same-plan', 'cross-resonance')).toEqual(
      generateRunPlan('same-plan', 'cross-resonance'),
    )
    expect(runPrototype(500, 'same-seed')).toEqual(
      runPrototype(500, 'same-seed'),
    )
  })

  it('三個核心在相同 seed 產生不同的節奏決策', () => {
    const coreIds: CoreId[] = [
      'cross-resonance',
      'downbeat-capacitor',
      'steady-flywheel',
    ]
    const results = coreIds.map((coreId) =>
      runSeedWithCore('decision-probe', coreId),
    )
    expect(new Set(results.map((result) => result.decisionSignature)).size).toBe(
      3,
    )
    expect(
      results.find((result) => result.core === 'cross-resonance')
        ?.decisionCounts.alternatingPursuits,
    ).toBeGreaterThan(0)
    expect(
      results.find((result) => result.core === 'downbeat-capacitor')
        ?.decisionCounts.convertedRestCenters,
    ).toBeGreaterThan(0)
    expect(
      results.find((result) => result.core === 'steady-flywheel')
        ?.decisionCounts.flywheelPressureAccepted,
    ).toBeGreaterThan(0)
  })

  it('能完成多局模擬並回報三核心、兩路線與六被動', () => {
    const summary = runPrototype(1_000)
    expect(summary.runs).toBe(1_000)
    expect(Object.keys(summary.coreWinRate)).toHaveLength(3)
    expect(Object.keys(summary.winningPassiveInclusionRate)).toHaveLength(6)
    expect(summary.legalPatternViolations).toEqual([])
    expect(summary.differentDecisionPairs).toBeGreaterThanOrEqual(2)
    expect(summary.winRate).toBeGreaterThanOrEqual(0)
    expect(summary.winRate).toBeLessThanOrEqual(1)
  })

  it('中型樣本維持固定譜面分數門檻下的數值結構', () => {
    const summary = runPrototype(5_000, 'gate-structure')
    const rates = Object.values(summary.coreWinRate)
    // 固定音符數壓進少 30% 的小節後，這個舊 Gate 2 行為模型會把
    // 同樣的失誤集中在較短的前段；此處守住重新基線後的穩定區間。
    expect(summary.winRate).toBeGreaterThanOrEqual(0.15)
    expect(summary.winRate).toBeLessThanOrEqual(0.25)
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThanOrEqual(0.42)
    expect(
      Math.min(...Object.values(summary.winningPassiveInclusionRate)),
    ).toBeGreaterThanOrEqual(0.05)
    expect(summary.topFiveBuildShare).toBeLessThanOrEqual(0.45)
  })
})
