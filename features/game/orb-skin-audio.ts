import { isSafeOrbSkinAssetUrl } from './orb-skins';

const DEFAULT_VOLUME = 0.22;

/** Reuse one audio element per versioned backend URL rather than fetching per wave. */
const audioByUrl = new Map<string, HTMLAudioElement>();
let audioUnlocked = false;

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

function getAudio(url: string | undefined): HTMLAudioElement | null {
  if (!url || !isSafeOrbSkinAssetUrl(url)) return null;
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  const cached = audioByUrl.get(url);
  if (cached) return cached;

  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.volume = DEFAULT_VOLUME;
  audioByUrl.set(url, audio);
  audio.load();
  if (audioUnlocked) primeMutedAudio(audio);
  return audio;
}

/** Preload the cue from the same backend skin manifest as the orb visuals. */
export function preloadOrbSkinCollisionSound(url: string | undefined): void {
  getAudio(url);
}

/** Prime cached sounds during the first user gesture for browser autoplay compatibility. */
export function unlockOrbSkinAudio(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;

  for (const audio of audioByUrl.values()) primeMutedAudio(audio);
}

type PlayResult = 'played' | 'blocked' | 'unavailable';

async function playOnce(audio: HTMLAudioElement): Promise<PlayResult> {
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // The browser may not have loaded enough metadata to seek yet; playback can still proceed.
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

/** Play the actor skin's one-shot cue; use Classic only if that media asset is unavailable. */
export async function playOrbSkinCollisionSound(
  skinSoundUrl: string | undefined,
  classicSoundUrl: string | undefined,
): Promise<void> {
  const selectedUrl = isSafeOrbSkinAssetUrl(skinSoundUrl) ? skinSoundUrl : classicSoundUrl;
  const selectedAudio = getAudio(selectedUrl);
  if (!selectedAudio) return;

  const result = await playOnce(selectedAudio);
  if (
    result !== 'unavailable' ||
    !classicSoundUrl ||
    selectedUrl === classicSoundUrl
  ) return;

  const classicAudio = getAudio(classicSoundUrl);
  if (classicAudio) await playOnce(classicAudio);
}
