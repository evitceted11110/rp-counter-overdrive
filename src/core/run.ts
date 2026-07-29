import { createRng } from '@rogue-paradise/rng'

export type RunPhase =
  | 'choose-core'
  | 'battle'
  | 'choose-passive'
  | 'choose-route'
  | 'run-won'
  | 'run-lost'

export type RunChoice = {
  id: string
  name: string
  family: string
  compatibleTags?: readonly string[]
}

export type RouteChoice = {
  id: string
  name: string
  publicTags: readonly string[]
  rewardFamilies?: readonly string[]
}

export type RunCatalog = {
  cores: readonly RunChoice[]
  passives: readonly RunChoice[]
  routes: readonly RouteChoice[]
}

export type RunDurationEncounter = {
  bpm: number
  maxBars?: number
  fixedChart?: { chartBars: number }
}

/**
 * Deterministic planning estimate: two count-in bars per Boss plus a modest
 * 100 seconds across the core, two drafts and route decision.  It measures a
 * successful full-contract run, rather than an unrealistically instant UI
 * selection path.
 */
export function estimateSuccessfulRunDurationMs(
  encounters: readonly RunDurationEncounter[],
): number {
  const combatMs = encounters.reduce(
    (total, encounter) => {
      const chartBars = encounter.fixedChart?.chartBars ?? encounter.maxBars
      if (chartBars === undefined) throw new Error('戰鬥時長缺少 chartBars')
      return total + (chartBars + 2) * 4 * (60_000 / encounter.bpm)
    },
    0,
  )
  return Math.round(combatMs + 100_000)
}

export type RunState = {
  seed: string
  phase: RunPhase
  encounter: 1 | 2 | 3
  playerIntegrity: number
  maxPlayerIntegrity: number
  coreId: string | null
  passiveIds: readonly string[]
  routeId: string | null
  coreChoices: readonly RunChoice[]
  passiveChoices: readonly RunChoice[]
  routeChoices: readonly RouteChoice[]
  defeatedEncounters: readonly number[]
}

function seededChoices<T extends { id: string }>(
  seed: string,
  source: readonly T[],
  count: number,
): T[] {
  const rng = createRng(seed)
  const pool = [...source]
  const choices: T[] = []
  while (choices.length < count && pool.length > 0) {
    const picked = rng.pick(pool)
    choices.push(picked)
    pool.splice(
      pool.findIndex((candidate) => candidate.id === picked.id),
      1,
    )
  }
  return choices
}

export function createRunState(seed: string, catalog: RunCatalog): RunState {
  if (seed.length === 0) throw new Error('run seed 不得為空')
  if (catalog.cores.length < 3) throw new Error('至少需要三個起始核心')
  if (catalog.passives.length < 3) throw new Error('至少需要三個被動模組')
  if (catalog.routes.length < 2) throw new Error('至少需要兩條路線')
  return {
    seed,
    phase: 'choose-core',
    encounter: 1,
    playerIntegrity: 6,
    maxPlayerIntegrity: 6,
    coreId: null,
    passiveIds: [],
    routeId: null,
    coreChoices: seededChoices(`${seed}:cores`, catalog.cores, 3),
    passiveChoices: [],
    routeChoices: catalog.routes.slice(0, 2),
    defeatedEncounters: [],
  }
}

export function chooseCore(state: RunState, coreId: string): RunState {
  if (
    state.phase !== 'choose-core' ||
    !state.coreChoices.some((choice) => choice.id === coreId)
  ) {
    return state
  }
  return {
    ...state,
    phase: 'battle',
    coreId,
  }
}

function draftForEncounter(
  state: RunState,
  catalog: RunCatalog,
): RunChoice[] {
  const available = catalog.passives.filter(
    (choice) => !state.passiveIds.includes(choice.id),
  )
  const core = catalog.cores.find((choice) => choice.id === state.coreId)
  const route = catalog.routes.find((choice) => choice.id === state.routeId)
  const preferredFamilies = new Set([
    ...(core === undefined ? [] : [core.family, ...(core.compatibleTags ?? [])]),
    ...(route?.rewardFamilies ?? []),
  ])
  const preferred = available.filter(
    (choice) =>
      preferredFamilies.has(choice.family) ||
      (choice.compatibleTags ?? []).some((tag) => preferredFamilies.has(tag)),
  )
  const seed = `${state.seed}:draft:${state.encounter}:${state.passiveIds.join(',')}`
  const guaranteed = seededChoices(`${seed}:preferred`, preferred, 1)
  const remaining = available.filter(
    (choice) => !guaranteed.some((picked) => picked.id === choice.id),
  )
  return [...guaranteed, ...seededChoices(`${seed}:remaining`, remaining, 3)].slice(
    0,
    3,
  )
}

export function completeEncounter(
  state: RunState,
  playerIntegrity: number,
  catalog?: RunCatalog,
): RunState {
  if (state.phase !== 'battle') return state
  const defeatedEncounters = [...state.defeatedEncounters, state.encounter]
  if (state.encounter === 3) {
    return {
      ...state,
      phase: 'run-won',
      playerIntegrity,
      defeatedEncounters,
    }
  }
  if (catalog === undefined) {
    throw new Error('戰鬥後需要 catalog 產生草稿')
  }
  const next = {
    ...state,
    phase: 'choose-passive' as const,
    playerIntegrity,
    defeatedEncounters,
  }
  return {
    ...next,
    passiveChoices: draftForEncounter(next, catalog),
  }
}

export function choosePassive(
  state: RunState,
  passiveId: string,
): RunState {
  if (
    state.phase !== 'choose-passive' ||
    !state.passiveChoices.some((choice) => choice.id === passiveId)
  ) {
    return state
  }
  const passiveIds = [...state.passiveIds, passiveId]
  if (state.encounter === 1) {
    return {
      ...state,
      phase: 'choose-route',
      passiveIds,
      passiveChoices: [],
    }
  }
  return {
    ...state,
    phase: 'battle',
    encounter: 3,
    passiveIds,
    passiveChoices: [],
  }
}

export function chooseRoute(state: RunState, routeId: string): RunState {
  if (
    state.phase !== 'choose-route' ||
    !state.routeChoices.some((choice) => choice.id === routeId)
  ) {
    return state
  }
  return {
    ...state,
    phase: 'battle',
    encounter: 2,
    routeId,
  }
}

export function failRun(state: RunState): RunState {
  if (state.phase !== 'battle') return state
  return {
    ...state,
    phase: 'run-lost',
    playerIntegrity: 0,
    coreId: null,
    passiveIds: [],
    routeId: null,
  }
}
