import { connect } from '@rogue-paradise/platform-sdk'
import bossContent from '../../content/bosses.json'
import itemContent from '../../content/items.json'
import rhythmContent from '../../content/rhythm-patterns.json'
import { audioDirector, type AudioBus, type ModuleAudioKind } from '../audio/audio-engine.js'
import {
  chooseCore,
  choosePassive,
  chooseRoute,
  completeEncounter,
  advanceAutomaticBattleEffects,
  createBattleState,
  createRunState,
  failRun,
  resolveBattleAction,
  timeoutBattleTarget,
  type BattleRuntimeState,
  type BuildEffect,
  type BuildEffectType,
  type EncounterDefinition,
  type PatternDefinition,
  type RouteChoice,
  type RunCatalog,
  type RunChoice,
  type RunState,
} from '../core/index.js'
import { routeCombatKeyboardEvent } from '../input/index.js'
import { BeatTimeline, RhythmTransport } from '../transport/index.js'
import type { CombatAction } from '../core/phrases.js'
import './styles.css'

type RawBoss = {
  id: string
  name: string
  encounter: 1 | 2 | 3
  bpm: 120 | 132 | 144
  integrity: number
  perfect_window_ms: number
  normal_window_ms: number
  opening_patterns: string[]
  allowed_pattern_tags: string[]
  max_bars: number
  required_grammar: string[]
  redline_patterns?: string[]
  teaches: string
  protection: string
}

type RawRoute = {
  id: string
  name: string
  public_tags: string[]
  pattern_tags: string[]
  reward_families: string[]
}

type RawItem = {
  id: string
  name: string
  family: string
  trigger: string
  decision_change: string
  visible_feedback?: string
  compatible_tags: string[]
  effect: Record<string, string | number>
}

type RawPattern = {
  id: string
  name: string
  bars: number
  subdivision: 4 | 8
  grammar: string[]
  route_tags: string[]
  allowed_encounters: number[]
  targets: { step: number; lane: CombatAction }[]
  marked_rest_steps: number[]
}

const rawBosses = bossContent.bosses as RawBoss[]
const rawRoutes = bossContent.routes as RawRoute[]
const rawCores = itemContent.cores as unknown as RawItem[]
const rawPassives = itemContent.passives as unknown as RawItem[]
const rawPatterns = rhythmContent.patterns as RawPattern[]

const encounters: readonly EncounterDefinition[] = rawBosses.map((boss) => ({
  id: boss.id,
  name: boss.name,
  encounter: boss.encounter,
  bpm: boss.bpm,
  integrity: boss.integrity,
  normalWindowMs: boss.normal_window_ms,
  perfectWindowMs: boss.perfect_window_ms,
  openingPatterns: boss.opening_patterns,
  allowedPatternTags: boss.allowed_pattern_tags,
  maxBars: boss.max_bars,
  requiredGrammar: boss.required_grammar,
  redlinePatterns: boss.redline_patterns ?? [],
}))

const patterns: readonly PatternDefinition[] = rawPatterns.map((pattern) => ({
  id: pattern.id,
  name: pattern.name,
  bars: pattern.bars,
  subdivision: pattern.subdivision,
  grammar: pattern.grammar,
  allowedEncounters: pattern.allowed_encounters,
  routeTags: pattern.route_tags,
  targets: pattern.targets,
  markedRestSteps: pattern.marked_rest_steps,
}))

const routes: readonly RouteChoice[] = rawRoutes.map((route) => ({
  id: route.id,
  name: route.name,
  publicTags: route.public_tags,
  rewardFamilies: route.reward_families,
}))

const toChoice = (item: RawItem): RunChoice => ({
  id: item.id,
  name: item.name,
  family: item.family,
  compatibleTags: item.compatible_tags,
})

const runCatalog: RunCatalog = {
  cores: rawCores.map(toChoice),
  passives: rawPassives.map(toChoice),
  routes,
}

const allItems = new Map(
  [...rawCores, ...rawPassives].map((item) => [item.id, item]),
)
const allRoutes = new Map(rawRoutes.map((route) => [route.id, route]))

