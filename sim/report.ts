import { runPrototype } from './prototype.js'

const summary = runPrototype(30_000)
const output = {
  seed: summary.seed,
  runs: summary.runs,
  winRate: summary.winRate,
  clearMean: summary.clearStats.mean,
  averageThreat: summary.averageThreatStats.mean,
  familyWinRate: summary.familyWinRate,
  winningCoreShare: summary.winningCoreShare,
  minimumWinningUpgradeInclusion: Math.min(
    ...Object.values(summary.winningUpgradeInclusionRate),
  ),
  topFiveBuildShare: summary.topFiveBuildShare,
  meanAttacksToWinByFamily: summary.meanAttacksToWinByFamily,
  meanClearTimeMsByFamily: summary.meanClearTimeMsByFamily,
  determinismDigest: summary.determinismDigest,
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
