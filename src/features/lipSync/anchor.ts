/**
 * Anchor & Coordinate Math for Mouth Positioning
 * 
 * Coordinate definitions:
 * - Character Mouth Placement Point: (character.x + character.width * mouthAnchor.x, character.y + character.height * mouthAnchor.y)
 * - Mouth Sprite Anchor Point: Normalized (0..1) point within the cropped mouth sprite (defaults to center of upper lip).
 * - When rendering, the Mouth Sprite's anchor is pinned precisely to the Character's mouth placement point.
 * - This ensures that changing mouth shapes (e.g. from closed 'A' to wide open 'D') does not shift the character's upper lip position.
 */

export interface RenderTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface CharacterPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface MouthAnchorNormalized {
  x: number; // 0..1 relative to character
  y: number; // 0..1 relative to character
}

export interface SpriteAnchorNormalized {
  anchorX: number; // 0..1 relative to mouth sprite
  anchorY: number; // 0..1 relative to mouth sprite
}

export interface ComputedMouthDrawRect {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  targetPinX: number;
  targetPinY: number;
  rotation: number;
}

/**
 * Calculates the exact canvas destination coordinates to render a mouth sprite onto a character.
 * 
 * @param character Character dimensions and position on canvas
 * @param characterMouthAnchor Character's normalized mouth anchor (where mouth should go, 0..1)
 * @param mouthNaturalWidth Natural pixel width of the mouth sprite
 * @param mouthNaturalHeight Natural pixel height of the mouth sprite
 * @param mouthScale Scale factor relative to character width (e.g. 0.25 = 25% of character width)
 * @param spriteAnchor Mouth sprite's internal anchor (normalized 0..1 within sprite)
 * @param extraRotation Additional mouth rotation in degrees (optional)
 * @param referenceCellWidth Optional grid cell width from sprite sheet for proportional scaling (preserves open vs closed mouth sizes)
 * @param shapeScaleMultiplier Optional fine-tune scale multiplier for this specific shape (default 1.0)
 * @param shapeAnchorOffset Optional fine-tune anchor offset for this specific shape { x, y }
 */
export function calculateMouthDrawRect(
  character: CharacterPlacement,
  characterMouthAnchor: MouthAnchorNormalized,
  mouthNaturalWidth: number,
  mouthNaturalHeight: number,
  mouthScale: number = 0.25,
  spriteAnchor: SpriteAnchorNormalized = { anchorX: 0.5, anchorY: 0.5 },
  extraRotation: number = 0,
  referenceCellWidth?: number,
  shapeScaleMultiplier: number = 1.0,
  shapeAnchorOffset?: { x: number; y: number }
): ComputedMouthDrawRect {
  // 1. Calculate target pin point on canvas in character space (pre-character rotation)
  const pinOffsetX = shapeAnchorOffset?.x || 0;
  const pinOffsetY = shapeAnchorOffset?.y || 0;
  const targetPinX = character.x + character.width * (characterMouthAnchor.x + pinOffsetX);
  const targetPinY = character.y + character.height * (characterMouthAnchor.y + pinOffsetY);

  // 2. Rendered mouth width based on scale relative to character width
  // If referenceCellWidth is provided, scale is PROPORTIONAL to natural sprite dimensions
  // relative to the reference cell (e.g. 512x512). This preserves the natural proportions
  // where wide open mouths ('D') are wide and small closed/pursed mouths ('A', 'O', 'X') are small!
  let drawWidth: number;
  let drawHeight: number;

  const aspect = mouthNaturalWidth > 0 && mouthNaturalHeight > 0
    ? mouthNaturalWidth / mouthNaturalHeight
    : 1;

  if (referenceCellWidth && referenceCellWidth > 0) {
    const scaleFactor = (character.width * mouthScale) / referenceCellWidth;
    drawWidth = mouthNaturalWidth * scaleFactor * shapeScaleMultiplier;
    drawHeight = mouthNaturalHeight * scaleFactor * shapeScaleMultiplier;
  } else {
    drawWidth = character.width * mouthScale * shapeScaleMultiplier;
    drawHeight = drawWidth / aspect;
  }

  // 3. Anchor offset from mouth top-left
  const anchorOffsetX = drawWidth * spriteAnchor.anchorX;
  const anchorOffsetY = drawHeight * spriteAnchor.anchorY;

  // 4. Draw position (top-left) relative to canvas when no rotation is applied
  const drawX = targetPinX - anchorOffsetX;
  const drawY = targetPinY - anchorOffsetY;

  const totalRotation = (character.rotation || 0) + extraRotation;

  return {
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    targetPinX,
    targetPinY,
    rotation: totalRotation,
  };
}

/**
 * Recalculates anchor coordinates when a sprite is cropped from a larger cell.
 * Given an anchor in cell coordinates, this updates it to be normalized to the new cropped rect.
 */
export function recalculateCroppedAnchor(
  cellAnchorX: number, // 0..1 in cell
  cellAnchorY: number, // 0..1 in cell
  cellWidth: number,
  cellHeight: number,
  cropOffsetX: number, // Crop start X relative to cell
  cropOffsetY: number, // Crop start Y relative to cell
  croppedWidth: number,
  croppedHeight: number
): { anchorX: number; anchorY: number } {
  const pixelXInCell = cellAnchorX * cellWidth;
  const pixelYInCell = cellAnchorY * cellHeight;

  const pixelXInCrop = pixelXInCell - cropOffsetX;
  const pixelYInCrop = pixelYInCell - cropOffsetY;

  const normX = croppedWidth > 0 ? pixelXInCrop / croppedWidth : 0.5;
  const normY = croppedHeight > 0 ? pixelYInCrop / croppedHeight : 0.5;

  return {
    anchorX: Math.max(0, Math.min(1, Number(normX.toFixed(4)))),
    anchorY: Math.max(0, Math.min(1, Number(normY.toFixed(4)))),
  };
}
