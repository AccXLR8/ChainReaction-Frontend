import type { CSSProperties } from 'react';
import type { GameState } from './types';
import { formatClock } from './board-model';

export type MatchSidebarProps = {
  stage: string;
  game: GameState | null;
  socketStatus: string;
  waveActive: boolean;
  currentPlayer: number;
  winner: number | null;
  ownSlot: number | null;
  playerNames: string[];
  playerClocks: number[];
  playerConnected: boolean[];
  colorForSlot: (slot: number) => string;
  playerRole: (slot: number) => string;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
};

/** Turn status, player connection cards, result controls, and match details. */
export function MatchSidebar({
  stage,
  game,
  socketStatus,
  waveActive,
  currentPlayer,
  winner,
  ownSlot,
  playerNames,
  playerClocks,
  playerConnected,
  colorForSlot,
  playerRole,
  onPlayAgain,
  onReturnToLobby,
}: MatchSidebarProps) {
  const gameFinished = stage === 'finished';

  return (
    <aside className="side-panel">
      <div className="panel-head">
        <span>LIVE MATCH</span>
        <span className={`live-tag ${socketStatus !== 'live' ? 'is-muted' : ''}`}>
          <i /> {socketStatus.toUpperCase()}
        </span>
      </div>
      <div className="turn-label">
        {gameFinished ? 'MATCH COMPLETE' : currentPlayer === ownSlot ? 'YOUR TURN' : 'OPPONENT’S TURN'}
      </div>
      <div
        className="active-player"
        style={{ '--accent': colorForSlot(currentPlayer) } as CSSProperties}
      >
        <span className="player-orb" />
        <div>
          <strong>
            {winner !== null
              ? playerNames[winner] ?? `Player ${winner + 1}`
              : playerNames[currentPlayer] ?? `Player ${currentPlayer + 1}`}
          </strong>
          <small>
            {winner !== null
              ? winner === ownSlot ? 'VICTORY' : 'WINNER'
              : currentPlayer === ownSlot ? 'YOU · TO PLAY' : 'THINKING'}
          </small>
        </div>
        <span className="turn-arrow">↗</span>
      </div>

      <div className="players">
        {[0, 1].map((slot) => (
          <div
            className={`player-card ${currentPlayer === slot && winner === null ? 'selected' : ''} ${playerConnected[slot] ? 'connected' : 'disconnected'}`}
            style={{ '--player-color': colorForSlot(slot) } as CSSProperties}
            key={slot}
          >
            <span
              className="dot"
              title={playerConnected[slot] ? 'Connected' : 'Reconnecting'}
            />
            <div>
              <b>{playerNames[slot]}</b>
              <small>
                {playerRole(slot)} {playerClocks[slot] > 0 ? `· ${formatClock(playerClocks[slot])}` : ''}
              </small>
            </div>
            <span className="player-id">P{slot + 1}</span>
          </div>
        ))}
      </div>

      {gameFinished && (
        <div className="match-result">
          <span className="result-icon">✳</span>
          <span className="eyebrow-mini">FINAL RESULT</span>
          <strong>
            {winner === null
              ? 'Match complete'
              : winner === ownSlot ? 'Victory' : `${playerNames[winner] ?? 'Opponent'} wins`}
          </strong>
          <small>
            {winner === ownSlot
              ? 'You conquered the chain.'
              : winner === null ? 'Thanks for playing.' : 'Better luck next round.'}
          </small>
          <button className="queue-button" onClick={onPlayAgain}>
            Find next match <span>↗</span>
          </button>
          <button className="result-lobby" onClick={onReturnToLobby}>Return to lobby</button>
        </div>
      )}

      <div className="divider" />
      <div className="stats">
        <div><span>TURN</span><b>{String(game?.turn_number ?? 0).padStart(2, '0')}</b></div>
        <div>
          <span>BOARD</span>
          <b>{game ? `${game.board.width} × ${game.board.height}` : '8 × 8'}</b>
        </div>
        <div><span>REACTION</span><b>{waveActive ? 'ACTIVE' : 'READY'}</b></div>
      </div>
      <div className="divider" />
      <button className="new-game wide" onClick={gameFinished ? onPlayAgain : onReturnToLobby}>
        {gameFinished ? '↻  Play again' : '←  Return to lobby'}
      </button>
      <div className="rules">
        <span className="rules-icon">⌁</span>
        <p>Fill a cell to its <b>critical mass</b> and it bursts into its neighbors.</p>
      </div>
    </aside>
  );
}
