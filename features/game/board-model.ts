import type { Cell, GameState, Player } from './types';

export const DEFAULT_BOARD_SIZE = { width: 8, height: 8 };

/** Return the first finite numeric value found under one of the known API keys. */
export function readNumber(
  object: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** List orthogonal board neighbors for a row-major cell index. */
export function getNeighborCells(index: number, width: number, height: number): number[] {
  const row = Math.floor(index / width);
  const column = index % width;
  const neighbors: number[] = [];

  if (row > 0) neighbors.push(index - width);
  if (column < width - 1) neighbors.push(index + 1);
  if (row < height - 1) neighbors.push(index + width);
  if (column > 0) neighbors.push(index - 1);

  return neighbors;
}

/**
 * Accept both REST and engine snapshots, normalizing them to a flat board.
 * The rest of the UI can then use the same row-major representation everywhere.
 */
export function normalizeGameState(input: unknown): GameState {
  const raw = (input ?? {}) as Record<string, unknown>;
  const wrapped = (raw.final_state ?? raw.state ?? raw) as Record<string, unknown>;
  const board = (wrapped.board ?? {}) as Record<string, unknown>;
  const snapshot =
    wrapped.board_snapshot ??
    wrapped.boardSnapshot ??
    (Array.isArray(wrapped.board) ? wrapped.board : undefined) ??
    board.cells;

  if (!Array.isArray(snapshot)) {
    throw new Error(
      `Board snapshot missing (state fields: ${Object.keys(wrapped).join(', ') || 'none'}).`,
    );
  }

  const rows = Array.isArray(snapshot[0])
    ? (snapshot as (Cell | null)[][])
    : [snapshot as (Cell | null)[]];
  const width = Number(wrapped.width ?? board.width ?? rows[0]?.length ?? 0);
  const height = Number(wrapped.height ?? board.height ?? rows.length);
  const rawStatus = wrapped.status as
    | GameState['status']
    | { Won?: { winner: number } }
    | string
    | undefined;

  const status =
    typeof rawStatus === 'string'
      ? { kind: rawStatus.toLowerCase() }
      : rawStatus && 'Won' in rawStatus && rawStatus.Won
        ? { kind: 'won', winner: rawStatus.Won.winner }
        : (rawStatus as GameState['status'] | undefined) ?? { kind: 'active' };

  return {
    board: {
      width,
      height,
      cells: rows.flat().map((cell) => cell ?? { owner: null, orb_count: 0 }),
    },
    players:
      (wrapped.players as Player[] | undefined) ?? [
        { id: 0, eliminated: false, has_moved: false },
        { id: 1, eliminated: false, has_moved: false },
      ],
    current_player_index: Number(
      wrapped.current_player ?? wrapped.current_player_index ?? 0,
    ),
    turn_number: Number(wrapped.turn_number ?? 0),
    status,
  };
}

/** Keep each cell square while fitting the widest board dimension in the arena. */
export function getCellSize(
  viewportWidth: number,
  boardWidth: number,
  boardHeight: number,
  viewportHeight = 900,
  reservedHeight = 0,
): number {
  const longestSide = Math.max(boardWidth, boardHeight);
  const availableWidth = Math.max(
    220,
    viewportWidth < 700
      ? viewportWidth - 36
      : viewportWidth <= 900
        ? (viewportWidth - 90) / 2
        : (viewportWidth - 136) / 2,
  );
  // Fit the board after accounting for the fixed shell and any player tags around it.
  const availableHeight = Math.max(
    180,
    (viewportWidth < 700 ? viewportHeight * 0.61 - 48 : viewportHeight - 162) - reservedHeight,
  );
  const boardEdge = Math.min(availableWidth, availableHeight);

  const fittedCellSize = Math.floor((boardEdge - 3 * (longestSide - 1)) / longestSide);
  // Add roughly 5 mm to each side of wide-screen boards while keeping phone layouts unchanged.
  const screenExpansion = viewportWidth >= 901 ? 5 : viewportWidth >= 701 ? 3 : 0;
  const maxCellSize = viewportWidth >= 901 ? 105 : viewportWidth >= 701 ? 103 : 100;
  return Math.max(24, Math.min(maxCellSize, fittedCellSize + screenExpansion));
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
