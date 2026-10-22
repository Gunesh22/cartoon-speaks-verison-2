import { describe, it, expect } from 'vitest';
import {
  timeToFrame,
  frameToTime,
  getClipEndTime,
  isClipActiveAtTime,
  moveVisualClip,
  trimClipStart,
  trimClipEnd,
  validateTracks,
  getActiveVisualClipsInRenderOrder,
  MIN_CLIP_DURATION,
  TRACK_RENDER_ORDER,
  calculateProjectDuration,
  calculateFitToScreen,
} from '../src/core/timeline/timelineMath';
import { VisualClip, Track } from '../src/types/timeline';
import { useEditorStore } from '../src/state/editorStore';

describe('Timeline Engine Tests', () => {
  it('converts between time and frame numbers accurately at 30 and 60 fps', () => {
    expect(timeToFrame(0, 30)).toBe(0);
    expect(timeToFrame(1.0, 30)).toBe(30);
    expect(timeToFrame(0.5, 30)).toBe(15);
    expect(timeToFrame(1.5, 60)).toBe(90);

    expect(frameToTime(0, 30)).toBe(0);
    expect(frameToTime(30, 30)).toBe(1.0);
    expect(frameToTime(45, 30)).toBe(1.5);
  });

  it('calculates clip start and end boundaries accurately', () => {
    const clip = { start: 2.5, duration: 4.0 };
    expect(getClipEndTime(clip)).toBe(6.5);
  });

  it('determines clip visibility at start, inside, and end boundaries', () => {
    const clip = { start: 1.0, duration: 3.0, visible: true };

    expect(isClipActiveAtTime(clip, 0.99)).toBe(false);
    expect(isClipActiveAtTime(clip, 1.0)).toBe(true);  // Inclusive start
    expect(isClipActiveAtTime(clip, 2.5)).toBe(true);  // Inside
    expect(isClipActiveAtTime(clip, 3.99)).toBe(true);
    expect(isClipActiveAtTime(clip, 4.0)).toBe(false); // Exclusive end
  });

  it('moves a clip and clamps start to zero', () => {
    const clip: VisualClip = {
      id: 'c1',
      assetId: 'a1',
      start: 5.0,
      duration: 3.0,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    };

    const moved = moveVisualClip(clip, -2.0);
    expect(moved.start).toBe(0);

    const movedForward = moveVisualClip(clip, 8.2);
    expect(movedForward.start).toBe(8.2);
    expect(movedForward.duration).toBe(3.0);
  });

  it('snaps clip to nearby targets during movement', () => {
    const clip: VisualClip = {
      id: 'c1',
      assetId: 'a1',
      start: 5.0,
      duration: 2.0,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    };

    const targets = [0, 4.0, 7.0, 10.0];
    // Proposed start 4.08 is within snap threshold (0.15s) of target 4.0
    const snapped = moveVisualClip(clip, 4.08, targets, 0.15);
    expect(snapped.start).toBe(4.0);
  });

  it('trims start of clip preserving the end point and enforcing minimum duration', () => {
    const clip: VisualClip = {
      id: 'c1',
      assetId: 'a1',
      start: 2.0,
      duration: 4.0, // Ends at 6.0
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    };

    const trimmed = trimClipStart(clip, 3.5);
    expect(trimmed.start).toBe(3.5);
    expect(trimmed.duration).toBe(2.5); // 6.0 - 3.5 = 2.5

    // Attempting to trim start past the end point clamps to MIN_CLIP_DURATION
    const overTrimmed = trimClipStart(clip, 7.0);
    expect(overTrimmed.duration).toBe(MIN_CLIP_DURATION);
    expect(overTrimmed.start + overTrimmed.duration).toBeCloseTo(6.0, 2);
  });

  it('trims end of clip enforcing minimum duration', () => {
    const clip: VisualClip = {
      id: 'c1',
      assetId: 'a1',
      start: 2.0,
      duration: 4.0,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      type: 'image',
    };

    const trimmed = trimClipEnd(clip, 8.0);
    expect(trimmed.duration).toBe(6.0);

    const clamped = trimClipEnd(clip, 1.0); // Less than start
    expect(clamped.duration).toBe(MIN_CLIP_DURATION);
  });

  it('strictly enforces the four-track limit (V1, V2, V3, V4)', () => {
    const invalidTracks: any[] = [
      { id: 'V1', clips: [] },
      { id: 'V2', clips: [] },
      { id: 'V3', clips: [] },
      { id: 'V4', clips: [] },
      { id: 'V5', clips: [] },
      { id: 'ExtraTrack', clips: [] },
    ];

    const validated = validateTracks(invalidTracks);
    expect(validated.length).toBe(4);
    expect(validated.map((t) => t.id)).toEqual(['V1', 'V2', 'V3', 'V4']);
  });

  it('returns active clips in deterministic bottom-to-top rendering order (V1 -> V4)', () => {
    const clipV1: VisualClip = { id: 'clip1', assetId: 'a1', start: 0, duration: 5, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, visible: true, type: 'image' };
    const clipV2: VisualClip = { id: 'clip2', assetId: 'a2', start: 0, duration: 5, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, visible: true, type: 'image' };
    const clipV4: VisualClip = { id: 'clip4', assetId: 'a4', start: 0, duration: 5, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, visible: true, type: 'image' };

    const tracks: Track[] = [
      { id: 'V4', clips: [clipV4] },
      { id: 'V3', clips: [] },
      { id: 'V2', clips: [clipV2] },
      { id: 'V1', clips: [clipV1] },
    ];

    const active = getActiveVisualClipsInRenderOrder(tracks, 2.0);
    expect(active.length).toBe(3);
    // Track render order must be V1 first (bottom layer), then V2, then V4 (top layer)
    expect(active[0].id).toBe('clip1');
    expect(active[1].id).toBe('clip2');
    expect(active[2].id).toBe('clip4');
  });

  it('automatically calculates and adjusts project duration to fit all clips', () => {
    // Empty project defaults to base minimum
    expect(calculateProjectDuration([], [], 5.0)).toBe(5.0);

    // Visual clip ending at 12.0s auto-expands duration
    const tracks: Track[] = [
      {
        id: 'V1',
        clips: [
          { id: 'c1', assetId: 'a1', start: 2.0, duration: 10.0, x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, visible: true, type: 'image' }
        ]
      },
      { id: 'V2', clips: [] },
      { id: 'V3', clips: [] },
      { id: 'V4', clips: [] }
    ];
    expect(calculateProjectDuration(tracks, [], 5.0)).toBe(12.5);

    // Audio clip ending even later at 22.0s auto-expands duration
    const audioClips = [
      { id: 'ac1', assetId: 'aud1', start: 0, duration: 22.0, volume: 1, trimStart: 0, trimEnd: 22.0 }
    ];
    expect(calculateProjectDuration(tracks, audioClips, 5.0)).toBe(22.5);
  });

  it('calculates fit-to-screen maintaining aspect ratio and centering on canvas', () => {
    // 4:3 photo (800x600) into 16:9 canvas (1920x1080)
    const fit = calculateFitToScreen(800, 600, 1920, 1080, 'contain');
    expect(fit.height).toBe(1080);
    expect(fit.width).toBe(1440); // 800 * (1080/600) = 1440
    expect(fit.x).toBe(240); // (1920 - 1440) / 2 = 240
    expect(fit.y).toBe(0);

    // 16:9 photo (1920x1080) into 9:16 vertical canvas (1080x1920)
    const fitVertical = calculateFitToScreen(1920, 1080, 1080, 1920, 'contain');
    expect(fitVertical.width).toBe(1080);
    expect(fitVertical.height).toBe(608); // 1080 / (1920/1080) ~ 607.5
    expect(fitVertical.x).toBe(0);
    expect(fitVertical.y).toBe(656); // (1920 - 608) / 2 = 656
  });

  it('moves and trims audio clips and automatically adjusts project duration', () => {
    const store = useEditorStore.getState();
    store.newProject('Audio Timeline Test');
    store.addAudioClip({
      id: 'a1',
      assetId: 'audio_test_1',
      start: 1.0,
      duration: 5.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: 5.0,
    });

    expect(useEditorStore.getState().project.audioClips.length).toBe(1);
    expect(useEditorStore.getState().project.audioClips[0].start).toBe(1.0);

    // Move audio clip
    store.moveAudioClip('a1', 3.5);
    expect(useEditorStore.getState().project.audioClips[0].start).toBe(3.5);

    // Trim end
    store.trimAudioClip('a1', 'end', 7.0);
    expect(useEditorStore.getState().project.audioClips[0].duration).toBe(3.5); // 7.0 - 3.5 = 3.5

    // Trim start
    store.trimAudioClip('a1', 'start', 4.5);
    expect(useEditorStore.getState().project.audioClips[0].start).toBe(4.5);
    expect(useEditorStore.getState().project.audioClips[0].duration).toBe(2.5); // 7.0 - 4.5 = 2.5
    expect(useEditorStore.getState().project.audioClips[0].trimStart).toBe(1.0); // trimmed by 1.0s
  });
});
