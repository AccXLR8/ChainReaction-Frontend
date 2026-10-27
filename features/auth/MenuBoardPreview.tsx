import { BoardPanel, type BoardPanelProps } from '@/features/game/BoardPanel';

/** Uses the match board renderer so the lobby and active game share the same board design. */
export function MenuBoardPreview({ board }: { board: BoardPanelProps }) {
  return <BoardPanel {...board} />;
}
