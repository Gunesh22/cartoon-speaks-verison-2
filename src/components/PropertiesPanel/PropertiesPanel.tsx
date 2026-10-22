import React from 'react';
import { useEditorStore } from '../../state/editorStore';
import { TrackId } from '../../types/timeline';
import {
  Sliders,
  Move,
  Maximize,
  Maximize2,
  Scan,
  AlignCenter,
  RotateCcw,
  RotateCw,
  Sun,
  Clock,
  Layers,
  Smile,
  Anchor,
  Monitor,
  Ratio,
  Film,
  Volume2,
  Trash2,
  Copy,
} from 'lucide-react';
import { ASPECT_RATIO_PRESETS, AspectRatioPreset, getProjectAspectRatio } from '../../types/project';

export const PropertiesPanel: React.FC = () => {
  const {
    project,
    selectedClipId,
    selectedClipTrackId,
    updateVisualClip,
    moveClip,
    setAspectRatioPreset,
    setProjectDimensions,
    setProjectDuration,
    renameProject,
    fitClipToScreen,
    centerClipOnScreen,
    resetClipSize,
    updateAudioClip,
    duplicateClip,
    removeClip,
    assets,
    mouthSets,
  } = useEditorStore();

  let selectedClip = null;
  let currentTrackId: TrackId | null = null;
  let selectedAudio = null;

  if (selectedClipId) {
    for (const track of project.tracks) {
      const c = track.clips.find((item) => item.id === selectedClipId);
      if (c) {
        selectedClip = c;
        currentTrackId = track.id;
        break;
      }
    }
    if (!selectedClip) {
      selectedAudio = project.audioClips.find((c) => c.id === selectedClipId) || null;
    }
  }

  const activeRatio = getProjectAspectRatio(project.width, project.height);

  // If an audio clip is selected, render dedicated audio controls
  if (selectedAudio) {
    const audioAsset = assets.get(selectedAudio.assetId);

    return (
      <aside className="w-64 bg-editor-panel border-l border-editor-border p-3.5 flex flex-col h-full overflow-y-auto select-none text-xs space-y-4">
        {/* Audio Clip Header */}
        <div className="flex items-center justify-between pb-2 border-b border-editor-border">
          <div className="flex items-center space-x-2">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-gray-200">Audio Clip</span>
          </div>
          <span className="font-mono text-[10px] text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-600/40">
            A1
          </span>
        </div>

        {/* Clip Name */}
        <div>
          <label className="text-[11px] text-gray-400 font-medium block mb-1">Audio Source</label>
          <div className="p-2 rounded bg-editor-bg border border-editor-border text-gray-200 text-xs truncate">
            {audioAsset?.name || selectedAudio.id}
          </div>
        </div>

        {/* Timing Controls */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center space-x-1.5 text-gray-400 font-medium text-[11px]">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Timing & Trim</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Start (s)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                value={selectedAudio.start}
                onChange={(e) => {
                  const val = Math.max(0, parseFloat(e.target.value) || 0);
                  updateAudioClip(selectedAudio.id, { start: val });
                }}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Duration (s)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={selectedAudio.duration}
                onChange={(e) => {
                  const val = Math.max(0.1, parseFloat(e.target.value) || 0.1);
                  updateAudioClip(selectedAudio.id, { duration: val });
                }}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Audio Trim Offset (s)</label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={selectedAudio.trimStart || 0}
              onChange={(e) => {
                const val = Math.max(0, parseFloat(e.target.value) || 0);
                updateAudioClip(selectedAudio.id, { trimStart: val });
              }}
              className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>

        {/* Volume Slider */}
        <div className="space-y-2 pt-1 border-t border-editor-border/60">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400 font-medium">Volume</span>
            <span className="font-mono text-gray-300">
              {Math.round((selectedAudio.volume ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={selectedAudio.volume ?? 1}
            onChange={(e) => updateAudioClip(selectedAudio.id, { volume: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        {/* Actions: Duplicate & Delete */}
        <div className="pt-2 border-t border-editor-border/60 flex items-center space-x-2">
          <button
            onClick={() => duplicateClip(selectedAudio.id)}
            className="flex-1 py-1.5 px-2 bg-editor-bg hover:bg-editor-hover border border-editor-border rounded text-gray-300 text-xs flex items-center justify-center space-x-1.5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => removeClip(selectedAudio.id)}
            className="flex-1 py-1.5 px-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 rounded text-red-200 text-xs flex items-center justify-center space-x-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete</span>
          </button>
        </div>
      </aside>
    );
  }

  if (!selectedClip || !currentTrackId) {
    return (
      <aside className="w-64 bg-editor-panel border-l border-editor-border p-3.5 flex flex-col h-full overflow-y-auto select-none text-xs space-y-4">
        {/* Project Global Settings Header */}
        <div className="flex items-center space-x-2 pb-2 border-b border-editor-border">
          <Film className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-gray-200">Project Settings</span>
        </div>

        {/* Project Name */}
        <div>
          <label className="text-[11px] text-gray-400 font-medium block mb-1">Project Name</label>
          <input
            type="text"
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            className="w-full bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Aspect Ratio Preset */}
        <div>
          <label className="text-[11px] text-gray-400 font-medium flex items-center space-x-1.5 mb-1.5">
            <Ratio className="w-3.5 h-3.5 text-purple-400" />
            <span>Aspect Ratio</span>
          </label>
          <select
            value={activeRatio}
            onChange={(e) => setAspectRatioPreset(e.target.value as AspectRatioPreset)}
            className="w-full bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {ASPECT_RATIO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.width}×{p.height})
              </option>
            ))}
            {activeRatio === 'custom' && (
              <option value="custom">Custom ({project.width}×{project.height})</option>
            )}
          </select>
        </div>

        {/* Resolution Width & Height */}
        <div>
          <label className="text-[11px] text-gray-400 font-medium block mb-1">Canvas Resolution (px)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-gray-500">Width</span>
              <input
                type="number"
                min="100"
                max="4096"
                value={project.width}
                onChange={(e) => setProjectDimensions(parseInt(e.target.value) || 1920, project.height)}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Height</span>
              <input
                type="number"
                min="100"
                max="4096"
                value={project.height}
                onChange={(e) => setProjectDimensions(project.width, parseInt(e.target.value) || 1080)}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Timeline Duration */}
        <div>
          <div className="flex justify-between text-[11px] text-gray-400 mb-1">
            <span>Project Duration</span>
            <span className="font-mono text-gray-200">{project.duration.toFixed(1)}s</span>
          </div>
          <input
            type="number"
            min="1"
            max="300"
            step="1"
            value={project.duration}
            onChange={(e) => setProjectDuration(parseFloat(e.target.value) || 10)}
            className="w-full bg-editor-bg border border-editor-border rounded px-2.5 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Framerate & Tracks info */}
        <div className="bg-editor-subpanel p-2.5 rounded border border-editor-border space-y-1.5 text-gray-400 text-[11px]">
          <div className="flex justify-between">
            <span>Framerate:</span>
            <span className="font-mono text-gray-200">{project.fps} FPS</span>
          </div>
          <div className="flex justify-between">
            <span>Layers:</span>
            <span className="font-mono text-gray-200">4 Visual Tracks (V1..V4)</span>
          </div>
          <div className="flex justify-between">
            <span>Audio Lane:</span>
            <span className="font-mono text-gray-200">Dedicated A1</span>
          </div>
        </div>

        <div className="pt-4 border-t border-editor-border text-center text-gray-500 text-[11px]">
          <Sliders className="w-5 h-5 mx-auto mb-1 opacity-30" />
          <span>Click any canvas or timeline clip to edit its transform properties</span>
        </div>
      </aside>
    );
  }

  const baseAsset = assets.get(selectedClip.assetId);

  const handleTrackChange = (newTrack: TrackId) => {
    if (!selectedClip || newTrack === currentTrackId) return;
    moveClip(selectedClip.id, selectedClip.start, newTrack, true);
  };

  return (
    <aside className="w-64 bg-editor-panel border-l border-editor-border flex flex-col h-full overflow-y-auto select-none text-xs">
      {/* Header */}
      <div className="p-3 border-b border-editor-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {selectedClip.type === 'lipSync' ? (
            <Smile className="w-4 h-4 text-purple-400" />
          ) : (
            <Layers className="w-4 h-4 text-blue-400" />
          )}
          <span className="font-semibold text-gray-200">
            {selectedClip.type === 'lipSync' ? 'Lip-Sync Clip' : 'Image Clip'}
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-editor-subpanel text-gray-400 border border-editor-border">
          {currentTrackId}
        </span>
      </div>

      <div className="p-3 space-y-4">
        {/* Transform Group */}
        <div>
          <label className="text-gray-400 font-medium flex items-center space-x-1.5 mb-2">
            <Move className="w-3.5 h-3.5 text-blue-400" />
            <span>Position & Size</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-gray-500">X (px)</span>
              <input
                type="number"
                value={selectedClip.x}
                onChange={(e) => updateVisualClip(selectedClip!.id, { x: parseInt(e.target.value) || 0 })}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Y (px)</span>
              <input
                type="number"
                value={selectedClip.y}
                onChange={(e) => updateVisualClip(selectedClip!.id, { y: parseInt(e.target.value) || 0 })}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Width</span>
              <input
                type="number"
                min="10"
                value={selectedClip.width}
                onChange={(e) => updateVisualClip(selectedClip!.id, { width: Math.max(10, parseInt(e.target.value) || 10) })}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500">Height</span>
              <input
                type="number"
                min="10"
                value={selectedClip.height}
                onChange={(e) => updateVisualClip(selectedClip!.id, { height: Math.max(10, parseInt(e.target.value) || 10) })}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Quick Fit & Alignment Options */}
          <div className="mt-2.5 pt-2 border-t border-editor-border/60">
            <span className="text-[10px] text-gray-400 font-medium block mb-1.5 uppercase tracking-wider">Screen Fit & Alignment</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => fitClipToScreen(selectedClip!.id, 'contain')}
                title="Scale to fit within canvas screen (Preserves Aspect Ratio)"
                className="py-1 px-2 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center space-x-1 text-[11px] transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit to Screen</span>
              </button>

              <button
                type="button"
                onClick={() => fitClipToScreen(selectedClip!.id, 'cover')}
                title="Scale to fill entire canvas screen (No letterboxing)"
                className="py-1 px-2 rounded bg-editor-bg hover:bg-editor-hover border border-editor-border text-gray-300 hover:text-white flex items-center justify-center space-x-1 text-[11px] transition-colors"
              >
                <Scan className="w-3 h-3" />
                <span>Fill Screen</span>
              </button>

              <button
                type="button"
                onClick={() => centerClipOnScreen(selectedClip!.id)}
                title="Center on canvas screen without changing dimensions"
                className="py-1 px-2 rounded bg-editor-bg hover:bg-editor-hover border border-editor-border text-gray-300 hover:text-white flex items-center justify-center space-x-1 text-[11px] transition-colors"
              >
                <AlignCenter className="w-3 h-3" />
                <span>Center</span>
              </button>

              <button
                type="button"
                onClick={() => resetClipSize(selectedClip!.id)}
                title="Reset to original asset natural dimensions"
                className="py-1 px-2 rounded bg-editor-bg hover:bg-editor-hover border border-editor-border text-gray-400 hover:text-white flex items-center justify-center space-x-1 text-[11px] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Original Size</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rotation & Opacity */}
        <div>
          <label className="text-gray-400 font-medium flex items-center space-x-1.5 mb-2">
            <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Rotation & Opacity</span>
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Rotation</span>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={selectedClip.rotation || 0}
                  onChange={(e) => updateVisualClip(selectedClip!.id, { rotation: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] text-right focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-500">°</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Opacity</span>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedClip.opacity ?? 1.0}
                  onChange={(e) => updateVisualClip(selectedClip!.id, { opacity: parseFloat(e.target.value) })}
                  className="w-20 accent-blue-500"
                />
                <span className="text-[11px] font-mono text-gray-300 w-8 text-right">
                  {Math.round((selectedClip.opacity ?? 1.0) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Timing & Track Assignment */}
        <div>
          <label className="text-gray-400 font-medium flex items-center space-x-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Timing & Track</span>
          </label>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-gray-500">Start (s)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={selectedClip.start}
                  onChange={(e) => moveClip(selectedClip!.id, parseFloat(e.target.value) || 0)}
                  className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <span className="text-[10px] text-gray-500">Duration (s)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={selectedClip.duration}
                  onChange={(e) => updateVisualClip(selectedClip!.id, { duration: Math.max(0.1, parseFloat(e.target.value) || 0.1) })}
                  className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <span className="text-[10px] text-gray-500">Track Layer (V1..V4)</span>
              <select
                value={currentTrackId}
                onChange={(e) => handleTrackChange(e.target.value as TrackId)}
                className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 text-[11px] mt-0.5 focus:outline-none focus:border-blue-500"
              >
                <option value="V4">V4 (Top Layer)</option>
                <option value="V3">V3</option>
                <option value="V2">V2</option>
                <option value="V1">V1 (Bottom Layer)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Special Lip-Sync Properties */}
        {selectedClip.type === 'lipSync' && selectedClip.lipSyncData && (
          <div className="border-t border-editor-border pt-3">
            <label className="text-purple-400 font-medium flex items-center space-x-1.5 mb-2">
              <Anchor className="w-3.5 h-3.5" />
              <span>Lip-Sync Mouth Anchor</span>
            </label>

            <div className="space-y-2 bg-editor-subpanel p-2 rounded border border-editor-border">
              {/* Anchor Reset & Centering Controls */}
              <div className="flex items-center gap-1.5 flex-wrap pb-1.5 border-b border-editor-border/60">
                <button
                  type="button"
                  onClick={() => {
                    updateVisualClip(selectedClip!.id, {
                      lipSyncData: {
                        ...selectedClip!.lipSyncData!,
                        mouthAnchor: { x: 0.5, y: 0.5 },
                      },
                    }, true);
                  }}
                  className="px-2 py-0.5 text-[10px] rounded bg-editor-bg hover:bg-editor-hover border border-editor-border text-gray-300 hover:text-white"
                  title="Reset placement to center of character (50%, 50%)"
                >
                  Center on Character
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateVisualClip(selectedClip!.id, {
                      lipSyncData: {
                        ...selectedClip!.lipSyncData!,
                        spriteAnchor: { anchorX: 0.5, anchorY: 0.5 },
                      },
                    }, true);
                  }}
                  className="px-2 py-0.5 text-[10px] rounded bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200"
                  title="Put mouth sprite anchor at exact center (50%, 50%)"
                >
                  Center Mouth Sprite
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-gray-400">Anchor X (0..1)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={selectedClip.lipSyncData.mouthAnchor.x}
                    onChange={(e) => {
                      const x = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      updateVisualClip(selectedClip!.id, {
                        lipSyncData: {
                          ...selectedClip!.lipSyncData!,
                          mouthAnchor: { ...selectedClip!.lipSyncData!.mouthAnchor, x },
                        },
                      });
                    }}
                    className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400">Anchor Y (0..1)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={selectedClip.lipSyncData.mouthAnchor.y}
                    onChange={(e) => {
                      const y = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      updateVisualClip(selectedClip!.id, {
                        lipSyncData: {
                          ...selectedClip!.lipSyncData!,
                          mouthAnchor: { ...selectedClip!.lipSyncData!.mouthAnchor, y },
                        },
                      });
                    }}
                    className="w-full bg-editor-bg border border-editor-border rounded px-2 py-1 text-gray-200 font-mono text-[11px] focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">Mouth Scale</span>
                  <span className="text-[11px] font-mono text-gray-300">
                    {Math.round((selectedClip.lipSyncData.mouthScale || 0.25) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.01"
                  value={selectedClip.lipSyncData.mouthScale || 0.25}
                  onChange={(e) => {
                    const mouthScale = parseFloat(e.target.value);
                    updateVisualClip(selectedClip!.id, {
                      lipSyncData: {
                        ...selectedClip!.lipSyncData!,
                        mouthScale,
                      },
                    });
                  }}
                  className="w-full accent-purple-500 mt-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span className="flex items-center space-x-1">
                    <RotateCw className="w-3 h-3 text-purple-400" />
                    <span>Mouth Rotation</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <span className="font-mono text-gray-300">
                      {selectedClip.lipSyncData.mouthRotation ? `${selectedClip.lipSyncData.mouthRotation}°` : '0°'}
                    </span>
                    {Boolean(selectedClip.lipSyncData.mouthRotation) && (
                      <button
                        type="button"
                        onClick={() => updateVisualClip(selectedClip!.id, {
                          lipSyncData: { ...selectedClip!.lipSyncData!, mouthRotation: 0 }
                        })}
                        className="text-[10px] text-gray-400 hover:text-white underline ml-1"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={selectedClip.lipSyncData.mouthRotation || 0}
                  onChange={(e) => updateVisualClip(selectedClip!.id, {
                    lipSyncData: { ...selectedClip!.lipSyncData!, mouthRotation: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full accent-purple-500 mt-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>Sizing Mode</span>
                  <div className="flex bg-editor-bg rounded p-0.5 border border-editor-border">
                    <button
                      type="button"
                      onClick={() => updateVisualClip(selectedClip!.id, {
                        lipSyncData: { ...selectedClip!.lipSyncData!, sizingMode: 'proportional' }
                      })}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        (selectedClip.lipSyncData.sizingMode ?? 'proportional') === 'proportional'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      title="Proportional: keeps natural scale differences between open and closed mouths"
                    >
                      Proportional
                    </button>
                    <button
                      type="button"
                      onClick={() => updateVisualClip(selectedClip!.id, {
                        lipSyncData: { ...selectedClip!.lipSyncData!, sizingMode: 'uniform' }
                      })}
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        selectedClip.lipSyncData.sizingMode === 'uniform'
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                      title="Uniform: forces all mouths to match scale exactly"
                    >
                      Uniform
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 pt-1 flex items-center justify-between">
                <span>Total Rhubarb Cues: {selectedClip.lipSyncData.cues.length}</span>
                {selectedClip.lipSyncData.tuning && (
                  <span className="text-purple-400 capitalize">
                    {selectedClip.lipSyncData.tuning.speed} ({selectedClip.lipSyncData.tuning.minDurationMs}ms)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
