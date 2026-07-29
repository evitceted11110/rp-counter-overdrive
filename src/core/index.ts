export type GameState = {
  seed: string
  turn: number
}

export function createInitialState(seed: string): GameState {
  if (seed.length === 0) throw new Error('seed 不得為空字串')
  return { seed, turn: 0 }
}
