'use client';

import { useCallback, useEffect, useState } from 'react';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import type { AppStage, AuthMode, AuthResponse, SessionUser } from '@/features/auth/types';
import { GameScreen } from '@/features/game/GameScreen';
import type { BoardPanelProps } from '@/features/game/BoardPanel';
import type { MatchSidebarProps } from '@/features/game/MatchSidebar';
import {
  DEFAULT_ORB_SKIN,
  DEFAULT_ORB_SKIN_ID,
  normalizeOrbSkinCatalog,
  resolveOrbSkin,
  type OrbSkinCatalogItem,
} from '@/features/game/orb-skins';
import { useGameRuntime } from '@/features/game/useGameRuntime';
import { LOBBY_PREVIEW_GAME } from '@/features/lobby/preview-game';
import {
  useMatchmakingRuntime,
  type MatchmakingSession,
} from '@/features/matchmaking/useMatchmakingRuntime';
import type { MatchmakingMode } from '@/features/matchmaking/api';
import { ApiError, authRequest, request } from '@/lib/api/client';
import { getMyProfile, getOrbSkinCatalog } from '@/lib/api/profiles';
import { normalizeNationality } from '@/features/nationality/countries';

type AppSession = MatchmakingSession;

/** Coordinates application state and composes the lobby and live game screens. */
export function HomePage() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [stage, setStage] = useState<AppStage>('welcome');
  const [serviceStatus, setServiceStatus] = useState('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [orbSkinCatalog, setOrbSkinCatalog] = useState<OrbSkinCatalogItem[]>([DEFAULT_ORB_SKIN]);
  const [equippedOrbSkinId, setEquippedOrbSkinId] = useState(DEFAULT_ORB_SKIN_ID);

  const resolveSkin = useCallback(
    (skinId: unknown) => resolveOrbSkin(skinId, orbSkinCatalog),
    [orbSkinCatalog],
  );
  const game = useGameRuntime({ session, stage, setStage, resolveOrbSkin: resolveSkin });

  /** Persist the API session and normalize older auth responses for the UI. */
  const rememberSession = (response: AuthResponse): AppSession => {
    const nextSession: AppSession = {
      token: response.access_token,
      user: {
        ...response.user,
        nationality: response.user.is_guest ? 'global' : normalizeNationality(response.user.nationality),
      },
    };
    localStorage.setItem('cr_access_token', nextSession.token);
    localStorage.setItem('cr_user', JSON.stringify(nextSession.user));
    setSession(nextSession);
    setAuthMode(null);
    setAuthError('');
    setErrorMessage('');
    return nextSession;
  };

  const saveSession = (response: AuthResponse) => {
    rememberSession(response);
    setStage('lobby');
  };

  /** Quick play creates a guest only when no session exists yet. */
  const createGuestSession = async (): Promise<AppSession> =>
    rememberSession(await authRequest('guest'));

  const matchmaking = useMatchmakingRuntime({
    session,
    stage,
    setStage,
    game: {
      connectGame: game.connectGame,
      setNotice: game.setNotice,
    },
    createGuestSession,
    onRequestSignIn: () => setAuthMode('login'),
    setErrorMessage,
  });

  // The catalog is optional at startup: a service outage leaves Classic available.
  useEffect(() => {
    let active = true;
    void getOrbSkinCatalog()
      .then((skins) => {
        if (active) setOrbSkinCatalog(normalizeOrbSkinCatalog(skins));
      })
      .catch(() => {
        if (active) setOrbSkinCatalog([DEFAULT_ORB_SKIN]);
      });

    return () => {
      active = false;
    };
  }, []);

  // Refresh the lobby's equipped skin and nationality from the authoritative profile.
  useEffect(() => {
    if (!session) {
      setEquippedOrbSkinId(DEFAULT_ORB_SKIN_ID);
      return;
    }

    let active = true;
    void getMyProfile(session.token)
      .then((profile) => {
        if (!active) return;

        const nationality = session.user.is_guest
          ? 'global'
          : normalizeNationality(profile.nationality);
        setSession((current) => {
          if (!current || current.token !== session.token || current.user.nationality === nationality) {
            return current;
          }
          const user = { ...current.user, nationality };
          localStorage.setItem('cr_user', JSON.stringify(user));
          return { ...current, user };
        });

        const ownedSkins = new Set(profile.owned_orb_skin_ids ?? []);
        ownedSkins.add(DEFAULT_ORB_SKIN_ID);
        const equipped = profile.equipped_orb_skin_id ?? DEFAULT_ORB_SKIN_ID;
        setEquippedOrbSkinId(ownedSkins.has(equipped) ? equipped : DEFAULT_ORB_SKIN_ID);
      })
      .catch(() => {
        if (active) setEquippedOrbSkinId(DEFAULT_ORB_SKIN_ID);
      });

    return () => {
      active = false;
    };
  }, [session?.token]);

  // Restore a signed-in player, active match, or pending matchmaking queue after refresh.
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

        const restored: AppSession = {
          token,
          user: {
            ...stored,
            id: profile.id,
            username: profile.username,
            nationality: stored.is_guest ? 'global' : normalizeNationality(stored.nationality),
          },
        };
        setSession(restored);

        const restoredGameId = localStorage.getItem('cr_game_id');
        if (restoredGameId) {
          game.connectGame(restoredGameId, token, restored.user);
        } else if (localStorage.getItem('cr_queue') === 'yes') {
          matchmaking.restoreQueueMode(localStorage.getItem('cr_queue_mode'));
          setStage('queue');
        } else {
          setStage('lobby');
        }
      } catch (error) {
        clearStoredSession();
        if (error instanceof ApiError && error.status === 401) {
          setAuthMode('login');
          setAuthError('Your session expired. Sign in again to access your account.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Startup restoration intentionally runs once; environment URLs are build-time settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGuestForSkins = async () => {
    if (session) return;
    saveSession(await authRequest('guest'));
  };

  const googleAuthSubmit = async (credential: string) => {
    if (authBusy) return;
    setAuthError('');
    setAuthBusy(true);

    try {
      // The backend verifies this Google ID token and returns the regular game session.
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

  const manualAuthSubmit = async (
    mode: 'login' | 'register',
    username: string,
    password: string,
    nationality: string,
  ) => {
    if (authBusy) return;
    setAuthError('');
    setAuthBusy(true);

    try {
      const body = mode === 'register'
        ? { username, password, nationality: normalizeNationality(nationality) }
        : { username, password };
      saveSession(await authRequest(mode, body));
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : `Could not ${mode === 'login' ? 'sign in' : 'create account'}.`);
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (stage === 'queue') await matchmaking.leaveQueue();
    clearStoredSession();
    setSession(null);
    game.clearForSignOut();
    setStage('welcome');
    setAuthMode(null);
  };

  const updateSessionProfile = (username: string, nationality: string) => {
    setSession((current) => {
      if (!current) return current;
      const updated = {
        ...current,
        user: { ...current.user, username, nationality: normalizeNationality(nationality) },
      };
      localStorage.setItem('cr_user', JSON.stringify(updated.user));
      return updated;
    });
  };

  const handleSessionExpired = () => {
    clearStoredSession();
    setSession(null);
    game.clearForSignOut();
    setStage('welcome');
    setAuthMode('login');
    setAuthError('Your session expired. Sign in again to access your account.');
  };

  // Build the live board props once; the same BoardPanel powers the lobby preview.
  const board: BoardPanelProps = {
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
    orbSkinForSlot: game.orbSkinForSlot,
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
    orbSkinForSlot: (slot) => {
      const isOwnPlayer = slot === 0;
      const skin = resolveSkin(isOwnPlayer ? equippedOrbSkinId : DEFAULT_ORB_SKIN_ID);
      return {
        skinId: skin.id,
        assetKey: skin.asset_key,
        assets: skin.assets,
        side: isOwnPlayer ? 'self' : 'opponent',
        color: isOwnPlayer ? '#39e58c' : '#ff5964',
      };
    },
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
        queueMode={matchmaking.queueMode}
        queueBusy={matchmaking.queueBusy}
        queueAction={matchmaking.queueAction}
        notice={game.notice}
        previewBoard={previewBoard}
        onAuthModeChange={setAuthMode}
        onGoogleSignIn={(credential) => void googleAuthSubmit(credential)}
        onGoogleError={setAuthError}
        onManualAuth={(mode, username, password, nationality) =>
          void manualAuthSubmit(mode, username, password, nationality)
        }
        onSessionProfileUpdate={updateSessionProfile}
        onSessionExpired={handleSessionExpired}
        onCreateGuestForSkins={createGuestForSkins}
        onSkinEquipped={setEquippedOrbSkinId}
        onFindMatch={(mode) => void matchmaking.findMatch(mode)}
        onCancelSearch={() => void matchmaking.leaveQueue()}
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
    playerNationalities: game.playerNationalities,
    playerClocks: game.playerClocks,
    playerConnected: game.playerConnected,
    colorForSlot: game.colorForSlot,
    playerRole: game.playerRole,
    onPlayAgain: () => void matchmaking.joinQueue(),
    onReturnToLobby: game.returnToLobby,
  };

  return (
    <GameScreen
      stage={visibleStage}
      user={session.user}
      socketStatus={game.socketStatus}
      latencyMs={game.latencyMs}
      latencyQuality={game.latencyQuality}
      serviceStatus={serviceStatus}
      gameId={game.gameId}
      turnNumber={game.game?.turn_number ?? 0}
      board={board}
      sidebar={sidebar}
      onReturnToLobby={game.returnToLobby}
      onPlayAgain={() => void matchmaking.joinQueue()}
    />
  );
}

/** Clear browser-persisted session and navigation state together. */
function clearStoredSession() {
  localStorage.removeItem('cr_access_token');
  localStorage.removeItem('cr_user');
  localStorage.removeItem('cr_game_id');
  localStorage.removeItem('cr_queue');
  localStorage.removeItem('cr_queue_mode');
}
