import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./audio-engine.ts', import.meta.url), 'utf8')

describe('Boss call 相位音訊契約', () => {
  it('統一 pickup 只在 slot 3，不能為每個 target 排入 response 區', () => {
    expect(source).toContain("if (position.slot === 3) {")
    expect(source).toContain("this.pickup(at, 'center')")
    expect(source).not.toContain('targetAt - eighth')
    expect(source).toContain('Boss cue 永遠不會滲入玩家的 response slots 4–7')
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
