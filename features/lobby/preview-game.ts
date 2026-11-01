import type { Cell, GameState } from '@/features/game/types';

/** Fixed 8×8 sample position shown in the lobby before a live match begins. */
const PREVIEW_ORBS: Record<number, Cell> = {
  18: { owner: 0, orb_count: 1 },
  19: { owner: 0, orb_count: 2 },
  20: { owner: 1, orb_count: 1 },
  26: { owner: 0, orb_count: 2 },
  27: { owner: 0, orb_count: 3 },
  28: { owner: 1, orb_count: 2 },
  35: { owner: 0, orb_count: 1 },
  36: { owner: 1, orb_count: 3 },
  43: { owner: 0, orb_count: 1 },
  44: { owner: 1, orb_count: 1 },
};

/** Stable demo board used by the lobby layout and animated board renderer. */
export const LOBBY_PREVIEW_GAME: GameState = {
  board: {
    width: 8,
    height: 8,
    cells: Array.from({ length: 64 }, (_, index) =>
      PREVIEW_ORBS[index] ?? { owner: null, orb_count: 0 },
    ),
  },
  players: [
    { id: 0, eliminated: false, has_moved: true },
    { id: 1, eliminated: false, has_moved: true },
  ],
  current_player_index: 0,
  turn_number: 8,
  status: { kind: 'active' },
};
