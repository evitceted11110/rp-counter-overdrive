import {
  frequency,
  numericStats,
  rate,
  simulate,
  type NumericStats,
} from '@rogue-paradise/sim'
import { createRng, type Rng } from '@rogue-paradise/rng'
import bossesJson from '../content/bosses.json'
import itemsJson from '../content/items.json'
import patternsJson from '../content/rhythm-patterns.json'

export type Lane = 'left' | 'right' | 'center'
export type CoreId =
  | 'cross-resonance'
  | 'downbeat-capacitor'
  | 'steady-flywheel'
export type RouteId = 'repeat-route' | 'charge-route'

type Target = {
  step: number
  lane: Lane
}

type SimTarget = Target & {
  convertedRest?: boolean
}

type Pattern = {
  id: string
  name: string
  bars: number
  subdivision: number
  difficulty: number
  grammar: string[]
  route_tags: string[]
  allowed_encounters: number[]
  targets: Target[]
  marked_rest_steps: number[]
}

type Core = {
  id: CoreId
  family: string
  compatible_tags: string[]
}

type Passive = {
  id: string
  family: string
  compatible_tags: string[]
}

type Route = {
  id: RouteId
  pattern_tags: string[]
  reward_families: string[]
}

type Boss = {
  id: string
  encounter: number
  bpm: number
  integrity: number
  max_bars: number
  perfect_window_ms: number
  normal_window_ms: number
  opening_patterns: string[]
  required_grammar: string[]
  allowed_pattern_tags: string[]
  redline_patterns?: string[]
}

type DecisionCounts = {
  alternatingPursuits: number
  convertedRestCenters: number
  flywheelPressureAccepted: number
  ratchetRisks: number
  lateSyncopationHits: number
  recoverySimplifications: number
  threePhasePlans: number
}

type FightResult = {
  won: boolean
  targets: number
  bars: number
  timeMs: number
  perfect: number
  normal: number
  misses: number
  damage: number
  decisions: DecisionCounts
  coreTriggers: number
  passiveTriggers: Record<string, number>
  patternIds: string[]
}

export type GeneratedRunPlan = {
  route: RouteId
  encounterPatterns: Record<number, string[]>
}

export type PrototypeResult = {
  won: boolean
  core: CoreId
  route: RouteId
  playerSkill: number
  bossesCleared: number
  totalTargets: number
  totalBars: number
  totalTimeMs: number
  perfectCounters: number
  normalCounters: number
  misses: number
  selected: string[]
  buildSignature: string
  decisionCounts: DecisionCounts
  decisionSignature: string
  coreTriggers: number
  passiveTriggers: Record<string, number>
  patternIds: string[]
}

export type PrototypeSummary = {
  seed: string
  runs: number
  winRate: number
  clearStats: NumericStats
  timeStats: NumericStats
  winningTimeStats: NumericStats
  coreFrequency: Record<string, number>
  coreWinRate: Record<CoreId, number>
  winningCoreShare: Record<CoreId, number>
  winningPassiveInclusionRate: Record<string, number>
  passiveTriggerCount: Record<string, number>
  routeByCore: Record<CoreId, Record<string, number>>
  decisionProfileByCore: Record<CoreId, DecisionCounts>
  differentDecisionPairs: number
  legalPatternViolations: string[]
  winningBuildFrequency: Record<string, number>
  topFiveBuildShare: number
  determinismDigest: string
}

const patterns = patternsJson.patterns as Pattern[]
const bosses = bossesJson.bosses as Boss[]
const routes = bossesJson.routes as Route[]
const cores = itemsJson.cores as Core[]
const passives = itemsJson.passives as Passive[]
const lanes: readonly Lane[] = ['left', 'right', 'center']
const coreIds = cores.map((core) => core.id)
const passiveIds = passives.map((passive) => passive.id)

const zeroDecisions = (): DecisionCounts => ({
  alternatingPursuits: 0,
  convertedRestCenters: 0,
  flywheelPressureAccepted: 0,
  ratchetRisks: 0,
  lateSyncopationHits: 0,
  recoverySimplifications: 0,
  threePhasePlans: 0,
})

