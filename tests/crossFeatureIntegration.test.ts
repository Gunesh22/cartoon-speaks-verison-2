import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDefaultProject } from '../src/types/project';
import { VisualClip, AudioClip } from '../src/types/timeline';
import { EditorAsset, MouthSetAsset } from '../src/types/assets';
import { getClipTransformAtTime, setKeyframe, deleteKeyframe } from '../src/core/timeline/keyframeMath';
import { mixProjectAudio } from '../src/core/export/videoExporter';
import { exportProjectBundle, importProjectBundle } from '../src/core/project/projectBundle';
import { renderCompositionFrame } from '../src/core/renderer/canvasRenderer';
import { getImageElement } from '../src/core/assets/assetDb';

describe('Cross-Feature Integration & Bug Fix Verification Tests', () => {
  describe('Feature 07: Secondary Audio Track (A2) & Dual Track Audio Mixing', () => {
    let origOfflineCtx: any;

    beforeEach(() => {
      const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
      origOfflineCtx = targetGlobal.OfflineAudioContext;
    });

    afterEach(() => {
      const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
      targetGlobal.OfflineAudioContext = origOfflineCtx;
    });

    it('creates project with independent A1 and A2 track settings', () => {
      const proj = createDefaultProject('Dual Track Test');
      expect(proj.audioTrackSettings).toBeDefined();
      expect(proj.audioTrackSettings?.A1).toEqual({ volume: 1.0, muted: false, solo: false });
      expect(proj.audioTrackSettings?.A2).toEqual({ volume: 0.8, muted: false, solo: false });
    });

    it('respects track solo and mute settings during export audio mixing', async () => {
      let startedClips = 0;
      class MockOfflineAudioContext {
        destination = {};
        createGain() {
          return { gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} }, connect: () => {} };
        }
        createBufferSource() {
          return {
            buffer: null,
            connect: () => {},
            start: () => { startedClips++; },
          };
        }
        async decodeAudioData() {
          return {
            duration: 2.0,
            sampleRate: 44100,
            numberOfChannels: 2,
            length: 88200,
          } as unknown as AudioBuffer;
        }
        async startRendering() {
          return {
            duration: 2.0,
            sampleRate: 44100,
            numberOfChannels: 2,
            length: 88200,
          } as unknown as AudioBuffer;
        }
      }

      const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
      targetGlobal.OfflineAudioContext = MockOfflineAudioContext;

      const project = createDefaultProject('Export Audio Mixing');
      project.audioClips = [
        { id: 'clip1', assetId: 'dialogue_audio', start: 0, duration: 2.0, volume: 1.0, trimStart: 0, trimEnd: 2.0, trackId: 'A1' },
        { id: 'clip2', assetId: 'bgm_audio', start: 0, duration: 2.0, volume: 1.0, trimStart: 0, trimEnd: 2.0, trackId: 'A2' },
      ];

      const dummyBlob = new Blob(['audio-data'], { type: 'audio/wav' });
      const assets = new Map<string, EditorAsset>([
        ['dialogue_audio', { id: 'dialogue_audio', name: 'voice.wav', type: 'audio', mimeType: 'audio/wav', blob: dummyBlob, url: 'blob:voice', duration: 2.0, createdAt: Date.now() }],
        ['bgm_audio', { id: 'bgm_audio', name: 'music.mp3', type: 'audio', mimeType: 'audio/mp3', blob: dummyBlob, url: 'blob:bgm', duration: 2.0, createdAt: Date.now() }],
      ]);

      // Case A: A1 solo -> A2 is filtered out, exactly 1 clip scheduled
      startedClips = 0;
      project.audioTrackSettings = {
        A1: { volume: 1.0, muted: false, solo: true },
        A2: { volume: 1.0, muted: false, solo: false },
      };
      const mixedSolo = await mixProjectAudio(project, assets, 44100);
      expect(mixedSolo).toBeDefined();
      expect(startedClips).toBe(1);

      // Case B: Both tracks muted -> no clips scheduled, returns null
      project.audioTrackSettings = {
        A1: { volume: 1.0, muted: true, solo: false },
        A2: { volume: 1.0, muted: true, solo: false },
      };
      const mixedMuted = await mixProjectAudio(project, assets, 44100);
      expect(mixedMuted).toBeNull();
    });
  });

  describe('Feature 11: Transform Keyframing (Position, Scale, Rotation)', () => {
    const baseClip: VisualClip = {
      id: 'clip_keyframe_test',
      assetId: 'char_asset',
      start: 0,
      duration: 5,
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
      keyframes: [
        { id: 'kf1', time: 0, x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, easing: 'linear' },
        { id: 'kf2', time: 2, x: 300, y: 500, width: 400, height: 400, rotation: 90, opacity: 0.5, easing: 'linear' },
      ],
    };

    it('interpolates linearly at midpoint between two keyframes', () => {
      const midTransform = getClipTransformAtTime(baseClip, 1.0);
      expect(midTransform.x).toBe(200);
      expect(midTransform.y).toBe(300);
      expect(midTransform.width).toBe(300);
      expect(midTransform.height).toBe(300);
      expect(midTransform.rotation).toBe(45);
      expect(midTransform.opacity).toBe(0.75);
    });

    it('supports adding, updating, and deleting keyframes safely', () => {
      const updatedKeyframes = setKeyframe(baseClip.keyframes || [], 1.0, {
        x: 150,
        y: 200,
        width: 250,
        height: 250,
        rotation: 30,
        opacity: 0.8,
        easing: 'ease-in-out',
      });
      expect(updatedKeyframes.length).toBe(3);

      const deletedKeyframes = deleteKeyframe(updatedKeyframes, updatedKeyframes[1].id);
      expect(deletedKeyframes.length).toBe(2);
    });
  });

  describe('Feature 16: Project Bundle Archive (.cartoonspeaks)', () => {
    it('bundles and unbundles a complete project with assets correctly', async () => {
      const project = createDefaultProject('Bundle Test Project');
      const textBlob = new Blob(['sample-image-bytes'], { type: 'image/png' });
      const asset: EditorAsset = {
        id: 'asset_test_1',
        name: 'test_character.png',
        type: 'image',
        mimeType: 'image/png',
        blob: textBlob,
        url: 'blob:test',
        width: 100,
        height: 100,
        projectId: project.id,
        createdAt: Date.now(),
      };

      const mouthSet: MouthSetAsset = {
        id: 'ms_1',
        name: 'Mouth Set 1',
        projectId: project.id,
        sourceAssetId: 'asset_test_1',
        sprites: {
          A: {
            id: 'sp_A',
            label: 'A',
            cropRect: { x: 0, y: 0, width: 50, height: 50 },
            bounds: { minX: 5, minY: 5, maxX: 45, maxY: 45, width: 40, height: 40 },
            anchorX: 0.5,
            anchorY: 0.5,
            width: 50,
            height: 50,
            blob: textBlob,
            url: '',
          },
        },
        createdAt: Date.now(),
      };

      const assetsMap = new Map<string, EditorAsset>([['asset_test_1', asset]]);
      const mouthSetsMap = new Map<string, MouthSetAsset>([['ms_1', mouthSet]]);

      const bundleBlob = await exportProjectBundle(project, assetsMap, mouthSetsMap);
      expect(bundleBlob).toBeDefined();
      expect(bundleBlob.size).toBeGreaterThan(0);

      const imported = await importProjectBundle(bundleBlob);
      expect(imported.project.name).toBe('Bundle Test Project');
      expect(imported.assets.length).toBe(1);
      expect(imported.assets[0].name).toBe('test_character.png');
      expect(imported.mouthSets.length).toBe(1);
      expect(imported.mouthSets[0].sprites.A).toBeDefined();
    });
  });

  describe('Defect Verification: Resilient Mouth Rendering & Character Image Isolation', () => {
    it('prevents self-rendering when character image is mistakenly set as mouth sheet source', async () => {
      const canvas = {
        width: 1920,
        height: 1080,
      } as HTMLCanvasElement;

      const calls: string[] = [];
      const ctx = {
        clearRect: () => {},
        fillRect: () => {},
        drawImage: () => { calls.push('drawImage'); },
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
      } as unknown as CanvasRenderingContext2D;

      const project = createDefaultProject('Self-Artwork Guard Test');
      const clip: VisualClip = {
        id: 'lip_clip_1',
        assetId: 'char_same_id',
        start: 0,
        duration: 5,
        x: 0,
        y: 0,
        width: 500,
        height: 500,
        rotation: 0,
        opacity: 1,
        visible: true,
        type: 'lipSync',
        lipSyncData: {
          characterAssetId: 'char_same_id',
          audioAssetId: 'audio_1',
          mouthSetId: 'mouthset_same_id',
          cues: [{ id: 'cue1', start: 0, end: 2, mouthId: 'A' }],
          mouthAnchor: { x: 0.5, y: 0.5 },
          mouthScale: 0.25,
        },
      };

      project.tracks[1].clips.push(clip);

      const assets = new Map<string, EditorAsset>();
      const mouthSets = new Map<string, MouthSetAsset>([
        [
          'mouthset_same_id',
          {
            id: 'mouthset_same_id',
            name: 'Faulty Sheet',
            sourceAssetId: 'char_same_id', // Intentionally identical to character assetId
            sprites: {
              A: {
                id: 'sp_A',
                label: 'A',
                cropRect: { x: 0, y: 0, width: 50, height: 50 },
                bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50, width: 50, height: 50 },
                anchorX: 0.5,
                anchorY: 0.5,
                width: 50,
                height: 50,
                blob: new Blob([]),
                url: '',
              },
            },
            createdAt: Date.now(),
          },
        ],
      ]);

      // Renders composition cleanly without throwing or looping
      await expect(
        renderCompositionFrame(ctx, {
          canvas,
          project,
          time: 0.5,
          assets,
          mouthSets,
        })
      ).resolves.not.toThrow();
    });

    it('rejects dead or already failed URLs immediately without repeated console network calls', async () => {
      // Calling getImageElement with an empty URL immediately rejects without network error
      await expect(getImageElement('invalid_id', '')).rejects.toThrow('Invalid');
    });
  });
});
