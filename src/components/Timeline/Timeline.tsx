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

  const totalWidth = Math.max(800, project.duration * timelineZoom + 250);
  const trackList: TrackId[] = ['V4', 'V3', 'V2', 'V1'];

  // Smooth 60fps playback animation frame loop (does not tear down every 50ms!)
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
      // Commit action to undo history on mouse up
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
    <div className="h-64 bg-editor-panel border-t border-editor-border flex flex-col select-none text-xs">
      {/* Timeline Controls Header */}
      <div className="h-9 border-b border-editor-border px-3 flex items-center justify-between bg-editor-subpanel">
        {/* Left: Playback & Timecode */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              stopPlayback();
              setCurrentTime(0);
            }}
            title="Rewind to Start"
            className="p-1 rounded hover:bg-editor-panel text-gray-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => togglePlay()}
            className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
          </button>

          <div className="font-mono text-gray-200 text-xs tracking-wider bg-editor-bg px-2 py-0.5 rounded border border-editor-border">
            {formatTimecode(currentTime)} <span className="text-gray-500">/ {formatTimecode(project.duration)}</span>
          </div>
        </div>

        {/* Center: Selected Clip Actions */}
        {selectedClipId && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => duplicateClip(selectedClipId)}
              title="Duplicate Clip (Ctrl+D)"
              className="px-2 py-1 rounded bg-editor-panel hover:bg-editor-border text-gray-300 flex items-center space-x-1 border border-editor-border"
            >
              <Copy className="w-3 h-3" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={() => removeClip(selectedClipId)}
              title="Delete Clip (Del)"
              className="px-2 py-1 rounded bg-red-900/40 hover:bg-red-800/60 text-red-300 flex items-center space-x-1 border border-red-800/50"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        )}

        {/* Right: Zoom controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTimelineZoom(timelineZoom - 15)}
            title="Zoom Out"
            className="p-1 rounded hover:bg-editor-panel text-gray-300"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min="20"
            max="200"
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(parseInt(e.target.value))}
            className="w-20 accent-blue-500"
          />
          <button
            onClick={() => setTimelineZoom(timelineZoom + 15)}
            title="Zoom In"
            className="p-1 rounded hover:bg-editor-panel text-gray-300"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Timeline Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers Column (Fixed on Left) */}
        <div className="w-28 bg-editor-panel border-r border-editor-border flex flex-col flex-shrink-0 z-10">
          <div className="h-6 border-b border-editor-border bg-editor-subpanel px-2 flex items-center text-[10px] text-gray-500 uppercase font-semibold">
            Layers
          </div>
          {trackList.map((id) => (
            <div
              key={id}
              className="h-10 border-b border-editor-border px-2 flex items-center justify-between bg-editor-panel/50 hover:bg-editor-subpanel/50 transition-colors"
            >
              <span className="font-semibold text-gray-300 text-xs">{id}</span>
              <span className="text-[10px] text-gray-500">
                {id === 'V4' ? 'Top' : id === 'V1' ? 'Base' : ''}
              </span>
            </div>
          ))}
          {/* Audio Track Header */}
          <div className="h-10 border-b border-editor-border px-2 flex items-center justify-between bg-editor-panel/80">
            <span className="font-semibold text-amber-400 text-xs">Audio (A1)</span>
            <Volume2 className="w-3.5 h-3.5 text-amber-500" />
          </div>
        </div>

        {/* Tracks Content & Ruler (Scrollable horizontally) */}
        <div ref={scrollContainerRef} className="flex-1 overflow-x-auto relative bg-[#17181c]">
          <div style={{ width: totalWidth }} className="relative h-full">
            {/* Time Ruler */}
            <div
              ref={rulerRef}
              onMouseDown={handleRulerMouseDown}
              className="h-6 border-b border-editor-border bg-editor-subpanel/80 cursor-pointer relative select-none"
            >
              {Array.from({ length: Math.ceil(project.duration) + 1 }).map((_, sec) => (
                <div
                  key={sec}
                  className="absolute top-0 bottom-0 border-l border-gray-600/60 pl-1 text-[9px] text-gray-400 font-mono"
                  style={{ left: sec * timelineZoom }}
                >
                  {sec}s
                </div>
              ))}
            </div>

            {/* Playhead Vertical Line */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: currentTime * timelineZoom }}
            >
              <div className="w-3 h-3 bg-red-500 rotate-45 -translate-x-1.5 -translate-y-1 rounded-[1px] shadow-md pointer-events-auto cursor-ew-resize" />
              <div className="w-px h-full bg-red-500 shadow" />
            </div>

            {/* Visual Track Lanes Container */}
            <div ref={tracksContainerRef}>
              {trackList.map((trackId) => {
                const track = project.tracks.find((t) => t.id === trackId);
                return (
                  <div
                    key={trackId}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDropOnTrack(e, trackId)}
                    className="h-10 border-b border-editor-border/60 relative bg-editor-bg/40 hover:bg-editor-subpanel/20 transition-colors"
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
                          className={`absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing shadow select-none transition-shadow ${
                            clip.type === 'lipSync'
                              ? isSelected
                                ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                                : 'bg-purple-800/80 hover:bg-purple-700/80 text-purple-100 border border-purple-500/50'
                              : isSelected
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                              : 'bg-blue-800/80 hover:bg-blue-700/80 text-blue-100 border border-blue-500/50'
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
                            className="absolute left-0 top-0 bottom-0 w-2.5 hover:bg-white/40 cursor-w-resize rounded-l"
                          />

                          {/* Label & Type Icon */}
                          <div className="flex items-center space-x-1.5 truncate pointer-events-none">
                            {clip.type === 'lipSync' ? (
                              <Smile className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />
                            )}
                            <span className="truncate">{asset?.name || 'Clip'}</span>
                          </div>

                          <span className="text-[10px] opacity-75 font-mono ml-1 flex-shrink-0">
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
                            className="absolute right-0 top-0 bottom-0 w-2.5 hover:bg-white/40 cursor-e-resize rounded-r"
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
              className="h-10 border-b border-editor-border/60 relative bg-amber-950/20"
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
                    className={`absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing shadow select-none transition-shadow ${
                      isSelected
                        ? 'bg-amber-600 text-white ring-2 ring-amber-300'
                        : 'bg-amber-800/80 hover:bg-amber-700/80 text-amber-100 border border-amber-600/50'
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
                      className="absolute left-0 top-0 bottom-0 w-2.5 hover:bg-white/40 cursor-w-resize rounded-l"
                    />

                    <div className="flex items-center space-x-1.5 truncate pointer-events-none">
                      <Volume2 className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
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
                      className="absolute right-0 top-0 bottom-0 w-2.5 hover:bg-white/40 cursor-e-resize rounded-r"
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
