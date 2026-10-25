/**
 * Canvas Guides and Safe-Zone Overlay Utilities (Feature 10 & Feature 12)
 * Pure, lightweight rendering for editor viewport guides.
 * Never rendered in final video export.
 */

export interface CanvasGuide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // in project canvas pixel coordinates
}

/**
 * Draws platform safe-zone guidelines onto the editor canvas.
 * Handles 9:16 vertical (Shorts / Reels / TikTok) and 16:9 / 1:1 formats.
 */
export function drawSafeZoneOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  ctx.save();

  const isPortrait = height > width;

  if (isPortrait) {
    // 9:16 Vertical Safe Zones (TikTok / Reels / YouTube Shorts)
    // Top: 12% header margin (search, sounds, profile)
    // Bottom: 20% caption & audio title margin
    // Right: 14% interaction icons margin (like, comment, share)
    // Left: 4% margin
    const topMargin = Math.round(height * 0.12);
    const bottomMargin = Math.round(height * 0.20);
    const rightMargin = Math.round(width * 0.14);
    const leftMargin = Math.round(width * 0.04);

    const safeX = leftMargin;
    const safeY = topMargin;
    const safeW = width - leftMargin - rightMargin;
    const safeH = height - topMargin - bottomMargin;

    // Dim unsafe peripheral regions
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    // Top bar
    ctx.fillRect(0, 0, width, topMargin);
    // Bottom bar
    ctx.fillRect(0, height - bottomMargin, width, bottomMargin);
    // Right column
    ctx.fillRect(width - rightMargin, topMargin, rightMargin, safeH);
    // Left column
    ctx.fillRect(0, topMargin, leftMargin, safeH);

    // Bounding safe rectangle outline
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'; // Sky blue
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(safeX, safeY, safeW, safeH);

    // Labels
    ctx.setLineDash([]);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillText('TikTok / Reels / Shorts Safe Zone', safeX + 12, safeY + 24);

    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.fillText('Captions & Sound Margin', safeX + 12, height - bottomMargin + 20);
    ctx.fillText('Action Icons Margin', width - rightMargin + 6, safeY + safeH / 2);
  } else {
    // 16:9 Landscape & Standard Safe Zones (EBU R95 / Action & Title Safe)
    // Action Safe: 90% (5% border)
    // Title Safe: 80% (10% border)
    const actionMarginX = width * 0.05;
    const actionMarginY = height * 0.05;
    const titleMarginX = width * 0.10;
    const titleMarginY = height * 0.10;

    // Action Safe Outline
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Emerald
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(
      actionMarginX,
      actionMarginY,
      width - actionMarginX * 2,
      height - actionMarginY * 2
    );

    // Title Safe Outline
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'; // Sky blue
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      titleMarginX,
      titleMarginY,
      width - titleMarginX * 2,
      height - titleMarginY * 2
    );

    ctx.setLineDash([]);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
    ctx.fillText('Action Safe (90%)', actionMarginX + 8, actionMarginY + 16);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillText('Title Safe (80%)', titleMarginX + 8, titleMarginY + 16);
  }

  ctx.restore();
}

/**
 * Draws user-placed horizontal and vertical alignment guides.
 */
export function drawCanvasGuides(
  ctx: CanvasRenderingContext2D,
  guides: CanvasGuide[],
  width: number,
  height: number
): void {
  if (guides.length === 0) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)'; // Cyan
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  for (const guide of guides) {
    ctx.beginPath();
    if (guide.orientation === 'horizontal') {
      ctx.moveTo(0, guide.position);
      ctx.lineTo(width, guide.position);
    } else {
      ctx.moveTo(guide.position, 0);
      ctx.lineTo(guide.position, height);
    }
    ctx.stroke();

    // Position label
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(6, 182, 212, 0.95)';
    if (guide.orientation === 'horizontal') {
      ctx.fillText(`${guide.position}px`, 8, guide.position - 4);
    } else {
      ctx.fillText(`${guide.position}px`, guide.position + 4, 16);
    }
  }

  ctx.restore();
}

/**
 * Snaps moving clip coordinates (x, y) to active canvas guides.
 */
export function snapToGuides(
  x: number,
  y: number,
  width: number,
  height: number,
  guides: CanvasGuide[],
  threshold: number = 8
): { x: number; y: number; snappedGuideId: string | null } {
  let snappedX = x;
  let snappedY = y;
  let snappedGuideId: string | null = null;

  for (const guide of guides) {
    if (guide.orientation === 'vertical') {
      // Check left edge, center, right edge
      const leftDiff = Math.abs(x - guide.position);
      const centerDiff = Math.abs(x + width / 2 - guide.position);
      const rightDiff = Math.abs(x + width - guide.position);

      if (leftDiff <= threshold) {
        snappedX = guide.position;
        snappedGuideId = guide.id;
      } else if (centerDiff <= threshold) {
        snappedX = guide.position - width / 2;
        snappedGuideId = guide.id;
      } else if (rightDiff <= threshold) {
        snappedX = guide.position - width;
        snappedGuideId = guide.id;
      }
    } else if (guide.orientation === 'horizontal') {
      // Check top edge, center, bottom edge
      const topDiff = Math.abs(y - guide.position);
      const centerDiff = Math.abs(y + height / 2 - guide.position);
      const bottomDiff = Math.abs(y + height - guide.position);

      if (topDiff <= threshold) {
        snappedY = guide.position;
        snappedGuideId = guide.id;
      } else if (centerDiff <= threshold) {
        snappedY = guide.position - height / 2;
        snappedGuideId = guide.id;
      } else if (bottomDiff <= threshold) {
        snappedY = guide.position - height;
        snappedGuideId = guide.id;
      }
    }
  }

  return { x: snappedX, y: snappedY, snappedGuideId };
}
