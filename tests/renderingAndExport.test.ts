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

  it('mixProjectAudio gathers both explicit audio clips and lip-sync audio references', async () => {
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
      expect(scheduledStarts).toContain(1);
      expect(mixed).not.toBeNull();
    } finally {
      targetGlobal.OfflineAudioContext = origOfflineCtx;
      (globalThis as any).OfflineAudioContext = origOfflineCtx;
      audioEngine.loadAudioBuffer = origLoad;
    }
  });
});
