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

interface PixelComponent {
  pixelCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Identifies if a connected component is a grid border, ruler line, or slice frame
 * rather than internal character/mouth artwork.
 */
function isGridOrBorderLine(comp: PixelComponent, width: number, height: number): boolean {
  const compW = comp.maxX - comp.minX + 1;
  const compH = comp.maxY - comp.minY + 1;

  // Horizontal border/grid line touching top or bottom edge
  const isHorizontalBorder =
    compW >= width * 0.8 &&
    compH <= Math.max(4, Math.round(height * 0.06)) &&
    (comp.minY <= 1 || comp.maxY >= height - 2);

  // Vertical border/grid line touching left or right edge
  const isVerticalBorder =
    compH >= height * 0.8 &&
    compW <= Math.max(4, Math.round(width * 0.06)) &&
    (comp.minX <= 1 || comp.maxX >= width - 2);

  // Hollow perimeter box framing the whole cell
  const touchesAllEdges =
    comp.minX <= 1 && comp.maxX >= width - 2 && comp.minY <= 1 && comp.maxY >= height - 2;
  const isPerimeterFrame = touchesAllEdges && comp.pixelCount < compW * compH * 0.35;

  return isHorizontalBorder || isVerticalBorder || isPerimeterFrame;
}

/**
 * Pure algorithm to analyze an RGBA pixel buffer and identify the exact
 * visible bounding box of the mouth, avoiding transparent borders and
 * filtering out isolated corner text labels / noise.
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

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const components: PixelComponent[] = [];

  // Sample corners to detect uniform solid background (e.g. solid black or solid white)
  const cornerIndices = [0, width - 1, (height - 1) * width, (height - 1) * width + width - 1];
  let darkCorners = 0;
  let lightCorners = 0;
  for (const idx of cornerIndices) {
    const a = data[idx * 4 + 3];
    const r = data[idx * 4];
    const g = data[idx * 4 + 1];
    const b = data[idx * 4 + 2];
    if (a > 128) {
      if (r < 35 && g < 35 && b < 35) darkCorners++;
      else if (r > 220 && g > 220 && b > 220) lightCorners++;
    }
  }
  const isDarkBg = darkCorners >= 3;
  const isLightBg = lightCorners >= 3;

  function isVisiblePixel(pIdx: number): boolean {
    const a = data[pIdx * 4 + 3];
    if (a <= alphaThreshold) return false;
    if (isDarkBg) {
      const r = data[pIdx * 4];
      const g = data[pIdx * 4 + 1];
      const b = data[pIdx * 4 + 2];
      if (r < 35 && g < 35 && b < 35) return false;
    } else if (isLightBg) {
      const r = data[pIdx * 4];
      const g = data[pIdx * 4 + 1];
      const b = data[pIdx * 4 + 2];
      if (r > 220 && g > 220 && b > 220) return false;
    }
    return true;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = y * width + x;
      if (visited[pIdx]) continue;

      if (!isVisiblePixel(pIdx)) continue;

      // Start BFS from (x, y) to extract this connected component
      visited[pIdx] = 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = pIdx;

      let cMinX = x;
      let cMaxX = x;
      let cMinY = y;
      let cMaxY = y;
      let pixelCount = 0;

      while (head < tail) {
        const curr = queue[head++];
        pixelCount++;
        const cy = Math.floor(curr / width);
        const cx = curr % width;

        if (cx < cMinX) cMinX = cx;
        if (cx > cMaxX) cMaxX = cx;
        if (cy < cMinY) cMinY = cy;
        if (cy > cMaxY) cMaxY = cy;

        // 8-way adjacent neighbors
        const yStart = cy > 0 ? cy - 1 : 0;
        const yEnd = cy < height - 1 ? cy + 1 : height - 1;
        const xStart = cx > 0 ? cx - 1 : 0;
        const xEnd = cx < width - 1 ? cx + 1 : width - 1;

        for (let ny = yStart; ny <= yEnd; ny++) {
          for (let nx = xStart; nx <= xEnd; nx++) {
            const nIdx = ny * width + nx;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              if (isVisiblePixel(nIdx)) {
                queue[tail++] = nIdx;
              }
            }
          }
        }
      }

      components.push({
        pixelCount,
        minX: cMinX,
        minY: cMinY,
        maxX: cMaxX,
        maxY: cMaxY,
      });
    }
  }

  if (components.length === 0) {
    return {
      hasContent: false,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      visibleCount: 0,
      upperLip: { x: width / 2, y: height / 2 },
      suggestedAnchor: { anchorX: 0.5, anchorY: 0.5 },
      warning: 'No visible pixels detected in region',
    };
  }

  // Filter out outer grid lines, border lines, and framing rectangles
  const nonBorderComponents = components.filter((c) => !isGridOrBorderLine(c, width, height));
  // If non-border content exists, use it; if only border exists, do not treat border as mouth artwork
  if (nonBorderComponents.length === 0) {
    return {
      hasContent: false,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      visibleCount: 0,
      upperLip: { x: width / 2, y: height / 2 },
      suggestedAnchor: { anchorX: 0.5, anchorY: 0.5 },
      warning: 'Only grid or border lines detected',
    };
  }

  // Sort components descending by size
  nonBorderComponents.sort((a, b) => b.pixelCount - a.pixelCount);
  const largest = nonBorderComponents[0];

  let minX = largest.minX;
  let maxX = largest.maxX;
  let minY = largest.minY;
  let maxY = largest.maxY;
  let visibleCount = largest.pixelCount;

  // Proximity clustering: Include components that are part of the mouth
  // (e.g. teeth, tongue, lip highlights, or open-mouth secondary lip),
  // while ignoring disconnected, small corner letter labels and isolated noise.
  if (nonBorderComponents.length > 1) {
    const maxGap = Math.max(8, Math.round(Math.min(width, height) * 0.08));
    let clusterChanged = true;

    const remaining = nonBorderComponents.slice(1);
    const included = new Set<PixelComponent>();

    while (clusterChanged) {
      clusterChanged = false;
      for (const comp of remaining) {
        if (included.has(comp)) continue;

        const gapX = Math.max(0, comp.minX - maxX, minX - comp.maxX);
        const gapY = Math.max(0, comp.minY - maxY, minY - comp.maxY);
        const gap = Math.max(gapX, gapY);

        const isAdjacent = gap <= maxGap;
        const isSignificantArtPart =
          comp.pixelCount >= largest.pixelCount * 0.35 && gap <= maxGap * 3;

        if (isAdjacent || isSignificantArtPart) {
          included.add(comp);
          if (comp.minX < minX) minX = comp.minX;
          if (comp.maxX > maxX) maxX = comp.maxX;
          if (comp.minY < minY) minY = comp.minY;
          if (comp.maxY > maxY) maxY = comp.maxY;
          visibleCount += comp.pixelCount;
          clusterChanged = true;
        }
      }
    }
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;

  // Upper lip line estimation:
  // We scan the top ~25% of the visible mouth content to find the horizontal center of the upper lip
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