function addDecisions(target: DecisionCounts, source: DecisionCounts): void {
  for (const key of Object.keys(target) as (keyof DecisionCounts)[]) {
    target[key] += source[key]
  }
}

function has(items: readonly string[], id: string): boolean {
  return items.includes(id)
}

function getPattern(id: string): Pattern {
  const pattern = patterns.find((candidate) => candidate.id === id)
  if (pattern === undefined) throw new Error(`未知節奏模板：${id}`)
  return pattern
}

function getCore(id: CoreId): Core {
  const core = cores.find((candidate) => candidate.id === id)
  if (core === undefined) throw new Error(`未知核心：${id}`)
  return core
}

function getRoute(id: RouteId): Route {
  const route = routes.find((candidate) => candidate.id === id)
  if (route === undefined) throw new Error(`未知路線：${id}`)
  return route
}

function maxConsecutiveSteps(pattern: Pattern): number {
  if (pattern.targets.length === 0) return 0
  const steps = [...new Set(pattern.targets.map((target) => target.step))].sort(
    (left, right) => left - right,
  )
  let longest = 1
  let current = 1
  for (let index = 1; index < steps.length; index += 1) {
    if ((steps[index] ?? 0) === (steps[index - 1] ?? 0) + 1) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }
  return longest
}

export function validateContent(): string[] {
  const violations: string[] = []
  const ids = new Set<string>()

  for (const pattern of patterns) {
    if (ids.has(pattern.id)) violations.push(`重複模板 id：${pattern.id}`)
    ids.add(pattern.id)
    const totalSteps = pattern.bars * pattern.subdivision
    let previousStep = -1
    for (const target of pattern.targets) {
      if (!lanes.includes(target.lane)) {
        violations.push(`${pattern.id} 使用非法軌道 ${target.lane}`)
      }
      if (target.step < 0 || target.step >= totalSteps) {
        violations.push(`${pattern.id} 的 step ${target.step} 超出小節`)
      }
      if (target.step < previousStep) {
        violations.push(`${pattern.id} 的目標沒有按 step 排序`)
      }
      previousStep = target.step
    }
    for (const rest of pattern.marked_rest_steps) {
      if (rest < 0 || rest >= totalSteps) {
        violations.push(`${pattern.id} 的空拍 ${rest} 超出小節`)
      }
      if (pattern.targets.some((target) => target.step === rest)) {
        violations.push(`${pattern.id} 的 step ${rest} 同時是目標與空拍`)
      }
    }
    if (
      pattern.allowed_encounters.includes(1) &&
      (pattern.subdivision !== 4 ||
        pattern.targets.some((target) => target.lane === 'center'))
    ) {
      violations.push(`${pattern.id} 違反戰 1 左右四分音符限制`)
    }
    if (
      pattern.allowed_encounters.includes(2) &&
      pattern.grammar.includes('syncopated')
    ) {
      violations.push(`${pattern.id} 在戰 2 提前使用切分`)
    }
    if (
      pattern.allowed_encounters.includes(3) &&
      maxConsecutiveSteps(pattern) > 4
    ) {
      violations.push(`${pattern.id} 超過四個連續八分目標`)
    }
    for (const encounter of pattern.allowed_encounters) {
      if (encounter < 1 || encounter > 3) {
        violations.push(`${pattern.id} 使用非法 encounter ${encounter}`)
      }
    }
  }

  if (cores.length !== 3) violations.push(`核心數量應為 3，實際 ${cores.length}`)
  if (passives.length !== 6) {
    violations.push(`被動數量應為 6，實際 ${passives.length}`)
  }
  if (bosses.length !== 3) violations.push(`Boss 數量應為 3，實際 ${bosses.length}`)

  for (const boss of bosses) {
    for (const id of boss.opening_patterns) {
      if (!ids.has(id)) violations.push(`${boss.id} 使用未知開場模板 ${id}`)
      else if (!getPattern(id).allowed_encounters.includes(boss.encounter)) {
        violations.push(`${boss.id} 的開場模板 ${id} 不允許用於本戰`)
      }
    }
    for (const id of boss.redline_patterns ?? []) {
      if (!ids.has(id)) violations.push(`${boss.id} 使用未知紅線模板 ${id}`)
    }
  }
  return violations
}

