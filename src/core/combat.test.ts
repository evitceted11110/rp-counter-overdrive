import { describe, expect, it } from 'vitest'
import {
  beginCombat,
  createCombatState,
  encounterTiming,
  resolveAction,
  timeoutCurrentAttack,
  type CombatState,
  type RhythmAttack,
} from './combat.js'

function activeWith(attack: RhythmAttack): CombatState {
  return {
    ...beginCombat(createCombatState('unit-combat', 2)),
    attacks: [attack],
    currentAttack: attack,
    stage: 'active',
  }
}

describe('0.3.0 三鍵 Combat Core', () => {
  it('同 seed 與難度產生完全相同的節奏攻擊', () => {
    expect(createCombatState('same-seed', 3).attacks).toEqual(
      createCombatState('same-seed', 3).attacks,
    )
    expect(createCombatState('same-seed', 3).attacks).not.toEqual(
      createCombatState('other-seed', 3).attacks,
    )
  })

  it('只會生成 left、right、center 三種 action', () => {
    const actions = createCombatState('three-actions', 3).attacks.map(
      (attack) => attack.action,
    )
    expect(
      actions.every((action) => ['left', 'right', 'center'].includes(action)),
    ).toBe(true)
  })

  it('單一 resolveAction 處理完美、普通、錯軌與逾時', () => {
    const attack: RhythmAttack = {
      id: 'left-1',
      action: 'left',
      kind: 'strike',
      targetBeat: 4,
      subdivision: 1,
      patternId: 'unit',
      difficultyTier: 0,
    }
    const active = activeWith(attack)
    expect(resolveAction(active, 'left', 0).lastEvent?.kind).toBe('perfect')
    expect(resolveAction(active, 'left', 100).lastEvent?.kind).toBe('normal')
    expect(resolveAction(active, 'right', 0).lastEvent?.kind).toBe('wrong-lane')
    expect(timeoutCurrentAttack(active).lastEvent?.kind).toBe('timeout')
  })

  it('按 encounter 使用 120/132/144 BPM 與對應判定窗', () => {
    expect(encounterTiming).toEqual({
      1: { bpm: 120, normalWindowMs: 140, perfectWindowMs: 60 },
      2: { bpm: 132, normalWindowMs: 120, perfectWindowMs: 50 },
      3: { bpm: 144, normalWindowMs: 100, perfectWindowMs: 45 },
    })
    for (const encounter of [1, 2, 3] as const) {
      const timing = encounterTiming[encounter]
      const attack: RhythmAttack = {
        id: `encounter-${encounter}`,
        action: 'left',
        kind: 'strike',
        targetBeat: 4,
        subdivision: 1,
        patternId: 'unit',
        difficultyTier: encounter === 1 ? 0 : encounter === 2 ? 2 : 3,
      }
      const active: CombatState = {
        ...activeWith(attack),
        encounter,
      }
      expect(
        resolveAction(active, 'left', timing.perfectWindowMs).lastEvent?.grade,
      ).toBe('perfect')
      expect(
        resolveAction(active, 'left', timing.perfectWindowMs + 1).lastEvent
          ?.grade,
      ).toBe('normal')
      expect(
        resolveAction(active, 'left', timing.normalWindowMs + 1).lastEvent?.kind,
      ).toBe('timeout')
    }
  })

  it('Space 永遠只判定公開的中央目標', () => {
    const left: RhythmAttack = {
      id: 'left',
      action: 'left',
      kind: 'strike',
      targetBeat: 1,
      subdivision: 1,
      patternId: 'unit',
      difficultyTier: 0,
    }
    const center: RhythmAttack = {
      ...left,
      id: 'center',
      action: 'center',
      difficultyTier: 2,
    }
    const breach: RhythmAttack = {
      ...center,
      id: 'breach',
      kind: 'breach',
    }

    const leftActive = activeWith(left)
    const tooEarly = resolveAction(leftActive, 'center', -300)
    expect(tooEarly.stage).toBe('active')
    expect(tooEarly.currentAttack).toBe(leftActive.currentAttack)
    expect(tooEarly.lastEvent?.kind).toBe('too-early')
    const noCenterTarget = resolveAction(activeWith(left), 'center', 0)
    expect(noCenterTarget.stage).toBe('active')
    expect(noCenterTarget.lastEvent?.kind).toBe('invalid-center')
    expect(noCenterTarget.playerIntegrity).toBe(6)
    expect(resolveAction(activeWith(center), 'center', 0).lastEvent?.kind).toBe(
      'center',
    )
    expect(resolveAction(activeWith(breach), 'center', 0).lastEvent?.kind).toBe(
      'breach-counter',
    )
  })

  it('太早輸入不消耗攻擊，同一攻擊成功後不能重複判定', () => {
    const attack: RhythmAttack = {
      id: 'right',
      action: 'right',
      kind: 'strike',
      targetBeat: 2,
      subdivision: 1,
      patternId: 'unit',
      difficultyTier: 0,
    }
    const active = activeWith(attack)
    const tooEarly = resolveAction(active, 'right', -300)
    expect(tooEarly.stage).toBe('active')
    expect(tooEarly.currentAttack).toBe(active.currentAttack)

    const resolved = resolveAction(active, 'right', 0)
    expect(resolveAction(resolved, 'right', 0)).toBe(resolved)
    expect(resolved.stage).toBe('resolved')
  })
})
