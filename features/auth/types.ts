/** Identity returned by the auth API and stored for the active browser session. */
export type SessionUser = {
  id: string;
  username: string;
  is_guest: boolean;
};

/** Successful response shared by password and guest authentication. */
export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: SessionUser;
};

export type AuthMode = 'login' | 'register' | null;

export type AppStage = 'welcome' | 'lobby' | 'queue' | 'game' | 'finished';
