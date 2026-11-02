import type { AppStage } from '@/features/auth/types';
import type { MatchmakingMode } from './api';

type MatchmakingPanelProps = {
  stage: AppStage;
  queueMode: MatchmakingMode;
  queueBusy: boolean;
  queueAction: 'joining' | 'checking' | null;
  notice: string;
  errorMessage: string;
  rankedLocked: boolean;
  onFindMatch: (mode: MatchmakingMode) => void;
  onCancelSearch: () => void;
};

/** The lobby's match selection panel and its cancellable queue state. */
export function MatchmakingPanel({
  stage,
  queueMode,
  queueBusy,
  queueAction,
  notice,
  errorMessage,
  rankedLocked,
  onFindMatch,
  onCancelSearch,
}: MatchmakingPanelProps) {
  const isQueueing = stage === 'queue';
  const queueModeTitle = queueMode === 'mini'
    ? 'MINI MATCH'
    : queueMode === 'ranked' ? 'RANKED MATCH' : 'STANDARD MATCH';

  return (
    <section className={`play-entry-panel ${isQueueing ? 'is-queueing' : ''}`} aria-label="Matchmaking">
      {isQueueing ? (
        <>
          <span className="eyebrow"><i /> {queueModeTitle} · SEARCHING</span>
          <h1>Finding your opponent</h1>
          <p>We’re searching for a rival. Your board will go live as soon as the match is ready.</p>
          <div className="welcome-match-action">
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
          </div>
          {errorMessage && <div className="menu-error" role="alert">{errorMessage}</div>}
          <p className="queue-notice">{notice}</p>
        </>
      ) : (
        <>
          <span className="eyebrow"><i /> ONLINE MATCHMAKING · 1V1</span>
          <h1>Choose your match</h1>
          <p>Choose your arena. Guests can play Standard and Mini matches; Ranked is for registered players.</p>

          <div className="match-mode-list">
            <MatchModeCard
              className="quick-match-card"
              icon="⚡"
              kicker="CASUAL · UNRATED"
              title="Standard Match"
              badge="PLAY NOW"
              description="Classic 1v1 strategy on the full board. Guests and signed-in players are welcome."
              buttonLabel="Play Standard"
              disabled={queueBusy}
              onClick={() => onFindMatch('standard')}
            />
            <MatchModeCard
              className="mini-match-card"
              icon="◫"
              kicker="CASUAL · QUICKER ROUNDS"
              title="Mini Match"
              badge="PLAY NOW"
              description="A compact arena for faster games. Guests and signed-in players are welcome."
              buttonLabel="Play Mini"
              buttonClass="mini-play"
              disabled={queueBusy}
              onClick={() => onFindMatch('mini')}
            />
            <MatchModeCard
              className="bot-match-card"
              icon="🤖"
              kicker="TRAINING · IN DEVELOPMENT"
              title="Play a bot"
              badge="COMING SOON"
              description="Practice your strategy against opponents with different play styles."
              buttonLabel="In development"
              buttonClass="bot-play"
              disabled
            />
            <MatchModeCard
              className="ranked-match-card"
              icon="♜"
              kicker="RATED · COMPETITIVE"
              title="Ranked Match"
              badge={rankedLocked ? 'SIGN-IN REQUIRED' : 'PLAY NOW'}
              description="Compete for rating and climb the leaderboard. A registered account is required."
              buttonLabel={rankedLocked ? 'Sign in to play' : 'Play Ranked'}
              buttonClass="ranked-play"
              buttonAriaLabel={rankedLocked ? 'Ranked matchmaking requires a registered account' : 'Play Ranked'}
              disabled={queueBusy || rankedLocked}
              onClick={() => onFindMatch('ranked')}
            />
          </div>

          {errorMessage && <div className="menu-error" role="alert">{errorMessage}</div>}
        </>
      )}
    </section>
  );
}

type MatchModeCardProps = {
  className: string;
  icon: string;
  kicker: string;
  title: string;
  badge: string;
  description: string;
  buttonLabel: string;
  buttonClass?: string;
  buttonAriaLabel?: string;
  disabled: boolean;
  onClick?: () => void;
};

/** Repeated visual/card structure for each matchmaking queue. */
function MatchModeCard({
  className,
  icon,
  kicker,
  title,
  badge,
  description,
  buttonLabel,
  buttonClass = '',
  buttonAriaLabel,
  disabled,
  onClick,
}: MatchModeCardProps) {
  return (
    <article className={`match-mode-card ${className}`}>
      <span className="match-mode-icon" aria-hidden="true">{icon}</span>
      <div className="match-mode-heading">
        <div>
          <span className="match-mode-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        <span className="match-mode-badge">{badge}</span>
      </div>
      <p>{description}</p>
      <button
        className={`primary-action welcome-play ${buttonClass}`.trim()}
        type="button"
        aria-label={buttonAriaLabel}
        disabled={disabled}
        onClick={onClick}
      >
        {buttonLabel} <span>↗</span>
      </button>
    </article>
  );
}
