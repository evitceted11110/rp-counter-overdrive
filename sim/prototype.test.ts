import { describe, expect, it } from 'vitest'
import { runPrototype } from './prototype.js'

describe('反擊超載 Gate 2 原型', () => {
  it('同 seed 產生完全相同摘要', () => {
    expect(runPrototype(500, 'same-seed')).toEqual(
      runPrototype(500, 'same-seed'),
    )
  })

  it('能完成多局模擬並回報四種 build 家族', () => {
    const summary = runPrototype(1_000)
    expect(summary.runs).toBe(1_000)
    expect(Object.keys(summary.familyWinRate)).toHaveLength(4)
    expect(summary.winRate).toBeGreaterThanOrEqual(0)
    expect(summary.winRate).toBeLessThanOrEqual(1)
  })
})
