import type { CSSProperties, RefObject } from 'react';
import type { Cell, GameState, ReactionEffects } from './types';

export type BoardPanelProps = {
  game: GameState | null;
  cells: Cell[] | null;
  wave: ReactionEffects | null;
  lastMove: number | null;
  busy: boolean;
  animating: boolean;
  winner: number | null;
  isYourTurn: boolean;
  ownSlot: number | null;
  socketStatus: string;
  notice: string;
  ownPlayerName: string;
  opponentPlayerName: string;
  boardWidth: number;
  boardHeight: number;
  cellSize: number;
  cellGap: number;
  stageWidth: number;
  stageHeight: number;
  activeBoardColor: string;
  gridRef: RefObject<HTMLDivElement | null>;
  flightLayerRef: RefObject<HTMLDivElement | null>;
  colorForSlot: (slot: number) => string;
  onPlay: (index: number) => void;
};

/** Interactive grid and its overlay, kept separate from match-level controls. */
export function BoardPanel({
  game,
  cells,
  wave,
  lastMove,
  busy,
  animating,
  winner,
  isYourTurn,
  ownSlot,
  socketStatus,
  notice,
  ownPlayerName,
  opponentPlayerName,
  boardWidth,
  boardHeight,
  cellSize,
  cellGap,
  stageWidth,
  stageHeight,
  activeBoardColor,
  gridRef,
  flightLayerRef,
  colorForSlot,
  onPlay,
}: BoardPanelProps) {
  const visibleCells = cells ?? game?.board.cells;

  return (
    <section className="board-panel">
      <div className="board-heading">
        <div>
          <span className="eyebrow-mini">THE ARENA</span>
          <h2>Game board</h2>
        </div>
        <div className="legend">
          <span><i className="green-bg" /> {ownPlayerName}</span>
          <span><i className="red-bg" /> {opponentPlayerName}</span>
        </div>
      </div>

      <div className="arena">
        {!game && (
          <div className="empty-arena">
            <span className="empty-mark">✳</span>
            <h3>Preparing the arena</h3>
            <p>{notice}</p>
          </div>
        )}

        <div
          className="grid-stage"
          style={
            {
              '--cols': boardWidth,
              '--cell': `${cellSize}px`,
              '--gap': `${cellGap}px`,
              '--active-color': activeBoardColor,
              width: `${stageWidth}px`,
              height: `${stageHeight}px`,
            } as CSSProperties
          }
        >
          {game && visibleCells && (
            <>
              <div className="grid-wrap" ref={gridRef}>
                {visibleCells.map((cell, index) => {
                  const row = Math.floor(index / game.board.width);
                  const column = index % game.board.width;
                  // Corners need 2 orbs to burst, edges 3, and interior cells 4.
                  const criticalMass =
                    (row === 0 || row === game.board.height - 1 ? 1 : 2) +
                    (column === 0 || column === game.board.width - 1 ? 1 : 2);
                  const charging = wave?.charge.includes(index) ?? false;
                  const bursting = wave?.burst.find((item) => item.cell === index);
                  const receiving = wave?.receive.find((item) => item.cell === index);

                  return (
                    <button
                      key={index}
                      className={`cell ${cell.owner !== null ? `owned owner-${cell.owner}` : ''} ${charging ? 'charge' : ''} ${bursting ? 'explode' : ''} ${receiving ? 'receive' : ''} ${lastMove === index ? 'last-move' : ''}`}
                      onClick={() => onPlay(index)}
                      disabled={
                        busy || animating || winner !== null || !isYourTurn ||
                        (cell.owner !== null && cell.owner !== ownSlot) || socketStatus !== 'live'
                      }
                      aria-label={`Row ${row + 1}, column ${column + 1}${cell.owner !== null ? `, player ${cell.owner + 1}, ${cell.orb_count} orbs` : ', empty'}`}
                      style={
                        {
                          '--owner': cell.owner !== null
                            ? colorForSlot(cell.owner)
                            : bursting ? colorForSlot(bursting.player) : 'transparent',
                        } as CSSProperties
                      }
                    >
                      <span className="critical">{criticalMass}</span>
                      {cell.orb_count > 0 && (
                        <span
                          className={`orbs count-${cell.orb_count}`}
                          style={
                            {
                              '--count': Math.min(cell.orb_count, 4),
                              '--vibration-duration':
                                criticalMass - cell.orb_count <= 1
                                  ? '180ms'
                                  : criticalMass - cell.orb_count === 2
                                    ? '300ms'
                                    : '650ms',
                              '--spin-duration':
                                criticalMass - cell.orb_count <= 1
                                  ? '1.7s'
                                  : criticalMass - cell.orb_count === 2
                                    ? '2.9s'
                                    : '4.4s',
                              '--vibration-scale':
                                criticalMass - cell.orb_count <= 1
                                  ? '1.04'
                                  : criticalMass - cell.orb_count === 2
                                    ? '1.02'
                                    : '1.008',
                            } as CSSProperties
                          }
                        >
                          <span className="orb-cluster">
                            <span className="orb-ring" key={Math.min(cell.orb_count, 4)}>
                              {Array.from(
                                { length: Math.min(cell.orb_count, 4) },
                                (_, orbIndex) => (
                                  <span
                                    className="atom orb-spin-preview"
                                    key={orbIndex}
                                    style={{ '--orb-i': orbIndex } as CSSProperties}
                                  />
                                ),
                              )}
                            </span>
                          </span>
                        </span>
                      )}
                      {bursting && <span className="burst" />}
                    </button>
                  );
                })}
              </div>
              <div className="orb-flight-layer" ref={flightLayerRef} aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      <div className="board-footer">
        <span>
          <i className={busy ? 'thinking' : ''} />
          {notice}
        </span>
        <span className="engine-note">
          {socketStatus === 'live' ? 'LIVE · WEBSOCKET SYNC' : socketStatus.toUpperCase()}
        </span>
      </div>
    </section>
  );
}
