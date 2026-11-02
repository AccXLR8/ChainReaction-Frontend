import type { SessionUser } from '@/features/auth/types';
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
  const playIsActive = !showRules && !showProfile && !showOrbSkins;

  return (
    <>
      <aside className="home-sidebar">
        <a className="brand home-brand" href="#welcome" aria-label="Superkritical home">
          <BrandLockup />
        </a>
        <nav className="home-nav" aria-label="Main navigation">
          <a aria-label="Play" title="Play" className={playIsActive ? 'is-active' : ''} href="#welcome" onClick={() => { onShowRules(false); onShowProfile(false); onShowOrbSkins(false); }}>
            <span className="sidebar-nav-icon" aria-hidden="true">◈</span><span>Play</span>
          </a>
          <button aria-label="How to play" title="How to play" className={showRules ? 'is-active' : ''} onClick={() => { onShowProfile(false); onShowOrbSkins(false); onShowRules(true); }}>
            <span className="sidebar-nav-icon" aria-hidden="true">⌘</span><span>How to play</span>
          </button>
          <button aria-label="Orb skins" title="Orb skins" className={showOrbSkins ? 'is-active' : ''} onClick={() => { onShowProfile(false); onShowRules(false); onShowOrbSkins(true); }}>
            <span className="sidebar-nav-icon" aria-hidden="true">✳</span><span>Orb skins</span>
          </button>
          <span className="nav-coming-soon"><span className="sidebar-nav-icon" aria-hidden="true">▤</span><span>Leaderboard <small>SOON</small></span></span>
          <span className="nav-coming-soon"><span className="sidebar-nav-icon" aria-hidden="true">◇</span><span>Shop <small>SOON</small></span></span>
        </nav>
        <div className="home-sidebar-footer">
          {user && <button className="sidebar-account" aria-label={`Open ${user.username} account`} onClick={() => { onShowRules(false); onShowOrbSkins(false); onShowProfile(true); }}>
            <span className="user-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <span>{user.username}</span>
          </button>}
          {!user && <button className="sidebar-account sidebar-signin" onClick={onSignIn}>
            <span className="user-avatar" aria-hidden="true">↗</span>
            <span>Sign in</span>
          </button>}
          <span className={`service-pill service-${serviceStatus}`}><i />{serviceStatus === 'ready' ? 'ARENA ONLINE' : serviceStatus.toUpperCase()}</span>
          <span>1V1 · REAL-TIME</span>
        </div>
      </aside>
      <header className="home-topbar arena-topbar">
        <div className="arena-breadcrumb"><span>PLAY</span><i>/</i> ONLINE ARENA</div>
        <div className="home-account-summary" id="account">
          {user ? (
            <div className="top-player">
              <button onClick={onSignOut}>Sign out</button>
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}
