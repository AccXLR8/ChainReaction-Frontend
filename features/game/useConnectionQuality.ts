'use client';

import { useRef, useState } from 'react';
import type { LatencyQuality } from './LatencyIndicator';

const PING_TIMEOUT_MS = 15_000;
const LATENCY_SAMPLE_COUNT = 3;

/** Measures WebSocket round-trip time and smooths recent replies for the game HUD. */
export function useConnectionQuality() {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyQuality, setLatencyQuality] = useState<LatencyQuality>('offline');

  const pendingPingRef = useRef<{ id: string; sentAt: number } | null>(null);
  const pingSequenceRef = useRef(0);
  const missedPingsRef = useRef(0);
  const latencySamplesRef = useRef<number[]>([]);
  // An id-less legacy PONG is only attributable before any ping has timed out.
  const legacyPongSafeRef = useRef(true);

  const reset = (quality: LatencyQuality) => {
    pendingPingRef.current = null;
    missedPingsRef.current = 0;
    latencySamplesRef.current = [];
    legacyPongSafeRef.current = true;
    setLatencyMs(null);
    setLatencyQuality(quality);
  };

  const markPingMissed = () => {
    pendingPingRef.current = null;
    missedPingsRef.current += 1;
    legacyPongSafeRef.current = false;
    if (missedPingsRef.current >= 2) {
      setLatencyMs(null);
      setLatencyQuality('poor');
    }
  };

  /** Send only when no recent ping is still outstanding on this socket. */
  const sendPing = (
    socket: WebSocket,
    gameId: string | null,
    isCurrentSocket: () => boolean,
  ) => {
    if (!isCurrentSocket() || socket.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    const pending = pendingPingRef.current;
    if (pending) {
      if (now - pending.sentAt < PING_TIMEOUT_MS) return;
      markPingMissed();
    }

    const pingId = `${gameId ?? 'game'}-${++pingSequenceRef.current}`;
    pendingPingRef.current = { id: pingId, sentAt: now };
    try {
      socket.send(JSON.stringify({ type: 'PING', payload: { ping_id: pingId } }));
    } catch {
      // The socket close handler owns connection state; ping failures do not affect play.
    }
  };

  /** Accept a matching PONG and ignore stale, unrelated, or unsafe legacy replies. */
  const recordPong = (payload: unknown) => {
    const pending = pendingPingRef.current;
    if (!pending || typeof payload !== 'object' || payload === null) return;

    const pong = payload as { ping_id?: unknown };
    const hasPingId = Object.prototype.hasOwnProperty.call(pong, 'ping_id');
    if (hasPingId ? pong.ping_id !== pending.id : !legacyPongSafeRef.current) return;

    const now = performance.now();
    if (now - pending.sentAt >= PING_TIMEOUT_MS) {
      markPingMissed();
      return;
    }

    pendingPingRef.current = null;
    missedPingsRef.current = 0;
    const sample = Math.max(0, Math.round(now - pending.sentAt));
    const samples = [...latencySamplesRef.current, sample].slice(-LATENCY_SAMPLE_COUNT);
    latencySamplesRef.current = samples;

    const sortedSamples = [...samples].sort((left, right) => left - right);
    const middle = Math.floor(sortedSamples.length / 2);
    const median = sortedSamples.length % 2 === 1
      ? sortedSamples[middle]
      : Math.round((sortedSamples[middle - 1] + sortedSamples[middle]) / 2);

    setLatencyMs(median);
    setLatencyQuality(median <= 150 ? 'good' : median <= 300 ? 'fair' : 'poor');
  };

  return { latencyMs, latencyQuality, reset, sendPing, recordPong };
}