function patternMatchesRoute(pattern: Pattern, route: Route): boolean {
  return pattern.route_tags.some((tag) => route.pattern_tags.includes(tag))
}

function chooseRoute(rng: Rng, core: Core): RouteId {
  let best = routes[0]
  let bestScore = Number.NEGATIVE_INFINITY
  for (const route of routes) {
    const compatibility = core.compatible_tags.some((tag) =>
      route.pattern_tags.includes(tag),
    )
    const score = (compatibility ? 1.3 : 0) + rng.next() * 2.5
    if (score > bestScore) {
      best = route
      bestScore = score
    }
  }
  if (best === undefined) throw new Error('沒有可用路線')
  return best.id
}

function legalPool(boss: Boss, route: Route): Pattern[] {
  const allowed = patterns.filter(
    (pattern) =>
      pattern.allowed_encounters.includes(boss.encounter) &&
      pattern.route_tags.some((tag) => boss.allowed_pattern_tags.includes(tag)) &&
      !pattern.grammar.includes('redline'),
  )
  if (boss.encounter === 1) return allowed
  const routePool = allowed.filter((pattern) => patternMatchesRoute(pattern, route))
  return routePool.length > 0 ? routePool : allowed
}

function generateEncounterPatterns(
  rng: Rng,
  boss: Boss,
  route: Route,
): string[] {
  const sequence = [...boss.opening_patterns]
  const pool = legalPool(boss, route)
  const covered = new Set(
    sequence.flatMap((id) => getPattern(id).grammar),
  )
  for (const grammar of boss.required_grammar) {
    if (covered.has(grammar) || grammar === 'redline') continue
    const candidates = pool.filter((pattern) => pattern.grammar.includes(grammar))
    if (candidates.length > 0) {
      const selected = rng.pick(candidates)
      sequence.push(selected.id)
      for (const item of selected.grammar) covered.add(item)
    }
  }

  const redline =
    boss.redline_patterns === undefined
      ? undefined
      : rng.pick(
          boss.redline_patterns
            .map(getPattern)
            .filter((pattern) => patternMatchesRoute(pattern, route)),
        )
  const reservedBars = redline?.bars ?? 0
  let barsUsed = sequence.reduce(
    (sum, id) => sum + getPattern(id).bars,
    0,
  )
  while (barsUsed < boss.max_bars - reservedBars) {
    const candidates = pool.filter(
      (pattern) => barsUsed + pattern.bars <= boss.max_bars - reservedBars,
    )
    if (candidates.length === 0) break
    const selected = rng.pick(candidates)
    sequence.push(selected.id)
    barsUsed += selected.bars
  }
  if (redline !== undefined) sequence.push(redline.id)
  return sequence
}

export function generateRunPlan(seed: string, coreId: CoreId): GeneratedRunPlan {
  const rng = createRng(seed)
  const core = getCore(coreId)
  const route = chooseRoute(rng.fork('route'), core)
  const routeData = getRoute(route)
  const encounterPatterns = Object.fromEntries(
    bosses.map((boss) => [
      boss.encounter,
      generateEncounterPatterns(
        rng.fork(`encounter-${boss.encounter}`),
        boss,
        routeData,
      ),
    ]),
  )
  return { route, encounterPatterns }
}

function passiveScore(
  passive: Passive,
  core: Core,
  route: Route,
  rng: Rng,
): number {
  const coreFit = passive.compatible_tags.some((tag) =>
    core.compatible_tags.includes(tag),
  )
  const routeFit = passive.compatible_tags.some((tag) =>
    route.pattern_tags.includes(tag),
  )
  return (coreFit ? 0.5 : 0) + (routeFit ? 0.35 : 0) + rng.next() * 4
}

