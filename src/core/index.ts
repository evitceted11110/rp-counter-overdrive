import { createRng } from '@rogue-paradise/rng'

export * from './combat.js'
export * from './phrases.js'
export * from './run.js'
export * from './runtime-battle.js'

export type Direction = 'up' | 'right' | 'down' | 'left'
export type AttackKind = 'direct' | 'double' | 'return' | 'breach' | 'drain'
export type BattleStage = 'ready' | 'telegraph' | 'resolved' | 'won' | 'lost'
export type CounterGrade = 'perfect' | 'normal' | 'miss' | 'phase' | 'core'

export type Attack = {
  id: string
  direction: Direction
  kind: AttackKind
  label: string
  counterable: boolean
  seriesLabel?: string
}

export type BattleEvent = {
  grade: CounterGrade
  title: string
  detail: string
  damage: number
}

export type GameState = {
  seed: string
  stage: BattleStage
  playerIntegrity: number
  maxPlayerIntegrity: number
  bossIntegrity: number
  maxBossIntegrity: number
  threat: number
  phaseCharges: number
  attackCursor: number
  attacks: readonly Attack[]
  currentAttack: Attack | null
  currentTelegraphMs: number
  coolingAttacks: number
  combo: number
  lastEvent: BattleEvent | null
}

const directions: readonly Direction[] = ['up', 'right', 'down', 'left']
const opposite: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
}
const telegraphByThreat = [900, 810, 720, 630, 540, 450] as const

function createAttackSequence(seed: string): Attack[] {
  const rng = createRng(`${seed}:prism-supervisor`)
  const attacks: Attack[] = []
  let serial = 0
  const add = (
    kind: AttackKind,
    direction: Direction,
    label: string,
    counterable = true,
    seriesLabel?: string,
  ): void => {
    attacks.push({
      id: `attack-${serial}`,
      direction,
      kind,
      label,
      counterable,
      ...(seriesLabel === undefined ? {} : { seriesLabel }),
    })
    serial += 1
  }

  while (attacks.length < 28) {
    const direction = rng.pick(directions)
    const pattern = attacks.length % 11
    if (pattern === 4) {
      add('double', direction, '雙脈衝', true, '第一段')
      add('double', rng.pick(directions), '雙脈衝', true, '第二段')
    } else if (pattern === 7) {
      add('breach', direction, '破防突進', false)
    } else if (pattern === 9) {
      add('return', direction, '回返斬', true, '去程')
      add('return', opposite[direction], '回返斬', true, '回程')
    } else if (pattern === 2) {
      add('drain', direction, '吸能穿刺')
    } else {
      add('direct', direction, '棱鏡直擊')
    }
  }
  return attacks.slice(0, 28)
}

export function createInitialState(seed: string): GameState {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  return {
    seed,
    stage: 'ready',
    playerIntegrity: 6,
    maxPlayerIntegrity: 6,
    bossIntegrity: 118,
    maxBossIntegrity: 118,
    threat: 0,
    phaseCharges: 2,
    attackCursor: 0,
    attacks: createAttackSequence(seed),
    currentAttack: null,
    currentTelegraphMs: telegraphByThreat[0],
    coolingAttacks: 0,
    combo: 0,
    lastEvent: null,
  }
}

function withOutcome(state: GameState): GameState {
  if (state.bossIntegrity <= 0) {
    return {
      ...state,
      bossIntegrity: 0,
      stage: 'won',
      currentAttack: null,
    }
  }
  if (state.playerIntegrity <= 0) {
    return {
      ...state,
      playerIntegrity: 0,
      stage: 'lost',
      currentAttack: null,
    }
  }
  return state
}

export function beginBattle(state: GameState): GameState {
  if (state.stage !== 'ready') return state
  return advanceAttack(state)
}

