import { createRng } from '@rogue-paradise/rng'
import type { CombatAction } from './phrases.js'

export type EncounterDefinition = {
  id: string
  name: string
  encounter: 1 | 2 | 3
  bpm: 120 | 132 | 144
  /** Immutable chart contract. `noteBudget` targets are selected before play;
   * `defeatScore` is the score threshold, not a mutable health pool. */
  fixedChart?: {
    noteBudget: number
    chartBars: number
    defeatScore: number
  }
  /** @deprecated compatibility for older tests/content. */
  integrity?: number
  normalWindowMs: number
  perfectWindowMs: number
  openingPatterns: readonly string[]
  allowedPatternTags: readonly string[]
  /** @deprecated compatibility for older tests/content. */
  maxBars?: number
  /** Every grammar token is taught by a deterministic, legal phrase. */
  requiredGrammar: readonly string[]
  /** Boss 3 reserves one of these as its final, fully previewed phrase. */
  redlinePatterns: readonly string[]
}

export type PatternDefinition = {
  id: string
  name: string
  bars: number
  subdivision: 4 | 8
  allowedEncounters: readonly number[]
  routeTags: readonly string[]
  grammar: readonly string[]
  targets: readonly { step: number; lane: CombatAction }[]
  markedRestSteps: readonly number[]
}

export type BuildEffectType =
  | 'alternating-perfect-echo'
  | 'convert-marked-rest-to-center-charge'
  | 'forgive-now-add-center-next-bar'
  | 'opposite-lane-window'
  | 'repeat-second-risk'
  | 'convert-marked-rest-to-center-insurance'
  | 'three-lane-vulnerability'
  | 'late-perfect-echo'
  | 'replace-next-bar-with-safe-phrase'

export type BuildEffect = {
  sourceId: string
  sourceName: string
  type: BuildEffectType
  values: Readonly<Record<string, number>>
}

export type TargetSource =
  | 'pattern'
  | 'capacitor'
  | 'insurance'
  | 'capacitor-insurance'
  | 'flywheel'
  | 'breaker'
  | 'overload'
  | 'overload-redline'
  | 'contract-finale'

export type EncounterTarget = {
  id: string
  lane: CombatAction
  targetBeat: number
  patternId: string
  patternName: string
  grammar: readonly string[]
  source: TargetSource
}

export type BattleRuntimeEvent = {
  kind:
    | 'perfect'
    | 'normal'
    | 'miss'
    | 'timeout'
    | 'center'
    | 'invalid-center'
    | 'too-early'
  title: string
  detail: string
  damage: number
  triggered: readonly string[]
  timingOffsetMs: number
  /** First beat whose unplayed call/target plan was rewritten, if any. */
  rewrittenFromBeat?: number
}

export type BattleRuntimeState = {
  seed: string
  encounter: EncounterDefinition
  effects: readonly BuildEffect[]
  targets: readonly EncounterTarget[]
  cursor: number
  playerIntegrity: number
  maxPlayerIntegrity: number
  bossIntegrity: number
  maxBossIntegrity: number
  /** All resolved inputs contribute score; once the threshold is met, later
   * score is an overkill bonus while the chart continues unchanged. */
  score: number
  bossDefeated: boolean
  overload: number
  combo: number
  lastEvent: BattleRuntimeEvent | null
  previousPerfectLane: CombatAction | null
  previousResolvedLane: CombatAction | null
  recentPerfect: readonly CombatAction[]
  capacitorCharges: number
  insuranceStacks: number
  protectedMissesUsed: number
  breakerUses: number
  addedCenterBars: readonly number[]
  imperfectBars: readonly number[]
  reedTriggersByBar: readonly { bar: number; count: number }[]
  overloadPressureBars: readonly number[]
  teachingEndBeat: number
  /** A level-5 redline is a complete bar.  Its outcome resets overload. */
  overloadRedlineBar: number | null
}

type CreateTargetsOptions = {
  seed: string
  encounter: EncounterDefinition
  patterns: readonly PatternDefinition[]
  routeTags: readonly string[]
  effects: readonly BuildEffect[]
}

type CreateBattleOptions = CreateTargetsOptions & {
  playerIntegrity: number
}

