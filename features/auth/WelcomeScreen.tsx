'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AppStage, AuthMode, SessionUser } from './types';
import { HowToPlay } from './HowToPlay';
import { AuthDialog } from './AuthDialog';
import { ProfilePanel } from '@/features/profile/ProfilePanel';
import { OrbSkinsPanel } from '@/features/skins/OrbSkinsPanel';
import { MenuBoardPreview } from './MenuBoardPreview';
import type { BoardPanelProps } from '@/features/game/BoardPanel';
import type { MatchmakingMode } from '@/features/matchmaking/api';
import { WelcomeHeader } from '@/features/lobby/WelcomeHeader';
import { MatchmakingPanel } from '@/features/matchmaking/MatchmakingPanel';

type WelcomeScreenProps = {
  authMode: AuthMode;
  authError: string;
  errorMessage: string;
  authBusy: boolean;
  serviceStatus: string;
  user: SessionUser | null;
  sessionToken: string | null;
  stage: AppStage;
  queueMode: MatchmakingMode;
  queueBusy: boolean;
  queueAction: 'joining' | 'checking' | null;
  notice: string;
  previewBoard: BoardPanelProps;
  onAuthModeChange: (mode: AuthMode) => void;
  onGoogleSignIn: (credential: string) => void;
  onGoogleError: (message: string) => void;
  onManualAuth: (mode: 'login' | 'register', username: string, password: string, nationality: string) => void;
  onSessionProfileUpdate: (username: string, nationality: string) => void;
  onSessionExpired: () => void;
  onCreateGuestForSkins: () => Promise<void>;
  onSkinEquipped: (skinId: string) => void;
  onFindMatch: (mode: MatchmakingMode) => void;
  onCancelSearch: () => void;
  onSignOut: () => void;
};

/** Shared entry, account, lobby, and matchmaking screen. */
export function WelcomeScreen({
  authMode,
  authError,
  errorMessage,
  authBusy,
  serviceStatus,
  user,
  sessionToken,
  stage,
  queueMode,
  queueBusy,
  queueAction,
  notice,
  previewBoard,
  onAuthModeChange,
  onGoogleSignIn,
  onGoogleError,
  onManualAuth,
  onSessionProfileUpdate,
  onSessionExpired,
  onCreateGuestForSkins,
  onSkinEquipped,
  onFindMatch,
  onCancelSearch,
  onSignOut,
}: WelcomeScreenProps) {
  const rankedLocked = !user || user.is_guest;
  const [showRules, setShowRules] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOrbSkins, setShowOrbSkins] = useState(false);
  return (
    <main className={`welcome-shell ${authMode ? 'has-auth-form' : ''}`}>
      <div className="welcome-noise" />

      <WelcomeHeader
        serviceStatus={serviceStatus}
        user={user}
        showRules={showRules}
        showProfile={showProfile}
        showOrbSkins={showOrbSkins}
        onShowRules={setShowRules}
        onShowProfile={setShowProfile}
        onShowOrbSkins={setShowOrbSkins}
        onSignIn={() => onAuthModeChange('login')}
        onSignOut={onSignOut}
      />

      <section
        className="play-stage"
        id="welcome"
        style={{ '--board-stage-height': `${previewBoard.stageHeight}px` } as CSSProperties}
      >
        <MenuBoardPreview board={previewBoard} />
        <MatchmakingPanel
          stage={stage}
          queueMode={queueMode}
          queueBusy={queueBusy}
          queueAction={queueAction}
          notice={notice}
          errorMessage={errorMessage}
          rankedLocked={rankedLocked}
          onFindMatch={onFindMatch}
          onCancelSearch={onCancelSearch}
        />
      </section>

      {authMode && !user && (
        <AuthDialog
          mode={authMode}
          error={authError}
          busy={authBusy}
          onModeChange={onAuthModeChange}
          onGoogleSignIn={onGoogleSignIn}
          onGoogleError={onGoogleError}
          onManualAuth={onManualAuth}
        />
      )}

      {showProfile && (
        <ProfilePanel
          token={sessionToken}
          user={user}
          onClose={() => setShowProfile(false)}
          onRequestSignIn={() => {
            setShowProfile(false);
            onAuthModeChange('login');
          }}
          onProfileUpdated={onSessionProfileUpdate}
          onSessionExpired={() => {
            setShowProfile(false);
            onSessionExpired();
          }}
        />
      )}

      {showOrbSkins && (
        <OrbSkinsPanel
          token={sessionToken}
          user={user}
          onClose={() => setShowOrbSkins(false)}
          onRequestSignIn={() => {
            setShowOrbSkins(false);
            onAuthModeChange('login');
          }}
          onCreateGuest={onCreateGuestForSkins}
          onSessionExpired={() => {
            setShowOrbSkins(false);
            onSessionExpired();
          }}
          onSkinEquipped={onSkinEquipped}
        />
      )}

      {showRules && (
        <div className="rules-backdrop">
          <section className="rules-modal" role="dialog" aria-modal="true" aria-label="How to play">
            <div className="rules-modal-head">
              <span className="eyebrow"><i /> LEARN THE ARENA</span>
              <button className="rules-close" onClick={() => setShowRules(false)} aria-label="Close rules">×</button>
            </div>
            <HowToPlay />
          </section>
        </div>
      )}

      <footer className="welcome-footer">
        <span>Superkritical <b>／</b> ONLINE ARENA</span>
        <span>THINK FAST. CHAIN FASTER.</span>
      </footer>
    </main>
  );
}
