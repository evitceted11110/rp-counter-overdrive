import { connect } from '@rogue-paradise/platform-sdk'
import { audioDirector, type AudioBus } from '../audio/audio-engine.js'
import { tempoForThreat } from '../audio/music-model.js'
import {
  advanceAttack,
  beginBattle,
  counter,
  createInitialState,
  directionLabel,
  phaseDodge,
  releaseBrakeCore,
  timeoutAttack,
  type Direction,
  type GameState,
} from '../core/index.js'
import './styles.css'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('找不到 #app')

await connect({ gameSlug: 'counter-overdrive' })

root.innerHTML = `
  <section class="game-shell" aria-label="反擊超載遊戲">
    <header class="top-hud">
      <div class="brand-block">
        <span class="eyebrow">高速反擊隨機冒險</span>
        <strong>反擊超載</strong>
      </div>
      <div class="threat-panel">
        <span>威脅階級</span>
        <div class="threat-pips" aria-label="威脅階級"></div>
        <b class="threat-value">0</b>
      </div>
      <div class="boss-panel">
        <span>棱鏡監工</span>
        <div class="bar boss-bar"><i></i></div>
        <b class="boss-value">118 / 118</b>
      </div>
    </header>

    <main class="arena">
      <div class="ambient-grid"></div>
      <div class="danger-vignette"></div>
      <aside class="player-panel">
        <span class="panel-label">完整度</span>
        <div class="integrity-pips"></div>
        <span class="panel-label phase-label">相位</span>
        <div class="phase-pips"></div>
        <div class="combo-block">
          <span>連續成功</span>
          <strong class="combo-value">0</strong>
        </div>
      </aside>

      <section class="battlefield" aria-live="polite">
        <div class="boss-aura"></div>
        <img
          class="boss-art"
          src="/assets/boss-prism-supervisor.png"
          alt="以破裂能源核心為中心的機械 Boss 棱鏡監工"
        />
        <div class="boss-core"></div>
        <div class="counter-ring">
          <div class="player-core"><span>反擊核心</span></div>
        </div>
        <div class="direction-guides" aria-label="方向按鍵提示">
          <div class="direction-guide guide-up" data-direction="up">
            <kbd>W</kbd><span>上</span>
          </div>
          <div class="direction-guide guide-right" data-direction="right">
            <kbd>D</kbd><span>右</span>
          </div>
          <div class="direction-guide guide-down" data-direction="down">
            <kbd>S</kbd><span>下</span>
          </div>
          <div class="direction-guide guide-left" data-direction="left">
            <kbd>A</kbd><span>左</span>
          </div>
          <div class="phase-guide"><kbd>Shift</kbd><span>相位</span></div>
        </div>
        <div class="attack-arrow" aria-hidden="true"></div>
        <div class="attack-card">
          <span class="attack-kind">待機</span>
          <strong class="attack-direction">準備反擊</strong>
          <small class="attack-series"></small>
        </div>
        <div class="impact-text"></div>
        <div class="damage-number"></div>
      </section>

      <aside class="intel-panel">
        <span class="panel-label">即時判讀</span>
        <div class="intel-row">
          <span>來向</span>
          <strong class="intel-direction">—</strong>
        </div>
        <div class="intel-row">
          <span>類型</span>
          <strong class="intel-kind">—</strong>
        </div>
        <div class="intel-row">
          <span>反擊窗口</span>
          <strong class="intel-window">—</strong>
        </div>
        <p class="intel-tip">方向鍵反擊，紅色破防使用 Shift 相位。</p>
      </aside>
    </main>

    <footer class="bottom-hud">
      <div class="core-card">
        <span class="core-icon">◇</span>
        <div>
          <strong>制動核心</strong>
          <small>威脅達 3 後按空白鍵：每級造成 3 點崩解，接下來兩招降速。</small>
        </div>
        <kbd>空白鍵</kbd>
      </div>
      <div class="controls">
        <span><kbd>WASD</kbd> 方向反擊</span>
        <span><kbd>Shift</kbd> 相位</span>
        <span class="seed-label">重播碼：VERTICAL-SLICE-1</span>
      </div>
    </footer>

    <div class="audio-control">
      <button
        class="audio-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="audio-panel"
      >
        音訊・<span class="tempo-value">96 BPM</span>
      </button>
      <section class="audio-panel" id="audio-panel" aria-label="音訊設定" hidden>
        <div class="audio-panel-heading">
          <strong>音訊設定</strong>
          <button class="mute-button" type="button" aria-pressed="false">全部靜音</button>
        </div>
        <label>
          <span>音樂</span>
          <input data-bus="music" type="range" min="0" max="100" value="52" />
        </label>
        <label>
          <span>效果</span>
          <input data-bus="effects" type="range" min="0" max="100" value="78" />
        </label>
        <label>
          <span>介面</span>
          <input data-bus="interface" type="range" min="0" max="100" value="58" />
        </label>
        <small>威脅愈高，節奏與聲部愈密集。</small>
      </section>
    </div>

    <div class="start-overlay">
      <div class="start-card">
        <span class="eyebrow">節奏戰鬥版 0.2.0</span>
        <h1>反擊愈準，世界愈快。</h1>
        <p>觀察攻擊來向與收縮命中環，在撞擊前按下對應方向。紅色破防不可反擊，必須使用相位。</p>
        <div class="start-rules">
          <span>完美反擊：威脅上升</span>
          <span>威脅愈高：敵我一起加速</span>
          <span>動態配樂：96–166 BPM 疊加聲部</span>
          <span>威脅達 3：可釋放制動核心</span>
        </div>
        <button class="start-button" type="button">啟動反擊</button>
      </div>
    </div>

    <div class="result-overlay" hidden>
      <div class="result-card">
        <span class="result-kicker">戰鬥結束</span>
        <h2 class="result-title"></h2>
        <p class="result-copy"></p>
        <button class="restart-button" type="button">重新挑戰</button>
      </div>
    </div>
  </section>
`