function choosePassive(
  rng: Rng,
  core: Core,
  route: Route,
  owned: readonly string[],
): string {
  const available = passives.filter((passive) => !owned.includes(passive.id))
  const compatible = available.filter((passive) =>
    passive.compatible_tags.some((tag) => core.compatible_tags.includes(tag)),
  )
  const offer = rng.shuffle(available).slice(0, 3)
  if (
    compatible.length > 0 &&
    !offer.some((passive) => compatible.includes(passive))
  ) {
    offer[0] = rng.pick(compatible)
  }
  let best = offer[0]
  if (best === undefined) throw new Error('沒有可選的被動')
  let bestScore = passiveScore(best, core, route, rng)
  for (const candidate of offer.slice(1)) {
    const score = passiveScore(candidate, core, route, rng)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best.id
}

function isOppositeSide(left: Lane | null, right: Lane): boolean {
  return (
    (left === 'left' && right === 'right') ||
    (left === 'right' && right === 'left')
  )
}

function isThreePhase(lanesToCheck: readonly Lane[]): boolean {
  if (lanesToCheck.length < 3) return false
  const tail = lanesToCheck.slice(-3).join(',')
  return tail === 'left,right,center' || tail === 'right,left,center'
}

function simplifiedTargets(pattern: Pattern): Target[] {
  const sideTargets = pattern.targets
    .filter((target) => target.lane !== 'center')
    .slice(0, 2)
  if (sideTargets.length > 0) return sideTargets
  return [{ step: 0, lane: 'left' }]
}

function resolveFight(
  rng: Rng,
  boss: Boss,
  patternIds: readonly string[],
  core: Core,
  selected: readonly string[],
  playerSkill: number,
): FightResult {
  let bossIntegrity = boss.integrity
  let playerIntegrity = 6
  let protectedMisses = boss.encounter === 1 ? 3 : 0
  let perfect = 0
  let normal = 0
  let misses = 0
  let damage = 0
  let targets = 0
  let bars = 0
  let coreTriggers = 0
  let capacitorCharges = 0
  let insurance = false
  let flywheelPressure = false
  let circuitBreakerCharges = has(selected, 'circuit-breaker') ? 2 : 0
  let simplifyNext = false
  let lastPerfectLane: Lane | null = null
  let conductorLane: Lane | null = null
  const perfectLaneHistory: Lane[] = []
  const decisions = zeroDecisions()
  const passiveTriggers = Object.fromEntries(
    passiveIds.map((id) => [id, 0]),
  )
  const usedPatternIds: string[] = []

  for (const patternId of patternIds) {
    if (bossIntegrity <= 0 || playerIntegrity <= 0) break
    const pattern = getPattern(patternId)
    usedPatternIds.push(pattern.id)
    bars += pattern.bars
    let patternDamage = 0
    let patternAllPerfect = true
    let previousTargetLane: Lane | null = null
    let previousWasPerfect = false
    const usesSimplified = simplifyNext
    if (usesSimplified) {
      simplifyNext = false
      decisions.recoverySimplifications += 1
      passiveTriggers['circuit-breaker'] =
        (passiveTriggers['circuit-breaker'] ?? 0) + 1
    }

    const baseTargets: SimTarget[] = usesSimplified
      ? simplifiedTargets(pattern)
      : [...pattern.targets]
    if (!usesSimplified) {
      for (const restStep of pattern.marked_rest_steps) {
        const capacitorCanConvert =
          core.id === 'downbeat-capacitor' && capacitorCharges < 2
        const insuranceCanConvert =
          has(selected, 'rest-insurance') && !insurance
        if (capacitorCanConvert || insuranceCanConvert) {
          baseTargets.push({
            step: restStep,
            lane: 'center',
            convertedRest: true,
          })
          decisions.convertedRestCenters += 1
        }
      }
    }
    if (flywheelPressure) {
      baseTargets.push({
        step: pattern.bars * pattern.subdivision - 1,
        lane: 'center',
      })
      baseTargets.sort((left, right) => left.step - right.step)
      flywheelPressure = false
    }

    for (const target of baseTargets) {
      if (bossIntegrity <= 0 || playerIntegrity <= 0) break
      targets += 1
      const alternating =
        isOppositeSide(previousTargetLane, target.lane) ||
        isOppositeSide(lastPerfectLane, target.lane)
      if (core.id === 'cross-resonance' && alternating) {
        decisions.alternatingPursuits += 1
      }

      const ratchetOpportunity =
        has(selected, 'same-side-ratchet') &&
        previousWasPerfect &&
        previousTargetLane === target.lane
      const takeRatchetRisk = ratchetOpportunity && rng.next() < 0.78
      if (takeRatchetRisk) decisions.ratchetRisks += 1

      const conductorBonus =
        has(selected, 'cross-conductor') &&
        isOppositeSide(conductorLane, target.lane)
          ? 0.035
          : 0
      const encounterPenalty = (boss.encounter - 1) * 0.012
      const normalChance = Math.min(
        0.985,
        playerSkill +
          0.17 +
          conductorBonus -
          pattern.difficulty * 0.62 -
          encounterPenalty -
          (takeRatchetRisk ? 0.025 : 0),
      )
      const perfectChance = Math.min(
        normalChance - 0.08,
        playerSkill -
          0.27 -
          pattern.difficulty * 0.35 -
          encounterPenalty +
          (takeRatchetRisk ? 0.055 : 0),
      )
      const roll = rng.next()

      if (roll < perfectChance) {
        perfect += 1
        previousWasPerfect = true
        perfectLaneHistory.push(target.lane)
        if (perfectLaneHistory.length > 3) perfectLaneHistory.shift()
        let hitDamage = 1

        if (
          core.id === 'cross-resonance' &&
          isOppositeSide(lastPerfectLane, target.lane)
        ) {
          hitDamage += 0.85
          coreTriggers += 1
        }
        if (target.convertedRest === true) {
          hitDamage = 0
          if (
            core.id === 'downbeat-capacitor' &&
            capacitorCharges < 2
          ) {
            capacitorCharges += 1
            coreTriggers += 1
          }
          if (has(selected, 'rest-insurance') && !insurance) {
            insurance = true
            passiveTriggers['rest-insurance'] =
              (passiveTriggers['rest-insurance'] ?? 0) + 1
          }
        } else if (
          core.id === 'downbeat-capacitor' &&
          target.lane === 'center'
        ) {
          hitDamage += capacitorCharges * 0.9
          if (capacitorCharges > 0) coreTriggers += 1
          capacitorCharges = 0
        }
        if (takeRatchetRisk) {
          hitDamage += 1
          passiveTriggers['same-side-ratchet'] =
            (passiveTriggers['same-side-ratchet'] ?? 0) + 1
        }
        if (
          has(selected, 'delay-reed') &&
          pattern.grammar.includes('syncopated') &&
          rng.next() < 0.62
        ) {
          hitDamage += 1
          decisions.lateSyncopationHits += 1
          passiveTriggers['delay-reed'] =
            (passiveTriggers['delay-reed'] ?? 0) + 1
        }
        if (
          has(selected, 'three-phase-sequence') &&
          isThreePhase(perfectLaneHistory)
        ) {
          hitDamage += 2
          decisions.threePhasePlans += 1
          passiveTriggers['three-phase-sequence'] =
            (passiveTriggers['three-phase-sequence'] ?? 0) + 1
          perfectLaneHistory.length = 0
        }
        if (
          has(selected, 'cross-conductor') &&
          isOppositeSide(conductorLane, target.lane)
        ) {
          passiveTriggers['cross-conductor'] =
            (passiveTriggers['cross-conductor'] ?? 0) + 1
        }
        conductorLane = target.lane === 'center' ? null : target.lane
        lastPerfectLane = target.lane
        patternDamage += hitDamage
      } else if (roll < normalChance) {
        normal += 1
        previousWasPerfect = false
        patternAllPerfect = false
        perfectLaneHistory.length = 0
        conductorLane = null
        lastPerfectLane = null
        patternDamage +=
          target.convertedRest === true
            ? 0
            : usesSimplified
              ? 0.4
              : 0.65
        if (target.convertedRest === true) {
          if (
            core.id === 'downbeat-capacitor' &&
            capacitorCharges < 2
          ) {
            capacitorCharges += 1
            coreTriggers += 1
          }
          if (has(selected, 'rest-insurance') && !insurance) {
            insurance = true
            passiveTriggers['rest-insurance'] =
              (passiveTriggers['rest-insurance'] ?? 0) + 1
          }
        }
        if (core.id === 'steady-flywheel' && !flywheelPressure) {
          flywheelPressure = true
          coreTriggers += 1
          decisions.flywheelPressureAccepted += 1
        }
      } else if (insurance) {
        insurance = false
        normal += 1
        previousWasPerfect = false
        patternAllPerfect = false
        perfectLaneHistory.length = 0
        conductorLane = null
        lastPerfectLane = null
        patternDamage += 0.5
      } else {
        misses += 1
        previousWasPerfect = false
        patternAllPerfect = false
        perfectLaneHistory.length = 0
        conductorLane = null
        lastPerfectLane = null
        if (protectedMisses > 0) protectedMisses -= 1
        else playerIntegrity -= 1
        if (circuitBreakerCharges > 0 && !simplifyNext) {
          circuitBreakerCharges -= 1
          simplifyNext = true
        }
      }
      previousTargetLane = target.lane
    }

    if (
      core.id === 'steady-flywheel' &&
      patternAllPerfect &&
      pattern.targets.length > 0
    ) {
      patternDamage += 0.1
      coreTriggers += 1
    }
    damage += patternDamage
    bossIntegrity -= patternDamage
  }

  return {
    won: bossIntegrity <= 0 && playerIntegrity > 0,
    targets,
    bars,
    timeMs: bars * (240_000 / boss.bpm),
    perfect,
    normal,
    misses,
    damage,
    decisions,
    coreTriggers,
    passiveTriggers,
    patternIds: usedPatternIds,
  }
}

function decisionSignature(decisions: DecisionCounts): string {
  const entries = Object.entries(decisions).filter(([, value]) => value > 0)
  if (entries.length === 0) return 'baseline'
  return entries
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `${key}:${value}`)
    .join('|')
}

