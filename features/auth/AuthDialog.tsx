'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthMode } from './types';
import { NationalityPicker } from '@/features/nationality/NationalityPicker';
import { GoogleSignInControl } from './GoogleSignInControl';

type AuthDialogProps = {
  mode: Exclude<AuthMode, null>;
  error: string;
  busy: boolean;
  onModeChange: (mode: AuthMode) => void;
  onGoogleSignIn: (credential: string) => void;
  onGoogleError: (message: string) => void;
  onManualAuth: (mode: 'login' | 'register', username: string, password: string, nationality: string) => void;
};

/** Account creation and sign-in form, including optional registration nationality. */
export function AuthDialog({
  mode,
  error,
  busy,
  onModeChange,
  onGoogleSignIn,
  onGoogleError,
  onManualAuth,
}: AuthDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nationality, setNationality] = useState('global');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onManualAuth(mode, username.trim(), password, nationality);
  };

  return (
    <div className="auth-backdrop">
      <section className="menu-auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="menu-auth-heading">
          <span className="eyebrow-mini">{mode === 'register' ? 'CREATE PLAYER ACCOUNT' : 'PLAYER ACCOUNT'}</span>
          <button className="rules-close" type="button" onClick={() => onModeChange(null)} aria-label="Close account form">×</button>
        </div>
        <h2 id="auth-modal-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
        <p>
          {mode === 'register'
            ? 'Choose a player name and optional nationality. You can change these later.'
            : 'Sign in with Google or your player name and password.'}
        </p>
        {mode === 'login' && (
          <>
            <GoogleSignInControl onCredential={onGoogleSignIn} onError={onGoogleError} />
            <div className="auth-divider">OR SIGN IN WITH PLAYER ACCOUNT</div>
          </>
        )}
        <form className="manual-auth-form" onSubmit={submit}>
          <label>
            Player name
            <input
              autoComplete="username"
              maxLength={64}
              minLength={3}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              maxLength={128}
              minLength={6}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === 'register' && (
            <NationalityPicker
              id="registration-nationality"
              value={nationality}
              onChange={setNationality}
            />
          )}
          <button className="primary-action" type="submit" disabled={busy}>
            {busy
              ? mode === 'register' ? 'Creating account…' : 'Signing in…'
              : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'register' ? 'Already have an account?' : 'New to Superkritical?'}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPassword('');
              onGoogleError('');
              onModeChange(mode === 'register' ? 'login' : 'register');
            }}
          >
            {mode === 'register' ? 'Sign in' : 'Create account'}
          </button>
        </p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-back" type="button" onClick={() => onModeChange(null)}>Back to play</button>
      </section>
    </div>
  );
}
