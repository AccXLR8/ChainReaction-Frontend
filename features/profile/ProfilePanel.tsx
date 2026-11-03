'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, request } from '@/lib/api/client';
import {
  getAvatars,
  getMyProfile,
  getPublicProfile,
  updateMyProfile,
} from '@/lib/api/profiles';
import type { Avatar, PlayerProfile } from './types';
import type { SessionUser } from '@/features/auth/types';
import { NationalityDisplay } from '@/features/nationality/NationalityDisplay';
import { NationalityPicker } from '@/features/nationality/NationalityPicker';
import { normalizeNationality } from '@/features/nationality/countries';
import { isStrongPassword } from '@/features/auth/password-validation';
import { getFriends, searchFriends, sendFriendRequest, respondToFriendRequest } from '@/lib/api/friends';
import type { FriendDirectory, FriendSearchPlayer } from '@/lib/api/friends';

type ProfilePanelProps = {
  token: string | null;
  user: SessionUser | null;
  onClose: () => void;
  onRequestSignIn: () => void;
  onProfileUpdated: (username: string, nationality: string) => void;
  onSessionExpired: () => void;
};

/** Fixed-window account/profile view with private editing and public username lookup. */
export function ProfilePanel({
  token,
  user,
  onClose,
  onRequestSignIn,
  onProfileUpdated,
  onSessionExpired,
}: ProfilePanelProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [friendDirectory, setFriendDirectory] = useState<FriendDirectory>({ friends: [], incoming_requests: [], outgoing_requests: [] });
  const [friendSearch, setFriendSearch] = useState('');
  const [friendResults, setFriendResults] = useState<FriendSearchPlayer[]>([]);
  const [friendBusyId, setFriendBusyId] = useState('');
  const [lookup, setLookup] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarId, setEditAvatarId] = useState<number | null>(null);
  const [editNationality, setEditNationality] = useState('global');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const onExpiredRef = useRef(onSessionExpired);
  onExpiredRef.current = onSessionExpired;

  useEffect(() => {
    let active = true;

    const loadPanel = async () => {
      setLoading(true);
      setError('');
      const [avatarResult, profileResult] = await Promise.allSettled([
        getAvatars(),
        token ? getMyProfile(token) : Promise.resolve(null),
      ]);
      if (!active) return;

      if (avatarResult.status === 'fulfilled') setAvatars(avatarResult.value);
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

  useEffect(() => {
    if (!token || user?.is_guest) return;
    getFriends(token).then(setFriendDirectory).catch((cause) => {
      if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current();
      else setError(cause instanceof Error ? cause.message : 'Could not load your friends.');
    });
  }, [token, user?.is_guest]);

  const canEdit = Boolean(token && user && profile?.user_id === user.id);

  const refreshFriends = async () => {
    if (!token || user?.is_guest) return;
    setFriendDirectory(await getFriends(token));
  };

  const searchFriendAccounts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !friendSearch.trim()) return;
    setFriendBusyId('search');
    setError('');
    try {
      const result = await searchFriends(token, friendSearch.trim());
      setFriendResults(result.players);
      if (!result.players.length) setNotice('No players found with that username.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not search players.');
    } finally { setFriendBusyId(''); }
  };

  const requestFriend = async (username: string) => {
    if (!token) return;
    setFriendBusyId(username);
    setError('');
    setNotice('');
    try {
      await sendFriendRequest(token, username);
      setNotice(`Friend request sent to ${username}.`);
      setFriendResults((players) => players.filter((player) => player.username !== username));
      await refreshFriends();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send friend request.'); }
    finally { setFriendBusyId(''); }
  };

  const handleFriendRequest = async (requestId: string, accept: boolean) => {
    if (!token) return;
    setFriendBusyId(requestId);
    try {
      await respondToFriendRequest(token, requestId, accept);
      await refreshFriends();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update friend request.'); }
    finally { setFriendBusyId(''); }
  };

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
    setEditNationality(user?.is_guest ? 'global' : normalizeNationality(profile.nationality));
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

    const nationality = user?.is_guest ? 'global' : normalizeNationality(editNationality);
    const update: { username?: string; avatar_id?: number; nationality?: string } = {};
    if (username !== profile.username) update.username = username;
    if (editAvatarId !== profile.avatar.id) update.avatar_id = editAvatarId;
    if (!user?.is_guest && nationality !== normalizeNationality(profile.nationality)) {
      update.nationality = nationality;
    }
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
      onProfileUpdated(
        updatedProfile.username,
        user?.is_guest ? 'global' : normalizeNationality(updatedProfile.nationality),
      );
      setNotice('Profile updated.');
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your profile.');
      if (cause instanceof ApiError && cause.status === 401) onExpiredRef.current();
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !currentPassword || !isStrongPassword(newPassword)) {
      setPasswordError('Enter your current password and a new password that meets every requirement.');
      setPasswordMessage('');
      return;
    }

    setPasswordBusy(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Password changed. Your current session remains active.');
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      if (apiError?.status === 401) {
        setPasswordError('Current password is incorrect, or your session has expired.');
      } else if (apiError?.status === 422) {
        setPasswordError(apiError.message || 'The new password does not meet the requirements.');
      } else {
        // Preserve backend rate-limit and service-unavailable details for the player.
        setPasswordError(cause instanceof Error ? cause.message : 'Could not change your password.');
      }
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
      <section className="profile-panel profile-page arena-content-page" aria-labelledby="profile-title">
        <header className="profile-panel-head">
          <div>
            <span className="eyebrow-mini">PLAYER ACCOUNT</span>
            <h2 id="profile-title">Player profile</h2>
          </div>
          <button className="rules-close" type="button" onClick={onClose} aria-label="Back to play">×</button>
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
                  <h3>
                    {profile.username}
                    <NationalityDisplay
                      value={canEdit && user?.is_guest ? 'global' : profile.nationality}
                      className="profile-country-display"
                    />
                  </h3>
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
                      pattern="[A-Za-z0-9_\x2d]{3,24}"
                      title="Use 3–24 ASCII letters, numbers, underscores, or hyphens."
                      value={editUsername}
                      onChange={(event) => setEditUsername(event.target.value)}
                    />
                  </label>
                  {!user?.is_guest && (
                    <NationalityPicker
                      id="profile-nationality"
                      value={editNationality}
                      onChange={setEditNationality}
                    />
                  )}
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

              {canEdit && !user?.is_guest && (
                <section className="profile-section password-section">
                  <div className="profile-section-title">
                    <h3>Change password</h3>
                    <span>SECURE YOUR ACCOUNT</span>
                  </div>
                  <form className="password-change-form" onSubmit={changePassword}>
                    <label>
                      Current password
                      <input autoComplete="current-password" maxLength={128} required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                    </label>
                    <label>
                      New password
                      <input autoComplete="new-password" minLength={8} maxLength={128} required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    </label>
                    <ul className="password-requirements">
                      <li>At least 8 characters</li>
                      <li>Lowercase and uppercase letters</li>
                      <li>At least one number and one symbol</li>
                    </ul>
                    <button className="profile-save" type="submit" disabled={passwordBusy}>
                      {passwordBusy ? 'Changing…' : 'Change password'}
                    </button>
                    {passwordError && <p className="profile-error" role="alert">{passwordError}</p>}
                    {passwordMessage && <p className="profile-notice" role="status">{passwordMessage}</p>}
                  </form>
                </section>
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

              {profile.achievements.length > 0 && (
                <section className="profile-section profile-achievements">
                  <div className="profile-section-title">
                    <h3>Achievements</h3>
                    <span>{profile.achievements.filter((achievement) => achievement.unlocked).length} / {profile.achievements.length} UNLOCKED</span>
                  </div>
                  <div className="achievement-grid">
                    {profile.achievements.map((achievement) => (
                      <article className={`achievement-card ${achievement.unlocked ? '' : 'is-locked'}`} key={achievement.code}>
                        <img src={achievement.badge_image_url} alt="" />
                        <div>
                          <h4>{achievement.name}</h4>
                          <p>{achievement.description}</p>
                          {achievement.orb_skin_reward_ids?.length ? (
                            <small>{achievement.orb_skin_reward_ids.length} ORB SKIN REWARD{achievement.orb_skin_reward_ids.length === 1 ? '' : 'S'}</small>
                          ) : null}
                          {achievement.unlocked && achievement.earned_at && <small> · UNLOCKED {formatDate(achievement.earned_at)}</small>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              <section className="profile-section profile-friends">
                <div className="profile-section-title">
                  <h3>Friends</h3>
                  <span>{friendDirectory.friends.length} FRIENDS</span>
                </div>
                {canEdit && !user?.is_guest ? <>
                  <form className="friend-search" onSubmit={searchFriendAccounts}>
                    <label htmlFor="friend-search-input">Find players by username</label>
                    <div><input id="friend-search-input" maxLength={64} value={friendSearch} onChange={(event) => setFriendSearch(event.target.value)} placeholder="Search a username" />
                    <button className="profile-save" type="submit" disabled={friendBusyId === 'search' || !friendSearch.trim()}>{friendBusyId === 'search' ? 'Searching…' : 'Search'}</button></div>
                  </form>
                  {friendResults.map((player) => <div className="friend-row" key={player.user_id}><span>{player.username}</span><button className="profile-secondary" type="button" disabled={friendBusyId === player.username} onClick={() => void requestFriend(player.username)}>{friendBusyId === player.username ? 'Sending…' : 'Add friend'}</button></div>)}
                  {friendDirectory.incoming_requests.map((friend) => <div className="friend-row" key={friend.request_id}><span>{friend.username} <small>sent you a request</small></span><div><button type="button" className="profile-save" disabled={friendBusyId === friend.request_id} onClick={() => void handleFriendRequest(friend.request_id, true)}>Accept</button><button type="button" className="profile-secondary" disabled={friendBusyId === friend.request_id} onClick={() => void handleFriendRequest(friend.request_id, false)}>Decline</button></div></div>)}
                  {friendDirectory.outgoing_requests.map((friend) => <div className="friend-row" key={friend.request_id}><span>{friend.username} <small>request pending</small></span><button type="button" className="profile-secondary" disabled={friendBusyId === friend.request_id} onClick={() => void handleFriendRequest(friend.request_id, false)}>Cancel</button></div>)}
                  {friendDirectory.friends.map((friend) => <div className="friend-row" key={friend.user_id}><span>{friend.username}</span><small>FRIEND</small></div>)}
                </> : <p className="profile-muted">{user?.is_guest ? 'Sign in to search for and add friends.' : 'Friends are available on your own account page.'}</p>}
              </section>
            </>
          )}

          {error && <div className="profile-error" role="alert">{error}</div>}
          {notice && <div className="profile-notice" role="status">{notice}</div>}
        </div>
      </section>
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

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}