function runWithRng(rng: Rng, forcedCoreId?: CoreId): PrototypeResult {
  const core = getCore(forcedCoreId ?? rng.pick(coreIds))
  const playerSkill = 0.78 + rng.next() * 0.12
  const routeId = chooseRoute(rng.fork('route'), core)
  const route = getRoute(routeId)
  const selected: string[] = []
  const decisions = zeroDecisions()
  const passiveTriggers = Object.fromEntries(
    passiveIds.map((id) => [id, 0]),
  )
  const usedPatterns: string[] = []
  let bossesCleared = 0
  let totalTargets = 0
  let totalBars = 0
  let totalTimeMs = 0
  let perfectCounters = 0
  let normalCounters = 0
  let misses = 0
  let coreTriggers = 0

  for (const boss of bosses) {
    const patternIds = generateEncounterPatterns(
      rng.fork(`patterns-${boss.encounter}`),
      boss,
      route,
    )
    const result = resolveFight(
      rng.fork(`fight-${boss.encounter}`),
      boss,
      patternIds,
      core,
      selected,
      playerSkill,
    )
    totalTargets += result.targets
    totalBars += result.bars
    totalTimeMs += result.timeMs
    perfectCounters += result.perfect
    normalCounters += result.normal
    misses += result.misses
    coreTriggers += result.coreTriggers
    addDecisions(decisions, result.decisions)
    usedPatterns.push(...result.patternIds)
    for (const id of passiveIds) {
      passiveTriggers[id] =
        (passiveTriggers[id] ?? 0) + (result.passiveTriggers[id] ?? 0)
    }
    if (!result.won) break
    bossesCleared += 1
    if (bossesCleared < bosses.length) {
      selected.push(
        choosePassive(
          rng.fork(`draft-${bossesCleared}`),
          core,
          route,
          selected,
        ),
      )
      totalTimeMs += bossesCleared === 1 ? 55_000 : 30_000
    }
  }

  totalTimeMs += 77_000
  return {
    won: bossesCleared === bosses.length,
    core: core.id,
    route: route.id,
    playerSkill,
    bossesCleared,
    totalTargets,
    totalBars,
    totalTimeMs,
    perfectCounters,
    normalCounters,
    misses,
    selected,
    buildSignature: `${core.id}:${route.id}:${[...selected].sort().join('+')}`,
    decisionCounts: decisions,
    decisionSignature: decisionSignature(decisions),
    coreTriggers,
    passiveTriggers,
    patternIds: usedPatterns,
  }
}

