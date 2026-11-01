import type { CSSProperties } from 'react';
import type { GameState } from './types';

export type MatchSidebarProps = {
  stage: string;
  game: GameState | null;
  socketStatus: string;
  waveActive: boolean;
  currentPlayer: number;
  winner: number | null;
  ownSlot: number | null;
  playerNames: string[];
  playerNationalities: string[];
  playerClocks: number[];
  playerConnected: boolean[];
  colorForSlot: (slot: number) => string;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
};

/** Keeps match status and actions together while the player identities frame the board. */
export function MatchSidebar({
  stage,
  game,
  socketStatus,
  waveActive,
  currentPlayer,
  winner,
  ownSlot,
  playerNames,
  colorForSlot,
  onPlayAgain,
  onReturnToLobby,
}: MatchSidebarProps) {
  const gameFinished = stage === 'finished';
  const yourTurn = ownSlot !== null && currentPlayer === ownSlot;
  const activeColor = colorForSlot(currentPlayer);
  const winnerName = winner === null ? null : playerNames[winner] ?? `Player ${winner + 1}`;
  const youWon = winner !== null && winner === ownSlot;
  const resultTitle = winner === null
    ? 'The match is a draw'
    : youWon
      ? 'You win'
      : `${winnerName} wins`;
  const resultMessage = winner === null
    ? 'Both sides held the arena. Start another match when you’re ready.'
    : youWon
      ? 'A decisive chain. Ready to take on another player?'
      : 'A strong opponent this round. Your next match is one click away.';

  return (
    <aside className={`side-panel match-sidebar ${gameFinished ? 'is-complete' : ''}`}>
      <div className="panel-head">
        <span>{gameFinished ? 'MATCH SUMMARY' : 'LIVE MATCH'}</span>
        <span className={`live-tag ${socketStatus !== 'live' ? 'is-muted' : ''}`}>
          <i /> {gameFinished ? 'COMPLETE' : socketStatus.toUpperCase()}
        </span>
      </div>

      {!gameFinished ? (
        <section
          className={`match-turn-card ${waveActive ? 'is-reacting' : ''}`}
          style={{ '--player-color': activeColor } as CSSProperties}
          aria-live="polite"
        >
          <span className="match-turn-orb" aria-hidden="true" />
          <div>
            <span className="eyebrow-mini">
              {waveActive ? 'CHAIN REACTION' : yourTurn ? 'YOUR TURN' : 'OPPONENT’S TURN'}
            </span>
            <h2>
              {waveActive
                ? 'The board is reacting'
                : yourTurn ? 'Make your move' : 'Opponent to play'}
            </h2>
            <p>
              {waveActive
                ? 'Watch the chain resolve before the next move.'
                : yourTurn
                  ? 'Choose a cell you own, or claim an empty one.'
                  : `Waiting for ${playerNames[currentPlayer] ?? 'your opponent'}.`}
            </p>
          </div>
        </section>
      ) : (
        <section
          className={`match-result ${youWon ? 'is-your-win' : winner !== null ? 'is-opponent-win' : 'is-draw'}`}
          aria-live="polite"
        >
          <span className="result-icon" aria-hidden="true">{youWon ? '✦' : '✳'}</span>
          <span className="eyebrow-mini">FINAL RESULT</span>
          <h2>{resultTitle}</h2>
          <p>{resultMessage}</p>
          <button className="queue-button" onClick={onPlayAgain}>
            Find next match <span>↗</span>
          </button>
          <button className="result-lobby" onClick={onReturnToLobby}>Return to lobby</button>
        </section>
      )}

      <div className="divider" />
      <div className="stats" aria-label="Match details">
        <div><span>TURN</span><b>{String(game?.turn_number ?? 0).padStart(2, '0')}</b></div>
        <div>
          <span>BOARD</span>
          <b>{game ? `${game.board.width} × ${game.board.height}` : '8 × 8'}</b>
        </div>
        <div><span>STATUS</span><b>{gameFinished ? 'FINAL' : waveActive ? 'ACTIVE' : 'READY'}</b></div>
      </div>

      {!gameFinished && (
        <>
          <div className="divider" />
          <button className="new-game wide" onClick={onReturnToLobby}>← Return to lobby</button>
          <div className="rules">
            <span className="rules-icon" aria-hidden="true">⌁</span>
            <p>Fill a cell to its <b>critical mass</b> and it bursts into its neighbors.</p>
          </div>
        </>
      )}
    </aside>
  );
}
