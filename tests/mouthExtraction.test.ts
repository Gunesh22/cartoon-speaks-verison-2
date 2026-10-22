import { describe, it, expect } from 'vitest';
import { detectMouthBounds } from '../src/features/lipSync/mouthBounds';
import {
  generateGridCells,
  analyzeAndCropCell,
} from '../src/features/lipSync/spriteCropper';
import {
  calculateMouthDrawRect,
  recalculateCroppedAnchor,
} from '../src/features/lipSync/anchor';

describe('Mouth Extraction and Bounds Detection Tests', () => {
  it('generates standard 3x3 grid cells for sprite sheet', () => {
    const cells = generateGridCells(300, 300, 3, 3);
    expect(cells.length).toBe(9);
    expect(cells[0].label).toBe('A');
    expect(cells[0].cellRect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(cells[8].label).toBe('X');
    expect(cells[8].cellRect).toEqual({ x: 200, y: 200, width: 100, height: 100 });
  });

  it('detects precise visible bounds in synthetic RGBA image with transparent margins', () => {
    // 50x50 image with transparent margins, containing a visible 20x10 mouth from x=15..34, y=20..29
    const width = 50;
    const height = 50;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 20; y <= 29; y++) {
      for (let x = 15; x <= 34; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 255;     // R
        data[idx + 1] = 0;   // G
        data[idx + 2] = 0;   // B
        data[idx + 3] = 255; // Alpha
      }
    }

    const result = detectMouthBounds(data, width, height);

    expect(result.hasContent).toBe(true);
    expect(result.bounds.minX).toBe(15);
    expect(result.bounds.maxX).toBe(34);
    expect(result.bounds.minY).toBe(20);
    expect(result.bounds.maxY).toBe(29);
    expect(result.bounds.width).toBe(20);
    expect(result.bounds.height).toBe(10);
    expect(result.visibleCount).toBe(200);

    // Anchor should be horizontally centered around the content center
    expect(result.suggestedAnchor.anchorX).toBeCloseTo(0.49, 1);
  });

  it('correctly reports empty / fully transparent cell as invalid', () => {
    const data = new Uint8ClampedArray(40 * 40 * 4); // all 0 alpha
    const result = detectMouthBounds(data, 40, 40);

    expect(result.hasContent).toBe(false);
    expect(result.visibleCount).toBe(0);
    expect(result.warning).toBeDefined();
  });

  it('crops cell content and adjusts tight crop rect without arbitrary padding overflow', () => {
    const sheetW = 100;
    const sheetH = 100;
    const sheetData = new Uint8ClampedArray(sheetW * sheetH * 4);

    // Visible content in the cell from x=20..40, y=20..35
    for (let y = 20; y <= 35; y++) {
      for (let x = 20; x <= 40; x++) {
        const idx = (y * sheetW + x) * 4;
        sheetData[idx + 3] = 255;
      }
    }

    const cellRect = { x: 0, y: 0, width: 50, height: 50 };
    const analysis = analyzeAndCropCell({ data: sheetData, width: sheetW, height: sheetH }, cellRect, 4);

    expect(analysis.hasContent).toBe(true);
    expect(analysis.tightCropRect.width).toBe(21 + 8); // 21px content + 8px padding (4 left, 4 right)
    expect(analysis.tightCropRect.height).toBe(16 + 8); // 16px content + 8px padding (4 top, 4 bottom)
  });

  it('preserves anchor coordinates when recalculating after cropping', () => {
    // If anchor is centered in cell (0.5, 0.5) of 100x100 (at px 50, 50),
    // and cropped rect starts at (25, 25) with dimensions 50x50,
    // the anchor within the cropped rect must still be (0.5, 0.5)!
    const updated = recalculateCroppedAnchor(
      0.5,
      0.5,
      100,
      100,
      25,
      25,
      50,
      50
    );

    expect(updated.anchorX).toBe(0.5);
    expect(updated.anchorY).toBe(0.5);
  });

  it('calculates stable mouth draw rect on character across scaling and rotation', () => {
    const character = { x: 100, y: 100, width: 400, height: 400, rotation: 0 };
    const charAnchor = { x: 0.5, y: 0.6 }; // mouth target on character
    const mouthW = 100;
    const mouthH = 50;
    const mouthScale = 0.25; // 25% of character width = 100px
    const spriteAnchor = { anchorX: 0.5, anchorY: 0.5 };

    const rect = calculateMouthDrawRect(
      character,
      charAnchor,
      mouthW,
      mouthH,
      mouthScale,
      spriteAnchor
    );

    expect(rect.targetPinX).toBe(300); // 100 + 400 * 0.5 = 300
    expect(rect.targetPinY).toBe(340); // 100 + 400 * 0.6 = 340
    expect(rect.drawWidth).toBe(100);
    expect(rect.drawHeight).toBe(50);
    expect(rect.drawX).toBe(250); // 300 - 50 = 250
    expect(rect.drawY).toBe(315); // 340 - 25 = 315
  });

  it('guarantees that cropped mouth sprite defaults to (0.5, 0.5) center anchor for balanced placement', () => {
    const sheetW = 80;
    const sheetH = 80;
    const sheetData = new Uint8ClampedArray(sheetW * sheetH * 4);

    // Asymmetric mouth content (e.g. anime slit mouth biased to right side)
    for (let y = 30; y <= 35; y++) {
      for (let x = 40; x <= 65; x++) {
        const idx = (y * sheetW + x) * 4;
        sheetData[idx + 3] = 255;
      }
    }

    const cellRect = { x: 0, y: 0, width: 80, height: 80 };
    const analysis = analyzeAndCropCell({ data: sheetData, width: sheetW, height: sheetH }, cellRect, 4);

    expect(analysis.hasContent).toBe(true);
    // Crucial bug fix: must default to center (0.5, 0.5) instead of right-biased heuristic
    expect(analysis.anchorX).toBe(0.5);
    expect(analysis.anchorY).toBe(0.5);
  });

  it('correctly calculates rotation and preserves target pin coordinate when mouthRotation is applied', () => {
    const character = { x: 200, y: 150, width: 300, height: 400, rotation: 10 };
    const charAnchor = { x: 0.5, y: 0.7 };
    const mouthW = 60;
    const mouthH = 30;
    const mouthScale = 0.2;
    const spriteAnchor = { anchorX: 0.5, anchorY: 0.5 };
    const mouthRotation = -25; // 25 degrees counter-clockwise

    const rect = calculateMouthDrawRect(
      character,
      charAnchor,
      mouthW,
      mouthH,
      mouthScale,
      spriteAnchor,
      mouthRotation
    );

    // Target pin stays identical regardless of rotation
    expect(rect.targetPinX).toBe(200 + 300 * 0.5); // 350
    expect(rect.targetPinY).toBe(150 + 400 * 0.7); // 430
    // Total rotation combines character rotation + mouth extra rotation
    expect(rect.rotation).toBe(-15); // 10 + (-25) = -15
  });

  it('proportional scaling preserves natural size difference between small (O/A) and large (D) shapes', () => {
    const character = { x: 0, y: 0, width: 400, height: 400 };
    const charAnchor = { x: 0.5, y: 0.5 };
    const spriteAnchor = { anchorX: 0.5, anchorY: 0.5 };
    const referenceCellWidth = 300; // 300px cell width on sprite sheet
    const mouthScale = 0.25; // 25% of character width = 100px base span

    // Shape O (small pursed mouth: 30x30 on sprite sheet)
    const rectO = calculateMouthDrawRect(
      character,
      charAnchor,
      30,
      30,
      mouthScale,
      spriteAnchor,
      0,
      referenceCellWidth
    );

    // Shape D (large screaming open mouth: 180x120 on sprite sheet)
    const rectD = calculateMouthDrawRect(
      character,
      charAnchor,
      180,
      120,
      mouthScale,
      spriteAnchor,
      0,
      referenceCellWidth
    );

    // Shape O is NOT stretched to 100px! It stays proportionally small (10px wide)
    expect(rectO.drawWidth).toBeCloseTo(10, 1);
    expect(rectO.drawHeight).toBeCloseTo(10, 1);

    // Shape D stays wide and open (60px wide)
    expect(rectD.drawWidth).toBeCloseTo(60, 1);
    expect(rectD.drawHeight).toBeCloseTo(40, 1);

    // Shape D is exactly 6x wider than Shape O, exactly matching the 180 vs 30 ratio on the sprite sheet!
    expect(rectD.drawWidth / rectO.drawWidth).toBeCloseTo(6.0, 1);
  });

  it('allows fine-tuning shape scale multiplier and offset for individual mouths', () => {
    const character = { x: 100, y: 100, width: 400, height: 400 };
    const charAnchor = { x: 0.5, y: 0.5 };
    const spriteAnchor = { anchorX: 0.5, anchorY: 0.5 };
    const referenceCellWidth = 200;
    const mouthScale = 0.25;

    // Default 100% scale
    const baseRect = calculateMouthDrawRect(
      character,
      charAnchor,
      100,
      50,
      mouthScale,
      spriteAnchor,
      0,
      referenceCellWidth
    );

    // Fine-tuned 120% scale with vertical offset +0.02
    const tunedRect = calculateMouthDrawRect(
      character,
      charAnchor,
      100,
      50,
      mouthScale,
      spriteAnchor,
      0,
      referenceCellWidth,
      1.2,
      { x: 0, y: 0.02 }
    );

    expect(tunedRect.drawWidth).toBeCloseTo(baseRect.drawWidth * 1.2, 1);
    expect(tunedRect.targetPinY).toBe(baseRect.targetPinY + 400 * 0.02);
  });
});
