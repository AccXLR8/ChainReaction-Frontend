import type { SessionUser } from '@/features/auth/types';
import { BrandLockup } from '@/features/brand/BrandLockup';

type WelcomeHeaderProps = {
  serviceStatus: string;
  user: SessionUser | null;
  activeWindow: 'play' | 'rules' | 'profile' | 'skins' | 'shop';
  onNavigate: (window: 'play' | 'rules' | 'profile' | 'skins' | 'shop') => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

/** Persistent site header with the account actions and lobby navigation. */
export function WelcomeHeader({
  serviceStatus,
  user,
  activeWindow,
  onNavigate,
  onSignIn,
  onSignOut,
}: WelcomeHeaderProps) {
  return (
    <>
      <aside className="home-sidebar">
        <a
          className="brand home-brand"
          href="#welcome"
          aria-label="Superkritical home"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('play');
          }}
        >
          <BrandLockup />
        </a>
        <button
          className="mobile-session-action"
          onClick={user ? onSignOut : onSignIn}
          aria-label={user ? 'Sign out' : 'Sign in'}
          title={user ? 'Sign out' : 'Sign in'}
        >
          {user ? '↗' : '＋'}
        </button>
        <nav className="home-nav" aria-label="Main navigation">
          <button aria-label="Play" title="Play" className={activeWindow === 'play' ? 'is-active' : ''} onClick={() => onNavigate('play')}>
            <span className="sidebar-nav-icon" aria-hidden="true">◈</span><span>Play</span>
          </button>
          <button aria-label="How to play" title="How to play" className={activeWindow === 'rules' ? 'is-active' : ''} onClick={() => onNavigate('rules')}>
            <span className="sidebar-nav-icon" aria-hidden="true">⌘</span><span>How to play</span>
          </button>
          <button aria-label="Skins" title="Skins" className={activeWindow === 'skins' ? 'is-active' : ''} onClick={() => onNavigate('skins')}>
            <span className="sidebar-nav-icon" aria-hidden="true">✳</span><span>Skins</span>
          </button>
          <span className="nav-coming-soon"><span className="sidebar-nav-icon" aria-hidden="true">▤</span><span>Leaderboard <small>SOON</small></span></span>
          <button aria-label="Shop" title="Shop" className={activeWindow === 'shop' ? 'is-active' : ''} onClick={() => onNavigate('shop')}>
            <span className="sidebar-nav-icon" aria-hidden="true">◇</span><span>Shop</span>
          </button>
        </nav>
        <div className="home-sidebar-footer">
          {user && <button className={`sidebar-account ${activeWindow === 'profile' ? 'is-active' : ''}`} aria-label={`Open ${user.username} account`} onClick={() => onNavigate('profile')}>
            <span className="user-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <span>{user.username}</span>
          </button>}
          {!user && <button className="sidebar-account sidebar-signin" onClick={onSignIn}>
            <span className="user-avatar" aria-hidden="true">↗</span>
            <span>Sign in</span>
          </button>}
          {user && <button className="sidebar-signout" onClick={onSignOut}>Sign out</button>}
          <span className={`service-pill service-${serviceStatus}`}><i />{serviceStatus === 'ready' ? 'ARENA ONLINE' : serviceStatus.toUpperCase()}</span>
          <span>1V1 · REAL-TIME</span>
        </div>
      </aside>
    </>
  );
}
