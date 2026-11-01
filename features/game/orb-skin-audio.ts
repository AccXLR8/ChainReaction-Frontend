import { DEFAULT_ORB_SKIN_ASSET_KEY } from './orb-skins';

const COLLISION_SOUND_FILE = 'collision.mp3';
const SKIN_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const DEFAULT_VOLUME = 0.22;

/** One reusable browser audio element per skin; assets follow the orb-skin folder convention. */
const audioBySkin = new Map<string, HTMLAudioElement>();
let audioUnlocked = false;

function normalizeAssetKey(assetKey: string): string {
  return SKIN_KEY_PATTERN.test(assetKey) ? assetKey : DEFAULT_ORB_SKIN_ASSET_KEY;
}

function primeMutedAudio(audio: HTMLAudioElement): void {
  const wasMuted = audio.muted;
  audio.muted = true;

  try {
    void audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = wasMuted;
      })
      .catch(() => {
        audio.muted = wasMuted;
      });
  } catch {
    audio.muted = wasMuted;
  }
}

function getSkinAudio(assetKey: string): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  const key = normalizeAssetKey(assetKey);
  const cached = audioBySkin.get(key);
  if (cached) return cached;

  const audio = new Audio(`/orb-skins/${key}/${COLLISION_SOUND_FILE}`);
  audio.preload = 'auto';
  audio.volume = DEFAULT_VOLUME;
  audioBySkin.set(key, audio);
  audio.load();
  if (audioUnlocked) primeMutedAudio(audio);
  return audio;
}

/** Begin loading a skin's one-shot cue before a reaction needs to play it. */
export function preloadOrbSkinCollisionSound(assetKey: string): void {
  getSkinAudio(assetKey);
}

/** Prime cached sounds during the first user gesture to satisfy browser playback rules. */
export function unlockOrbSkinAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;

  for (const audio of audioBySkin.values()) primeMutedAudio(audio);
}

type PlayResult = 'played' | 'blocked' | 'unavailable';

async function playOnce(audio: HTMLAudioElement): Promise<PlayResult> {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // The browser may not have loaded enough metadata to seek yet; play can still proceed.
  }

  try {
    await audio.play();
    return 'played';
  } catch (error) {
    const name = typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : '';
    if (name === 'NotAllowedError' || name === 'AbortError') return 'blocked';
    return 'unavailable';
  }
}

/** Play one collision cue for a reaction step, falling back to Classic if needed. */
export async function playOrbSkinCollisionSound(assetKey: string): Promise<void> {
  const key = normalizeAssetKey(assetKey);
  const selectedAudio = getSkinAudio(key);
  if (!selectedAudio) return;

  const result = await playOnce(selectedAudio);
  if (result !== 'unavailable' || key === DEFAULT_ORB_SKIN_ASSET_KEY) return;

  const classicAudio = getSkinAudio(DEFAULT_ORB_SKIN_ASSET_KEY);
  if (classicAudio) await playOnce(classicAudio);
}
