'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AppStage, SessionUser } from '@/features/auth/types';
import { ApiError } from '@/lib/api/client';
import {
  joinMatchmaking,
  leaveMatchmaking,
  readMatchmakingStatus,
  type MatchmakingMode,
} from './api';
import { isMatchmakingMode, matchmakingModeName } from './presentation';

export type MatchmakingSession = { token: string; user: SessionUser };

type GameActions = {
  setNotice: Dispatch<SetStateAction<string>>;
  connectGame: (gameId: string, token: string, user?: SessionUser) => void;
};

type UseMatchmakingRuntimeOptions = {
  session: MatchmakingSession | null;
  stage: AppStage;
  setStage: Dispatch<SetStateAction<AppStage>>;
  game: GameActions;
  createGuestSession: () => Promise<MatchmakingSession>;
  onRequestSignIn: () => void;
  setErrorMessage: Dispatch<SetStateAction<string>>;
};

/**
 * Owns queue entry, cancellation races, reconnect recovery, and assignment polling.
 * The game runtime remains the authority for opening the matched game connection.
 */
export function useMatchmakingRuntime({
  session,
  stage,
  setStage,
  game,
  createGuestSession,
  onRequestSignIn,
  setErrorMessage,
}: UseMatchmakingRuntimeOptions) {
  const [queueMode, setQueueMode] = useState<MatchmakingMode>('standard');
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueAction, setQueueAction] = useState<'joining' | 'checking' | null>(null);

  const assignedGameId = useRef<string | null>(null);
  const queueCanceling = useRef(false);
  const queueModeRef = useRef<MatchmakingMode>('standard');

  /** Restore only a validated mode from browser storage. */
  const restoreQueueMode = (savedMode: string | null) => {
    const restoredMode = isMatchmakingMode(savedMode) ? savedMode : 'standard';
    queueModeRef.current = restoredMode;
    setQueueMode(restoredMode);
  };

  const acceptAssignment = (gameId: string, activeSession: MatchmakingSession) => {
    if (assignedGameId.current === gameId) return;
    assignedGameId.current = gameId;
    localStorage.removeItem('cr_queue');
    localStorage.removeItem('cr_queue_mode');
    game.connectGame(gameId, activeSession.token, activeSession.user);
  };

  const enqueuePlayer = async (activeSession: MatchmakingSession, mode: MatchmakingMode) => {
    game.setNotice(`Joining the ${matchmakingModeName(mode)} queue…`);
    localStorage.setItem('cr_queue', 'yes');
    localStorage.setItem('cr_queue_mode', mode);

    const response = await joinMatchmaking(mode, activeSession.token);
    if (response.status === 'matched' && typeof response.game_id === 'string') {
      acceptAssignment(response.game_id, activeSession);
      return;
    }

    game.setNotice(`You’re in the ${matchmakingModeName(mode)} queue. We’ll connect you when a match is ready.`);
  };

  const startMatchmaking = async (mode: MatchmakingMode) => {
    if (queueBusy) return;

    if (mode === 'ranked' && (!session || session.user.is_guest)) {
      if (!session) onRequestSignIn();
      else setErrorMessage('Ranked matchmaking is only available to registered players.');
      return;
    }

    queueModeRef.current = mode;
    setQueueMode(mode);
    setQueueBusy(true);
    setQueueAction('joining');
    setStage('queue');
    setErrorMessage('');
    assignedGameId.current = null;
    queueCanceling.current = false;

    let activeSession = session;
    try {
      if (!activeSession) activeSession = await createGuestSession();
      await enqueuePlayer(activeSession, mode);
    } catch (error) {
      localStorage.removeItem('cr_queue');
      localStorage.removeItem('cr_queue_mode');
      setStage(activeSession ? 'lobby' : 'welcome');
      setErrorMessage(
        error instanceof ApiError && error.status === 403 && mode === 'ranked'
          ? 'Ranked matchmaking is only available to registered players.'
          : error instanceof Error
            ? error.message
            : `Could not join ${matchmakingModeName(mode)} matchmaking.`,
      );
    } finally {
      setQueueBusy(false);
      setQueueAction(null);
    }
  };

  const leaveQueue = async () => {
    if (queueCanceling.current) return;
    queueCanceling.current = true;
    setQueueBusy(true);
    setQueueAction('checking');

    try {
      if (session) {
        // The backend atomically decides whether cancellation or pair assignment won.
        const result = await leaveMatchmaking(queueModeRef.current, session.token);
        if (result.status === 'matched' && typeof result.game_id === 'string') {
          acceptAssignment(result.game_id, session);
          return;
        }
        if (result.status !== 'left') {
          throw new Error('The matchmaking server returned an unexpected cancellation response.');
        }
        if (assignedGameId.current) return;
      }

      localStorage.removeItem('cr_queue');
      localStorage.removeItem('cr_queue_mode');
      setStage('lobby');
      game.setNotice(`${matchmakingModeName(queueModeRef.current)} search cancelled.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not leave the queue.');
    } finally {
      queueCanceling.current = false;
      setQueueBusy(false);
      setQueueAction(null);
    }
  };

  // A status check also refreshes the backend queue lease after a page refresh.
  useEffect(() => {
    if (stage !== 'queue' || !session) return;

    let stopped = false;
    let timer: number | null = null;
    let nextDelay = 4_000;

    const pollQueue = async () => {
      if (queueCanceling.current) {
        timer = window.setTimeout(() => void pollQueue(), 500);
        return;
      }

      try {
        const response = await readMatchmakingStatus(queueMode, session.token);
        if (stopped) return;

        if (response.status === 'matched' && typeof response.game_id === 'string') {
          acceptAssignment(response.game_id, session);
          return;
        }

        if (response.status === 'idle') {
          game.setNotice(`Refreshing your ${matchmakingModeName(queueMode)} queue…`);
          const joined = await joinMatchmaking(queueMode, session.token);
          if (stopped) return;

          if (joined.status === 'matched' && typeof joined.game_id === 'string') {
            acceptAssignment(joined.game_id, session);
            return;
          }
          game.setNotice(`You’re back in the ${matchmakingModeName(queueMode)} queue.`);
        } else {
          game.setNotice(`Searching the ${matchmakingModeName(queueMode)} queue…`);
        }
        nextDelay = 4_000;
      } catch (error) {
        if (!stopped) {
          if (error instanceof ApiError && error.status === 403 && queueMode === 'ranked') {
            localStorage.removeItem('cr_queue');
            localStorage.removeItem('cr_queue_mode');
            setErrorMessage('Ranked matchmaking is only available to registered players.');
            setStage('lobby');
            return;
          }
          game.setNotice(error instanceof Error ? error.message : 'Checking matchmaking…');
          nextDelay = Math.min(15_000, Math.round(nextDelay * 1.6));
        }
      }

      if (!stopped) timer = window.setTimeout(() => void pollQueue(), nextDelay);
    };

    void pollQueue();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
    // Game callbacks use refs internally and do not restart the queue timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, session, queueMode]);

  return {
    queueMode,
    queueBusy,
    queueAction,
    restoreQueueMode,
    joinQueue: () => startMatchmaking('standard'),
    findMatch: (mode: MatchmakingMode) => startMatchmaking(mode),
    leaveQueue,
  };
}
