import { runPrototype } from './prototype.js'

const summary = runPrototype(30_000)
const coreRates = Object.values(summary.coreWinRate)
const coreWinRateSpread =
  Math.max(...coreRates) - Math.min(...coreRates)
const minimumWinningPassiveInclusion = Math.min(
  ...Object.values(summary.winningPassiveInclusionRate),
)
const maximumWinningCoreShare = Math.max(
  ...Object.values(summary.winningCoreShare),
)
const output = {
  seed: summary.seed,
  runs: summary.runs,
  winRate: summary.winRate,
  clearMean: summary.clearStats.mean,
  meanAttemptTimeMinutes: summary.timeStats.mean / 60_000,
  meanWinningRunTimeMinutes: summary.winningTimeStats.mean / 60_000,
  coreWinRate: summary.coreWinRate,
  coreWinRateSpread,
  winningCoreShare: summary.winningCoreShare,
  minimumWinningPassiveInclusion,
  passiveTriggerCount: summary.passiveTriggerCount,
  routeByCore: summary.routeByCore,
  decisionProfileByCore: summary.decisionProfileByCore,
  differentDecisionPairs: summary.differentDecisionPairs,
  legalPatternViolations: summary.legalPatternViolations,
  topFiveBuildShare: summary.topFiveBuildShare,
  gate2: {
    winRate: summary.winRate >= 0.45 && summary.winRate <= 0.65,
    coreSpread: coreWinRateSpread <= 0.22,
    coreShare: maximumWinningCoreShare <= 0.45,
    passiveInclusion: minimumWinningPassiveInclusion >= 0.05,
    buildConcentration: summary.topFiveBuildShare <= 0.4,
    strategyDifference: summary.differentDecisionPairs >= 2,
    legalGeneration: summary.legalPatternViolations.length === 0,
    duration:
      summary.winningTimeStats.mean >= 300_000 &&
      summary.winningTimeStats.mean <= 360_000,
  },
  determinismDigest: summary.determinismDigest,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
