'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

// These types mirror the snake_case fields returned by the Rust engine.
type Cell = { owner: number | null; orb_count: number };
type Player = { id: number; eliminated: boolean; has_moved: boolean };
type State = {
  board: { width: number; height: number; cells: Cell[] };
  players: Player[];
  current_player_index: number;
  turn_number: number;
  status: { kind: string; winner?: number | null; eliminated?: number[] };
};
type Transfer = { from: number; to: number; player: number };
type SessionUser = { id: string; username: string; is_guest: boolean };
type AuthResponse = { access_token: string; token_type: string; user: SessionUser };
type AcceptedMove = { sequence?: number; final_state: unknown; status?: string; cell?: number; player_slot?: number; client_move_id?: string; reaction?: { placement?: { cell: number; player: number }; steps?: { explosions?: Record<string, unknown>[]; transfers?: Record<string, unknown>[] }[] } };
const COLORS = ['#39e58c', '#ff5964'];
const BOARD_SIZE = { width: 8, height: 8 };

type Fx = { charge: number[]; burst: { cell: number; player: number }[]; receive: { cell: number; player: number }[] };
const num = (o: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const k of keys) { const v = o[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return undefined;
};
const neighbours = (i: number, w: number, h: number) => {
  const r = Math.floor(i / w), c = i % w, out: number[] = [];
  if (r > 0) out.push(i - w); if (c < w - 1) out.push(i + 1); if (r < h - 1) out.push(i + w); if (c > 0) out.push(i - 1);
  return out;
};
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
// Global speed of the reaction animation. 1 = original pace, 1.5 = 50% faster.
const TEMPO = 2.4;
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

// Flies one orb between the REAL on-screen centres of two cells. Geometry is read from the DOM,
// so it stays correct on mobile layouts, different board sizes and any CSS overrides.
function launchOrb(layer: HTMLElement, grid: HTMLElement, t: Transfer, color: string, delay: number, duration: number) {
  const a = grid.children[t.from] as HTMLElement | undefined;
  const b = grid.children[t.to] as HTMLElement | undefined;
  if (!a || !b) return null;
  const size = Math.max(10, Math.round(a.offsetWidth * 0.4));
  const x0 = a.offsetLeft + a.offsetWidth / 2, y0 = a.offsetTop + a.offsetHeight / 2;
  const dx = b.offsetLeft + b.offsetWidth / 2 - x0, dy = b.offsetTop + b.offsetHeight / 2 - y0;
  const dist = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);

  const rail = document.createElement('span');
  rail.className = 'flight-rail';
  rail.style.cssText = `left:${x0}px;top:${y0 - size * 0.11}px;width:${dist}px;height:${size * 0.22}px;--c:${color}`;
  const orb = document.createElement('span');
  orb.className = 'flight';
  orb.style.cssText = `left:${x0 - size / 2}px;top:${y0 - size / 2}px;width:${size}px;height:${size}px;--c:${color};--angle:${angle}rad;--tail:${size * 1.8}px`;
  orb.innerHTML = '<i class="flight-trail"></i><i class="flight-body"></i>';
  layer.append(rail, orb);

  const rail_ = rail.animate([
    { opacity: 0, transform: `rotate(${angle}rad) scaleX(0)` },
    { opacity: 0.9, transform: `rotate(${angle}rad) scaleX(0.5)`, offset: 0.35 },
    { opacity: 0.55, transform: `rotate(${angle}rad) scaleX(1)`, offset: 0.8 },
    { opacity: 0, transform: `rotate(${angle}rad) scaleX(1)` },
  ], { duration: duration + 180, delay, fill: 'both', easing: 'ease-out' });
  void rail_.finished.then(() => rail.remove()).catch(() => undefined);

  const anim = orb.animate([
    { opacity: 0, transform: 'translate3d(0,0,0) scale(0.5)' },
    { opacity: 1, transform: 'translate3d(0,0,0) scale(1.05)', offset: 0.1 },
    { opacity: 1, transform: `translate3d(${dx / 2}px,${dy / 2}px,0) scale(1.3)`, offset: 0.55 },
    { opacity: 1, transform: `translate3d(${dx}px,${dy}px,0) scale(0.95)` },
  ], { duration, delay, fill: 'both', easing: 'ease-in-out' });
  return { finished: anim.finished.then(() => undefined).catch(() => undefined), remove: () => { orb.remove(); rail.remove(); } };
}

