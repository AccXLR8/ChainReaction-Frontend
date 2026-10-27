'use client';

import { useEffect, useRef, useState } from 'react';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import type { AppStage, AuthMode, AuthResponse, SessionUser } from '@/features/auth/types';
import { GameScreen } from '@/features/game/GameScreen';
import type { BoardPanelProps } from '@/features/game/BoardPanel';
import type { MatchSidebarProps } from '@/features/game/MatchSidebar';
import type { Cell, GameState } from '@/features/game/types';
import { useGameRuntime } from '@/features/game/useGameRuntime';
import { ApiError, authRequest, request } from '@/lib/api/client';

const PREVIEW_ORBS: Record<number, Cell> = {
  18: { owner: 0, orb_count: 1 },
  19: { owner: 0, orb_count: 2 },
  20: { owner: 1, orb_count: 1 },
  26: { owner: 0, orb_count: 2 },
  27: { owner: 0, orb_count: 3 },
  28: { owner: 1, orb_count: 2 },
  35: { owner: 0, orb_count: 1 },
  36: { owner: 1, orb_count: 3 },
  43: { owner: 0, orb_count: 1 },
  44: { owner: 1, orb_count: 1 },
};

const LOBBY_PREVIEW_GAME: GameState = {
  board: {
    width: 8,
    height: 8,
    cells: Array.from({ length: 64 }, (_, index) =>
      PREVIEW_ORBS[index] ?? { owner: null, orb_count: 0 },
    ),
  },
  players: [
    { id: 0, eliminated: false, has_moved: true },
    { id: 1, eliminated: false, has_moved: true },
  ],
  current_player_index: 0,
  turn_number: 8,
  status: { kind: 'active' },
};

