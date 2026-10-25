import { EditorProject } from '../../types/project';
import { VisualClip } from '../../types/timeline';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { getActiveVisualClipsInRenderOrder } from '../timeline/timelineMath';
import { calculateMouthDrawRect } from '../../features/lipSync/anchor';
import { getImageElement } from '../assets/assetDb';
import { getClipTransformAtTime, EvaluatedTransform } from '../timeline/keyframeMath';

export interface RenderContext {
  canvas: HTMLCanvasElement;
  project: EditorProject;
  time: number;
  assets: Map<string, EditorAsset>;
  mouthSets: Map<string, MouthSetAsset>;
  showCheckerboard?: boolean;
  transparent?: boolean;
}

/**
 * Draws a standard transparent checkerboard pattern onto the canvas.
 */
export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize: number = 24
): void {
  ctx.save();
  const color1 = '#1c1d21';
  const color2 = '#26282e';

  for (let y = 0; y < height; y += gridSize) {
    for (let x = 0; x < width; x += gridSize) {
      ctx.fillStyle = ((x / gridSize + y / gridSize) % 2 === 0) ? color1 : color2;
      ctx.fillRect(x, y, gridSize, gridSize);
    }
  }
  ctx.restore();
}

/**
 * Renders a clean composition frame at the specified project time.
 * This function produces the exact clean visual output used for both Preview and Video Export.
 */
export async function renderCompositionFrame(ctx: CanvasRenderingContext2D, context: RenderContext): Promise<void> {
  const { project, time, assets, mouthSets, showCheckerboard = false, transparent = false } = context;
  const { width, height } = project;

  ctx.clearRect(0, 0, width, height);

  if (transparent) {
    // Preserve transparent alpha background for WebM alpha exports (Feature 14)
  } else if (showCheckerboard) {
    drawCheckerboard(ctx, width, height);
  } else {
    // Solid dark canvas backdrop
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, height);
  }

  // Active visual clips in deterministic order (V1 bottom to V4 top)
  const activeClips = getActiveVisualClipsInRenderOrder(project.tracks, time);

  for (const clip of activeClips) {
    await renderVisualClip(ctx, clip, time, assets, mouthSets);
  }
}

/**
 * Calculates subtle procedural idle motion (breathing oscillation and subtle head sway)
 * for a character layer. Deterministic function of local clip time (Feature 03).
 */
export function calculateIdleMotion(localTime: number): {
  offsetX: number;
  offsetY: number;
  tiltDeg: number;
} {
  if (localTime < 0) return { offsetX: 0, offsetY: 0, tiltDeg: 0 };
  // Gentle breathing cycle (~0.35 Hz)
  const breathY = Math.sin(localTime * 2.2) * 1.8;
  // Subtle horizontal sway (~0.22 Hz)
  const swayX = Math.sin(localTime * 1.4) * 0.8;
  // Subtle head tilt (~0.15 Hz, +/- 0.45 deg)
  const tiltDeg = Math.sin(localTime * 0.9) * 0.45;

  return { offsetX: swayX, offsetY: breathY, tiltDeg };
}

/**
 * Renders an individual visual clip (image or lipSync) onto the canvas context.
 */
export async function renderVisualClip(
  ctx: CanvasRenderingContext2D,
  clip: VisualClip,
  globalTime: number,
  assets: Map<string, EditorAsset>,
  mouthSets: Map<string, MouthSetAsset>
): Promise<void> {
  const baseAsset = assets.get(clip.assetId);
  if (!baseAsset || !baseAsset.url) return;

  let baseImage: HTMLImageElement;
  try {
    baseImage = await getImageElement(baseAsset.id, baseAsset.url);
  } catch {
    return;
  }

  const localTime = Math.max(0, globalTime - clip.start);
  const tf = getClipTransformAtTime(clip, localTime);

  ctx.save();

  // Apply clip opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, tf.opacity));

  // Position, translate to clip center for rotation
  let centerX = tf.x + tf.width / 2;
  let centerY = tf.y + tf.height / 2;
  let rotationDeg = tf.rotation || 0;

  if (clip.idleMotion) {
    const idle = calculateIdleMotion(localTime);
    centerX += idle.offsetX;
    centerY += idle.offsetY;
    rotationDeg += idle.tiltDeg;
  }

  ctx.translate(centerX, centerY);

  if (rotationDeg) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }

  // Draw base image centered at (0, 0) in rotated space
  ctx.drawImage(
    baseImage,
    -tf.width / 2,
    -tf.height / 2,
    tf.width,
    tf.height
  );

  // If this is a lipSync clip, calculate and render the active mouth cue
  if (clip.type === 'lipSync' && clip.lipSyncData) {
    await renderMouthOverlay(ctx, clip, globalTime, mouthSets, assets, tf);
  }

  ctx.restore();
}

