'use client';

import { useRef, useState } from 'react';
import { deriveTransfers, launchOrb, normalizeExplosionCells, waitForPaint, REACTION_TIMING, wait } from './reaction-animation';
import type { AcceptedMove, Cell, GameState, ReactionEffects, Transfer } from './types';

type Placement = { cell: number | null; player: number };
type AnimationJob = (isCurrent: () => boolean) => Promise<void>;

/** Manages the temporary display board and serialized visual reaction timeline. */
export function useReactionPlayback(
  colorForSlot: (slot: number) => string,
  onPlaybackComplete: () => void,
) {
  const [wave, setWave] = useState<ReactionEffects | null>(null);
  const [animating, setAnimating] = useState(false);
  const [displayCells, setDisplayCells] = useState<Cell[] | null>(null);

  const animationIdRef = useRef(0);
  const animationChainRef = useRef<Promise<void>>(Promise.resolve());
  const animationPendingRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const flightLayerRef = useRef<HTMLDivElement | null>(null);

  const finishAnimations = () => {
    setWave(null);
    setDisplayCells(null);
    isAnimatingRef.current = false;
    setAnimating(false);
    onPlaybackComplete();
  };

  const cancelAnimations = () => {
    animationIdRef.current += 1;
    animationPendingRef.current = 0;
    isAnimatingRef.current = false;
    animationChainRef.current = Promise.resolve();
    flightLayerRef.current?.replaceChildren();
    setAnimating(false);
    setWave(null);
    setDisplayCells(null);
  };

  /** Run one move's reaction only after any earlier move animation has settled. */
  const enqueueAnimation = (job: AnimationJob) => {
    const epoch = animationIdRef.current;
    const isCurrent = () => epoch === animationIdRef.current;
    animationPendingRef.current += 1;
    isAnimatingRef.current = true;
    setAnimating(true);

    animationChainRef.current = animationChainRef.current.then(async () => {
      if (!isCurrent()) return;
      try {
        await job(isCurrent);
      } catch (error) {
        console.error('[reaction] animation failed', error);
      }
      if (!isCurrent()) return;

      animationPendingRef.current = Math.max(0, animationPendingRef.current - 1);
      if (animationPendingRef.current === 0) finishAnimations();
    });
  };

  const playReaction = async (
    isCurrent: () => boolean,
    base: GameState,
    placement: Placement,
    steps: NonNullable<NonNullable<AcceptedMove['reaction']>['steps']>,
    finalCells: Cell[],
  ) => {
    const { width, height } = base.board;
    const frames = base.board.cells.map((cell) => ({ ...cell }));
    const publishBoard = () => setDisplayCells(frames.map((cell) => ({ ...cell })));
    const placedCell =
      placement.cell !== null && frames[placement.cell] ? placement.cell : null;

    if (placedCell !== null) {
      frames[placedCell].owner = placement.player;
      frames[placedCell].orb_count += 1;
    }

    publishBoard();
    setWave({
      charge: [],
      burst: [],
      receive: placedCell !== null
        ? [{ cell: placedCell, player: placement.player }]
        : [],
    });
    await wait(steps.length ? REACTION_TIMING.intro : 220);
    if (!isCurrent()) return;

    for (const [stepIndex, step] of steps.entries()) {
      // Longer chains accelerate slightly so their total playback stays manageable.
      const speed = stepIndex < 3 ? 1 : stepIndex < 8 ? 0.8 : 0.65;
      let explosions = normalizeExplosionCells(step.explosions, frames.length);
      const transfers: Transfer[] = deriveTransfers(
        explosions,
        step.transfers,
        frames,
        width,
        height,
      );
      if (explosions.length === 0) {
        explosions = [...new Set(transfers.map((transfer) => transfer.from))];
      }

      // Charge: signal which cells are about to burst while their orbs remain visible.
      setWave({ charge: explosions, burst: [], receive: [] });
      await wait(REACTION_TIMING.charge * speed);
      if (!isCurrent()) return;

      // Launch: remove outgoing orbs from their cells before adding flight sprites.
      const bursts = explosions.map((cell) => ({
        cell,
        player: frames[cell].owner ?? 0,
      }));
      for (const cell of explosions) {
        const outgoingCount = transfers.filter((transfer) => transfer.from === cell).length;
        const remainingCount = outgoingCount ? frames[cell].orb_count - outgoingCount : 0;
        frames[cell] = remainingCount > 0
          ? { owner: frames[cell].owner, orb_count: remainingCount }
          : { owner: null, orb_count: 0 };
      }

      publishBoard();
      setWave({ charge: [], burst: bursts, receive: [] });
      await waitForPaint();
      if (!isCurrent()) return;

      // Fly: add each orb to the destination when its own animation finishes.
      const layer = flightLayerRef.current;
      const grid = gridRef.current;
      const landed: { cell: number; player: number }[] = [];
      const departuresByCell = new Map<number, number>();
      const duration = Math.max(110, REACTION_TIMING.flight * speed);

      await Promise.all(
        transfers.map((transfer) => {
          const departureIndex = departuresByCell.get(transfer.from) ?? 0;
          departuresByCell.set(transfer.from, departureIndex + 1);

          const flight = layer && grid
            ? launchOrb(
                layer,
                grid,
                transfer,
                colorForSlot(transfer.player),
                departureIndex * REACTION_TIMING.stagger * speed,
                duration,
              )
            : null;

          return (flight ? flight.finished : wait(duration)).then(async () => {
            if (!isCurrent()) return;

            frames[transfer.to] = {
              owner: transfer.player,
              orb_count: frames[transfer.to].orb_count + 1,
            };
            landed.push({ cell: transfer.to, player: transfer.player });
            publishBoard();
            setWave({ charge: [], burst: bursts, receive: [...landed] });
            await waitForPaint();
            flight?.remove();
          });
        }),
      );
      if (!isCurrent()) return;

      // Settle: show every landed orb before the next wave starts.
      await wait(REACTION_TIMING.settle * speed);
      if (!isCurrent()) return;
    }

    setDisplayCells(finalCells.map((cell) => ({ ...cell })));
    setWave(null);
    await waitForPaint();
  };

  const queueReaction = (
    base: GameState,
    placement: Placement,
    steps: NonNullable<NonNullable<AcceptedMove['reaction']>['steps']>,
    finalCells: Cell[],
  ) => {
    enqueueAnimation((isCurrent) =>
      playReaction(isCurrent, base, placement, steps, finalCells),
    );
  };

  return {
    wave,
    animating,
    displayCells,
    setDisplayCells,
    isAnimatingRef,
    animationPendingRef,
    gridRef,
    flightLayerRef,
    queueReaction,
    cancelAnimations,
  };
}
