import { AudioClip } from '../../types/timeline';
import { EditorAsset } from '../../types/assets';

interface ActiveAudioNode {
  clipId: string;
  clipVolume: number;
  audio: HTMLAudioElement;
  startTimer: number | null;
  stopTimer: number | null;
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

  /**
   * Starts playback of all audio clips active from playheadTime.
   * Uses HTMLAudioElement for 100% reliable hardware audio playback across all browsers (including Brave).
   */
  async play(
    audioClips: AudioClip[],
    assets: Map<string, EditorAsset>,
    playheadTime: number
  ): Promise<void> {
    this.stop();
    this.isPlaying = true;
    this.playbackStartTimeMs = performance.now();
    this.playheadAtStart = playheadTime;

    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return;
    }

    for (const clip of audioClips) {
      const asset = assets.get(clip.assetId);
      if (!asset) continue;

      const clipEnd = clip.start + clip.duration;
      // Skip clips that have already completed before current playhead
      if (clipEnd <= playheadTime) continue;

      const audioUrl = asset.url || (asset.blob ? URL.createObjectURL(asset.blob) : null);
      if (!audioUrl) continue;

      const audio = new Audio(audioUrl);
      audio.volume = Math.max(0, Math.min(1, (clip.volume ?? 1) * this.masterVolume));

      let startTimer: number | null = null;
      let stopTimer: number | null = null;

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
            audio.play().catch((err) => console.warn(`Audio play error for clip ${clip.id}:`, err));

            stopTimer = window.setTimeout(() => {
              audio.pause();
            }, remainingDuration * 1000);
          };

          if (audio.readyState >= 1) {
            startPlayback();
          } else {
            audio.addEventListener('loadedmetadata', startPlayback, { once: true });
            audio.addEventListener('canplay', startPlayback, { once: true });
            audio.load();
          }
        }
      } else {
        // Clip starts in the future
        const delayMs = (clip.start - playheadTime) * 1000;
        const sourceOffset = Math.max(0, clip.trimStart || 0);
        const clipDurationMs = clip.duration * 1000;

        startTimer = window.setTimeout(() => {
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
            audio.play().catch((err) => console.warn(`Audio play error for clip ${clip.id}:`, err));

            stopTimer = window.setTimeout(() => {
              audio.pause();
            }, clipDurationMs);
          };

          if (audio.readyState >= 1) {
            startPlayback();
          } else {
            audio.addEventListener('loadedmetadata', startPlayback, { once: true });
            audio.addEventListener('canplay', startPlayback, { once: true });
            audio.load();
          }
        }, delayMs);
      }

      const clipVolume = clip.volume ?? 1;
      this.activeNodes.push({
        clipId: clip.id,
        clipVolume,
        audio,
        startTimer,
        stopTimer,
      });
    }
  }

  stop(): void {
    this.isPlaying = false;
    for (const node of this.activeNodes) {
      if (node.startTimer !== null) {
        clearTimeout(node.startTimer);
        node.startTimer = null;
      }
      if (node.stopTimer !== null) {
        clearTimeout(node.stopTimer);
        node.stopTimer = null;
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
