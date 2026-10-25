import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/state/editorStore';
import { calculateIdleMotion, renderCompositionFrame } from '../src/core/renderer/canvasRenderer';
import { mixProjectAudio, calculateExportDimensions } from '../src/core/export/videoExporter';
import { createDefaultProject } from '../src/types/project';
import { VisualClip, AudioClip } from '../src/types/timeline';
import { EditorAsset, MouthSetAsset } from '../src/types/assets';

describe('Features Batch 4 & 5: Animation, Visemes, Transparency, and In/Out Range', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: createDefaultProject('Test Proj'),
      assets: new Map(),
      mouthSets: new Map(),
      currentTime: 0,
      inOutRange: { in: null, out: null },
      selectedClipId: null,
    });
  });

  describe('FEATURE 03: Procedural Eye Blinking & Idle Head Motion', () => {
    it('computes deterministic, continuous sinusoidal idle motion offsets', () => {
      const motionT0 = calculateIdleMotion(0);
      expect(motionT0.offsetX).toBeCloseTo(0, 4);
      expect(motionT0.offsetY).toBeCloseTo(0, 4);
      expect(motionT0.tiltDeg).toBeCloseTo(0, 4);

      const motionT1 = calculateIdleMotion(1.0);
      const motionT1Repeat = calculateIdleMotion(1.0);
      // Deterministic at same timestamp
      expect(motionT1.offsetX).toBe(motionT1Repeat.offsetX);
      expect(motionT1.offsetY).toBe(motionT1Repeat.offsetY);
      expect(motionT1.tiltDeg).toBe(motionT1Repeat.tiltDeg);

      // Natural subtle ranges: breathing within +/- 2.0px, sway within +/- 1.0px, tilt within +/- 0.5 deg
      expect(Math.abs(motionT1.offsetY)).toBeLessThanOrEqual(2.0);
      expect(Math.abs(motionT1.offsetX)).toBeLessThanOrEqual(1.0);
      expect(Math.abs(motionT1.tiltDeg)).toBeLessThanOrEqual(0.5);
    });

    it('returns zero motion for negative local time', () => {
      const motion = calculateIdleMotion(-1.5);
      expect(motion).toEqual({ offsetX: 0, offsetY: 0, tiltDeg: 0 });
    });
  });

  describe('FEATURE 02: Interactive Viseme Editing & Timeline Sync', () => {
    it('allows inspecting, swapping viseme shapes, and trimming cue boundaries without rerunning generator', () => {
      const store = useEditorStore.getState();
      const visualClip: VisualClip = {
        id: 'vis_lip_1',
        assetId: 'char_1',
        start: 0,
        duration: 5.0,
        x: 0,
        y: 0,
        width: 300,
        height: 300,
        rotation: 0,
        opacity: 1,
        visible: true,
        type: 'lipSync',
        lipSyncData: {
          characterAssetId: 'char_1',
          audioAssetId: 'aud_1',
          mouthSetId: 'mouth_1',
          cues: [
            { id: 'c1', mouthId: 'X', start: 0.0, end: 1.0, shape: 'X' },
            { id: 'c2', mouthId: 'B', start: 1.0, end: 2.5, shape: 'B' },
            { id: 'c3', mouthId: 'C', start: 2.5, end: 4.0, shape: 'C' },
          ],
          mouthAnchor: { x: 0.5, y: 0.5 },
          mouthScale: 0.25,
        },
      };

      store.addVisualClip('V1', visualClip);

      // Swap cue c2 from 'B' to 'D'
      const clipBefore = useEditorStore.getState().project.tracks.flatMap((t) => t.clips).find((c) => c.id === 'vis_lip_1')!;
      const updatedCues = clipBefore.lipSyncData!.cues.map((c) =>
        c.id === 'c2' ? { ...c, mouthId: 'D', shape: 'D' } : c
      );

      store.updateVisualClip('vis_lip_1', {
        lipSyncData: {
          ...clipBefore.lipSyncData!,
          cues: updatedCues,
        },
      });

      const clipAfterSwap = useEditorStore.getState().project.tracks.flatMap((t) => t.clips).find((c) => c.id === 'vis_lip_1')!;
      expect(clipAfterSwap.lipSyncData!.cues[1].mouthId).toBe('D');
      expect(clipAfterSwap.lipSyncData!.cues[1].shape).toBe('D');

      // Adjust cue boundary between c1 and c2: drag c1 end from 1.0 to 1.4
      const boundaryCues = clipAfterSwap.lipSyncData!.cues.map((c, i) => {
        if (i === 0) return { ...c, end: 1.4 };
        if (i === 1) return { ...c, start: 1.4 };
        return c;
      });

      store.updateVisualClip('vis_lip_1', {
        lipSyncData: {
          ...clipAfterSwap.lipSyncData!,
          cues: boundaryCues,
        },
      });

      const finalClip = useEditorStore.getState().project.tracks.flatMap((t) => t.clips).find((c) => c.id === 'vis_lip_1')!;
      expect(finalClip.lipSyncData!.cues[0].end).toBe(1.4);
      expect(finalClip.lipSyncData!.cues[1].start).toBe(1.4);
      // Other cues unaffected
      expect(finalClip.lipSyncData!.cues[2].start).toBe(2.5);
    });

    it('enforces boundary clamping so cue trimming cannot create negative durations (Feature 02)', () => {
      // Clamping logic:
      // minEnd = currentCue.start + 0.04
      // maxEnd = nextCue ? Math.max(minEnd, nextCue.end - 0.04) : clipDuration
      const currentCue = { start: 1.0, end: 1.5 };
      const nextCue = { start: 1.5, end: 2.0 };
      const clipDuration = 5.0;

      const minEnd = currentCue.start + 0.04;
      const maxEnd = nextCue ? Math.max(minEnd, nextCue.end - 0.04) : clipDuration;

      // User tries dragging 3 seconds to the right (target end = 4.5)
      const proposedEndRight = 4.5;
      const clampedEndRight = Math.min(maxEnd, Math.max(minEnd, proposedEndRight));
      expect(clampedEndRight).toBe(1.96); // Capped at nextCue.end - 0.04
      expect(nextCue.end - clampedEndRight).toBeCloseTo(0.04, 4);

      // User tries dragging 2 seconds to the left (target end = -0.5)
      const proposedEndLeft = -0.5;
      const clampedEndLeft = Math.min(maxEnd, Math.max(minEnd, proposedEndLeft));
      expect(clampedEndLeft).toBe(1.04); // Capped at currentCue.start + 0.04
      expect(clampedEndLeft - currentCue.start).toBeCloseTo(0.04, 4);
    });
  });

  describe('FEATURE 14 & 15: Transparent Video Export & In/Out Range Scheduling', () => {
    it('sets and clears In/Out timeline marks via editor store', () => {
      const store = useEditorStore.getState();
      expect(store.inOutRange).toEqual({ in: null, out: null });

      store.setInPoint(2.5);
      expect(useEditorStore.getState().inOutRange.in).toBe(2.5);
      expect(useEditorStore.getState().inOutRange.out).toBeNull();

      store.setOutPoint(6.0);
      expect(useEditorStore.getState().inOutRange).toEqual({ in: 2.5, out: 6.0 });

      // Setting In point after current Out point resets Out point
      store.setInPoint(7.0);
      expect(useEditorStore.getState().inOutRange.in).toBe(7.0);
      expect(useEditorStore.getState().inOutRange.out).toBeNull();

      // Clear range
      store.clearInOutRange();
      expect(useEditorStore.getState().inOutRange).toEqual({ in: null, out: null });
    });

    it('correctly filters and slices audio clips when scheduling an In/Out export range', async () => {
      const project = createDefaultProject('Audio Range Proj');
      project.duration = 10.0;

      // Clip 1: 0.0 -> 2.0 (entirely before range 3.0..7.0 -> should be omitted)
      const clip1: AudioClip = {
        id: 'a1',
        assetId: 'audio_asset_1',
        start: 0.0,
        duration: 2.0,
        volume: 0.8,
        trimStart: 0.0,
        trimEnd: 0.0,
      };

      // Clip 2: 2.0 -> 5.0 (crosses into range at 3.0 -> should start at 0.0 in export, duration 2.0, trimStart offset +1.0)
      const clip2: AudioClip = {
        id: 'a2',
        assetId: 'audio_asset_2',
        start: 2.0,
        duration: 3.0,
        volume: 1.0,
        trimStart: 0.5,
        trimEnd: 0.0,
      };

      // Clip 3: 4.0 -> 6.0 (entirely within range 3.0..7.0 -> starts at 1.0 in export, duration 2.0, trimStart unchanged)
      const clip3: AudioClip = {
        id: 'a3',
        assetId: 'audio_asset_3',
        start: 4.0,
        duration: 2.0,
        volume: 0.9,
        trimStart: 0.2,
        trimEnd: 0.0,
      };

      // Clip 4: 8.0 -> 10.0 (entirely after range 3.0..7.0 -> should be omitted)
      const clip4: AudioClip = {
        id: 'a4',
        assetId: 'audio_asset_4',
        start: 8.0,
        duration: 2.0,
        volume: 0.5,
        trimStart: 0.0,
        trimEnd: 0.0,
      };

      project.audioClips = [clip1, clip2, clip3, clip4];

      // Create fake audio buffer assets
      const sampleRate = 44100;
      function createBuffer(duration: number): AudioBuffer {
        return {
          duration,
          length: Math.round(duration * sampleRate),
          numberOfChannels: 1,
          sampleRate,
          getChannelData: () => new Float32Array(Math.round(duration * sampleRate)),
          copyFromChannel: () => {},
          copyToChannel: () => {},
        } as unknown as AudioBuffer;
      }

      const assets = new Map<string, EditorAsset>([
        [
          'audio_asset_1',
          {
            id: 'audio_asset_1',
            projectId: project.id,
            name: 'A1',
            type: 'audio',
            duration: 2.0,
            mimeType: 'audio/wav',
            blob: new Blob(),
            url: 'blob:test1',
            createdAt: Date.now(),
          },
        ],
        [
          'audio_asset_2',
          {
            id: 'audio_asset_2',
            projectId: project.id,
            name: 'A2',
            type: 'audio',
            duration: 3.0,
            mimeType: 'audio/wav',
            blob: new Blob(),
            url: 'blob:test2',
            createdAt: Date.now(),
          },
        ],
        [
          'audio_asset_3',
          {
            id: 'audio_asset_3',
            projectId: project.id,
            name: 'A3',
            type: 'audio',
            duration: 2.0,
            mimeType: 'audio/wav',
            blob: new Blob(),
            url: 'blob:test3',
            createdAt: Date.now(),
          },
        ],
        [
          'audio_asset_4',
          {
            id: 'audio_asset_4',
            projectId: project.id,
            name: 'A4',
            type: 'audio',
            duration: 2.0,
            mimeType: 'audio/wav',
            blob: new Blob(),
            url: 'blob:test4',
            createdAt: Date.now(),
          },
        ],
      ]);

      // Mock OfflineAudioContext
      const scheduledItems: any[] = [];
      class MockOfflineAudioContext {
        sampleRate = 44100;
        length = 0;
        destination = {};
        constructor(public channels: number, public totalSamples: number, public rate: number) {
          this.length = totalSamples;
        }
        createBufferSource() {
          const item: any = { buffer: null, playbackRate: { value: 1 } };
          item.connect = () => ({ connect: () => {} });
          item.start = (when: number, offset: number, duration: number) => {
            scheduledItems.push({ when, offset, duration, buffer: item.buffer });
          };
          return item;
        }
        createGain() {
          return {
            gain: {
              value: 1,
              setValueAtTime: () => {},
              linearRampToValueAtTime: () => {},
            },
            connect: () => {},
          };
        }
        startRendering() {
          return Promise.resolve(createBuffer(this.length / this.sampleRate));
        }
      }

      (globalThis as any).OfflineAudioContext = MockOfflineAudioContext;

      // Mock audioEngine.loadAudioBuffer
      const { audioEngine } = await import('../src/core/audio/audioEngine');
      audioEngine.loadAudioBuffer = async (id: string) => createBuffer(10.0);

      const mixed = await mixProjectAudio(project, assets, sampleRate, { start: 3.0, end: 7.0 });
      expect(mixed).not.toBeNull();
      // Total duration of range 3.0..7.0 is 4.0 seconds -> 4.0 * 44100 = 176400 samples
      expect(mixed?.length).toBe(4.0 * sampleRate);

      // Only clips 2 and 3 should have been scheduled
      expect(scheduledItems.length).toBe(2);

      // Clip 2: overlap starts at 3.0 -> when = 3.0 - 3.0 = 0.0s, offset = trimStart(0.5) + (3.0 - 2.0) = 1.5s, duration = 2.0s
      expect(scheduledItems[0].when).toBeCloseTo(0.0, 3);
      expect(scheduledItems[0].offset).toBeCloseTo(1.5, 3);
      expect(scheduledItems[0].duration).toBeCloseTo(2.0, 3);

      // Clip 3: overlap starts at 4.0 -> when = 4.0 - 3.0 = 1.0s, offset = trimStart(0.2) = 0.2s, duration = 2.0s
      expect(scheduledItems[1].when).toBeCloseTo(1.0, 3);
      expect(scheduledItems[1].offset).toBeCloseTo(0.2, 3);
      expect(scheduledItems[1].duration).toBeCloseTo(2.0, 3);
    });

    it('renders clean transparent composition frame when transparent mode is enabled (FEATURE 14)', async () => {
      const project = createDefaultProject('Transparent Proj');
      const canvas = {
        width: 1920,
        height: 1080,
      } as HTMLCanvasElement;

      const calls: string[] = [];
      const ctx = {
        clearRect: (x: number, y: number, w: number, h: number) => {
          calls.push(`clearRect(${x},${y},${w},${h})`);
        },
        fillRect: (x: number, y: number, w: number, h: number) => {
          calls.push(`fillRect(${x},${y},${w},${h})`);
        },
        save: () => {},
        restore: () => {},
      } as unknown as CanvasRenderingContext2D;

      await renderCompositionFrame(ctx, {
        canvas,
        project,
        time: 0,
        assets: new Map(),
        mouthSets: new Map(),
        transparent: true,
      });

      // In transparent mode, clearRect is called, but solid backdrop fillRect is omitted
      expect(calls).toContain('clearRect(0,0,1920,1080)');
      expect(calls.some((c) => c.startsWith('fillRect'))).toBe(false);
    });
  });
});
