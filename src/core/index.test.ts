import { describe, expect, it } from 'vitest'
import { createInitialState } from './index.js'

describe('createInitialState', () => {
  it('建立可重播的初始狀態', () => {
    expect(createInitialState('demo')).toEqual({ seed: 'demo', turn: 0 })
  })
})
