import type { Direction } from '../core/index.js'

export type MusicLayer =
  | '低頻脈衝'
  | '主拍'
  | '切分脈衝'
  | '低音序列'
  | '高頻琶音'
  | '超載節拍'

const tempos = [96, 110, 124, 138, 152, 166] as const
const layerThresholds: readonly MusicLayer[] = [
  '低頻脈衝',
  '主拍',
  '切分脈衝',
  '低音序列',
  '高頻琶音',
  '超載節拍',
]

export function normalizeThreat(threat: number): number {
  return Math.max(0, Math.min(5, Math.trunc(threat)))
}

export function tempoForThreat(threat: number): number {
  return tempos[normalizeThreat(threat)] ?? tempos[0]
}

export function layersForThreat(threat: number): readonly MusicLayer[] {
  return layerThresholds.slice(0, normalizeThreat(threat) + 1)
}

export function directionPan(direction: Direction): number {
  return {
    up: 0,
    right: 0.68,
    down: 0,
    left: -0.68,
  }[direction]
}

export function directionFrequency(direction: Direction): number {
  return {
    up: 660,
    right: 550,
    down: 330,
    left: 440,
  }[direction]
}

