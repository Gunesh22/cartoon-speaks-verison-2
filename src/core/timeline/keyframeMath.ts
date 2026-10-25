import { TransformKeyframe, VisualClip } from '../../types/timeline';

export interface EvaluatedTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

/**
 * Evaluates the visual clip's transform at a specific local clip time (in seconds).
 * If the clip has no keyframes, returns the static clip transforms.
 * If keyframes exist, smoothly interpolates position, dimensions, rotation, and opacity.
 */
export function getClipTransformAtTime(
  clip: VisualClip,
  localTime: number
): EvaluatedTransform {
  const base: EvaluatedTransform = {
    x: clip.x,
    y: clip.y,
    width: clip.width,
    height: clip.height,
    rotation: clip.rotation || 0,
    opacity: clip.opacity ?? 1.0,
  };

  const keyframes = clip.keyframes;
  if (!keyframes || keyframes.length === 0) {
    return base;
  }

  // Ensure keyframes are sorted by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Time before or at first keyframe
  const first = sorted[0];
  if (localTime <= first.time) {
    return {
      x: first.x !== undefined ? first.x : base.x,
      y: first.y !== undefined ? first.y : base.y,
      width: first.width !== undefined ? first.width : base.width,
      height: first.height !== undefined ? first.height : base.height,
      rotation: first.rotation !== undefined ? first.rotation : base.rotation,
      opacity: first.opacity !== undefined ? first.opacity : base.opacity,
    };
  }

  // Time after or at last keyframe
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return {
      x: last.x !== undefined ? last.x : base.x,
      y: last.y !== undefined ? last.y : base.y,
      width: last.width !== undefined ? last.width : base.width,
      height: last.height !== undefined ? last.height : base.height,
      rotation: last.rotation !== undefined ? last.rotation : base.rotation,
      opacity: last.opacity !== undefined ? last.opacity : base.opacity,
    };
  }

  // Find bounding keyframes [kPrev, kNext]
  let prev = first;
  let next = last;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (localTime >= sorted[i].time && localTime <= sorted[i + 1].time) {
      prev = sorted[i];
      next = sorted[i + 1];
      break;
    }
  }

  const span = next.time - prev.time;
  if (span <= 0.0001) {
    return {
      x: next.x !== undefined ? next.x : base.x,
      y: next.y !== undefined ? next.y : base.y,
      width: next.width !== undefined ? next.width : base.width,
      height: next.height !== undefined ? next.height : base.height,
      rotation: next.rotation !== undefined ? next.rotation : base.rotation,
      opacity: next.opacity !== undefined ? next.opacity : base.opacity,
    };
  }

  let alpha = Math.max(0, Math.min(1, (localTime - prev.time) / span));

  // Apply easing
  const easing = prev.easing || 'linear';
  if (easing === 'ease-in-out') {
    // Hermite smoothstep 3a^2 - 2a^3
    alpha = alpha * alpha * (3 - 2 * alpha);
  } else if (easing === 'hold') {
    alpha = 0;
  }

  const interpolate = (pStart?: number, pEnd?: number, defaultVal: number = 0): number => {
    const s = pStart !== undefined ? pStart : defaultVal;
    const e = pEnd !== undefined ? pEnd : s;
    return s + (e - s) * alpha;
  };

  return {
    x: Number(interpolate(prev.x, next.x, base.x).toFixed(2)),
    y: Number(interpolate(prev.y, next.y, base.y).toFixed(2)),
    width: Math.max(10, Number(interpolate(prev.width, next.width, base.width).toFixed(2))),
    height: Math.max(10, Number(interpolate(prev.height, next.height, base.height).toFixed(2))),
    rotation: Number(interpolate(prev.rotation, next.rotation, base.rotation).toFixed(2)),
    opacity: Math.max(0, Math.min(1, Number(interpolate(prev.opacity, next.opacity, base.opacity).toFixed(3)))),
  };
}

/**
 * Adds or updates a keyframe at the given time.
 * If a keyframe already exists within 40ms of `time`, it is updated in place.
 */
export function setKeyframe(
  keyframes: TransformKeyframe[] = [],
  time: number,
  properties: Partial<TransformKeyframe>
): TransformKeyframe[] {
  const cleanTime = Number(Math.max(0, time).toFixed(3));
  const existingIdx = keyframes.findIndex((k) => Math.abs(k.time - cleanTime) < 0.04);

  if (existingIdx !== -1) {
    const updated = [...keyframes];
    updated[existingIdx] = {
      ...updated[existingIdx],
      ...properties,
      time: cleanTime,
    };
    return updated.sort((a, b) => a.time - b.time);
  }

  const newKf: TransformKeyframe = {
    id: `kf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    time: cleanTime,
    easing: 'linear',
    ...properties,
  };

  return [...keyframes, newKf].sort((a, b) => a.time - b.time);
}

/**
 * Removes a keyframe by ID.
 */
export function deleteKeyframe(
  keyframes: TransformKeyframe[] = [],
  keyframeId: string
): TransformKeyframe[] {
  return keyframes.filter((k) => k.id !== keyframeId);
}
