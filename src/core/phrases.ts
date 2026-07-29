import { createRng } from '@rogue-paradise/rng'

export type CombatAction = 'left' | 'right' | 'center'
export type BeatSubdivision = 1 | 2 | 4
export type DifficultyTier = 0 | 1 | 2 | 3
export type RhythmAttackKind = 'strike' | 'breach'

export type PhraseNote = {
  beat: number
  action: CombatAction
  kind: RhythmAttackKind
}

export type PhraseTemplate = {
  id: string
  difficultyTier: DifficultyTier
  bars: number
  subdivision: BeatSubdivision
  notes: readonly PhraseNote[]
}

const beatsPerBar = 4

export const phraseTemplates: readonly PhraseTemplate[] = [
  {
    id: 'left-calibration',
    difficultyTier: 0,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'left', kind: 'strike' },
      { beat: 2, action: 'left', kind: 'strike' },
    ],
  },
  {
    id: 'right-calibration',
    difficultyTier: 0,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'right', kind: 'strike' },
      { beat: 2, action: 'right', kind: 'strike' },
    ],
  },
  {
    id: 'alternating-pair-left',
    difficultyTier: 1,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'left', kind: 'strike' },
      { beat: 1, action: 'right', kind: 'strike' },
      { beat: 3, action: 'left', kind: 'strike' },
    ],
  },
  {
    id: 'alternating-pair-right',
    difficultyTier: 1,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'right', kind: 'strike' },
      { beat: 1, action: 'left', kind: 'strike' },
      { beat: 3, action: 'right', kind: 'strike' },
    ],
  },
  {
    id: 'center-downbeat',
    difficultyTier: 2,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'left', kind: 'strike' },
      { beat: 2, action: 'center', kind: 'strike' },
      { beat: 3, action: 'right', kind: 'strike' },
    ],
  },
  {
    id: 'breach-downbeat',
    difficultyTier: 2,
    bars: 1,
    subdivision: 1,
    notes: [
      { beat: 0, action: 'right', kind: 'strike' },
      { beat: 2, action: 'center', kind: 'breach' },
    ],
  },
  {
    id: 'eighth-note-cross',
    difficultyTier: 3,
    bars: 1,
    subdivision: 2,
    notes: [
      { beat: 0, action: 'left', kind: 'strike' },
      { beat: 0.5, action: 'right', kind: 'strike' },
      { beat: 2, action: 'center', kind: 'strike' },
      { beat: 3, action: 'left', kind: 'strike' },
      { beat: 3.5, action: 'right', kind: 'strike' },
    ],
  },
  {
    id: 'eighth-note-breach',
    difficultyTier: 3,
    bars: 1,
    subdivision: 2,
    notes: [
      { beat: 0.5, action: 'right', kind: 'strike' },
      { beat: 1.5, action: 'left', kind: 'strike' },
      { beat: 3, action: 'center', kind: 'breach' },
    ],
  },
]

export function validatePhraseTemplate(template: PhraseTemplate): string[] {
  const errors: string[] = []
  if (template.id.length === 0) errors.push('phrase id 不得為空')
  if (!Number.isInteger(template.bars) || template.bars <= 0) {
    errors.push('bars 必須為正整數')
  }
  if (template.notes.length === 0) errors.push('phrase 至少需要一個 note')
  if (template.difficultyTier <= 2 && template.subdivision !== 1) {
    errors.push('Tier 0–2 只能使用四分音符')
  }

  const phraseBeats = template.bars * beatsPerBar
  let previousBeat = -1
  const centerCountByBar = new Map<number, number>()
  for (const [index, note] of template.notes.entries()) {
    if (note.beat < 0 || note.beat >= phraseBeats) {
      errors.push(`note ${index} 超出 phrase 範圍`)
    }
    if (!Number.isInteger(note.beat * template.subdivision)) {
      errors.push(`note ${index} 未對齊 ${template.subdivision} 分細分`)
    }
    if (note.beat <= previousBeat) {
      errors.push(`note ${index} 必須晚於前一個 note`)
    }
    if (template.difficultyTier <= 1 && note.action === 'center') {
      errors.push('Tier 0/1 不得包含中央目標')
    }
    if (template.difficultyTier === 2 && note.action === 'center') {
      const bar = Math.floor(note.beat / beatsPerBar)
      const centerCount = (centerCountByBar.get(bar) ?? 0) + 1
      centerCountByBar.set(bar, centerCount)
      if (centerCount > 1) {
        errors.push(`Tier 2 的第 ${bar + 1} 小節最多一個中央目標`)
      }
    }
    if (note.kind === 'breach' && note.action !== 'center') {
      errors.push(`note ${index} 的破防必須位於中央軌`)
    }
    previousBeat = note.beat
  }
  return errors
}

export function getEligiblePhraseTemplates(
  tier: DifficultyTier,
): readonly PhraseTemplate[] {
  return phraseTemplates.filter(
    (template) =>
      template.difficultyTier <= tier &&
      validatePhraseTemplate(template).length === 0,
  )
}

export function createPhraseSequence(
  seed: string,
  tier: DifficultyTier,
  count: number,
): PhraseTemplate[] {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('phrase 數量必須為正整數')
  }
  const eligible = getEligiblePhraseTemplates(tier)
  if (eligible.length === 0) throw new Error('沒有符合難度的合法 phrase')
  const rng = createRng(`${seed}:rhythm-phrases:tier-${tier}`)
  return Array.from({ length: count }, () => rng.pick(eligible))
}
