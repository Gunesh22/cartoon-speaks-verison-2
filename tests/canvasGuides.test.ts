import { describe, it, expect, vi } from 'vitest';
import {
  drawSafeZoneOverlay,
  drawCanvasGuides,
  snapToGuides,
  CanvasGuide,
} from '../src/components/PreviewCanvas/canvasGuides';

describe('Canvas Guides & Safe-Zone Overlay (Features 10 & 12)', () => {
  it('draws safe-zone overlays for 9:16 portrait and 16:9 landscape without errors', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    // Portrait 9:16 (1080x1920)
    expect(() => drawSafeZoneOverlay(mockCtx, 1080, 1920)).not.toThrow();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();

    // Landscape 16:9 (1920x1080)
    expect(() => drawSafeZoneOverlay(mockCtx, 1920, 1080)).not.toThrow();
  });

  it('draws user-placed horizontal and vertical alignment guides correctly', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const guides: CanvasGuide[] = [
      { id: 'g1', orientation: 'vertical', position: 540 },
      { id: 'g2', orientation: 'horizontal', position: 960 },
    ];

    expect(() => drawCanvasGuides(mockCtx, guides, 1080, 1920)).not.toThrow();
    expect(mockCtx.stroke).toHaveBeenCalledTimes(2);
  });

  it('snaps clip coordinates accurately to guides within magnetic threshold', () => {
    const guides: CanvasGuide[] = [
      { id: 'v_center', orientation: 'vertical', position: 500 },
      { id: 'h_center', orientation: 'horizontal', position: 400 },
    ];

    // Clip width=100, height=100. Left edge at x=495 (within threshold of 8 to guide at 500)
    const snap1 = snapToGuides(495, 200, 100, 100, guides, 8);
    expect(snap1.x).toBe(500); // Snapped left edge to 500
    expect(snap1.snappedGuideId).toBe('v_center');
    expect(snap1.y).toBe(200); // Y not snapped

    // Center snap: x=448 -> center is 448 + 50 = 498 (within 2px of 500)
    const snap2 = snapToGuides(448, 200, 100, 100, guides, 8);
    expect(snap2.x).toBe(450); // 500 - 50 = 450
    expect(snap2.snappedGuideId).toBe('v_center');

    // Outside threshold: x=300 (diff is 200px > 8)
    const snap3 = snapToGuides(300, 200, 100, 100, guides, 8);
    expect(snap3.x).toBe(300);
    expect(snap3.snappedGuideId).toBeNull();
  });
});
