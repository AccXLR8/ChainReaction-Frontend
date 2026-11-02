'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AuthMode } from './types';
import { NationalityPicker } from '@/features/nationality/NationalityPicker';
import { GoogleSignInControl } from './GoogleSignInControl';
import { isStrongPassword } from './password-validation';

type AuthDialogProps = {
  mode: Exclude<AuthMode, null>;
  error: string;
  busy: boolean;
  onModeChange: (mode: AuthMode) => void;
  onGoogleSignIn: (credential: string) => void;
  onGoogleError: (message: string) => void;
  onManualAuth: (mode: 'login' | 'register', username: string, email: string, password: string, confirmPassword: string, nationality: string) => void;
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nationality, setNationality] = useState('global');
  const [validationError, setValidationError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (mode === 'register') {
      if (!/^[A-Za-z0-9_-]{3,24}$/.test(normalizedUsername)) {
        setValidationError('Use 3–24 characters: ASCII letters, numbers, underscores, or hyphens.');
        return;
      }
      if (!email.trim() || email.length > 320) {
        setValidationError('Enter a valid email address (up to 320 characters).');
        return;
      }
      if (!isStrongPassword(password)) {
        setValidationError('Your password must meet all five requirements listed below.');
        return;
      }
      if (password !== confirmPassword) {
        setValidationError('Passwords do not match.');
        return;
      }
    } else if (!normalizedUsername || normalizedUsername.length > 64 || password.length > 128) {
      setValidationError('Enter a username (up to 64 characters) and password (up to 128 characters).');
      return;
    }
    setValidationError('');
    onManualAuth(mode, normalizedUsername, email.trim(), password, confirmPassword, nationality);
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
              maxLength={mode === 'register' ? 24 : 64}
              minLength={3}
              pattern={mode === 'register' ? '[A-Za-z0-9_-]{3,24}' : undefined}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {mode === 'register' && (
            <label>
              Email address
              <input
                autoComplete="email"
                maxLength={320}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          <label>
            Password
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              maxLength={128}
              minLength={mode === 'register' ? 8 : 1}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === 'register' && (
            <label>
              Re-enter password
              <input
                autoComplete="new-password"
                maxLength={128}
                minLength={8}
                required
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}
          {mode === 'register' && (
            <ul className="password-requirements" aria-label="Password requirements">
              <li>At least 8 characters</li>
              <li>At least one lowercase letter</li>
              <li>At least one uppercase letter</li>
              <li>At least one number</li>
              <li>At least one symbol</li>
            </ul>
          )}
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
              setConfirmPassword('');
              onGoogleError('');
              onModeChange(mode === 'register' ? 'login' : 'register');
            }}
          >
            {mode === 'register' ? 'Sign in' : 'Create account'}
          </button>
        </p>
        {(validationError || error) && <div className="auth-error" role="alert">{validationError || error}</div>}
        <button className="auth-back" type="button" onClick={() => onModeChange(null)}>Back to play</button>
      </section>
    </div>
  );
}