export function runSeedWithCore(seed: string, coreId: CoreId): PrototypeResult {
  return runWithRng(createRng(seed), coreId)
}

export function runOnce(rng: Rng): PrototypeResult {
  return runWithRng(rng)
}

function averagedDecisionProfile(
  results: readonly PrototypeResult[],
): DecisionCounts {
  const profile = zeroDecisions()
  if (results.length === 0) return profile
  for (const result of results) addDecisions(profile, result.decisionCounts)
  for (const key of Object.keys(profile) as (keyof DecisionCounts)[]) {
    profile[key] /= results.length
  }
  return profile
}

function dominantDecision(profile: DecisionCounts): keyof DecisionCounts {
  const entries = Object.entries(profile) as [keyof DecisionCounts, number][]
  entries.sort((left, right) => right[1] - left[1])
  return entries[0]?.[0] ?? 'alternatingPursuits'
}

export function runPrototype(
  runs: number,
  seed = 'counter-overdrive-gate-2-v2',
): PrototypeSummary {
  const report = simulate((rng) => runOnce(rng), { seed, runs })
  const wins = report.results.filter((result) => result.won)
  const coreFrequency = frequency(report.results.map((result) => result.core))
  const coreWinRate = Object.fromEntries(
    coreIds.map((coreId) => [
      coreId,
      rate(
        report.results
          .filter((result) => result.core === coreId)
          .map((result) => result.won),
      ),
    ]),
  ) as Record<CoreId, number>
  const winningCoreShare = Object.fromEntries(
    coreIds.map((coreId) => [
      coreId,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.core === coreId).length / wins.length,
    ]),
  ) as Record<CoreId, number>
  const winningPassiveInclusionRate = Object.fromEntries(
    passiveIds.map((id) => [
      id,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.selected.includes(id)).length /
          wins.length,
    ]),
  )
  const passiveTriggerCount = Object.fromEntries(
    passiveIds.map((id) => [
      id,
      report.results.reduce(
        (sum, result) => sum + (result.passiveTriggers[id] ?? 0),
        0,
      ),
    ]),
  )
  const routeByCore = Object.fromEntries(
    coreIds.map((coreId) => [
      coreId,
      frequency(
        report.results
          .filter((result) => result.core === coreId)
          .map((result) => result.route),
      ),
    ]),
  ) as Record<CoreId, Record<string, number>>
  const decisionProfileByCore = Object.fromEntries(
    coreIds.map((coreId) => [
      coreId,
      averagedDecisionProfile(
        report.results.filter((result) => result.core === coreId),
      ),
    ]),
  ) as Record<CoreId, DecisionCounts>
  let differentDecisionPairs = 0
  for (let left = 0; left < coreIds.length; left += 1) {
    for (let right = left + 1; right < coreIds.length; right += 1) {
      const leftId = coreIds[left]
      const rightId = coreIds[right]
      if (
        leftId !== undefined &&
        rightId !== undefined &&
        dominantDecision(decisionProfileByCore[leftId]) !==
          dominantDecision(decisionProfileByCore[rightId])
      ) {
        differentDecisionPairs += 1
      }
    }
  }
  const winningBuildFrequency = frequency(
    wins.map((result) => result.buildSignature),
  )
  const topFiveWins = Object.values(winningBuildFrequency)
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0)
  const digestSource = report.results
    .slice(0, 32)
    .map(
      (result) =>
        `${result.core}:${result.route}:${result.bossesCleared}:${result.totalTargets}:${result.decisionSignature}`,
    )
    .join('|')

  return {
    seed,
    runs,
    winRate: rate(report.results.map((result) => result.won)),
    clearStats: numericStats(
      report.results.map((result) => result.bossesCleared),
    ),
    timeStats: numericStats(report.results.map((result) => result.totalTimeMs)),
    winningTimeStats: numericStats(
      wins.map((result) => result.totalTimeMs),
    ),
    coreFrequency,
    coreWinRate,
    winningCoreShare,
    winningPassiveInclusionRate,
    passiveTriggerCount,
    routeByCore,
    decisionProfileByCore,
    differentDecisionPairs,
    legalPatternViolations: validateContent(),
    winningBuildFrequency,
    topFiveBuildShare: wins.length === 0 ? 0 : topFiveWins,
    determinismDigest: digestSource,
  }
}
