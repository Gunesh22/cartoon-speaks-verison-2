import React, { useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  Play,
  Pause,
  RotateCcw,
  Undo2,
  Redo2,
  Image as ImageIcon,
  Music,
  Smile,
  Download,
  FolderOpen,
  Plus,
  Home,
  Monitor,
  Smartphone,
  Square,
  Sparkles,
  Ratio,
} from 'lucide-react';
import { audioEngine } from '../../core/audio/audioEngine';
import { ASPECT_RATIO_PRESETS, AspectRatioPreset, getProjectAspectRatio } from '../../types/project';

export const Toolbar: React.FC = () => {
  const {
    project,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    togglePlay,
    stopPlayback,
    undo,
    redo,
    historyIndex,
    history,
    addAsset,
    setLipSyncModalOpen,
    setExportModalOpen,
    setProjectModalOpen,
    newProject,
    setCurrentView,
    setAspectRatioPreset,
    assets,
  } = useEditorStore();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const activeRatio = getProjectAspectRatio(project.width, project.height);

  const handleTogglePlay = () => {
    togglePlay();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      await new Promise<void>((resolve) => {
        img.onload = async () => {
          await addAsset({
            id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: file.name,
            type: 'image',
            mimeType: file.type || 'image/png',
            blob: file,
            width: img.naturalWidth,
            height: img.naturalHeight,
            projectId: project.id,
            createdAt: Date.now(),
          });
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve();
        };
        img.src = objectUrl;
      });
    }

    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let duration = 5;

      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
        duration = buffer.duration;
        ctx.close().catch(() => {});
      } catch {
        // Fallback default duration
      }

      await addAsset({
        id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        type: 'audio',
        mimeType: file.type || 'audio/wav',
        blob: file,
        duration,
        projectId: project.id,
        createdAt: Date.now(),
      });
    }

    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  return (
    <header className="h-14 bg-editor-panel border-b border-editor-border px-4 flex items-center justify-between select-none z-20">
      {/* Brand & Project Hub Link */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setCurrentView('projects')}
          title="Open Project Window Hub"
          className="flex items-center space-x-2 group p-1 -m-1 rounded-lg hover:bg-editor-subpanel transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-base shadow">
            CS
          </div>
          <div className="text-left">
            <h1 className="text-sm font-semibold text-gray-100 leading-tight group-hover:text-blue-400 transition-colors flex items-center space-x-1">
              <span>Cartoon Speaks</span>
              <span className="text-blue-400 font-normal text-xs">v2</span>
            </h1>
            <p className="text-[11px] text-gray-400 leading-none truncate max-w-[140px]">{project.name}</p>
          </div>
        </button>

        <div className="h-6 w-px bg-editor-border mx-1" />

        {/* Project Navigation */}
        <button
          onClick={() => setCurrentView('projects')}
          title="Switch to Projects Window Hub"
          className="px-2 py-1.5 rounded hover:bg-editor-subpanel text-gray-300 hover:text-white flex items-center space-x-1.5 text-xs border border-editor-border/60"
        >
          <Home className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Projects Hub</span>
        </button>

        <button
          onClick={() => setProjectModalOpen(true)}
          title="Save or Export Project JSON"
          className="px-2 py-1.5 rounded hover:bg-editor-subpanel text-gray-300 hover:text-white flex items-center space-x-1 text-xs"
        >
          <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Save / JSON</span>
        </button>

        <div className="h-6 w-px bg-editor-border mx-1" />

        {/* Aspect Ratio Dropdown Selector */}
        <div className="flex items-center space-x-1.5 bg-editor-subpanel border border-editor-border rounded-lg px-2 py-1">
          <Ratio className="w-3.5 h-3.5 text-purple-400" />
          <select
            value={activeRatio}
            onChange={(e) => setAspectRatioPreset(e.target.value as AspectRatioPreset)}
            className="bg-transparent text-gray-200 text-xs font-medium focus:outline-none cursor-pointer"
            title="Change Project Aspect Ratio"
          >
            <option value="16:9" className="bg-editor-panel text-gray-100">16:9 Landscape (1920×1080)</option>
            <option value="9:16" className="bg-editor-panel text-gray-100">9:16 Vertical (1080×1920)</option>
            <option value="1:1" className="bg-editor-panel text-gray-100">1:1 Square (1080×1080)</option>
            <option value="4:5" className="bg-editor-panel text-gray-100">4:5 Social (1080×1350)</option>
            <option value="4:3" className="bg-editor-panel text-gray-100">4:3 Standard (1440×1080)</option>
            {activeRatio === 'custom' && (
              <option value="custom" className="bg-editor-panel text-gray-100">Custom ({project.width}×{project.height})</option>
            )}
          </select>
        </div>
      </div>

      {/* Center: Playback & History Controls */}
      <div className="flex items-center space-x-2">
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Ctrl+Z)"
          className="p-2 rounded hover:bg-editor-subpanel text-gray-300 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          title="Redo (Ctrl+Y)"
          className="p-2 rounded hover:bg-editor-subpanel text-gray-300 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-6 w-px bg-editor-border mx-1" />

        <button
          onClick={() => {
            audioEngine.stop();
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          title="Rewind to Start"
          className="p-2 rounded hover:bg-editor-subpanel text-gray-300"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center space-x-1.5 shadow"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
          <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
      </div>

      {/* Right: Imports, Lip Sync & Export */}
      <div className="flex items-center space-x-2">
        {/* Hidden inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageUpload}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={handleAudioUpload}
        />

        <button
          onClick={() => imageInputRef.current?.click()}
          className="px-2.5 py-1.5 rounded bg-editor-subpanel hover:bg-editor-hover text-gray-200 text-xs flex items-center space-x-1.5 border border-editor-border"
          title="Import image files"
        >
          <ImageIcon className="w-4 h-4 text-emerald-400" />
          <span>Import Image</span>
        </button>

        <button
          onClick={() => audioInputRef.current?.click()}
          className="px-2.5 py-1.5 rounded bg-editor-subpanel hover:bg-editor-hover text-gray-200 text-xs flex items-center space-x-1.5 border border-editor-border"
          title="Import audio files"
        >
          <Music className="w-4 h-4 text-amber-400" />
          <span>Import Audio</span>
        </button>

        <div className="h-6 w-px bg-editor-border mx-1" />

        {/* Lip Sync Modal Launcher */}
        <button
          onClick={() => setLipSyncModalOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow"
          title="Open Lip-Sync Generator"
        >
          <Smile className="w-4 h-4" />
          <span>Lip Sync</span>
        </button>

        {/* Video Export Button */}
        <button
          onClick={() => setExportModalOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow"
          title="Export project to MP4"
        >
          <Download className="w-4 h-4" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
