import type { CSSProperties } from 'react';
import type { SessionUser } from '@/features/auth/types';
import { BoardPanel, type BoardPanelProps } from './BoardPanel';
import { LatencyIndicator, type LatencyQuality } from './LatencyIndicator';
import { MatchSidebar, type MatchSidebarProps } from './MatchSidebar';
import { BrandLockup } from '@/features/brand/BrandLockup';

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
        style={{ '--board-stage-height': `${board.stageHeight}px` } as CSSProperties}
      >
        <BoardPanel {...board} />
        <MatchSidebar {...sidebar} />
      </section>

      <footer>
        <span>Superkritical <b>／</b> {matchLabel}</span>
        <span>API STATUS · {serviceStatus.toUpperCase()}</span>
      </footer>
    </main>
  );
}
