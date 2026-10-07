'use client';

import type { FormEvent } from 'react';
import type { AuthMode } from './types';
import { HowToPlay } from './HowToPlay';

type WelcomeScreenProps = {
  authMode: AuthMode;
  username: string;
  password: string;
  authError: string;
  errorMessage: string;
  authBusy: boolean;
  serviceStatus: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthSwitch: (mode: AuthMode) => void;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGuestLogin: () => void;
};

/** Signed-out entry point: account sign-in, registration, and guest play. */
export function WelcomeScreen({
  authMode,
  username,
  password,
  authError,
  errorMessage,
  authBusy,
  serviceStatus,
  onAuthModeChange,
  onAuthSwitch,
  onUsernameChange,
  onPasswordChange,
  onAuthSubmit,
  onGuestLogin,
}: WelcomeScreenProps) {
  const isRegistering = authMode === 'register';

  return (
    <main className="welcome-shell">
      <div className="welcome-noise" />

      <section className="welcome-content" id="welcome">
        <div className="welcome-copy">
          <span className="eyebrow"><i /> REAL-TIME STRATEGY · 1V1</span>
          <h1>
            Every move<br />
            starts a{' '}
            <em className="reaction-word reaction-word-green" role="text" aria-label="reaction">
              reacti<span className="word-orb" aria-hidden="true" />n.
            </em>
            <br />
            A chain{' '}
            <span className="reaction-word reaction-word-red" role="text" aria-label="reaction">
              reacti<span className="word-orb" aria-hidden="true" />n
            </span>
          </h1>
          <p>Claim the board, build your chain, and turn one spark into the whole arena.</p>
          <div className="welcome-orbit" aria-hidden="true">
            <div className="orbit-ring orbit-one" />
            <div className="orbit-ring orbit-two" />
            <span className="orbit-core" />
            <span className="orbit-dot dot-a" />
            <span className="orbit-dot dot-b" />
            <span className="orbit-dot dot-c" />
            <span className="orbit-dot dot-d" />
          </div>
          <div className="welcome-feature">
            <span>01</span>
            <div><b>Find your opponent</b><small>Fast online matchmaking</small></div>
            <span>02</span>
            <div><b>Own every turn</b><small>Live board updates</small></div>
          </div>
        </div>

        <HowToPlay />

        <aside className="auth-sidebar" aria-label="Sign in or play as a guest">
          <a className="brand auth-sidebar-brand" href="#welcome">
            <span className="brand-mark">✳</span>
            <span className="brand-wordmark"><span>Super</span><strong>kritical</strong></span>
          </a>
          <section className="welcome-card">
            <span className="eyebrow-mini">THE ARENA IS READY</span>
            {authMode ? (
              <>
                <h2>{isRegistering ? 'Create your account' : 'Welcome back'}</h2>
                <p>
                  {isRegistering
                    ? 'Make a player account to keep your name across matches.'
                    : 'Sign in to pick up where your next match begins.'}
                </p>
                <form onSubmit={onAuthSubmit}>
                  <label>
                    Username
                    <input
                      autoFocus
                      required
                      minLength={3}
                      maxLength={64}
                      autoComplete="username"
                      value={username}
                      onChange={(event) => onUsernameChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      required
                      minLength={6}
                      maxLength={128}
                      type="password"
                      autoComplete={isRegistering ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(event) => onPasswordChange(event.target.value)}
                    />
                  </label>
                  {authError && <div className="auth-error" role="alert">{authError}</div>}
                  <button className="primary-action" disabled={authBusy}>
                    {authBusy ? 'Connecting…' : isRegistering ? 'Create account' : 'Sign in'}
                    <span>↗</span>
                  </button>
                </form>
                <button className="guest-button" disabled={authBusy} onClick={onGuestLogin}>
                  Continue as guest <span>→</span>
                </button>
                <div className="auth-switch">
                  {isRegistering ? 'Already have an account?' : 'New here?'}{' '}
                  <button
                    onClick={() => {
                      onAuthSwitch(isRegistering ? 'login' : 'register');
                    }}
                  >
                    {isRegistering ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Enter the arena</h2>
                <p>Choose how you want to play. You can jump in as a guest in seconds.</p>
                {errorMessage && <div className="auth-error" role="alert">{errorMessage}</div>}
                <button className="primary-action" onClick={() => onAuthModeChange('login')}>
                  Sign in <span>↗</span>
                </button>
                <button className="secondary-action" onClick={() => onAuthModeChange('register')}>
                  Create account <span>＋</span>
                </button>
                <div className="auth-divider"><span>OR QUICK PLAY</span></div>
                <label className="guest-name">
                  GUEST NAME <small>OPTIONAL</small>
                  <input
                    maxLength={64}
                    placeholder="Leave blank for a random name"
                    value={username}
                    onChange={(event) => onUsernameChange(event.target.value)}
                  />
                </label>
                {authError && <div className="auth-error" role="alert">{authError}</div>}
                <button className="guest-cta" disabled={authBusy} onClick={onGuestLogin}>
                  {authBusy ? 'Creating guest…' : 'Continue as guest'} <span>→</span>
                </button>
              </>
            )}
            <div className="card-foot">
              <span>
                <i />{' '}
                {serviceStatus === 'ready' ? 'MATCHMAKING ONLINE' : `SERVICE ${serviceStatus.toUpperCase()}`}
              </span>
              <span>FREE TO PLAY</span>
            </div>
          </section>
        </aside>
      </section>

      <footer className="welcome-footer">
        <span>Superkritical <b>／</b> ONLINE ARENA</span>
        <span>THINK FAST. CHAIN FASTER.</span>
      </footer>
    </main>
  );
}
