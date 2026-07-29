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
})
