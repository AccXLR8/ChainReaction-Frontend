'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import type { AppStage, AuthMode, SessionUser } from './types';
import { HowToPlay } from './HowToPlay';
import { ProfilePanel } from '@/features/profile/ProfilePanel';
import { MenuBoardPreview } from './MenuBoardPreview';
import type { BoardPanelProps } from '@/features/game/BoardPanel';

type WelcomeScreenProps = {
  authMode: AuthMode;
  authError: string;
  errorMessage: string;
  authBusy: boolean;
  serviceStatus: string;
  user: SessionUser | null;
  sessionToken: string | null;
  stage: AppStage;
  queueBusy: boolean;
  queueAction: 'joining' | 'checking' | null;
  notice: string;
  previewBoard: BoardPanelProps;
  onAuthModeChange: (mode: AuthMode) => void;
  onGoogleSignIn: (credential: string) => void;
  onGoogleError: (message: string) => void;
  onSessionUsernameUpdate: (username: string) => void;
  onSessionExpired: () => void;
  onFindMatch: () => void;
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
  queueBusy,
  queueAction,
  notice,
  previewBoard,
  onAuthModeChange,
  onGoogleSignIn,
  onGoogleError,
  onSessionUsernameUpdate,
  onSessionExpired,
  onFindMatch,
  onCancelSearch,
  onSignOut,
}: WelcomeScreenProps) {
  const isQueueing = stage === 'queue';
  const [showRules, setShowRules] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <main className={`welcome-shell ${authMode ? 'has-auth-form' : ''}`}>
      <div className="welcome-noise" />

      <header className="home-topbar">
        <a className="brand home-brand" href="#welcome" aria-label="Superkritical home">
          <span className="brand-mark">✳</span>
          <span className="brand-wordmark"><span>Super</span><strong>kritical</strong></span>
        </a>
        <nav className="home-nav" aria-label="Main navigation">
          <a className={!showRules ? 'is-active' : ''} href="#welcome" onClick={() => setShowRules(false)}>Play</a>
          <button className={showRules ? 'is-active' : ''} onClick={() => setShowRules(true)}>How to play</button>
          <button className={showProfile ? 'is-active' : ''} onClick={() => setShowProfile(true)}>Account</button>
          <span className="nav-coming-soon">Leaderboard <small>SOON</small></span>
          <span className="nav-coming-soon">Shop <small>SOON</small></span>
          <span className="nav-coming-soon">Skins <small>SOON</small></span>
        </nav>
        <div className="home-account-summary" id="account">
          <span className={`service-pill service-${serviceStatus}`}>
            <i /> {serviceStatus === 'ready' ? 'ARENA ONLINE' : serviceStatus.toUpperCase()}
          </span>
          {user ? (
            <div className="top-player">
              <span className="top-player-name">{user.username}</span>
              {user.is_guest && <small>GUEST</small>}
              <button onClick={onSignOut}>Sign out</button>
            </div>
          ) : (
            <button className="nav-signin" onClick={() => onAuthModeChange('login')}>Sign in</button>
          )}
        </div>
      </header>

      <section className="play-stage" id="welcome">
        <MenuBoardPreview board={previewBoard} />
        <section className="play-entry-panel" aria-label="Find a match">
          <span className="eyebrow"><i /> {isQueueing ? 'MATCHMAKING · LIVE' : 'ONLINE MATCHMAKING · 1V1'}</span>
          <h1>{isQueueing ? 'Finding your opponent' : 'Ready for a match?'}</h1>
          <p>
            {isQueueing
              ? 'We’re searching for a rival. Your board will go live as soon as the match is ready.'
              : 'Jump into a live arena. No account is needed to play.'}
          </p>
          <div className="welcome-match-action">
            {isQueueing ? (
              <>
                <div className="match-searching">
                  <span className="queue-spinner" />
                  <span>Searching for an opponent</span>
                </div>
                <button className="cancel-search" disabled={queueBusy} onClick={onCancelSearch}>
                  {queueAction === 'checking'
                    ? 'Checking match…'
                    : queueAction === 'joining'
                      ? 'Joining queue…'
                      : 'Cancel matchmaking'}
                </button>
              </>
            ) : (
              <button className="primary-action welcome-play" disabled={queueBusy} onClick={onFindMatch}>
                {queueBusy ? 'Preparing your arena…' : 'Find a match'} <span>↗</span>
              </button>
            )}
          </div>
          {errorMessage && <div className="menu-error" role="alert">{errorMessage}</div>}
          {isQueueing && <p className="queue-notice">{notice}</p>}

          <div className="play-quick-facts">
            <div>
              <span>PLAY MODE</span>
              <strong>1v1 arena</strong>
            </div>
            <div>
              <span>ACCESS</span>
              <strong>Guest play · no sign-in</strong>
            </div>
          </div>
        </section>

      </section>

      {authMode && !user && (
        <div className="auth-backdrop">
          <section className="menu-auth-modal" role="dialog" aria-modal="true" aria-label="Sign in with Google">
            <div className="menu-auth-heading">
              <span className="eyebrow-mini">PLAYER ACCOUNT</span>
              <button className="rules-close" type="button" onClick={() => onAuthModeChange(null)} aria-label="Close sign in">×</button>
            </div>
            <h2>Welcome to the arena</h2>
            <p>Sign in with Google to keep your identity and matches available across sessions.</p>
            <GoogleSignInControl onCredential={onGoogleSignIn} onError={onGoogleError} />
            {authBusy && <p className="google-setup-note">Verifying your Google account…</p>}
            {authError && <div className="auth-error" role="alert">{authError}</div>}
            <button className="auth-back" type="button" onClick={() => onAuthModeChange(null)}>Back to play</button>
          </section>
        </div>
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
          onUsernameUpdated={onSessionUsernameUpdate}
          onSessionExpired={() => {
            setShowProfile(false);
            onSessionExpired();
          }}
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

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        container: HTMLElement,
        options: {
          type: 'standard';
          theme: 'outline';
          size: 'large';
          text: 'signin_with';
          shape: 'rectangular';
          logo_alignment: 'left';
          width: number;
        },
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** Loads Google's branded sign-in button when the OAuth client is configured. */
function GoogleSignInControl({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [scriptReady, setScriptReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const credentialHandler = useRef(onCredential);
  const errorHandler = useRef(onError);
  credentialHandler.current = onCredential;
  errorHandler.current = onError;

  useEffect(() => {
    if (!clientId || !scriptReady || !buttonRef.current || !window.google) return;

    const container = buttonRef.current;
    try {
      container.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          if (credential) credentialHandler.current(credential);
          else errorHandler.current('Google did not return a sign-in credential. Please try again.');
        },
      });
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.max(200, Math.min(Math.floor(container.clientWidth), 360)),
      });
    } catch {
      errorHandler.current('Google sign-in could not be started. Please try again.');
    }
  }, [clientId, scriptReady]);

  if (!clientId) {
    return (
      <>
        <button className="google-signin google-signin-unavailable" type="button" disabled>
          <GoogleMark />
          <span>Sign in with Google</span>
        </button>
        <p className="google-setup-note">Google sign-in is not configured for this application yet.</p>
      </>
    );
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => errorHandler.current('Google sign-in could not load. Please refresh and try again.')}
      />
      <div className={`google-signin-slot ${scriptReady ? '' : 'is-loading'}`} ref={buttonRef}>
        {!scriptReady && <span>Loading Google sign-in…</span>}
      </div>
    </>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path fill="#4285F4" d="M44 24c0-1.2-.1-2.4-.4-3.5H24v8h11.3A12 12 0 0 1 24 36v8c11 0 20-9 20-20Z" />
      <path fill="#34A853" d="M24 44c5.3 0 10-1.8 13.7-5l-5.7-5.7A12 12 0 0 1 24 36c-4.4 0-8.3-2.4-10.4-6L7 34.5C10.5 40.2 16.7 44 24 44Z" />
      <path fill="#FBBC05" d="M13.6 30A12 12 0 0 1 12 24c0-2.1.5-4 1.4-5.7L7 13C5.1 16.1 4 19.9 4 24s1.1 7.9 3 10.5L13.6 30Z" />
      <path fill="#EA4335" d="M24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 5.8 29.3 4 24 4 16.7 4 10.5 7.8 7 13l6.4 5.3A12 12 0 0 1 24 12Z" />
    </svg>
  );
}
