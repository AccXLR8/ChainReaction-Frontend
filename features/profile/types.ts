export type Avatar = {
  id: number;
  code: string;
  name: string;
  image_url: string;
};

export type PlayerStats = {
  matches_played: number;
  matches_won: number;
  win_rate: number;
  current_win_streak: number;
  longest_win_streak: number;
  longest_chain: number;
};

export type Achievement = {
  code: string;
  name: string;
  description: string;
  badge_image_url: string;
  earned_at: string | null;
  unlocked: boolean;
};

export type PlayerProfile = {
  user_id: string;
  username: string;
  avatar: Avatar;
  stats: PlayerStats;
  achievements: Achievement[];
  created_at: string;
  profile_age_days: number;
};

export type AvatarListResponse = { avatars: Avatar[] };
export type AchievementListResponse = { achievements: Achievement[] };
