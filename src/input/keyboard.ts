import type { CombatAction } from '../core/phrases.js'

type KeyboardTargetLike = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selectors: string) => unknown
}

export type KeyboardEventLike = {
  code: string
  key?: string
  repeat: boolean
  isComposing: boolean
  keyCode?: number
  target: EventTarget | KeyboardTargetLike | null
  preventDefault: () => void
}

const interactiveSelector =
  'input, select, textarea, button, [contenteditable="true"]'
const interactiveTags = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'])

function isInteractiveTarget(
  target: EventTarget | KeyboardTargetLike | null,
): boolean {
  if (target === null) return false
  const candidate = target as KeyboardTargetLike
  if (candidate.isContentEditable === true) return true
  if (
    typeof candidate.tagName === 'string' &&
    interactiveTags.has(candidate.tagName.toUpperCase())
  ) {
    return true
  }
  return candidate.closest?.(interactiveSelector) != null
}

export function combatActionFromKeyboardEvent(
  event: KeyboardEventLike,
): CombatAction | null {
  if (
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    isInteractiveTarget(event.target)
  ) {
    return null
  }
  return (
    {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      Space: 'center',
    } satisfies Readonly<Record<string, CombatAction>>
  )[event.code] ?? null
}

export function routeCombatKeyboardEvent(
  event: KeyboardEventLike,
  enabled: boolean,
  onAction: (action: CombatAction) => void,
): boolean {
  if (!enabled) return false
  const action = combatActionFromKeyboardEvent(event)
  if (action === null) return false
  event.preventDefault()
  onAction(action)
  return true
}
