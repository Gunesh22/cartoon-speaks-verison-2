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
  ShieldCheck,
  Ruler,
  BookOpen,
} from 'lucide-react';
import { drawSafeZoneOverlay, drawCanvasGuides, snapToGuides } from './canvasGuides';

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
    showSafeZones,
    toggleSafeZones,
    showRulers,
    toggleRulers,
    canvasGuides,
    addCanvasGuide,
    clearCanvasGuides,
    showStoryboard,
    toggleStoryboard,
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
    isLipSyncModalOpen,
    isExportModalOpen,
    isProjectModalOpen,
    isPromptModalOpen,
    isRecordModalOpen,
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
      drawSelectionOverlay(ctx, selectedClip, canvasZoom, diagnosticMode, currentTime);
    }

    // 3. Render editor-only Safe Zones overlay (Feature 10)
    if (showSafeZones) {
      drawSafeZoneOverlay(ctx, project.width, project.height);
    }

    // 4. Render editor-only alignment guides (Feature 12)
    if (showRulers && canvasGuides.length > 0) {
      drawCanvasGuides(ctx, canvasGuides, project.width, project.height);
    }
  }, [
    project,
    currentTime,
    assets,
    mouthSets,
    showCheckerboard,
    selectedClip,
    canvasZoom,
    diagnosticMode,
    showSafeZones,
    showRulers,
    canvasGuides,
  ]);

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

  // Container mouse move handler for hover cursor updates when not dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragMode !== 'none') return;
    const coords = clientToCanvasCoords(e.clientX, e.clientY);

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
  };

  // Unified drag termination handler: commits undo history strictly once
  const endDrag = useCallback(() => {
    setDragMode((current) => {
      if (current !== 'none') {
        pushHistory();
      }
      return 'none';
    });
    setInitialClipState(null);
  }, [pushHistory]);

  // Global window mousemove & mouseup listener during active dragging
  // Ensures dragging never gets stuck when the cursor moves outside the canvas
  useEffect(() => {
    if (dragMode === 'none' || !selectedClip || !initialClipState) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const coords = clientToCanvasCoords(e.clientX, e.clientY);
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
        let targetX = Math.round(initialClipState.x + deltaX);
        let targetY = Math.round(initialClipState.y + deltaY);
        if (showRulers && canvasGuides.length > 0) {
          const snapped = snapToGuides(
            targetX,
            targetY,
            selectedClip.width,
            selectedClip.height,
            canvasGuides,
            8
          );
          targetX = snapped.x;
          targetY = snapped.y;
        }
        updateVisualClip(selectedClip.id, {
          x: targetX,
          y: targetY,
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

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', endDrag);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', endDrag);
    };
  }, [
    dragMode,
    selectedClip,
    initialClipState,
    dragStart,
    clientToCanvasCoords,
    updateVisualClip,
    endDrag,
    showRulers,
    canvasGuides,
  ]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: Do not execute global shortcuts when any modal or dialog is active
      if (
        isLipSyncModalOpen ||
        isExportModalOpen ||
        isProjectModalOpen ||
        isPromptModalOpen ||
        isRecordModalOpen
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      ) {
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
  }, [
    selectedClip,
    selectedClipId,
    isPlaying,
    setIsPlaying,
    togglePlay,
    fitClipToScreen,
    removeClip,
    updateVisualClip,
    isLipSyncModalOpen,
    isExportModalOpen,
    isProjectModalOpen,
    isPromptModalOpen,
  ]);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-editor-bg flex flex-col items-center justify-center relative overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (dragMode === 'none') setCursorStyle('default');
      }}
    >
      {/* Floating Canvas Viewport Controls Bar */}
      <div className="absolute top-3 left-4 z-10 flex items-center space-x-1 bg-editor-panel/90 backdrop-blur-md border border-editor-border/80 rounded-editor-md px-1.5 py-1 shadow-panel text-xs">
        <button
          onClick={() => setCanvasZoom(Math.max(0.1, canvasZoom - 0.1))}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          className="w-6.5 h-6.5 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-editor-text font-mono text-[10px] min-w-[38px] text-center font-medium">
          {Math.round(canvasZoom * 100)}%
        </span>
        <button
          onClick={() => setCanvasZoom(Math.min(3.0, canvasZoom + 0.1))}
          title="Zoom In (+)"
          aria-label="Zoom In"
          className="w-6.5 h-6.5 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleFitToViewport}
          title="Fit to Viewport (F)"
          aria-label="Fit to Viewport"
          className="w-6.5 h-6.5 rounded flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-3.5 w-px bg-editor-border/60 mx-1" />

        <button
          onClick={toggleCheckerboard}
          title="Toggle Checkerboard Background"
          aria-label="Toggle Checkerboard"
          className={`w-6.5 h-6.5 rounded flex items-center justify-center transition-colors ${
            showCheckerboard
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/40'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleDiagnosticMode}
          title="Toggle Lip-Sync Diagnostic Overlay (Bounds & Anchor)"
          aria-label="Toggle Diagnostic Overlay"
          className={`w-6.5 h-6.5 rounded flex items-center justify-center transition-colors ${
            diagnosticMode
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/40'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleSafeZones}
          title="Toggle Social Media Safe-Zone Overlays"
          aria-label="Toggle Safe Zones"
          className={`w-6.5 h-6.5 rounded flex items-center justify-center transition-colors ${
            showSafeZones
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/40'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={toggleRulers}
          title="Toggle Canvas Rulers & Draggable Guides"
          aria-label="Toggle Canvas Rulers"
          className={`w-6.5 h-6.5 rounded flex items-center justify-center transition-colors ${
            showRulers
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/40'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <Ruler className="w-3.5 h-3.5" />
        </button>

        <div className="h-3.5 w-px bg-editor-border/60 mx-0.5" />

        <button
          onClick={toggleStoryboard}
          title="Toggle Storyboard & Script References"
          aria-label="Toggle Storyboard"
          className={`w-6.5 h-6.5 rounded flex items-center justify-center transition-colors ${
            showStoryboard
              ? 'bg-editor-accent/20 text-editor-accent border border-editor-accent/40'
              : 'hover:bg-editor-hover text-editor-muted hover:text-editor-text'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Composition Info Badge */}
      <div className="absolute top-3 right-4 z-10 bg-editor-panel/85 backdrop-blur-md border border-editor-border/80 rounded-editor-md px-2.5 py-1 text-[10px] text-editor-secondary font-mono shadow-sm flex items-center space-x-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-editor-accent" />
        <span>{project.width} × {project.height}</span>
        <span className="text-editor-muted">@</span>
        <span>{project.fps} FPS</span>
      </div>

      {/* Composition Canvas Surface & Optional Rulers (Feature 12) */}
      <div className="flex flex-col items-center">
        {showRulers && (
          <div
            className="h-4 bg-editor-surface/90 border-t border-x border-editor-border flex items-center justify-between text-[9px] font-mono text-editor-muted select-none cursor-crosshair px-1 relative overflow-hidden"
            style={{ width: project.width * canvasZoom }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = (e.clientX - rect.left) / canvasZoom;
              addCanvasGuide('vertical', clickX);
            }}
            title="Click anywhere on the ruler to add a vertical guide"
          >
            <span>0</span>
            <span>{Math.round(project.width / 4)}</span>
            <span className="text-editor-accent font-semibold">{Math.round(project.width / 2)} (Center)</span>
            <span>{Math.round((project.width * 3) / 4)}</span>
            <span>{project.width}px</span>
          </div>
        )}

        <div className="flex">
          {showRulers && (
            <div
              className="w-4 bg-editor-surface/90 border-l border-y border-editor-border flex flex-col justify-between text-[8px] font-mono text-editor-muted select-none cursor-crosshair py-1 items-center relative overflow-hidden"
              style={{ height: project.height * canvasZoom }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickY = (e.clientY - rect.top) / canvasZoom;
                addCanvasGuide('horizontal', clickY);
              }}
              title="Click anywhere on the ruler to add a horizontal guide"
            >
              <span>0</span>
              <span className="text-editor-accent font-semibold">{Math.round(project.height / 2)}</span>
              <span>{project.height}</span>
            </div>
          )}

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
              className="w-full h-full block rounded-editor-sm border border-editor-border/80 shadow-panel"
            />

            {/* Empty Canvas Useful Getting-Started State */}
            {!project.tracks.some((t) => t.clips.length > 0) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-6 bg-editor-bg/40 backdrop-blur-[1px] rounded-editor-sm">
                <p className="text-xs font-semibold text-editor-secondary">Canvas Ready</p>
                <p className="text-[11px] text-editor-muted mt-1 max-w-[260px] leading-relaxed">
                  Import character images or click Lip Sync in the top toolbar to begin animating
                </p>
              </div>
            )}
          </div>
        </div>

        {showRulers && canvasGuides.length > 0 && (
          <div className="mt-2 flex items-center space-x-2 text-[10px] text-editor-muted bg-editor-surface/80 border border-editor-border px-2 py-0.5 rounded">
            <span>{canvasGuides.length} active guide{canvasGuides.length > 1 ? 's' : ''}</span>
            <button
              onClick={clearCanvasGuides}
              className="text-red-400 hover:text-red-300 font-medium underline cursor-pointer"
            >
              Clear Guides
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
