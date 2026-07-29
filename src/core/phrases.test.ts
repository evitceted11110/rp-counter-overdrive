import { describe, expect, it } from 'vitest'
import {
  createPhraseSequence,
  getEligiblePhraseTemplates,
  phraseTemplates,
  validatePhraseTemplate,
} from './phrases.js'

describe('合法 phrase 模板', () => {
  it('內建模板全部通過可演奏性驗證', () => {
    for (const template of phraseTemplates) {
      expect(validatePhraseTemplate(template)).toEqual([])
    }
  })

  it('Tier 0/1 不出現中央軌，Tier 2 才導入中央重拍', () => {
    for (const tier of [0, 1] as const) {
      expect(
        getEligiblePhraseTemplates(tier).flatMap((template) =>
          template.notes.map((note) => note.action),
        ),
      ).not.toContain('center')
    }
    expect(
      getEligiblePhraseTemplates(2).some((template) =>
        template.notes.some((note) => note.action === 'center'),
      ),
    ).toBe(true)
  })

  it('拒絕未對齊細分、越界或 Tier 0 中央拍', () => {
    const errors = validatePhraseTemplate({
      id: 'invalid',
      difficultyTier: 0,
      bars: 1,
      subdivision: 1,
      notes: [
        { beat: 0.5, action: 'center', kind: 'strike' },
        { beat: 4, action: 'left', kind: 'strike' },
      ],
    })
    expect(errors).toContain('note 0 未對齊 1 分細分')
    expect(errors).toContain('Tier 0/1 不得包含中央目標')
    expect(errors).toContain('note 1 超出 phrase 範圍')
  })

  it('Tier 2 仍只使用四分音符且每小節最多一個中央目標', () => {
    const errors = validatePhraseTemplate({
      id: 'invalid-tier-2',
      difficultyTier: 2,
      bars: 1,
      subdivision: 2,
      notes: [
        { beat: 0, action: 'center', kind: 'strike' },
        { beat: 2, action: 'center', kind: 'breach' },
      ],
    })
    expect(errors).toContain('Tier 0–2 只能使用四分音符')
    expect(errors).toContain('Tier 2 的第 1 小節最多一個中央目標')
  })

  it('同 seed 產生相同模板序列且只從合法池取樣', () => {
    const first = createPhraseSequence('phrase-seed', 3, 12)
    const second = createPhraseSequence('phrase-seed', 3, 12)
    expect(first).toEqual(second)
    expect(first).toHaveLength(12)
    expect(first.every((template) => validatePhraseTemplate(template).length === 0)).toBe(
      true,
    )
  })
})
