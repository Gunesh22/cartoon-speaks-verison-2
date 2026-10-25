import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { TrackId, VisualClip, AudioClip, AudioTrackId } from '../../types/timeline';
import { MouthCue } from '../../types/lipSync';
import {
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Copy,
  Trash2,
  Volume2,
  VolumeX,
  Smile,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Scissors,
  MousePointer,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { audioEngine } from '../../core/audio/audioEngine';
import {
  calculateFitToScreen,
  getSnapTargets,
  snapTimeToTargets,
} from '../../core/timeline/timelineMath';
import { AudioWaveform } from './AudioWaveform';

export const Timeline: React.FC = () => {
  const {
    project,
    currentTime,
    isPlaying,
    timelineZoom,
    selectedClipId,
    selectedClipTrackId,
    assets,
    setCurrentTime,
    setIsPlaying,
    togglePlay,
    stopPlayback,
    setTimelineZoom,
    selectClip,
    moveClip,
    trimClip,
    duplicateClip,
    removeClip,
    addVisualClip,
    addAudioClip,
    moveAudioClip,
    trimAudioClip,
    removeAudioClip,
    pushHistory,
    activeTool,
    setActiveTool,
    splitClip,
    inOutRange,
    setInPoint,
    setOutPoint,
    clearInOutRange,
    updateVisualClip,
    setAudioTrackSettings,
    fitTimelineToContent,
    setAutoFitToStory,
  } = useEditorStore();

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const audioLanesRef = useRef<HTMLDivElement>(null);

  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [dragAction, setDragAction] = useState<
    | {
        type: 'move' | 'trim-start' | 'trim-end';
        clipId: string;
        sourceTrackId: TrackId | 'audio' | 'A1' | 'A2';
        initialMouseX: number;
        initialMouseY: number;
        initialStart: number;
        initialDuration: number;
      }
    | {
        type: 'cue-trim';
        clipId: string;
        cueIndex: number;
        initialMouseX: number;
        initialCues: MouthCue[];
      }
    | null
  >(null);

  const [activeCuePopover, setActiveCuePopover] = useState<{
    clipId: string;
    cueIndex: number;
    currentShape: string;
    clientX: number;
    clientY: number;
  } | null>(null);

  const [timelineHeight, setTimelineHeight] = useState<number>(340);

  // Resize timeline height by dragging top border
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(240, Math.min(window.innerHeight * 0.65, startH - deltaY));
      setTimelineHeight(newHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const totalWidth = Math.max(900, project.duration * timelineZoom + 300);
  const trackList: TrackId[] = ['V4', 'V3', 'V2', 'V1'];

  // Smooth mouse wheel handling: horizontal scrolling and Ctrl+Wheel zooming
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const currentZoom = useEditorStore.getState().timelineZoom;
        const zoomDelta = e.deltaY < 0 ? 15 : -15;
        useEditorStore.getState().setTimelineZoom(Math.max(20, Math.min(240, currentZoom + zoomDelta)));
      } else {
        // Vertical mouse wheel smoothly scrolls timeline horizontally
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (delta !== 0) {
          e.preventDefault();
          container.scrollLeft += delta;
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Smooth 60fps playback animation frame loop with playhead auto-following
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    if (isPlaying) {
      const tick = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        let nextTime: number;
        const totalDuration = project.duration;

        const audioTime = audioEngine.getCurrentPlayheadTime();
        if (audioTime !== null) {
          if (audioTime >= totalDuration - 0.001) {
            audioEngine.stop();
            setIsPlaying(false);
            setCurrentTime(totalDuration);
            return;
          } else {
            nextTime = audioTime;
            setCurrentTime(audioTime);
          }
        } else {
          const current = useEditorStore.getState().currentTime;
          nextTime = current + dt;
          if (nextTime >= totalDuration - 0.001) {
            audioEngine.stop();
            setIsPlaying(false);
            setCurrentTime(totalDuration);
            return;
          } else {
            setCurrentTime(nextTime);
          }
        }

        // Auto-follow playhead if it moves near the right viewport edge during playback
        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const zoom = useEditorStore.getState().timelineZoom;
          const playheadPx = nextTime * zoom;
          const viewLeft = container.scrollLeft;
          const viewRight = viewLeft + container.clientWidth;

          if (playheadPx > viewRight - 40) {
            container.scrollLeft = playheadPx - 80;
          } else if (playheadPx < viewLeft) {
            container.scrollLeft = Math.max(0, playheadPx - 40);
          }
        }

        animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, project.duration, setCurrentTime, setIsPlaying]);

  // Convert pixel coordinate within scrollable track content to seconds
  const clientXToTime = useCallback(
    (clientX: number): number => {
      if (!scrollContainerRef.current) return 0;
      const containerRect = scrollContainerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const clickX = clientX - containerRect.left + scrollLeft;
      return Math.max(0, Math.min(project.duration, clickX / timelineZoom));
    },
    [timelineZoom, project.duration]
  );

  // Time ruler scrub start
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    const time = clientXToTime(e.clientX);
    setCurrentTime(time);
    setDraggingPlayhead(true);
    if (isPlaying) {
      audioEngine.stop();
      audioEngine.play(project.audioClips, assets, time);
    }
  };

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingPlayhead) {
        const time = clientXToTime(e.clientX);
        setCurrentTime(time);
        if (isPlaying) {
          audioEngine.stop();
          audioEngine.play(project.audioClips, assets, time);
        }
      } else if (dragAction) {
        if (dragAction.type === 'cue-trim') {
          const deltaX = e.clientX - dragAction.initialMouseX;
          const deltaTime = deltaX / timelineZoom;
          const cues = dragAction.initialCues.map((c) => ({ ...c }));
          const idx = dragAction.cueIndex;
          if (idx >= 0 && idx < cues.length) {
            const currentCue = cues[idx];
            const nextCue = cues[idx + 1];
            const origEnd = dragAction.initialCues[idx].end;
            const targetClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === dragAction.clipId);
            const clipDuration = targetClip ? targetClip.duration : Infinity;

            const minEnd = currentCue.start + 0.04;
            const maxEnd = nextCue ? Math.max(minEnd, nextCue.end - 0.04) : clipDuration;
            const newEnd = Math.min(maxEnd, Math.max(minEnd, origEnd + deltaTime));

            currentCue.end = Number(newEnd.toFixed(4));
            if (nextCue) {
              nextCue.start = currentCue.end;
            }
            if (targetClip && targetClip.lipSyncData) {
              updateVisualClip(dragAction.clipId, {
                lipSyncData: {
                  ...targetClip.lipSyncData,
                  cues,
                },
              }, false);
            }
          }
          return;
        }

        const deltaX = e.clientX - dragAction.initialMouseX;
        const deltaTime = deltaX / timelineZoom;
        const snapTargets = getSnapTargets(project.tracks, project.audioClips, dragAction.clipId);
        snapTargets.push(currentTime); // Snap to playhead

        if (dragAction.sourceTrackId === 'audio' || dragAction.sourceTrackId === 'A1' || dragAction.sourceTrackId === 'A2') {
          let targetTrackId: AudioTrackId = dragAction.sourceTrackId === 'A2' ? 'A2' : 'A1';
          if (audioLanesRef.current) {
            const rect = audioLanesRef.current.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            if (relY >= 40) {
              targetTrackId = 'A2';
            } else {
              targetTrackId = 'A1';
            }
          }

          if (dragAction.type === 'move') {
            let proposed = Math.max(0, dragAction.initialStart + deltaTime);
            const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
            if (snapped !== proposed) {
              setActiveSnapLine(snapped);
              proposed = snapped;
            } else {
              const proposedEnd = proposed + dragAction.initialDuration;
              const snappedEnd = snapTimeToTargets(proposedEnd, snapTargets, 0.15);
              if (snappedEnd !== proposedEnd) {
                setActiveSnapLine(snappedEnd);
                proposed = Math.max(0, snappedEnd - dragAction.initialDuration);
              } else {
                setActiveSnapLine(null);
              }
            }
            moveAudioClip(dragAction.clipId, proposed, targetTrackId, false);
          } else if (dragAction.type === 'trim-start') {
            const proposed = Math.max(0, dragAction.initialStart + deltaTime);
            const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
            if (snapped !== proposed) setActiveSnapLine(snapped);
            else setActiveSnapLine(null);
            trimAudioClip(dragAction.clipId, 'start', snapped, false);
          } else if (dragAction.type === 'trim-end') {
            const proposed = Math.max(
              dragAction.initialStart + 0.1,
              dragAction.initialStart + dragAction.initialDuration + deltaTime
            );
            const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
            if (snapped !== proposed) setActiveSnapLine(snapped);
            else setActiveSnapLine(null);
            trimAudioClip(dragAction.clipId, 'end', snapped, false);
          }
          return;
        }

        if (dragAction.type === 'move') {
          let proposed = Math.max(0, dragAction.initialStart + deltaTime);
          const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
          if (snapped !== proposed) {
            setActiveSnapLine(snapped);
            proposed = snapped;
          } else {
            const proposedEnd = proposed + dragAction.initialDuration;
            const snappedEnd = snapTimeToTargets(proposedEnd, snapTargets, 0.15);
            if (snappedEnd !== proposedEnd) {
              setActiveSnapLine(snappedEnd);
              proposed = Math.max(0, snappedEnd - dragAction.initialDuration);
            } else {
              setActiveSnapLine(null);
            }
          }

          // Detect vertical track switching by calculating mouse Y relative to tracksContainer
          let targetTrackId = dragAction.sourceTrackId;
          if (tracksContainerRef.current) {
            const tracksRect = tracksContainerRef.current.getBoundingClientRect();
            const relY = e.clientY - tracksRect.top;
            const trackIndex = Math.floor(relY / 44); // 44px height per track lane
            if (trackIndex >= 0 && trackIndex < trackList.length) {
              targetTrackId = trackList[trackIndex];
            }
          }

          moveClip(dragAction.clipId, proposed, targetTrackId, false);
        } else if (dragAction.type === 'trim-start') {
          const proposed = Math.max(0, dragAction.initialStart + deltaTime);
          const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
          if (snapped !== proposed) setActiveSnapLine(snapped);
          else setActiveSnapLine(null);
          trimClip(dragAction.clipId, 'start', snapped, false);
        } else if (dragAction.type === 'trim-end') {
          const proposed = Math.max(
            dragAction.initialStart + 0.1,
            dragAction.initialStart + dragAction.initialDuration + deltaTime
          );
          const snapped = snapTimeToTargets(proposed, snapTargets, 0.15);
          if (snapped !== proposed) setActiveSnapLine(snapped);
          else setActiveSnapLine(null);
          trimClip(dragAction.clipId, 'end', snapped, false);
        }
      }
    },
    [
      draggingPlayhead,
      dragAction,
      timelineZoom,
      clientXToTime,
      setCurrentTime,
      moveClip,
      trimClip,
      moveAudioClip,
      trimAudioClip,
      trackList,
      isPlaying,
      project.tracks,
      project.audioClips,
      currentTime,
      assets,
    ]
  );

  const handleGlobalMouseUp = useCallback(() => {
    setActiveSnapLine(null);
    if (dragAction) {
      pushHistory();
      setDragAction(null);
    }
    setDraggingPlayhead(false);
  }, [dragAction, pushHistory]);

  // Split / Razor tool keyboard shortcut (C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        if (selectedClipId) {
          e.preventDefault();
          splitClip(selectedClipId, currentTime);
        }
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setInPoint(currentTime);
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setOutPoint(currentTime);
      } else if ((e.key === 'x' || e.key === 'X') && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        clearInOutRange();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, currentTime, splitClip, setInPoint, setOutPoint, clearInOutRange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  // Handle Drag & Drop from AssetPanel onto visual tracks
  const handleDropOnTrack = (e: React.DragEvent, trackId: TrackId) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;

    try {
      const data = JSON.parse(dataStr);
      if (data.assetType !== 'image') return;

      const startTime = clientXToTime(e.clientX);
      const asset = assets.get(data.assetId);
      const baseW = (asset && asset.width) || data.width || project.width;
      const baseH = (asset && asset.height) || data.height || project.height;
      const fit = calculateFitToScreen(baseW, baseH, project.width, project.height, 'contain');

      addVisualClip(trackId, {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        assetId: data.assetId,
        start: Number(startTime.toFixed(2)),
        duration: 5.0,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        rotation: 0,
        opacity: 1.0,
        visible: true,
        type: 'image',
      });
    } catch (err) {
      console.warn('Drop failed:', err);
    }
  };

  const handleDropOnAudioTrack = (e: React.DragEvent, trackId: AudioTrackId = 'A1') => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;

    try {
      const data = JSON.parse(dataStr);
      if (data.assetType !== 'audio') return;

      const startTime = clientXToTime(e.clientX);

      addAudioClip({
        id: `aclip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        assetId: data.assetId,
        start: Number(startTime.toFixed(2)),
        duration: data.duration || 5.0,
        volume: 1.0,
        trimStart: 0,
        trimEnd: data.duration || 5.0,
        trackId,
      });
    } catch (err) {
      console.warn('Audio drop failed:', err);
    }
  };

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const f = Math.floor((sec % 1) * project.fps);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{ height: timelineHeight }}
      className="bg-editor-panel border-t border-editor-border/80 flex flex-col select-none text-xs shrink-0 relative"
    >
      {/* Top Drag-to-Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setTimelineHeight(340)}
        title="Drag to resize timeline height (Double-click to reset to 340px)"
        className="h-1.5 -top-1 absolute left-0 right-0 z-30 cursor-ns-resize hover:bg-editor-accent/80 transition-colors group flex items-center justify-center"
      >
        <div className="w-10 h-1 rounded-full bg-editor-border/80 group-hover:bg-editor-accent transition-colors" />
      </div>

      {/* Timeline Controls Header */}
      <div className="h-10 border-b border-editor-border/80 px-3 flex items-center justify-between bg-editor-panel shrink-0 gap-3">
        {/* Left: Playback & Precision Timecode */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              stopPlayback();
              setCurrentTime(0);
            }}
            title="Rewind to Start"
            aria-label="Rewind to Start"
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active transition-colors border border-editor-border/50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => togglePlay()}
            className={`w-7 h-7 rounded-editor-sm text-white flex items-center justify-center shadow-sm transition-all active:scale-95 ${
              isPlaying
                ? 'bg-editor-accent shadow-glow-accent'
                : 'bg-editor-accentAction hover:bg-editor-accent'
            }`}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          <div className="font-mono text-xs tracking-wider bg-editor-surface px-2.5 py-1 rounded-editor-sm border border-editor-border/80 flex items-center space-x-1.5 shadow-inner">
            <span className="font-semibold text-editor-text">{formatTimecode(currentTime)}</span>
            <span className="text-editor-muted font-normal">/</span>
            <span className="text-editor-muted">
              {formatTimecode(project.duration)}
            </span>
          </div>
        </div>

        {/* Center: Tools & Selected Clip Actions */}
        <div className="flex items-center space-x-2">
          {/* Tool mode toggles */}
          <div className="flex items-center bg-editor-surface p-0.5 rounded-editor-sm border border-editor-border/80 space-x-0.5">
            <button
              onClick={() => setActiveTool('select')}
              title="Selection Tool (V)"
              aria-label="Selection Tool"
              className={`p-1 rounded flex items-center justify-center transition-colors ${
                activeTool === 'select'
                  ? 'bg-editor-accent text-white shadow-sm'
                  : 'text-editor-muted hover:text-editor-text hover:bg-editor-hover'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool('razor')}
              title="Razor / Split Tool (C)"
              aria-label="Razor Tool"
              className={`p-1 rounded flex items-center justify-center transition-colors ${
                activeTool === 'razor'
                  ? 'bg-editor-accent text-white shadow-sm'
                  : 'text-editor-muted hover:text-editor-text hover:bg-editor-hover'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* In / Out Mark Controls */}
          <div className="flex items-center bg-editor-surface p-0.5 rounded-editor-sm border border-editor-border/80 space-x-1">
            <button
              onClick={() => setInPoint(currentTime)}
              title="Set In Point (I)"
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
            >
              [ In
            </button>
            <button
              onClick={() => setOutPoint(currentTime)}
              title="Set Out Point (O)"
              className="px-2 py-0.5 rounded text-[10px] font-mono font-medium hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
            >
              Out ]
            </button>
            {inOutRange && (inOutRange.in !== null || inOutRange.out !== null) && (
              <button
                onClick={clearInOutRange}
                title="Clear In/Out Points (Alt+X)"
                aria-label="Clear In/Out Points"
                className="px-1.5 py-0.5 rounded text-[10px] text-editor-muted hover:text-editor-danger hover:bg-editor-danger/10 transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {selectedClipId && (
            <div className="flex items-center space-x-1.5 animate-dropdown-enter">
              <button
                onClick={() => splitClip(selectedClipId, currentTime)}
                title="Split Clip at Playhead (C)"
                className="h-7 px-2.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover text-editor-secondary hover:text-editor-text flex items-center space-x-1 border border-editor-border/80 transition-colors text-[11px]"
              >
                <Scissors className="w-3 h-3 text-editor-accent" />
                <span>Split (C)</span>
              </button>
              <button
                onClick={() => duplicateClip(selectedClipId)}
                title="Duplicate Clip (Ctrl+D)"
                className="h-7 px-2.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover text-editor-secondary hover:text-editor-text flex items-center space-x-1 border border-editor-border/80 transition-colors text-[11px]"
              >
                <Copy className="w-3 h-3 text-editor-accent" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => removeClip(selectedClipId)}
                title="Delete Clip (Del)"
                className="h-7 px-2.5 rounded-editor-sm bg-editor-danger/10 hover:bg-editor-danger/20 text-editor-danger flex items-center space-x-1 border border-editor-danger/30 transition-colors text-[11px]"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Zoom controls */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setTimelineZoom(Math.max(20, timelineZoom - 15))}
            title="Zoom Out Timeline"
            aria-label="Zoom Out Timeline"
            className="w-6 h-6 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min="20"
            max="200"
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseInt(e.target.value))}
            className="w-20"
          />
          <button
            onClick={() => setTimelineZoom(Math.min(240, timelineZoom + 15))}
            title="Zoom In Timeline"
            aria-label="Zoom In Timeline"
            className="w-6 h-6 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-editor-border/60 mx-0.5" />
          <button
            onClick={() => setTimelineHeight((h) => (h > 350 ? 340 : 440))}
            title={timelineHeight > 350 ? 'Compact Timeline Height (340px)' : 'Expand Timeline Height (440px)'}
            aria-label={timelineHeight > 350 ? 'Compact Timeline Height' : 'Expand Timeline Height'}
            className="w-6 h-6 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            {timelineHeight > 350 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Timeline Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column (Fixed on Left) */}
        <div className="w-32 bg-editor-panel border-r border-editor-border flex flex-col shrink-0 z-10 shadow-sm overflow-y-hidden">
          {/* Header spacer aligned with ruler */}
          <div className="h-6 border-b border-editor-border bg-editor-surface/80 px-2.5 flex items-center justify-between text-[10px] text-editor-muted uppercase font-semibold tracking-wider">
            <span>Layers</span>
            <Layers className="w-3 h-3 text-editor-muted" />
          </div>

          {/* Visual Track Headers (V4 down to V1) */}
          {trackList.map((id) => (
            <div
              key={id}
              className="h-11 border-b border-editor-border px-2.5 flex items-center justify-between bg-editor-panel/70 hover:bg-editor-hover/40 transition-colors"
            >
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-editor-accent/70" />
                <span className="font-semibold text-editor-text text-xs font-mono">{id}</span>
              </div>
              <span className="text-[10px] text-editor-muted font-medium">
                {id === 'V4' ? 'Top' : id === 'V1' ? 'Base' : ''}
              </span>
            </div>
          ))}

          {/* Audio Track Header (A1) */}
          <div className="h-10 border-b border-editor-border px-2 flex items-center justify-between bg-editor-panel/90">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="font-semibold text-amber-400 text-[11px] font-mono truncate">A1 Voice</span>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={() => setAudioTrackSettings('A1', { muted: !project.audioTrackSettings?.A1?.muted })}
                title={project.audioTrackSettings?.A1?.muted ? 'Unmute A1' : 'Mute A1'}
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border transition-colors ${
                  project.audioTrackSettings?.A1?.muted
                    ? 'bg-red-500/20 text-red-400 border-red-500/50'
                    : 'bg-editor-surface/60 text-editor-muted hover:text-editor-text border-editor-border/50'
                }`}
              >
                M
              </button>
              <button
                type="button"
                onClick={() => setAudioTrackSettings('A1', { solo: !project.audioTrackSettings?.A1?.solo })}
                title={project.audioTrackSettings?.A1?.solo ? 'Un-solo A1' : 'Solo A1'}
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border transition-colors ${
                  project.audioTrackSettings?.A1?.solo
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-editor-surface/60 text-editor-muted hover:text-editor-text border-editor-border/50'
                }`}
              >
                S
              </button>
            </div>
          </div>

          {/* Audio Track Header (A2) */}
          <div className="h-10 border-b border-editor-border px-2 flex items-center justify-between bg-editor-panel/90">
            <div className="flex items-center space-x-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              <span className="font-semibold text-cyan-400 text-[11px] font-mono truncate">A2 SFX</span>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={() => setAudioTrackSettings('A2', { muted: !project.audioTrackSettings?.A2?.muted })}
                title={project.audioTrackSettings?.A2?.muted ? 'Unmute A2' : 'Mute A2'}
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border transition-colors ${
                  project.audioTrackSettings?.A2?.muted
                    ? 'bg-red-500/20 text-red-400 border-red-500/50'
                    : 'bg-editor-surface/60 text-editor-muted hover:text-editor-text border-editor-border/50'
                }`}
              >
                M
              </button>
              <button
                type="button"
                onClick={() => setAudioTrackSettings('A2', { solo: !project.audioTrackSettings?.A2?.solo })}
                title={project.audioTrackSettings?.A2?.solo ? 'Un-solo A2' : 'Solo A2'}
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center border transition-colors ${
                  project.audioTrackSettings?.A2?.solo
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-editor-surface/60 text-editor-muted hover:text-editor-text border-editor-border/50'
                }`}
              >
                S
              </button>
            </div>
          </div>
        </div>

        {/* Tracks Content & Ruler (Scrollable horizontally) */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#131419]">
          <div style={{ width: totalWidth }} className="relative h-full">
            {/* Time Ruler */}
            <div
              ref={rulerRef}
              onMouseDown={handleRulerMouseDown}
              className="h-6 border-b border-editor-border bg-editor-surface/80 cursor-pointer relative select-none"
            >
              {Array.from({ length: Math.ceil(project.duration) + 1 }).map((_, sec) => (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-editor-border/80 pl-1 text-[9px] text-editor-muted font-mono flex items-center"
                  style={{ left: sec * timelineZoom }}
                >
                  <span className="opacity-80">{sec}s</span>
                </div>
              ))}
            </div>

            {/* Magnetic Snapping Indicator Line (Feature 08) */}
            {activeSnapLine !== null && (
              <div
                className="absolute top-0 bottom-0 z-40 pointer-events-none"
                style={{ left: activeSnapLine * timelineZoom }}
              >
                <div className="w-0.5 h-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]" />
                <div className="absolute top-1 -left-5 bg-cyan-500 text-black font-mono text-[8px] px-1 py-0.2 rounded font-bold shadow">
                  {activeSnapLine.toFixed(2)}s
                </div>
              </div>
            )}

            {/* In / Out Range Highlight Overlay (Feature 15) */}
            {inOutRange && (inOutRange.in !== null || inOutRange.out !== null) && (
              <div
                className="absolute top-0 bottom-0 bg-violet-600/10 border-x-2 border-violet-500/60 pointer-events-none z-20"
                style={{
                  left: (inOutRange.in ?? 0) * timelineZoom,
                  width: Math.max(2, ((inOutRange.out ?? project.duration) - (inOutRange.in ?? 0)) * timelineZoom),
                }}
              >
                {inOutRange.in !== null && (
                  <div className="absolute top-0 -left-2 w-4 h-5 bg-violet-600 text-white font-mono text-[9px] font-bold flex items-center justify-center rounded-b shadow">
                    [
                  </div>
                )}
                {inOutRange.out !== null && (
                  <div className="absolute top-0 -right-2 w-4 h-5 bg-violet-600 text-white font-mono text-[9px] font-bold flex items-center justify-center rounded-b shadow">
                    ]
                  </div>
                )}
              </div>
            )}

            {/* Playhead Precision Vertical Guide & Head */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: currentTime * timelineZoom }}
            >
              {/* Playhead Head (Ruby diamond) */}
              <div className="w-3 h-3 bg-red-500 rotate-45 -translate-x-1.5 -translate-y-1 rounded-[1px] shadow-md pointer-events-auto cursor-ew-resize hover:scale-110 transition-transform" />
              {/* Vertical hairline */}
              <div className="w-px h-full bg-red-500/90 shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
            </div>

            {/* Visual Track Lanes Container */}
            <div ref={tracksContainerRef}>
              {trackList.map((trackId, idx) => {
                const track = project.tracks.find((t) => t.id === trackId);
                const isAlt = idx % 2 === 1;

                return (
                  <div
                    key={trackId}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnTrack(e, trackId)}
                    className={`h-11 border-b border-editor-border/50 relative transition-colors ${
                      isAlt ? 'bg-[#15161D]' : 'bg-[#181922]'
                    } hover:bg-editor-subpanel/30`}
                  >
                    {track?.clips.map((clip) => {
                      const isSelected = selectedClipId === clip.id;
                      const left = clip.start * timelineZoom;
                      const width = Math.max(14, clip.duration * timelineZoom);
                      const asset = assets.get(clip.assetId);

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (activeTool === 'razor') {
                              const splitTime = clientXToTime(e.clientX);
                              splitClip(clip.id, splitTime);
                              return;
                            }
                            selectClip(clip.id, trackId);
                            setDragAction({
                              type: 'move',
                              clipId: clip.id,
                              sourceTrackId: trackId,
                              initialMouseX: e.clientX,
                              initialMouseY: e.clientY,
                              initialStart: clip.start,
                              initialDuration: clip.duration,
                            });
                          }}
                          style={{ left, width }}
                          className={`absolute top-0.5 bottom-0.5 rounded-editor-sm px-2 flex flex-col justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all shadow-sm overflow-hidden ${
                            clip.type === 'lipSync'
                              ? isSelected
                                ? 'bg-violet-700 text-white ring-2 ring-violet-400 shadow-glow-accent'
                                : 'bg-violet-950/80 hover:bg-violet-900/80 text-violet-100 border border-violet-500/50'
                              : isSelected
                              ? 'bg-editor-active text-white ring-2 ring-editor-accent shadow-glow-accent'
                              : 'bg-[#222430] hover:bg-[#2A2C3C] text-editor-text border border-editor-border'
                          }`}
                        >
                          {/* Left Trim Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              selectClip(clip.id, trackId);
                              setDragAction({
                                type: 'trim-start',
                                clipId: clip.id,
                                sourceTrackId: trackId,
                                initialMouseX: e.clientX,
                                initialMouseY: e.clientY,
                                initialStart: clip.start,
                                initialDuration: clip.duration,
                              });
                            }}
                            className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-w-resize rounded-l-editor-sm z-20"
                          />

                          {/* Top row: Label & Type Icon & Duration */}
                          <div className="flex items-center justify-between w-full pt-0.5 pointer-events-none">
                            <div className="flex items-center space-x-1.5 truncate">
                              {clip.type === 'lipSync' ? (
                                <Smile className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-editor-accent shrink-0" />
                              )}
                              <span className="truncate text-xs">{asset?.name || 'Clip'}</span>
                            </div>
                            <span className="text-[10px] opacity-75 font-mono ml-1 shrink-0">
                              {clip.duration.toFixed(1)}s
                            </span>
                          </div>

                          {/* Bottom row: Interactive Viseme Cue Lane (Feature 02) */}
                          {clip.type === 'lipSync' && clip.lipSyncData?.cues && clip.lipSyncData.cues.length > 0 && (
                            <div className="relative w-full h-4 mb-0.5 flex overflow-hidden rounded bg-black/40 border border-violet-500/30 z-10">
                              {clip.lipSyncData.cues.map((cue, cIdx) => {
                                const cueLeft = (cue.start / clip.duration) * 100;
                                const cueWidth = Math.max(0.5, ((cue.end - cue.start) / clip.duration) * 100);
                                const isCueActive =
                                  currentTime >= clip.start + cue.start && currentTime < clip.start + cue.end;

                                return (
                                  <div
                                    key={cue.id || cIdx}
                                    style={{ left: `${cueLeft}%`, width: `${cueWidth}%` }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveCuePopover({
                                        clipId: clip.id,
                                        cueIndex: cIdx,
                                        currentShape: cue.mouthId || 'X',
                                        clientX: e.clientX,
                                        clientY: e.clientY,
                                      });
                                    }}
                                    className={`absolute top-0 bottom-0 border-r border-violet-900/60 flex items-center justify-center font-mono text-[9px] font-bold cursor-pointer transition-colors ${
                                      isCueActive
                                        ? 'bg-violet-400 text-black shadow-sm font-black'
                                        : 'bg-violet-950/70 hover:bg-violet-800 text-violet-200'
                                    }`}
                                    title={`Viseme ${cue.mouthId} (${cue.start.toFixed(2)}s - ${cue.end.toFixed(2)}s) — Click to swap`}
                                  >
                                    <span className="truncate px-0.5 pointer-events-none">{cue.mouthId}</span>
                                    {/* Cue Right Boundary Drag Handle */}
                                    <div
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        setDragAction({
                                          type: 'cue-trim',
                                          clipId: clip.id,
                                          cueIndex: cIdx,
                                          initialMouseX: e.clientX,
                                          initialCues: clip.lipSyncData!.cues,
                                        });
                                      }}
                                      className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/60 cursor-col-resize z-20"
                                      title="Drag cue boundary"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Transform Keyframes Diamond Markers (Feature 11) */}
                          {clip.keyframes && clip.keyframes.length > 0 && (
                            <div className="absolute inset-x-2 bottom-0.5 h-3 pointer-events-none z-20 flex items-center">
                              {clip.keyframes.map((kf) => {
                                const kfLeft = Math.min(100, Math.max(0, (kf.time / clip.duration) * 100));
                                return (
                                  <div
                                    key={kf.id}
                                    title={`Keyframe at ${kf.time.toFixed(2)}s (${kf.easing || 'linear'}) — click to seek`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrentTime(clip.start + kf.time);
                                    }}
                                    style={{ left: `${kfLeft}%` }}
                                    className="absolute -translate-x-1/2 w-2.5 h-2.5 bg-amber-400 hover:bg-amber-300 rotate-45 border border-black/80 hover:scale-150 transition-transform pointer-events-auto cursor-pointer shadow-sm"
                                  />
                                );
                              })}
                            </div>
                          )}

                          {/* Right Trim Handle */}
                          <div
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              selectClip(clip.id, trackId);
                              setDragAction({
                                type: 'trim-end',
                                clipId: clip.id,
                                sourceTrackId: trackId,
                                initialMouseX: e.clientX,
                                initialMouseY: e.clientY,
                                initialStart: clip.start,
                                initialDuration: clip.duration,
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-e-resize rounded-r-editor-sm z-20"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Audio Track Lanes Container (A1 & A2) */}
            <div ref={audioLanesRef}>
              {/* Lane A1 (Voice / Primary) */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnAudioTrack(e, 'A1')}
                className="h-10 border-b border-editor-border/50 relative bg-amber-950/15"
              >
                {project.audioClips
                  .filter((c) => (c.trackId || 'A1') === 'A1')
                  .map((aClip) => {
                    const left = aClip.start * timelineZoom;
                    const width = Math.max(14, aClip.duration * timelineZoom);
                    const asset = assets.get(aClip.assetId);
                    const isSelected = selectedClipId === aClip.id;

                    return (
                      <div
                        key={aClip.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (activeTool === 'razor') {
                            const splitTime = clientXToTime(e.clientX);
                            splitClip(aClip.id, splitTime);
                            return;
                          }
                          selectClip(aClip.id, 'audio');
                          setDragAction({
                            type: 'move',
                            clipId: aClip.id,
                            sourceTrackId: 'A1',
                            initialMouseX: e.clientX,
                            initialMouseY: e.clientY,
                            initialStart: aClip.start,
                            initialDuration: aClip.duration,
                          });
                        }}
                        style={{ left, width }}
                        className={`absolute top-0.5 bottom-0.5 rounded-editor-sm px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all shadow-sm overflow-hidden ${
                          isSelected
                            ? 'bg-amber-600 text-white ring-2 ring-amber-300 shadow-sm'
                            : 'bg-amber-950/80 hover:bg-amber-900/80 text-amber-100 border border-amber-600/50'
                        }`}
                      >
                        {/* Audio Waveform Canvas (Feature 06) */}
                        <AudioWaveform clip={aClip} asset={asset} width={width} height={32} />
                        {/* Left Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            selectClip(aClip.id, 'audio');
                            setDragAction({
                              type: 'trim-start',
                              clipId: aClip.id,
                              sourceTrackId: 'A1',
                              initialMouseX: e.clientX,
                              initialMouseY: e.clientY,
                              initialStart: aClip.start,
                              initialDuration: aClip.duration,
                            });
                          }}
                          className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-w-resize rounded-l-editor-sm"
                        />

                        <div className="flex items-center space-x-1.5 truncate pointer-events-none">
                          <Volume2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span className="truncate">{asset?.name || 'A1 Voice'}</span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] font-mono opacity-80 pointer-events-none">
                            {aClip.duration.toFixed(1)}s
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAudioClip(aClip.id);
                            }}
                            title="Delete Audio Clip"
                            className="p-0.5 rounded hover:bg-red-800 text-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Right Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            selectClip(aClip.id, 'audio');
                            setDragAction({
                              type: 'trim-end',
                              clipId: aClip.id,
                              sourceTrackId: 'A1',
                              initialMouseX: e.clientX,
                              initialMouseY: e.clientY,
                              initialStart: aClip.start,
                              initialDuration: aClip.duration,
                            });
                          }}
                          className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-e-resize rounded-r-editor-sm"
                        />
                      </div>
                    );
                  })}
              </div>

              {/* Lane A2 (SFX / Music / Secondary) */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnAudioTrack(e, 'A2')}
                className="h-10 border-b border-editor-border/50 relative bg-cyan-950/15"
              >
                {project.audioClips
                  .filter((c) => c.trackId === 'A2')
                  .map((aClip) => {
                    const left = aClip.start * timelineZoom;
                    const width = Math.max(14, aClip.duration * timelineZoom);
                    const asset = assets.get(aClip.assetId);
                    const isSelected = selectedClipId === aClip.id;

                    return (
                      <div
                        key={aClip.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (activeTool === 'razor') {
                            const splitTime = clientXToTime(e.clientX);
                            splitClip(aClip.id, splitTime);
                            return;
                          }
                          selectClip(aClip.id, 'audio');
                          setDragAction({
                            type: 'move',
                            clipId: aClip.id,
                            sourceTrackId: 'A2',
                            initialMouseX: e.clientX,
                            initialMouseY: e.clientY,
                            initialStart: aClip.start,
                            initialDuration: aClip.duration,
                          });
                        }}
                        style={{ left, width }}
                        className={`absolute top-0.5 bottom-0.5 rounded-editor-sm px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all shadow-sm overflow-hidden ${
                          isSelected
                            ? 'bg-cyan-600 text-white ring-2 ring-cyan-300 shadow-sm'
                            : 'bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-100 border border-cyan-600/50'
                        }`}
                      >
                        {/* Audio Waveform Canvas (Feature 06) */}
                        <AudioWaveform clip={aClip} asset={asset} width={width} height={32} />
                        {/* Left Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            selectClip(aClip.id, 'audio');
                            setDragAction({
                              type: 'trim-start',
                              clipId: aClip.id,
                              sourceTrackId: 'A2',
                              initialMouseX: e.clientX,
                              initialMouseY: e.clientY,
                              initialStart: aClip.start,
                              initialDuration: aClip.duration,
                            });
                          }}
                          className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-w-resize rounded-l-editor-sm"
                        />

                        <div className="flex items-center space-x-1.5 truncate pointer-events-none">
                          <Volume2 className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                          <span className="truncate">{asset?.name || 'A2 SFX'}</span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] font-mono opacity-80 pointer-events-none">
                            {aClip.duration.toFixed(1)}s
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAudioClip(aClip.id);
                            }}
                            title="Delete Audio Clip"
                            className="p-0.5 rounded hover:bg-red-800 text-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Right Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            selectClip(aClip.id, 'audio');
                            setDragAction({
                              type: 'trim-end',
                              clipId: aClip.id,
                              sourceTrackId: 'A2',
                              initialMouseX: e.clientX,
                              initialMouseY: e.clientY,
                              initialStart: aClip.start,
                              initialDuration: aClip.duration,
                            });
                          }}
                          className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-e-resize rounded-r-editor-sm"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Viseme Shape Selector Popover (Feature 02) */}
      {activeCuePopover && (
        <div
          className="fixed z-50 bg-editor-elevated border border-editor-border rounded-editor-md shadow-modal p-2 text-xs flex flex-col space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(window.innerWidth - 220, Math.max(10, activeCuePopover.clientX - 90)),
            top: Math.max(10, activeCuePopover.clientY - 95),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[11px] text-editor-secondary font-medium pb-1 border-b border-editor-border">
            <span>Swap Viseme Shape</span>
            <button
              onClick={() => setActiveCuePopover(null)}
              className="w-4 h-4 rounded hover:bg-editor-hover text-editor-muted flex items-center justify-center text-[10px]"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1 pt-0.5">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'].map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => {
                  const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === activeCuePopover.clipId);
                  if (clip && clip.lipSyncData) {
                    const updatedCues = clip.lipSyncData.cues.map((c, idx) =>
                      idx === activeCuePopover.cueIndex ? { ...c, mouthId: shape, shape } : c
                    );
                    updateVisualClip(
                      clip.id,
                      {
                        lipSyncData: {
                          ...clip.lipSyncData,
                          cues: updatedCues,
                        },
                      },
                      true
                    );
                  }
                  setActiveCuePopover(null);
                }}
                className={`w-7 h-7 rounded font-mono font-bold text-xs flex items-center justify-center transition-colors ${
                  activeCuePopover.currentShape === shape
                    ? 'bg-violet-600 text-white shadow-glow-accent'
                    : 'bg-editor-surface hover:bg-violet-950/80 hover:text-violet-200 text-editor-text border border-editor-border'
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