const query = <T extends Element>(selector: string): T => {
  const element = root.querySelector<T>(selector)
  if (element === null) throw new Error(`找不到 ${selector}`)
  return element
}

const shell = query<HTMLElement>('.game-shell')
const threatPips = query<HTMLElement>('.threat-pips')
const threatValue = query<HTMLElement>('.threat-value')
const bossBar = query<HTMLElement>('.boss-bar i')
const bossValue = query<HTMLElement>('.boss-value')
const integrityPips = query<HTMLElement>('.integrity-pips')
const phasePips = query<HTMLElement>('.phase-pips')
const comboValue = query<HTMLElement>('.combo-value')
const arrow = query<HTMLElement>('.attack-arrow')
const attackKind = query<HTMLElement>('.attack-kind')
const attackDirection = query<HTMLElement>('.attack-direction')
const attackSeries = query<HTMLElement>('.attack-series')
const impactText = query<HTMLElement>('.impact-text')
const damageNumber = query<HTMLElement>('.damage-number')
const intelDirection = query<HTMLElement>('.intel-direction')
const intelKind = query<HTMLElement>('.intel-kind')
const intelWindow = query<HTMLElement>('.intel-window')
const coreCard = query<HTMLElement>('.core-card')
const startOverlay = query<HTMLElement>('.start-overlay')
const resultOverlay = query<HTMLElement>('.result-overlay')
const resultTitle = query<HTMLElement>('.result-title')
const resultCopy = query<HTMLElement>('.result-copy')
const startButton = query<HTMLButtonElement>('.start-button')
const restartButton = query<HTMLButtonElement>('.restart-button')
const audioToggle = query<HTMLButtonElement>('.audio-toggle')
const audioPanel = query<HTMLElement>('.audio-panel')
const muteButton = query<HTMLButtonElement>('.mute-button')
const tempoValue = query<HTMLElement>('.tempo-value')

threatPips.innerHTML = Array.from(
  { length: 5 },
  (_, index) => `<i data-threat="${index + 1}"></i>`,
).join('')

let state = createInitialState('vertical-slice-1')
let attackStartedAt = 0
let resolveUntil = 0
let eventShownAt = 0
let lastEventKey = ''
let lastAttackAudioId = ''
let endingSoundPlayed = false

async function begin(): Promise<void> {
  await audioDirector.unlock()
  audioDirector.stopMusic()
  audioDirector.setThreat(0)
  audioDirector.startMusic()
  audioDirector.playInterface('start')
  state = beginBattle(createInitialState('vertical-slice-1'))
  startOverlay.classList.add('is-hidden')
  resultOverlay.hidden = true
  lastAttackAudioId = ''
  endingSoundPlayed = false
  attackStartedAt = performance.now()
  shell.focus()
}

