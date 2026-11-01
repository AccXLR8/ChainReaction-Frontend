'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

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

type GoogleSignInControlProps = {
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
};

/** Loads Google's branded button and forwards its ID token to the auth flow. */
export function GoogleSignInControl({ onCredential, onError }: GoogleSignInControlProps) {
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