function hasEffect(
  effects: readonly BuildEffect[],
  type: BuildEffectType,
): BuildEffect | undefined {
  return effects.find((effect) => effect.type === type)
}

function value(effect: BuildEffect | undefined, key: string, fallback: number): number {
  return effect?.values[key] ?? fallback
}

function chartBars(encounter: EncounterDefinition): number {
  const bars = encounter.fixedChart?.chartBars ?? encounter.maxBars
  if (typeof bars !== 'number' || !Number.isInteger(bars) || bars <= 0) {
    throw new Error(`${encounter.id} 缺少有效 fixed_chart.chart_bars`)
  }
  return bars
}

function defeatScore(encounter: EncounterDefinition): number {
  const score = encounter.fixedChart?.defeatScore ?? encounter.integrity
  if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0) {
    throw new Error(`${encounter.id} 缺少有效 fixed_chart.defeat_score`)
  }
  return score
}

function isEligiblePattern(
  pattern: PatternDefinition,
  options: CreateTargetsOptions,
): boolean {
  return (
    pattern.allowedEncounters.includes(options.encounter.encounter) &&
    pattern.routeTags.some((tag) =>
      options.encounter.allowedPatternTags.includes(tag),
    )
  )
}

/**
 * Build the full content-contract sequence before the encounter starts.  This
 * intentionally does not react to player input: both teaching and the final
 * redline remain learnable and deterministic for a seed.
 */
export function createEncounterPhraseSequence(
  options: CreateTargetsOptions,
): PatternDefinition[] {
  const eligible = options.patterns.filter(
    (pattern) => isEligiblePattern(pattern, options),
  )
  // 紅線只可作為 encounter 預告的終局模板，不能被填滿段落的 RNG
  // 提前抽到，否則「完整預告」不再具有明確的超載契約。
  const regularEligible = eligible.filter(
    (pattern) => !pattern.grammar.includes('redline'),
  )
  const routePreferred =
    options.routeTags.length === 0
      ? regularEligible
      : regularEligible.filter((pattern) =>
          pattern.routeTags.some((tag) => options.routeTags.includes(tag)),
        )
  if (eligible.length === 0) throw new Error('encounter 沒有合法節奏模板')
  const byId = new Map(options.patterns.map((pattern) => [pattern.id, pattern]))
  const opening = options.encounter.openingPatterns
    .map((id) => byId.get(id))
    .filter((pattern): pattern is PatternDefinition => pattern !== undefined)
  const rng = createRng(
    `${options.seed}:encounter-${options.encounter.encounter}:${options.routeTags.join(',')}`,
  )
  const selected = [...opening]
  const covered = new Set(selected.flatMap((pattern) => pattern.grammar))
  const redlineCandidates = options.encounter.redlinePatterns
    .map((id) => byId.get(id))
    .filter(
      (pattern): pattern is PatternDefinition =>
        pattern !== undefined && isEligiblePattern(pattern, options),
    )
  if (
    options.encounter.redlinePatterns.length > 0 &&
    redlineCandidates.length === 0
  ) {
    throw new Error('Boss 紅線模板不符合本戰合法路線')
  }
  const redline =
    redlineCandidates.length === 0 ? undefined : rng.pick(redlineCandidates)
  const reservedBars = redline?.bars ?? 0

  for (const grammar of options.encounter.requiredGrammar) {
    if (covered.has(grammar) || grammar === 'redline') continue
    const candidates = regularEligible.filter(
      (pattern) => pattern.grammar.includes(grammar),
    )
    const picked = candidates.length === 0 ? undefined : rng.pick(candidates)
    if (picked === undefined) {
      throw new Error(`${options.encounter.id} 缺少必教語法 ${grammar}`)
    }
    selected.push(picked)
    for (const token of picked.grammar) covered.add(token)
  }

  const bars = (phrases: readonly PatternDefinition[]): number =>
    phrases.reduce((total, phrase) => total + phrase.bars, 0)
  const totalBars = chartBars(options.encounter)
  if (bars(selected) + reservedBars > totalBars) {
    throw new Error(`${options.encounter.id} 開場與教學超過 chart_bars`)
  }
  while (bars(selected) < totalBars - reservedBars) {
    const remaining = totalBars - reservedBars - bars(selected)
    const candidates = (routePreferred.length > 0 ? routePreferred : regularEligible).filter(
      (pattern) => pattern.bars <= remaining,
    )
    if (candidates.length === 0) {
      throw new Error(`${options.encounter.id} 無法填滿 chart_bars`)
    }
    selected.push(rng.pick(candidates))
  }
  if (redline !== undefined) selected.push(redline)
  if (bars(selected) !== totalBars) {
    throw new Error(`${options.encounter.id} phrase sequence 未填滿 chart_bars`)
  }
  return selected
}

