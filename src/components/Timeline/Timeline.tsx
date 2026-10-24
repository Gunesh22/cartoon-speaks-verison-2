import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { TrackId, VisualClip, AudioClip } from '../../types/timeline';
import {
  Play,
  Pause,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Copy,
  Trash2,
  Volume2,
  Smile,
  Image as ImageIcon,
  Sparkles,
  Layers,
} from 'lucide-react';
import { audioEngine } from '../../core/audio/audioEngine';
import { calculateFitToScreen } from '../../core/timeline/timelineMath';

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
  } = useEditorStore();

  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [dragAction, setDragAction] = useState<{
    type: 'move' | 'trim-start' | 'trim-end';
    clipId: string;
    sourceTrackId: TrackId | 'audio';
    initialMouseX: number;
    initialMouseY: number;
    initialStart: number;
    initialDuration: number;
  } | null>(null);

  const totalWidth = Math.max(900, project.duration * timelineZoom + 300);
  const trackList: TrackId[] = ['V4', 'V3', 'V2', 'V1'];

  // Smooth 60fps playback animation frame loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    if (isPlaying) {
      const tick = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        const audioTime = audioEngine.getCurrentPlayheadTime();
        if (audioTime !== null) {
          if (audioTime >= project.duration) {
            audioEngine.stop();
            setIsPlaying(false);
            setCurrentTime(project.duration);
            return;
          } else {
            setCurrentTime(audioTime);
          }
        } else {
          const current = useEditorStore.getState().currentTime;
          const nextTime = current + dt;
          if (nextTime >= project.duration) {
            setIsPlaying(false);
            setCurrentTime(project.duration);
            return;
          } else {
            setCurrentTime(nextTime);
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
        const deltaX = e.clientX - dragAction.initialMouseX;
        const deltaTime = deltaX / timelineZoom;

        if (dragAction.sourceTrackId === 'audio') {
          if (dragAction.type === 'move') {
            const newStart = Math.max(0, dragAction.initialStart + deltaTime);
            moveAudioClip(dragAction.clipId, newStart, false);
          } else if (dragAction.type === 'trim-start') {
            const newStart = Math.max(0, dragAction.initialStart + deltaTime);
            trimAudioClip(dragAction.clipId, 'start', newStart, false);
          } else if (dragAction.type === 'trim-end') {
            const newEnd = Math.max(
              dragAction.initialStart + 0.1,
              dragAction.initialStart + dragAction.initialDuration + deltaTime
            );
            trimAudioClip(dragAction.clipId, 'end', newEnd, false);
          }
          return;
        }

        if (dragAction.type === 'move') {
          const newStart = Math.max(0, dragAction.initialStart + deltaTime);

          // Detect vertical track switching by calculating mouse Y relative to tracksContainer
          let targetTrackId = dragAction.sourceTrackId;
          if (tracksContainerRef.current) {
            const tracksRect = tracksContainerRef.current.getBoundingClientRect();
            const relY = e.clientY - tracksRect.top;
            const trackIndex = Math.floor(relY / 40); // 40px height per track lane
            if (trackIndex >= 0 && trackIndex < trackList.length) {
              targetTrackId = trackList[trackIndex];
            }
          }

          moveClip(dragAction.clipId, newStart, targetTrackId, false);
        } else if (dragAction.type === 'trim-start') {
          const newStart = Math.max(0, dragAction.initialStart + deltaTime);
          trimClip(dragAction.clipId, 'start', newStart, false);
        } else if (dragAction.type === 'trim-end') {
          const newEnd = Math.max(
            dragAction.initialStart + 0.1,
            dragAction.initialStart + dragAction.initialDuration + deltaTime
          );
          trimClip(dragAction.clipId, 'end', newEnd, false);
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
      project.audioClips,
      assets,
    ]
  );

  const handleGlobalMouseUp = useCallback(() => {
    if (dragAction) {
      pushHistory();
      setDragAction(null);
    }
    setDraggingPlayhead(false);
  }, [dragAction, pushHistory]);

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

  const handleDropOnAudioTrack = (e: React.DragEvent) => {
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
    <div className="h-64 bg-editor-panel border-t border-editor-border flex flex-col select-none text-xs shrink-0">
      {/* Timeline Controls Header */}
      <div className="h-10 border-b border-editor-border px-3.5 flex items-center justify-between bg-editor-panel shrink-0">
        {/* Left: Playback & Precision Timecode */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              stopPlayback();
              setCurrentTime(0);
            }}
            title="Rewind to Start"
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => togglePlay()}
            className="w-7 h-7 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white flex items-center justify-center shadow-sm transition-all active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          <div className="font-mono text-editor-text text-xs tracking-wider bg-editor-surface px-2.5 py-1 rounded-editor-sm border border-editor-border flex items-center space-x-1.5 shadow-inner">
            <span className="font-semibold text-editor-text">{formatTimecode(currentTime)}</span>
            <span className="text-editor-muted font-normal">/</span>
            <span className="text-editor-muted">{formatTimecode(project.duration)}</span>
          </div>
        </div>

        {/* Center: Selected Clip Actions */}
        {selectedClipId && (
          <div className="flex items-center space-x-1.5 animate-in fade-in duration-100">
            <button
              onClick={() => duplicateClip(selectedClipId)}
              title="Duplicate Clip (Ctrl+D)"
              className="h-7 px-2.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover text-editor-secondary hover:text-editor-text flex items-center space-x-1 border border-editor-border transition-colors text-[11px]"
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

        {/* Right: Zoom controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTimelineZoom(Math.max(20, timelineZoom - 15))}
            title="Zoom Out Timeline"
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
            className="w-6 h-6 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Timeline Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column (Fixed on Left) */}
        <div className="w-32 bg-editor-panel border-r border-editor-border flex flex-col shrink-0 z-10 shadow-sm">
          {/* Header spacer aligned with ruler */}
          <div className="h-6 border-b border-editor-border bg-editor-surface/80 px-2.5 flex items-center justify-between text-[10px] text-editor-muted uppercase font-semibold tracking-wider">
            <span>Layers</span>
            <Layers className="w-3 h-3 text-editor-muted" />
          </div>

          {/* Visual Track Headers (V4 down to V1) */}
          {trackList.map((id) => (
            <div
              key={id}
              className="h-10 border-b border-editor-border px-2.5 flex items-center justify-between bg-editor-panel/70 hover:bg-editor-hover/40 transition-colors"
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
          <div className="h-10 border-b border-editor-border px-2.5 flex items-center justify-between bg-editor-panel/90">
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="font-semibold text-amber-400 text-xs font-mono">A1 Audio</span>
            </div>
            <Volume2 className="w-3.5 h-3.5 text-amber-500/80" />
          </div>
        </div>

        {/* Tracks Content & Ruler (Scrollable horizontally) */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto relative bg-[#131419]">
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
                    className={`h-10 border-b border-editor-border/50 relative transition-colors ${
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
                          className={`absolute top-1 bottom-1 rounded-editor-sm px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all shadow-sm ${
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
                            className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-w-resize rounded-l-editor-sm"
                          />

                          {/* Label & Type Icon */}
                          <div className="flex items-center space-x-1.5 truncate pointer-events-none">
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
                            className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/30 cursor-e-resize rounded-r-editor-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Audio Track Lane */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropOnAudioTrack}
              className="h-10 border-b border-editor-border/50 relative bg-amber-950/15"
            >
              {project.audioClips.map((aClip) => {
                const left = aClip.start * timelineZoom;
                const width = Math.max(14, aClip.duration * timelineZoom);
                const asset = assets.get(aClip.assetId);
                const isSelected = selectedClipId === aClip.id;

                return (
                  <div
                    key={aClip.id}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      selectClip(aClip.id, 'audio');
                      setDragAction({
                        type: 'move',
                        clipId: aClip.id,
                        sourceTrackId: 'audio',
                        initialMouseX: e.clientX,
                        initialMouseY: e.clientY,
                        initialStart: aClip.start,
                        initialDuration: aClip.duration,
                      });
                    }}
                    style={{ left, width }}
                    className={`absolute top-1 bottom-1 rounded-editor-sm px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing select-none transition-all shadow-sm ${
                      isSelected
                        ? 'bg-amber-600 text-white ring-2 ring-amber-300 shadow-sm'
                        : 'bg-amber-950/80 hover:bg-amber-900/80 text-amber-100 border border-amber-600/50'
                    }`}
                  >
                    {/* Left Trim Handle */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        selectClip(aClip.id, 'audio');
                        setDragAction({
                          type: 'trim-start',
                          clipId: aClip.id,
                          sourceTrackId: 'audio',
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
                      <span className="truncate">{asset?.name || 'Audio Track'}</span>
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
                          sourceTrackId: 'audio',
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
  );
};
