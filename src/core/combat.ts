import {
  createPhraseSequence,
  type BeatSubdivision,
  type CombatAction,
  type DifficultyTier,
  type RhythmAttackKind,
} from './phrases.js'

export type CombatStage = 'ready' | 'active' | 'resolved' | 'won' | 'lost'
export type EncounterNumber = 1 | 2 | 3
export type CombatEventKind =
  | 'too-early'
  | 'perfect'
  | 'normal'
  | 'wrong-lane'
  | 'invalid-center'
  | 'timeout'
  | 'center'
  | 'breach-counter'

export type RhythmAttack = {
  id: string
  action: CombatAction
  kind: RhythmAttackKind
  targetBeat: number
  subdivision: BeatSubdivision
  patternId: string
  difficultyTier: DifficultyTier
}

export type CombatEvent = {
  kind: CombatEventKind
  grade: 'perfect' | 'normal' | 'miss' | 'invalid'
  title: string
  damage: number
  timingOffsetMs?: number
}

export type CombatState = {
  seed: string
  encounter: EncounterNumber
  difficultyTier: DifficultyTier
  stage: CombatStage
  playerIntegrity: number
  maxPlayerIntegrity: number
  bossIntegrity: number
  maxBossIntegrity: number
  threat: number
  combo: number
  attackCursor: number
  attacks: readonly RhythmAttack[]
  currentAttack: RhythmAttack | null
  lastEvent: CombatEvent | null
}

const phraseCount = 12
const beatsPerBar = 4

export const encounterTiming = {
  1: { bpm: 120, normalWindowMs: 140, perfectWindowMs: 60 },
  2: { bpm: 132, normalWindowMs: 120, perfectWindowMs: 50 },
  3: { bpm: 144, normalWindowMs: 100, perfectWindowMs: 45 },
} as const

function createAttackTimeline(
  seed: string,
  tier: DifficultyTier,
): RhythmAttack[] {
  const phrases = createPhraseSequence(seed, tier, phraseCount)
  const attacks: RhythmAttack[] = []
  let phraseStartBeat = 4
  let serial = 0

  for (const phrase of phrases) {
    for (const note of phrase.notes) {
      attacks.push({
        id: `${seed}:attack-${serial}`,
        action: note.action,
        kind: note.kind,
        targetBeat: phraseStartBeat + note.beat,
        subdivision: phrase.subdivision,
        patternId: phrase.id,
        difficultyTier: phrase.difficultyTier,
      })
      serial += 1
    }
    phraseStartBeat += phrase.bars * beatsPerBar
  }
  return attacks
}

export function createCombatState(
  seed: string,
  difficultyTier: DifficultyTier = 0,
  encounter: EncounterNumber = difficultyTier >= 3 ? 3 : difficultyTier >= 2 ? 2 : 1,
): CombatState {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  return {
    seed,
    encounter,
    difficultyTier,
    stage: 'ready',
    playerIntegrity: 6,
    maxPlayerIntegrity: 6,
    bossIntegrity: 118,
    maxBossIntegrity: 118,
    threat: 0,
    combo: 0,
    attackCursor: 0,
    attacks: createAttackTimeline(seed, difficultyTier),
    currentAttack: null,
    lastEvent: null,
  }
}

function withOutcome(state: CombatState): CombatState {
  if (state.bossIntegrity <= 0) {
    return {
      ...state,
      stage: 'won',
      bossIntegrity: 0,
      currentAttack: null,
    }
  }
  if (state.playerIntegrity <= 0) {
    return {
      ...state,
      stage: 'lost',
      playerIntegrity: 0,
      currentAttack: null,
    }
  }
  return state
}

export function beginCombat(state: CombatState): CombatState {
  if (state.stage !== 'ready') return state
  return advanceCombat(state)
}

export function advanceCombat(state: CombatState): CombatState {
  if (state.stage === 'won' || state.stage === 'lost') return state
  const attack = state.attacks[state.attackCursor]
  if (attack === undefined) {
    return {
      ...state,
      stage: 'won',
      bossIntegrity: 0,
      currentAttack: null,
    }
  }
  return {
    ...state,
    stage: 'active',
    currentAttack: attack,
    attackCursor: state.attackCursor + 1,
    lastEvent: null,
  }
}

function miss(
  state: CombatState,
  kind: 'wrong-lane' | 'timeout',
): CombatState {
  return withOutcome({
    ...state,
    stage: 'resolved',
    playerIntegrity: state.playerIntegrity - 1,
    threat: Math.max(0, state.threat - 2),
    combo: 0,
    lastEvent: {
      kind,
      grade: 'miss',
      title: kind === 'timeout' ? '反擊逾時' : '軌道錯誤',
      damage: 0,
    },
  })
}

export function resolveAction(
  state: CombatState,
  action: CombatAction,
  timingOffsetMs: number,
): CombatState {
  const attack = state.currentAttack
  if (state.stage !== 'active' || attack === null) return state
  if (!Number.isFinite(timingOffsetMs)) return state
  const windows = encounterTiming[state.encounter]
  if (timingOffsetMs < -windows.normalWindowMs) {
    return {
      ...state,
      lastEvent: {
        kind: 'too-early',
        grade: 'invalid',
        title: '輸入過早',
        damage: 0,
        timingOffsetMs,
      },
    }
  }
  if (timingOffsetMs > windows.normalWindowMs) return miss(state, 'timeout')
  if (action === 'center' && attack.action !== 'center') {
    return {
      ...state,
      lastEvent: {
        kind: 'invalid-center',
        grade: 'invalid',
        title: '目前沒有中央目標',
        damage: 0,
        timingOffsetMs,
      },
    }
  }
  if (action !== attack.action) return miss(state, 'wrong-lane')

  const isPerfect =
    Math.abs(timingOffsetMs) <= windows.perfectWindowMs
  const damage = isPerfect ? 6 + state.threat * 2 : 4
  const kind: CombatEventKind =
    attack.kind === 'breach'
      ? 'breach-counter'
      : attack.action === 'center'
        ? 'center'
        : isPerfect
          ? 'perfect'
          : 'normal'

  return withOutcome({
    ...state,
    stage: 'resolved',
    bossIntegrity: state.bossIntegrity - damage,
    threat: isPerfect ? Math.min(5, state.threat + 1) : state.threat,
    combo: state.combo + 1,
    lastEvent: {
      kind,
      grade: isPerfect ? 'perfect' : 'normal',
      title:
        kind === 'breach-counter'
          ? '破防震返'
          : kind === 'center'
            ? '中央重拍'
            : isPerfect
              ? '完美反擊'
              : '普通反擊',
      damage,
      timingOffsetMs,
    },
  })
}

export function timeoutCurrentAttack(state: CombatState): CombatState {
  if (state.stage !== 'active' || state.currentAttack === null) return state
  return miss(state, 'timeout')
}