/**
 * A fixed chart may contain more legal content targets than its published
 * note budget. Keep all required grammar and the complete terminal redline,
 * then retain the remaining slots at even intervals. This happens once at
 * encounter creation, never in response to play.
 */
function enforceNoteBudget(
  targets: readonly EncounterTarget[],
  encounter: EncounterDefinition,
): EncounterTarget[] {
  const budget = encounter.fixedChart?.noteBudget
  if (budget === undefined) return [...targets]
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new Error(`${encounter.id} fixed_chart.note_budget 必須為正整數`)
  }
  if (targets.length < budget) {
    throw new Error(`${encounter.id} 合法譜面只有 ${targets.length} 顆，少於 note_budget ${budget}`)
  }
  const requiredIds = new Set<string>()
  for (const grammar of encounter.requiredGrammar) {
    const taughtBy = targets.find((target) => target.grammar.includes(grammar))
    if (taughtBy === undefined) {
      throw new Error(`${encounter.id} 固定譜面缺少必教語法 ${grammar}`)
    }
    requiredIds.add(taughtBy.id)
  }
  // The final redline is a public promise: trimming its individual notes
  // would make a complete phrase visually turn into a partial one.
  for (const target of targets) {
    if (target.grammar.includes('redline')) requiredIds.add(target.id)
  }
  if (requiredIds.size > budget) {
    throw new Error(`${encounter.id} 必要教學與紅線超過 note_budget`)
  }
  const optional = targets.filter((target) => !requiredIds.has(target.id))
  const optionalSlots = budget - requiredIds.size
  const chosen = new Set(requiredIds)
  for (let slot = 0; slot < optionalSlots; slot += 1) {
    const index = Math.floor((slot * optional.length) / optionalSlots)
    const target = optional[index]
    if (target !== undefined) chosen.add(target.id)
  }
  const fixed = targets.filter((target) => chosen.has(target.id))
  if (fixed.length !== budget) {
    throw new Error(`${encounter.id} 無法組成精確 note_budget`)
  }
  return fixed
}

export function createEncounterTargets(
  options: CreateTargetsOptions,
): EncounterTarget[] {
  const phrases = createEncounterPhraseSequence(options)
  const capacitor = hasEffect(
    options.effects,
    'convert-marked-rest-to-center-charge',
  )
  const insurance = hasEffect(
    options.effects,
    'convert-marked-rest-to-center-insurance',
  )
  const targets: EncounterTarget[] = []
  // 戰鬥先保留兩小節純節拍器；玩家第一次看見的是第二小節的
  // response 區，而不是一開場就被要求輸入。
  let phraseStartBeat = 8
  let serial = 0

  for (const phrase of phrases) {
    const beatsPerStep = 4 / phrase.subdivision
    const responseStartStep = phrase.subdivision / 2
    const responseSteps = new Set<number>()
    const assertResponseStep = (step: number, label: string): void => {
      const localStep = step % phrase.subdivision
      if (
        !Number.isInteger(step) ||
        step < 0 ||
        step >= phrase.bars * phrase.subdivision ||
        localStep < responseStartStep
      ) {
        throw new Error(`${phrase.id} 的${label}必須是原生 response half step`)
      }
    }
    for (const target of phrase.targets) {
      assertResponseStep(target.step, 'target')
      if (responseSteps.has(target.step)) {
        throw new Error(`${phrase.id} 不得在同一個 response step 重複 target`)
      }
      responseSteps.add(target.step)
      targets.push({
        id: `target-${serial}`,
        lane: target.lane,
        // Content step 即是唯一真實來源：絕不壓縮、補齊或重排 target。
        // sub4 使用 steps 2/3；sub8 使用 slots 4–7。
        targetBeat: phraseStartBeat + target.step * beatsPerStep,
        patternId: phrase.id,
        patternName: phrase.name,
        grammar: phrase.grammar,
        source: 'pattern',
      })
      serial += 1
    }
    const restSource: TargetSource | null =
      capacitor !== undefined && insurance !== undefined
        ? 'capacitor-insurance'
        : capacitor !== undefined
        ? 'capacitor'
        : insurance !== undefined
          ? 'insurance'
          : null
    if (restSource !== null) {
      for (const step of phrase.markedRestSteps) {
        assertResponseStep(step, 'marked rest')
        if (responseSteps.has(step)) {
          throw new Error(`${phrase.id} 的 marked rest 不得佔用 target step`)
        }
        responseSteps.add(step)
        targets.push({
          id: `target-${serial}`,
          lane: 'center',
          targetBeat: phraseStartBeat + step * beatsPerStep,
          patternId: phrase.id,
          patternName: `${phrase.name}・標記空拍`,
          grammar: [...phrase.grammar, 'marked-rest'],
          source: restSource,
        })
        serial += 1
      }
    }
    phraseStartBeat += phrase.bars * 4
  }
  const sorted = targets.sort(
    (left, right) =>
      left.targetBeat - right.targetBeat || left.id.localeCompare(right.id),
  )
  return enforceNoteBudget(sorted, options.encounter)
}