function requireRoot(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#app')
  if (element === null) throw new Error('找不到 #app')
  return element
}

const root = requireRoot()

await connect({ gameSlug: 'counter-overdrive' })

root.innerHTML = `
  <section class="game-shell" tabindex="-1" aria-label="反擊超載遊戲">
    <header class="top-hud">
      <div class="brand-block">
        <span class="eyebrow">三軌節奏隨機冒險 0.3.0</span>
        <strong>反擊超載</strong>
      </div>
      <div class="run-progress" aria-label="本局進度">
        <span class="run-node active">選核心</span>
        <i></i><span class="run-node">戰 1</span>
        <i></i><span class="run-node">戰 2</span>
        <i></i><span class="run-node">戰 3</span>
      </div>
      <div class="boss-panel">
        <span class="boss-name">等待選擇核心</span>
        <div class="bar boss-bar"><i></i></div>
        <b class="boss-value">—</b>
      </div>
    </header>

    <main class="arena">
      <div class="ambient-grid"></div>
      <aside class="player-panel">
        <span class="panel-label">核心完整度</span>
        <div class="integrity-pips"></div>
        <div class="metric">
          <span>超載</span><strong class="overload-value">0</strong><small>/ 5</small>
        </div>
        <div class="metric">
          <span>連段</span><strong class="combo-value">0</strong>
        </div>
        <div class="timing-card">
          <span>判定窗口</span>
          <b class="window-value">—</b>
          <small class="bpm-value">— BPM</small>
        </div>
      </aside>

      <section class="battlefield" aria-live="polite">
        <img
          class="boss-art"
          src="/assets/boss-prism-supervisor.png"
          alt="機械 Boss 的破裂能源核心"
        />
        <div class="boss-aura"></div>
        <div class="phrase-label">選擇起始核心後進入第一戰</div>
        <div class="track-field" aria-label="左、中央、右三軌">
          <div class="lane lane-left"><span>左軌</span><kbd>←</kbd></div>
          <div class="lane lane-center locked"><span>中央重拍</span><kbd>空白</kbd></div>
          <div class="lane lane-right"><span>右軌</span><kbd>→</kbd></div>
          <div class="beat-grid"></div>
          <div class="target-layer"></div>
          <div class="hit-line"><i></i><strong>反擊線</strong></div>
        </div>
        <div class="impact-text"></div>
        <div class="event-detail"></div>
      </section>

      <aside class="intel-panel">
        <span class="panel-label">下一樂句</span>
        <strong class="next-pattern">—</strong>
        <div class="intel-row"><span>目前目標</span><b class="current-lane">—</b></div>
        <div class="intel-row"><span>路線</span><b class="route-name">尚未選擇</b></div>
        <div class="route-tags"></div>
        <p class="boss-teach">戰 1 只使用左右鍵；中央軌會在戰 2 才正式公開。</p>
      </aside>
    </main>

    <footer class="bottom-hud">
      <div class="build-strip">
        <article class="build-card core-slot">
          <span>起始核心</span><strong>尚未選擇</strong><small>被動／自動觸發</small>
        </article>
        <article class="build-card passive-slot" data-slot="0">
          <span>模組 1</span><strong>空</strong><small>戰後三選一</small>
        </article>
        <article class="build-card passive-slot" data-slot="1">
          <span>模組 2</span><strong>空</strong><small>戰後三選一</small>
        </article>
      </div>
      <div class="controls">
        <button class="control-button left-button" type="button"><kbd>←</kbd><span>左軌</span></button>
        <button class="control-button center-button" type="button"><kbd>空白</kbd><span>中央</span></button>
        <button class="control-button right-button" type="button"><kbd>→</kbd><span>右軌</span></button>
        <span class="seed-label">本局種子：COUNTER-OVERDRIVE-1</span>
      </div>
    </footer>

    <div class="audio-control">
      <button class="audio-toggle" type="button" aria-expanded="false" aria-controls="audio-panel">
        音訊・<span class="audio-tempo">120 BPM</span>
      </button>
      <section class="audio-panel" id="audio-panel" aria-label="音訊設定" hidden>
        <div class="audio-panel-heading">
          <strong>音訊設定</strong>
          <button class="mute-button" type="button" aria-pressed="false">全部靜音</button>
        </div>
        <label><span>音樂</span><input data-bus="music" type="range" min="0" max="100" value="56" /></label>
        <label><span>效果</span><input data-bus="effects" type="range" min="0" max="100" value="78" /></label>
        <label><span>介面</span><input data-bus="interface" type="range" min="0" max="100" value="58" /></label>
        <small>攻擊、判定與音樂共用同一條節拍時間線。</small>
      </section>
    </div>

    <div class="choice-overlay">
      <section class="choice-panel"></section>
    </div>
  </section>
`