/**
 * Renders the active mouth sprite on top of the character in the clip's local coordinate space.
 */
async function renderMouthOverlay(
  ctx: CanvasRenderingContext2D,
  clip: VisualClip,
  globalTime: number,
  mouthSets: Map<string, MouthSetAsset>,
  assets: Map<string, EditorAsset>,
  tf?: EvaluatedTransform
): Promise<void> {
  const lipSync = clip.lipSyncData;
  if (!lipSync) return;

  const mouthSet = lipSync.mouthSetId ? mouthSets.get(lipSync.mouthSetId) : undefined;
  if (!mouthSet) return;

  // Safety guard: Never draw character's own full image as a mouth overlay
  if (mouthSet.sourceAssetId === clip.assetId) {
    return;
  }

  // Local clip time in seconds
  const localTime = globalTime - clip.start;

  // Find active cue
  let activeShape = 'X';
  for (const cue of lipSync.cues) {
    if (localTime >= cue.start && localTime < cue.end) {
      activeShape = cue.mouthId;
      break;
    }
  }

  // Find corresponding mouth sprite (case-insensitive with fallback to 'X' or 'A')
  let sprite = mouthSet.sprites[activeShape] ||
    mouthSet.sprites[activeShape.toUpperCase()] ||
    mouthSet.sprites['X'] ||
    mouthSet.sprites['A'] ||
    Object.values(mouthSet.sprites)[0];

  if (!sprite) return;

  let mouthImage: HTMLImageElement | null = null;
  let sourceSheetImage: HTMLImageElement | null = null;

  // 1. Primary path: render directly from source sheet asset using cropRect (100% resilient across reloads)
  const sourceAsset = mouthSet.sourceAssetId ? assets.get(mouthSet.sourceAssetId) : undefined;
  if (sourceAsset?.url) {
    try {
      sourceSheetImage = await getImageElement(sourceAsset.id, sourceAsset.url);
    } catch {
      sourceSheetImage = null;
    }
  }

  // 2. Secondary fallback: individual mouth sprite image only if source sheet unavailable
  if (!sourceSheetImage && sprite.url && !sprite.url.startsWith('blob:')) {
    try {
      mouthImage = await getImageElement(sprite.id, sprite.url);
    } catch {
      mouthImage = null;
    }
  }

  if (!mouthImage && !sourceSheetImage) {
    return;
  }

  const effectiveW = tf ? tf.width : clip.width;
  const effectiveH = tf ? tf.height : clip.height;

  // In clip local space, character top-left is (-effectiveW / 2, -effectiveH / 2)
  const charPlacement = {
    x: -effectiveW / 2,
    y: -effectiveH / 2,
    width: effectiveW,
    height: effectiveH,
  };

  const mouthAnchor = lipSync.mouthAnchor || { x: 0.5, y: 0.5 };
  const mouthScale = lipSync.mouthScale || 0.25;
  const spriteAnchor = lipSync.spriteAnchor || { anchorX: sprite.anchorX ?? 0.5, anchorY: sprite.anchorY ?? 0.5 };

  const refCellW = lipSync.sizingMode === 'uniform' ? undefined : (lipSync.referenceCellWidth || mouthSet.referenceCellWidth);
  const shapeTuning = lipSync.shapeTunings?.[activeShape];
  const scaleMultiplier = shapeTuning?.scaleMultiplier ?? 1.0;
  const shapeOffset = shapeTuning ? { x: shapeTuning.offsetX || 0, y: shapeTuning.offsetY || 0 } : undefined;

  const naturalW = sprite.width || mouthImage?.naturalWidth || sprite.cropRect?.width || 100;
  const naturalH = sprite.height || mouthImage?.naturalHeight || sprite.cropRect?.height || 100;

  const drawRect = calculateMouthDrawRect(
    charPlacement,
    mouthAnchor,
    naturalW,
    naturalH,
    mouthScale,
    spriteAnchor,
    lipSync.mouthRotation || 0,
    refCellW,
    scaleMultiplier,
    shapeOffset
  );

  ctx.save();
  ctx.translate(drawRect.targetPinX, drawRect.targetPinY);
  if (lipSync.mouthRotation) {
    ctx.rotate((lipSync.mouthRotation * Math.PI) / 180);
  }

  const destX = -drawRect.drawWidth * spriteAnchor.anchorX;
  const destY = -drawRect.drawHeight * spriteAnchor.anchorY;

  if (mouthImage) {
    ctx.drawImage(
      mouthImage,
      destX,
      destY,
      drawRect.drawWidth,
      drawRect.drawHeight
    );
  } else if (sourceSheetImage && sprite.cropRect) {
    ctx.drawImage(
      sourceSheetImage,
      sprite.cropRect.x,
      sprite.cropRect.y,
      sprite.cropRect.width,
      sprite.cropRect.height,
      destX,
      destY,
      drawRect.drawWidth,
      drawRect.drawHeight
    );
  }
  ctx.restore();
}