export function createBattleState(
  options: CreateBattleOptions,
): BattleRuntimeState {
  const targets = createEncounterTargets(options)
  const nonRedlineGrammar = options.encounter.requiredGrammar.filter(
    (grammar) => grammar !== 'redline',
  )
  const taught = new Set<string>()
  let teachingEndBeat = 8
  for (const target of targets) {
    for (const grammar of target.grammar) taught.add(grammar)
    if (nonRedlineGrammar.every((grammar) => taught.has(grammar))) {
      teachingEndBeat = target.targetBeat
      break
    }
  }
  return {
    seed: options.seed,
    encounter: options.encounter,
    effects: options.effects,
    targets,
    cursor: 0,
    playerIntegrity: options.playerIntegrity,
    maxPlayerIntegrity: 6,
    bossIntegrity: defeatScore(options.encounter),
    maxBossIntegrity: defeatScore(options.encounter),
    score: 0,
    bossDefeated: false,
    overload: 0,
    combo: 0,
    lastEvent: null,
    previousPerfectLane: null,
    previousResolvedLane: null,
    recentPerfect: [],
    capacitorCharges: 0,
    insuranceStacks: 0,
    protectedMissesUsed: 0,
    breakerUses: 0,
    addedCenterBars: [],
    imperfectBars: [],
    reedTriggersByBar: [],
    overloadPressureBars: [],
    teachingEndBeat,
    overloadRedlineBar: null,
  }
}

/** The encounter's rhythm contract completes only after every published note
 * has resolved. Boss defeat alone deliberately does not complete the chart. */
export function isBattleChartComplete(state: BattleRuntimeState): boolean {
  return state.cursor >= state.targets.length
}

function oppositeSide(left: CombatAction | null, right: CombatAction): boolean {
  return (
    (left === 'left' && right === 'right') ||
    (left === 'right' && right === 'left')
  )
}


