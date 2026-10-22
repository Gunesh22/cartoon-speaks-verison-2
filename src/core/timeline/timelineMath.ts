import { Track, TrackId, VisualClip, AudioClip } from '../../types/timeline';

export const TRACK_RENDER_ORDER: TrackId[] = ['V1', 'V2', 'V3', 'V4']; // V1 bottom -> V4 top

export const MIN_CLIP_DURATION = 0.1; // 100ms minimum duration

/**
 * Converts a time in seconds to an exact frame index based on project FPS.
 */
export function timeToFrame(time: number, fps: number): number {
  return Math.round(Math.max(0, time) * fps);
}

/**
 * Converts a frame index to a time in seconds based on project FPS.
 */
export function frameToTime(frame: number, fps: number): number {
  return Math.max(0, frame) / Math.max(1, fps);
}

/**
 * Calculates the end time of any clip in seconds.
 */
export function getClipEndTime(clip: { start: number; duration: number }): number {
  return clip.start + clip.duration;
}

/**
 * Checks whether a clip is active/visible at a given global playhead time.
 */
export function isClipActiveAtTime(clip: { start: number; duration: number; visible?: boolean }, time: number): boolean {
  if (clip.visible === false) return false;
  return time >= clip.start && time < clip.start + clip.duration;
}

/**
 * Finds all snap targets (start & end points of existing visual clips and audio clips).
 */
export function getSnapTargets(
  tracks: Track[],
  audioClips: AudioClip[],
  ignoreClipId?: string
): number[] {
  const points = new Set<number>();
  points.add(0); // Zero point always snappable

  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === ignoreClipId) continue;
      points.add(clip.start);
      points.add(clip.start + clip.duration);
    }
  }

  for (const aClip of audioClips) {
    if (aClip.id === ignoreClipId) continue;
    points.add(aClip.start);
    points.add(aClip.start + aClip.duration);
  }

  return Array.from(points).sort((a, b) => a - b);
}

/**
 * Snaps a proposed time to the nearest target within a threshold distance (seconds).
 */
export function snapTimeToTargets(
  proposedTime: number,
  targets: number[],
  thresholdSeconds: number = 0.15
): number {
  let closest = proposedTime;
  let minDiff = thresholdSeconds;

  for (const target of targets) {
    const diff = Math.abs(proposedTime - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = target;
    }
  }

  return closest;
}

/**
 * Pure function to move a visual clip in time, optionally snapping start or end.
 */
export function moveVisualClip(
  clip: VisualClip,
  newStart: number,
  snapTargets: number[] = [],
  snapThreshold: number = 0.15
): VisualClip {
  let clampedStart = Math.max(0, newStart);

  if (snapTargets.length > 0) {
    // Try snapping start
    const snappedStart = snapTimeToTargets(clampedStart, snapTargets, snapThreshold);
    if (snappedStart !== clampedStart) {
      clampedStart = snappedStart;
    } else {
      // Try snapping end
      const proposedEnd = clampedStart + clip.duration;
      const snappedEnd = snapTimeToTargets(proposedEnd, snapTargets, snapThreshold);
      if (snappedEnd !== proposedEnd) {
        clampedStart = Math.max(0, snappedEnd - clip.duration);
      }
    }
  }

  return {
    ...clip,
    start: Number(clampedStart.toFixed(4)),
  };
}

/**
 * Pure function to trim the start (left edge) of a clip.
 */
export function trimClipStart(
  clip: VisualClip,
  newStart: number,
  maxStart?: number
): VisualClip {
  const oldEnd = clip.start + clip.duration;
  let start = Math.max(0, newStart);
  const upperLimit = maxStart !== undefined ? Math.min(oldEnd - MIN_CLIP_DURATION, maxStart) : oldEnd - MIN_CLIP_DURATION;
  start = Math.min(start, upperLimit);

  const duration = Math.max(MIN_CLIP_DURATION, oldEnd - start);

  return {
    ...clip,
    start: Number(start.toFixed(4)),
    duration: Number(duration.toFixed(4)),
  };
}

/**
 * Pure function to trim the end (right edge) of a clip.
 */
export function trimClipEnd(
  clip: VisualClip,
  newEnd: number
): VisualClip {
  const end = Math.max(clip.start + MIN_CLIP_DURATION, newEnd);
  const duration = end - clip.start;

  return {
    ...clip,
    duration: Number(duration.toFixed(4)),
  };
}

/**
 * Enforces the strict 4-track limit: guarantees that tracks are only V1, V2, V3, V4.
 */
export function validateTracks(tracks: Track[]): Track[] {
  const validIds: TrackId[] = ['V1', 'V2', 'V3', 'V4'];
  const trackMap = new Map<TrackId, VisualClip[]>();

  for (const id of validIds) {
    trackMap.set(id, []);
  }

  for (const track of tracks) {
    if (validIds.includes(track.id)) {
      trackMap.set(track.id, [...track.clips]);
    }
  }

  return validIds.map((id) => ({
    id,
    clips: trackMap.get(id) || [],
  }));
}

/**
 * Returns active clips across all tracks at a specific time, in exact rendering order (bottom to top).
 */
export function getActiveVisualClipsInRenderOrder(tracks: Track[], time: number): VisualClip[] {
  const activeClips: VisualClip[] = [];

  // Render from V1 (bottom) to V4 (top)
  for (const trackId of TRACK_RENDER_ORDER) {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) continue;

    for (const clip of track.clips) {
      if (isClipActiveAtTime(clip, time)) {
        activeClips.push(clip);
      }
    }
  }

  return activeClips;
}

/**
 * Automatically calculates the project duration to fit all clips across visual tracks
 * and the audio lane, with a small editing margin and minimum base.
 */
export function calculateProjectDuration(
  tracks: Track[],
  audioClips: AudioClip[],
  minBaseDuration: number = 5.0
): number {
  let maxEndTime = 0;

  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.start + clip.duration;
      if (end > maxEndTime) {
        maxEndTime = end;
      }
    }
  }

  for (const aClip of audioClips) {
    const end = aClip.start + aClip.duration;
    if (end > maxEndTime) {
      maxEndTime = end;
    }
  }

  if (maxEndTime <= 0) {
    return minBaseDuration;
  }

  // Adjust duration to exactly fit clips with a small 0.5s editing margin
  return Number(Math.max(minBaseDuration, maxEndTime + 0.5).toFixed(1));
}

/**
 * Calculates transform coordinates (x, y, width, height) to fit an image/clip
 * to the project canvas screen (contain by default, or cover).
 * Main photo scaling standard for automatic fit and manual fit-to-screen controls.
 */
export function calculateFitToScreen(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  mode: 'contain' | 'cover' = 'contain'
): { x: number; y: number; width: number; height: number } {
  const srcW = sourceWidth > 0 ? sourceWidth : canvasWidth;
  const srcH = sourceHeight > 0 ? sourceHeight : canvasHeight;

  const scale = mode === 'cover'
    ? Math.max(canvasWidth / srcW, canvasHeight / srcH)
    : Math.min(canvasWidth / srcW, canvasHeight / srcH);

  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);
  const x = Math.round((canvasWidth - targetW) / 2);
  const y = Math.round((canvasHeight - targetH) / 2);

  return { x, y, width: targetW, height: targetH };
}
