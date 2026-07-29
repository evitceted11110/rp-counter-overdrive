import { describe, expect, it } from 'vitest'
import {
  chooseCore,
  choosePassive,
  chooseRoute,
  completeEncounter,
  createRunState,
  failRun,
  type RunCatalog,
} from './run.js'

const catalog: RunCatalog = {
  cores: [
    { id: 'core-a', name: '核心甲', family: 'a' },
    { id: 'core-b', name: '核心乙', family: 'b' },
    { id: 'core-c', name: '核心丙', family: 'c' },
  ],
  passives: [
    { id: 'p1', name: '模組一', family: 'a' },
    { id: 'p2', name: '模組二', family: 'b' },
    { id: 'p3', name: '模組三', family: 'c' },
    { id: 'p4', name: '模組四', family: 'a' },
    { id: 'p5', name: '模組五', family: 'b' },
    { id: 'p6', name: '模組六', family: 'c' },
  ],
  routes: [
    { id: 'route-a', name: '路線甲', publicTags: ['甲'] },
    { id: 'route-b', name: '路線乙', publicTags: ['乙'] },
  ],
}

describe('三戰 Rogue Run Core', () => {
  it('同 seed 產生相同核心順序與草稿', () => {
    expect(createRunState('run-seed', catalog)).toEqual(
      createRunState('run-seed', catalog),
    )
  })

  it('完成選核心→戰1→草稿→路線→戰2→草稿→戰3→結算', () => {
    let run = createRunState('full-run', catalog)
    expect(run.phase).toBe('choose-core')
    run = chooseCore(run, run.coreChoices[0]?.id ?? '')
    expect(run.phase).toBe('battle')
    expect(run.encounter).toBe(1)

    run = completeEncounter(run, 5, catalog)
    expect(run.phase).toBe('choose-passive')
    expect(run.passiveChoices).toHaveLength(3)
    const selectedCore = catalog.cores.find((core) => core.id === run.coreId)
    expect(
      run.passiveChoices.some(
        (passive) => passive.family === selectedCore?.family,
      ),
    ).toBe(true)
    run = choosePassive(run, run.passiveChoices[0]?.id ?? '')
    expect(run.phase).toBe('choose-route')

    run = chooseRoute(run, run.routeChoices[0]?.id ?? '')
    expect(run.phase).toBe('battle')
    expect(run.encounter).toBe(2)

    run = completeEncounter(run, 4, catalog)
    run = choosePassive(run, run.passiveChoices[0]?.id ?? '')
    expect(run.phase).toBe('battle')
    expect(run.encounter).toBe(3)
    expect(run.passiveIds).toHaveLength(2)

    run = completeEncounter(run, 3)
    expect(run.phase).toBe('run-won')
    expect(run.playerIntegrity).toBe(3)
  })

  it('拒絕不在當前候選中的選擇，死亡清空本局構築', () => {
    const initial = createRunState('invalid-choice', catalog)
    expect(chooseCore(initial, 'missing')).toBe(initial)

    const active = chooseCore(initial, initial.coreChoices[0]?.id ?? '')
    const lost = failRun(active)
    expect(lost.phase).toBe('run-lost')
    expect(lost.coreId).toBeNull()
    expect(lost.passiveIds).toEqual([])
    expect(lost.routeId).toBeNull()
  })
})