function remaining(now: number): number {
  return attackStartedAt + state.currentTelegraphMs - now
}

function directionKey(direction: Direction): string {
  return {
    up: 'W',
    right: 'D',
    down: 'S',
    left: 'A',
  }[direction]
}

function placeArrow(direction: Direction, progress: number): void {
  const distance = (1 - progress) * 270
  const positions = {
    up: {
      left: '50%',
      top: `calc(50% - ${distance}px)`,
      transform: 'translate(-50%, -50%)',
    },
    right: {
      left: `calc(50% + ${distance}px)`,
      top: '50%',
      transform: 'translate(-50%, -50%)',
    },
    down: {
      left: '50%',
      top: `calc(50% + ${distance}px)`,
      transform: 'translate(-50%, -50%)',
    },
    left: {
      left: `calc(50% - ${distance}px)`,
      top: '50%',
      transform: 'translate(-50%, -50%)',
    },
  }[direction]
  arrow.style.left = positions.left
  arrow.style.top = positions.top
  arrow.style.transform = `${positions.transform} scale(${0.85 + progress * 0.35})`
}

function resolveInput(next: GameState, now: number): void {
  if (next === state) {
    audioDirector.playInterface('invalid')
    return
  }
  state = next
  if (state.stage === 'resolved') {
    resolveUntil = now + 430
  }
  const grade = state.lastEvent?.grade
  if (grade !== undefined) audioDirector.playResolution(grade)
}

function handleDirection(direction: Direction, now: number): void {
  resolveInput(counter(state, direction, remaining(now)), now)
}

window.addEventListener('keydown', (event) => {
  if (event.repeat) return
  const now = performance.now()
  const mapping: Readonly<Record<string, Direction | undefined>> = {
    w: 'up',
    W: 'up',
    ArrowUp: 'up',
    d: 'right',
    D: 'right',
    ArrowRight: 'right',
    s: 'down',
    S: 'down',
    ArrowDown: 'down',
    a: 'left',
    A: 'left',
    ArrowLeft: 'left',
  }
  const direction = mapping[event.key]
  if (direction !== undefined) {
    event.preventDefault()
    handleDirection(direction, now)
  } else if (event.key === 'Shift') {
    event.preventDefault()
    resolveInput(phaseDodge(state, remaining(now)), now)
  } else if (event.code === 'Space') {
    event.preventDefault()
    resolveInput(releaseBrakeCore(state), now)
  }
})

startButton.addEventListener('click', () => void begin())
restartButton.addEventListener('click', () => void begin())
audioToggle.addEventListener('click', () => {
  const willOpen = audioPanel.hidden
  audioPanel.hidden = !willOpen
  audioToggle.setAttribute('aria-expanded', String(willOpen))
  if (willOpen) audioDirector.playInterface('open')
})
muteButton.addEventListener('click', () => {
  const muted = !audioDirector.currentSettings.muted
  audioDirector.setMuted(muted)
  muteButton.setAttribute('aria-pressed', String(muted))
  muteButton.textContent = muted ? '恢復聲音' : '全部靜音'
})
for (const input of audioPanel.querySelectorAll<HTMLInputElement>(
  'input[data-bus]',
)) {
  input.addEventListener('input', () => {
    const bus = input.dataset.bus as AudioBus
    audioDirector.setBusVolume(bus, Number(input.value) / 100)
  })
}

function renderPips(
  container: HTMLElement,
  total: number,
  active: number,
  className: string,
): void {
  container.innerHTML = Array.from(
    { length: total },
    (_, index) => `<i class="${index < active ? className : ''}"></i>`,
  ).join('')
}

