import type { Cell, GameState, RawReactionStep } from '@/features/game/types';

/** A stable 4×4 position with one-, two-, and three-orb examples. */
const initialOrbs: Record<number, Cell> = {
  0: { owner: 0, orb_count: 1 },
  1: { owner: 0, orb_count: 2 },
  4: { owner: 0, orb_count: 2 },
  7: { owner: 0, orb_count: 3 },
};

export const ORB_SKIN_PREVIEW_GAME: GameState = {
  board: {
    width: 4,
    height: 4,
    cells: Array.from({ length: 16 }, (_, index) =>
      initialOrbs[index] ?? { owner: null, orb_count: 0 },
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

/**
 * Engine-shaped reaction steps for the sample: a corner bursts, its two edge
 * neighbors burst together, then the corner bursts once more. The preview feeds
 * these through the same playback hook as accepted live-game reactions.
 */
export const ORB_SKIN_PREVIEW_STEPS: RawReactionStep[] = [
  {
    explosions: [{ cell: 0, player: 0 }],
    transfers: [
      { from_cell: 0, to_cell: 1, player: 0 },
      { from_cell: 0, to_cell: 4, player: 0 },
    ],
  },
  {
    explosions: [{ cell: 1, player: 0 }, { cell: 4, player: 0 }],
    transfers: [
      { from_cell: 1, to_cell: 0, player: 0 },
      { from_cell: 1, to_cell: 2, player: 0 },
      { from_cell: 1, to_cell: 5, player: 0 },
      { from_cell: 4, to_cell: 0, player: 0 },
      { from_cell: 4, to_cell: 5, player: 0 },
      { from_cell: 4, to_cell: 8, player: 0 },
    ],
  },
  {
    explosions: [{ cell: 0, player: 0 }],
    transfers: [
      { from_cell: 0, to_cell: 1, player: 0 },
      { from_cell: 0, to_cell: 4, player: 0 },
    ],
  },
];

export const ORB_SKIN_PREVIEW_FINAL_CELLS: Cell[] = Array.from(
  { length: 16 },
  (_, index) => ({
    1: { owner: 0, orb_count: 1 },
    2: { owner: 0, orb_count: 1 },
    4: { owner: 0, orb_count: 1 },
    5: { owner: 0, orb_count: 2 },
    7: { owner: 0, orb_count: 3 },
    8: { owner: 0, orb_count: 1 },
  }[index] ?? { owner: null, orb_count: 0 }),
);
