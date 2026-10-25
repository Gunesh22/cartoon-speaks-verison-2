import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/state/editorStore';
import { extractWaveformPeaks, getCachedPeaks, clearWaveformCache } from '../src/core/audio/waveformGenerator';
import { VisualClip, AudioClip } from '../src/types/timeline';

describe('Timeline Editing Tools (Features 05, 06, 08)', () => {
  beforeEach(() => {
    useEditorStore.getState().newProject('Timeline Tools Test');
    clearWaveformCache();
  });

  it('splits visual clip at specified timestamp and preserves transforms & cues (Feature 05)', () => {
    const store = useEditorStore.getState();

    const visualClip: VisualClip = {
      id: 'vis_1',
      assetId: 'char_1',
      start: 2.0,
      duration: 6.0, // 2.0 to 8.0s
      x: 100,
      y: 150,
      width: 300,
      height: 400,
      rotation: 15,
      opacity: 0.9,
      visible: true,
      type: 'lipSync',
      lipSyncData: {
        characterAssetId: 'char_1',
        audioAssetId: 'aud_1',
        mouthSetId: 'm_1',
        // Cues are relative to clip start (0..6.0s)
        cues: [
          { id: 'c1', mouthId: 'A', start: 0.5, end: 1.5, shape: 'A' },
          { id: 'c2', mouthId: 'B', start: 2.5, end: 3.5, shape: 'B' },
          { id: 'c3', mouthId: 'C', start: 4.0, end: 5.5, shape: 'C' },
        ],
        mouthAnchor: { x: 0.5, y: 0.5 },
        mouthScale: 0.25,
      },
    };

    store.addVisualClip('V1', visualClip);

    // Split at global time 5.0s (which is local offset 3.0s into the 6.0s clip)
    store.splitClip('vis_1', 5.0);

    const track = useEditorStore.getState().project.tracks.find((t) => t.id === 'V1');
    expect(track?.clips.length).toBe(2);

    const first = track?.clips[0];
    const second = track?.clips[1];

    // First piece: start 2.0s, duration 3.0s (ends at 5.0s)
    expect(first?.id).toBe('vis_1');
    expect(first?.start).toBe(2.0);
    expect(first?.duration).toBe(3.0);
    expect(first?.x).toBe(100);
    expect(first?.rotation).toBe(15);
    // Cues for first piece: Cue A (0.5..1.5) and Cue B sliced (2.5..3.0)
    expect(first?.lipSyncData?.cues.length).toBe(2);
    expect(first?.lipSyncData?.cues[0].shape).toBe('A');
    expect(first?.lipSyncData?.cues[0].start).toBe(0.5);
    expect(first?.lipSyncData?.cues[0].end).toBe(1.5);
    expect(first?.lipSyncData?.cues[1].start).toBe(2.5);
    expect(first?.lipSyncData?.cues[1].end).toBe(3.0);

    // Second piece: start 5.0s, duration 3.0s (ends at 8.0s)
    expect(second?.start).toBe(5.0);
    expect(second?.duration).toBe(3.0);
    expect(second?.x).toBe(100);
    expect(second?.rotation).toBe(15);
    // Cues for second piece: Cue B rebased (0.0..0.5) and Cue C rebased (1.0..2.5)
    expect(second?.lipSyncData?.cues.length).toBe(2);
    expect(second?.lipSyncData?.cues[0].shape).toBe('B');
    expect(second?.lipSyncData?.cues[0].start).toBe(0.0);
    expect(second?.lipSyncData?.cues[0].end).toBe(0.5);
    expect(second?.lipSyncData?.cues[1].shape).toBe('C');
    expect(second?.lipSyncData?.cues[1].start).toBe(1.0);
    expect(second?.lipSyncData?.cues[1].end).toBe(2.5);

    // Verify all cue timings strictly respect local piece durations
    for (const cue of first?.lipSyncData?.cues || []) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeLessThanOrEqual(first!.duration);
      expect(cue.end).toBeGreaterThan(cue.start);
    }
    for (const cue of second?.lipSyncData?.cues || []) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeLessThanOrEqual(second!.duration);
      expect(cue.end).toBeGreaterThan(cue.start);
    }
  });

  it('splits audio clip and preserves trimming offsets without audio gaps (Feature 05)', () => {
    const store = useEditorStore.getState();

    const audioClip: AudioClip = {
      id: 'audio_orig',
      assetId: 'voice_full',
      start: 1.0,
      duration: 10.0, // 1.0 to 11.0s
      volume: 0.85,
      trimStart: 2.0,
      trimEnd: 12.0,
    };

    store.addAudioClip(audioClip);

    // Split at 4.0s (3 seconds into playback)
    store.splitClip('audio_orig', 4.0);

    const audioClips = useEditorStore.getState().project.audioClips;
    expect(audioClips.length).toBe(2);

    const first = audioClips[0];
    const second = audioClips[1];

    // First piece: starts at 1.0s, duration 3.0s, trimStart=2.0s, trimEnd=5.0s
    expect(first.start).toBe(1.0);
    expect(first.duration).toBe(3.0);
    expect(first.trimStart).toBe(2.0);
    expect(first.trimEnd).toBe(5.0);
    expect(first.volume).toBe(0.85);
    expect(first.fadeOut).toBe(0); // Cut point has no artificial fade-out dip

    // Second piece: starts at 4.0s, duration 7.0s, trimStart=5.0s, trimEnd=12.0s
    expect(second.start).toBe(4.0);
    expect(second.duration).toBe(7.0);
    expect(second.trimStart).toBe(5.0);
    expect(second.trimEnd).toBe(12.0);
    expect(second.volume).toBe(0.85);
    expect(second.fadeIn).toBe(0); // Cut point has no artificial fade-in gap
  });

  it('splits clips starting after timeline zero before, inside, and after mouth cues (Feature 05)', () => {
    const store = useEditorStore.getState();

    // Clip starts at 10.0s, duration 6.0s (ends at 16.0s)
    const originalClip: VisualClip = {
      id: 'vis_offset',
      assetId: 'char_hero',
      start: 10.0,
      duration: 6.0,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'lipSync',
      lipSyncData: {
        characterAssetId: 'char_hero',
        audioAssetId: 'aud_hero',
        mouthSetId: 'm_hero',
        // Cues relative to clip start: [1.0..2.0], [3.0..4.5]
        cues: [
          { id: 'cue_1', mouthId: 'A', start: 1.0, end: 2.0, shape: 'A' },
          { id: 'cue_2', mouthId: 'B', start: 3.0, end: 4.5, shape: 'B' },
        ],
        mouthAnchor: { x: 0.5, y: 0.5 },
        mouthScale: 0.25,
      },
    };

    // Test A: Split before any cues (at global 10.5s -> local 0.5s)
    store.addVisualClip('V1', originalClip);
    store.splitClip('vis_offset', 10.5);

    let track = useEditorStore.getState().project.tracks.find((t) => t.id === 'V1')!;
    expect(track.clips.length).toBe(2);
    let piece1 = track.clips[0];
    let piece2 = track.clips[1];

    expect(piece1.start).toBe(10.0);
    expect(piece1.duration).toBe(0.5);
    expect(piece1.lipSyncData?.cues.length).toBe(0); // Before all cues -> empty

    expect(piece2.start).toBe(10.5);
    expect(piece2.duration).toBe(5.5);
    expect(piece2.lipSyncData?.cues.length).toBe(2);
    // Cues rebased by -0.5s:
    expect(piece2.lipSyncData?.cues[0].start).toBe(0.5); // was 1.0
    expect(piece2.lipSyncData?.cues[0].end).toBe(1.5);   // was 2.0
    expect(piece2.lipSyncData?.cues[1].start).toBe(2.5); // was 3.0
    expect(piece2.lipSyncData?.cues[1].end).toBe(4.0);   // was 4.5

    // Reset and Test B: Split inside cue_2 (at global 14.0s -> local 4.0s into original clip)
    store.newProject('Test Inside Cue Split');
    store.addVisualClip('V1', originalClip);
    store.splitClip('vis_offset', 14.0);

    track = useEditorStore.getState().project.tracks.find((t) => t.id === 'V1')!;
    piece1 = track.clips[0];
    piece2 = track.clips[1];

    expect(piece1.start).toBe(10.0);
    expect(piece1.duration).toBe(4.0);
    expect(piece1.lipSyncData?.cues.length).toBe(2);
    expect(piece1.lipSyncData?.cues[0].start).toBe(1.0);
    expect(piece1.lipSyncData?.cues[0].end).toBe(2.0);
    // Sliced cue_2 end at localSplit 4.0:
    expect(piece1.lipSyncData?.cues[1].start).toBe(3.0);
    expect(piece1.lipSyncData?.cues[1].end).toBe(4.0);

    expect(piece2.start).toBe(14.0);
    expect(piece2.duration).toBe(2.0);
    expect(piece2.lipSyncData?.cues.length).toBe(1);
    // Rebased cue_2 remainder in piece2:
    expect(piece2.lipSyncData?.cues[0].start).toBe(0.0);
    expect(piece2.lipSyncData?.cues[0].end).toBe(0.5);
    expect(piece2.lipSyncData?.cues[0].shape).toBe('B');

    // Reset and Test C: Split after all cues (at global 15.5s -> local 5.5s)
    store.newProject('Test After Cues Split');
    store.addVisualClip('V1', originalClip);
    store.splitClip('vis_offset', 15.5);

    track = useEditorStore.getState().project.tracks.find((t) => t.id === 'V1')!;
    piece1 = track.clips[0];
    piece2 = track.clips[1];

    expect(piece1.lipSyncData?.cues.length).toBe(2); // Retains both cues intact
    expect(piece2.lipSyncData?.cues.length).toBe(0); // Empty (after all cues)
  });

  it('extracts and caches normalized waveform peaks from AudioBuffer (Feature 06)', () => {
    // Synthetic AudioBuffer: 44100 samples at 44.1kHz (1.0s duration)
    const sampleRate = 44100;
    const channelData = new Float32Array(sampleRate);
    // Sine wave peak amplitude 0.75
    for (let i = 0; i < sampleRate; i++) {
      channelData[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0.75;
    }

    const mockBuffer = {
      duration: 1.0,
      sampleRate,
      numberOfChannels: 1,
      getChannelData: () => channelData,
    } as unknown as AudioBuffer;

    const peaks = extractWaveformPeaks(mockBuffer, 20);
    expect(peaks.length).toBe(20);
    // Peak values should be close to 0.75
    expect(peaks[0]).toBeGreaterThan(0.6);
    expect(peaks[0]).toBeLessThanOrEqual(1.0);

    // Cached peak retrieval
    const cached = getCachedPeaks('asset_mock', mockBuffer);
    expect(cached).toBeDefined();
    expect(cached?.length).toBe(20);
    // Same instance from cache
    expect(getCachedPeaks('asset_mock')).toBe(cached);

    // Eviction test
    clearWaveformCache('asset_mock');
    expect(getCachedPeaks('asset_mock')).toBeNull();
  });
});
