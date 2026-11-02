'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppStage, SessionUser } from '@/features/auth/types';
import { ApiError, request } from '@/lib/api/client';
import { DEFAULT_BOARD_SIZE, normalizeGameState } from './board-model';
import {
  DEFAULT_ORB_SKIN,
  DEFAULT_ORB_SKIN_ID,
  normalizeOrbSkinId,
  type OrbSkinAppearance,
  type OrbSkinCatalogItem,
} from './orb-skins';
import { normalizeNationality } from '@/features/nationality/countries';
import { REACTION_TIMING } from './reaction-animation';
import type { AcceptedMove, GameState } from './types';
import { useBoardViewport } from './useBoardViewport';
import { useConnectionQuality } from './useConnectionQuality';
import { useReactionPlayback } from './useReactionPlayback';
import { LOBBY_PLAYER_CHROME_HEIGHT, MATCH_PLAYER_CHROME_HEIGHT } from './match-layout';

type PlayerSession = { token: string; user: SessionUser };

type UseGameRuntimeOptions = {
  session: PlayerSession | null;
  stage: AppStage;
  setStage: Dispatch<SetStateAction<AppStage>>;
  resolveOrbSkin: (skinId: unknown) => OrbSkinCatalogItem;
};

const PLAYER_COLORS = ['#39e58c', '#ff5964'];

