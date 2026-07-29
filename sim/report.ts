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
    // 0.4.1 的短譜面密度重新基線；這仍是舊行為原型的觀測門檻，
    // 不取代正式 runtime 的固定分數契約驗證。
    winRate: summary.winRate >= 0.15 && summary.winRate <= 0.25,
    coreSpread: coreWinRateSpread <= 0.42,
    coreShare: maximumWinningCoreShare <= 0.8,
    passiveInclusion: minimumWinningPassiveInclusion >= 0.05,
    buildConcentration: summary.topFiveBuildShare <= 0.4,
    strategyDifference: summary.differentDecisionPairs >= 2,
    legalGeneration: summary.legalPatternViolations.length === 0,
    duration:
      summary.winningTimeStats.mean >= 240_000 &&
      summary.winningTimeStats.mean <= 360_000,
  },
  determinismDigest: summary.determinismDigest,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
