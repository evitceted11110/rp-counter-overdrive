import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const renderSource = readFileSync(
  new URL('./main.ts', import.meta.url),
  'utf8',
)
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const visibleTemplate =
  renderSource.match(/root\.innerHTML = `([\s\S]*?)`\n\nfunction query/)?.[1] ?? ''

describe('0.3.0 單畫面三軌 Rogue 介面', () => {
  it('鎖定 viewport 並禁止頁面滾動', () => {
    expect(styles).toContain('html,\nbody,\n#app')
    expect(styles).toContain('overflow: hidden;')
    expect(styles).toContain('height: 100dvh;')
    expect(styles).toContain('min-width: 960px;')
  })

  it('固定顯示左、中央、右三軌與繁體中文戰鬥資訊', () => {
    for (const label of [
      '左軌',
      '中央重拍',
      '右軌',
      '核心完整度',
      '超載',
      '連段',
      '判定窗口',
      '下一樂句',
      '起始核心',
      '模組 1',
      '模組 2',
    ]) {
      expect(visibleTemplate).toContain(label)
    }
    for (const key of ['←', '空白', '→']) {
      expect(visibleTemplate).toContain(`<kbd>${key}</kbd>`)
    }
  })

  it('不保留 WASD、Shift 或 event.key 戰鬥輸入', () => {
    expect(visibleTemplate).not.toContain('WASD')
    expect(visibleTemplate).not.toContain('Shift')
    expect(renderSource).not.toContain('event.key')
    expect(renderSource).toContain('routeCombatKeyboardEvent')
    for (const internalEnglish of ['Rogue Run', 'RUN 完成', 'Run seed']) {
      expect(visibleTemplate).not.toContain(internalEnglish)
    }
  })

  it('提供預設關閉的測試用自動點擊，且只經既有判定入口結算', () => {
    expect(visibleTemplate).toContain('測試用・自動點擊：關')
    for (const marker of [
      'let autoClickEnabled = false',
      'function scheduleAutoClick()',
      'function stopAutoClick()',
      'createAutoClickPlan(',
      'isCurrentAutoClickPlan(',
      'handleAction(plan.action, plan.atPerformanceMs)',
      'autoClickEnabled = !autoClickEnabled',
      'stopAutoClick()',
      'battlePaused ||',
      'ending !== null',
    ]) {
      expect(renderSource).toContain(marker)
    }
    expect(styles).toContain('.autoplay-toggle')
  })

  it('音訊由玩家選擇後解鎖，並與 performance timeline 共用時間', () => {
    expect(renderSource).toContain('audioDirector.unlock()')
    expect(renderSource).toContain('audioDirector.startTransport({')
    expect(renderSource).toContain('startAtPerformanceMs')
    expect(renderSource).toContain('audioDirector.scheduleBossCall({')
    expect(renderSource).toContain('audioDirector.scheduleTargetAccent({')
    expect(renderSource).toContain('targetAtPerformanceMs: targetTime(target.targetBeat)')
    expect(renderSource).toContain('audioDirector.playCounterHit({')
    expect(renderSource).toContain('targetTime(target.targetBeat) - beatMs * 2')
    expect(renderSource).toContain('audioDirector.playModuleResponse(')
    expect(renderSource).toContain('moduleResponseAt(targetAtPerformanceMs)')
    for (const bus of ['music', 'effects', 'interface']) {
      expect(visibleTemplate).toContain(`data-bus="${bus}"`)
    }
  })

  it('斷路器重寫未播放小節時，會取消舊 Boss cue 並從新 target timeline 重排', () => {
    expect(renderSource).toContain('function rebuildUnplayedBossCalls')
    expect(renderSource).toContain('audioDirector.cancelBossCallsFrom(')
    expect(renderSource).toContain('rewrittenFromBeat')
    expect(renderSource).toContain('scheduledTargetIds = new Set(')
    expect(renderSource).toContain('scheduleUpcomingTargets()')
  })

  it('頁面或 AudioContext 中斷時暫停，不會把離開期間算成 miss', () => {
    for (const marker of [
      "window.addEventListener('blur', pauseBattleForInterruption)",
      "document.addEventListener('visibilitychange'",
      'pauseBattleForInterruption',
      'resumeBattleAfterInterruption',
      'clearBattleTimeout()',
      'audioDirector.stopTransport()',
      'rescheduleRemainingTargetsAfterPause',
      'audioDirector.setInterruptionHandler',
    ]) {
      expect(renderSource).toContain(marker)
    }
  })

  it('包含核心、草稿、路線與 Run 結算覆蓋層，不增加頁面高度', () => {
    for (const marker of [
      "run.phase === 'choose-core'",
      "run.phase === 'choose-passive'",
      "run.phase === 'choose-route'",
      "run.phase === 'run-won'",
      'failRun(run)',
    ]) {
      expect(renderSource).toContain(marker)
    }
    expect(visibleTemplate).toContain('class="choice-overlay"')
    expect(styles).toContain('.choice-overlay')
  })

  it('首領崩解後先進入終曲收束，停止目標與輸入，再延遲結算', () => {
    for (const marker of [
      'let ending:',
      'function endEncounter()',
      "audioDirector.playEncounterFinale(won ? 'victory' : 'defeat')",
      'scheduledTargetIds = new Set()',
      'battlePaused = true',
      'finishEncounterAfterFinale()',
      'ending === null',
    ]) {
      expect(renderSource).toContain(marker)
    }
    expect(styles).toContain(".build-stage[data-effect='finale-win']")
    expect(styles).toContain('.game-shell.is-ending .boss-art')
  })

  it('固定譜面以分數擊破首領：擊破後保留所有剩餘音符並將命中轉為加分', () => {
    for (const marker of [
      '擊破分數',
      '固定譜面',
      '擊破後加分：0',
      'function fixedChartStatus(',
      'const chart = state.encounter.fixedChart',
      'score: state.score',
      'bossDefeated: state.bossDefeated',
      'chartResolvedNotes: state.cursor',
      'chartTotalNotes: chart.noteBudget',
      'Math.max(0, state.score - chart.defeatScore)',
      "bossValue.textContent = chart.bossDefeated ? '已擊破'",
      'if (battle.playerIntegrity <= 0)',
      'scheduleCurrentTimeout() 進入終曲',
      '把剩餘音符轉成額外分數',
    ]) {
      expect(renderSource).toContain(marker)
    }
    expect(styles).toContain('.game-shell.boss-defeated .boss-value')
    expect(styles).toContain(".build-stage[data-effect='boss-defeated']")
  })

  it('在選擇與戰場中央都把構築翻成可見的樂句改寫', () => {
    for (const marker of [
      'class="build-stage"',
      'function renderBuildStage()',
      '終結樂句・首領結構已擊穿',
      'function targetBuildClass(',
      'function phrasePreview(',
      'phrase_preview',
      'central_cue',
      '樂句改寫',
    ]) {
      expect(renderSource).toContain(marker)
    }
    for (const marker of [
      '.track-target.is-rewritten',
      '.track-target.resonance-ready',
      '.phrase-preview',
    ]) {
      expect(styles).toContain(marker)
    }
  })

  it('同軌近距音符會以順序與橫向短隊列呈現，不會重疊成難辨的一團', () => {
    for (const marker of [
      'function targetVisualLayouts(',
      'closeBeatDistance = 0.6',
      'queueShiftPx',
      "layout.isClose ? 'is-close' : ''",
      '連打 ${layout.closeIndex}/${layout.closeCount}',
      'data-order="${layout.order}"',
      'aria-label="第 ${layout.order} 個目標',
    ]) {
      expect(renderSource).toContain(marker)
    }
    for (const marker of [
      '.track-target.is-close',
      'translate(var(--queue-shift, 0px), -15px)',
      '.track-target em',
      '.track-target.is-close small',
    ]) {
      expect(styles).toContain(marker)
    }
  })

  it('連續左軌三音符的隊列位置固定：前一顆結算後，剩餘音符不會重新置中跳位', () => {
    for (const marker of [
      'let targetVisualSlots = new Map<string, TargetVisualLayout>()',
      'function stableTargetVisualLayouts(',
      'const existing = targetVisualSlots.get(target.id)',
      'if (existing !== undefined) return existing',
      'targetVisualSlots.set(target.id, proposed)',
      'targetVisualSlots = new Map()',
      'stableTargetVisualLayouts(battle.targets)',
      'stableTargetVisualLayouts(battle.targets.slice(battle.cursor))',
    ]) {
      expect(renderSource).toContain(marker)
    }
  })

  it('連打命中以獨立軌跡堆疊呈現，不會由下一個普通或完美反擊覆蓋前一筆', () => {
    for (const marker of [
      'class="impact-feedback-layer"',
      'function showImpactFeedback(',
      "const visibleKinds = new Set(['perfect', 'normal', 'center', 'miss', 'timeout'])",
      'impactFeedbackLayer.append(feedback)',
      'impactFeedbackTimers.delete(timer)',
      'clearImpactFeedbacks()',
      "showImpactFeedback(event, battle.targets[battle.cursor - 1]?.lane)",
    ]) {
      expect(renderSource).toContain(marker)
    }
    for (const marker of [
      '.impact-feedback-layer',
      '.impact-feedback {',
      '.impact-feedback strong',
      '.impact-feedback.is-perfect',
      '@keyframes impact-arc',
    ]) {
      expect(styles).toContain(marker)
    }
  })

  it('以目標方塊中心對準反擊線準星中心作為清楚的完美判定視覺基準', () => {
    for (const marker of [
      '中心對準反擊線＝完美',
      '方塊中心對準反擊線準星中心時為完美',
      'class="hit-anchor hit-anchor-left"',
      'class="hit-anchor hit-anchor-center"',
      'class="hit-anchor hit-anchor-right"',
      'const top = `calc(var(--judgement-line)',
      "'is-approaching'",
      "'is-aligned'",
    ]) {
      expect(renderSource).toContain(marker)
    }
    for (const marker of [
      '--judgement-line: 82%;',
      'top: var(--judgement-line);',
      '.hit-anchor {',
      '.hit-anchor-center',
      '.track-target.current.is-approaching b',
      '.track-target.current.is-aligned b',
    ]) {
      expect(styles).toContain(marker)
    }
  })

  it('判定座標只以 30px 方塊的中心定位，並讓中央準星直接使用三軌 grid 的中央欄', () => {
    for (const marker of [
      '固定 -15px（方塊高度 30px 的一半）',
      '方塊幾何中心精確落在',
    ]) {
      expect(renderSource).toContain(marker)
    }
    for (const marker of [
      'height: 30px;',
      'translate(var(--queue-shift, 0px), -15px)',
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
      '.hit-anchor {',
      'justify-self: center;',
      'align-self: center;',
      'grid-template-rows: 2px;',
      'transform: none;',
    ]) {
      expect(styles).toContain(marker)
    }
  })
})
