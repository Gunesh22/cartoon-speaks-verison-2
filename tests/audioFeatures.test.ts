import { describe, it, expect, vi } from 'vitest';
import { mixProjectAudio } from '../src/core/export/videoExporter';
import { calculateClipVolume, audioEngine } from '../src/core/audio/audioEngine';
import { createDefaultProject } from '../src/types/project';
import { AudioClip } from '../src/types/timeline';

describe('Audio Features & Envelopes (Feature 04 & Feature 09)', () => {
  it('applies linear audio fade-in and fade-out ramps in export mixing (Feature 09)', async () => {
    const proj = createDefaultProject('Fade Test');
    proj.duration = 10;

    const clipWithFades: AudioClip = {
      id: 'clip_fades',
      assetId: 'audio_1',
      start: 1.0,
      duration: 6.0,
      volume: 0.8,
      trimStart: 0,
      trimEnd: 6.0,
      fadeIn: 1.5,
      fadeOut: 2.0,
    };

    proj.audioClips = [clipWithFades];

    const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
    const origOfflineCtx = targetGlobal.OfflineAudioContext;

    const setValues: Array<{ val: number; time: number }> = [];
    const linearRamps: Array<{ val: number; time: number }> = [];

    targetGlobal.OfflineAudioContext = class {
      destination = {};
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime: (val: number, time: number) => {
              setValues.push({ val, time });
            },
            linearRampToValueAtTime: (val: number, time: number) => {
              linearRamps.push({ val, time });
            },
          },
          connect: () => {},
        };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect: () => {},
          start: () => {},
        };
      }
      async startRendering() {
        return { duration: 10 } as any;
      }
    };

    const mockAssets = new Map<string, any>([
      ['audio_1', { id: 'audio_1', name: 'audio.wav', type: 'audio', url: 'blob:mock' }],
    ]);

    const { audioEngine } = await import('../src/core/audio/audioEngine');
    const origLoad = audioEngine.loadAudioBuffer;
    audioEngine.loadAudioBuffer = async () => ({ duration: 8 } as any);

    try {
      await mixProjectAudio(proj, mockAssets, 44100);

      // Fade in starts at 1.0s with volume 0, ramps to 0.8 at 1.0 + 1.5 = 2.5s
      expect(setValues.some((s) => s.val === 0 && s.time === 1.0)).toBe(true);
      expect(linearRamps.some((r) => r.val === 0.8 && r.time === 2.5)).toBe(true);

      // Fade out starts at (1.0 + 6.0 - 2.0) = 5.0s, ramps to 0 at 7.0s
      expect(setValues.some((s) => s.val === 0.8 && s.time === 5.0)).toBe(true);
      expect(linearRamps.some((r) => r.val === 0 && r.time === 7.0)).toBe(true);
    } finally {
      targetGlobal.OfflineAudioContext = origOfflineCtx;
      audioEngine.loadAudioBuffer = origLoad;
    }
  });

  it('clamps overlapping fades on short clips to maximum half duration (Feature 09)', async () => {
    const proj = createDefaultProject('Short Fade Test');
    proj.duration = 5;

    // 2-second clip with 5-second requested fades (must be clamped to max 1.0s each)
    const shortClip: AudioClip = {
      id: 'short_clip',
      assetId: 'audio_short',
      start: 0,
      duration: 2.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 2.0,
      fadeIn: 5.0, // Excessive
      fadeOut: 5.0, // Excessive
    };

    proj.audioClips = [shortClip];

    const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
    const origOfflineCtx = targetGlobal.OfflineAudioContext;

    const linearRamps: Array<{ val: number; time: number }> = [];

    targetGlobal.OfflineAudioContext = class {
      destination = {};
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime: () => {},
            linearRampToValueAtTime: (val: number, time: number) => {
              linearRamps.push({ val, time });
            },
          },
          connect: () => {},
        };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect: () => {},
          start: () => {},
        };
      }
      async startRendering() {
        return { duration: 5 } as any;
      }
    };

    const mockAssets = new Map<string, any>([
      ['audio_short', { id: 'audio_short', name: 's.wav', type: 'audio', url: 'blob:s' }],
    ]);

    const { audioEngine } = await import('../src/core/audio/audioEngine');
    const origLoad = audioEngine.loadAudioBuffer;
    audioEngine.loadAudioBuffer = async () => ({ duration: 5 } as any);

    try {
      await mixProjectAudio(proj, mockAssets, 44100);

      // Fade-in ramp must be clamped to start (0) + duration/2 (1.0s) = 1.0s, NOT 5.0s!
      expect(linearRamps[0].time).toBe(1.0);
      // Fade-out ramp completes at 2.0s
      expect(linearRamps[1].time).toBe(2.0);
    } finally {
      targetGlobal.OfflineAudioContext = origOfflineCtx;
      audioEngine.loadAudioBuffer = origLoad;
    }
  });

  it('calculates instantaneous playback volume with fade-in and fade-out envelopes (Feature 09)', () => {
    // 10s clip with 2s fade-in and 2s fade-out, base volume 0.8, master 1.0
    const duration = 10.0;
    const baseVol = 0.8;
    const masterVol = 1.0;
    const fadeIn = 2.0;
    const fadeOut = 2.0;

    // At t=0, volume must be 0
    expect(calculateClipVolume(0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBe(0);

    // At t=1.0 (halfway through fade-in), volume must be 0.4
    expect(calculateClipVolume(1.0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBeCloseTo(0.4, 4);

    // At t=2.0 (end of fade-in), volume reaches target 0.8
    expect(calculateClipVolume(2.0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBeCloseTo(0.8, 4);

    // At t=5.0 (sustain region), volume is constant 0.8
    expect(calculateClipVolume(5.0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBeCloseTo(0.8, 4);

    // At t=9.0 (1s remaining in 2s fade-out), volume is 0.4
    expect(calculateClipVolume(9.0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBeCloseTo(0.4, 4);

    // At t=10.0 (end of clip), volume is 0
    expect(calculateClipVolume(10.0, duration, baseVol, masterVol, fadeIn, fadeOut)).toBe(0);

    // Clamping: fade-in exceeding duration/2 is safely capped
    const shortVol = calculateClipVolume(1.0, 2.0, 1.0, 1.0, 5.0, 5.0);
    expect(shortVol).toBeCloseTo(1.0, 4);
  });

  it('manages audio buffer cache eviction in audioEngine (Feature 06)', () => {
    const mockBuffer = { duration: 5 } as AudioBuffer;
    (audioEngine as any).audioBuffers.set('test_asset', mockBuffer);
    expect(audioEngine.getAudioBuffer('test_asset')).toBe(mockBuffer);

    audioEngine.removeAudioBuffer('test_asset');
    expect(audioEngine.getAudioBuffer('test_asset')).toBeNull();

    (audioEngine as any).audioBuffers.set('test_1', mockBuffer);
    (audioEngine as any).audioBuffers.set('test_2', mockBuffer);
    audioEngine.clearAudioBuffers();
    expect(audioEngine.getAudioBuffer('test_1')).toBeNull();
    expect(audioEngine.getAudioBuffer('test_2')).toBeNull();
  });
});
