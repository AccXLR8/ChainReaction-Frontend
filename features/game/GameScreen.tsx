import type { SessionUser } from '@/features/auth/types';
import { BoardPanel, type BoardPanelProps } from './BoardPanel';
import { MatchSidebar, type MatchSidebarProps } from './MatchSidebar';

type GameScreenProps = {
  stage: 'game' | 'finished';
  user: SessionUser;
  socketStatus: string;
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
    <main className="shell" id="play">
      <header className="topbar">
        <a className="brand" href="#play">
          <span className="brand-mark">✳</span>
          <span className="brand-wordmark"><span>Super</span><strong>kritical</strong></span>
        </a>
        <div className={`connection service-${socketStatus}`}>
          <i /> {socketStatus.toUpperCase()} <span>●</span> {user.username}
        </div>
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

      <section className="game-layout">
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
