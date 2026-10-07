import { getNeighborCells, readNumber } from './board-model';
import type { Transfer } from './types';

// Reaction durations are intentionally centralized so the motion sequence is easy to tune.
export const REACTION_TIMING = {
  intro: 90,
  charge: 80,
  flight: 170,
  stagger: 14,
  settle: 30,
} as const;

export const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

/** Two frames let React commit and the browser paint state before the next phase begins. */
export const waitForPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/**
 * Read both cell centers from the live grid before creating an orb flight.
 * Measuring the DOM keeps trajectories aligned with responsive cell sizing.
 */
export function launchOrb(
  layer: HTMLElement,
  grid: HTMLElement,
  transfer: Transfer,
  color: string,
  delay: number,
  duration: number,
) {
  const source = grid.children[transfer.from] as HTMLElement | undefined;
  const destination = grid.children[transfer.to] as HTMLElement | undefined;
  if (!source || !destination) return null;

  const size = Math.max(10, Math.round(source.offsetWidth * 0.4));
  const startX = source.offsetLeft + source.offsetWidth / 2;
  const startY = source.offsetTop + source.offsetHeight / 2;
  const deltaX = destination.offsetLeft + destination.offsetWidth / 2 - startX;
  const deltaY = destination.offsetTop + destination.offsetHeight / 2 - startY;
  const distance = Math.hypot(deltaX, deltaY);
  const angle = Math.atan2(deltaY, deltaX);

  const rail = document.createElement('span');
  rail.className = 'flight-rail';
  rail.style.cssText = `left:${startX}px;top:${startY - size * 0.11}px;width:${distance}px;height:${size * 0.22}px;--c:${color}`;

  const orb = document.createElement('span');
  orb.className = 'flight';
  orb.style.cssText = `left:${startX - size / 2}px;top:${startY - size / 2}px;width:${size}px;height:${size}px;--c:${color};--angle:${angle}rad;--tail:${size * 1.8}px`;
  orb.innerHTML = '<i class="flight-trail"></i><i class="flight-body"></i>';
  layer.append(rail, orb);

  const railAnimation = rail.animate(
    [
      { opacity: 0, transform: `rotate(${angle}rad) scaleX(0)` },
      { opacity: 0.9, transform: `rotate(${angle}rad) scaleX(0.5)`, offset: 0.35 },
      { opacity: 0.55, transform: `rotate(${angle}rad) scaleX(1)`, offset: 0.8 },
      { opacity: 0, transform: `rotate(${angle}rad) scaleX(1)` },
    ],
    { duration: duration + 180, delay, fill: 'both', easing: 'ease-out' },
  );
  void railAnimation.finished.then(() => rail.remove()).catch(() => undefined);

  const animation = orb.animate(
    [
      { opacity: 0, transform: 'translate3d(0,0,0) scale(0.5)' },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1.05)', offset: 0.1 },
      {
        opacity: 1,
        transform: `translate3d(${deltaX / 2}px,${deltaY / 2}px,0) scale(1.3)`,
        offset: 0.55,
      },
      {
        opacity: 1,
        transform: `translate3d(${deltaX}px,${deltaY}px,0) scale(0.95)`,
      },
    ],
    { duration, delay, fill: 'both', easing: 'ease-in-out' },
  );

  return {
    finished: animation.finished.then(() => undefined).catch(() => undefined),
    remove: () => {
      orb.remove();
      rail.remove();
    },
  };
}

export function deriveTransfers(
  explosions: number[],
  rawTransfers: Record<string, unknown>[] | undefined,
  cells: { owner: number | null }[],
  width: number,
  height: number,
): Transfer[] {
  const transfers: Transfer[] = [];

  for (const raw of rawTransfers ?? []) {
    const from = readNumber(raw, ['from_cell', 'from', 'source_cell', 'source']);
    const to = readNumber(raw, ['to_cell', 'to', 'target_cell', 'target', 'destination_cell']);
    if (from === undefined || to === undefined || !cells[from] || !cells[to]) continue;

    transfers.push({
      from,
      to,
      player: readNumber(raw, ['player', 'player_slot', 'owner']) ?? cells[from].owner ?? 0,
    });
  }

  // Some engine versions return burst cells without transfers; infer the same orthogonal sends.
  if (transfers.length === 0 && explosions.length > 0) {
    return explosions.flatMap((from) =>
      getNeighborCells(from, width, height).map((to) => ({
        from,
        to,
        player: cells[from].owner ?? 0,
      })),
    );
  }

  return transfers;
}

export function normalizeExplosionCells(
  rawExplosions: Record<string, unknown>[] | undefined,
  cellCount: number,
): number[] {
  return (rawExplosions ?? [])
    .map((explosion) => readNumber(explosion, ['cell', 'cell_index', 'index']))
    .filter((cell): cell is number => cell !== undefined && cell >= 0 && cell < cellCount);
}