function query<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`找不到 ${selector}`)
  return element
}

const shell = query<HTMLElement>('.game-shell')
const choiceOverlay = query<HTMLElement>('.choice-overlay')
const choicePanel = query<HTMLElement>('.choice-panel')
const bossName = query<HTMLElement>('.boss-name')
const bossBar = query<HTMLElement>('.boss-bar i')
const bossValue = query<HTMLElement>('.boss-value')
const integrityPips = query<HTMLElement>('.integrity-pips')
const overloadValue = query<HTMLElement>('.overload-value')
const comboValue = query<HTMLElement>('.combo-value')
const windowValue = query<HTMLElement>('.window-value')
const bpmValue = query<HTMLElement>('.bpm-value')
const phraseLabel = query<HTMLElement>('.phrase-label')
const targetLayer = query<HTMLElement>('.target-layer')
const impactText = query<HTMLElement>('.impact-text')
const eventDetail = query<HTMLElement>('.event-detail')
const nextPattern = query<HTMLElement>('.next-pattern')
const currentLane = query<HTMLElement>('.current-lane')
const routeName = query<HTMLElement>('.route-name')
const routeTags = query<HTMLElement>('.route-tags')
const bossTeach = query<HTMLElement>('.boss-teach')
const coreSlot = query<HTMLElement>('.core-slot')
const passiveSlots = [...root.querySelectorAll<HTMLElement>('.passive-slot')]
const centerLane = query<HTMLElement>('.lane-center')
const audioToggle = query<HTMLButtonElement>('.audio-toggle')
const audioPanel = query<HTMLElement>('.audio-panel')
const muteButton = query<HTMLButtonElement>('.mute-button')
const audioTempo = query<HTMLElement>('.audio-tempo')
const seedLabel = query<HTMLElement>('.seed-label')

let runNumber = 1
let run: RunState = createRunState('COUNTER-OVERDRIVE-1', runCatalog)
let battle: BattleRuntimeState | null = null
let timeline: BeatTimeline | null = null
let transport: RhythmTransport | null = null
let timeoutId: number | null = null
let scheduledTargetIds = new Set<string>()
let impactUntil = 0
let lastEventIdentity = ''
let battlePaused = false

function currentEncounter(): EncounterDefinition {
  const encounter = encounters.find((item) => item.encounter === run.encounter)
  if (encounter === undefined) throw new Error('找不到 encounter 定義')
  return encounter
}

function effectFor(item: RawItem): BuildEffect {
  const { type, ...values } = item.effect
  if (typeof type !== 'string') throw new Error(`${item.id} 缺少 effect type`)
  const numericValues = Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )
  return {
    sourceId: item.id,
    sourceName: item.name,
    type: type as BuildEffectType,
    values: numericValues,
  }
}

function selectedEffects(): BuildEffect[] {
  const ids = [
    ...(run.coreId === null ? [] : [run.coreId]),
    ...run.passiveIds,
  ]
  return ids
    .map((id) => allItems.get(id))
    .filter((item): item is RawItem => item !== undefined)
    .map(effectFor)
}

function selectedRouteTags(): readonly string[] {
  if (run.routeId === null) return []
  return allRoutes.get(run.routeId)?.pattern_tags ?? []
}

