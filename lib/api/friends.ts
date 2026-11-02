import { request } from './client';

export type FriendEntry = { request_id: string; user_id: string; username: string; nationality: string; created_at: string };
export type FriendDirectory = { friends: FriendEntry[]; incoming_requests: FriendEntry[]; outgoing_requests: FriendEntry[] };
export type FriendSearchPlayer = { user_id: string; username: string; nationality: string };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const getFriends = (token: string) => request<FriendDirectory>('/api/friends', { headers: auth(token) });
export const searchFriends = (token: string, username: string) => request<{ players: FriendSearchPlayer[] }>(
  `/api/friends/search?username=${encodeURIComponent(username)}`, { headers: auth(token) },
);
export const sendFriendRequest = (token: string, username: string) => request<{ status: string; username: string }>(
  '/api/friends/requests', { method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) },
);
export const respondToFriendRequest = (token: string, requestId: string, accept: boolean) => request<{ status: string }>(
  `/api/friends/requests/${requestId}${accept ? '/accept' : ''}`,
  { method: accept ? 'POST' : 'DELETE', headers: auth(token) },
);
