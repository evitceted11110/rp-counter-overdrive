import type { Direction } from '../core/index.js'

export type TempoTier = 0 | 1 | 2
export type AudioLane = 'left' | 'right' | 'center'
export type MusicLayer =
  | '節拍骨架'
  | '反拍'
  | '八分刻度'
  | '低音推進'
  | '高壓裝飾'

export type GridPosition = {
  absoluteSlot: number
  section: number
  bar: number
  slot: number
  phase: 'call' | 'pickup' | 'response'
}

export const SECTION_BARS = 8
export const EIGHTH_SLOTS_PER_BAR = 8

const tempos = [120, 132, 144] as const
const layersByTier: readonly (readonly MusicLayer[])[] = [
  ['節拍骨架'],
  ['節拍骨架', '反拍', '八分刻度', '低音推進'],
  ['節拍骨架', '反拍', '八分刻度', '低音推進', '高壓裝飾'],
]

export function normalizeThreat(threat: number): number {
  return Math.max(0, Math.min(5, Math.trunc(threat)))
}

export function normalizeTempoTier(tier: number): TempoTier {
  return Math.max(0, Math.min(2, Math.trunc(tier))) as TempoTier
}

export function tempoForTier(tier: number): number {
  return tempos[normalizeTempoTier(tier)] ?? tempos[0]
}

/**
 * 舊版 render 的相容接口。0–1、2–3、4–5 威脅分別映射至三個
 * section tempo；真正的切換由 audio transport 延後到八小節邊界。
 */
export function tempoForThreat(threat: number): number {
  return tempoForTier(Math.floor(normalizeThreat(threat) / 2))
}

export function tierForThreat(threat: number): TempoTier {
  return normalizeTempoTier(Math.floor(normalizeThreat(threat) / 2))
}

export function eighthSecondsForTier(tier: number): number {
  return 30 / tempoForTier(tier)
}

export function eighthMillisecondsForTier(tier: number): number {
  return eighthSecondsForTier(tier) * 1000
}

export function layersForTier(tier: number): readonly MusicLayer[] {
  return (
    layersByTier[normalizeTempoTier(tier)] ??
    layersByTier[0] ??
    (['節拍骨架'] as const)
  )
}

/** 舊版相容接口；新的音樂層只在小節邊界套用。 */
export function layersForThreat(threat: number): readonly MusicLayer[] {
  return layersForTier(tierForThreat(threat))
}

export function gridPosition(absoluteSlot: number): GridPosition {
  const safeSlot = Math.max(0, Math.trunc(absoluteSlot))
  const slot = safeSlot % EIGHTH_SLOTS_PER_BAR
  const absoluteBar = Math.floor(safeSlot / EIGHTH_SLOTS_PER_BAR)
  const phase =
    slot <= 2
      ? 'call'
      : slot === 3
        ? 'pickup'
      : 'response'
  return {
    absoluteSlot: safeSlot,
    section: Math.floor(absoluteBar / SECTION_BARS),
    bar: absoluteBar % SECTION_BARS,
    slot,
    phase,
  }
}

export function isSectionBoundary(absoluteSlot: number): boolean {
  return (
    Math.max(0, Math.trunc(absoluteSlot)) %
      (SECTION_BARS * EIGHTH_SLOTS_PER_BAR) ===
    0
  )
}

export function lanePan(lane: AudioLane): number {
  return { left: -0.55, right: 0.55, center: 0 }[lane]
}

export function laneFrequency(lane: AudioLane): number {
  return { left: 174.61, right: 293.66, center: 110 }[lane]
}

export function directionToLane(
  direction: Direction,
  breach = false,
): AudioLane {
  if (breach || direction === 'up' || direction === 'down') return 'center'
  return direction
}

/** 舊版四方向 cue 相容接口。 */
export function directionPan(direction: Direction): number {
  return lanePan(directionToLane(direction))
}

/** 舊版四方向 cue 相容接口。 */
export function directionFrequency(direction: Direction): number {
  return laneFrequency(directionToLane(direction))
}
