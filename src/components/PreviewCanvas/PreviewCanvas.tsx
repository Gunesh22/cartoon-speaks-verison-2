import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { renderCompositionFrame, drawSelectionOverlay } from '../../core/renderer/canvasRenderer';
import { isClipActiveAtTime, getActiveVisualClipsInRenderOrder } from '../../core/timeline/timelineMath';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Crosshair,
} from 'lucide-react';

type DragMode = 'none' | 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'rotate' | 'anchor';

export const PreviewCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    project,
    currentTime,
    assets,
    mouthSets,
    showCheckerboard,
    diagnosticMode,
    selectedClipId,
    selectedClipTrackId,
    canvasZoom,
    setCanvasZoom,
    toggleCheckerboard,
    toggleDiagnosticMode,
    selectClip,
    updateVisualClip,
    removeClip,
    setIsPlaying,
    isPlaying,
    togglePlay,
    pushHistory,
    fitClipToScreen,
  } = useEditorStore();

  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialClipState, setInitialClipState] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    aspectRatio: number;
  } | null>(null);

  // Find currently selected clip
  let selectedClip = null;
  if (selectedClipId) {
    for (const track of project.tracks) {
      const c = track.clips.find((item) => item.id === selectedClipId);
      if (c) {
        selectedClip = c;
        break;
      }
    }
  }

  // Convert client viewport coordinates to canvas composition space coordinates
  const clientToCanvasCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = project.width / rect.width;
      const scaleY = project.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [project.width, project.height]
  );

  // Render loop whenever project, time, or selection changes
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Render clean composition
    await renderCompositionFrame(ctx, {
      canvas,
      project,
      time: currentTime,
      assets,
      mouthSets,
      showCheckerboard,
    });

    // 2. Render editor-only selection & transform overlay
    if (selectedClip && isClipActiveAtTime(selectedClip, currentTime)) {
      drawSelectionOverlay(ctx, selectedClip, canvasZoom, diagnosticMode);
    }
  }, [project, currentTime, assets, mouthSets, showCheckerboard, selectedClip, canvasZoom, diagnosticMode]);

  useEffect(() => {
    let animId: number | undefined;
    renderCanvas();
    return () => {
      if (animId !== undefined) cancelAnimationFrame(animId);
    };
  }, [renderCanvas]);

  // Fit composition to viewport
  const handleFitToViewport = () => {
    const container = containerRef.current;
    if (!container) return;
    const padding = 48;
    const availW = container.clientWidth - padding;
    const availH = container.clientHeight - padding;
    const scaleX = availW / project.width;
    const scaleY = availH / project.height;
    const fitScale = Math.min(scaleX, scaleY, 1.0);
    setCanvasZoom(Number(fitScale.toFixed(2)));
  };

  // Mouse interaction for selecting, moving, resizing, rotating clips on canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const coords = clientToCanvasCoords(e.clientX, e.clientY);

    // If a clip is selected and active, check if clicking on handles
    if (selectedClip && isClipActiveAtTime(selectedClip, currentTime)) {
      const centerX = selectedClip.x + selectedClip.width / 2;
      const centerY = selectedClip.y + selectedClip.height / 2;
      const halfW = selectedClip.width / 2;
      const halfH = selectedClip.height / 2;

      // Transform mouse coordinate into clip's local unrotated space
      const rad = -((selectedClip.rotation || 0) * Math.PI) / 180;
      const dx = coords.x - centerX;
      const dy = coords.y - centerY;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

      const handleRadius = 14 / canvasZoom;

      // Check character mouth anchor pin if clip is lipSync
      if (selectedClip.type === 'lipSync' && selectedClip.lipSyncData) {
        const anchor = selectedClip.lipSyncData.mouthAnchor || { x: 0.5, y: 0.5 };
        const pinX = -halfW + selectedClip.width * anchor.x;
        const pinY = -halfH + selectedClip.height * anchor.y;
        if (Math.hypot(localX - pinX, localY - pinY) < 18 / canvasZoom) {
          setDragMode('anchor');
          setDragStart(coords);
          setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
          return;
        }
      }

      // Check rotation handle (above top edge)
      const rotHandleY = -halfH - 24 / canvasZoom;
      if (Math.hypot(localX, localY - rotHandleY) < handleRadius) {
        setDragMode('rotate');
        setDragStart(coords);
        setInitialClipState({
          x: selectedClip.x,
          y: selectedClip.y,
          width: selectedClip.width,
          height: selectedClip.height,
          rotation: selectedClip.rotation || 0,
          aspectRatio: selectedClip.width / selectedClip.height,
        });
        return;
      }

      // Check corner resize handles
      if (Math.abs(localX - (-halfW)) < handleRadius && Math.abs(localY - (-halfH)) < handleRadius) {
        setDragMode('resize-tl');
        setDragStart(coords);
        setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
        return;
      }
      if (Math.abs(localX - halfW) < handleRadius && Math.abs(localY - (-halfH)) < handleRadius) {
        setDragMode('resize-tr');
        setDragStart(coords);
        setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
        return;
      }
      if (Math.abs(localX - (-halfW)) < handleRadius && Math.abs(localY - halfH) < handleRadius) {
        setDragMode('resize-bl');
        setDragStart(coords);
        setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
        return;
      }
      if (Math.abs(localX - halfW) < handleRadius && Math.abs(localY - halfH) < handleRadius) {
        setDragMode('resize-br');
        setDragStart(coords);
        setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
        return;
      }

      // Check inside clip bounds -> move
      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
        setDragMode('move');
        setDragStart(coords);
        setInitialClipState({ ...selectedClip, aspectRatio: selectedClip.width / selectedClip.height });
        return;
      }
    }

    // Hit test active clips from top track (V4) down to bottom (V1)
    const activeClips = getActiveVisualClipsInRenderOrder(project.tracks, currentTime).reverse();
    for (const clip of activeClips) {
      const centerX = clip.x + clip.width / 2;
      const centerY = clip.y + clip.height / 2;
      const rad = -((clip.rotation || 0) * Math.PI) / 180;
      const dx = coords.x - centerX;
      const dy = coords.y - centerY;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

      if (Math.abs(localX) <= clip.width / 2 && Math.abs(localY) <= clip.height / 2) {
        selectClip(clip.id);
        setDragMode('move');
        setDragStart(coords);
        setInitialClipState({ ...clip, aspectRatio: clip.width / clip.height });
        return;
      }
    }

    // Clicked on empty canvas -> deselect
    selectClip(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = clientToCanvasCoords(e.clientX, e.clientY);

    if (dragMode === 'none') {
      if (selectedClip && isClipActiveAtTime(selectedClip, currentTime)) {
        const centerX = selectedClip.x + selectedClip.width / 2;
        const centerY = selectedClip.y + selectedClip.height / 2;
        const halfW = selectedClip.width / 2;
        const halfH = selectedClip.height / 2;
        const rad = -((selectedClip.rotation || 0) * Math.PI) / 180;
        const dx = coords.x - centerX;
        const dy = coords.y - centerY;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Check anchor pin hover
        if (selectedClip.type === 'lipSync' && selectedClip.lipSyncData) {
          const anchor = selectedClip.lipSyncData.mouthAnchor || { x: 0.5, y: 0.5 };
          const pinX = -halfW + selectedClip.width * anchor.x;
          const pinY = -halfH + selectedClip.height * anchor.y;
          if (Math.hypot(localX - pinX, localY - pinY) < 18 / canvasZoom) {
            setCursorStyle('crosshair');
            return;
          }
        }

        const handleRadius = 14 / canvasZoom;
        const rotHandleY = -halfH - 24 / canvasZoom;
        if (Math.hypot(localX, localY - rotHandleY) < handleRadius) {
          setCursorStyle('grab');
          return;
        }
        if (Math.abs(localX - halfW) < handleRadius && Math.abs(localY - halfH) < handleRadius) {
          setCursorStyle('nwse-resize');
          return;
        }
        if (Math.abs(localX + halfW) < handleRadius && Math.abs(localY - halfH) < handleRadius) {
          setCursorStyle('nesw-resize');
          return;
        }
        if (Math.abs(localX - halfW) < handleRadius && Math.abs(localY + halfH) < handleRadius) {
          setCursorStyle('nesw-resize');
          return;
        }
        if (Math.abs(localX + halfW) < handleRadius && Math.abs(localY + halfH) < handleRadius) {
          setCursorStyle('nwse-resize');
          return;
        }
        if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
          setCursorStyle('move');
          return;
        }
      }
      setCursorStyle('default');
      return;
    }

    if (!selectedClip || !initialClipState) return;
    const deltaX = coords.x - dragStart.x;
    const deltaY = coords.y - dragStart.y;

    if (dragMode === 'anchor' && selectedClip.lipSyncData) {
      const centerX = initialClipState.x + initialClipState.width / 2;
      const centerY = initialClipState.y + initialClipState.height / 2;
      const rad = -((initialClipState.rotation || 0) * Math.PI) / 180;
      const dx = coords.x - centerX;
      const dy = coords.y - centerY;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

      const normX = Math.max(0, Math.min(1, (localX + initialClipState.width / 2) / initialClipState.width));
      const normY = Math.max(0, Math.min(1, (localY + initialClipState.height / 2) / initialClipState.height));

      updateVisualClip(
        selectedClip.id,
        {
          lipSyncData: {
            ...selectedClip.lipSyncData,
            mouthAnchor: {
              x: Number(normX.toFixed(3)),
              y: Number(normY.toFixed(3)),
            },
          },
        },
        false
      );
      return;
    }

    if (dragMode === 'move') {
      updateVisualClip(selectedClip.id, {
        x: Math.round(initialClipState.x + deltaX),
        y: Math.round(initialClipState.y + deltaY),
      });
    } else if (dragMode === 'rotate') {
      const centerX = initialClipState.x + initialClipState.width / 2;
      const centerY = initialClipState.y + initialClipState.height / 2;
      const angleRad = Math.atan2(coords.y - centerY, coords.x - centerX);
      let angleDeg = (angleRad * 180) / Math.PI + 90;
      if (angleDeg < 0) angleDeg += 360;
      updateVisualClip(selectedClip.id, {
        rotation: Math.round(angleDeg),
      });
    } else if (dragMode === 'resize-br') {
      const newWidth = Math.max(20, initialClipState.width + deltaX);
      const newHeight = Math.round(newWidth / initialClipState.aspectRatio);
      updateVisualClip(selectedClip.id, {
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    } else if (dragMode === 'resize-bl') {
      const newWidth = Math.max(20, initialClipState.width - deltaX);
      const newHeight = Math.round(newWidth / initialClipState.aspectRatio);
      updateVisualClip(selectedClip.id, {
        x: Math.round(initialClipState.x + (initialClipState.width - newWidth)),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    } else if (dragMode === 'resize-tr') {
      const newWidth = Math.max(20, initialClipState.width + deltaX);
      const newHeight = Math.round(newWidth / initialClipState.aspectRatio);
      updateVisualClip(selectedClip.id, {
        y: Math.round(initialClipState.y + (initialClipState.height - newHeight)),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    } else if (dragMode === 'resize-tl') {
      const newWidth = Math.max(20, initialClipState.width - deltaX);
      const newHeight = Math.round(newWidth / initialClipState.aspectRatio);
      updateVisualClip(selectedClip.id, {
        x: Math.round(initialClipState.x + (initialClipState.width - newWidth)),
        y: Math.round(initialClipState.y + (initialClipState.height - newHeight)),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      });
    }
  };

  const handleMouseUp = () => {
    if (dragMode !== 'none') {
      pushHistory();
    }
    setDragMode('none');
    setInitialClipState(null);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        if (selectedClip) {
          e.preventDefault();
          fitClipToScreen(selectedClip.id, 'contain');
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          removeClip(selectedClipId);
        }
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && selectedClip) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        updateVisualClip(selectedClip.id, {
          x: selectedClip.x + dx,
          y: selectedClip.y + dy,
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClip, selectedClipId, isPlaying, setIsPlaying, removeClip, updateVisualClip]);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-editor-bg flex flex-col items-center justify-center relative overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Floating Canvas Viewport Controls Bar */}
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-1 bg-editor-panel/90 backdrop-blur-md border border-editor-border rounded-editor-md px-1.5 py-1 shadow-lg text-xs">
        <button
          onClick={() => setCanvasZoom(Math.max(0.1, canvasZoom - 0.1))}
          title="Zoom Out"
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-editor-text font-mono text-[11px] min-w-[40px] text-center font-medium">
          {Math.round(canvasZoom * 100)}%
        </span>
        <button
          onClick={() => setCanvasZoom(Math.min(3.0, canvasZoom + 0.1))}
          title="Zoom In"
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleFitToViewport}
          title="Fit to Viewport (F)"
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-3.5 w-px bg-editor-border mx-1" />

        <button
          onClick={toggleCheckerboard}
          title="Toggle Checkerboard Background"
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            showCheckerboard
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/30'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleDiagnosticMode}
          title="Toggle Lip-Sync Diagnostic Overlay (Bounds & Anchor)"
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            diagnosticMode
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/30'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Composition Info Badge */}
      <div className="absolute top-3 right-4 z-10 bg-editor-panel/85 backdrop-blur-md border border-editor-border rounded-editor-md px-2.5 py-1 text-[10px] text-editor-secondary font-mono shadow-sm flex items-center space-x-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-editor-accent" />
        <span>{project.width} × {project.height}</span>
        <span className="text-editor-muted">@</span>
        <span>{project.fps} FPS</span>
      </div>

      {/* Composition Canvas Surface */}
      <div
        className="relative transition-transform duration-75 ease-out"
        style={{
          width: project.width * canvasZoom,
          height: project.height * canvasZoom,
        }}
      >
        <canvas
          ref={canvasRef}
          width={project.width}
          height={project.height}
          onMouseDown={handleMouseDown}
          style={{ cursor: cursorStyle }}
          className="w-full h-full block rounded-editor-sm border border-editor-border shadow-panel"
        />
      </div>
    </div>
  );
};