function renderPips(current: number, maximum: number): void {
  integrityPips.innerHTML = Array.from(
    { length: maximum },
    (_, index) => `<i class="${index < current ? 'active' : ''}"></i>`,
  ).join('')
}

function renderBuild(): void {
  const core = run.coreId === null ? undefined : allItems.get(run.coreId)
  coreSlot.innerHTML =
    core === undefined
      ? '<span>起始核心</span><strong>尚未選擇</strong><small>被動／自動觸發</small>'
      : `<span>起始核心</span><strong>${core.name}</strong><small>${core.trigger}</small>`
  for (const [index, slot] of passiveSlots.entries()) {
    const item = allItems.get(run.passiveIds[index] ?? '')
    slot.innerHTML =
      item === undefined
        ? `<span>模組 ${index + 1}</span><strong>空</strong><small>戰後三選一</small>`
        : `<span>模組 ${index + 1}</span><strong>${item.name}</strong><small>${item.trigger}</small>`
  }
}

function updateProgress(): void {
  const nodes = [...root.querySelectorAll<HTMLElement>('.run-node')]
  const activeIndex =
    run.phase === 'choose-core' ? 0 : run.phase === 'run-won' ? 3 : run.encounter
  for (const [index, node] of nodes.entries()) {
    node.classList.toggle('active', index === activeIndex)
    node.classList.toggle('done', index < activeIndex)
  }
}

function itemCard(choice: RunChoice, kind: 'core' | 'passive'): string {
  const item = allItems.get(choice.id)
  if (item === undefined) return ''
  return `
    <button class="choice-card" type="button" data-kind="${kind}" data-id="${item.id}">
      <span>${kind === 'core' ? '起始核心' : '被動模組'}・${item.family}</span>
      <strong>${item.name}</strong>
      <b>${item.trigger}</b>
      <small>${item.decision_change}</small>
    </button>
  `
}

function showChoice(): void {
  audioDirector.stopTransport()
  choiceOverlay.hidden = false
  updateProgress()
  renderBuild()
  if (run.phase === 'choose-core') {
    choicePanel.innerHTML = `
      <span class="choice-kicker">0.3.0 隨機冒險</span>
      <h1>選擇本局的反擊規則</h1>
      <p>三個核心都不增加按鍵；它們會被動改寫你追逐的節奏。</p>
      <div class="choice-grid">${run.coreChoices.map((choice) => itemCard(choice, 'core')).join('')}</div>
      <small>操作固定為 ←、→、空白。戰 1 只教左右，戰 2 才加入中央。</small>
    `
  } else if (run.phase === 'choose-passive') {
    choicePanel.innerHTML = `
      <span class="choice-kicker">戰 ${run.encounter} 完成</span>
      <h1>三選一：讓構築改變下一戰</h1>
      <p>每張模組都會改寫窗口、樂句、中央目標或失誤恢復。</p>
      <div class="choice-grid">${run.passiveChoices.map((choice) => itemCard(choice, 'passive')).join('')}</div>
    `
  } else if (run.phase === 'choose-route') {
    choicePanel.innerHTML = `
      <span class="choice-kicker">路線分歧</span>
      <h1>先看節奏標籤，再選下一戰</h1>
      <div class="choice-grid route-grid">
        ${run.routeChoices
          .map(
            (route) => `
              <button class="choice-card route-card" type="button" data-kind="route" data-id="${route.id}">
                <span>下一戰路線</span><strong>${route.name}</strong>
                <b>${route.publicTags.join('・')}</b>
                <small>路線會改變可抽到的樂句與下一次草稿傾向。</small>
              </button>
            `,
          )
          .join('')}
      </div>
    `
  } else {
    const won = run.phase === 'run-won'
    choicePanel.innerHTML = `
      <span class="choice-kicker">${won ? '本局完成' : '本局中斷'}</span>
      <h1>${won ? '核心監督者已崩解' : '反擊核心已離線'}</h1>
      <p>${
        won
          ? `你以 ${run.playerIntegrity} 點完整度完成三戰，構築為 ${run.passiveIds
              .map((id) => allItems.get(id)?.name ?? id)
              .join('＋')}。`
          : '本局核心、被動與路線已清空；下一局會重新生成草稿。'
      }</p>
      <button class="restart-run" type="button">開始新的 Run</button>
    `
    audioDirector.playInterface(won ? 'victory' : 'defeat')
  }
}

