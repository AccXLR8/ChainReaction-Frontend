'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { BoardPanel } from '@/features/game/BoardPanel';
import { DEFAULT_ORB_SKIN, normalizeSkinRarity, type OrbSkinAppearance, type OrbSkinCatalogItem } from '@/features/game/orb-skins';
import { useReactionPlayback } from '@/features/game/useReactionPlayback';
import {
  ORB_SKIN_PREVIEW_FINAL_CELLS,
  ORB_SKIN_PREVIEW_GAME,
  ORB_SKIN_PREVIEW_STEPS,
} from './orb-preview-game';

type Playback = ReturnType<typeof useReactionPlayback>;

type OrbSkinPreviewDialogProps = {
  skin: OrbSkinCatalogItem;
  equipped: boolean;
  owned: boolean;
  unlocksThroughAchievements: boolean;
  token: string | null;
  busy: boolean;
  shopMode?: boolean;
  canPurchase?: boolean;
  gemPrice?: number | null;
  gemsBalance?: number | null;
  purchaseBusy?: boolean;
  purchaseError?: string;
  onClose: () => void;
  onEquip: () => void;
  onPurchase?: () => void;
  onBuyGems?: () => void;
  onRequestSignIn: () => void;
};

/** Shows this skin through the same board and reaction pipeline as a live match. */
export function OrbSkinPreviewDialog({
  skin,
  equipped,
  owned,
  unlocksThroughAchievements,
  token,
  busy,
  shopMode = false,
  canPurchase = false,
  gemPrice = null,
  gemsBalance = null,
  purchaseBusy = false,
  purchaseError = '',
  onClose,
  onEquip,
  onPurchase,
  onBuyGems,
  onRequestSignIn,
}: OrbSkinPreviewDialogProps) {
  const [replayKey, setReplayKey] = useState(0);
  const [settled, setSettled] = useState(false);
  const [cellSize, setCellSize] = useState(72);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeHandler = useRef(onClose);
  const boardFrameRef = useRef<HTMLDivElement | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const loopActiveRef = useRef(false);
  const repeatTimerRef = useRef<number | null>(null);
  closeHandler.current = onClose;

  const rarity = normalizeSkinRarity(skin.rarity);
  const boardGap = 4;

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!portalRoot) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHandler.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [portalRoot]);

  // Size the authentic fixed-cell board to the responsive square preview frame.
  useEffect(() => {
    if (!portalRoot) return;
    const frame = boardFrameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const available = Math.min(entry.contentRect.width, entry.contentRect.height);
      const nextCellSize = Math.max(24, Math.min(105, Math.floor((available - boardGap * 3) / 4)));
      setCellSize(nextCellSize);
    });
    resizeObserver.observe(frame);
    return () => resizeObserver.disconnect();
  }, [boardGap, portalRoot]);

  const appearanceForSlot = (slot: number): OrbSkinAppearance => {
    if (slot === 0) {
      return {
        skinId: skin.id,
        assetKey: skin.asset_key,
        assets: skin.assets,
        side: 'self',
        color: '#39e58c',
      };
    }
    return {
      skinId: DEFAULT_ORB_SKIN.id,
      assetKey: DEFAULT_ORB_SKIN.asset_key,
      assets: DEFAULT_ORB_SKIN.assets,
      side: 'opponent',
      color: '#ff5964',
    };
  };

  const handlePlaybackComplete = () => {
    setSettled(true);
    if (!loopActiveRef.current) return;

    repeatTimerRef.current = window.setTimeout(() => {
      if (!loopActiveRef.current) return;
      setSettled(false);
      playbackRef.current?.queueReaction(
        ORB_SKIN_PREVIEW_GAME,
        { cell: 0, player: 0 },
        ORB_SKIN_PREVIEW_STEPS,
        ORB_SKIN_PREVIEW_FINAL_CELLS,
      );
    }, 2_000);
  };

  const playback = useReactionPlayback(
    appearanceForSlot,
    handlePlaybackComplete,
    DEFAULT_ORB_SKIN.assets?.collision_sound?.url,
  );
  playbackRef.current = playback;

  useEffect(() => {
    if (!portalRoot) return;
    loopActiveRef.current = true;
    setSettled(false);
    playbackRef.current?.queueReaction(
      ORB_SKIN_PREVIEW_GAME,
      { cell: 0, player: 0 },
      ORB_SKIN_PREVIEW_STEPS,
      ORB_SKIN_PREVIEW_FINAL_CELLS,
    );

    return () => {
      loopActiveRef.current = false;
      if (repeatTimerRef.current !== null) window.clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
      playbackRef.current?.cancelAnimations();
    };
  }, [portalRoot, replayKey]);

  const boardSize = 4 * cellSize + 3 * boardGap;
  const displayCells = settled
    ? ORB_SKIN_PREVIEW_FINAL_CELLS
    : playback.displayCells ?? ORB_SKIN_PREVIEW_GAME.board.cells;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const replay = () => setReplayKey((key) => key + 1);

  if (!portalRoot) return null;

  return createPortal((
    <div className="orb-preview-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className={`orb-preview-dialog rarity-${rarity}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orb-preview-title"
      >
        <header className="orb-preview-header">
          <h2 id="orb-preview-title">{skin.name}</h2>
          <div className="orb-preview-header-actions">
            <button className="orb-preview-replay" type="button" onClick={replay} aria-label="Replay preview" title="Replay preview">
              <span aria-hidden="true">↻</span>
            </button>
            <button ref={closeButtonRef} className="orb-preview-close" type="button" onClick={onClose} aria-label="Close skin preview" title="Close">×</button>
          </div>
        </header>

        <div className="orb-preview-content">
          <div className="orb-preview-board-wrap" ref={boardFrameRef}>
            <BoardPanel
              game={ORB_SKIN_PREVIEW_GAME}
              cells={displayCells}
              wave={playback.wave}
              lastMove={0}
              busy={playback.animating}
              animating={playback.animating}
              winner={null}
              isYourTurn={false}
              ownSlot={0}
              socketStatus="preview"
              notice=""
              ownPlayerName="YOU"
              opponentPlayerName="OPPONENT"
              boardWidth={4}
              boardHeight={4}
              cellSize={cellSize}
              cellGap={boardGap}
              stageWidth={boardSize}
              stageHeight={boardSize}
              activeBoardColor="#39e58c"
              gridRef={playback.gridRef}
              flightLayerRef={playback.flightLayerRef}
              colorForSlot={(slot) => slot === 0 ? '#39e58c' : '#ff5964'}
              orbSkinForSlot={appearanceForSlot}
              onPlay={() => undefined}
            />
          </div>
          <div className="orb-preview-controls">
            {equipped ? (
              <span className="orb-preview-equipped" aria-label="Currently selected" title="Currently selected">✓</span>
            ) : owned && token ? (
              <button className="orb-preview-equip" type="button" onClick={onEquip} disabled={busy}>
                {busy ? 'Saving…' : 'Equip'}
              </button>
            ) : owned ? (
              <button className="orb-preview-equip" type="button" onClick={onRequestSignIn}>Sign in to equip</button>
            ) : shopMode ? (
              <button
                className="orb-preview-equip orb-preview-purchase"
                type="button"
                onClick={!canPurchase ? onRequestSignIn : gemPrice !== null && gemsBalance !== null && gemsBalance < gemPrice ? onBuyGems : onPurchase}
                disabled={purchaseBusy || (canPurchase && gemsBalance === null)}
              >
                {purchaseBusy
                  ? 'Buying…'
                  : !canPurchase
                    ? 'Sign in to buy'
                    : gemsBalance === null
                      ? 'Checking Gems…'
                      : gemPrice !== null && gemsBalance < gemPrice
                        ? 'Buy Gems'
                        : `Buy · ${gemPrice ?? 0} Gems`}
              </button>
            ) : (
              <span className="orb-preview-locked" aria-label="Skin is not owned" title={unlocksThroughAchievements ? 'Earn this skin through an achievement' : 'This skin is not in your locker'}>
                {unlocksThroughAchievements ? 'Achievement reward' : 'Not owned'}
              </span>
            )}
          </div>
          {purchaseError && <p className="orb-preview-purchase-error" role="alert">{purchaseError}</p>}
        </div>
      </section>
    </div>
  ), portalRoot);
}