/** Coordinates the three application screens and delegates live play to its feature hook. */
export function HomePage() {
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [stage, setStage] = useState<AppStage>('welcome');
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueAction, setQueueAction] = useState<'joining' | 'checking' | null>(null);
  const [serviceStatus, setServiceStatus] = useState('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const assignedGameId = useRef<string | null>(null);
  const queueCanceling = useRef(false);

  const game = useGameRuntime({ session, stage, setStage });

  // Restore the signed-in player and the last active game after a browser refresh.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const health = await request('/api/health/ready');
        setServiceStatus(health.status === 'ok' ? 'ready' : 'degraded');
      } catch {
        setServiceStatus('offline');
      }

      const token = localStorage.getItem('cr_access_token');
      const savedUser = localStorage.getItem('cr_user');
      if (!token || !savedUser) return;

      try {
        const stored = JSON.parse(savedUser) as SessionUser;
        const profile = await request('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        }) as { id: string; username: string };
        if (cancelled) return;

        const restored = { token, user: { ...stored, id: profile.id, username: profile.username } };
        setSession(restored);
        const restoredGameId = localStorage.getItem('cr_game_id');
        if (restoredGameId) {
          game.connectGame(restoredGameId, token, restored.user);
        } else if (localStorage.getItem('cr_queue') === 'yes') {
          setStage('queue');
        } else {
          setStage('lobby');
        }
      } catch (error) {
        localStorage.removeItem('cr_access_token');
        localStorage.removeItem('cr_user');
        localStorage.removeItem('cr_game_id');
        localStorage.removeItem('cr_queue');
        if (error instanceof ApiError && error.status === 401) {
          setAuthMode('login');
          setAuthError('Your session expired. Sign in again to access your account.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once during startup; API and WebSocket origins are build-time settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberSession = (response: AuthResponse) => {
    const nextSession = { token: response.access_token, user: response.user };
    localStorage.setItem('cr_access_token', nextSession.token);
    localStorage.setItem('cr_user', JSON.stringify(nextSession.user));
    setSession(nextSession);
    setAuthMode(null);
    setAuthError('');
    setErrorMessage('');
  };

  const saveSession = (response: AuthResponse) => {
    rememberSession(response);
    setStage('lobby');
  };

  const acceptAssignment = (gameId: string, activeSession: { token: string; user: SessionUser }) => {
    if (assignedGameId.current === gameId) return;
    assignedGameId.current = gameId;
    localStorage.removeItem('cr_queue');
    game.connectGame(gameId, activeSession.token, activeSession.user);
  };

  const googleAuthSubmit = async (credential: string) => {
    if (authBusy) return;
    setAuthError('');
    setAuthBusy(true);

    try {
      // The auth service must verify this Google ID token and return the normal game session.
      saveSession(await authRequest('google', { credential }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in with Google.';
      setAuthError(/\b404\b|not found/i.test(message)
        ? 'Google sign-in is not enabled on the game server yet.'
        : message);
    } finally {
      setAuthBusy(false);
    }
  };

  const enqueuePlayer = async (activeSession: { token: string; user: SessionUser }) => {
    game.setNotice('Looking for an opponent…');
    const response = await request('/api/matchmaking/join', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeSession.token}` },
    });
    if (response.status === 'matched' && typeof response.game_id === 'string') {
      game.connectGame(response.game_id, activeSession.token, activeSession.user);
    } else {
      localStorage.setItem('cr_queue', 'yes');
      game.setNotice('You’re in the queue. We’ll connect you as soon as an opponent is ready.');
    }
  };

  const startMatchmaking = async () => {
    if (queueBusy) return;
    setQueueBusy(true);
    setQueueAction('joining');
    setStage('queue');
    setErrorMessage('');
    assignedGameId.current = null;
    queueCanceling.current = false;
    let activeSession = session;

    try {
      if (!activeSession) {
        // Quick play creates a guest account just in time for authenticated matchmaking.
        const guest = await authRequest('guest');
        activeSession = { token: guest.access_token, user: guest.user };
        rememberSession(guest);
      }
      await enqueuePlayer(activeSession);
    } catch (error) {
      setStage(activeSession ? 'lobby' : 'welcome');
      setErrorMessage(error instanceof Error ? error.message : 'Could not join matchmaking.');
    } finally {
      setQueueBusy(false);
      setQueueAction(null);
    }
  };

  const joinQueue = () => startMatchmaking();
  const findMatch = () => startMatchmaking();

  const leaveQueue = async () => {
    if (queueCanceling.current) return;
    queueCanceling.current = true;
    setQueueBusy(true);
    setQueueAction('checking');

    try {
      if (session) {
        const headers = { Authorization: `Bearer ${session.token}` };

        // A match can be assigned between the last poll and the player's cancel click.
        const current = await request('/api/matchmaking/status', { headers });
        if (current.status === 'matched' && typeof current.game_id === 'string') {
          acceptAssignment(current.game_id, session);
          return;
        }
        if (assignedGameId.current) return;

        const result = await request('/api/matchmaking/leave', { method: 'POST', headers });
        if (result.status === 'matched' && typeof result.game_id === 'string') {
          acceptAssignment(result.game_id, session);
          return;
        }
        if (assignedGameId.current) return;
      }

      localStorage.removeItem('cr_queue');
      setStage('lobby');
      game.setNotice('Search cancelled.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not leave the queue.');
    } finally {
      queueCanceling.current = false;
      setQueueBusy(false);
      setQueueAction(null);
    }
  };

  const signOut = async () => {
    if (stage === 'queue') await leaveQueue();
    localStorage.removeItem('cr_access_token');
    localStorage.removeItem('cr_user');
    localStorage.removeItem('cr_game_id');
    localStorage.removeItem('cr_queue');
    setSession(null);
    game.clearForSignOut();
    setStage('welcome');
    setAuthMode(null);
  };

  const updateSessionUsername = (username: string) => {
    setSession((current) => {
      if (!current) return current;
      const updated = { ...current, user: { ...current.user, username } };
      localStorage.setItem('cr_user', JSON.stringify(updated.user));
      return updated;
    });
  };

  const handleSessionExpired = () => {
    localStorage.removeItem('cr_access_token');
    localStorage.removeItem('cr_user');
    localStorage.removeItem('cr_game_id');
    localStorage.removeItem('cr_queue');
    setSession(null);
    game.clearForSignOut();
    setStage('welcome');
    setAuthMode('login');
    setAuthError('Your session expired. Sign in again to access your account.');
  };

  // Poll only while queued; the server assigns the same game ID used by the socket flow.
  useEffect(() => {
    if (stage !== 'queue' || !session) return;
    let stopped = false;

    const pollQueue = async () => {
      if (queueCanceling.current) return;
      try {
        const response = await request('/api/matchmaking/status', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!stopped && response.status === 'matched' && typeof response.game_id === 'string') {
          acceptAssignment(response.game_id, session);
        }
      } catch (error) {
        if (!stopped) {
          game.setNotice(error instanceof Error ? error.message : 'Checking matchmaking…');
        }
      }
    };

    const timer = window.setInterval(() => void pollQueue(), 1800);
    void pollQueue();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // Connection handlers use refs and do not need to restart the queue timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, session]);

  const board: BoardPanelProps = {
    // Keep the lobby's board visible while the accepted match's first snapshot loads.
    game: game.game ?? LOBBY_PREVIEW_GAME,
    cells: game.game ? game.displayCells : LOBBY_PREVIEW_GAME.board.cells,
    wave: game.wave,
    lastMove: game.lastMove,
    busy: game.busy || !game.game,
    animating: game.animating,
    winner: game.winner,
    isYourTurn: game.isYourTurn,
    ownSlot: game.ownSlot,
    socketStatus: game.socketStatus,
    notice: game.game ? game.notice : 'Connecting to the match…',
    ownPlayerName: game.game ? game.ownPlayerName : 'YOU',
    opponentPlayerName: game.game ? game.opponentPlayerName : 'OPPONENT',
    boardWidth: game.boardWidth,
    boardHeight: game.boardHeight,
    cellSize: game.cellSize,
    cellGap: game.cellGap,
    stageWidth: game.stageWidth,
    stageHeight: game.stageHeight,
    activeBoardColor: game.activeBoardColor,
    gridRef: game.gridRef,
    flightLayerRef: game.flightLayerRef,
    colorForSlot: game.colorForSlot,
    onPlay: game.play,
  };
  const previewBoard: BoardPanelProps = {
    ...board,
    game: LOBBY_PREVIEW_GAME,
    cells: LOBBY_PREVIEW_GAME.board.cells,
    wave: null,
    lastMove: null,
    busy: false,
    animating: false,
    winner: null,
    isYourTurn: false,
    ownSlot: 0,
    socketStatus: 'preview',
    notice: 'DEMO POSITION · READY TO PLAY',
    ownPlayerName: 'YOU',
    opponentPlayerName: 'OPPONENT',
    activeBoardColor: '#39e58c',
    colorForSlot: (slot) => slot === 0 ? '#39e58c' : '#ff5964',
    onPlay: () => undefined,
  };

  if (!session || stage === 'lobby' || stage === 'queue') {
    return (
      <WelcomeScreen
        authMode={authMode}
        authError={authError}
        errorMessage={errorMessage}
        authBusy={authBusy}
        serviceStatus={serviceStatus}
        user={session?.user ?? null}
        sessionToken={session?.token ?? null}
        stage={stage}
        queueBusy={queueBusy}
        queueAction={queueAction}
        notice={game.notice}
        previewBoard={previewBoard}
        onAuthModeChange={setAuthMode}
        onGoogleSignIn={(credential) => void googleAuthSubmit(credential)}
        onGoogleError={setAuthError}
        onSessionUsernameUpdate={updateSessionUsername}
        onSessionExpired={handleSessionExpired}
        onFindMatch={() => void findMatch()}
        onCancelSearch={() => void leaveQueue()}
        onSignOut={() => void signOut()}
      />
    );
  }

  const visibleStage = stage === 'finished' ? 'finished' : 'game';
  const sidebar: MatchSidebarProps = {
    stage: visibleStage,
    game: game.game,
    socketStatus: game.socketStatus,
    waveActive: game.wave !== null,
    currentPlayer: game.currentPlayer,
    winner: game.winner,
    ownSlot: game.ownSlot,
    playerNames: game.playerNames,
    playerClocks: game.playerClocks,
    playerConnected: game.playerConnected,
    colorForSlot: game.colorForSlot,
    playerRole: game.playerRole,
    onPlayAgain: () => void joinQueue(),
    onReturnToLobby: game.returnToLobby,
  };

  return (
    <GameScreen
      stage={visibleStage}
      user={session.user}
      socketStatus={game.socketStatus}
      serviceStatus={serviceStatus}
      gameId={game.gameId}
      turnNumber={game.game?.turn_number ?? 0}
      board={board}
      sidebar={sidebar}
      onReturnToLobby={game.returnToLobby}
      onPlayAgain={() => void joinQueue()}
    />
  );
}