function missBattle(
  state: BattleRuntimeState,
  timingOffsetMs: number,
  timeout: boolean,
): BattleRuntimeState {
  const target = state.targets[state.cursor]
  if (target === undefined) return state
  const triggered: string[] = []
  const targetBar = Math.floor(target.targetBeat / 4)
  const redlineFailed =
    target.source === 'overload-redline' || state.overloadRedlineBar === targetBar
  // 擊破只結束首領承傷，不會取消已公布的譜面。後續漏接仍要推進
  // cursor，但不再扣玩家完整度。
  if (state.bossDefeated) {
    return {
      ...state,
      cursor: state.cursor + 1,
      combo: 0,
      previousPerfectLane: null,
      previousResolvedLane: target.lane,
      recentPerfect: [],
      lastEvent: {
        kind: timeout ? 'timeout' : 'miss',
        title: timeout ? '擊破後逾時' : '擊破後漏接',
        detail: '首領已擊破；此音符只計為 0 分，不扣完整度',
        damage: 0,
        triggered,
        timingOffsetMs,
      },
    }
  }
  // 紅線是超載的硬結算：戰 1 的教學保護或空拍保險都不能把
  // 「miss → 1」改成一般失誤的結果。
  if (state.insuranceStacks > 0 && !redlineFailed) {
    triggered.push('rest-insurance')
    const targetBar = Math.floor(target.targetBeat / 4)
    const earnedScore = 1
    const bossDefeated =
      state.bossDefeated || state.bossIntegrity - earnedScore <= 0
    return {
      ...state,
      cursor: state.cursor + 1,
      score: state.score + earnedScore,
      bossDefeated,
      bossIntegrity: bossDefeated
        ? 0
        : Math.max(0, state.bossIntegrity - earnedScore),
      insuranceStacks: state.insuranceStacks - 1,
      previousResolvedLane: target.lane,
      imperfectBars: state.imperfectBars.includes(targetBar)
        ? state.imperfectBars
        : [...state.imperfectBars, targetBar],
      lastEvent: {
        kind: 'normal',
        title: '空拍保險',
        detail: '保險把失誤改為普通反擊（1 分）',
        damage: earnedScore,
        triggered,
        timingOffsetMs,
      },
    }
  }

  const protectedMiss =
    !redlineFailed &&
    state.encounter.encounter === 1 &&
    state.protectedMissesUsed < 3
  const breaker = hasEffect(
    state.effects,
    'replace-next-bar-with-safe-phrase',
  )
  const canBreak = breaker !== undefined && state.breakerUses < 2
  if (canBreak) triggered.push(breaker.sourceId)
  return {
    ...state,
    cursor: state.cursor + 1,
    playerIntegrity: protectedMiss
      ? state.playerIntegrity
      : canBreak
        ? state.playerIntegrity
      : Math.max(0, state.playerIntegrity - 1),
    overload: redlineFailed ? 1 : Math.max(0, state.overload - 2),
    combo: 0,
    previousPerfectLane: null,
    previousResolvedLane: target.lane,
    recentPerfect: [],
    protectedMissesUsed: state.protectedMissesUsed + (protectedMiss ? 1 : 0),
    breakerUses: state.breakerUses + (canBreak ? 1 : 0),
    imperfectBars: state.imperfectBars.includes(targetBar)
      ? state.imperfectBars
      : [...state.imperfectBars, targetBar],
    lastEvent: {
      kind: timeout ? 'timeout' : 'miss',
      title: protectedMiss ? '校準保護' : timeout ? '反擊逾時' : '軌道錯誤',
      detail: protectedMiss
        ? '教學保護：只中斷連段，不扣完整度'
        : redlineFailed
          ? '紅線失誤；超載回落至 1'
        : canBreak
          ? '斷路器吸收這次失誤；固定譜面不改寫'
          : '完整度 -1，超載下降 2 級',
      damage: 0,
      triggered,
      timingOffsetMs,
    },
  }
}

/**
 * 快速八分音符會讓普通判定窗重疊（例如 132 BPM 的音符間距為
 * 227.27ms，普通窗卻是 ±120ms）。交界輸入要交給較近的目標，而不能
 * 因為前一顆仍是 cursor target 就被前一顆吞掉。
 */
function resolveNearestAdjacentTarget(
  state: BattleRuntimeState,
  action: CombatAction,
  timingOffsetMs: number,
): BattleRuntimeState | null {
  const current = state.targets[state.cursor]
  const next = state.targets[state.cursor + 1]
  if (current === undefined || next === undefined) return null

  const gapBeats = next.targetBeat - current.targetBeat
  if (!Number.isFinite(gapBeats) || gapBeats <= 0) return null
  const gapMs = (gapBeats * 60_000) / state.encounter.bpm
  const nextOffsetMs = timingOffsetMs - gapMs
  const isCloserToNext = timingOffsetMs > gapMs / 2
  const isWithinNextWindow =
    Math.abs(nextOffsetMs) <= state.encounter.normalWindowMs
  if (!isCloserToNext || !isWithinNextWindow) return null

  // 前一顆漏接仍要結算；只是把這一次輸入重新綁定到較近的下一顆。
  // 這也避免延遲的 timeout callback 把有效的下一拍輸入變成錯軌失誤。
  const afterPreviousMiss = missBattle(state, timingOffsetMs, true)
  const reboundTarget = afterPreviousMiss.targets[afterPreviousMiss.cursor]
  if (afterPreviousMiss.playerIntegrity <= 0 || reboundTarget?.id !== next.id) {
    return afterPreviousMiss
  }
  return resolveBattleAction(afterPreviousMiss, action, nextOffsetMs)
}

