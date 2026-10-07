import type { SessionUser } from '@/features/auth/types';

type LobbyScreenProps = {
  stage: 'lobby' | 'queue';
  user: SessionUser;
  queueBusy: boolean;
  errorMessage: string;
  notice: string;
  serviceStatus: string;
  onSignOut: () => void;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
};

/** Player lobby and active matchmaking search state. */
export function LobbyScreen({
  stage,
  user,
  queueBusy,
  errorMessage,
  notice,
  serviceStatus,
  onSignOut,
  onJoinQueue,
  onLeaveQueue,
}: LobbyScreenProps) {
  const isQueueing = stage === 'queue';

  return (
    <main className="lobby-shell">
      <header className="lobby-topbar">
        <a className="brand" href="#lobby">
          <span className="brand-mark">✳</span>
          <span className="brand-wordmark"><span>Super</span><strong>kritical</strong></span>
        </a>
        <div className="lobby-user">
          <span className="user-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <span>
            {user.username}
            {user.is_guest && <small>GUEST</small>}
          </span>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className={`lobby-main ${isQueueing ? 'is-queueing' : ''}`} id="lobby">
        <div className="lobby-backdrop-orb" />
        <div className="lobby-copy">
          <span className="eyebrow">
            <i /> {isQueueing ? 'MATCHMAKING · LIVE' : 'PLAYER LOBBY'}
          </span>
          <h1>
            {isQueueing ? (
              <>Opponent<br />incoming<span>.</span></>
            ) : (
              <>Ready to<br />make a <em>chain?</em></>
            )}
          </h1>
          <p>
            {isQueueing
              ? 'Searching for a rival. This screen will move into the arena as soon as a match is found.'
              : 'Find a player and take your place in the arena. The board is waiting.'}
          </p>
          {errorMessage && <div className="lobby-error" role="alert">{errorMessage}</div>}

          {isQueueing ? (
            <div className="queue-actions">
              <button className="primary-action" disabled={queueBusy} onClick={onLeaveQueue}>
                {queueBusy ? 'Joining queue…' : 'Cancel search'} <span>×</span>
              </button>
              <div className="queue-state"><span className="queue-spinner" />{notice}</div>
            </div>
          ) : (
            <button className="primary-action lobby-play" onClick={onJoinQueue} disabled={queueBusy}>
              {queueBusy ? 'Joining…' : 'Find a match'} <span>↗</span>
            </button>
          )}

          <div className="lobby-meta">
            <span><i /> {serviceStatus === 'ready' ? 'SERVERS OPERATIONAL' : `SERVER ${serviceStatus.toUpperCase()}`}</span>
            <span>1V1 · LIVE</span>
          </div>
        </div>

        <div className="lobby-art" aria-hidden="true">
          <div className="art-grid">
            {Array.from({ length: 49 }, (_, index) => {
              const isLit = [9, 17, 24, 25, 31, 39].includes(index);
              const isHot = [24, 25].includes(index);
              return (
                <i
                  className={`${isLit ? 'art-lit' : ''} ${isHot ? 'art-hot' : ''}`}
                  key={index}
                />
              );
            })}
          </div>
          <div className="art-glow" />
          <div className="art-label">Superkritical <span>·</span> ARENA 01</div>
        </div>
      </section>

      <footer className="lobby-footer">
        <span>Superkritical <b>／</b> ONLINE MATCHMAKING</span>
        <span>YOUR NEXT MOVE STARTS HERE</span>
      </footer>
    </main>
  );
}