function render(now: number): void {
  shell.dataset.threat = String(state.threat)
  shell.dataset.stage = state.stage
  audioDirector.setThreat(state.threat)
  const tempo = tempoForThreat(state.threat)
  tempoValue.textContent = `${tempo} BPM`
  shell.style.setProperty('--beat-duration', `${60 / tempo}s`)
  threatValue.textContent = String(state.threat)
  for (const pip of threatPips.querySelectorAll<HTMLElement>('i')) {
    pip.classList.toggle(
      'active',
      Number(pip.dataset.threat ?? 0) <= state.threat,
    )
  }
  bossBar.style.width = `${(state.bossIntegrity / state.maxBossIntegrity) * 100}%`
  bossValue.textContent = `${state.bossIntegrity} / ${state.maxBossIntegrity}`
  renderPips(
    integrityPips,
    state.maxPlayerIntegrity,
    state.playerIntegrity,
    'active',
  )
  renderPips(phasePips, 2, state.phaseCharges, 'active')
  comboValue.textContent = String(state.combo)
  coreCard.classList.toggle('is-ready', state.threat >= 3)

  const attack = state.currentAttack
  if (state.stage === 'telegraph' && attack !== null) {
    if (attack.id !== lastAttackAudioId) {
      lastAttackAudioId = attack.id
      audioDirector.playAttack(attack.direction, !attack.counterable, state.threat)
    }
    const timeLeft = remaining(now)
    const progress = Math.max(
      0,
      Math.min(1.08, 1 - timeLeft / state.currentTelegraphMs),
    )
    arrow.textContent = ''
    arrow.className = `attack-arrow attack-pulse direction-${attack.direction} ${
      attack.counterable ? 'counterable' : 'breach'
    }`
    placeArrow(attack.direction, progress)
    arrow.style.opacity = '1'
    const ringProgress = Math.max(0, Math.min(1, progress))
    query<HTMLElement>('.counter-ring').style.setProperty(
      '--ring-progress',
      `${ringProgress * 360}deg`,
    )
    attackKind.textContent = attack.label
    attackDirection.textContent = attack.counterable
      ? `按 ${directionKey(attack.direction)}・${directionLabel(attack.direction)}方反擊`
      : '破防・使用相位'
    attackSeries.textContent = attack.seriesLabel ?? ''
    intelDirection.textContent = attack.counterable
      ? `${directionLabel(attack.direction)}方（${directionKey(attack.direction)}）`
      : '破防（Shift）'
    intelKind.textContent = attack.counterable ? attack.label : '不可反擊'
    intelWindow.textContent =
      timeLeft <= 90
        ? '完美'
        : timeLeft <= 240
          ? '可反擊'
          : `${Math.max(0, Math.ceil(timeLeft))} 毫秒`

    for (const guide of shell.querySelectorAll<HTMLElement>(
      '.direction-guide',
    )) {
      guide.classList.toggle(
        'active',
        attack.counterable && guide.dataset.direction === attack.direction,
      )
    }
    query<HTMLElement>('.phase-guide').classList.toggle(
      'active',
      !attack.counterable,
    )

    if (timeLeft < -80) {
      resolveInput(timeoutAttack(state), now)
    }
  } else {
    arrow.style.opacity = '0'
    for (const guide of shell.querySelectorAll<HTMLElement>(
      '.direction-guide, .phase-guide',
    )) {
      guide.classList.remove('active')
    }
    if (state.stage === 'resolved' && now >= resolveUntil) {
      state = advanceAttack(state)
      attackStartedAt = now
    }
  }

  const event = state.lastEvent
  const eventKey =
    event === null ? '' : `${state.attackCursor}:${event.grade}:${event.title}`
  if (event !== null && eventKey !== lastEventKey) {
    lastEventKey = eventKey
    eventShownAt = now
    impactText.textContent = event.title
    impactText.className = `impact-text show ${event.grade}`
    damageNumber.textContent = event.damage > 0 ? `−${event.damage}` : ''
    damageNumber.className = `damage-number ${
      event.damage > 0 ? 'show' : ''
    }`
    shell.classList.remove('impact-perfect', 'impact-miss', 'impact-core')
    shell.classList.add(`impact-${event.grade}`)
  }
  if (now - eventShownAt > 520) {
    impactText.classList.remove('show')
    damageNumber.classList.remove('show')
    shell.classList.remove('impact-perfect', 'impact-miss', 'impact-core')
  }

  if ((state.stage === 'won' || state.stage === 'lost') && resultOverlay.hidden) {
    if (!endingSoundPlayed) {
      endingSoundPlayed = true
      audioDirector.stopMusic()
      audioDirector.playInterface(
        state.stage === 'won' ? 'victory' : 'defeat',
      )
    }
    resultOverlay.hidden = false
    resultTitle.textContent =
      state.stage === 'won' ? '棱鏡監工已崩解' : '反擊核心已離線'
    resultCopy.textContent =
      state.stage === 'won'
        ? `你以威脅 ${state.threat} 結束戰鬥，最高連續成功 ${state.combo}。`
        : '觀察固定鍵位與命中環；紅色攻擊必須使用相位。'
  }

  requestAnimationFrame(render)
}

requestAnimationFrame(render)
