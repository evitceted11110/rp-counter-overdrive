import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const renderSource = readFileSync(
  new URL('./main.ts', import.meta.url),
  'utf8',
)
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const visibleTemplate =
  renderSource.match(/root\.innerHTML = `([\s\S]*?)`\n\nconst query/)?.[1] ?? ''

describe('單畫面繁體中文介面', () => {
  it('鎖定 viewport 並禁止頁面滾動', () => {
    expect(styles).toContain('html,\nbody,\n#app')
    expect(styles).toContain('overflow: hidden;')
    expect(styles).toContain('height: 100dvh;')
    expect(styles).toContain('min-width: 960px;')
  })

  it('主要操作、狀態與結算均使用繁體中文', () => {
    for (const label of [
      '威脅階級',
      '完整度',
      '相位',
      '反擊窗口',
      '制動核心',
      '方向反擊',
      '音訊設定',
      '全部靜音',
      '音樂',
      '效果',
      '介面',
      '重新挑戰',
    ]) {
      expect(visibleTemplate).toContain(label)
    }
  })

  it('音訊需由玩家操作解鎖，並提供三組音量與全域靜音', () => {
    expect(renderSource).toContain("await audioDirector.unlock()")
    expect(renderSource).toContain("audioDirector.startMusic()")
    expect(renderSource.indexOf('await audioDirector.unlock()')).toBeLessThan(
      renderSource.indexOf('audioDirector.startMusic()'),
    )
    for (const bus of ['music', 'effects', 'interface']) {
      expect(visibleTemplate).toContain(`data-bus="${bus}"`)
    }
    expect(visibleTemplate).toContain('class="mute-button"')
  })

  it('使用固定鍵位提示，不以箭頭朝向代表應按方向', () => {
    for (const key of ['W', 'A', 'S', 'D', 'Shift']) {
      expect(visibleTemplate).toContain(`<kbd>${key}</kbd>`)
    }
    expect(renderSource).toContain("arrow.textContent = ''")
    expect(renderSource).toContain('directionKey(attack.direction)')
    expect(styles).toContain('.direction-guide.active')
  })

  it('不直接顯示內部英文遊戲術語', () => {
    for (const banned of [
      '>Threat<',
      '>Perfect<',
      '>Phase<',
      '>Boss HP<',
      '>Restart<',
      '>Turn<',
    ]) {
      expect(visibleTemplate).not.toContain(banned)
    }
  })
})
