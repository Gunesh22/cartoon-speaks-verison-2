import { EditorProject } from '../../types/project';
import { VisualClip } from '../../types/timeline';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { getActiveVisualClipsInRenderOrder } from '../timeline/timelineMath';
import { calculateMouthDrawRect } from '../../features/lipSync/anchor';
import { getImageElement } from '../assets/assetDb';

export interface RenderContext {
  canvas: HTMLCanvasElement;
  project: EditorProject;
  time: number;
  assets: Map<string, EditorAsset>;
  mouthSets: Map<string, MouthSetAsset>;
  showCheckerboard?: boolean;
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
  const { project, time, assets, mouthSets, showCheckerboard = false } = context;
  const { width, height } = project;

  ctx.clearRect(0, 0, width, height);

  if (showCheckerboard) {
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

  ctx.save();

  // Apply clip opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, clip.opacity ?? 1.0));

  // Position, translate to clip center for rotation
  const centerX = clip.x + clip.width / 2;
  const centerY = clip.y + clip.height / 2;
  ctx.translate(centerX, centerY);

  if (clip.rotation) {
    ctx.rotate((clip.rotation * Math.PI) / 180);
  }

  // Draw base image centered at (0, 0) in rotated space
  ctx.drawImage(
    baseImage,
    -clip.width / 2,
    -clip.height / 2,
    clip.width,
    clip.height
  );

  // If this is a lipSync clip, calculate and render the active mouth cue
  if (clip.type === 'lipSync' && clip.lipSyncData) {
    await renderMouthOverlay(ctx, clip, globalTime, mouthSets);
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
  mouthSets: Map<string, MouthSetAsset>
): Promise<void> {
  const lipSync = clip.lipSyncData;
  if (!lipSync) return;

  const mouthSet = lipSync.mouthSetId ? mouthSets.get(lipSync.mouthSetId) : undefined;
  if (!mouthSet) return;

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

  if (!sprite || !sprite.url) return;

  let mouthImage: HTMLImageElement;
  try {
    mouthImage = await getImageElement(sprite.id, sprite.url);
  } catch {
    return;
  }

  // In clip local space, character top-left is (-clip.width / 2, -clip.height / 2)
  const charPlacement = {
    x: -clip.width / 2,
    y: -clip.height / 2,
    width: clip.width,
    height: clip.height,
  };

  const mouthAnchor = lipSync.mouthAnchor || { x: 0.5, y: 0.5 };
  const mouthScale = lipSync.mouthScale || 0.25;
  const spriteAnchor = lipSync.spriteAnchor || { anchorX: sprite.anchorX ?? 0.5, anchorY: sprite.anchorY ?? 0.5 };

  const refCellW = lipSync.sizingMode === 'uniform' ? undefined : (lipSync.referenceCellWidth || mouthSet.referenceCellWidth);
  const shapeTuning = lipSync.shapeTunings?.[activeShape];
  const scaleMultiplier = shapeTuning?.scaleMultiplier ?? 1.0;
  const shapeOffset = shapeTuning ? { x: shapeTuning.offsetX || 0, y: shapeTuning.offsetY || 0 } : undefined;

  const drawRect = calculateMouthDrawRect(
    charPlacement,
    mouthAnchor,
    sprite.width || mouthImage.naturalWidth,
    sprite.height || mouthImage.naturalHeight,
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
  ctx.drawImage(
    mouthImage,
    -drawRect.drawWidth * spriteAnchor.anchorX,
    -drawRect.drawHeight * spriteAnchor.anchorY,
    drawRect.drawWidth,
    drawRect.drawHeight
  );
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
  showDiagnosticMouthBounds: boolean = false
): void {
  ctx.save();

  const centerX = clip.x + clip.width / 2;
  const centerY = clip.y + clip.height / 2;

  ctx.translate(centerX, centerY);
  if (clip.rotation) {
    ctx.rotate((clip.rotation * Math.PI) / 180);
  }

  const halfW = clip.width / 2;
  const halfH = clip.height / 2;

  // Selection border (Refined violet)
  ctx.strokeStyle = '#8B5CF6';
  ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(-halfW, -halfH, clip.width, clip.height);

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
    const pinX = -halfW + clip.width * anchor.x;
    const pinY = -halfH + clip.height * anchor.y;

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
