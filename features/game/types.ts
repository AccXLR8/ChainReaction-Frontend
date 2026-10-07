/** Client-side board model; cells are stored as a row-major flat array. */
export type Cell = {
  owner: number | null;
  orb_count: number;
};

export type Player = {
  id: number;
  eliminated: boolean;
  has_moved: boolean;
};

export type GameState = {
  board: {
    width: number;
    height: number;
    cells: Cell[];
  };
  players: Player[];
  current_player_index: number;
  turn_number: number;
  status: {
    kind: string;
    winner?: number | null;
    eliminated?: number[];
  };
};

export type Transfer = {
  from: number;
  to: number;
  player: number;
};

/** A single visual phase from the engine's reaction timeline. */
export type ReactionEffects = {
  charge: number[];
  burst: { cell: number; player: number }[];
  receive: { cell: number; player: number }[];
};

export type RawReactionStep = {
  explosions?: Record<string, unknown>[];
  transfers?: Record<string, unknown>[];
};

export type AcceptedMove = {
  sequence?: number;
  final_state: unknown;
  status?: string;
  current_player_slot?: number;
  cell?: number;
  player_slot?: number;
  client_move_id?: string;
  reaction?: {
    placement?: { cell: number; player: number };
    steps?: RawReactionStep[];
  };
};

export type PlayerSlot = 0 | 1;
