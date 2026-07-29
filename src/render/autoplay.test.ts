import { describe, expect, it } from 'vitest'
import {
  createAutoClickPlan,
  isCurrentAutoClickPlan,
} from './autoplay.js'

describe('測試用自動點擊計畫', () => {
  it('只用目前 target 的 lane 與精確時間建立輸入，沒有亂數狀態', () => {
    const target = { id: 'eighth-right', lane: 'right' as const }
    expect(createAutoClickPlan(target, 1_234.5)).toEqual({
      targetId: 'eighth-right',
      action: 'right',
      atPerformanceMs: 1_234.5,
    })
  })

  it('遇到 timeout 或樂句改寫後，過期計畫必須被辨識並重排', () => {
    const plan = createAutoClickPlan(
      { id: 'before-rewrite', lane: 'left' },
      900,
    )
    expect(
      isCurrentAutoClickPlan(plan, { id: 'after-rewrite', lane: 'center' }),
    ).toBe(false)
    expect(isCurrentAutoClickPlan(plan, undefined)).toBe(false)
  })
})
