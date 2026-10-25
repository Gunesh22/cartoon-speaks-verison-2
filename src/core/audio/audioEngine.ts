import { AudioClip } from '../../types/timeline';
import { EditorAsset } from '../../types/assets';
import { getCachedObjectUrl } from '../assets/assetDb';

interface ActiveAudioNode {
  clipId: string;
  clipVolume: number;
  audio: HTMLAudioElement;
  startTimer: number | null;
  stopTimer: number | null;
  fadeTimer: number | null;
  cleanup?: () => void;
}

/**
 * Calculates instantaneous playback volume for an audio clip given elapsed clip time,
 * base clip volume, master volume, and optional fade envelopes.
 */
export function calculateClipVolume(
  clipTime: number,
  duration: number,
  baseVolume: number,
  masterVolume: number,
  fadeInSec: number = 0,
  fadeOutSec: number = 0
): number {
  const targetVol = Math.max(0, Math.min(1, baseVolume * masterVolume));
  if (duration <= 0 || targetVol <= 0) return 0;

  const fadeIn = Math.min(duration / 2, Math.max(0, fadeInSec));
  const fadeOut = Math.min(duration / 2, Math.max(0, fadeOutSec));

  let envelope = 1;
  if (fadeIn > 0 && clipTime < fadeIn) {
    envelope = Math.max(0, clipTime / fadeIn);
  } else if (fadeOut > 0 && clipTime > duration - fadeOut) {
    envelope = Math.max(0, (duration - clipTime) / fadeOut);
  }

  return Math.max(0, Math.min(1, targetVol * envelope));
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private activeNodes: ActiveAudioNode[] = [];
  private isPlaying: boolean = false;
  private playbackStartTimeMs: number = 0;
  private playheadAtStart: number = 0;
  private masterVolume: number = 1.0;

  constructor() {}

  private initContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        typeof window !== 'undefined'
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          : null;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
      }
    }
    return this.ctx!;
  }

  resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  async loadAudioBuffer(assetId: string, blob?: Blob, url?: string): Promise<AudioBuffer> {
    if (this.audioBuffers.has(assetId)) {
      return this.audioBuffers.get(assetId)!;
    }

    let arrayBuffer: ArrayBuffer;
    if (blob && typeof blob.arrayBuffer === 'function') {
      arrayBuffer = await blob.arrayBuffer();
    } else if (url) {
      const resp = await fetch(url);
      arrayBuffer = await resp.arrayBuffer();
    } else {
      throw new Error(`Asset ${assetId} has neither blob nor url`);
    }

    const OfflineCtx =
      typeof window !== 'undefined'
        ? window.OfflineAudioContext ||
          (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
        : null;

    if (OfflineCtx) {
      const decodeCtx = new OfflineCtx(1, 1, 44100);
      const buffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
      this.audioBuffers.set(assetId, buffer);
      return buffer;
    }

    const ctx = this.initContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.audioBuffers.set(assetId, buffer);
    return buffer;
  }

  preloadAudio(assetId: string, blob?: Blob, url?: string): void {
    if (this.audioBuffers.has(assetId)) return;
    this.loadAudioBuffer(assetId, blob, url).catch(() => {});
  }

  getAudioBuffer(assetId: string): AudioBuffer | null {
    return this.audioBuffers.get(assetId) || null;
  }

  removeAudioBuffer(assetId: string): void {
    this.audioBuffers.delete(assetId);
  }

  clearAudioBuffers(): void {
    this.audioBuffers.clear();
  }

  /**
   * Starts playback of all audio clips active from playheadTime.
   * Uses HTMLAudioElement for 100% reliable hardware audio playback across all browsers (including Brave).
   */
  async play(
    audioClips: AudioClip[],
    assets: Map<string, EditorAsset>,
    playheadTime: number,
    trackSettings?: {
      A1?: { volume?: number; muted?: boolean; solo?: boolean };
      A2?: { volume?: number; muted?: boolean; solo?: boolean };
    }
  ): Promise<void> {
    this.stop();
    this.isPlaying = true;
    this.playbackStartTimeMs = performance.now();
    this.playheadAtStart = playheadTime;

    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return;
    }

    const hasSolo = !!(trackSettings?.A1?.solo || trackSettings?.A2?.solo);

    for (const clip of audioClips) {
      const asset = assets.get(clip.assetId);
      if (!asset) continue;

      const trackId = clip.trackId || 'A1';
      const conf = trackSettings?.[trackId];
      if (hasSolo) {
        if (!conf?.solo) continue;
      } else if (conf?.muted) {
        continue;
      }

      const clipEnd = clip.start + clip.duration;
      // Skip clips that have already completed before current playhead
      if (clipEnd <= playheadTime) continue;

      const audioUrl = asset.url || (asset.blob ? getCachedObjectUrl(asset.id, asset.blob) : null);
      if (!audioUrl) continue;

      const trackVol = conf?.volume ?? 1.0;
      const clipVolume = (clip.volume ?? 1) * trackVol;

      const audio = new Audio(audioUrl);
      const initialClipTime = playheadTime >= clip.start ? playheadTime - clip.start : 0;
      audio.volume = calculateClipVolume(
        initialClipTime,
        clip.duration,
        clipVolume,
        this.masterVolume,
        clip.fadeIn,
        clip.fadeOut
      );

      const node: ActiveAudioNode = {
        clipId: clip.id,
        clipVolume,
        audio,
        startTimer: null,
        stopTimer: null,
        fadeTimer: null,
      };

      if (playheadTime >= clip.start) {
        // Playhead is currently inside the clip
        const timeIntoClip = playheadTime - clip.start;
        const sourceOffset = Math.max(0, (clip.trimStart || 0) + timeIntoClip);
        const remainingDuration = Math.max(0, clip.duration - timeIntoClip);

        if (remainingDuration > 0) {
          const startPlayback = () => {
            if (!this.isPlaying) {
              audio.pause();
              return;
            }
            try {
              if (sourceOffset > 0 && Number.isFinite(sourceOffset)) {
                audio.currentTime = sourceOffset;
              }
            } catch (_) {}

            const initialVol = calculateClipVolume(
              timeIntoClip,
              clip.duration,
              clipVolume,
              this.masterVolume,
              clip.fadeIn,
              clip.fadeOut
            );
            audio.volume = initialVol;

            if ((clip.fadeIn && clip.fadeIn > 0) || (clip.fadeOut && clip.fadeOut > 0)) {
              const playbackStartPerf = performance.now();
              const timer = (typeof window !== 'undefined' ? window : (globalThis as any)).setInterval(() => {
                if (!this.isPlaying) return;
                const elapsedSec = (performance.now() - playbackStartPerf) / 1000;
                const currentClipTime = timeIntoClip + elapsedSec;
                audio.volume = calculateClipVolume(
                  currentClipTime,
                  clip.duration,
                  clipVolume,
                  this.masterVolume,
                  clip.fadeIn,
                  clip.fadeOut
                );
              }, 50);
              node.fadeTimer = timer as unknown as number;
            }

            audio.play().catch((err) => {
              if (err instanceof Error && err.name === 'AbortError') return;
              console.warn(`Audio play error for clip ${clip.id}:`, err);
            });

            node.stopTimer = window.setTimeout(() => {
              if (node.fadeTimer !== null) {
                if (typeof window !== 'undefined') window.clearInterval(node.fadeTimer);
                else clearInterval(node.fadeTimer);
                node.fadeTimer = null;
              }
              audio.pause();
              node.stopTimer = null;
            }, remainingDuration * 1000);
          };

          if (audio.readyState >= 1) {
            startPlayback();
          } else {
            let triggered = false;
            const onReady = () => {
              if (triggered) return;
              triggered = true;
              audio.removeEventListener('loadedmetadata', onReady);
              audio.removeEventListener('canplay', onReady);
              node.cleanup = undefined;
              startPlayback();
            };
            node.cleanup = () => {
              audio.removeEventListener('loadedmetadata', onReady);
              audio.removeEventListener('canplay', onReady);
            };
            audio.addEventListener('loadedmetadata', onReady);
            audio.addEventListener('canplay', onReady);
            audio.load();
          }

          this.activeNodes.push(node);
        }
      } else {
        // Clip starts in the future
        const delayMs = (clip.start - playheadTime) * 1000;
        const sourceOffset = Math.max(0, clip.trimStart || 0);
        const clipDurationMs = clip.duration * 1000;

        node.startTimer = window.setTimeout(() => {
          node.startTimer = null;
          if (!this.isPlaying) return;

          const startPlayback = () => {
            if (!this.isPlaying) {
              audio.pause();
              return;
            }
            try {
              if (sourceOffset > 0 && Number.isFinite(sourceOffset)) {
                audio.currentTime = sourceOffset;
              }
            } catch (_) {}

            const initialVol = calculateClipVolume(
              0,
              clip.duration,
              clipVolume,
              this.masterVolume,
              clip.fadeIn,
              clip.fadeOut
            );
            audio.volume = initialVol;

            if ((clip.fadeIn && clip.fadeIn > 0) || (clip.fadeOut && clip.fadeOut > 0)) {
              const playbackStartPerf = performance.now();
              const timer = (typeof window !== 'undefined' ? window : (globalThis as any)).setInterval(() => {
                if (!this.isPlaying) return;
                const elapsedSec = (performance.now() - playbackStartPerf) / 1000;
                const currentClipTime = elapsedSec;
                audio.volume = calculateClipVolume(
                  currentClipTime,
                  clip.duration,
                  clipVolume,
                  this.masterVolume,
                  clip.fadeIn,
                  clip.fadeOut
                );
              }, 50);
              node.fadeTimer = timer as unknown as number;
            }

            audio.play().catch((err) => {
              if (err instanceof Error && err.name === 'AbortError') return;
              console.warn(`Audio play error for clip ${clip.id}:`, err);
            });

            node.stopTimer = window.setTimeout(() => {
              if (node.fadeTimer !== null) {
                if (typeof window !== 'undefined') window.clearInterval(node.fadeTimer);
                else clearInterval(node.fadeTimer);
                node.fadeTimer = null;
              }
              audio.pause();
              node.stopTimer = null;
            }, clipDurationMs);
          };

          if (audio.readyState >= 1) {
            startPlayback();
          } else {
            let triggered = false;
            const onReady = () => {
              if (triggered) return;
              triggered = true;
              audio.removeEventListener('loadedmetadata', onReady);
              audio.removeEventListener('canplay', onReady);
              node.cleanup = undefined;
              startPlayback();
            };
            node.cleanup = () => {
              audio.removeEventListener('loadedmetadata', onReady);
              audio.removeEventListener('canplay', onReady);
            };
            audio.addEventListener('loadedmetadata', onReady);
            audio.addEventListener('canplay', onReady);
            audio.load();
          }
        }, delayMs);

        this.activeNodes.push(node);
      }
    }
  }

  stop(): void {
    this.isPlaying = false;
    for (const node of this.activeNodes) {
      if (node.cleanup) {
        node.cleanup();
        node.cleanup = undefined;
      }
      if (node.startTimer !== null) {
        if (typeof window !== 'undefined') window.clearTimeout(node.startTimer);
        else clearTimeout(node.startTimer);
        node.startTimer = null;
      }
      if (node.stopTimer !== null) {
        if (typeof window !== 'undefined') window.clearTimeout(node.stopTimer);
        else clearTimeout(node.stopTimer);
        node.stopTimer = null;
      }
      if (node.fadeTimer !== null) {
        if (typeof window !== 'undefined') window.clearInterval(node.fadeTimer);
        else clearInterval(node.fadeTimer);
        node.fadeTimer = null;
      }
      try {
        node.audio.pause();
        node.audio.currentTime = 0;
      } catch (_) {}
    }
    this.activeNodes = [];
  }

  getCurrentPlayheadTime(): number | null {
    if (!this.isPlaying) return null;
    const elapsed = (performance.now() - this.playbackStartTimeMs) / 1000;
    return this.playheadAtStart + elapsed;
  }

  setMasterVolume(val: number): void {
    this.masterVolume = Math.max(0, Math.min(1, val));
    for (const node of this.activeNodes) {
      node.audio.volume = Math.max(0, Math.min(1, node.clipVolume * this.masterVolume));
    }
  }
}

export const audioEngine = new AudioEngine();
