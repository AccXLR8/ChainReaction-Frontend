import { request } from '@/lib/api/client';

export type MatchmakingMode = 'standard' | 'mini' | 'ranked';

export type MatchmakingReply = {
  status: 'queued' | 'idle' | 'matched' | 'left' | string;
  game_id?: string;
};

const MATCHMAKING_ENDPOINTS: Record<MatchmakingMode, { join: string; status: string; leave: string }> = {
  standard: {
    join: '/api/matchmaking/join',
    status: '/api/matchmaking/status',
    leave: '/api/matchmaking/leave',
  },
  mini: {
    join: '/api/matchmaking/mini/join',
    status: '/api/matchmaking/mini/status',
    leave: '/api/matchmaking/mini/leave',
  },
  ranked: {
    join: '/api/matchmaking/ranked/join',
    status: '/api/matchmaking/ranked/status',
    leave: '/api/matchmaking/ranked/leave',
  },
};

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/** Return the contract paths for the selected queue, keeping endpoint mapping centralized. */
export function getMatchmakingEndpoints(mode: MatchmakingMode) {
  return MATCHMAKING_ENDPOINTS[mode];
}

export function joinMatchmaking(mode: MatchmakingMode, token: string) {
  return request<MatchmakingReply>(MATCHMAKING_ENDPOINTS[mode].join, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export function readMatchmakingStatus(mode: MatchmakingMode, token: string) {
  return request<MatchmakingReply>(MATCHMAKING_ENDPOINTS[mode].status, {
    headers: authHeaders(token),
  });
}

export function leaveMatchmaking(mode: MatchmakingMode, token: string) {
  return request<MatchmakingReply>(MATCHMAKING_ENDPOINTS[mode].leave, {
    method: 'POST',
    headers: authHeaders(token),
  });
}
