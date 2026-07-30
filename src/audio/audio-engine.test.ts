import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./audio-engine.ts', import.meta.url), 'utf8')

describe('Boss call 相位音訊契約', () => {
  it('命中確認聲以玩家按下的現在時間播放，只有樂句裝飾保留格點對齊', () => {
    expect(source).toContain('const feedbackAt = this.resolveContextTime()')
    expect(source).toContain(
      'const musicalAt = this.resolveContextTime(options.atPerformanceMs)',
    )
    expect(source).toContain(
      "this.playLaneCue(options.lane, feedbackAt, true, 'player')",
    )
    expect(source).toContain("'triangle',\n        musicalAt,")
    expect(source).toContain('at: musicalAt + eighthSecondsForTier(this.tempoTier)')
    expect(source).toContain('this.duckMusicalBed(4.5, feedbackAt, 0.13)')
  })

  it('統一 pickup 只在 slot 3，不能為每個 target 排入 response 區', () => {
    expect(source).toContain("if (position.slot === 3) {")
    expect(source).toContain("this.pickup(at, 'center')")
    expect(source).not.toContain('targetAt - eighth')
    expect(source).toContain('Boss cue 永遠不會滲入玩家的 response slots 4–7')
  })

  it('每個固定音符在自己的 performance target time 排入音樂 response accent', () => {
    expect(source).toContain('export type TargetAccentOptions')
    expect(source).toContain('scheduleTargetAccent(options: TargetAccentOptions)')
    expect(source).toContain('const at = this.resolveContextTime(options.targetAtPerformanceMs)')
    expect(source).toContain("bus: 'rhythm'")
    expect(source).toContain('Web Audio keeps this sample-accurate')
  })

  it('背景切換後可重建或恢復 AudioContext，未播放的 target accent 可取消', () => {
    expect(source).toContain("if (this.context?.state === 'closed')")
    expect(source).toContain('async unlock(): Promise<boolean>')
    expect(source).toContain('await context.resume()')
    expect(source).toContain('return isContextRunning(context)')
    expect(source).toContain('this.cancelTargetAccentsFrom(Number.NEGATIVE_INFINITY)')
    expect(source).toContain('cancelTargetAccentsFrom(targetPerformanceMs: number)')
    expect(source).toContain('this.pendingTargetAccents.delete(token)')
  })

  it('終曲先關閉 transport 與未發聲 Boss call，並鎖住後續目標音效', () => {
    expect(source).toContain("export type EncounterFinaleOutcome = 'victory' | 'defeat'")
    expect(source).toContain('playEncounterFinale(')
    expect(source).toContain('this.finalizing = true')
    expect(source).toContain('this.stopTransport()')
    expect(source).toContain('if (this.finalizing) return')
    expect(source).toContain('this.scheduleFinaleBar(outcome, at, eighth)')
  })

  it('終曲是一整個 4/4 小節，不以介面提示音直接切畫面', () => {
    expect(source).toContain('const durationSeconds = eighth * 8 + 0.42')
    expect(source).toContain('for (let slot = 0; slot < 8; slot += 1)')
    expect(source).toContain('const chordAt = at + eighth * (victory ? 6 : 5)')
  })
})
