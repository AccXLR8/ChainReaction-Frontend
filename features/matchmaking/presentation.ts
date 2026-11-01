import type { MatchmakingMode } from './api';

/** Narrow persisted values to matchmaking modes supported by this frontend. */
export function isMatchmakingMode(value: string | null): value is MatchmakingMode {
  return value === 'standard' || value === 'mini' || value === 'ranked';
}

/** Human-readable queue name used in notices and status copy. */
export function matchmakingModeName(mode: MatchmakingMode): string {
  return mode === 'mini' ? 'Mini' : mode === 'ranked' ? 'Ranked' : 'Standard';
}
