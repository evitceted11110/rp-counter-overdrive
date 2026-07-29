import { describe, expect, it, vi } from 'vitest'
import {
  combatActionFromKeyboardEvent,
  routeCombatKeyboardEvent,
  type KeyboardEventLike,
} from './keyboard.js'

function keyboardEvent(
  overrides: Partial<KeyboardEventLike> = {},
): KeyboardEventLike {
  return {
    code: 'ArrowLeft',
    key: 'Process',
    repeat: false,
    isComposing: false,
    keyCode: 0,
    target: null,
    preventDefault: vi.fn(),
    ...overrides,
  }
}

describe('IME-safe keyboard router', () => {
  it('只依 code 對應左、右、中央，不受 key 字元影響', () => {
    expect(
      combatActionFromKeyboardEvent(keyboardEvent({ code: 'ArrowLeft', key: '注' })),
    ).toBe('left')
    expect(
      combatActionFromKeyboardEvent(
        keyboardEvent({ code: 'ArrowRight', key: 'Unidentified' }),
      ),
    ).toBe('right')
    expect(
      combatActionFromKeyboardEvent(keyboardEvent({ code: 'Space', key: 'Process' })),
    ).toBe('center')
  })

  it('忽略 composing、舊式 229 與 repeat', () => {
    expect(
      combatActionFromKeyboardEvent(keyboardEvent({ isComposing: true })),
    ).toBeNull()
    expect(combatActionFromKeyboardEvent(keyboardEvent({ keyCode: 229 }))).toBeNull()
    expect(combatActionFromKeyboardEvent(keyboardEvent({ repeat: true }))).toBeNull()
  })

  it('互動元件與其內部節點保留原生鍵盤操作', () => {
    expect(
      combatActionFromKeyboardEvent(
        keyboardEvent({ target: { tagName: 'INPUT' } }),
      ),
    ).toBeNull()
    expect(
      combatActionFromKeyboardEvent(
        keyboardEvent({
          target: {
            tagName: 'SPAN',
            closest: () => ({ tagName: 'BUTTON' }),
          },
        }),
      ),
    ).toBeNull()
    expect(
      combatActionFromKeyboardEvent(
        keyboardEvent({ target: { tagName: 'DIV', isContentEditable: true } }),
      ),
    ).toBeNull()
  })

  it('只有啟用且已處理的戰鬥鍵會 preventDefault', () => {
    const handled = keyboardEvent({ code: 'ArrowRight' })
    const onAction = vi.fn()
    expect(routeCombatKeyboardEvent(handled, true, onAction)).toBe(true)
    expect(handled.preventDefault).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith('right')

    const disabled = keyboardEvent({ code: 'Space' })
    expect(routeCombatKeyboardEvent(disabled, false, onAction)).toBe(false)
    expect(disabled.preventDefault).not.toHaveBeenCalled()

    const unrelated = keyboardEvent({ code: 'Escape' })
    expect(routeCombatKeyboardEvent(unrelated, true, onAction)).toBe(false)
    expect(unrelated.preventDefault).not.toHaveBeenCalled()
  })
})