async function startEncounter(): Promise<void> {
  const encounter = currentEncounter()
  const route = run.routeId === null ? undefined : allRoutes.get(run.routeId)
  battle = createBattleState({
    seed: `${run.seed}:battle-${run.encounter}`,
    encounter,
    patterns,
    routeTags: selectedRouteTags(),
    effects: selectedEffects(),
    playerIntegrity: run.playerIntegrity,
  })
  const startAtPerformanceMs = performance.now() + 900
  timeline = new BeatTimeline({
    bpm: encounter.bpm,
    startTimeMs: startAtPerformanceMs,
  })
  transport = new RhythmTransport(timeline, { nowMs: () => performance.now() })
  scheduledTargetIds = new Set()
  battlePaused = false
  audioDirector.stopTransport()
  audioDirector.startTransport({
    tempoTier: (encounter.encounter - 1) as 0 | 1 | 2,
    startAtPerformanceMs,
  })
  choiceOverlay.hidden = true
  shell.focus()
  centerLane.classList.toggle('locked', encounter.encounter === 1)
  bossName.textContent = encounter.name
  bossTeach.textContent =
    rawBosses.find((boss) => boss.id === encounter.id)?.teaches ?? ''
  windowValue.textContent = `普通 ±${encounter.normalWindowMs}ms／完美 ±${encounter.perfectWindowMs}ms`
  bpmValue.textContent = `${encounter.bpm} BPM`
  audioTempo.textContent = `${encounter.bpm} BPM`
  routeName.textContent = route?.name ?? '校準路線'
  const visibleTags = route?.public_tags ?? ['左右單拍', '左右交替']
  routeTags.innerHTML = visibleTags.map((tag) => `<span>${tag}</span>`).join('')
  updateProgress()
  renderBuild()
  scheduleUpcomingTargets()
  scheduleCurrentTimeout()
}

function targetTime(targetBeat: number): number {
  if (timeline === null) return performance.now()
  return timeline.timeAtBeat(targetBeat)
}

function scheduleUpcomingTargets(): void {
  if (battle === null) return
  const beatMs = 60_000 / battle.encounter.bpm
  for (const [previewIndex, target] of battle.targets
    .slice(battle.cursor, battle.cursor + 2)
    .entries()) {
    if (target.source === 'flywheel' && previewIndex > 0) continue
    if (scheduledTargetIds.has(target.id)) continue
    scheduledTargetIds.add(target.id)
    audioDirector.scheduleBossCall({
      lane: target.lane,
      callAtPerformanceMs: Math.max(
        performance.now() + 10,
        // 目標固定在 response slots 4–7；call 則固定在同一小節前
        // 兩拍（slots 0–3），讓讀招、pickup、回擊形成可預期問答。
        targetTime(target.targetBeat) - beatMs * 2,
      ),
      targetAtPerformanceMs: targetTime(target.targetBeat),
      heavy: target.lane === 'center',
    })
  }
}

function nextEighthAtPerformanceMs(): number {
  if (transport === null) return performance.now()
  const beat = transport.position.beat
  return transport.targetTimeMs(Math.ceil((beat - 0.0001) * 2) / 2)
}

function moduleResponseAt(targetAtPerformanceMs?: number): number {
  return targetAtPerformanceMs !== undefined &&
    targetAtPerformanceMs >= performance.now() + 4
    ? targetAtPerformanceMs
    : nextEighthAtPerformanceMs()
}

