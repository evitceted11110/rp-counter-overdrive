import { describe, expect, it } from 'vitest'
import {
  advanceAutomaticBattleEffects,
  createBattleState,
  createEncounterTargets,
  isBattleChartComplete,
  resolveBattleAction,
  type BattleRuntimeState,
  type BuildEffect,
  type EncounterTarget,
  type EncounterDefinition,
  type PatternDefinition,
} from './runtime-battle.js'

const encounter: EncounterDefinition = {
  id: 'test-boss',
  name: '測試 Boss',
  encounter: 2,
  bpm: 132,
  integrity: 80,
  normalWindowMs: 120,
  perfectWindowMs: 50,
  openingPatterns: ['left-center'],
  allowedPatternTags: ['center', 'alternating'],
  maxBars: 36,
  requiredGrammar: ['center', 'alternating'],
  redlinePatterns: [],
}

const patterns: PatternDefinition[] = [
  {
    id: 'left-center',
    name: '左中',
    bars: 1,
    subdivision: 8,
    allowedEncounters: [2],
    routeTags: ['center'],
    grammar: ['center'],
    targets: [
      { step: 4, lane: 'left' },
      { step: 6, lane: 'center' },
    ],
    markedRestSteps: [5],
  },
  {
    id: 'right-left',
    name: '右左',
    bars: 1,
    subdivision: 4,
    allowedEncounters: [2],
    routeTags: ['alternating'],
    grammar: ['alternating'],
    targets: [
      { step: 2, lane: 'right' },
      { step: 3, lane: 'left' },
    ],
    markedRestSteps: [],
  },
]

function effect(type: BuildEffect['type'], sourceId: string = type): BuildEffect {
  const values: Record<string, number> = {
    echo_damage: 2,
    normal_window_bonus_ms: 40,
    perfect_window_penalty_ms: 20,
    bonus_overload: 1,
    bonus_damage: 2,
    vulnerability_damage: 4,
    damage_multiplier: 0.75,
    max_per_bar: 2,
  }
  return { sourceId, sourceName: sourceId, type, values }
}

function target(
  lane: EncounterTarget['lane'],
  overrides: Partial<EncounterTarget> = {},
): EncounterTarget {
  return {
    id: `target-${lane}`,
    lane,
    targetBeat: 4,
    patternId: 'unit',
    patternName: '測試樂句',
    grammar: [],
    source: 'pattern',
    ...overrides,
  }
}

function battleWith(
  effects: BuildEffect[],
  targets: EncounterTarget[],
  overrides: Partial<BattleRuntimeState> = {},
): BattleRuntimeState {
  return {
    ...createBattleState({
      seed: 'hooks',
      encounter,
      patterns,
      routeTags: ['center'],
      effects,
      playerIntegrity: 6,
    }),
    targets,
    effects,
    ...overrides,
  }
}

function expectResponseSlots(targets: readonly EncounterTarget[]): void {
  for (const item of targets) {
    expect(item.targetBeat * 2).toBe(Math.round(item.targetBeat * 2))
    expect([2, 2.5, 3, 3.5]).toContain(item.targetBeat % 4)
  }
}

