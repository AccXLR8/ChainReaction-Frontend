import type { CSSProperties } from 'react';
import type { SessionUser } from '@/features/auth/types';
import { BoardPanel, type BoardPanelProps } from './BoardPanel';
import { LatencyIndicator, type LatencyQuality } from './LatencyIndicator';
import { MatchSidebar, type MatchSidebarProps } from './MatchSidebar';
import { BrandLockup } from '@/features/brand/BrandLockup';
import { MatchPlayerCard } from './MatchPlayerCard';
import { MATCH_PLAYER_CHROME_HEIGHT } from './match-layout';

type GameScreenProps = {
  stage: 'game' | 'finished';
  user: SessionUser;
  socketStatus: string;
  latencyMs: number | null;
  latencyQuality: LatencyQuality;
  serviceStatus: string;
  gameId: string | null;
  turnNumber: number;
  board: BoardPanelProps;
  sidebar: MatchSidebarProps;
  onReturnToLobby: () => void;
  onPlayAgain: () => void;
};

/** The active match shell; board rendering and match details live in their own components. */
export function GameScreen({
  stage,
  user,
  socketStatus,
  latencyMs,
  latencyQuality,
  serviceStatus,
  gameId,
  turnNumber,
  board,
  sidebar,
  onReturnToLobby,
  onPlayAgain,
}: GameScreenProps) {
  const isFinished = stage === 'finished';
  const matchLabel = gameId ? `MATCH ${gameId.slice(0, 8).toUpperCase()}` : 'LIVE MATCH';
  const ownSlot = sidebar.ownSlot ?? 0;
  const opponentSlot = 1 - ownSlot;

  return (
    <main className={`shell game-shell ${isFinished ? 'is-finished' : ''}`} id="play">
      <header className="topbar">
        <a className="brand" href="#play">
          <BrandLockup />
        </a>
        <div className={`connection service-${socketStatus}`}>
          <i /> {socketStatus.toUpperCase()} <span>●</span>
          <strong className="connection-user">{user.username}</strong>
        </div>
        <LatencyIndicator quality={latencyQuality} latencyMs={latencyMs} />
        <button
          className="new-game top-new"
          onClick={isFinished ? onPlayAgain : onReturnToLobby}
        >
          ↻ <span>{isFinished ? 'Play again' : 'Lobby'}</span>
        </button>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> TWO PLAYER STRATEGY</div>
        <h1>Superkritical<span>.</span></h1>
        <p>
          {isFinished
            ? 'The chain has settled. Ready for another round?'
            : `Match ${gameId?.slice(0, 8) ?? '—'} · Turn ${turnNumber}`}
        </p>
      </section>

      <section
        className="game-layout"
        style={{
          '--board-stage-height': `${board.stageHeight}px`,
          '--board-stage-width': `${board.stageWidth}px`,
          '--match-board-stack-height': `${board.stageHeight + MATCH_PLAYER_CHROME_HEIGHT}px`,
        } as CSSProperties}
      >
        <div className="match-board-stack">
          <MatchPlayerCard
            slot={opponentSlot}
            position="opponent"
            name={sidebar.playerNames[opponentSlot] ?? 'Opponent'}
            nationality={sidebar.playerNationalities[opponentSlot]}
            clock={sidebar.playerClocks[opponentSlot]}
            connected={sidebar.playerConnected[opponentSlot]}
            color={sidebar.colorForSlot(opponentSlot)}
            currentPlayer={sidebar.currentPlayer}
            winner={sidebar.winner}
            finished={isFinished}
          />
          <BoardPanel {...board} />
          <MatchPlayerCard
            slot={ownSlot}
            position="you"
            name={sidebar.playerNames[ownSlot] ?? user.username}
            nationality={sidebar.playerNationalities[ownSlot]}
            clock={sidebar.playerClocks[ownSlot]}
            connected={sidebar.playerConnected[ownSlot]}
            color={sidebar.colorForSlot(ownSlot)}
            currentPlayer={sidebar.currentPlayer}
            winner={sidebar.winner}
            finished={isFinished}
          />
        </div>
        <MatchSidebar {...sidebar} />
      </section>

      <footer>
        <span>Superkritical <b>／</b> {matchLabel}</span>
        <span>API STATUS · {serviceStatus.toUpperCase()}</span>
      </footer>
    </main>
  );
}
