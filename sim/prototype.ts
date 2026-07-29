import {
  frequency,
  numericStats,
  rate,
  simulate,
  type NumericStats,
} from '@rogue-paradise/sim'
import type { Rng } from '@rogue-paradise/rng'

export type Family = 'counter-chain' | 'flywheel' | 'vent' | 'phase'

type Upgrade = {
  id: string
  family: Family
}

type Boss = {
  id: string
  integrity: number
  attacks: number
  difficulty: number
  breachRate: number
}

export type PrototypeResult = {
  won: boolean
  family: Family
  playerAccuracy: number
  bossesCleared: number
  totalAttacks: number
  totalTimeMs: number
  perfectCounters: number
  normalCounters: number
  misses: number
  averageThreat: number
  peakThreat: number
  coreCasts: number
  highThreatAttacks: number
  buildSignature: string
  selected: string[]
}

export type PrototypeSummary = {
  seed: string
  runs: number
  winRate: number
  clearStats: NumericStats
  averageThreatStats: NumericStats
  familyFrequency: Record<string, number>
  familyWinRate: Record<Family, number>
  winningCoreShare: Record<Family, number>
  winningUpgradeInclusionRate: Record<string, number>
  winningBuildFrequency: Record<string, number>
  topFiveBuildShare: number
  meanAttacksToWinByFamily: Record<Family, number>
  meanClearTimeMsByFamily: Record<Family, number>
  determinismDigest: string
}

const families: readonly Family[] = [
  'counter-chain',
  'flywheel',
  'vent',
  'phase',
]

const upgrades: readonly Upgrade[] = [
  { id: 'return-splitter', family: 'counter-chain' },
  { id: 'pulse-memory', family: 'counter-chain' },
  { id: 'opposite-echo', family: 'counter-chain' },
  { id: 'minimum-flywheel', family: 'flywheel' },
  { id: 'error-clutch', family: 'flywheel' },
  { id: 'redline-lock', family: 'flywheel' },
  { id: 'vent-shockwave', family: 'vent' },
  { id: 'cooling-window', family: 'vent' },
  { id: 'emergency-vent', family: 'vent' },
  { id: 'phase-afterimage', family: 'phase' },
  { id: 'phase-refraction', family: 'phase' },
  { id: 'static-veil', family: 'phase' },
]

const bosses: readonly Boss[] = [
  { id: 'prism-1', integrity: 60, attacks: 13, difficulty: 0, breachRate: 0.06 },
  { id: 'offbeat-1', integrity: 68, attacks: 14, difficulty: 0.02, breachRate: 0.08 },
  { id: 'prism-2', integrity: 78, attacks: 15, difficulty: 0.03, breachRate: 0.09 },
  { id: 'offbeat-2', integrity: 88, attacks: 17, difficulty: 0.04, breachRate: 0.11 },
  { id: 'prism-3', integrity: 100, attacks: 19, difficulty: 0.05, breachRate: 0.13 },
  { id: 'core-director', integrity: 118, attacks: 23, difficulty: 0.06, breachRate: 0.15 },
]

const threatIntervals = [900, 810, 720, 630, 540, 450] as const

function has(selected: readonly string[], id: string): boolean {
  return selected.includes(id)
}

function chooseUpgrade(
  rng: Rng,
  family: Family,
  owned: readonly string[],
): string {
  const available = upgrades.filter((upgrade) => !owned.includes(upgrade.id))
  const offer = rng.shuffle(available).slice(0, 3)
  let best = offer[0]
  if (best === undefined) throw new Error('沒有可選的模組')
  for (const candidate of offer.slice(1)) {
    const bestScore = (best.family === family ? 3 : 0) + rng.next()
    const candidateScore =
      (candidate.family === family ? 3 : 0) + rng.next()
    if (candidateScore > bestScore) best = candidate
  }
  return best.id
}

