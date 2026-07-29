import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  advanceAutomaticBattleEffects,
  createBattleState,
  createEncounterPhraseSequence,
  createEncounterTargets,
  estimateSuccessfulRunDurationMs,
  isBattleChartComplete,
  resolveBattleAction,
  type BuildEffect,
  type BuildEffectType,
  type EncounterDefinition,
  type PatternDefinition,
} from '../core/index.js'
import { createAutoClickPlan } from './autoplay.js'

const bosses = JSON.parse(
  readFileSync(new URL('../../content/bosses.json', import.meta.url), 'utf8'),
) as {
  bosses: Array<{
    id: string
    name: string
    encounter: 1 | 2 | 3
    bpm: 120 | 132 | 144
    fixed_chart: {
      note_budget: number
      chart_bars: number
      defeat_score: number
    }
    normal_window_ms: number
    perfect_window_ms: number
    opening_patterns: string[]
    allowed_pattern_tags: string[]
    required_grammar: string[]
    redline_patterns?: string[]
  }>
}
const items = JSON.parse(
  readFileSync(new URL('../../content/items.json', import.meta.url), 'utf8'),
) as {
  cores: Array<{
    id: string
    name: string
    effect: Record<string, string | number>
  }>
  passives: Array<{
    id: string
    name: string
    effect: Record<string, string | number>
  }>
}
const rhythms = JSON.parse(
  readFileSync(
    new URL('../../content/rhythm-patterns.json', import.meta.url),
    'utf8',
  ),
) as {
  patterns: Array<{
    id: string
    name: string
    bars: number
    subdivision: 4 | 8
    allowed_encounters: number[]
    route_tags: string[]
    grammar: string[]
    targets: Array<{ step: number; lane: 'left' | 'right' | 'center' }>
    marked_rest_steps: number[]
  }>
}

const definitions: EncounterDefinition[] = bosses.bosses.map((boss) => ({
  id: boss.id,
  name: boss.name,
  encounter: boss.encounter,
  bpm: boss.bpm,
  fixedChart: {
    noteBudget: boss.fixed_chart.note_budget,
    chartBars: boss.fixed_chart.chart_bars,
    defeatScore: boss.fixed_chart.defeat_score,
  },
  normalWindowMs: boss.normal_window_ms,
  perfectWindowMs: boss.perfect_window_ms,
  openingPatterns: boss.opening_patterns,
  allowedPatternTags: boss.allowed_pattern_tags,
  requiredGrammar: boss.required_grammar,
  redlinePatterns: boss.redline_patterns ?? [],
}))
const patternDefinitions: PatternDefinition[] = rhythms.patterns.map(
  (pattern) => ({
    id: pattern.id,
    name: pattern.name,
    bars: pattern.bars,
    subdivision: pattern.subdivision,
    allowedEncounters: pattern.allowed_encounters,
    routeTags: pattern.route_tags,
    grammar: pattern.grammar,
    targets: pattern.targets,
    markedRestSteps: pattern.marked_rest_steps,
  }),
)

function effect(item: {
  id: string
  name: string
  effect: Record<string, string | number>
}): BuildEffect {
  const values = Object.fromEntries(
    Object.entries(item.effect).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )
  return {
    sourceId: item.id,
    sourceName: item.name,
    type: item.effect.type as BuildEffectType,
    values,
  }
}