function rescheduleRemainingTargetsAfterPause(): void {
  if (battle === null) return
  const state = battle
  const current = state.targets[state.cursor]
  if (current === undefined) return
  const currentBar = Math.floor(current.targetBeat / 4)
  battle = {
    ...state,
    // 保留已結算 target 的歷史順序；尚未結算者以第一個剩餘小節
    // 作為新的第二小節。這會先給四拍倒數，且所有目標仍在 response
    // slots，不會因 tab 回來後追趕過去的 timeout。
    targets: state.targets.map((target, index) =>
      index < state.cursor
        ? target
        : {
            ...target,
            targetBeat:
              (1 + Math.floor(target.targetBeat / 4) - currentBar) * 4 +
              (target.targetBeat % 4),
          },
    ),
  }
}

function pauseBattleForInterruption(): void {
  if (battle === null || battlePaused) return
  battlePaused = true
  clearBattleTimeout()
  audioDirector.stopTransport()
}

function resumeBattleAfterInterruption(): void {
  if (battle === null || !battlePaused) return
  rescheduleRemainingTargetsAfterPause()
  const startAtPerformanceMs = performance.now() + 80
  timeline = new BeatTimeline({
    bpm: battle.encounter.bpm,
    startTimeMs: startAtPerformanceMs,
  })
  transport = new RhythmTransport(timeline, { nowMs: () => performance.now() })
  scheduledTargetIds = new Set()
  battlePaused = false
  audioDirector.startTransport({
    tempoTier: (battle.encounter.encounter - 1) as 0 | 1 | 2,
    startAtPerformanceMs,
  })
  scheduleUpcomingTargets()
  scheduleCurrentTimeout()
}

function clearBattleTimeout(): void {
  if (timeoutId === null) return
  window.clearTimeout(timeoutId)
  timeoutId = null
}

function scheduleCurrentTimeout(): void {
  clearBattleTimeout()
  if (battle === null) return
  const target = battle.targets[battle.cursor]
  if (target === undefined) {
    if (battle.bossIntegrity > 0) {
      battle = {
        ...battle,
        playerIntegrity: 0,
        lastEvent: {
          kind: 'timeout',
          title: '樂句耗盡',
          detail: '未能在最大樂句長度內崩解首領',
          damage: 0,
          triggered: [],
          timingOffsetMs: 0,
        },
      }
    }
    endEncounter()
    return
  }
  const deadline =
    targetTime(target.targetBeat) + battle.encounter.normalWindowMs + 1
  timeoutId = window.setTimeout(() => {
    if (battle === null) return
    const current = battle.targets[battle.cursor]
    if (current?.id !== target.id) return
    battle = timeoutBattleTarget(
      battle,
      performance.now() - targetTime(target.targetBeat),
    )
    audioDirector.playCounterHit({
      lane: target.lane,
      grade: 'miss',
      atPerformanceMs: performance.now(),
    })
    afterResolution()
  }, Math.max(0, deadline - performance.now()))
}

function moduleSound(sourceId: string): ModuleAudioKind {
  if (
    sourceId === 'cross-resonance' ||
    sourceId === 'same-side-ratchet'
  ) {
    return 'echo-blade'
  }
  if (sourceId === 'downbeat-capacitor') return 'downbeat-capacitor'
  if (sourceId === 'delay-reed') return 'syncopation-core'
  if (sourceId === 'cross-conductor' || sourceId === 'three-phase-sequence') {
    return 'cross-circuit'
  }
  return 'silent-shield'
}

function announceBattleEvent(targetAtPerformanceMs?: number): void {
  if (battle?.lastEvent === null || battle?.lastEvent === undefined) return
  const event = battle.lastEvent
  impactUntil = performance.now() + 620
  lastEventIdentity = `${battle.cursor}:${event.kind}:${event.title}`
  for (const trigger of event.triggered) {
    audioDirector.playModuleResponse(
      moduleSound(trigger),
      moduleResponseAt(targetAtPerformanceMs),
    )
  }
}

function rebuildUnplayedBossCalls(rewrittenFromBeat: number): void {
  if (battle === null) return
  const rewrittenFromPerformanceMs = targetTime(rewrittenFromBeat)
  audioDirector.cancelBossCallsFrom(rewrittenFromPerformanceMs)
  // Keep IDs in the already-audible portion; all calls in the rewritten bar
  // and after are scheduled afresh from the new target timeline.
  scheduledTargetIds = new Set(
    battle.targets
      .slice(0, battle.cursor)
      .filter((target) => target.targetBeat < rewrittenFromBeat)
      .map((target) => target.id),
  )
}

