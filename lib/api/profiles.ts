import type {
  Achievement,
  AchievementListResponse,
  Avatar,
  AvatarListResponse,
  PlayerProfile,
} from '@/features/profile/types';
import { request } from './client';

const authHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
});

export async function getMyProfile(token: string): Promise<PlayerProfile> {
  return request<PlayerProfile>('/api/profiles/me', {
    headers: authHeaders(token),
  });
}

export async function getPublicProfile(username: string): Promise<PlayerProfile> {
  return request<PlayerProfile>(`/api/profiles/${encodeURIComponent(username)}`);
}

export async function getAvatars(): Promise<Avatar[]> {
  const result = await request<AvatarListResponse>('/api/profiles/avatars');
  return result.avatars;
}

export async function getAchievementCatalog(): Promise<Achievement[]> {
  const result = await request<AchievementListResponse>('/api/profiles/achievements');
  return result.achievements;
}

export async function updateMyProfile(
  token: string,
  update: { username?: string; avatar_id?: number },
): Promise<PlayerProfile> {
  return request<PlayerProfile>('/api/profiles/me', {
    method: 'PATCH',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(update),
  });
}