describe('正式 content 與 runtime 契約', () => {
  it('具有 3 Boss、3 核心、6 被動與 120/132/144 BPM', () => {
    expect(definitions.map((boss) => boss.bpm)).toEqual([120, 132, 144])
    expect(items.cores).toHaveLength(3)
    expect(items.passives).toHaveLength(6)
  })

  it('戰 1 無中央目標，戰 2/3 才能生成中央目標', () => {
    for (const encounter of definitions) {
      const state = createBattleState({
        seed: `content-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags:
          encounter.encounter === 1
            ? []
            : encounter.encounter === 2
              ? ['center']
              : ['syncopated', 'center'],
        effects: [],
        playerIntegrity: 6,
      })
      expect(state.targets.some((target) => target.lane === 'center')).toBe(
        encounter.encounter > 1,
      )
    }
  })

  it('content 的 target 與 marked rest 都是原生 response half slot，runtime 精確保留其拍點', () => {
    for (const pattern of rhythms.patterns) {
      const responseStart = pattern.subdivision / 2
      for (const step of [...pattern.targets, ...pattern.marked_rest_steps.map((step) => ({ step }))]) {
        expect(step.step).toBeGreaterThanOrEqual(0)
        expect(step.step).toBeLessThan(pattern.bars * pattern.subdivision)
        expect(step.step % pattern.subdivision).toBeGreaterThanOrEqual(responseStart)
      }
    }
    for (const encounter of definitions) {
      const targets = createEncounterTargets({
        seed: `native-step-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags: ['alternating', 'center', 'syncopated'],
        effects: [],
      })
      for (const target of targets.filter((item) => item.source === 'pattern')) {
        expect([2, 2.5, 3, 3.5]).toContain(target.targetBeat % 4)
      }
    }
  })

  it('完整讀取 Boss 契約：開場、固定譜面長度與終局紅線都固定合法', () => {
    for (const encounter of definitions) {
      const options = {
        seed: `contract-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags: ['alternating', 'center', 'syncopated'],
        effects: [],
      }
      const phrases = createEncounterPhraseSequence(options)
      expect(phrases.slice(0, encounter.openingPatterns.length).map((item) => item.id)).toEqual(
        encounter.openingPatterns,
      )
      expect(phrases.reduce((total, phrase) => total + phrase.bars, 0)).toBe(
        encounter.fixedChart?.chartBars,
      )
      const grammar = new Set(phrases.flatMap((phrase) => phrase.grammar))
      expect(encounter.requiredGrammar.every((item) => grammar.has(item))).toBe(true)
      if (encounter.redlinePatterns.length > 0) {
        expect(encounter.redlinePatterns).toContain(phrases.at(-1)?.id)
      }
      expect(createEncounterPhraseSequence(options)).toEqual(phrases)
    }
  })

  it('縮短後的每條合法路線仍在倒數前編譯為精確固定音符預算', () => {
    const routeVariants: ReadonlyArray<readonly string[]> = [
      [],
      ['alternating', 'repeat'],
      ['center', 'charge'],
      ['syncopated', 'center'],
    ]
    for (const encounter of definitions) {
      for (const routeTags of routeVariants) {
        for (let seed = 0; seed < 16; seed += 1) {
          const targets = createEncounterTargets({
            seed: `short-chart-${encounter.encounter}-${routeTags.join('-')}-${seed}`,
            encounter,
            patterns: patternDefinitions,
            routeTags,
            effects: [],
          })
          expect(targets).toHaveLength(encounter.fixedChart?.noteBudget ?? -1)
          expect(targets.at(-1)?.grammar).toContain('redline')
        }
      }
    }
  })

  it('三戰都預告完整紅線；前兩戰不引入未教過的輸入語法', () => {
    for (const encounter of definitions) {
      expect(encounter.redlinePatterns.length).toBeGreaterThan(0)
    }
    for (const encounter of definitions.slice(0, 2)) {
      const redlines = patternDefinitions.filter((pattern) =>
        encounter.redlinePatterns.includes(pattern.id),
      )
      expect(redlines).toHaveLength(encounter.redlinePatterns.length)
      for (const pattern of redlines) {
        expect(
          pattern.grammar.every(
            (grammar) =>
              grammar === 'redline' || encounter.requiredGrammar.includes(grammar),
          ),
        ).toBe(true)
      }
    }
  })

  it('完整成功 Run 的固定譜面合約估計為 4–5 分鐘，且擊破後仍要跑完譜面', () => {
    const estimate = estimateSuccessfulRunDurationMs(definitions)
    expect(estimate).toBeGreaterThanOrEqual(240_000)
    expect(estimate).toBeLessThanOrEqual(300_000)
    for (const encounter of definitions) {
      let state = createBattleState({
        seed: `no-early-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags: ['alternating', 'center', 'syncopated'],
        effects: [],
        playerIntegrity: 6,
      })
      const seenGrammar = new Set<string>()
      while (!isBattleChartComplete(state)) {
        const current = state.targets[state.cursor]
        if (current === undefined) break
        current.grammar.forEach((grammar) => seenGrammar.add(grammar))
        state = resolveBattleAction(state, current.lane, 0)
      }
      expect(state.bossIntegrity).toBe(0)
      expect(state.targets).toHaveLength(encounter.fixedChart?.noteBudget ?? -1)
      expect(
        encounter.requiredGrammar.every((grammar) => seenGrammar.has(grammar)),
      ).toBe(true)
      if (encounter.redlinePatterns.length > 0) {
        expect(seenGrammar.has('redline')).toBe(true)
      }
    }
  })

  it('正式 Boss 在 runtime phrase 數量內可由完美反擊擊敗', () => {
    const effects = [
      effect(items.cores[0] ?? (() => { throw new Error('缺少核心') })()),
      effect(items.passives[0] ?? (() => { throw new Error('缺少被動') })()),
      effect(items.passives[3] ?? (() => { throw new Error('缺少被動') })()),
    ]
    for (const encounter of definitions) {
      let state = createBattleState({
        seed: `clear-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags:
          encounter.encounter === 1
            ? []
            : encounter.encounter === 2
              ? ['alternating']
              : ['syncopated', 'alternating'],
        effects,
        playerIntegrity: 6,
      })
      while (!isBattleChartComplete(state)) {
        const current = state.targets[state.cursor]
        if (current === undefined) break
        state = resolveBattleAction(state, current.lane, 0)
      }
      expect(state.bossIntegrity).toBe(0)
    }
  })

  it('測試用自動點擊可沿著目前 target 的 Perfect 計畫完成每一戰', () => {
    for (const encounter of definitions) {
      let state = createBattleState({
        seed: `autoplay-clear-${encounter.encounter}`,
        encounter,
        patterns: patternDefinitions,
        routeTags:
          encounter.encounter === 1
            ? []
            : encounter.encounter === 2
              ? ['alternating']
              : ['syncopated', 'alternating'],
        effects: [],
        playerIntegrity: 6,
      })
      while (!isBattleChartComplete(state)) {
        const current = state.targets[state.cursor]
        if (current === undefined) break
        const plan = createAutoClickPlan(
          current,
          current.targetBeat * (60_000 / encounter.bpm),
        )
        // Perfect 時間傳入既有 runtime 判定；planner 不修改 target 或 seed。
        state = resolveBattleAction(state, plan.action, 0)
        state = advanceAutomaticBattleEffects(state)
      }
      expect(state.bossIntegrity).toBe(0)
      expect(state.playerIntegrity).toBeGreaterThan(0)
      expect(state.cursor).toBe(encounter.fixedChart?.noteBudget ?? -1)
    }
  })
})
