import { connect } from '@rogue-paradise/platform-sdk'
import { createInitialState } from '../core/index.js'
import { theme } from '../visual/theme.js'

const root = document.querySelector<HTMLElement>('#app')
if (root === null) throw new Error('找不到 #app')

const sdk = await connect({ gameSlug: 'counter-overdrive' })
const state = createInitialState('vertical-slice')

root.style.background = theme.background
root.style.color = theme.foreground
root.textContent = `反擊超載 — ${sdk.mode} — turn ${state.turn}`
