'use client';

import { useState } from 'react';
import type { AnimationEvent as ReactAnimationEvent, CSSProperties } from 'react';
import type { AppStage, AuthMode, SessionUser } from './types';
import { HowToPlay } from './HowToPlay';
import { AuthDialog } from './AuthDialog';
import { ProfilePanel } from '@/features/profile/ProfilePanel';
import { OrbSkinsPanel } from '@/features/skins/OrbSkinsPanel';
import { ShopPanel } from '@/features/shop/ShopPanel';
import { MenuBoardPreview } from './MenuBoardPreview';
import type { BoardPanelProps } from '@/features/game/BoardPanel';
import type { MatchmakingMode } from '@/features/matchmaking/api';
import { WelcomeHeader } from '@/features/lobby/WelcomeHeader';
import { MatchmakingPanel } from '@/features/matchmaking/MatchmakingPanel';

type LobbyWindow = 'play' | 'rules' | 'profile' | 'skins' | 'shop';

type WindowTransition = {
  from: LobbyWindow;
  to: LobbyWindow;
  direction: 'left' | 'right';
};

const WINDOW_ORDER: LobbyWindow[] = ['play', 'rules', 'skins', 'shop', 'profile'];

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
  onManualAuth: (mode: 'login' | 'register', username: string, email: string, password: string, confirmPassword: string, nationality: string) => void;
  onSessionProfileUpdate: (username: string, nationality: string) => void;
  onSessionExpired: () => void;
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
  onSkinEquipped,
  onFindMatch,
  onCancelSearch,
  onSignOut,
}: WelcomeScreenProps) {
  const rankedLocked = !user || user.is_guest;
  const [activeWindow, setActiveWindow] = useState<LobbyWindow>('play');
  const [windowTransition, setWindowTransition] = useState<WindowTransition | null>(null);

  const navigateTo = (next: LobbyWindow) => {
    if (windowTransition || next === activeWindow) return;
    const direction = WINDOW_ORDER.indexOf(next) > WINDOW_ORDER.indexOf(activeWindow) ? 'left' : 'right';
    setWindowTransition({ from: activeWindow, to: next, direction });
  };

  const finishWindowTransition = () => {
    if (!windowTransition) return;
    setActiveWindow(windowTransition.to);
    setWindowTransition(null);
  };

  const renderWindow = (window: LobbyWindow) => {
    const isTransitioning = windowTransition !== null;
    const isIncoming = isTransitioning && window === windowTransition.to;
    const isVisible = isTransitioning ? isIncoming : window === activeWindow;
    const motionClass = windowTransition && window === windowTransition.from
      ? `is-outgoing to-${windowTransition.direction}`
      : windowTransition && window === windowTransition.to
        ? `is-incoming from-${windowTransition.direction === 'left' ? 'right' : 'left'}`
        : '';
    const panelProps = {
      className: `arena-window-panel ${motionClass}`.trim(),
      'aria-hidden': !isVisible,
      inert: !isVisible,
      onAnimationEnd: isIncoming
        ? (event: ReactAnimationEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) finishWindowTransition();
          }
        : undefined,
    };
    const renderSkinsWindow = () => (
      <div key={window} {...panelProps}>
        <OrbSkinsPanel
          token={sessionToken}
          onSessionExpired={() => {
            navigateTo('play');
            onSessionExpired();
          }}
          onSkinEquipped={onSkinEquipped}
          onRequestSignIn={() => {
            navigateTo('play');
            onAuthModeChange('login');
          }}
        />
      </div>
    );
    const renderShopWindow = () => (
      <div key={window} {...panelProps}>
        <ShopPanel
          token={sessionToken}
          isRegistered={Boolean(user && !user.is_guest)}
          onSessionExpired={() => {
            navigateTo('play');
            onSessionExpired();
          }}
          onRequestSignIn={() => {
            navigateTo('play');
            onAuthModeChange('login');
          }}
        />
      </div>
    );

    if (window === 'play') {
      return (
        <div key="play" {...panelProps}>
          <section
            className={`play-stage ${stage === 'queue' ? 'is-queueing' : ''}`}
            id="welcome"
            style={{
              '--board-stage-height': `${previewBoard.stageHeight}px`,
              '--board-stage-width': `${previewBoard.stageWidth}px`,
            } as CSSProperties}
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
        </div>
      );
    }

    if (window === 'rules') {
      return (
        <div key="rules" {...panelProps}>
          <section className="arena-content-page rules-page" aria-labelledby="how-to-play-title">
            <header className="arena-page-header">
              <div>
                <span className="eyebrow-mini">LEARN THE ARENA</span>
                <h1>How to play</h1>
              </div>
            </header>
            <div className="arena-page-body rules-page-body">
              <HowToPlay />
            </div>
          </section>
        </div>
      );
    }

    if (window === 'skins') {
      return renderSkinsWindow();
    }

    if (window === 'shop') {
      return renderShopWindow();
    }

    return (
      <div key="profile" {...panelProps}>
        <ProfilePanel
          token={sessionToken}
          user={user}
          onClose={() => navigateTo('play')}
          onRequestSignIn={() => {
            navigateTo('play');
            onAuthModeChange('login');
          }}
          onProfileUpdated={onSessionProfileUpdate}
          onSessionExpired={() => {
            navigateTo('play');
            onSessionExpired();
          }}
        />
      </div>
    );
  };

  const windowForHeader = windowTransition?.to ?? activeWindow;
  return (
    <main className={`welcome-shell arena-home-shell ${authMode ? 'has-auth-form' : ''}`}>
      <div className="welcome-noise" />

      <WelcomeHeader
        serviceStatus={serviceStatus}
        user={user}
        activeWindow={windowForHeader}
        onNavigate={navigateTo}
        onSignIn={() => onAuthModeChange('login')}
        onSignOut={onSignOut}
      />

      <section className="arena-window-viewport" aria-label="Arena pages">
        {windowTransition
          ? <>{renderWindow(windowTransition.from)}{renderWindow(windowTransition.to)}</>
          : renderWindow(activeWindow)}
      </section>

      {authMode && (!user || user.is_guest) && (
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

      <footer className="welcome-footer">
        <span>Superkritical <b>／</b> ONLINE ARENA</span>
        <span>THINK FAST. CHAIN FASTER.</span>
      </footer>
    </main>
  );
}