/** Owns the authenticated game connection, board state, and reaction playback. */
export function useGameRuntime({ session, stage, setStage, resolveOrbSkin }: UseGameRuntimeOptions) {
  // React state drives visible UI; refs below keep async socket callbacks current.
  const [socketStatus, setSocketStatus] = useState('offline');
  const [ownSlot, setOwnSlot] = useState<number | null>(null);
  const [currentPlayerSlot, setCurrentPlayerSlot] = useState<number | null>(null);
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2']);
  const [playerNationalities, setPlayerNationalities] = useState(['global', 'global']);
  const [playerSkinIds, setPlayerSkinIds] = useState([DEFAULT_ORB_SKIN_ID, DEFAULT_ORB_SKIN_ID]);
  const [playerClocks, setPlayerClocks] = useState<number[]>([]);
  const [playerConnected, setPlayerConnected] = useState<boolean[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Waiting for a match');
  const [lastMove, setLastMove] = useState<number | null>(null);
  const boardViewport = useBoardViewport(
    game?.board.width ?? DEFAULT_BOARD_SIZE.width,
    game?.board.height ?? DEFAULT_BOARD_SIZE.height,
    stage === 'game' || stage === 'finished'
      ? MATCH_PLAYER_CHROME_HEIGHT
      : LOBBY_PLAYER_CHROME_HEIGHT,
  );
  const connectionQuality = useConnectionQuality();

  // Connection refs coordinate reconnects, duplicate messages, and pending move requests.
  const socketRef = useRef<WebSocket | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const sessionRef = useRef<PlayerSession | null>(session);
  const gameRef = useRef<GameState | null>(null);
  const ownSlotRef = useRef<number | null>(null);
  const playerSkinIdsRef = useRef([DEFAULT_ORB_SKIN_ID, DEFAULT_ORB_SKIN_ID]);
  const resolveOrbSkinRef = useRef(resolveOrbSkin);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionAttemptRef = useRef(0);
  const connectionPendingGameRef = useRef<string | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const processedSequencesRef = useRef(new Set<number>());
  const lastSequenceRef = useRef(0);
  const pendingMoveRef = useRef<{ cell: number; id: string } | null>(null);

  sessionRef.current = session;
  resolveOrbSkinRef.current = resolveOrbSkin;

  const setAuthoritativeGame = (next: GameState | null) => {
    gameRef.current = next;
    setGame(next);
  };

  // One skin and side identity is shared by stationary orbs and reaction-flight orbs.
  const flightColor = (slot: number) => {
    const ownSlotNow = ownSlotRef.current;
    if (ownSlotNow === null) return PLAYER_COLORS[slot % 2];
    return slot === ownSlotNow ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
  };
  const setAuthoritativePlayerSkins = (skinIds: string[]) => {
    const next = [skinIds[0] ?? DEFAULT_ORB_SKIN_ID, skinIds[1] ?? DEFAULT_ORB_SKIN_ID];
    playerSkinIdsRef.current = next;
    setPlayerSkinIds(next);
  };
  const orbAppearanceForSlot = (slot: number): OrbSkinAppearance => {
    const ownSlotNow = ownSlotRef.current;
    const isOpponent = ownSlotNow === null ? slot % 2 === 1 : slot !== ownSlotNow;
    const skin = resolveOrbSkinRef.current(
      playerSkinIdsRef.current[slot] ?? DEFAULT_ORB_SKIN_ID,
    );
    return {
      skinId: skin.id,
      assetKey: skin.asset_key,
      assets: skin.assets,
      side: isOpponent ? 'opponent' : 'self',
      color: flightColor(slot),
    };
  };
  const playback = useReactionPlayback(
    orbAppearanceForSlot,
    () => setBusy(false),
    DEFAULT_ORB_SKIN.assets?.collision_sound?.url,
  );

  // Accept server moves once, update authoritative state, then animate from the prior board.
  const acceptMove = (payload: AcceptedMove, submittedCell?: number) => {
    if (typeof payload.sequence === 'number') {
      if (
        processedSequencesRef.current.has(payload.sequence) ||
        payload.sequence <= lastSequenceRef.current
      ) {
        console.debug(
          '[reaction] move skipped as already seen',
          payload.sequence,
          'last seen',
          lastSequenceRef.current,
        );
        if (pendingMoveRef.current?.id) {
          pendingMoveRef.current = null;
          setBusy(false);
        }
        return;
      }

      processedSequencesRef.current.add(payload.sequence);
      lastSequenceRef.current = Math.max(lastSequenceRef.current, payload.sequence);
      if (processedSequencesRef.current.size > 64) {
        processedSequencesRef.current.delete(
          processedSequencesRef.current.values().next().value as number,
        );
      }
    }

    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = null;

    const finalState = normalizeGameState(payload.final_state);
    const nextTurnSlot = Number.isInteger(payload.current_player_slot)
      ? Number(payload.current_player_slot)
      : finalState.players[finalState.current_player_index]?.id ?? finalState.current_player_index;
    if (nextTurnSlot >= 0 && nextTurnSlot <= 1) setCurrentPlayerSlot(nextTurnSlot);
    if (payload.clocks) {
      setPlayerClocks([
        Number(payload.clocks['0'] ?? 0),
        Number(payload.clocks['1'] ?? 0),
      ]);
    }
    const previousState = gameRef.current;
    setAuthoritativeGame(finalState);

    const reaction = payload.reaction ?? {};
    const lastCell = payload.cell ?? reaction.placement?.cell ?? submittedCell ?? null;
    pendingMoveRef.current = null;
    setLastMove(lastCell);

    const steps = reaction.steps ?? [];
    console.debug('[reaction] move', payload.sequence, {
      hadPreviousBoard: Boolean(previousState),
      steps: steps.length,
      firstStep: steps[0],
      timing: REACTION_TIMING,
    });

    if (previousState && (steps.length > 0 || playback.animationPendingRef.current > 0)) {
      const placementPlayer =
        payload.player_slot ??
        reaction.placement?.player ??
        previousState.players[previousState.current_player_index]?.id ??
        0;
      playback.queueReaction(
        previousState,
        { cell: reaction.placement?.cell ?? lastCell, player: placementPlayer },
        steps,
        finalState.board.cells,
      );
    } else {
      setBusy(false);
    }

    const finished = payload.status?.toLowerCase() === 'finished' || finalState.status.kind === 'won';
    if (finished) setStage('finished');
    setNotice(finished ? 'The match is complete.' : `Move ${payload.sequence ?? ''} confirmed.`.trim());
  };

  // REST fallback recovers a move if the WebSocket acknowledgment is late or missing.
  const finishFallbackError = (error: unknown, clientMoveId: string) => {
    if (pendingMoveRef.current?.id !== clientMoveId) return;
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = null;
    pendingMoveRef.current = null;
    setBusy(false);
    setLastMove(null);
    setNotice(error instanceof Error ? error.message : 'Move could not be submitted.');
  };

  const submitMoveFallback = (
    id: string,
    token: string,
    cell: number,
    clientMoveId: string,
  ) => {
    if (pendingMoveRef.current?.id !== clientMoveId) return;
    setNotice('Live channel is slow. Confirming move with the arena…');

    void request(`/api/games/${id}/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cell, client_move_id: clientMoveId }),
    })
      .then((payload) => acceptMove(payload as AcceptedMove, cell))
      .catch((error) => {
        if (pendingMoveRef.current?.id !== clientMoveId) return;

        void request(`/api/games/${id}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((history) => {
            const moves = Array.isArray(history.moves)
              ? (history.moves as AcceptedMove[])
              : [];
            const latest = [...moves].sort(
              (left, right) => (right.sequence ?? 0) - (left.sequence ?? 0),
            )[0];

            if (latest?.client_move_id === clientMoveId) {
              acceptMove(latest, cell);
              return;
            }
            finishFallbackError(error, clientMoveId);
          })
          .catch(() => finishFallbackError(error, clientMoveId));
      });
  };

  // Socket lifecycle and ticket exchange; game protocol handling stays in its message callback.
  const closeSocket = () => {
    connectionAttemptRef.current += 1;
    connectionPendingGameRef.current = null;
    gameIdRef.current = null;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    reconnectTimerRef.current = null;
    reconnectAttemptsRef.current = 0;
    pingTimerRef.current = null;
    moveTimerRef.current = null;
    connectionQuality.reset('offline');

    const oldSocket = socketRef.current;
    socketRef.current = null;
    oldSocket?.close();
  };

  const connectGame = (id: string, token: string, restoredUser?: SessionUser) => {
    if (restoredUser) sessionRef.current = { token, user: restoredUser };
    const activeSession = sessionRef.current;

    if (!activeSession || activeSession.token !== token) {
      setSocketStatus('offline');
      setNotice('Sign in again to connect to this match.');
      return;
    }

    if (
      gameIdRef.current === id &&
      (socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING ||
        connectionPendingGameRef.current === id ||
        reconnectTimerRef.current !== null)
    ) {
      setStage(gameRef.current?.status.kind === 'won' ? 'finished' : 'game');
      return;
    }

    const changedGame = gameIdRef.current !== id;
    if (changedGame) {
      processedSequencesRef.current.clear();
      lastSequenceRef.current = 0;
      playback.cancelAnimations();
      setAuthoritativeGame(null);
      ownSlotRef.current = null;
      setOwnSlot(null);
      setCurrentPlayerSlot(null);
      setPlayerNames(['Player 1', 'Player 2']);
      setPlayerNationalities(['global', 'global']);
      setAuthoritativePlayerSkins([DEFAULT_ORB_SKIN_ID, DEFAULT_ORB_SKIN_ID]);
      setPlayerClocks([]);
      setPlayerConnected([]);
    }

    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    const oldSocket = socketRef.current;
    socketRef.current = null;
    oldSocket?.close();

    connectionAttemptRef.current += 1;
    const connectionAttempt = connectionAttemptRef.current;
    connectionPendingGameRef.current = id;
    gameIdRef.current = id;
    setGameId(id);
    // Until this new socket opens, there is no live endpoint to measure.
    connectionQuality.reset('offline');
    localStorage.setItem('cr_game_id', id);
    localStorage.removeItem('cr_queue');
    localStorage.removeItem('cr_queue_mode');
    setStage('game');
    setSocketStatus('connecting');

    const scheduleReconnect = (reason: string, minimumDelay = 0) => {
      if (connectionAttemptRef.current !== connectionAttempt || gameIdRef.current !== id) return;
      const attempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = attempt;
      if (attempt > 8) {
        setSocketStatus('offline');
        setNotice('Live connection is unavailable. Refresh to try again.');
        return;
      }

      const delay = Math.max(minimumDelay, Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
      setSocketStatus('reconnecting');
      setNotice(`${reason} Reconnecting in ${Math.ceil(delay / 1000)}s…`);
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        const currentSession = sessionRef.current;
        if (currentSession && gameIdRef.current === id && socketRef.current === null) {
          connectGame(id, currentSession.token, currentSession.user);
        }
      }, delay);
    };

    setNotice('Requesting a secure connection…');
    void (async () => {
      try {
        const ticketResponse = await request<{
          ticket: string;
          expires_in?: number;
          subprotocol?: string;
        }>(`/api/games/${id}/ws-ticket`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (
          connectionAttemptRef.current !== connectionAttempt ||
          gameIdRef.current !== id ||
          sessionRef.current?.token !== token
        ) return;
        if (!ticketResponse.ticket) throw new Error('The server did not issue a WebSocket ticket.');

        const explicitWebSocketUrl = process.env.NEXT_PUBLIC_WS_URL;
        const apiOrigin = process.env.NEXT_PUBLIC_API_URL
          ? new URL(process.env.NEXT_PUBLIC_API_URL, location.origin).origin.replace(/^http/, 'ws')
          : 'wss://backend.samyakshrma.space';
        const websocketBase = (explicitWebSocketUrl || apiOrigin).replace(/\/$/, '');
        const protocol = ticketResponse.subprotocol || 'chainreaction-v1';
        const socket = new WebSocket(
          `${websocketBase}/ws/games/${id}`,
          [protocol, `ticket.${ticketResponse.ticket}`],
        );
        connectionPendingGameRef.current = null;
        socketRef.current = socket;
        setNotice('Connecting to the live arena…');

        socket.onopen = () => {
          if (socketRef.current !== socket || gameIdRef.current !== id) {
            socket.close();
            return;
          }
          reconnectAttemptsRef.current = 0;
          setSocketStatus('live');
          setNotice('Connected. Syncing match state…');
          connectionQuality.reset('unknown');
          connectionQuality.sendPing(socket, gameIdRef.current, () => socketRef.current === socket);
          pingTimerRef.current = window.setInterval(() => {
            connectionQuality.sendPing(socket, gameIdRef.current, () => socketRef.current === socket);
          }, 20000);
        };

        socket.onmessage = (event) => {
          if (socketRef.current !== socket || gameIdRef.current !== id) return;
          try {
            const message = JSON.parse(event.data);
            const messageType = String(message.type ?? '').toLowerCase();
            const payload = message.payload ?? {};

            // Connection, state, move, and error messages share one authenticated channel.
            if (messageType === 'pong') {
              connectionQuality.recordPong(payload);
            }

            if (messageType === 'connection_ack') {
              const acknowledgedSlot = Number.isInteger(payload.player_slot) && [0, 1].includes(payload.player_slot)
                ? Number(payload.player_slot)
                : null;
              ownSlotRef.current = acknowledgedSlot;
              setOwnSlot(acknowledgedSlot);
              if (typeof payload.player_slot === 'number') {
                setPlayerConnected((current) =>
                  current.map((connected, slot) => slot === payload.player_slot ? true : connected),
                );
              }
            }

            if (messageType === 'state_snapshot' && payload.state) {
              const people = (Array.isArray(payload.players) ? payload.players : []) as Array<{
                user_id?: unknown;
                username?: unknown;
                player_slot?: unknown;
                nationality?: unknown;
                orb_skin_id?: unknown;
                time_remaining_ms?: unknown;
                connected?: unknown;
              }>;
              const playerForSlot = (slot: number) => people.find(
                (person) => person.player_slot === slot,
              );
              const nameForSlot = (slot: number) => {
                const username = playerForSlot(slot)?.username;
                return typeof username === 'string' ? username : 'Waiting for player';
              };
              const skinsBySlot = [0, 1].map((slot) => {
                return normalizeOrbSkinId(playerForSlot(slot)?.orb_skin_id);
              });
              setAuthoritativePlayerSkins(skinsBySlot);
              setPlayerNames([nameForSlot(0), nameForSlot(1)]);
              setPlayerNationalities([
                normalizeNationality(playerForSlot(0)?.nationality),
                normalizeNationality(playerForSlot(1)?.nationality),
              ]);
              setPlayerClocks([
                Number(playerForSlot(0)?.time_remaining_ms ?? 0),
                Number(playerForSlot(1)?.time_remaining_ms ?? 0),
              ]);
              setPlayerConnected([
                playerForSlot(0)?.connected === true,
                playerForSlot(1)?.connected === true,
              ]);

              const listedMySlot = people.find(
                (person) => person.user_id === sessionRef.current?.user.id,
              )?.player_slot;
              // Use the handshake slot; the snapshot player list is a safe identity fallback.
              const mySlot = ownSlotRef.current ??
                (Number.isInteger(listedMySlot) && [0, 1].includes(listedMySlot as number)
                  ? listedMySlot as number
                  : null);
              ownSlotRef.current = mySlot;
              setOwnSlot(mySlot);

              const next = normalizeGameState(payload.state);
              const snapshotTurnSlot = Number.isInteger(payload.current_player_slot)
                ? Number(payload.current_player_slot)
                : next.players[next.current_player_index]?.id ?? next.current_player_index;
              if (snapshotTurnSlot >= 0 && snapshotTurnSlot <= 1) {
                setCurrentPlayerSlot(snapshotTurnSlot);
              }
              setAuthoritativeGame(next);
              setStage(payload.status === 'FINISHED' || next.status.kind === 'won' ? 'finished' : 'game');
              lastSequenceRef.current = Math.max(
                lastSequenceRef.current,
                Number(payload.turn_number ?? next.turn_number),
              );

              if (!playback.isAnimatingRef.current) playback.setDisplayCells(null);
              if (!playback.isAnimatingRef.current) {
                setNotice(
                  snapshotTurnSlot === mySlot
                    ? 'Your turn — choose an empty cell or one of your own.'
                    : 'Opponent’s turn. Watch the board.',
                );
              }
            }

            if (messageType === 'move_accepted' && payload.final_state) {
              acceptMove(payload as AcceptedMove);
            }
            if (messageType === 'game_finished') {
              const finishedState = payload.state ?? payload.final_state;
              if (finishedState) setAuthoritativeGame(normalizeGameState(finishedState));
              if (payload.clocks) {
                setPlayerClocks([
                  Number(payload.clocks['0'] ?? 0),
                  Number(payload.clocks['1'] ?? 0),
                ]);
              }
              setBusy(false);
              setStage('finished');
              setNotice('The match is complete.');
            }
            if (messageType === 'move_rejected') {
              if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
              moveTimerRef.current = null;
              pendingMoveRef.current = null;
              setBusy(false);
              setLastMove(null);
              setNotice(typeof payload.message === 'string' ? payload.message : 'Move rejected. Try another cell.');
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'join_game' }));
              }
            }
            if (messageType === 'error') {
              const pendingMove = pendingMoveRef.current;
              if (pendingMove) {
                submitMoveFallback(id, token, pendingMove.cell, pendingMove.id);
              } else {
                setNotice(
                  typeof payload.message === 'string' && payload.message.length < 180
                    ? payload.message
                    : 'The game server could not process that update.',
                );
              }
            }

            if (!['connection_ack', 'state_snapshot', 'move_accepted', 'move_rejected', 'game_finished', 'error', 'pong'].includes(messageType)) {
              setNotice(`Server update: ${message.type ?? 'unknown'}`);
            }
          } catch (error) {
            setNotice(
              error instanceof Error
                ? `Game update error: ${error.message}`
                : 'The server sent an unreadable game update.',
            );
          }
        };

        socket.onerror = () => {
          // The close event schedules retries so an error/close pair cannot duplicate them.
          setNotice('Connection interrupted. Waiting for the server…');
        };

        socket.onclose = (event) => {
          if (socketRef.current !== socket || gameIdRef.current !== id) return;
          socketRef.current = null;
          if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
          connectionQuality.reset('offline');
          setBusy(false);

          if ([4401, 4403, 4404].includes(event.code)) {
            reconnectAttemptsRef.current = 0;
            setSocketStatus('offline');
            setNotice(
              event.code === 4401
                ? 'Your session has expired. Please sign in again.'
                : event.code === 4403
                  ? 'You are not a participant in this match.'
                  : 'This match no longer exists.',
            );
            return;
          }

          scheduleReconnect(
            event.code === 4408
              ? 'The live connection timed out.'
              : event.code === 4429
                ? 'The server is limiting new connections.'
                : 'Connection interrupted.',
            event.code === 4429 ? 5_000 : 0,
          );
        };
      } catch (error) {
        if (
          connectionAttemptRef.current !== connectionAttempt ||
          gameIdRef.current !== id
        ) return;
        connectionPendingGameRef.current = null;

        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          setSocketStatus('offline');
          setNotice(
            error.status === 401
              ? 'Your session has expired. Please sign in again.'
              : error.status === 403
                ? 'You are not a participant in this match.'
                : 'This match no longer exists.',
          );
          return;
        }

        scheduleReconnect(
          error instanceof ApiError && error.status === 429
            ? 'The server is limiting new connections.'
            : 'Could not request a live connection.',
          error instanceof ApiError && error.status === 429 ? 5_000 : 0,
        );
      }
    })();
  };

  const returnToLobby = () => {
    closeSocket();
    processedSequencesRef.current.clear();
    lastSequenceRef.current = 0;
    pendingMoveRef.current = null;
    localStorage.removeItem('cr_game_id');
    localStorage.removeItem('cr_queue');
    localStorage.removeItem('cr_queue_mode');
    setGameId(null);
    playback.cancelAnimations();
    setBusy(false);
    setAuthoritativeGame(null);
    ownSlotRef.current = null;
    setOwnSlot(null);
    setCurrentPlayerSlot(null);
    setPlayerNames(['Player 1', 'Player 2']);
    setPlayerNationalities(['global', 'global']);
    setAuthoritativePlayerSkins([DEFAULT_ORB_SKIN_ID, DEFAULT_ORB_SKIN_ID]);
    setStage('lobby');
    setNotice('Ready when you are.');
  };

  const clearForSignOut = () => {
    closeSocket();
    setGameId(null);
    setAuthoritativeGame(null);
    ownSlotRef.current = null;
    setOwnSlot(null);
    setCurrentPlayerSlot(null);
    setPlayerNationalities(['global', 'global']);
    setAuthoritativePlayerSkins([DEFAULT_ORB_SKIN_ID, DEFAULT_ORB_SKIN_ID]);
  };

  // While disconnected, history supplies the latest missed move without polling during live play.
  useEffect(() => {
    const activeSession = session;
    // History is a low-frequency recovery path only while the live socket is down.
    if (stage !== 'game' || !gameId || !activeSession || socketStatus === 'live') return;
    let stopped = false;

    const syncHistory = async () => {
      try {
        const history = await request(`/api/games/${gameId}/history`, {
          headers: { Authorization: `Bearer ${activeSession.token}` },
        });
        const moves = (history.moves ?? []) as (AcceptedMove & { sequence: number })[];
        const latest = moves.reduce<(typeof moves)[number] | null>(
          (best, move) => !best || move.sequence > best.sequence ? move : best,
          null,
        );
        if (!stopped && latest && latest.sequence > lastSequenceRef.current) acceptMove(latest);
      } catch {
        // The WebSocket remains the primary source of live game updates.
      }
    };

    void syncHistory();
    const timer = window.setInterval(() => void syncHistory(), 10_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // The socket/event callbacks use refs for changing connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, gameId, session, socketStatus]);

  useEffect(() => () => closeSocket(), []);

  // Derived player labels and turn state keep the board and sidebar in sync.
  const winner = game?.status.kind === 'won' ? (game.status.winner ?? null) : null;
  const currentPlayer = currentPlayerSlot ?? (
    game?.players[game.current_player_index]?.id ?? game?.current_player_index ?? 0
  );
  const isYourTurn = ownSlot !== null && currentPlayer === ownSlot;
  ownSlotRef.current = ownSlot;

  const colorForSlot = (slot: number) => {
    if (ownSlot === null) return PLAYER_COLORS[slot % 2];
    return slot === ownSlot ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
  };
  const orbSkinForSlot = (slot: number) =>
    orbAppearanceForSlot(slot);
  const activeBoardColor = ownSlot === null
    ? PLAYER_COLORS[currentPlayer % 2]
    : isYourTurn ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
  const displayedOwnSlot = ownSlot ?? 0;
  const ownPlayerName = playerNames[displayedOwnSlot] ?? `Player ${displayedOwnSlot + 1}`;
  const opponentPlayerName = playerNames[1 - displayedOwnSlot] ?? `Player ${2 - displayedOwnSlot}`;
  const playerRole = (slot: number) => {
    if (ownSlot === null) return slot === 0 ? 'GREEN' : 'RED';
    return slot === ownSlot ? 'YOU · GREEN' : 'OPPONENT · RED';
  };

  useEffect(() => {
    if (stage !== 'game' || !game || winner !== null) return;
    const playerOnTurn = currentPlayer;
    const timer = window.setInterval(() => {
      setPlayerClocks((clocks) =>
        clocks.map((clock, slot) =>
          slot === playerOnTurn ? Math.max(0, clock - 1000) : clock,
        ),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, currentPlayer, winner]);

  const play = (index: number) => {
    const activeSession = sessionRef.current;
    const cell = game?.board.cells[index];
    if (
      !game || !gameId || !activeSession || !isYourTurn || busy || playback.animating ||
      winner !== null || (cell?.owner !== null && cell?.owner !== ownSlot)
    ) return;

    setBusy(true);
    setLastMove(index);
    setNotice('Sending move…');
    const moveId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${index}`;
    pendingMoveRef.current = { cell: index, id: moveId };

    const movePayload = { cell: index, client_move_id: moveId };
    const canSendLive = socketRef.current?.readyState === WebSocket.OPEN;
    if (canSendLive) {
      socketRef.current?.send(JSON.stringify({ type: 'move', payload: movePayload }));
    }

    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    moveTimerRef.current = window.setTimeout(() => {
      moveTimerRef.current = null;
      if (pendingMoveRef.current?.id === moveId) {
        submitMoveFallback(gameId, activeSession.token, index, moveId);
      }
    }, canSendLive ? 2200 : 0);
  };

  return {
    socketStatus,
    latencyMs: connectionQuality.latencyMs,
    latencyQuality: connectionQuality.latencyQuality,
    ownSlot,
    playerNames,
    playerNationalities,
    playerSkinIds,
    playerClocks,
    playerConnected,
    gameId,
    game,
    busy,
    notice,
    setNotice,
    wave: playback.wave,
    animating: playback.animating,
    lastMove,
    displayCells: playback.displayCells,
    gridRef: playback.gridRef,
    flightLayerRef: playback.flightLayerRef,
    winner,
    currentPlayer,
    isYourTurn,
    colorForSlot,
    orbSkinForSlot,
    activeBoardColor,
    ownPlayerName,
    opponentPlayerName,
    playerRole,
    ...boardViewport,
    connectGame,
    closeSocket,
    returnToLobby,
    clearForSignOut,
    play,
  };
}