/**
 * Editor-only overlay: draws selection outline, resize handles, and rotation indicator.
 * NEVER called during export!
 */
export function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  clip: VisualClip,
  zoom: number = 1.0,
  showDiagnosticMouthBounds: boolean = false,
  currentTime?: number
): void {
  ctx.save();

  const localTime = currentTime !== undefined ? Math.max(0, currentTime - clip.start) : 0;
  const tf = getClipTransformAtTime(clip, localTime);

  const centerX = tf.x + tf.width / 2;
  const centerY = tf.y + tf.height / 2;

  ctx.translate(centerX, centerY);
  if (tf.rotation) {
    ctx.rotate((tf.rotation * Math.PI) / 180);
  }

  const halfW = tf.width / 2;
  const halfH = tf.height / 2;

  // Selection border (Refined violet)
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(-halfW, -halfH, tf.width, tf.height);

  // Resize handles at 4 corners and 4 edges
  const handleSize = 8 / zoom;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#7C3AED';
  ctx.lineWidth = 1.5 / zoom;

  const handlePositions = [
    [-halfW, -halfH], // TL
    [0, -halfH],      // TC
    [halfW, -halfH],  // TR
    [halfW, 0],       // RC
    [halfW, halfH],   // BR
    [0, halfH],       // BC
    [-halfW, halfH],  // BL
    [-halfW, 0],      // LC
  ];

  for (const [hx, hy] of handlePositions) {
    ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
  }

  // Rotation handle (stem + circle above top edge)
  const stemHeight = 24 / zoom;
  ctx.beginPath();
  ctx.moveTo(0, -halfH);
  ctx.lineTo(0, -halfH - stemHeight);
  ctx.strokeStyle = '#8B5CF6';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -halfH - stemHeight, handleSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#8B5CF6';
  ctx.fill();
  ctx.stroke();

  // If clip is lipSync, draw compact, non-intrusive character mouth anchor pin
  if (clip.type === 'lipSync' && clip.lipSyncData) {
    const anchor = clip.lipSyncData.mouthAnchor || { x: 0.5, y: 0.5 };
    const pinX = -halfW + tf.width * anchor.x;
    const pinY = -halfH + tf.height * anchor.y;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;

    // Compact Green Character Anchor Crosshair (arms length 8px)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(pinX - 8 / zoom, pinY);
    ctx.lineTo(pinX + 8 / zoom, pinY);
    ctx.moveTo(pinX, pinY - 8 / zoom);
    ctx.lineTo(pinX, pinY + 8 / zoom);
    ctx.stroke();

    // Center Anchor Grab Dot (radius 2.5px)
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(pinX, pinY, 2.5 / zoom, 0, Math.PI * 2);
    ctx.fill();

    // Subtle dashed ring (radius 6px)
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.2 / zoom;
    ctx.setLineDash([2 / zoom, 2 / zoom]);
    ctx.beginPath();
    ctx.arc(pinX, pinY, 6 / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.restore();
}
