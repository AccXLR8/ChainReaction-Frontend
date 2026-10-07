'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppStage, SessionUser } from '@/features/auth/types';
import { request } from '@/lib/api/client';
import { DEFAULT_BOARD_SIZE, getCellSize, normalizeGameState } from './board-model';
import { REACTION_TIMING } from './reaction-animation';
import type { AcceptedMove, GameState } from './types';
import { useReactionPlayback } from './useReactionPlayback';

type PlayerSession = { token: string; user: SessionUser };

type UseGameRuntimeOptions = {
  session: PlayerSession | null;
  stage: AppStage;
  setStage: Dispatch<SetStateAction<AppStage>>;
};

const PLAYER_COLORS = ['#39e58c', '#ff5964'];

/** Owns the authenticated game connection, board state, and reaction playback. */
export function useGameRuntime({ session, stage, setStage }: UseGameRuntimeOptions) {
  const [socketStatus, setSocketStatus] = useState('offline');
  const [ownSlot, setOwnSlot] = useState<number | null>(null);
  const [currentPlayerSlot, setCurrentPlayerSlot] = useState<number | null>(null);
  const [playerNames, setPlayerNames] = useState(['Player 1', 'Player 2']);
  const [playerClocks, setPlayerClocks] = useState<number[]>([]);
  const [playerConnected, setPlayerConnected] = useState<boolean[]>([]);
  const [gameId, setGameId] = useState<string | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Waiting for a match');
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [viewportHeight, setViewportHeight] = useState(900);

  const socketRef = useRef<WebSocket | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const sessionRef = useRef<PlayerSession | null>(session);
  const gameRef = useRef<GameState | null>(null);
  const ownSlotRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const processedSequencesRef = useRef(new Set<number>());
  const lastSequenceRef = useRef(0);
  const pendingMoveRef = useRef<{ cell: number; id: string } | null>(null);

  sessionRef.current = session;

  const setAuthoritativeGame = (next: GameState | null) => {
    gameRef.current = next;
    setGame(next);
  };

  const flightColor = (slot: number) => {
    const ownSlotNow = ownSlotRef.current;
    if (ownSlotNow === null) return PLAYER_COLORS[slot % 2];
    return slot === ownSlotNow ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
  };
  const playback = useReactionPlayback(flightColor, () => setBusy(false));

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
        reaction.placement?.player ??
        payload.player_slot ??
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

  const closeSocket = () => {
    gameIdRef.current = null;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
    if (moveTimerRef.current !== null) window.clearTimeout(moveTimerRef.current);
    reconnectTimerRef.current = null;
    pingTimerRef.current = null;
    moveTimerRef.current = null;

    const oldSocket = socketRef.current;
    socketRef.current = null;
    oldSocket?.close();
  };

  const connectGame = (id: string, token: string, restoredUser?: SessionUser) => {
    if (restoredUser) sessionRef.current = { token, user: restoredUser };

    if (socketRef.current?.readyState === WebSocket.OPEN && gameIdRef.current === id) {
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
      setPlayerClocks([]);
      setPlayerConnected([]);
    }

    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    const oldSocket = socketRef.current;
    socketRef.current = null;
    oldSocket?.close();

    gameIdRef.current = id;
    setGameId(id);
    localStorage.setItem('cr_game_id', id);
    localStorage.removeItem('cr_queue');
    setStage('game');
    setSocketStatus('connecting');

    const explicitWebSocketUrl = process.env.NEXT_PUBLIC_WS_URL;
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL
      ? new URL(process.env.NEXT_PUBLIC_API_URL, location.origin).origin.replace(/^http/, 'ws')
      : 'wss://backend.samyakshrma.space';
    const websocketBase = explicitWebSocketUrl || apiOrigin;
    const socket = new WebSocket(
      `${websocketBase.replace(/\/$/, '')}/ws/games/${id}?token=${encodeURIComponent(token)}`,
    );
    socketRef.current = socket;
    setNotice('Connecting to the live arena…');

    socket.onopen = () => {
      setSocketStatus('live');
      setNotice('Connected. Syncing match state…');
      pingTimerRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', payload: {} }));
        }
      }, 20000);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const messageType = String(message.type ?? '').toLowerCase();
        const payload = message.payload ?? {};

        if (messageType === 'connection_ack') {
          const acknowledgedSlot = Number.isInteger(payload.player_slot)
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
          const people = [...(payload.players ?? [])].sort(
            (left: { player_slot: number }, right: { player_slot: number }) =>
              left.player_slot - right.player_slot,
          );
          setPlayerNames([
            people.find((person: { player_slot: number }) => person.player_slot === 0)?.username ?? 'Waiting for player',
            people.find((person: { player_slot: number }) => person.player_slot === 1)?.username ?? 'Waiting for player',
          ]);
          setPlayerClocks([
            people.find((person: { player_slot: number }) => person.player_slot === 0)?.time_remaining_ms ?? 0,
            people.find((person: { player_slot: number }) => person.player_slot === 1)?.time_remaining_ms ?? 0,
          ]);
          setPlayerConnected([
            people.find((person: { player_slot: number }) => person.player_slot === 0)?.connected ?? false,
            people.find((person: { player_slot: number }) => person.player_slot === 1)?.connected ?? false,
          ]);

          const listedMySlot = people.find(
            (person: { user_id: string }) => person.user_id === sessionRef.current?.user.id,
          )?.player_slot;
          // The handshake identifies this connection's slot; the player list is a fallback.
          const mySlot = ownSlotRef.current ?? listedMySlot ?? null;
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
          if (payload.state) setAuthoritativeGame(normalizeGameState(payload.state));
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
          // Rejections can reveal that the local turn snapshot is stale; ask for a fresh one.
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'join_game', payload: {} }));
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

        if (!['connection_ack', 'state_snapshot', 'move_accepted', 'game_finished', 'move_rejected', 'error', 'pong'].includes(messageType)) {
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
      setSocketStatus('reconnecting');
      setNotice('Connection interrupted. Reconnecting…');
    };

    socket.onclose = () => {
      if (socketRef.current !== socket || gameIdRef.current !== id) return;
      if (pingTimerRef.current !== null) window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
      setBusy(false);
      setSocketStatus('reconnecting');
      setNotice('Connection interrupted. Reconnecting…');
      reconnectTimerRef.current = window.setTimeout(() => {
        const currentSession = sessionRef.current;
        if (currentSession && gameIdRef.current === id) {
          connectGame(id, currentSession.token);
        }
      }, 1800);
    };
  };

  const returnToLobby = () => {
    closeSocket();
    processedSequencesRef.current.clear();
    lastSequenceRef.current = 0;
    pendingMoveRef.current = null;
    localStorage.removeItem('cr_game_id');
    localStorage.removeItem('cr_queue');
    setGameId(null);
    playback.cancelAnimations();
    setBusy(false);
    setAuthoritativeGame(null);
    ownSlotRef.current = null;
    setOwnSlot(null);
    setCurrentPlayerSlot(null);
    setPlayerNames(['Player 1', 'Player 2']);
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
  };

  // Restore only the latest state from history if a WebSocket event was missed.
  useEffect(() => {
    const activeSession = session;
    if (stage !== 'game' || !gameId || !activeSession) return;
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

    const timer = window.setInterval(() => void syncHistory(), 3200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // The socket/event callbacks use refs for changing connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, gameId, session]);

  useEffect(() => () => closeSocket(), []);

  useEffect(() => {
    const measureViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    measureViewport();
    window.addEventListener('resize', measureViewport);
    return () => window.removeEventListener('resize', measureViewport);
  }, []);

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

  const boardWidth = game?.board.width ?? DEFAULT_BOARD_SIZE.width;
  const boardHeight = game?.board.height ?? DEFAULT_BOARD_SIZE.height;
  const cellSize = useMemo(
    () => getCellSize(viewportWidth, boardWidth, boardHeight, viewportHeight),
    [viewportWidth, viewportHeight, boardWidth, boardHeight],
  );
  const cellGap = 3;
  const stageWidth = boardWidth * cellSize + (boardWidth - 1) * cellGap;
  const stageHeight = boardHeight * cellSize + (boardHeight - 1) * cellGap;

  return {
    socketStatus,
    ownSlot,
    playerNames,
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
    activeBoardColor,
    ownPlayerName,
    opponentPlayerName,
    playerRole,
    boardWidth,
    boardHeight,
    cellSize,
    cellGap,
    stageWidth,
    stageHeight,
    connectGame,
    closeSocket,
    returnToLobby,
    clearForSignOut,
    play,
  };
}