function afterResolution(targetAtPerformanceMs?: number): void {
  if (battle === null) return
  const rewrittenFromBeat = battle.lastEvent?.rewrittenFromBeat
  if (rewrittenFromBeat !== undefined) rebuildUnplayedBossCalls(rewrittenFromBeat)
  announceBattleEvent(targetAtPerformanceMs)
  const automatic = advanceAutomaticBattleEffects(battle)
  if (automatic !== battle) {
    battle = automatic
    announceBattleEvent(targetAtPerformanceMs)
  }
  if (battle.playerIntegrity <= 0 || battle.bossIntegrity <= 0) {
    endEncounter()
    return
  }
  scheduleUpcomingTargets()
  scheduleCurrentTimeout()
}

function handleAction(action: CombatAction, inputPerformanceMs: number): void {
  if (battle === null || transport === null || battlePaused) return
  const target = battle.targets[battle.cursor]
  if (target === undefined) return
  const previousCursor = battle.cursor
  const targetAt = transport.targetTimeMs(target.targetBeat)
  const offset = inputPerformanceMs - targetAt
  battle = resolveBattleAction(battle, action, offset)
  const event = battle.lastEvent
  if (event === null) return
  if (battle.cursor === previousCursor) {
    audioDirector.playInterface('invalid')
    impactUntil = performance.now() + 320
    return
  }
  clearBattleTimeout()
  const perfect = Math.abs(offset) <= battle.encounter.perfectWindowMs
  const missed = event.kind === 'miss' || event.kind === 'timeout'
  audioDirector.playCounterHit({
    lane: target.lane,
    grade: missed ? 'miss' : perfect ? 'perfect' : 'normal',
    atPerformanceMs: perfect ? targetAt : inputPerformanceMs,
  })
  afterResolution(targetAt)
}

function endEncounter(): void {
  if (battle === null) return
  clearBattleTimeout()
  audioDirector.stopTransport()
  if (battle.playerIntegrity <= 0) {
    run = failRun(run)
  } else {
    run = completeEncounter(run, battle.playerIntegrity, runCatalog)
  }
  battle = null
  timeline = null
  transport = null
  battlePaused = false
  showChoice()
}

function restartRun(): void {
  runNumber += 1
  run = createRunState(`COUNTER-OVERDRIVE-${runNumber}`, runCatalog)
  battle = null
  timeline = null
  transport = null
  seedLabel.textContent = `本局種子：${run.seed}`
  bossName.textContent = '等待選擇核心'
  bossBar.style.width = '0%'
  bossValue.textContent = '—'
  showChoice()
}

choicePanel.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    'button[data-kind], .restart-run',
  )
  if (button === null) return
  if (button.classList.contains('restart-run')) {
    restartRun()
    return
  }
  const id = button.dataset.id ?? ''
  const kind = button.dataset.kind
  if (kind === 'core') {
    run = chooseCore(run, id)
    void audioDirector.unlock().then(() => {
      audioDirector.playInterface('start')
      void startEncounter()
    })
  } else if (kind === 'passive') {
    run = choosePassive(run, id)
    if (run.phase === 'choose-route') showChoice()
    else void startEncounter()
  } else if (kind === 'route') {
    run = chooseRoute(run, id)
    void startEncounter()
  }
})

window.addEventListener('keydown', (event) => {
  routeCombatKeyboardEvent(event, battle !== null && choiceOverlay.hidden, (action) => {
    handleAction(action, audioDirector.calibratedInputTime(event.timeStamp))
  })
})

audioDirector.setInterruptionHandler(pauseBattleForInterruption)
window.addEventListener('blur', pauseBattleForInterruption)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseBattleForInterruption()
  else void audioDirector.unlock().then(resumeBattleAfterInterruption)
})

