import type { SessionUser } from '@/features/auth/types';
import { NationalityDisplay } from '@/features/nationality/NationalityDisplay';
import { BrandLockup } from '@/features/brand/BrandLockup';

type WelcomeHeaderProps = {
  serviceStatus: string;
  user: SessionUser | null;
  showRules: boolean;
  showProfile: boolean;
  showOrbSkins: boolean;
  onShowRules: (show: boolean) => void;
  onShowProfile: (show: boolean) => void;
  onShowOrbSkins: (show: boolean) => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

/** Persistent site header with the account actions and lobby navigation. */
export function WelcomeHeader({
  serviceStatus,
  user,
  showRules,
  showProfile,
  showOrbSkins,
  onShowRules,
  onShowProfile,
  onShowOrbSkins,
  onSignIn,
  onSignOut,
}: WelcomeHeaderProps) {
  return (
    <header className="home-topbar">
      <a className="brand home-brand" href="#welcome" aria-label="Superkritical home">
        <BrandLockup />
      </a>
      <nav className="home-nav" aria-label="Main navigation">
        <a className={!showRules ? 'is-active' : ''} href="#welcome" onClick={() => onShowRules(false)}>Play</a>
        <button className={showRules ? 'is-active' : ''} onClick={() => { onShowOrbSkins(false); onShowRules(true); }}>How to play</button>
        <button className={showProfile ? 'is-active' : ''} onClick={() => { onShowOrbSkins(false); onShowProfile(true); }}>Account</button>
        <span className="nav-coming-soon">Leaderboard <small>SOON</small></span>
        <span className="nav-coming-soon">Shop <small>SOON</small></span>
        <button className={showOrbSkins ? 'is-active' : ''} onClick={() => { onShowProfile(false); onShowRules(false); onShowOrbSkins(true); }}>Skins</button>
      </nav>
      <div className="home-account-summary" id="account">
        <span className={`service-pill service-${serviceStatus}`}>
          <i /> {serviceStatus === 'ready' ? 'ARENA ONLINE' : serviceStatus.toUpperCase()}
        </span>
        {user ? (
          <div className="top-player">
            <span className="top-player-name">{user.username}</span>
            <NationalityDisplay value={user.nationality} className="top-player-nationality" showName={false} />
            {user.is_guest && <small>GUEST</small>}
            <button onClick={onSignOut}>Sign out</button>
          </div>
        ) : (
          <button className="nav-signin" onClick={onSignIn}>Sign in</button>
        )}
      </div>
    </header>
  );
}
