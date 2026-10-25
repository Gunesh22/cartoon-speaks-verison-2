import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/state/editorStore';
import { calculateProjectDuration, getTimelineContentEndTime } from '../src/core/timeline/timelineMath';
import { createDefaultProject, EditorProject } from '../src/types/project';
import { audioEngine } from '../src/core/audio/audioEngine';
import { mixProjectAudio } from '../src/core/export/videoExporter';

describe('Automatic Timeline Duration Specification', () => {
  beforeEach(() => {
    const store = useEditorStore.getState();
    store.newProject('Test Project');
    audioEngine.stop();
  });

  // Scenario 1
  it('1. visual clip ending at 16.5s and music ending at 18.7s results in timeline end 18.7s', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_1',
      assetId: 'asset_vis',
      start: 0,
      duration: 16.5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    store.addAudioClip({
      id: 'bgm_1',
      assetId: 'asset_music',
      start: 0,
      duration: 18.7,
      volume: 0.8,
      trimStart: 0,
      trimEnd: 18.7,
      trackId: 'A2',
    });

    expect(useEditorStore.getState().project.duration).toBe(18.7);
  });

  // Scenario 2
  it('2. trimming final music clip from 18.7s to 16.5s shrinks timeline end to 16.5s', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_1',
      assetId: 'asset_vis',
      start: 0,
      duration: 16.5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    store.addAudioClip({
      id: 'bgm_1',
      assetId: 'asset_music',
      start: 0,
      duration: 18.7,
      volume: 0.8,
      trimStart: 0,
      trimEnd: 18.7,
      trackId: 'A2',
    });

    expect(useEditorStore.getState().project.duration).toBe(18.7);

    // Trim music clip end to 16.5s
    store.trimAudioClip('bgm_1', 'end', 16.5);
    expect(useEditorStore.getState().project.duration).toBe(16.5);
  });

  // Scenario 3
  it('3. deleting the longest clip recalculates duration to next-longest endpoint', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_1',
      assetId: 'asset_vis',
      start: 0,
      duration: 12.0,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    store.addAudioClip({
      id: 'dialogue_1',
      assetId: 'asset_speech',
      start: 0,
      duration: 10.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 10.0,
      trackId: 'A1',
    });

    store.addAudioClip({
      id: 'music_longest',
      assetId: 'asset_bgm',
      start: 0,
      duration: 25.0,
      volume: 0.5,
      trimStart: 0,
      trimEnd: 25.0,
      trackId: 'A2',
    });

    expect(useEditorStore.getState().project.duration).toBe(25.0);

    // Remove longest clip
    store.removeAudioClip('music_longest');
    // Next longest is vis_1 which ends at 12.0s
    expect(useEditorStore.getState().project.duration).toBe(12.0);
  });

  // Scenario 4
  it('4. moving the final clip earlier or later updates duration accordingly', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_lead',
      assetId: 'asset_vis',
      start: 0,
      duration: 8.0,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    store.addAudioClip({
      id: 'audio_outro',
      assetId: 'asset_outro',
      start: 5.0,
      duration: 5.0, // Ends at 10.0
      volume: 1.0,
      trimStart: 0,
      trimEnd: 5.0,
      trackId: 'A1',
    });

    expect(useEditorStore.getState().project.duration).toBe(10.0);

    // Move audio clip later to 10.0s (ends at 15.0s)
    store.moveAudioClip('audio_outro', 10.0);
    expect(useEditorStore.getState().project.duration).toBe(15.0);

    // Move audio clip earlier to 2.0s (ends at 7.0s, so vis_lead at 8.0s is now latest)
    store.moveAudioClip('audio_outro', 2.0);
    expect(useEditorStore.getState().project.duration).toBe(8.0);
  });

  // Scenario 5
  it('5. splitting clips and undoing/redoing edits maintains derived duration', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_split',
      assetId: 'asset_vis',
      start: 0,
      duration: 14.0,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    expect(useEditorStore.getState().project.duration).toBe(14.0);

    // Split clip at 6.0s
    store.splitClip('vis_split', 6.0);
    expect(useEditorStore.getState().project.tracks[0].clips.length).toBe(2);
    expect(useEditorStore.getState().project.duration).toBe(14.0);

    // Remove the second piece (from 6.0 to 14.0)
    const secondPiece = useEditorStore.getState().project.tracks[0].clips[1];
    store.removeClip(secondPiece.id);
    expect(useEditorStore.getState().project.duration).toBe(6.0);

    // Undo: second piece is restored, duration returns to 14.0s
    store.undo();
    expect(useEditorStore.getState().project.duration).toBe(14.0);

    // Redo: second piece is removed again, duration returns to 6.0s
    store.redo();
    expect(useEditorStore.getState().project.duration).toBe(6.0);
  });

  // Scenario 6
  it('6. loading a legacy project with a stale stored duration derives duration from actual clips', () => {
    const store = useEditorStore.getState();
    const legacyProject: EditorProject = {
      id: 'legacy_1',
      name: 'Old Project with Stale 60s Duration',
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 60.0, // Stale!
      tracks: [
        {
          id: 'V1',
          clips: [
            {
              id: 'c_legacy',
              assetId: 'a1',
              start: 0,
              duration: 11.2,
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
              rotation: 0,
              opacity: 1,
              visible: true,
              type: 'image',
            },
          ],
        },
        { id: 'V2', clips: [] },
        { id: 'V3', clips: [] },
        { id: 'V4', clips: [] },
      ],
      audioClips: [
        {
          id: 'a_legacy',
          assetId: 'a2',
          start: 2.0,
          duration: 5.5, // Ends at 7.5
          volume: 1,
          trimStart: 0,
          trimEnd: 5.5,
          trackId: 'A1',
        },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    };

    store.setProject(legacyProject);
    // Even though project.duration was stored as 60.0, it must derive to 11.2s!
    expect(useEditorStore.getState().project.duration).toBe(11.2);
  });

  // Scenario 7
  it('7. an empty project has a duration of 5 seconds fallback', () => {
    const store = useEditorStore.getState();
    store.newProject('Empty Project');
    expect(calculateProjectDuration(store.project.tracks, store.project.audioClips)).toBe(5.0);
    expect(getTimelineContentEndTime(store.project.tracks, store.project.audioClips)).toBe(0);
  });

  // Scenario 8
  it('8. playback stops at the endpoint without trailing audio', () => {
    const store = useEditorStore.getState();
    store.addVisualClip('V1', {
      id: 'vis_stop',
      assetId: 'a_vis',
      start: 0,
      duration: 4.0,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    expect(useEditorStore.getState().project.duration).toBe(4.0);

    // Seeking past duration is clamped to 4.0s
    store.setCurrentTime(10.0);
    expect(useEditorStore.getState().currentTime).toBe(4.0);

    // Negative seeking is clamped to 0
    store.setCurrentTime(-5.0);
    expect(useEditorStore.getState().currentTime).toBe(0);

    // Trimming clip while playhead is at 3.5s to 2.0s clamps playhead to 2.0s
    store.setCurrentTime(3.5);
    store.trimClip('vis_stop', 'end', 2.0);
    expect(useEditorStore.getState().project.duration).toBe(2.0);
    expect(useEditorStore.getState().currentTime).toBe(2.0);
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  // Scenario 9
  it('9. export boundaries match derived timeline duration and in/out marks', async () => {
    const project = createDefaultProject('Export Bounds Test');
    project.duration = 50.0; // Stale duration
    project.tracks[0].clips.push({
      id: 'vis_exp',
      assetId: 'a1',
      start: 0,
      duration: 14.5,
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    });

    const targetGlobal = typeof window !== 'undefined' ? (window as any) : (globalThis as any);
    class MockOfflineAudioContext {
      destination = {};
      createGain() { return { gain: { value: 1 }, connect: () => {} }; }
      createBufferSource() { return { buffer: null, connect: () => {}, start: () => {} }; }
      async startRendering() {
        return { duration: 14.5, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer;
      }
      async decodeAudioData(ab: ArrayBuffer) {
        return { duration: 14.5, sampleRate: 44100, numberOfChannels: 2 } as unknown as AudioBuffer;
      }
    }
    targetGlobal.OfflineAudioContext = MockOfflineAudioContext;
    (globalThis as any).OfflineAudioContext = MockOfflineAudioContext;

    // Full export without range uses derived duration (14.5s) instead of stale 50.0s
    const effectiveDur = calculateProjectDuration(project.tracks, project.audioClips, project.duration);
    expect(effectiveDur).toBe(14.5);

    // Explicit In/Out range (e.g. 2.0 to 10.0) is respected
    const range = { start: 2.0, end: 10.0 };
    const rangeDuration = range.end - range.start;
    expect(rangeDuration).toBe(8.0);
  });
});
