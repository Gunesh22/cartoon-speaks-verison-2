import { ContentBounds } from '../../types/assets';

export interface BoundingBoxDetectionResult {
  hasContent: boolean;
  bounds: ContentBounds;
  visibleCount: number;
  upperLip: {
    x: number; // pixel in cropped image
    y: number; // pixel in cropped image
  };
  suggestedAnchor: {
    anchorX: number; // 0..1 normalized
    anchorY: number; // 0..1 normalized
  };
  warning?: string;
}

/**
 * Pure algorithm to analyze an RGBA pixel buffer and identify the exact
 * visible bounding box of the mouth, avoiding transparent borders.
 * Operates in both browser and headless environments.
 */
export function detectMouthBounds(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  alphaThreshold: number = 20
): BoundingBoxDetectionResult {
  if (width <= 0 || height <= 0 || data.length === 0) {
    return {
      hasContent: false,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      visibleCount: 0,
      upperLip: { x: 0, y: 0 },
      suggestedAnchor: { anchorX: 0.5, anchorY: 0.5 },
      warning: 'Empty image buffer',
    };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let visibleCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];

      if (alpha > alphaThreshold) {
        visibleCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (visibleCount === 0 || maxX < minX || maxY < minY) {
    return {
      hasContent: false,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      visibleCount: 0,
      upperLip: { x: width / 2, y: height / 2 },
      suggestedAnchor: { anchorX: 0.5, anchorY: 0.5 },
      warning: 'No visible pixels detected in region',
    };
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;

  // Upper lip line estimation:
  // We scan the top ~20% of the visible mouth content to find the horizontal center of the upper lip
  const topSliceLimit = Math.min(maxY, minY + Math.max(3, Math.round(contentHeight * 0.25)));
  let topSliceSumX = 0;
  let topSliceCount = 0;

  for (let y = minY; y <= topSliceLimit; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > alphaThreshold) {
        topSliceSumX += x;
        topSliceCount++;
      }
    }
    if (topSliceCount > 8) break;
  }

  const upperLipX = topSliceCount > 0 ? topSliceSumX / topSliceCount : (minX + maxX) / 2;
  const upperLipY = minY + Math.min(6, contentHeight * 0.15);

  const anchorX = Number((upperLipX / width).toFixed(4));
  const anchorY = Number((upperLipY / height).toFixed(4));

  let warning: string | undefined;
  if (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) {
    warning = 'Artwork touches outer boundary of crop';
  }

  return {
    hasContent: true,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: contentWidth,
      height: contentHeight,
    },
    visibleCount,
    upperLip: { x: upperLipX, y: upperLipY },
    suggestedAnchor: {
      anchorX: Math.max(0, Math.min(1, anchorX)),
      anchorY: Math.max(0, Math.min(1, anchorY)),
    },
    warning,
  };
}
