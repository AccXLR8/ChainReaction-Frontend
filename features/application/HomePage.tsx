'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import type { AppStage, AuthMode, AuthResponse, SessionUser } from '@/features/auth/types';
import { GameScreen } from '@/features/game/GameScreen';
import type { BoardPanelProps } from '@/features/game/BoardPanel';
import type { MatchSidebarProps } from '@/features/game/MatchSidebar';
import { useGameRuntime } from '@/features/game/useGameRuntime';
import { LobbyScreen } from '@/features/lobby/LobbyScreen';
import { authRequest, request } from '@/lib/api/client';

/** Coordinates the three application screens and delegates live play to its feature hook. */
export function HomePage() {
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [stage, setStage] = useState<AppStage>('welcome');
  const [queueBusy, setQueueBusy] = useState(false);
  const [serviceStatus, setServiceStatus] = useState('checking');
  const [errorMessage, setErrorMessage] = useState('');

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
      } catch {
        localStorage.removeItem('cr_access_token');
        localStorage.removeItem('cr_user');
        localStorage.removeItem('cr_game_id');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once during startup; API and WebSocket origins are build-time settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSession = (response: AuthResponse) => {
    const nextSession = { token: response.access_token, user: response.user };
    localStorage.setItem('cr_access_token', nextSession.token);
    localStorage.setItem('cr_user', JSON.stringify(nextSession.user));
    setSession(nextSession);
    setStage('lobby');
    setAuthMode(null);
    setAuthError('');
    setPassword('');
    setErrorMessage('');
  };

  const authSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setAuthBusy(true);

    try {
      const endpoint = authMode === 'register' ? 'register' : 'login';
      saveSession(await authRequest(endpoint, { username, password }));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not authenticate.');
    } finally {
      setAuthBusy(false);
    }
  };

  const guestLogin = async () => {
    setAuthError('');
    setAuthBusy(true);

    try {
      const guestName = username.trim();
      saveSession(await authRequest('guest', guestName ? { username: guestName } : undefined));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not create guest session.');
    } finally {
      setAuthBusy(false);
    }
  };

  const joinQueue = async () => {
    if (!session || queueBusy) return;

    setQueueBusy(true);
    setStage('queue');
    setErrorMessage('');
    game.setNotice('Looking for an opponent…');

    try {
      const response = await request('/api/matchmaking/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (response.status === 'matched' && typeof response.game_id === 'string') {
        game.connectGame(response.game_id, session.token, session.user);
      } else {
        localStorage.setItem('cr_queue', 'yes');
        game.setNotice('You’re in the queue. We’ll connect you as soon as an opponent is ready.');
      }
    } catch (error) {
      setStage('lobby');
      setErrorMessage(error instanceof Error ? error.message : 'Could not join matchmaking.');
    } finally {
      setQueueBusy(false);
    }
  };

  const leaveQueue = async () => {
    try {
      if (session) {
        await request('/api/matchmaking/leave', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not leave the queue.');
    }

    localStorage.removeItem('cr_queue');
    setStage('lobby');
    game.setNotice('Search cancelled.');
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

  // Poll only while queued; the server assigns the same game ID used by the socket flow.
  useEffect(() => {
    if (stage !== 'queue' || !session) return;
    let stopped = false;

    const pollQueue = async () => {
      try {
        const response = await request('/api/matchmaking/status', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!stopped && response.status === 'matched' && typeof response.game_id === 'string') {
          localStorage.removeItem('cr_queue');
          game.connectGame(response.game_id, session.token, session.user);
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

  if (!session) {
    return (
      <WelcomeScreen
        authMode={authMode}
        username={username}
        password={password}
        authError={authError}
        errorMessage={errorMessage}
        authBusy={authBusy}
        serviceStatus={serviceStatus}
        onAuthModeChange={setAuthMode}
        onAuthSwitch={(mode) => {
          setAuthMode(mode);
          setAuthError('');
        }}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onAuthSubmit={authSubmit}
        onGuestLogin={() => void guestLogin()}
      />
    );
  }

  if (stage === 'lobby' || stage === 'queue') {
    return (
      <LobbyScreen
        stage={stage}
        user={session.user}
        queueBusy={queueBusy}
        errorMessage={errorMessage}
        notice={game.notice}
        serviceStatus={serviceStatus}
        onSignOut={() => void signOut()}
        onJoinQueue={() => void joinQueue()}
        onLeaveQueue={() => void leaveQueue()}
      />
    );
  }

  const visibleStage = stage === 'finished' ? 'finished' : 'game';
  const board: BoardPanelProps = {
    game: game.game,
    cells: game.displayCells,
    wave: game.wave,
    lastMove: game.lastMove,
    busy: game.busy,
    animating: game.animating,
    winner: game.winner,
    isYourTurn: game.isYourTurn,
    ownSlot: game.ownSlot,
    socketStatus: game.socketStatus,
    notice: game.notice,
    ownPlayerName: game.ownPlayerName,
    opponentPlayerName: game.opponentPlayerName,
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