export function resolveBattleAction(
  state: BattleRuntimeState,
  action: CombatAction,
  timingOffsetMs: number,
): BattleRuntimeState {
  const target = state.targets[state.cursor]
  if (target === undefined || state.playerIntegrity <= 0) {
    return state
  }
  const crossWindow = hasEffect(state.effects, 'opposite-lane-window')
  const crossWindowActive =
    crossWindow !== undefined &&
    oppositeSide(state.previousPerfectLane, target.lane)
  const normalWindow =
    state.encounter.normalWindowMs +
    (crossWindowActive ? value(crossWindow, 'normal_window_bonus_ms', 40) : 0)
  const ratchet = hasEffect(state.effects, 'repeat-second-risk')
  const ratchetActive =
    ratchet !== undefined &&
    target.lane !== 'center' &&
    state.previousPerfectLane === target.lane
  const perfectWindow = Math.max(
    20,
    state.encounter.perfectWindowMs -
      (ratchetActive ? value(ratchet, 'perfect_window_penalty_ms', 20) : 0),
  )

  const nearestAdjacent = resolveNearestAdjacentTarget(
    state,
    action,
    timingOffsetMs,
  )
  if (nearestAdjacent !== null) return nearestAdjacent

  if (timingOffsetMs < -normalWindow) {
    return {
      ...state,
      lastEvent: {
        kind: 'too-early',
        title: '輸入過早',
        detail: '等待目標拍抵達命中線',
        damage: 0,
        triggered: [],
        timingOffsetMs,
      },
    }
  }
  if (timingOffsetMs > normalWindow) {
    return missBattle(state, timingOffsetMs, true)
  }
  if (action === 'center' && target.lane !== 'center') {
    return {
      ...state,
      lastEvent: {
        kind: 'invalid-center',
        title: '目前沒有中央目標',
        detail: 'Space 只對公開的中央拍生效',
        damage: 0,
        triggered: [],
        timingOffsetMs,
      },
    }
  }
  if (action !== target.lane) return missBattle(state, timingOffsetMs, false)

  const perfect = Math.abs(timingOffsetMs) <= perfectWindow
  const triggered: string[] = []
  // 基礎計分固定：Perfect 2、其他命中 1、miss 0。構築可提供額外
  // bonus score，但不再用傷害或新音符改寫譜面。
  let damage = perfect ? 2 : 1
  let overloadGain = perfect ? 1 : 0
  let capacitorCharges = state.capacitorCharges
  let insuranceStacks = state.insuranceStacks
  let recentPerfect = perfect
    ? [...state.recentPerfect, action].slice(-3)
    : []
  const addedCenterBars = state.addedCenterBars
  let imperfectBars = state.imperfectBars
  let reedTriggersByBar = state.reedTriggersByBar

  const resonance = hasEffect(state.effects, 'alternating-perfect-echo')
  if (
    perfect &&
    resonance !== undefined &&
    oppositeSide(state.previousPerfectLane, action)
  ) {
    damage += value(resonance, 'echo_damage', 2)
    triggered.push(resonance.sourceId)
  }
  if (crossWindowActive && crossWindow !== undefined) {
    triggered.push(crossWindow.sourceId)
  }
  if (perfect && ratchetActive && ratchet !== undefined) {
    damage += value(ratchet, 'bonus_damage', 2)
    overloadGain += value(ratchet, 'bonus_overload', 1)
    triggered.push(ratchet.sourceId)
  }
  if (
    target.source === 'capacitor' ||
    target.source === 'capacitor-insurance'
  ) {
    const capacitor = hasEffect(
      state.effects,
      'convert-marked-rest-to-center-charge',
    )
    capacitorCharges = Math.min(
      value(capacitor, 'max_charges', 2),
      capacitorCharges + 1,
    )
    if (capacitor !== undefined) triggered.push(capacitor.sourceId)
  } else if (target.lane === 'center' && capacitorCharges > 0) {
    const capacitor = hasEffect(
      state.effects,
      'convert-marked-rest-to-center-charge',
    )
    damage +=
      capacitorCharges * value(capacitor, 'echo_damage_per_charge', 2)
    capacitorCharges = 0
    if (capacitor !== undefined) triggered.push(capacitor.sourceId)
  }
  if (
    target.source === 'insurance' ||
    target.source === 'capacitor-insurance'
  ) {
    insuranceStacks = 1
    const insurance = hasEffect(
      state.effects,
      'convert-marked-rest-to-center-insurance',
    )
    if (insurance !== undefined) triggered.push(insurance.sourceId)
  }
  const sequence = hasEffect(state.effects, 'three-lane-vulnerability')
  const sequenceKey = recentPerfect.join(',')
  if (
    sequence !== undefined &&
    (sequenceKey === 'left,right,center' ||
      sequenceKey === 'right,left,center')
  ) {
    damage += value(sequence, 'vulnerability_damage', 4)
    triggered.push(sequence.sourceId)
    recentPerfect = []
  }
  const reed = hasEffect(state.effects, 'late-perfect-echo')
  const targetBar = Math.floor(target.targetBeat / 4)
  const reedCount =
    reedTriggersByBar.find((entry) => entry.bar === targetBar)?.count ?? 0
  if (
    perfect &&
    timingOffsetMs > 0 &&
    reed !== undefined &&
    target.grammar.includes('syncopated') &&
    reedCount < value(reed, 'max_per_bar', 2)
  ) {
    damage += value(reed, 'echo_damage', 2)
    triggered.push(reed.sourceId)
    reedTriggersByBar = [
      ...reedTriggersByBar.filter((entry) => entry.bar !== targetBar),
      { bar: targetBar, count: reedCount + 1 },
    ]
  }
  const flywheel = hasEffect(
    state.effects,
    'forgive-now-add-center-next-bar',
  )
  if (!perfect && flywheel !== undefined) {
    // 原本的「下一小節加壓」會動態插入目標。固定譜面版本改為
    // 對穩定命中給一次額外分數，保留構築的可觀察收益。
    damage += value(flywheel, 'vulnerability_damage', 1)
    triggered.push(flywheel.sourceId)
  }
  if (!perfect && !imperfectBars.includes(targetBar)) {
    imperfectBars = [...imperfectBars, targetBar]
  }
  const kind = target.lane === 'center' ? 'center' : perfect ? 'perfect' : 'normal'
  const nextOverload = Math.min(5, state.overload + overloadGain)
  const earnedScore = damage
  const bossDefeated = state.bossDefeated || state.bossIntegrity - earnedScore <= 0
  return {
    ...state,
    cursor: state.cursor + 1,
    score: state.score + earnedScore,
    bossDefeated,
    bossIntegrity: bossDefeated
      ? 0
      : Math.max(0, state.bossIntegrity - earnedScore),
    overload: nextOverload,
    combo: state.combo + 1,
    previousPerfectLane: perfect ? action : null,
    previousResolvedLane: action,
    recentPerfect,
    capacitorCharges,
    insuranceStacks,
    addedCenterBars,
    imperfectBars,
    reedTriggersByBar,
    lastEvent: {
      kind,
      title:
        kind === 'center'
          ? perfect
            ? '完美重拍'
            : '中央震返'
          : perfect
            ? '完美反擊'
            : '普通反擊',
      detail:
        triggered.length > 0
          ? `觸發 ${triggered.length} 個構築效果`
          : perfect
            ? '超載上升'
            : '穩定接下攻擊',
      damage: earnedScore,
      triggered,
      timingOffsetMs,
    },
  }
}

export function advanceAutomaticBattleEffects(
  state: BattleRuntimeState,
): BattleRuntimeState {
  // Kept as a no-op compatibility hook for the renderer. Effects resolve on
  // their own fixed-chart target and never auto-consume or rewrite a target.
  return state
}

export function timeoutBattleTarget(
  state: BattleRuntimeState,
  timingOffsetMs: number,
): BattleRuntimeState {
  return missBattle(state, timingOffsetMs, true)
}