function resolveBoss(
  rng: Rng,
  boss: Boss,
  family: Family,
  playerAccuracy: number,
  selected: readonly string[],
): {
  won: boolean
  attacks: number
  timeMs: number
  perfect: number
  normal: number
  misses: number
  threatTotal: number
  peakThreat: number
  coreCasts: number
  highThreatAttacks: number
} {
  let playerIntegrity = 6
  let bossIntegrity = boss.integrity
  let threat = 0
  let phase = 2
  let attacks = 0
  let timeMs = 0
  let perfect = 0
  let normal = 0
  let misses = 0
  let threatTotal = 0
  let peakThreat = 0
  let coreCasts = 0
  let highThreatAttacks = 0
  let emergencyVentAvailable = has(selected, 'emergency-vent')
  let staticVeilAvailable = has(selected, 'static-veil')
  let phaseGuaranteesPerfect = false
  let coolingAttacks = 0

  for (let index = 0; index < boss.attacks; index += 1) {
    if (playerIntegrity <= 0 || bossIntegrity <= 0) break
    attacks += 1
    timeMs += threatIntervals[threat] ?? threatIntervals[0]
    threatTotal += threat
    peakThreat = Math.max(peakThreat, threat)
    if (threat >= 4) highThreatAttacks += 1

    if (rng.next() < boss.breachRate) {
      if (phase > 0) {
        phase -= 1
        if (has(selected, 'phase-afterimage')) bossIntegrity -= 8
        if (has(selected, 'phase-refraction')) phaseGuaranteesPerfect = true
      } else {
        playerIntegrity -= 1
        misses += 1
        threat = Math.max(has(selected, 'minimum-flywheel') ? 1 : 0, threat - 2)
      }
      continue
    }

    const effectiveThreat = coolingAttacks > 0 ? 0 : threat
    if (coolingAttacks > 0) coolingAttacks -= 1
    const familyPrecision =
      family === 'counter-chain' ? 0.015 : family === 'flywheel' ? -0.005 : 0
    const normalChance = Math.min(
      0.97,
      playerAccuracy +
        0.2 +
        familyPrecision -
        effectiveThreat * 0.018 -
        boss.difficulty,
    )
    const perfectChance = Math.min(
      normalChance - 0.05,
      playerAccuracy -
        0.11 +
        familyPrecision -
        effectiveThreat * 0.025 -
        boss.difficulty,
    )
    const roll = rng.next()

    if (phaseGuaranteesPerfect || roll < perfectChance) {
      phaseGuaranteesPerfect = false
      perfect += 1
      bossIntegrity -= 6 + threat * 2
      if (
        has(selected, 'opposite-echo') &&
        perfect % 2 === 0
      ) {
        bossIntegrity -= 4
      }
      threat = Math.min(5, threat + 1)
    } else if (roll < normalChance) {
      normal += 1
      bossIntegrity -= 4
    } else if (staticVeilAvailable && phase > 0) {
      staticVeilAvailable = false
      phase -= 1
    } else {
      misses += 1
      playerIntegrity -= 1
      const threatLoss = has(selected, 'error-clutch') ? 1 : 2
      threat = Math.max(
        has(selected, 'minimum-flywheel') ? 1 : 0,
        threat - threatLoss,
      )
      if (
        playerIntegrity <= 0 &&
        emergencyVentAvailable &&
        threat >= 4
      ) {
        emergencyVentAvailable = false
        playerIntegrity = 1
        threat = 0
      }
    }

    const shouldCast =
      (family === 'counter-chain' && threat >= 5) ||
      (family === 'flywheel' && playerIntegrity <= 2 && threat >= 3) ||
      (family === 'vent' && threat >= 3) ||
      (family === 'phase' && phase === 0 && threat >= 4)

    if (shouldCast) {
      coreCasts += 1
      if (family === 'counter-chain') bossIntegrity -= 7
      if (family === 'flywheel') {
        bossIntegrity -= 6
        coolingAttacks = 1
      }
      if (family === 'vent') {
        bossIntegrity -= 5
        playerIntegrity = Math.min(6, playerIntegrity + 1)
      }
      if (family === 'phase') {
        bossIntegrity -= 6
        phase += 1
      }
      if (has(selected, 'vent-shockwave')) bossIntegrity -= threat * 3
      if (has(selected, 'cooling-window')) coolingAttacks = 2
      threat = family === 'flywheel' ? 1 : 0
    }
  }

  return {
    won: bossIntegrity <= 0 && playerIntegrity > 0,
    attacks,
    timeMs,
    perfect,
    normal,
    misses,
    threatTotal,
    peakThreat,
    coreCasts,
    highThreatAttacks,
  }
}

