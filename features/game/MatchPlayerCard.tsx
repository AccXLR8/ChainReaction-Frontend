import type { CSSProperties } from 'react';
import { formatClock } from './board-model';
import { NationalityDisplay } from '@/features/nationality/NationalityDisplay';

type MatchPlayerCardProps = {
  slot: number;
  position: 'you' | 'opponent';
  name: string;
  nationality?: string;
  clock?: number;
  connected?: boolean;
  color: string;
  currentPlayer: number;
  winner: number | null;
  finished: boolean;
};

/** Compact player identity and turn status shown directly above or below the board. */
export function MatchPlayerCard({
  slot,
  position,
  name,
  nationality,
  clock = 0,
  connected = false,
  color,
  currentPlayer,
  winner,
  finished,
}: MatchPlayerCardProps) {
  const isWinner = winner === slot;
  const status = finished
    ? isWinner ? 'WINNER' : winner === null ? 'DRAW' : 'MATCH COMPLETE'
    : currentPlayer === slot ? 'TO MOVE' : 'WAITING';
  const initial = name.trim().charAt(0).toUpperCase() || (position === 'you' ? 'Y' : 'O');

  return (
    <article
      className={`match-player-card is-${position} ${currentPlayer === slot && !finished ? 'is-active' : ''} ${isWinner ? 'is-winner' : ''}`}
      style={{ '--player-color': color } as CSSProperties}
      aria-label={`${position === 'you' ? 'Your player card' : 'Opponent player card'}: ${name}, ${status.toLowerCase()}`}
    >
      <span className="match-player-avatar" aria-hidden="true">{initial}</span>
      <div className="match-player-identity">
        <div className="match-player-overline">
          <span>{position === 'you' ? 'YOU' : 'OPPONENT'}</span>
          <span className="match-player-slot">PLAYER {slot + 1}</span>
        </div>
        <div className="match-player-name-row">
          <strong title={name}>{name}</strong>
          <NationalityDisplay value={nationality} className="match-player-nationality" />
        </div>
        <div className="match-player-presence">
          <i className={connected ? 'is-connected' : ''} />
          {finished ? 'FINAL' : connected ? 'CONNECTED' : 'RECONNECTING'}
        </div>
      </div>
      <div className={`match-player-status ${isWinner ? 'is-winner' : ''}`}>
        <span>{status}</span>
        <strong>{clock > 0 ? formatClock(clock) : '--:--'}</strong>
        <small>TIME</small>
      </div>
    </article>
  );
}
