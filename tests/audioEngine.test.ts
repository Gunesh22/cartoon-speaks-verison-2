import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { audioEngine } from '../src/core/audio/audioEngine';
import { AudioClip } from '../src/types/timeline';
import { EditorAsset } from '../src/types/assets';

describe('AudioEngine Playback & Event Deduplication (BUG-01)', () => {
  let originalWindow: typeof window;
  let originalAudio: typeof Audio;

  class MockAudio {
    currentTime = 0;
    volume = 1;
    readyState = 0;
    src: string;
    private listeners: Record<string, Array<() => void>> = {};
    playCount = 0;
    pauseCount = 0;

    constructor(src: string) {
      this.src = src;
    }

    addEventListener(event: string, cb: () => void, _options?: unknown) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(cb);
    }

    removeEventListener(event: string, cb: () => void) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((l) => l !== cb);
      }
    }

    trigger(event: string) {
      const cbs = [...(this.listeners[event] || [])];
      for (const cb of cbs) cb();
    }

    load() {}

    async play() {
      this.playCount++;
      return Promise.resolve();
    }

    pause() {
      this.pauseCount++;
    }
  }

  let createdInstances: MockAudio[] = [];
  let clearedTimeoutIds: any[] = [];
  let scheduledTimeouts: any[] = [];

  beforeEach(() => {
    createdInstances = [];
    clearedTimeoutIds = [];
    scheduledTimeouts = [];
    originalWindow = (globalThis as any).window;
    originalAudio = (globalThis as any).Audio;

    const mockWindow = {
      setTimeout: (fn: () => void, ms: number) => {
        const id = setTimeout(fn, ms);
        scheduledTimeouts.push(id);
        return id;
      },
      clearTimeout: (id: any) => {
        clearedTimeoutIds.push(id);
        clearTimeout(id);
      },
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).Audio = class extends MockAudio {
      constructor(src: string) {
        super(src);
        createdInstances.push(this);
      }
    };
  });

  afterEach(() => {
    audioEngine.stop();
    (globalThis as any).window = originalWindow;
    (globalThis as any).Audio = originalAudio;
  });

  it('triggers startPlayback only once even when both loadedmetadata and canplay fire sequentially', async () => {
    const clip: AudioClip = {
      id: 'clip_1',
      assetId: 'asset_1',
      start: 0,
      duration: 5.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 5.0,
    };

    const assets = new Map<string, EditorAsset>([
      [
        'asset_1',
        {
          id: 'asset_1',
          name: 'voice.wav',
          type: 'audio',
          mimeType: 'audio/wav',
          blob: new Blob([]),
          url: 'blob:http://localhost/test',
          duration: 5.0,
          createdAt: Date.now(),
        },
      ],
    ]);

    await audioEngine.play([clip], assets, 0);

    expect(createdInstances.length).toBe(1);
    const audio = createdInstances[0];

    // Simulate browser firing loadedmetadata first
    audio.trigger('loadedmetadata');
    expect(audio.playCount).toBe(1);

    // Simulate browser subsequently firing canplay
    audio.trigger('canplay');
    // Crucial check: playCount must still be 1 (no double trigger/stutter)
    expect(audio.playCount).toBe(1);
  });

  it('cleans up pending event listeners and stops audio immediately when stop() is called before metadata loads', async () => {
    const clip: AudioClip = {
      id: 'clip_2',
      assetId: 'asset_2',
      start: 0,
      duration: 3.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 3.0,
    };

    const assets = new Map<string, EditorAsset>([
      [
        'asset_2',
        {
          id: 'asset_2',
          name: 'delayed.wav',
          type: 'audio',
          mimeType: 'audio/wav',
          blob: new Blob([]),
          url: 'blob:http://localhost/delayed',
          duration: 3.0,
          createdAt: Date.now(),
        },
      ],
    ]);

    await audioEngine.play([clip], assets, 0);
    const audio = createdInstances[0];

    // User stops before audio has finished loading
    audioEngine.stop();

    // Now metadata fires late
    audio.trigger('loadedmetadata');
    audio.trigger('canplay');

    // Must NOT have started playing late
    expect(audio.playCount).toBe(0);
  });

  it('explicitly cancels stopTimer via clearTimeout when stop() is called during active playback', async () => {
    const clip: AudioClip = {
      id: 'clip_3',
      assetId: 'asset_3',
      start: 0,
      duration: 4.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 4.0,
    };

    const assets = new Map<string, EditorAsset>([
      [
        'asset_3',
        {
          id: 'asset_3',
          name: 'active.wav',
          type: 'audio',
          mimeType: 'audio/wav',
          blob: new Blob([]),
          url: 'blob:http://localhost/active',
          duration: 4.0,
          createdAt: Date.now(),
        },
      ],
    ]);

    await audioEngine.play([clip], assets, 0);
    const audio = createdInstances[0];

    // Trigger ready
    audio.trigger('canplay');
    expect(audio.playCount).toBe(1);
    expect(scheduledTimeouts.length).toBeGreaterThanOrEqual(1);

    const activeStopTimerId = scheduledTimeouts[scheduledTimeouts.length - 1];

    // User stops playback while audio is active
    audioEngine.stop();

    // Verify clearTimeout was specifically called on the stopTimer ID
    expect(clearedTimeoutIds).toContain(activeStopTimerId);
    expect(audio.pauseCount).toBeGreaterThanOrEqual(1);
  });

  it('explicitly cancels startTimer via clearTimeout when stop() is called before a future clip begins', async () => {
    const clip: AudioClip = {
      id: 'clip_future',
      assetId: 'asset_future',
      start: 5.0, // Starts at 5s into timeline
      duration: 2.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 2.0,
    };

    const assets = new Map<string, EditorAsset>([
      [
        'asset_future',
        {
          id: 'asset_future',
          name: 'future.wav',
          type: 'audio',
          mimeType: 'audio/wav',
          blob: new Blob([]),
          url: 'blob:http://localhost/future',
          duration: 2.0,
          createdAt: Date.now(),
        },
      ],
    ]);

    // Playhead is at 0, clip is scheduled 5 seconds in future
    await audioEngine.play([clip], assets, 0);
    expect(scheduledTimeouts.length).toBeGreaterThanOrEqual(1);
    const activeStartTimerId = scheduledTimeouts[scheduledTimeouts.length - 1];

    // Stop before future timer fires
    audioEngine.stop();

    // Verify clearTimeout was called on the startTimer ID
    expect(clearedTimeoutIds).toContain(activeStartTimerId);
  });

  it('reuses cached object URL for blob assets without leaking new URLs on repeated playback (BUG-04)', async () => {
    let createObjectURLCount = 0;
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((_blob: Blob) => {
      createObjectURLCount++;
      return `blob:http://localhost/mock-blob-${createObjectURLCount}`;
    });

    try {
      const clip: AudioClip = {
        id: 'clip_blob',
        assetId: 'asset_blob_1',
        start: 0,
        duration: 3.0,
        volume: 1.0,
        trimStart: 0,
        trimEnd: 3.0,
      };

      const blobAsset: EditorAsset = {
        id: 'asset_blob_1',
        name: 'voice.wav',
        type: 'audio',
        mimeType: 'audio/wav',
        blob: new Blob(['dummy audio content']),
        url: '', // empty so it resolves via getCachedObjectUrl(id, blob)
        duration: 3.0,
        createdAt: Date.now(),
      };

      const assets = new Map<string, EditorAsset>([['asset_blob_1', blobAsset]]);

      // Play 1st time
      await audioEngine.play([clip], assets, 0);
      expect(createdInstances.length).toBe(1);
      const firstUrl = createdInstances[0].src;
      expect(firstUrl).toContain('mock-blob-1');
      expect(createObjectURLCount).toBe(1);

      audioEngine.stop();

      // Play 2nd time
      await audioEngine.play([clip], assets, 0);
      expect(createdInstances.length).toBe(2);
      const secondUrl = createdInstances[1].src;
      // Must reuse the exact same cached URL, createObjectURLCount must NOT increase
      expect(secondUrl).toBe(firstUrl);
      expect(createObjectURLCount).toBe(1);

      audioEngine.stop();

      // Play 3rd time
      await audioEngine.play([clip], assets, 0);
      expect(createdInstances.length).toBe(3);
      expect(createdInstances[2].src).toBe(firstUrl);
      expect(createObjectURLCount).toBe(1);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