export function advanceAttack(state: GameState): GameState {
  if (state.stage === 'won' || state.stage === 'lost') return state
  const attack = state.attacks[state.attackCursor % state.attacks.length]
  if (attack === undefined) throw new Error('攻擊序列不得為空')
  const isCooling = state.coolingAttacks > 0
  return {
    ...state,
    stage: 'telegraph',
    currentAttack: attack,
    currentTelegraphMs: isCooling
      ? telegraphByThreat[0]
      : (telegraphByThreat[state.threat] ?? telegraphByThreat[0]),
    coolingAttacks: Math.max(0, state.coolingAttacks - 1),
    attackCursor: state.attackCursor + 1,
    lastEvent: null,
  }
}

export function counter(
  state: GameState,
  direction: Direction,
  remainingMs: number,
): GameState {
  const attack = state.currentAttack
  if (state.stage !== 'telegraph' || attack === null) return state
  if (!attack.counterable || remainingMs > 240) return state

  if (direction !== attack.direction || remainingMs < -80) {
    return missAttack(state, attack.kind === 'drain' ? '吸能命中' : '方向錯誤')
  }

  const isPerfect = remainingMs <= 90 && remainingMs >= -40
  if (attack.kind === 'drain' && !isPerfect) {
    const damaged = Math.min(state.maxBossIntegrity, state.bossIntegrity + 4)
    return {
      ...state,
      stage: 'resolved',
      bossIntegrity: damaged,
      combo: 0,
      lastEvent: {
        grade: 'normal',
        title: '普通反擊',
        detail: '沒有截斷吸能，Boss 修復 4 點',
        damage: 0,
      },
    }
  }

  if (isPerfect) {
    const damage = 6 + state.threat * 2
    return withOutcome({
      ...state,
      stage: 'resolved',
      bossIntegrity: state.bossIntegrity - damage,
      threat: Math.min(5, state.threat + 1),
      combo: state.combo + 1,
      lastEvent: {
        grade: 'perfect',
        title: '完美反擊',
        detail: `威脅上升，造成 ${damage} 點崩解`,
        damage,
      },
    })
  }

  return withOutcome({
    ...state,
    stage: 'resolved',
    bossIntegrity: state.bossIntegrity - 4,
    lastEvent: {
      grade: 'normal',
      title: '普通反擊',
      detail: '擋下攻擊，造成 4 點崩解',
      damage: 4,
    },
  })
}

function missAttack(state: GameState, title: string): GameState {
  return withOutcome({
    ...state,
    stage: 'resolved',
    playerIntegrity: state.playerIntegrity - 1,
    threat: Math.max(0, state.threat - 2),
    combo: 0,
    lastEvent: {
      grade: 'miss',
      title,
      detail: '完整度 -1，威脅下降 2 級',
      damage: 0,
    },
  })
}

export function timeoutAttack(state: GameState): GameState {
  const attack = state.currentAttack
  if (state.stage !== 'telegraph' || attack === null) return state
  return missAttack(state, attack.counterable ? '反擊逾時' : '破防命中')
}

export function phaseDodge(
  state: GameState,
  remainingMs: number,
): GameState {
  const attack = state.currentAttack
  if (
    state.stage !== 'telegraph' ||
    attack === null ||
    attack.kind !== 'breach' ||
    state.phaseCharges <= 0 ||
    remainingMs > 320 ||
    remainingMs < -80
  ) {
    return state
  }
  return {
    ...state,
    stage: 'resolved',
    phaseCharges: state.phaseCharges - 1,
    combo: state.combo + 1,
    lastEvent: {
      grade: 'phase',
      title: '相位穿越',
      detail: '避開不可反擊攻擊',
      damage: 0,
    },
  }
}

export function releaseBrakeCore(state: GameState): GameState {
  if (
    (state.stage !== 'telegraph' && state.stage !== 'resolved') ||
    state.threat < 3
  ) {
    return state
  }
  const damage = state.threat * 3
  return withOutcome({
    ...state,
    bossIntegrity: state.bossIntegrity - damage,
    threat: 0,
    coolingAttacks: 2,
    lastEvent: {
      grade: 'core',
      title: '制動核心',
      detail: `釋放威脅，造成 ${damage} 點崩解；接下來兩招降速`,
      damage,
    },
  })
}

export function directionLabel(direction: Direction): string {
  return {
    up: '上',
    right: '右',
    down: '下',
    left: '左',
  }[direction]
}