export function runOnce(rng: Rng): PrototypeResult {
  const family = rng.pick(families)
  const playerAccuracy = 0.685 + rng.next() * 0.08
  const selected: string[] = []
  let bossesCleared = 0
  let totalAttacks = 0
  let totalTimeMs = 0
  let perfectCounters = 0
  let normalCounters = 0
  let misses = 0
  let threatTotal = 0
  let peakThreat = 0
  let coreCasts = 0
  let highThreatAttacks = 0

  for (const boss of bosses) {
    const result = resolveBoss(
      rng.fork(`boss-${boss.id}`),
      boss,
      family,
      playerAccuracy,
      selected,
    )
    totalAttacks += result.attacks
    totalTimeMs += result.timeMs
    perfectCounters += result.perfect
    normalCounters += result.normal
    misses += result.misses
    threatTotal += result.threatTotal
    peakThreat = Math.max(peakThreat, result.peakThreat)
    coreCasts += result.coreCasts
    highThreatAttacks += result.highThreatAttacks
    if (!result.won) break
    bossesCleared += 1
    if (bossesCleared < bosses.length) {
      selected.push(
        chooseUpgrade(
          rng.fork(`draft-${bossesCleared}`),
          family,
          selected,
        ),
      )
      if (selected.length > 4) selected.shift()
    }
  }

  return {
    won: bossesCleared === bosses.length,
    family,
    playerAccuracy,
    bossesCleared,
    totalAttacks,
    totalTimeMs,
    perfectCounters,
    normalCounters,
    misses,
    averageThreat: totalAttacks === 0 ? 0 : threatTotal / totalAttacks,
    peakThreat,
    coreCasts,
    highThreatAttacks,
    buildSignature: `${family}:${[...selected].sort().join('+')}`,
    selected,
  }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function runPrototype(
  runs: number,
  seed = 'counter-overdrive-gate-2-v1',
): PrototypeSummary {
  const report = simulate((rng) => runOnce(rng), { seed, runs })
  const wins = report.results.filter((result) => result.won)
  const familyFrequency = frequency(
    report.results.map((result) => result.family),
  )
  const familyWinRate = Object.fromEntries(
    families.map((family) => [
      family,
      rate(
        report.results
          .filter((result) => result.family === family)
          .map((result) => result.won),
      ),
    ]),
  ) as Record<Family, number>
  const winningCoreShare = Object.fromEntries(
    families.map((family) => [
      family,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.family === family).length /
          wins.length,
    ]),
  ) as Record<Family, number>
  const winningUpgradeInclusionRate = Object.fromEntries(
    upgrades.map((upgrade) => [
      upgrade.id,
      wins.length === 0
        ? 0
        : wins.filter((result) => result.selected.includes(upgrade.id)).length /
          wins.length,
    ]),
  )
  const winningBuildFrequency = frequency(
    wins.map((result) => result.buildSignature),
  )
  const topFiveWins = Object.values(winningBuildFrequency)
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0)
  const meanAttacksToWinByFamily = Object.fromEntries(
    families.map((family) => [
      family,
      mean(
        wins
          .filter((result) => result.family === family)
          .map((result) => result.totalAttacks),
      ),
    ]),
  ) as Record<Family, number>
  const meanClearTimeMsByFamily = Object.fromEntries(
    families.map((family) => [
      family,
      mean(
        wins
          .filter((result) => result.family === family)
          .map((result) => result.totalTimeMs),
      ),
    ]),
  ) as Record<Family, number>
  const digestSource = report.results
    .slice(0, 32)
    .map(
      (result) =>
        `${result.family}:${result.bossesCleared}:${result.totalAttacks}:${result.perfectCounters}`,
    )
    .join('|')

  return {
    seed,
    runs,
    winRate: rate(report.results.map((result) => result.won)),
    clearStats: numericStats(
      report.results.map((result) => result.bossesCleared),
    ),
    averageThreatStats: numericStats(
      report.results.map((result) => result.averageThreat),
    ),
    familyFrequency,
    familyWinRate,
    winningCoreShare,
    winningUpgradeInclusionRate,
    winningBuildFrequency,
    topFiveBuildShare: wins.length === 0 ? 0 : topFiveWins,
    meanAttacksToWinByFamily,
    meanClearTimeMsByFamily,
    determinismDigest: digestSource,
  }
}
