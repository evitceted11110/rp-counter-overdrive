import { describe, expect, it } from 'vitest'
import {
  advanceAttack,
  beginBattle,
  counter,
  createInitialState,
  phaseDodge,
  releaseBrakeCore,
  timeoutAttack,
  type GameState,
} from './index.js'

describe('反擊超載核心', () => {
  it('同 seed 產生相同攻擊序列', () => {
    expect(createInitialState('demo').attacks).toEqual(
      createInitialState('demo').attacks,
    )
  })

  it('完美反擊造成依威脅成長的傷害並加速', () => {
    const active = beginBattle(createInitialState('perfect'))
    const result = counter(
      active,
      active.currentAttack?.direction ?? 'up',
      50,
    )
    expect(result.lastEvent?.grade).toBe('perfect')
    expect(result.bossIntegrity).toBe(112)
    expect(result.threat).toBe(1)
    expect(advanceAttack(result).currentTelegraphMs).toBe(810)
  })

  it('錯誤方向會受傷並失去威脅', () => {
    const state: GameState = {
      ...beginBattle(createInitialState('miss')),
      threat: 4,
    }
    const current = state.currentAttack?.direction ?? 'up'
    const wrong = current === 'up' ? 'down' : 'up'
    const result = counter(state, wrong, 60)
    expect(result.playerIntegrity).toBe(5)
    expect(result.threat).toBe(2)
    expect(result.stage).toBe('resolved')
  })

  it('破防招只能消耗相位或承受傷害', () => {
    const base = beginBattle(createInitialState('breach'))
    const breach: GameState = {
      ...base,
      currentAttack: {
        id: 'breach-test',
        direction: 'left',
        kind: 'breach',
        label: '破防突進',
        counterable: false,
      },
    }
    expect(counter(breach, 'left', 20)).toEqual(breach)
    expect(phaseDodge(breach, 100).phaseCharges).toBe(1)
    expect(timeoutAttack(breach).playerIntegrity).toBe(5)
  })

  it('制動核心把威脅轉成傷害與兩次降速', () => {
    const active: GameState = {
      ...beginBattle(createInitialState('core')),
      threat: 4,
    }
    const released = releaseBrakeCore(active)
    expect(released.bossIntegrity).toBe(106)
    expect(released.threat).toBe(0)
    expect(released.coolingAttacks).toBe(2)
  })
})