export default function Home() {
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [stage, setStage] = useState<'welcome' | 'lobby' | 'queue' | 'game' | 'finished'>('welcome');
  const [queueBusy, setQueueBusy] = useState(false);
  const [serviceStatus, setServiceStatus] = useState('checking');
  const [socketStatus, setSocketStatus] = useState('offline');
  const [ownSlot, setOwnSlot] = useState<number | null>(null);
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2']);
  const [playerClocks, setPlayerClocks] = useState<number[]>([]);
  const [playerConnected, setPlayerConnected] = useState<boolean[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Waiting for a match');
  const [errorMessage, setErrorMessage] = useState('');
  const [wave, setWave] = useState<Fx | null>(null);
  const [animating, setAnimating] = useState(false);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [displayCells, setDisplayCells] = useState<Cell[] | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/backend';
  const socketRef = useRef<WebSocket | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const sessionRef = useRef<{ token: string; user: SessionUser } | null>(null);
  const gameRef = useRef<State | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const animationRef = useRef(false);
  const animationIdRef = useRef(0);
  const animationChainRef = useRef<Promise<void>>(Promise.resolve());
  const animationPendingRef = useRef(0);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const flightLayerRef = useRef<HTMLDivElement | null>(null);
  const processedSequencesRef = useRef(new Set<number>());
  const lastSequenceRef = useRef(0);
  const pendingMoveRef = useRef<{ cell: number; id: string } | null>(null);
  const size = BOARD_SIZE;

  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiBase}${path}`, init);
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try { data = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { data = {}; }
    if (!response.ok) {
      if (response.status >= 500) throw new Error(`The game server could not process that request (${response.status}). Please try again shortly.`);
      throw new Error(String(data.detail || data.message || raw || `Request failed (${response.status})`));
    }
    return data;
  };
  const authRequest = (path: string, body?: unknown) => request(`/api/auth/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as Promise<AuthResponse>;

  const normalizeState = (input: unknown): State => {
    const raw = (input ?? {}) as Record<string, unknown>;
    const wrapped = (raw.final_state ?? raw.state ?? raw) as Record<string, unknown>;
    const board = (wrapped.board ?? {}) as Record<string, unknown>;
    const snapshot = wrapped.board_snapshot ?? wrapped.boardSnapshot ?? (Array.isArray(wrapped.board) ? wrapped.board : undefined) ?? board.cells;
    if (!Array.isArray(snapshot)) throw new Error(`Board snapshot missing (state fields: ${Object.keys(wrapped).join(', ') || 'none'}).`);
    const rows = Array.isArray(snapshot[0]) ? snapshot as (Cell | null)[][] : [snapshot as (Cell | null)[]];
    const width = Number(wrapped.width ?? board.width ?? rows[0]?.length ?? 0);
    const height = Number(wrapped.height ?? board.height ?? rows.length);
    const rawStatus = wrapped.status as State['status'] | { Won?: { winner: number } } | string | undefined;
    const status = typeof rawStatus === 'string'
      ? { kind: rawStatus.toLowerCase() }
      : rawStatus && 'Won' in rawStatus && rawStatus.Won
        ? { kind: 'won', winner: rawStatus.Won.winner }
        : (rawStatus as State['status'] | undefined) ?? { kind: 'active' };
    return {
      board: { width, height, cells: rows.flat().map((cell) => cell ?? { owner: null, orb_count: 0 }) },
      players: (wrapped.players as Player[] | undefined) ?? [{ id: 0, eliminated: false, has_moved: false }, { id: 1, eliminated: false, has_moved: false }],
      current_player_index: Number(wrapped.current_player ?? wrapped.current_player_index ?? 0),
      turn_number: Number(wrapped.turn_number ?? 0), status,
    };
  };
  const setAuthoritativeGame = (next: State | null) => { gameRef.current = next; setGame(next); };
  // ---- Reaction animation -------------------------------------------------------------------
  // Moves are queued so two reactions can never play over each other. Each job owns its own
  // private "display board" that nothing else touches until the job finishes.
  const finishAnimations = () => { setWave(null); setDisplayCells(null); animationRef.current = false; setAnimating(false); setBusy(false); };
  const cancelAnimations = () => {
    animationIdRef.current += 1; animationPendingRef.current = 0; animationRef.current = false;
    animationChainRef.current = Promise.resolve(); flightLayerRef.current?.replaceChildren();
    setAnimating(false); setWave(null); setDisplayCells(null);
  };
  const enqueueAnimation = (job: (alive: () => boolean) => Promise<void>) => {
    const epoch = animationIdRef.current;
    const alive = () => epoch === animationIdRef.current;
    animationPendingRef.current += 1; animationRef.current = true; setAnimating(true);
    animationChainRef.current = animationChainRef.current.then(async () => {
      if (!alive()) return;
      try { await job(alive); } catch (error) { console.error('[reaction] animation failed', error); }
      if (!alive()) return;
      animationPendingRef.current = Math.max(0, animationPendingRef.current - 1);
      if (animationPendingRef.current === 0) finishAnimations();
    });
  };
  const playReaction = async (alive: () => boolean, base: State, placement: { cell: number | null; player: number }, rawSteps: NonNullable<NonNullable<AcceptedMove['reaction']>['steps']>, finalCells: Cell[]) => {
    const { width: W, height: H } = base.board;
    const frames = base.board.cells.map((cell) => ({ ...cell }));
    const push = () => setDisplayCells(frames.map((cell) => ({ ...cell })));
    const placed = placement.cell !== null && frames[placement.cell] ? placement.cell : null;
    if (placed !== null) { frames[placed].owner = placement.player; frames[placed].orb_count += 1; }
    push();
    setWave({ charge: [], burst: [], receive: placed !== null ? [{ cell: placed, player: placement.player }] : [] });
    await sleep((rawSteps.length ? 240 : 420) / TEMPO); if (!alive()) return;

    for (const [stepIndex, step] of rawSteps.entries()) {
      const speed = stepIndex < 3 ? 1 : stepIndex < 8 ? 0.8 : 0.65; // long chains speed up a little
      let explosions = (step.explosions ?? []).map((e) => num(e, ['cell', 'cell_index', 'index'])).filter((v): v is number => v !== undefined && v >= 0 && v < frames.length);
      let transfers: Transfer[] = [];
      for (const raw of step.transfers ?? []) {
        const from = num(raw, ['from_cell', 'from', 'source_cell', 'source']);
        const to = num(raw, ['to_cell', 'to', 'target_cell', 'target', 'destination_cell']);
        if (from === undefined || to === undefined || !frames[from] || !frames[to]) continue;
        transfers.push({ from, to, player: num(raw, ['player', 'player_slot', 'owner']) ?? frames[from].owner ?? 0 });
      }
      // If the backend sent explosions without usable transfers, derive them: every exploding cell sends one orb to each neighbour.
      if (!transfers.length && explosions.length) transfers = explosions.flatMap((c) => neighbours(c, W, H).map((to) => ({ from: c, to, player: frames[c].owner ?? 0 })));
      if (!explosions.length) explosions = [...new Set(transfers.map((t) => t.from))];

      // 1. CHARGE: the cells about to burst shake and glow while their orbs are still inside.
      setWave({ charge: explosions, burst: [], receive: [] });
      await sleep((280 * speed) / TEMPO); if (!alive()) return;

      // 2. LAUNCH: orbs leave the source cells (the board is updated now, not at the end).
      const bursts = explosions.map((cell) => ({ cell, player: frames[cell].owner ?? 0 }));
      for (const cell of explosions) {
        const out = transfers.filter((t) => t.from === cell).length;
        const left = out ? frames[cell].orb_count - out : 0;
        frames[cell] = left > 0 ? { owner: frames[cell].owner, orb_count: left } : { owner: null, orb_count: 0 };
      }
      push(); setWave({ charge: [], burst: bursts, receive: [] });
      await nextPaint(); if (!alive()) return; // make sure the "emptied" frame is really painted before flying

      // 3. FLY + LAND: every orb travels cell-centre to cell-centre; it is added to the destination only when it arrives.
      const layer = flightLayerRef.current, grid = gridRef.current;
      const landed: { cell: number; player: number }[] = [];
      const perSource = new Map<number, number>();
      const duration = Math.max(170, (640 * speed) / TEMPO);
      await Promise.all(transfers.map((t) => {
        const n = perSource.get(t.from) ?? 0; perSource.set(t.from, n + 1);
        const handle = layer && grid ? launchOrb(layer, grid, t, colorForSlot(t.player), (n * 45 * speed) / TEMPO, duration) : null;
        return (handle ? handle.finished : sleep(duration)).then(async () => {
          if (!alive()) return;
          frames[t.to] = { owner: t.player, orb_count: frames[t.to].orb_count + 1 };
          landed.push({ cell: t.to, player: t.player });
          push(); setWave({ charge: [], burst: bursts, receive: [...landed] });
          await nextPaint(); handle?.remove(); // remove the flying orb only after the cell shows the landed orb
        });
      }));
      if (!alive()) return;

      // 4. SETTLE: hold the board so every landed orb is actually seen before the next wave.
      await sleep((260 * speed) / TEMPO); if (!alive()) return;
    }
    setDisplayCells(finalCells.map((cell) => ({ ...cell }))); setWave(null);
    await nextPaint();
  };

  const acceptMove = (payload: AcceptedMove, submittedCell?: number) => {
    if (typeof payload.sequence === 'number') {
      if (processedSequencesRef.current.has(payload.sequence) || payload.sequence <= lastSequenceRef.current) {
        console.debug('[reaction] move skipped as already seen', payload.sequence, 'last seen', lastSequenceRef.current);
        if (pendingMoveRef.current?.id) { pendingMoveRef.current = null; setBusy(false); }
        return;
      }
      processedSequencesRef.current.add(payload.sequence);
      lastSequenceRef.current = Math.max(lastSequenceRef.current, payload.sequence);
      if (processedSequencesRef.current.size > 64) processedSequencesRef.current.delete(processedSequencesRef.current.values().next().value as number);
    }
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = null;
    const finalState = normalizeState(payload.final_state);
    const before = gameRef.current;
    setAuthoritativeGame(finalState);
    const reaction = payload.reaction ?? {};
    const lastCell = payload.cell ?? reaction.placement?.cell ?? submittedCell ?? null;
    pendingMoveRef.current = null;
    setLastMove(lastCell);
    const steps = reaction.steps ?? [];
    console.debug('[reaction] move', payload.sequence, { hadPreviousBoard: Boolean(before), steps: steps.length, firstStep: steps[0] });
    if (before && (steps.length > 0 || animationPendingRef.current > 0)) {
      const placementPlayer = reaction.placement?.player ?? payload.player_slot ?? before.players[before.current_player_index]?.id ?? 0;
      enqueueAnimation((alive) => playReaction(alive, before, { cell: reaction.placement?.cell ?? lastCell, player: placementPlayer }, steps, finalState.board.cells));
    } else setBusy(false);
    const finished = payload.status?.toLowerCase() === 'finished' || finalState.status.kind === 'won';
    if (finished) setStage('finished');
    setNotice(finished ? 'The match is complete.' : `Move ${payload.sequence ?? ''} confirmed.`.trim());
  };

  const submitMoveFallback = (id: string, token: string, cell: number, clientMoveId: string) => {
    if (pendingMoveRef.current?.id !== clientMoveId) return;
    setNotice('Live channel is slow. Confirming move with the arena…');
    void request(`/api/games/${id}/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cell, client_move_id: clientMoveId }),
    }).then((payload) => acceptMove(payload as AcceptedMove, cell)).catch((error) => {
      if (pendingMoveRef.current?.id !== clientMoveId) return;
      void request(`/api/games/${id}/history`, { headers: { Authorization: `Bearer ${token}` } }).then((history) => {
        const moves = Array.isArray(history.moves) ? history.moves as AcceptedMove[] : [];
        const latest = [...moves].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))[0];
        if (latest?.client_move_id === clientMoveId) { acceptMove(latest, cell); return; }
        finishFallbackError(error, clientMoveId);
      }).catch(() => finishFallbackError(error, clientMoveId));
    });
  };
  const finishFallbackError = (error: unknown, clientMoveId: string) => {
    if (pendingMoveRef.current?.id !== clientMoveId) return;
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = null; pendingMoveRef.current = null; setBusy(false); setLastMove(null);
    setNotice(error instanceof Error ? error.message : 'Move could not be submitted.');
  };

  function closeSocket() {
    gameIdRef.current = null;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    reconnectTimerRef.current = null; pingTimerRef.current = null; moveTimerRef.current = null;
    const oldSocket = socketRef.current; socketRef.current = null; oldSocket?.close();
  }

  function connectGame(id: string, token: string) {
    if (socketRef.current?.readyState === WebSocket.OPEN && gameIdRef.current === id) { setStage(game?.status.kind === 'won' ? 'finished' : 'game'); return; }
    const changedGame = gameIdRef.current !== id;
    if (changedGame) {
      processedSequencesRef.current.clear(); lastSequenceRef.current = 0;
      cancelAnimations(); setAuthoritativeGame(null); setOwnSlot(null);
      setPlayerNames(['Player 1', 'Player 2']); setPlayerClocks([]); setPlayerConnected([]);
    }
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    const oldSocket = socketRef.current; socketRef.current = null; oldSocket?.close();
    gameIdRef.current = id; setGameId(id); localStorage.setItem('cr_game_id', id); localStorage.removeItem('cr_queue'); setStage('game'); setSocketStatus('connecting');
    const explicit = process.env.NEXT_PUBLIC_WS_URL;
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL, location.origin).origin.replace(/^http/, 'ws') : 'ws://20.240.198.63:8080';
    const base = explicit || apiOrigin;
    const ws = new WebSocket(`${base.replace(/\/$/, '')}/ws/games/${id}?token=${encodeURIComponent(token)}`);
    socketRef.current = ws;
    setNotice('Connecting to the live arena…');
    ws.onopen = () => {
      setSocketStatus('live'); setNotice('Connected. Syncing match state…');
      pingTimerRef.current = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', payload: {} })); }, 20000);
    };
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageType = String(message.type ?? '').toLowerCase();
        const payload = message.payload ?? {};
        if (messageType === 'connection_ack') {
          setOwnSlot(payload.player_slot ?? null);
          if (typeof payload.player_slot === 'number') setPlayerConnected((current) => current.map((connected, slot) => slot === payload.player_slot ? true : connected));
        }
        if (messageType === 'state_snapshot' && payload.state) {
          const people = [...(payload.players ?? [])].sort((a: { player_slot: number }, b: { player_slot: number }) => a.player_slot - b.player_slot);
          setPlayerNames([people.find((p: { player_slot: number }) => p.player_slot === 0)?.username ?? 'Waiting for player', people.find((p: { player_slot: number }) => p.player_slot === 1)?.username ?? 'Waiting for player']);
          setPlayerClocks([people.find((p: { player_slot: number }) => p.player_slot === 0)?.time_remaining_ms ?? 0, people.find((p: { player_slot: number }) => p.player_slot === 1)?.time_remaining_ms ?? 0]);
          setPlayerConnected([people.find((p: { player_slot: number }) => p.player_slot === 0)?.connected ?? false, people.find((p: { player_slot: number }) => p.player_slot === 1)?.connected ?? false]);
          const mySlot = people.find((p: { user_id: string }) => p.user_id === sessionRef.current?.user.id)?.player_slot ?? null;
          setOwnSlot(mySlot);
          const next = normalizeState(payload.state); setAuthoritativeGame(next);
          setStage(payload.status === 'FINISHED' || next.status.kind === 'won' ? 'finished' : 'game');
          lastSequenceRef.current = Math.max(lastSequenceRef.current, Number(payload.turn_number ?? next.turn_number));
          if (!animationRef.current) setDisplayCells(null);
          if (!animationRef.current) setNotice(payload.current_player_slot === mySlot ? 'Your turn — choose an empty cell or one of your own.' : 'Opponent’s turn. Watch the board.');
        }
        if (messageType === 'move_accepted' && payload.final_state) {
          acceptMove(payload as AcceptedMove);
        }
        if (messageType === 'game_finished') { if (payload.state) setAuthoritativeGame(normalizeState(payload.state)); setBusy(false); setStage('finished'); setNotice('The match is complete.'); }
        if (messageType === 'move_rejected') { if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current); moveTimerRef.current = null; pendingMoveRef.current = null; setBusy(false); setLastMove(null); setNotice(typeof payload.message === 'string' ? payload.message : 'Move rejected. Try another cell.'); }
        if (messageType === 'error') {
          const pending = pendingMoveRef.current;
          if (pending) submitMoveFallback(id, token, pending.cell, pending.id);
          else setNotice(typeof payload.message === 'string' && payload.message.length < 180 ? payload.message : 'The game server could not process that update.');
        }
        if (!['connection_ack', 'state_snapshot', 'move_accepted', 'game_finished', 'move_rejected', 'error', 'pong'].includes(messageType)) setNotice(`Server update: ${message.type ?? 'unknown'}`);
      } catch (error) { setNotice(error instanceof Error ? `Game update error: ${error.message}` : 'The server sent an unreadable game update.'); }
    };
    ws.onerror = () => { setSocketStatus('reconnecting'); setNotice('Connection interrupted. Reconnecting…'); };
    ws.onclose = () => {
      if (socketRef.current !== ws || gameIdRef.current !== id) return;
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null; setBusy(false); setSocketStatus('reconnecting'); setNotice('Connection interrupted. Reconnecting…');
      reconnectTimerRef.current = window.setTimeout(() => {
        const currentSession = sessionRef.current;
        if (currentSession && gameIdRef.current === id) connectGame(id, currentSession.token);
      }, 1800);
    };
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { const health = await request('/api/health/ready'); setServiceStatus(health.status === 'ok' ? 'ready' : 'degraded'); }
      catch { setServiceStatus('offline'); }
      const token = localStorage.getItem('cr_access_token');
      const savedUser = localStorage.getItem('cr_user');
      if (!token || !savedUser) return;
      try {
        const stored = JSON.parse(savedUser) as SessionUser;
        const profile = await request('/api/users/me', { headers: { Authorization: `Bearer ${token}` } }) as { id: string; username: string };
        if (cancelled) return;
        const restored = { token, user: { ...stored, id: profile.id, username: profile.username } };
        sessionRef.current = restored; setSession(restored);
        const restoredGameId = localStorage.getItem('cr_game_id');
        if (restoredGameId) connectGame(restoredGameId, token);
        else if (localStorage.getItem('cr_queue') === 'yes') setStage('queue');
        else setStage('lobby');
      } catch {
        localStorage.removeItem('cr_access_token'); localStorage.removeItem('cr_user'); localStorage.removeItem('cr_game_id');
      }
    })();
    return () => { cancelled = true; };
    // The initial restore should run once; API origin is a build-time setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSession = (data: AuthResponse) => {
    const next = { token: data.access_token, user: data.user };
    localStorage.setItem('cr_access_token', next.token); localStorage.setItem('cr_user', JSON.stringify(next.user));
    sessionRef.current = next; setSession(next); setStage('lobby'); setAuthMode(null); setAuthError(''); setPassword(''); setErrorMessage('');
  };
  const authSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setAuthError(''); setAuthBusy(true);
    try { saveSession(await authRequest(authMode === 'register' ? 'register' : 'login', { username, password })); }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Could not authenticate.'); }
    finally { setAuthBusy(false); }
  };
  const guestLogin = async () => {
    setAuthError(''); setAuthBusy(true);
    try { saveSession(await authRequest('guest', username.trim() ? { username: username.trim() } : undefined)); }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Could not create guest session.'); }
    finally { setAuthBusy(false); }
  };
  const joinQueue = async () => {
    const activeSession = sessionRef.current;
    if (!activeSession || queueBusy) return;
    setQueueBusy(true); setStage('queue'); setErrorMessage(''); setNotice('Looking for an opponent…');
    try {
      const data = await request('/api/matchmaking/join', { method: 'POST', headers: { Authorization: `Bearer ${activeSession.token}` } });
      if (data.status === 'matched' && typeof data.game_id === 'string') connectGame(data.game_id, activeSession.token);
      else { localStorage.setItem('cr_queue', 'yes'); setNotice('You’re in the queue. We’ll connect you as soon as an opponent is ready.'); }
    } catch (error) { setStage('lobby'); setErrorMessage(error instanceof Error ? error.message : 'Could not join matchmaking.'); }
    finally { setQueueBusy(false); }
  };
  const leaveQueue = async () => {
    const activeSession = sessionRef.current;
    try { if (activeSession) await request('/api/matchmaking/leave', { method: 'POST', headers: { Authorization: `Bearer ${activeSession.token}` } }); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Could not leave the queue.'); }
    localStorage.removeItem('cr_queue'); setStage('lobby'); setNotice('Search cancelled.');
  };
  const returnToLobby = () => {
    closeSocket(); processedSequencesRef.current.clear(); lastSequenceRef.current = 0; pendingMoveRef.current = null; localStorage.removeItem('cr_game_id'); localStorage.removeItem('cr_queue'); setGameId(null); cancelAnimations(); setBusy(false); setAuthoritativeGame(null); setOwnSlot(null); setPlayerNames(['Player 1', 'Player 2']); setStage('lobby'); setNotice('Ready when you are.');
  };
  const signOut = async () => {
    if (stage === 'queue') await leaveQueue();
    closeSocket(); localStorage.removeItem('cr_access_token'); localStorage.removeItem('cr_user'); localStorage.removeItem('cr_game_id'); localStorage.removeItem('cr_queue');
    sessionRef.current = null; setSession(null); setGameId(null); setAuthoritativeGame(null); setStage('welcome'); setAuthMode(null); setOwnSlot(null);
  };

  useEffect(() => {
    const activeSession = session;
    if (stage !== 'queue' || !activeSession) return;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await request('/api/matchmaking/status', { headers: { Authorization: `Bearer ${activeSession.token}` } });
        if (!stopped && data.status === 'matched' && typeof data.game_id === 'string') { localStorage.removeItem('cr_queue'); connectGame(data.game_id, activeSession.token); }
      } catch (error) { if (!stopped) setNotice(error instanceof Error ? error.message : 'Checking matchmaking…'); }
    };
    const timer = window.setInterval(() => void poll(), 1800); void poll();
    return () => { stopped = true; window.clearInterval(timer); };
    // Connect and request functions use stable state setters and current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, session]);
  useEffect(() => {
    const activeSession = session;
    if (stage !== 'game' || !gameId || !activeSession) return;
    let stopped = false;
    const syncHistory = async () => {
      try {
        const history = await request(`/api/games/${gameId}/history`, { headers: { Authorization: `Bearer ${activeSession.token}` } });
        const moves = (history.moves ?? []) as (AcceptedMove & { sequence: number })[];
        const latest = moves.reduce<(typeof moves)[number] | null>((best, move) => !best || move.sequence > best.sequence ? move : best, null);
        if (!stopped && latest && latest.sequence > lastSequenceRef.current) acceptMove(latest);
      } catch { /* WebSocket updates remain available when history polling is unavailable. */ }
    };
    const timer = window.setInterval(() => void syncHistory(), 3200);
    return () => { stopped = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, gameId, session]);
  useEffect(() => () => closeSocket(), []);
  useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth);
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const winner = game?.status.kind === 'won' ? (game.status.winner ?? null) : null;
  const current = game?.players[game.current_player_index]?.id ?? 0;
  const isYourTurn = ownSlot !== null && current === ownSlot;
  const colorForSlot = (slot: number) => ownSlot === null
    ? COLORS[slot % 2]
    : slot === ownSlot ? COLORS[0] : COLORS[1];
  const activeBoardColor = ownSlot === null ? COLORS[current % 2] : isYourTurn ? COLORS[0] : COLORS[1];
  const displayedOwnSlot = ownSlot ?? 0;
  const ownPlayerName = playerNames[displayedOwnSlot] ?? `Player ${displayedOwnSlot + 1}`;
  const opponentPlayerName = playerNames[1 - displayedOwnSlot] ?? `Player ${2 - displayedOwnSlot}`;
  const playerRole = (slot: number) => ownSlot === null
    ? slot === 0 ? 'GREEN' : 'RED'
    : slot === ownSlot ? 'YOU · GREEN' : 'OPPONENT · RED';
  useEffect(() => {
    if (stage !== 'game' || !game || winner !== null) return;
    const playerOnTurn = game.current_player_index;
    const timer = window.setInterval(() => setPlayerClocks((clocks) => clocks.map((clock, slot) => slot === playerOnTurn ? Math.max(0, clock - 1000) : clock)), 1000);
    return () => window.clearInterval(timer);
  }, [stage, game?.current_player_index, winner]);
  const play = (index: number) => {
    const activeSession = sessionRef.current;
    if (!game || !gameId || !activeSession || !isYourTurn || busy || animating || winner !== null || (game.board.cells[index]?.owner !== null && game.board.cells[index]?.owner !== ownSlot)) return;
    setBusy(true); setLastMove(index); setNotice('Sending move…');
    const moveId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${index}`;
    pendingMoveRef.current = { cell: index, id: moveId };
    const movePayload = { cell: index, client_move_id: moveId };
    const canSendLive = socketRef.current?.readyState === WebSocket.OPEN;
    if (canSendLive) socketRef.current?.send(JSON.stringify({ type: 'move', payload: movePayload }));
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(() => {
      moveTimerRef.current = null;
      if (pendingMoveRef.current?.id === moveId) submitMoveFallback(gameId, activeSession.token, index, moveId);
    }, canSendLive ? 2200 : 0);
  };

  // Fit the board to the arena while keeping every cell square.
  const cellSize = useMemo(
    () =>
      Math.min(
        70,
        Math.floor(
          (Math.min(520, Math.max(220, viewportWidth - (viewportWidth < 700 ? 68 : 446))) - 3 * (Math.max(game?.board.width ?? size.width, game?.board.height ?? size.height) - 1)) /
            Math.max(game?.board.width ?? size.width, game?.board.height ?? size.height),
        ),
      ),
    [game, size, viewportWidth],
  );
  const boardWidth = game?.board.width ?? size.width;
  const boardHeight = game?.board.height ?? size.height;
  const cellGap = 3;
  const stageWidth = boardWidth * cellSize + (boardWidth - 1) * cellGap;
  const stageHeight = boardHeight * cellSize + (boardHeight - 1) * cellGap;
  const formatClock = (milliseconds: number) => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  if (!session) return (
    <main className="welcome-shell">
      <div className="welcome-noise" />
      <header className="welcome-topbar">
        <a className="brand" href="#welcome"><span className="brand-mark">✳</span> REACTOR <span className="brand-sub">CHAIN REACTION</span></a>
        <span className={`service-pill service-${serviceStatus}`}><i /> {serviceStatus === 'checking' ? 'CONNECTING' : serviceStatus.toUpperCase()}</span>
      </header>
      <section className="welcome-content" id="welcome">
        <div className="welcome-copy">
          <span className="eyebrow"><i /> REAL-TIME STRATEGY · 1V1</span>
          <h1>Every move<br />starts a <em>reaction.</em></h1>
          <p>Claim the board, build your chain, and turn one spark into the whole arena.</p>
          <div className="welcome-orbit" aria-hidden="true"><div className="orbit-ring orbit-one" /><div className="orbit-ring orbit-two" /><span className="orbit-core" /><span className="orbit-dot dot-a" /><span className="orbit-dot dot-b" /><span className="orbit-dot dot-c" /><span className="orbit-dot dot-d" /></div>
          <div className="welcome-feature"><span>01</span><div><b>Find your opponent</b><small>Fast online matchmaking</small></div><span>02</span><div><b>Own every turn</b><small>Live board updates</small></div></div>
        </div>
        <section className="welcome-card">
          <span className="eyebrow-mini">THE ARENA IS READY</span>
          {authMode ? <>
            <h2>{authMode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
            <p>{authMode === 'register' ? 'Make a player account to keep your name across matches.' : 'Sign in to pick up where your next match begins.'}</p>
            <form onSubmit={(event) => void authSubmit(event)}>
              <label>Username<input autoFocus required minLength={3} maxLength={64} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
              <label>Password<input required minLength={6} maxLength={128} type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {authError && <div className="auth-error" role="alert">{authError}</div>}
              <button className="primary-action" disabled={authBusy}>{authBusy ? 'Connecting…' : authMode === 'register' ? 'Create account' : 'Sign in'} <span>↗</span></button>
            </form>
            <button className="guest-button" disabled={authBusy} onClick={() => void guestLogin()}>Continue as guest <span>→</span></button>
            <div className="auth-switch">{authMode === 'register' ? 'Already have an account?' : 'New to Reactor?'} <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthError(''); }}>{authMode === 'register' ? 'Sign in' : 'Create account'}</button></div>
          </> : <>
            <h2>Enter the arena</h2>
            <p>Choose how you want to play. You can jump in as a guest in seconds.</p>
            {errorMessage && <div className="auth-error" role="alert">{errorMessage}</div>}
            <button className="primary-action" onClick={() => setAuthMode('login')}>Sign in <span>↗</span></button>
            <button className="secondary-action" onClick={() => setAuthMode('register')}>Create account <span>＋</span></button>
            <div className="auth-divider"><span>OR QUICK PLAY</span></div>
            <label className="guest-name">GUEST NAME <small>OPTIONAL</small><input maxLength={64} placeholder="Leave blank for a random name" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            {authError && <div className="auth-error" role="alert">{authError}</div>}
            <button className="guest-cta" disabled={authBusy} onClick={() => void guestLogin()}>{authBusy ? 'Creating guest…' : 'Continue as guest'} <span>→</span></button>
          </>}
          <div className="card-foot"><span><i /> {serviceStatus === 'ready' ? 'MATCHMAKING ONLINE' : `SERVICE ${serviceStatus.toUpperCase()}`}</span><span>FREE TO PLAY</span></div>
        </section>
      </section>
      <footer className="welcome-footer"><span>REACTOR <b>／</b> CHAIN REACTION</span><span>THINK FAST. CHAIN FASTER.</span></footer>
    </main>
  );

  if (stage === 'lobby' || stage === 'queue') return (
    <main className="lobby-shell">
      <header className="lobby-topbar">
        <a className="brand" href="#lobby"><span className="brand-mark">✳</span> REACTOR <span className="brand-sub">ONLINE ARENA</span></a>
        <div className="lobby-user"><span className="user-avatar">{session.user.username.slice(0, 1).toUpperCase()}</span><span>{session.user.username}{session.user.is_guest && <small>GUEST</small>}</span><button onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <section className={`lobby-main ${stage === 'queue' ? 'is-queueing' : ''}`} id="lobby">
        <div className="lobby-backdrop-orb" />
        <div className="lobby-copy">
          <span className="eyebrow"><i /> {stage === 'queue' ? 'MATCHMAKING · LIVE' : 'PLAYER LOBBY'}</span>
          <h1>{stage === 'queue' ? <>Opponent<br />incoming<span>.</span></> : <>Ready to<br />make a <em>chain?</em></>}</h1>
          <p>{stage === 'queue' ? 'Searching for a rival. This screen will move into the arena as soon as a match is found.' : 'Find a player and take your place in the arena. The board is waiting.'}</p>
          {errorMessage && <div className="lobby-error" role="alert">{errorMessage}</div>}
          {stage === 'queue' ? <div className="queue-actions"><button className="primary-action" disabled={queueBusy} onClick={() => void leaveQueue()}>{queueBusy ? 'Joining queue…' : 'Cancel search'} <span>×</span></button><div className="queue-state"><span className="queue-spinner" />{notice}</div></div> : <button className="primary-action lobby-play" onClick={() => void joinQueue()} disabled={queueBusy}>{queueBusy ? 'Joining…' : 'Find a match'} <span>↗</span></button>}
          <div className="lobby-meta"><span><i /> {serviceStatus === 'ready' ? 'SERVERS OPERATIONAL' : 'SERVER ' + serviceStatus.toUpperCase()}</span><span>1V1 · LIVE</span></div>
        </div>
        <div className="lobby-art" aria-hidden="true"><div className="art-grid">{Array.from({ length: 49 }, (_, i) => <i className={`${[9, 17, 24, 25, 31, 39].includes(i) ? 'art-lit' : ''} ${[24, 25].includes(i) ? 'art-hot' : ''}`} key={i} />)}</div><div className="art-glow" /><div className="art-label">CHAIN REACTION <span>·</span> ARENA 01</div></div>
      </section>
      <footer className="lobby-footer"><span>REACTOR <b>／</b> ONLINE MATCHMAKING</span><span>YOUR NEXT MOVE STARTS HERE</span></footer>
    </main>
  );

  // The page is split into match controls and the playable board.
  return (
    <main className="shell" id="play">
      <header className="topbar">
        <a className="brand" href="#play">
          <span className="brand-mark">✳</span> REACTOR
          <span className="brand-sub">ONLINE ARENA</span>
        </a>
        <div className={`connection service-${socketStatus}`}>
          <i /> {socketStatus.toUpperCase()} <span>●</span> {session.user.username}
        </div>
        <button
          className="new-game top-new"
          onClick={() => stage === 'finished' ? void joinQueue() : returnToLobby()}
        >
          ↻ <span>{stage === 'finished' ? 'Play again' : 'Lobby'}</span>
        </button>
      </header>
      <section className="hero">
        <div className="eyebrow">
          <span /> TWO PLAYER STRATEGY
        </div>
        <h1>
          Chain Reaction<span>.</span>
        </h1>
        <p>{stage === 'finished' ? 'The chain has settled. Ready for another round?' : `Match ${gameId?.slice(0, 8) ?? '—'} · Turn ${game?.turn_number ?? 0}`}</p>
      </section>
      <section className="game-layout">
        <section className="board-panel">
          <div className="board-heading">
            <div>
              <span className="eyebrow-mini">THE ARENA</span>
              <h2>Game board</h2>
            </div>
            <div className="legend">
              <span>
                <i className="green-bg" /> {ownPlayerName}
              </span>
              <span>
                <i className="red-bg" /> {opponentPlayerName}
              </span>
            </div>
          </div>
          <div className="arena">
            {!game && <div className="empty-arena"><span className="empty-mark">✳</span><h3>Preparing the arena</h3><p>{notice}</p></div>}
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
                } as React.CSSProperties
              }
            >
              {game && (
                <>
                  <div className="grid-wrap" ref={gridRef}>
                    {(displayCells ?? game.board.cells).map((cell, i) => {
                      const row = Math.floor(i / game.board.width),
                        col = i % game.board.width;
                      // Corners need 2 orbs to burst, edges 3, and interiors 4.
                      const critical =
                        (row === 0 || row === game.board.height - 1 ? 1 : 2) +
                        (col === 0 || col === game.board.width - 1 ? 1 : 2);
                      const charging = wave?.charge.includes(i) ?? false;
                      const bursting = wave?.burst.find((b) => b.cell === i);
                      const receiving = wave?.receive.find((r) => r.cell === i);
                      return (
                        <button
                          key={i}
                          className={`cell ${cell.owner !== null ? `owned owner-${cell.owner}` : ''} ${charging ? 'charge' : ''} ${bursting ? 'explode' : ''} ${receiving ? 'receive' : ''} ${lastMove === i ? 'last-move' : ''}`}
                          onClick={() => void play(i)}
                          disabled={busy || animating || winner !== null || !isYourTurn || (cell.owner !== null && cell.owner !== ownSlot) || socketStatus !== 'live'}
                          aria-label={`Row ${row + 1}, column ${col + 1}${cell.owner !== null ? `, player ${cell.owner + 1}, ${cell.orb_count} orbs` : ', empty'}`}
                          style={
                            {
                              '--owner':
                                cell.owner !== null
                                  ? colorForSlot(cell.owner)
                                  : bursting ? colorForSlot(bursting.player) : 'transparent',
                            } as React.CSSProperties
                          }
                        >
                          <span className="critical">{critical}</span>
                          {/* Faster, larger pulses signal cells close to their critical mass. */}
                          {cell.orb_count > 0 && (
                            <span
                              className={`orbs count-${cell.orb_count}`}
                              style={
                                {
                                  '--count': Math.min(cell.orb_count, 4),
                                  '--vibration-duration':
                                    critical - cell.orb_count <= 1
                                      ? '180ms'
                                      : critical - cell.orb_count === 2
                                        ? '300ms'
                                        : '650ms',
                                  '--spin-duration':
                                    critical - cell.orb_count <= 1
                                      ? '1.7s'
                                      : critical - cell.orb_count === 2
                                        ? '2.9s'
                                        : '4.4s',
                                  '--vibration-scale':
                                    critical - cell.orb_count <= 1
                                      ? '1.04'
                                      : critical - cell.orb_count === 2
                                        ? '1.02'
                                        : '1.008',
                                } as React.CSSProperties
                              }
                            >
                              {/* This wrapper stays centered while each sphere's surface spins in place. */}
                              <span className="orb-cluster">
                                <span className="orb-ring">
                                  {Array.from(
                                    { length: Math.min(cell.orb_count, 4) },
                                    (_, j) => (
                                      <span
                                        className="atom orb-spin-preview"
                                        key={j}
                                        style={
                                          { '--orb-i': j } as React.CSSProperties
                                        }
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
            <span className="engine-note">{socketStatus === 'live' ? 'LIVE · WEBSOCKET SYNC' : socketStatus.toUpperCase()}</span>
          </div>
        </section>
        <aside className="side-panel">
          <div className="panel-head"><span>LIVE MATCH</span><span className={`live-tag ${socketStatus !== 'live' ? 'is-muted' : ''}`}><i /> {socketStatus.toUpperCase()}</span></div>
          <div className="turn-label">
            {stage === 'finished' ? 'MATCH COMPLETE' : isYourTurn ? 'YOUR TURN' : 'OPPONENT’S TURN'}
          </div>
          <div
            className="active-player"
            style={{ '--accent': colorForSlot(current) } as React.CSSProperties}
          >
            <span className="player-orb" />
            <div>
              <strong>
                {winner !== null ? playerNames[winner] ?? `Player ${winner + 1}` : playerNames[current] ?? `Player ${current + 1}`}
              </strong>
              <small>{winner !== null ? (winner === ownSlot ? 'VICTORY' : 'WINNER') : isYourTurn ? 'YOU · TO PLAY' : 'THINKING'}</small>
            </div>
            <span className="turn-arrow">↗</span>
          </div>
          <div className="players">
            <div
              className={`player-card ${current === 0 && winner === null ? 'selected' : ''} ${playerConnected[0] ? 'connected' : 'disconnected'}`}
              style={{ '--player-color': colorForSlot(0) } as React.CSSProperties}
            >
              <span className="dot" title={playerConnected[0] ? 'Connected' : 'Reconnecting'} />
              <div>
                <b>{playerNames[0]}</b>
                <small>{playerRole(0)} {playerClocks[0] > 0 ? `· ${formatClock(playerClocks[0])}` : ''}</small>
              </div>
              <span className="player-id">P1</span>
            </div>
            <div
              className={`player-card ${current === 1 && winner === null ? 'selected' : ''} ${playerConnected[1] ? 'connected' : 'disconnected'}`}
              style={{ '--player-color': colorForSlot(1) } as React.CSSProperties}
            >
              <span className="dot" title={playerConnected[1] ? 'Connected' : 'Reconnecting'} />
              <div>
                <b>{playerNames[1]}</b>
                <small>{playerRole(1)} {playerClocks[1] > 0 ? `· ${formatClock(playerClocks[1])}` : ''}</small>
              </div>
              <span className="player-id">P2</span>
            </div>
          </div>
          {stage === 'finished' && <div className="match-result"><span className="result-icon">✳</span><span className="eyebrow-mini">FINAL RESULT</span><strong>{winner === null ? 'Match complete' : winner === ownSlot ? 'Victory' : `${playerNames[winner] ?? 'Opponent'} wins`}</strong><small>{winner === ownSlot ? 'You conquered the chain.' : winner === null ? 'Thanks for playing.' : 'Better luck next round.'}</small><button className="queue-button" onClick={() => void joinQueue()}>Find next match <span>↗</span></button><button className="result-lobby" onClick={returnToLobby}>Return to lobby</button></div>}
          <div className="divider" />
          <div className="stats">
            <div>
              <span>TURN</span>
              <b>{String(game?.turn_number ?? 0).padStart(2, '0')}</b>
            </div>
            <div>
              <span>BOARD</span>
              <b>
                {game
                  ? `${game.board.width} × ${game.board.height}`
                  : `${size.width} × ${size.height}`}
              </b>
            </div>
            <div>
              <span>REACTION</span>
              <b>{wave ? 'ACTIVE' : 'READY'}</b>
            </div>
          </div>
          <div className="divider" />
          <button
            className="new-game wide"
            onClick={() => stage === 'finished' ? void joinQueue() : returnToLobby()}
          >
            {stage === 'finished' ? '↻  Play again' : '←  Return to lobby'}
          </button>
          <div className="rules">
            <span className="rules-icon">⌁</span>
            <p>
              Fill a cell to its <b>critical mass</b> and it bursts into its
              neighbors.
            </p>
          </div>
        </aside>
      </section>
      <footer>
        <span>
          CHAIN REACTION <b>／</b> {gameId ? `MATCH ${gameId.slice(0, 8).toUpperCase()}` : 'LIVE MATCH'}
        </span>
        <span>API STATUS · {serviceStatus.toUpperCase()}</span>
      </footer>
    </main>
  );
}