query<HTMLButtonElement>('.left-button').addEventListener('click', () => {
  handleAction('left', audioDirector.calibratedInputTime(performance.now()))
})
query<HTMLButtonElement>('.center-button').addEventListener('click', () => {
  handleAction('center', audioDirector.calibratedInputTime(performance.now()))
})
query<HTMLButtonElement>('.right-button').addEventListener('click', () => {
  handleAction('right', audioDirector.calibratedInputTime(performance.now()))
})

audioToggle.addEventListener('click', () => {
  const open = audioPanel.hidden
  audioPanel.hidden = !open
  audioToggle.setAttribute('aria-expanded', String(open))
  if (open) audioDirector.playInterface('open')
  else if (battle !== null) shell.focus()
})
muteButton.addEventListener('click', () => {
  const muted = !audioDirector.currentSettings.muted
  audioDirector.setMuted(muted)
  muteButton.setAttribute('aria-pressed', String(muted))
  muteButton.textContent = muted ? '取消靜音' : '全部靜音'
})
for (const slider of root.querySelectorAll<HTMLInputElement>(
  '.audio-panel input[data-bus]',
)) {
  slider.addEventListener('input', () => {
    audioDirector.setBusVolume(
      slider.dataset.bus as AudioBus,
      Number(slider.value) / 100,
    )
  })
}

function laneLabel(lane: CombatAction | undefined): string {
  return lane === 'left'
    ? '左軌 ←'
    : lane === 'right'
      ? '右軌 →'
      : lane === 'center'
        ? '中央 空白'
        : '—'
}

function render(now: number): void {
  renderPips(
    battle?.playerIntegrity ?? run.playerIntegrity,
    run.maxPlayerIntegrity,
  )
  overloadValue.textContent = String(battle?.overload ?? 0)
  comboValue.textContent = String(battle?.combo ?? 0)
  renderBuild()

  if (battle !== null && transport !== null) {
    const current = battle.targets[battle.cursor]
    const beat = transport.position.beat
    bossBar.style.width = `${(battle.bossIntegrity / battle.maxBossIntegrity) * 100}%`
    bossValue.textContent = `${battle.bossIntegrity} / ${battle.maxBossIntegrity}`
    currentLane.textContent = laneLabel(current?.lane)
    nextPattern.textContent = current?.patternName ?? '戰鬥完成'
    phraseLabel.textContent = current?.grammar.includes('syncopated')
      ? `${current.patternName}・切分`
      : current?.source === 'capacitor' ||
          current?.source === 'capacitor-insurance'
        ? `${current.patternName}・電容中央目標`
        : current?.source === 'insurance'
          ? `${current.patternName}・保險中央目標`
          : current?.patternName ?? '完成'
    const preview = battle.targets
      .slice(battle.cursor, battle.cursor + 10)
      .filter((target) => target.targetBeat - beat < 8)
    targetLayer.innerHTML = preview
      .map((target, index) => {
        const delta = target.targetBeat - beat
        const top = 82 - (delta / 7) * 76
        const label =
          target.lane === 'left' ? '←' : target.lane === 'right' ? '→' : '空白'
        return `<div class="track-target ${target.lane} ${target.source} ${
          index === 0 ? 'current' : ''
        }" style="top:${top}%"><b>${label}</b><small>${target.patternName}</small></div>`
      })
      .join('')
  } else {
    targetLayer.innerHTML = ''
  }

  const event = battle?.lastEvent
  if (event !== null && event !== undefined) {
    const identity = `${battle?.cursor}:${event.kind}:${event.title}`
    if (identity === lastEventIdentity || now < impactUntil) {
      impactText.textContent = event.title
      impactText.className = `impact-text show ${event.kind}`
      eventDetail.textContent =
        event.triggered.length > 0
          ? `${event.detail}・${event.triggered
              .map((id) => allItems.get(id)?.name ?? id)
              .join('＋')}`
          : event.detail
    }
  }
  if (now >= impactUntil) {
    impactText.classList.remove('show')
    eventDetail.textContent = ''
  }

  requestAnimationFrame(render)
}

showChoice()
requestAnimationFrame(render)