describe('資料化戰鬥 runtime core', () => {
  it('使用 encounter BPM/window 並依 seed 建立固定 target timeline', () => {
    const first = createEncounterTargets({
      seed: 'timeline',
      encounter,
      patterns,
      routeTags: ['center'],
      effects: [],
    })
    expect(first).toEqual(
      createEncounterTargets({
        seed: 'timeline',
        encounter,
        patterns,
        routeTags: ['center'],
        effects: [],
      }),
    )
    // 戰 1 先有兩小節純節拍器，第一個必要目標才進入 response 區。
    expect(first[0]?.targetBeat).toBe(10)
    expect(first[0]?.targetBeat).toBeGreaterThanOrEqual(8)
    expectResponseSlots(first)
    expect(first.every((target) => target.lane !== 'center' || encounter.encounter > 1)).toBe(
      true,
    )
  })

  it('逐一保留 content 的 response step，不壓縮或丟棄跨小節 target', () => {
    const twoBars: PatternDefinition = {
      id: 'two-bars-native',
      name: '兩小節原生格',
      bars: 2,
      subdivision: 4,
      allowedEncounters: [2],
      routeTags: ['center'],
      grammar: ['center'],
      targets: [
        { step: 2, lane: 'left' },
        { step: 3, lane: 'center' },
        { step: 6, lane: 'right' },
        { step: 7, lane: 'left' },
      ],
      markedRestSteps: [],
    }
    const nativeEncounter: EncounterDefinition = {
      ...encounter,
      openingPatterns: ['two-bars-native'],
      maxBars: 2,
      requiredGrammar: ['center'],
    }
    const targets = createEncounterTargets({
      seed: 'native-steps',
      encounter: nativeEncounter,
      patterns: [twoBars],
      routeTags: [],
      effects: [],
    })
    expect(targets.map((item) => [item.targetBeat, item.lane])).toEqual([
      [10, 'left'],
      [11, 'center'],
      [14, 'right'],
      [15, 'left'],
    ])
  })

  it('電容與保險只把事先標記的休止格公開改寫為中央目標', () => {
    const targets = createEncounterTargets({
      seed: 'marked-rest',
      encounter,
      patterns,
      routeTags: ['center'],
      effects: [
        effect('convert-marked-rest-to-center-charge', 'capacitor'),
        effect('convert-marked-rest-to-center-insurance', 'insurance'),
      ],
    })
    expect(
      targets.some((target) => target.source === 'capacitor-insurance'),
    ).toBe(true)
  })

  it('三核心與六被動 effect type 都有可觀察 hook', () => {
    const supported: BuildEffect['type'][] = [
      'alternating-perfect-echo',
      'convert-marked-rest-to-center-charge',
      'forgive-now-add-center-next-bar',
      'opposite-lane-window',
      'repeat-second-risk',
      'convert-marked-rest-to-center-insurance',
      'three-lane-vulnerability',
      'late-perfect-echo',
      'replace-next-bar-with-safe-phrase',
    ]
    const state = createBattleState({
      seed: 'all-hooks',
      encounter,
      patterns,
      routeTags: ['center', 'alternating'],
      effects: supported.map((type) => effect(type)),
      playerIntegrity: 6,
    })
    expect(new Set(state.effects.map((item) => item.type))).toEqual(
      new Set(supported),
    )
  })

  it('Space 在非中央目標無效，中央目標才可判定', () => {
    const state = createBattleState({
      seed: 'space',
      encounter,
      patterns,
      routeTags: ['center'],
      effects: [],
      playerIntegrity: 6,
    })
    expect(state.targets[0]?.lane).toBe('left')
    const invalid = resolveBattleAction(state, 'center', 0)
    expect(invalid.cursor).toBe(0)
    expect(invalid.lastEvent?.kind).toBe('invalid-center')

    const left = resolveBattleAction(state, 'left', 0)
    expect(left.cursor).toBe(1)
    expect(left.targets[1]?.lane).toBe('center')
    expect(resolveBattleAction(left, 'center', 0).lastEvent?.kind).toBe(
      'center',
    )
  })

  it('相鄰八分音符的重疊窗會把交界輸入交給較近的下一顆', () => {
    // 132 BPM 的八分音符相距約 227.27ms；原本 ±120ms 窗口在
    // 113.64ms 之後重疊。輸入在 120ms 時較接近下一顆，不能被
    // 前一顆以 wrong-lane 吞掉。
    const adjacent = battleWith([], [
      target('left', { id: 'first', targetBeat: 4 }),
      target('right', { id: 'second', targetBeat: 4.5 }),
    ])
    const resolved = resolveBattleAction(adjacent, 'right', 120)

    expect(resolved.cursor).toBe(2)
    expect(resolved.lastEvent?.kind).toBe('normal')
    expect(resolved.lastEvent?.timingOffsetMs).toBeCloseTo(
      120 - 30_000 / 132,
    )
    // 前一顆仍會被判為漏接，但這次按鍵要正確結算到下一顆。
    expect(resolved.playerIntegrity).toBe(adjacent.playerIntegrity - 1)
  })

  it('相鄰音符的交界以前仍保持目前目標的判定', () => {
    const adjacent = battleWith([], [
      target('left', { id: 'first', targetBeat: 4 }),
      target('right', { id: 'second', targetBeat: 4.5 }),
    ])
    const resolved = resolveBattleAction(adjacent, 'left', 100)

    expect(resolved.cursor).toBe(1)
    expect(resolved.lastEvent?.kind).toBe('normal')
    expect(resolved.playerIntegrity).toBe(adjacent.playerIntegrity)
  })

  it('首領擊破後仍保留整張固定譜面，並把其後漏接安全結算為 0 分', () => {
    const boss1: EncounterDefinition = {
      ...encounter,
      id: 'rail-calibrator',
      encounter: 1,
      bpm: 120,
      integrity: 54,
      maxBars: 36,
      requiredGrammar: ['single', 'alternating'],
      redlinePatterns: ['redline-calibration'],
    }
    const state = battleWith(
      [],
      [
        target('left', { id: 'break-hit', targetBeat: 4, grammar: ['single'] }),
        target('right', { id: 'long-tail', targetBeat: 8, grammar: ['alternating'] }),
        target('left', {
          id: 'redline-left',
          targetBeat: 12,
          grammar: ['redline', 'single', 'alternating'],
        }),
        target('right', {
          id: 'redline-right',
          targetBeat: 13,
          grammar: ['redline', 'single', 'alternating'],
        }),
      ],
      { encounter: boss1, bossIntegrity: 1 },
    )

    const originalTimeline = state.targets.map((item) => item.id)
    let resolved = resolveBattleAction(state, 'left', 0)
    expect(resolved.bossIntegrity).toBe(0)
    expect(resolved.bossDefeated).toBe(true)
    expect(resolved.targets.map((item) => item.id)).toEqual(originalTimeline)
    const integrity = resolved.playerIntegrity
    resolved = resolveBattleAction(resolved, 'left', 0)
    expect(resolved.cursor).toBe(2)
    expect(resolved.playerIntegrity).toBe(integrity)
    expect(resolved.lastEvent?.damage).toBe(0)
    expect(resolved.targets.map((item) => item.id)).toEqual(originalTimeline)
    expect(isBattleChartComplete(resolved)).toBe(false)
    resolved = resolveBattleAction(resolved, 'left', 0)
    resolved = resolveBattleAction(resolved, 'right', 0)
    expect(isBattleChartComplete(resolved)).toBe(true)
  })

  it('固定計分為 Perfect 2、normal 1、miss 0', () => {
    const perfect = resolveBattleAction(
      battleWith([], [target('left')]),
      'left',
      0,
    )
    const normal = resolveBattleAction(
      battleWith([], [target('left')]),
      'left',
      80,
    )
    const miss = resolveBattleAction(
      battleWith([], [target('left')]),
      'right',
      0,
    )
    expect(perfect.score).toBe(2)
    expect(normal.score).toBe(1)
    expect(miss.score).toBe(0)
  })

  it('交替核心、交叉導體與同側棘輪會改變傷害或窗口', () => {
    const resonance = effect('alternating-perfect-echo', 'cross-resonance')
    const conductor = effect('opposite-lane-window', 'cross-conductor')
    const alternating = battleWith(
      [resonance, conductor],
      [target('right')],
      { previousPerfectLane: 'left' },
    )
    const echoed = resolveBattleAction(alternating, 'right', 140)
    expect(echoed.lastEvent?.kind).toBe('normal')
    expect(echoed.lastEvent?.triggered).toContain('cross-conductor')
    const perfectEcho = resolveBattleAction(alternating, 'right', 0)
    expect(perfectEcho.lastEvent?.triggered).toContain('cross-resonance')

    const ratchet = effect('repeat-second-risk', 'same-side-ratchet')
    const repeated = battleWith([ratchet], [target('left')], {
      previousPerfectLane: 'left',
    })
    expect(resolveBattleAction(repeated, 'left', 40).lastEvent?.kind).toBe(
      'normal',
    )
    const riskyPerfect = resolveBattleAction(repeated, 'left', 20)
    expect(riskyPerfect.lastEvent?.triggered).toContain('same-side-ratchet')
    expect(riskyPerfect.overload).toBe(2)
  })

  it('電容、保險、三相與延遲簧片都產生可見 trigger', () => {
    const capacitor = effect(
      'convert-marked-rest-to-center-charge',
      'downbeat-capacitor',
    )
    const charged = resolveBattleAction(
      battleWith([capacitor], [target('center', { source: 'capacitor' })]),
      'center',
      0,
    )
    expect(charged.capacitorCharges).toBe(1)
    expect(charged.lastEvent?.triggered).toContain('downbeat-capacitor')

    const insurance = effect(
      'convert-marked-rest-to-center-insurance',
      'rest-insurance',
    )
    const insured = resolveBattleAction(
      battleWith([insurance], [
        target('center', { source: 'insurance' }),
        target('left', { id: 'next', targetBeat: 6 }),
      ]),
      'center',
      0,
    )
    const recovered = resolveBattleAction(insured, 'right', 0)
    expect(recovered.lastEvent?.title).toBe('空拍保險')

    const sequence = effect('three-lane-vulnerability', 'three-phase-sequence')
    const sequenced = resolveBattleAction(
      battleWith([sequence], [target('center')], {
        recentPerfect: ['left', 'right'],
      }),
      'center',
      0,
    )
    expect(sequenced.lastEvent?.triggered).toContain('three-phase-sequence')

    const reed = effect('late-perfect-echo', 'delay-reed')
    const syncopated = resolveBattleAction(
      battleWith(
        [reed],
        [target('right', { grammar: ['syncopated'] })],
      ),
      'right',
      20,
    )
    expect(syncopated.lastEvent?.triggered).toContain('delay-reed')
  })

  it('穩態飛輪與斷路器以分數與失誤保護生效，完全不改寫 target timeline', () => {
    const flywheel = effect(
      'forgive-now-add-center-next-bar',
      'steady-flywheel',
    )
    const pressured = resolveBattleAction(
      battleWith([flywheel], [target('left')]),
      'left',
      80,
    )
    expect(pressured.targets).toEqual([target('left')])
    expect(pressured.lastEvent?.triggered).toContain('steady-flywheel')
    expect(pressured.score).toBe(5)

    const breaker = effect(
      'replace-next-bar-with-safe-phrase',
      'circuit-breaker',
    )
    const broken = resolveBattleAction(
      battleWith(
        [breaker],
        [
          target('left'),
          target('center', { id: 'danger', targetBeat: 8 }),
        ],
      ),
      'right',
      0,
    )
    expect(broken.lastEvent?.triggered).toContain('circuit-breaker')
    expect(broken.playerIntegrity).toBe(6)
    expect(broken.targets.map((item) => item.id)).toEqual(['target-left', 'danger'])
    expect(advanceAutomaticBattleEffects(broken)).toBe(broken)
  })

  it('延遲簧片同一小節最多觸發兩次', () => {
    const reed = effect('late-perfect-echo', 'delay-reed')
    let state = battleWith(
      [reed],
      [
        target('left', { targetBeat: 4, grammar: ['syncopated'] }),
        target('right', {
          id: 'sync-2',
          targetBeat: 4.5,
          grammar: ['syncopated'],
        }),
        target('left', {
          id: 'sync-3',
          targetBeat: 5,
          grammar: ['syncopated'],
        }),
      ],
    )
    state = resolveBattleAction(state, 'left', 20)
    expect(state.lastEvent?.triggered).toContain('delay-reed')
    state = resolveBattleAction(state, 'right', 20)
    expect(state.lastEvent?.triggered).toContain('delay-reed')
    state = resolveBattleAction(state, 'left', 20)
    expect(state.lastEvent?.triggered).not.toContain('delay-reed')
  })

  it('超載可持續記錄，但不插入、替換或收束既有譜面', () => {
    const boss3: EncounterDefinition = {
      ...encounter,
      id: 'boss-3',
      encounter: 3,
      maxBars: 12,
      requiredGrammar: ['center'],
      redlinePatterns: ['redline-unit'],
    }
    const baseTargets = [
      target('left', { id: 'current', targetBeat: 4, grammar: ['single'] }),
      target('right', { id: 'future', targetBeat: 8, grammar: ['alternating'] }),
      target('left', {
        id: 'redline-left',
        targetBeat: 12,
        patternId: 'redline-unit',
        grammar: ['redline', 'center'],
      }),
      target('center', {
        id: 'redline-center',
        targetBeat: 12.5,
        patternId: 'redline-unit',
        grammar: ['redline', 'center'],
      }),
    ]
    let state = battleWith([], baseTargets, {
      encounter: boss3,
      overload: 2,
      teachingEndBeat: 0,
    })
    state = resolveBattleAction(state, 'left', 0)
    expect(state.overload).toBe(3)
    expect(state.targets).toEqual(baseTargets)
    state = resolveBattleAction(state, 'right', 0)
    expect(state.targets).toEqual(baseTargets)
  })
})
