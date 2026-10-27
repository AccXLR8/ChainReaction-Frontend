'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getAchievementCatalog,
  getAvatars,
  getMyProfile,
  getPublicProfile,
  updateMyProfile,
} from '@/lib/api/profiles';
import type { Achievement, Avatar, PlayerProfile } from './types';
import type { SessionUser } from '@/features/auth/types';

type ProfilePanelProps = {
  token: string | null;
  user: SessionUser | null;
  onClose: () => void;
  onRequestSignIn: () => void;
  onUsernameUpdated: (username: string) => void;
  onSessionExpired: () => void;
};

/** Fixed-window account/profile view with private editing and public username lookup. */
export function ProfilePanel({
  token,
  user,
  onClose,
  onRequestSignIn,
  onUsernameUpdated,
  onSessionExpired,
}: ProfilePanelProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [achievementCatalog, setAchievementCatalog] = useState<Achievement[]>([]);
  const [lookup, setLookup] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarId, setEditAvatarId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const onExpiredRef = useRef(onSessionExpired);
  onExpiredRef.current = onSessionExpired;

  useEffect(() => {
    let active = true;

    const loadPanel = async () => {
      setLoading(true);
      setError('');
      const [avatarResult, achievementResult, profileResult] = await Promise.allSettled([
        getAvatars(),
        getAchievementCatalog(),
        token ? getMyProfile(token) : Promise.resolve(null),
      ]);
      if (!active) return;

      if (avatarResult.status === 'fulfilled') setAvatars(avatarResult.value);
      if (achievementResult.status === 'fulfilled') setAchievementCatalog(achievementResult.value);

      if (profileResult.status === 'fulfilled' && profileResult.value) {
        setProfile(profileResult.value);
        setLookup(profileResult.value.username);
      } else if (profileResult.status === 'rejected') {
        const cause = profileResult.reason;
        if (cause instanceof ApiError && cause.status === 401) {
          onExpiredRef.current();
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load your profile.');
      }
      setLoading(false);
    };

    void loadPanel();
    return () => {
      active = false;
    };
  }, [token]);

  const canEdit = Boolean(token && user && profile?.user_id === user.id);

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = lookup.trim();
    if (!username) {
      setError('Enter a username to look up a player.');
      return;
    }

    setSearching(true);
    setError('');
    setNotice('');
    setEditing(false);
    try {
      const result = await getPublicProfile(username);
      setProfile(result);
      setLookup(result.username);
    } catch (cause) {
      setProfile(null);
      setError(cause instanceof Error ? cause.message : 'Could not find that player.');
    } finally {
      setSearching(false);
    }
  };

  const beginEditing = () => {
    if (!profile) return;
    setEditUsername(profile.username);
    setEditAvatarId(profile.avatar.id);
    setError('');
    setNotice('');
    setEditing(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !profile || editAvatarId === null) return;

    const username = editUsername.trim();
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(username)) {
      setError('Use 3–24 letters, numbers, underscores, or hyphens for your username.');
      return;
    }

    const update: { username?: string; avatar_id?: number } = {};
    if (username !== profile.username) update.username = username;
    if (editAvatarId !== profile.avatar.id) update.avatar_id = editAvatarId;
    if (!Object.keys(update).length) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updatedProfile = await updateMyProfile(token, update);
      setProfile(updatedProfile);
      setLookup(updatedProfile.username);
      onUsernameUpdated(updatedProfile.username);
      setNotice('Profile updated.');
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your profile.');
      if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current();
    } finally {
      setSaving(false);
    }
  };

  const achievements = profile?.achievements.length ? profile.achievements : achievementCatalog;

  return (
    <div className="profile-backdrop" role="presentation">
      <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="profile-panel-head">
          <div>
            <span className="eyebrow-mini">PLAYER ACCOUNT</span>
            <h2 id="profile-title">Player profile</h2>
          </div>
          <button className="rules-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
        </header>

        <form className="profile-lookup" onSubmit={handleLookup}>
          <label htmlFor="profile-username-search">Find a player</label>
          <input
            id="profile-username-search"
            maxLength={64}
            placeholder="Search by username"
            value={lookup}
            onChange={(event) => setLookup(event.target.value)}
          />
          <button type="submit" disabled={searching || !lookup.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div className="profile-body" aria-live="polite">
          {loading && <div className="profile-state">Loading player profile…</div>}

          {!loading && !profile && !error && (
            <div className="profile-state profile-empty">
              <span className="eyebrow-mini">LOOK UP A PLAYER</span>
              <h3>{token ? 'Your profile is ready to load' : 'Find a player in the arena'}</h3>
              <p>{token ? 'Search any username to open a public player profile.' : 'Search by username, or sign in to view and edit your own profile.'}</p>
              {!token && <button className="profile-secondary" type="button" onClick={onRequestSignIn}>Sign in with Google</button>}
            </div>
          )}

          {!loading && profile && (
            <>
              <section className="profile-identity">
                <img className="profile-avatar" src={profile.avatar.image_url} alt={profile.avatar.name} />
                <div className="profile-identity-copy">
                  <span className="eyebrow-mini">{canEdit ? 'YOUR ARENA PROFILE' : 'PLAYER PROFILE'}</span>
                  <h3>{profile.username}</h3>
                  <p>{formatDate(profile.created_at)} <span>·</span> Member for {profile.profile_age_days} {profile.profile_age_days === 1 ? 'day' : 'days'}</p>
                </div>
                {canEdit && !editing && (
                  <button className="profile-secondary profile-edit-trigger" type="button" onClick={beginEditing}>Edit profile</button>
                )}
              </section>

              {editing && (
                <form className="profile-editor" onSubmit={saveProfile}>
                  <label className="profile-editor-name">
                    Username
                    <input
                      autoComplete="nickname"
                      maxLength={24}
                      minLength={3}
                      value={editUsername}
                      onChange={(event) => setEditUsername(event.target.value)}
                    />
                  </label>
                  <fieldset className="avatar-picker">
                    <legend>Choose an avatar</legend>
                    <div className="avatar-options">
                      {avatars.map((avatar) => (
                        <button
                          className={editAvatarId === avatar.id ? 'avatar-choice is-selected' : 'avatar-choice'}
                          key={avatar.id}
                          type="button"
                          aria-pressed={editAvatarId === avatar.id}
                          aria-label={avatar.name}
                          title={avatar.name}
                          onClick={() => setEditAvatarId(avatar.id)}
                        >
                          <img src={avatar.image_url} alt="" />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="profile-editor-actions">
                    <button type="button" className="profile-secondary" onClick={() => setEditing(false)}>Cancel</button>
                    <button type="submit" className="profile-save" disabled={saving || avatars.length === 0}>
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              )}

              <section className="profile-section">
                <div className="profile-section-title">
                  <h3>Match statistics</h3>
                  <span>UPDATED AFTER EACH GAME</span>
                </div>
                <div className="profile-stats-grid">
                  <StatCard label="Matches played" value={profile.stats.matches_played} />
                  <StatCard label="Matches won" value={profile.stats.matches_won} />
                  <StatCard label="Win rate" value={`${profile.stats.win_rate.toFixed(2)}%`} />
                  <StatCard label="Current streak" value={profile.stats.current_win_streak} />
                  <StatCard label="Best streak" value={profile.stats.longest_win_streak} />
                  <StatCard label="Longest chain" value={profile.stats.longest_chain} />
                </div>
              </section>

              <section className="profile-section profile-achievements">
                <div className="profile-section-title">
                  <h3>Achievements</h3>
                  <span>{achievements.filter((achievement) => achievement.unlocked).length} UNLOCKED</span>
                </div>
                {achievements.length ? (
                  <div className="achievement-grid">
                    {achievements.map((achievement) => (
                      <AchievementCard achievement={achievement} key={achievement.code} />
                    ))}
                  </div>
                ) : (
                  <p className="profile-muted">Achievement badges will appear here as you play.</p>
                )}
              </section>
            </>
          )}

          {error && <div className="profile-error" role="alert">{error}</div>}
          {notice && <div className="profile-notice" role="status">{notice}</div>}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="profile-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  return (
    <article className={`achievement-card ${achievement.unlocked ? 'is-unlocked' : 'is-locked'}`}>
      <img src={achievement.badge_image_url} alt="" />
      <div>
        <h4>{achievement.name}</h4>
        <p>{achievement.description}</p>
        <small>{achievement.unlocked ? `EARNED ${formatDate(achievement.earned_at)}` : 'LOCKED'}</small>
      </div>
    </article>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
