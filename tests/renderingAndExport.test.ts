import { describe, it, expect } from 'vitest';
import {
  exportProjectToJson,
  validateProjectJson,
  findMissingAssets,
} from '../src/core/project/projectManager';
import { calculateExportDimensions, mixProjectAudio } from '../src/core/export/videoExporter';
import { createDefaultProject } from '../src/types/project';
import { VisualClip } from '../src/types/timeline';

describe('Rendering, Project Persistence and Export Preparation Tests', () => {
  it('serializes project to JSON and includes referenced asset IDs', () => {
    const project = createDefaultProject('Test Proj');
    const clip: VisualClip = {
      id: 'c1',
      assetId: 'asset_char_1',
      start: 0,
      duration: 5,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'lipSync',
      lipSyncData: {
        characterAssetId: 'asset_char_1',
        audioAssetId: 'asset_audio_1',
        mouthSetId: 'mouth_1',
        cues: [],
        mouthAnchor: { x: 0.5, y: 0.5 },
        mouthScale: 0.25,
      },
    };

    project.tracks[0].clips.push(clip);

    const jsonStr = exportProjectToJson(project);
    expect(jsonStr).toContain('Test Proj');
    expect(jsonStr).toContain('asset_char_1');
    expect(jsonStr).toContain('asset_audio_1');

    const parsed = JSON.parse(jsonStr);
    expect(parsed.referencedAssetIds).toContain('asset_char_1');
    expect(parsed.referencedAssetIds).toContain('asset_audio_1');
  });

  it('validates project JSON and handles corrupt data gracefully', () => {
    expect(validateProjectJson(null).valid).toBe(false);
    expect(validateProjectJson('not an object').valid).toBe(false);
    expect(validateProjectJson({ name: 'incomplete' }).valid).toBe(false);

    const validProject = createDefaultProject('Valid Project');
    const result = validateProjectJson(validProject);
    expect(result.valid).toBe(true);
    expect(result.project?.name).toBe('Valid Project');
    expect(result.project?.tracks.length).toBe(4);
  });

  it('identifies missing assets when project references assets not present in local store', () => {
    const project = createDefaultProject('Missing Test');
    project.tracks[0].clips.push({
      id: 'c1',
      assetId: 'missing_image_1',
      start: 0,
      duration: 3,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    const availableIds = new Set(['existing_image_1', 'existing_audio_1']);
    const missing = findMissingAssets(project, availableIds);

    expect(missing).toEqual(['missing_image_1']);
  });

  it('preserves 16:9, 9:16 portrait, and 1:1 square aspect ratios on export', () => {
    // 16:9 Landscape 1920x1080
    const land1080 = calculateExportDimensions(1920, 1080, '1080p');
    expect(land1080).toEqual({ targetWidth: 1920, targetHeight: 1080 });

    const land720 = calculateExportDimensions(1920, 1080, '720p');
    expect(land720).toEqual({ targetWidth: 1280, targetHeight: 720 });

    // 9:16 Portrait 1080x1920
    const port1080 = calculateExportDimensions(1080, 1920, '1080p');
    expect(port1080).toEqual({ targetWidth: 1080, targetHeight: 1920 });

    const port720 = calculateExportDimensions(1080, 1920, '720p');
    expect(port720).toEqual({ targetWidth: 720, targetHeight: 1280 });

    // 1:1 Square 1080x1080
    const sq1080 = calculateExportDimensions(1080, 1080, '1080p');
    expect(sq1080).toEqual({ targetWidth: 1080, targetHeight: 1080 });

    const sq720 = calculateExportDimensions(1080, 1080, '720p');
    expect(sq720).toEqual({ targetWidth: 720, targetHeight: 720 });
  });

  it('mixProjectAudio returns null when project has no audio or duration <= 0', async () => {
    const emptyProj = createDefaultProject('Empty');
    emptyProj.duration = 0;
    const res = await mixProjectAudio(emptyProj, new Map());
    expect(res).toBeNull();

    emptyProj.duration = 5;
    emptyProj.audioClips = [];
    const res2 = await mixProjectAudio(emptyProj, new Map());
    expect(res2).toBeNull();
  });

  it('mixProjectAudio schedules audio clips from project.audioClips matching timeline architecture', async () => {
    const proj = createDefaultProject('LipSync Audio Test');
    proj.duration = 10;
    proj.tracks[0].clips.push({
      id: 'lip1',
      assetId: 'char1',
      start: 1,
      duration: 4,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'lipSync',
      lipSyncData: {
        characterAssetId: 'char1',
        audioAssetId: 'audio_lip_1',
        mouthSetId: 'm1',
        cues: [],
        mouthAnchor: { x: 0.5, y: 0.5 },
        mouthScale: 1,
      },
    });
    // Multi-track timeline represents audio on A1 (project.audioClips)
    proj.audioClips.push({
      id: 'aclip1',
      assetId: 'audio_lip_1',
      start: 1,
      duration: 4,
      volume: 0.8,
      trimStart: 0,
      trimEnd: 4,
    });

    let offlineCtxInstantiated = false;
    let scheduledStarts: number[] = [];

    // Mock OfflineAudioContext in test environment
    const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
    const origOfflineCtx = targetGlobal.OfflineAudioContext;
    class MockOfflineAudioContext {
      destination = {};
      createGain() {
        return { gain: { value: 1 }, connect: () => {} };
      }
      createBufferSource() {
        return {
          buffer: null,
          connect: () => {},
          start: (when: number) => {
            scheduledStarts.push(when);
          },
        };
      }
      async startRendering() {
        return { duration: 10, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer;
      }
      constructor() {
        offlineCtxInstantiated = true;
      }
    }

    targetGlobal.OfflineAudioContext = MockOfflineAudioContext;
    (globalThis as any).OfflineAudioContext = MockOfflineAudioContext;

    const mockAssets = new Map<string, any>([
      [
        'audio_lip_1',
        {
          id: 'audio_lip_1',
          name: 'lip_speech.mp3',
          type: 'audio',
          url: 'blob:test',
        },
      ],
    ]);

    // Mock audioEngine.loadAudioBuffer to return a dummy AudioBuffer
    const { audioEngine } = await import('../src/core/audio/audioEngine');
    const origLoad = audioEngine.loadAudioBuffer;
    audioEngine.loadAudioBuffer = async () => ({
      duration: 4,
      sampleRate: 44100,
      numberOfChannels: 2,
    } as unknown as AudioBuffer);

    try {
      const mixed = await mixProjectAudio(proj, mockAssets, 44100);
      expect(offlineCtxInstantiated).toBe(true);
      expect(scheduledStarts).toEqual([1]); // Exactly 1 start, no duplication
      expect(mixed).not.toBeNull();
    } finally {
      targetGlobal.OfflineAudioContext = origOfflineCtx;
      (globalThis as any).OfflineAudioContext = origOfflineCtx;
      audioEngine.loadAudioBuffer = origLoad;
    }
  });

  describe('BUG-03 Audio Schedule Deduplication & WYSIWYG Regression Tests', () => {
    const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);

    it('does not duplicate audio when audio clip is shifted by more than 0.2s from visual clip', async () => {
      const proj = createDefaultProject('Shifted Audio Test');
      proj.duration = 10;
      // Visual clip at 0.0s
      proj.tracks[0].clips.push({
        id: 'lip1',
        assetId: 'char1',
        start: 0.0,
        duration: 4.0,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        type: 'lipSync',
        lipSyncData: {
          characterAssetId: 'char1',
          audioAssetId: 'speech_1',
          mouthSetId: 'm1',
          cues: [],
          mouthAnchor: { x: 0.5, y: 0.5 },
          mouthScale: 1,
        },
      });

      // Audio clip shifted by 0.6s on timeline (delta > 0.2s, which caused duplicate echo previously)
      proj.audioClips.push({
        id: 'aclip_shifted',
        assetId: 'speech_1',
        start: 0.6,
        duration: 4.0,
        volume: 1.0,
        trimStart: 0,
        trimEnd: 4.0,
      });

      const scheduledStarts: number[] = [];
      const origOfflineCtx = targetGlobal.OfflineAudioContext;
      targetGlobal.OfflineAudioContext = class {
        createGain() { return { gain: { value: 1 }, connect: () => {} }; }
        createBufferSource() {
          return {
            buffer: null,
            connect: () => {},
            start: (when: number) => { scheduledStarts.push(when); },
          };
        }
        async startRendering() { return { duration: 10 } as any; }
      };

      const mockAssets = new Map<string, any>([
        ['speech_1', { id: 'speech_1', name: 'speech.wav', type: 'audio', url: 'blob:test' }],
      ]);

      const { audioEngine } = await import('../src/core/audio/audioEngine');
      const origLoad = audioEngine.loadAudioBuffer;
      audioEngine.loadAudioBuffer = async () => ({ duration: 5 } as any);

      try {
        await mixProjectAudio(proj, mockAssets, 44100);
        // Crucial check: Scheduled exactly once at 0.6s, NO phantom audio at 0.0s!
        expect(scheduledStarts).toEqual([0.6]);
      } finally {
        targetGlobal.OfflineAudioContext = origOfflineCtx;
        audioEngine.loadAudioBuffer = origLoad;
      }
    });

    it('preserves non-zero trimStart and volume without resetting or duplicating', async () => {
      const proj = createDefaultProject('Trim & Volume Test');
      proj.duration = 10;
      proj.audioClips.push({
        id: 'aclip_trimmed',
        assetId: 'speech_trim',
        start: 1.0,
        duration: 3.0,
        volume: 0.65,
        trimStart: 1.5,
        trimEnd: 4.5,
      });

      let capturedOffset = -1;
      let capturedVolume = -1;
      let scheduledCount = 0;

      const origOfflineCtx = targetGlobal.OfflineAudioContext;
      targetGlobal.OfflineAudioContext = class {
        createGain() {
          let _v = 1;
          return {
            gain: {
              get value() { return _v; },
              set value(v: number) {
                _v = v;
                capturedVolume = v;
              },
            },
            connect: () => {},
          };
        }
        createBufferSource() {
          return {
            buffer: null,
            connect: () => {},
            start: (_when: number, offset: number) => {
              scheduledCount++;
              capturedOffset = offset;
            },
          };
        }
        async startRendering() { return { duration: 10 } as any; }
      };

      const mockAssets = new Map<string, any>([
        ['speech_trim', { id: 'speech_trim', name: 'speech.wav', type: 'audio', url: 'blob:test' }],
      ]);

      const { audioEngine } = await import('../src/core/audio/audioEngine');
      const origLoad = audioEngine.loadAudioBuffer;
      audioEngine.loadAudioBuffer = async () => ({ duration: 8 } as any);

      try {
        await mixProjectAudio(proj, mockAssets, 44100);
        expect(scheduledCount).toBe(1);
        expect(capturedOffset).toBe(1.5); // Trim offset preserved
        expect(capturedVolume).toBe(0.65); // Volume preserved
      } finally {
        targetGlobal.OfflineAudioContext = origOfflineCtx;
        audioEngine.loadAudioBuffer = origLoad;
      }
    });

    it('returns null (silent export) when audio clip is deleted even if visual lipSync clip references audioAssetId', async () => {
      const proj = createDefaultProject('Deleted Audio Test');
      proj.duration = 10;
      // Visual lip-sync clip exists on V2, but user deleted its audio clip from A1
      proj.tracks[1].clips.push({
        id: 'lip_visual_only',
        assetId: 'char1',
        start: 0,
        duration: 5,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        visible: true,
        type: 'lipSync',
        lipSyncData: {
          characterAssetId: 'char1',
          audioAssetId: 'deleted_audio_1',
          mouthSetId: 'm1',
          cues: [],
          mouthAnchor: { x: 0.5, y: 0.5 },
          mouthScale: 1,
        },
      });
      // audioClips is explicitly empty after user deletion
      proj.audioClips = [];

      const mockAssets = new Map<string, any>([
        ['deleted_audio_1', { id: 'deleted_audio_1', name: 'del.wav', type: 'audio', url: 'blob:test' }],
      ]);

      const res = await mixProjectAudio(proj, mockAssets, 44100);
      // WYSIWYG: Must be null (silent export), must NOT resurrect deleted audio!
      expect(res).toBeNull();
    });

    it('schedules multiple audio clips accurately without duplication', async () => {
      const proj = createDefaultProject('Multi Audio Test');
      proj.duration = 15;
      proj.audioClips = [
        { id: 'a1', assetId: 'voice_1', start: 0.5, duration: 3.0, volume: 1.0, trimStart: 0, trimEnd: 3.0 },
        { id: 'a2', assetId: 'sfx_bell', start: 4.0, duration: 1.5, volume: 0.7, trimStart: 0, trimEnd: 1.5 },
        { id: 'a3', assetId: 'voice_1', start: 7.0, duration: 2.0, volume: 0.9, trimStart: 1.0, trimEnd: 3.0 },
      ];

      const starts: number[] = [];
      const origOfflineCtx = targetGlobal.OfflineAudioContext;
      targetGlobal.OfflineAudioContext = class {
        createGain() { return { gain: { value: 1 }, connect: () => {} }; }
        createBufferSource() {
          return {
            buffer: null,
            connect: () => {},
            start: (when: number) => { starts.push(when); },
          };
        }
        async startRendering() { return { duration: 15 } as any; }
      };

      const mockAssets = new Map<string, any>([
        ['voice_1', { id: 'voice_1', name: 'v1.wav', type: 'audio', url: 'blob:test1' }],
        ['sfx_bell', { id: 'sfx_bell', name: 'bell.wav', type: 'audio', url: 'blob:test2' }],
      ]);

      const { audioEngine } = await import('../src/core/audio/audioEngine');
      const origLoad = audioEngine.loadAudioBuffer;
      audioEngine.loadAudioBuffer = async () => ({ duration: 5 } as any);

      try {
        await mixProjectAudio(proj, mockAssets, 44100);
        expect(starts).toEqual([0.5, 4.0, 7.0]);
      } finally {
        targetGlobal.OfflineAudioContext = origOfflineCtx;
        audioEngine.loadAudioBuffer = origLoad;
      }
    });

    it('slices audio fades accurately across In/Out range boundaries without artificial dips (Feature 09 & 15)', async () => {
      const proj = createDefaultProject('Range Fade Test');
      proj.duration = 20;
      // Clip from 0.0s to 10.0s with 2.0s fade-in (0..2s) and 2.0s fade-out (8..10s)
      proj.audioClips = [
        {
          id: 'long_clip',
          assetId: 'audio_music',
          start: 0,
          duration: 10,
          volume: 0.8,
          trimStart: 0,
          trimEnd: 10,
          fadeIn: 2.0,
          fadeOut: 2.0,
        },
      ];

      const mockAssets = new Map<string, any>([
        ['audio_music', { id: 'audio_music', name: 'm.wav', type: 'audio', url: 'blob:m' }],
      ]);

      const linearRamps: Array<{ val: number; time: number }> = [];
      const setValues: Array<{ val: number; time: number }> = [];

      const origOfflineCtx = targetGlobal.OfflineAudioContext;
      targetGlobal.OfflineAudioContext = class {
        createGain() {
          return {
            gain: {
              value: 1,
              setValueAtTime: (val: number, time: number) => { setValues.push({ val, time }); },
              linearRampToValueAtTime: (val: number, time: number) => { linearRamps.push({ val, time }); },
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
        async startRendering() { return { duration: 5 } as any; }
      };

      const { audioEngine } = await import('../src/core/audio/audioEngine');
      const origLoad = audioEngine.loadAudioBuffer;
      audioEngine.loadAudioBuffer = async () => ({ duration: 10 } as any);

      try {
        // Case A: Export range 4.0s to 7.0s (sustain region: fade-in ended at 2s, fade-out starts at 8s)
        await mixProjectAudio(proj, mockAssets, 44100, { start: 4.0, end: 7.0 });

        // Initial gain at range start (t=0 on range) must be full 0.8!
        expect(setValues[0].val).toBe(0.8);
        expect(setValues[0].time).toBe(0);

        // Zero fade-in or fade-out ramps scheduled because range is wholly within sustain!
        expect(linearRamps.length).toBe(0);
      } finally {
        targetGlobal.OfflineAudioContext = origOfflineCtx;
        audioEngine.loadAudioBuffer = origLoad;
      }
    });
  });
});
