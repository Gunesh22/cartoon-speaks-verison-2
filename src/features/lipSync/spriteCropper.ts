import { CropRect, MouthSprite, ContentBounds } from '../../types/assets';
import { detectMouthBounds } from './mouthBounds';

export const STANDARD_RHUBARB_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
export const STANDARD_4X3_ANIME_LABELS = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'O', 'EXTRA_1', 'EXTRA_2'];

/**
 * Detects whether a sprite sheet is standard 3×3 or 4×3 anime grid based on image dimensions.
 */
export function detectSheetTemplate(
  width: number,
  height: number
): { columns: number; rows: number; labels: string[]; template: '3x3' | '4x3' } {
  if (width <= 0 || height <= 0) {
    return { columns: 3, rows: 3, labels: STANDARD_RHUBARB_LABELS, template: '3x3' };
  }
  const aspect = width / height;
  // If close to 4:3 (e.g. 2048x1536) -> 4 columns, 3 rows
  if (Math.abs(aspect - 4 / 3) < 0.15 || (width === 2048 && height === 1536)) {
    return { columns: 4, rows: 3, labels: STANDARD_4X3_ANIME_LABELS, template: '4x3' };
  }
  return { columns: 3, rows: 3, labels: STANDARD_RHUBARB_LABELS, template: '3x3' };
}

export interface GridCell {
  index: number;
  label: string;
  cellRect: CropRect;
}

/**
 * Generates regular grid cells for a sprite sheet.
 */
export function generateGridCells(
  imageWidth: number,
  imageHeight: number,
  columns: number = 3,
  rows: number = 3,
  labels: string[] = STANDARD_RHUBARB_LABELS
): GridCell[] {
  const cells: GridCell[] = [];
  const cellWidth = imageWidth / columns;
  const cellHeight = imageHeight / rows;

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (idx >= labels.length) break;
      cells.push({
        index: idx,
        label: labels[idx] || `Shape_${idx + 1}`,
        cellRect: {
          x: Math.round(c * cellWidth),
          y: Math.round(r * cellHeight),
          width: Math.round(cellWidth),
          height: Math.round(cellHeight),
        },
      });
      idx++;
    }
  }

  return cells;
}

export interface CroppedCellAnalysis {
  cellRect: CropRect;
  contentBounds: ContentBounds;
  tightCropRect: CropRect;
  anchorX: number; // 0..1 relative to tightCropRect
  anchorY: number; // 0..1 relative to tightCropRect
  hasContent: boolean;
  warning?: string;
}

/**
 * Pure function to analyze pixel data within a grid cell, find exact mouth bounds,
 * trim transparent margins (with small padding), and calculate the normalized anchor.
 */
export function analyzeAndCropCell(
  fullImageData: { data: Uint8ClampedArray | number[]; width: number; height: number },
  cell: CropRect,
  padding: number = 4
): CroppedCellAnalysis {
  const { width: imgW, height: imgH, data } = fullImageData;

  const startX = Math.max(0, Math.min(imgW - 1, Math.round(cell.x)));
  const startY = Math.max(0, Math.min(imgH - 1, Math.round(cell.y)));
  const endX = Math.min(imgW, Math.round(cell.x + cell.width));
  const endY = Math.min(imgH, Math.round(cell.y + cell.height));

  const cellW = endX - startX;
  const cellH = endY - startY;

  if (cellW <= 0 || cellH <= 0) {
    return {
      cellRect: cell,
      contentBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
      tightCropRect: cell,
      anchorX: 0.5,
      anchorY: 0.5,
      hasContent: false,
      warning: 'Cell is empty or out of bounds',
    };
  }

  // Extract cell pixel buffer
  const cellBuffer = new Uint8ClampedArray(cellW * cellH * 4);
  for (let y = 0; y < cellH; y++) {
    const srcRowStart = ((startY + y) * imgW + startX) * 4;
    const destRowStart = y * cellW * 4;
    for (let b = 0; b < cellW * 4; b++) {
      cellBuffer[destRowStart + b] = data[srcRowStart + b];
    }
  }

  const detection = detectMouthBounds(cellBuffer, cellW, cellH);

  if (!detection.hasContent) {
    return {
      cellRect: cell,
      contentBounds: detection.bounds,
      tightCropRect: cell,
      anchorX: 0.5,
      anchorY: 0.5,
      hasContent: false,
      warning: 'Cell contains no visible mouth pixels',
    };
  }

  // Add padding around content, clamped within the cell
  const padLeft = Math.min(padding, detection.bounds.minX);
  const padTop = Math.min(padding, detection.bounds.minY);
  const padRight = Math.min(padding, cellW - 1 - detection.bounds.maxX);
  const padBottom = Math.min(padding, cellH - 1 - detection.bounds.maxY);

  const tightCropX = startX + detection.bounds.minX - padLeft;
  const tightCropY = startY + detection.bounds.minY - padTop;
  const tightCropW = detection.bounds.width + padLeft + padRight;
  const tightCropH = detection.bounds.height + padTop + padBottom;

  // Center anchor (0.5, 0.5) by default within the cropped mouth sprite
  // Ensures mouth center aligns exactly with the target anchor placed on the character
  const anchorX = 0.5;
  const anchorY = 0.5;

  return {
    cellRect: cell,
    contentBounds: {
      minX: detection.bounds.minX - padLeft,
      minY: detection.bounds.minY - padTop,
      maxX: detection.bounds.maxX - padLeft,
      maxY: detection.bounds.maxY - padTop,
      width: detection.bounds.width,
      height: detection.bounds.height,
    },
    tightCropRect: {
      x: tightCropX,
      y: tightCropY,
      width: tightCropW,
      height: tightCropH,
    },
    anchorX,
    anchorY,
    hasContent: true,
    warning: detection.warning,
  };
}

/**
 * Browser-based helper to extract a single mouth sprite into an independent Blob and object URL.
 */
export async function cropSpriteToBlob(
  sourceImage: CanvasImageSource,
  cropRect: CropRect
): Promise<{ blob: Blob; url: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, cropRect.width);
  canvas.height = Math.max(1, cropRect.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for sprite cropping');
  }

  ctx.drawImage(
    sourceImage,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height
  );

  return new Promise<{ blob: Blob; url: string }>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to convert cropped sprite to Blob'));
        return;
      }
      const url = URL.createObjectURL(blob);
      resolve({ blob, url });
    }, 'image/png');
  });
}
