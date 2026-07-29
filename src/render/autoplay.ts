import type { CombatAction } from '../core/phrases.js'

export type AutoClickTarget = {
  id: string
  lane: CombatAction
}

export type AutoClickPlan = {
  targetId: string
  action: CombatAction
  atPerformanceMs: number
}

/** 建立一筆唯讀的 Perfect 輸入計畫；不參與亂數或修改戰鬥狀態。 */
export function createAutoClickPlan(
  target: AutoClickTarget,
  atPerformanceMs: number,
): AutoClickPlan {
  return {
    targetId: target.id,
    action: target.lane,
    atPerformanceMs,
  }
}

/** 動態改寫或 timeout 後，舊計畫只能重排，不能誤按新的目前目標。 */
export function isCurrentAutoClickPlan(
  plan: AutoClickPlan,
  current: AutoClickTarget | undefined,
): boolean {
  return current?.id === plan.targetId
}
