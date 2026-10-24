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
  Home,
  Ratio,
  Sparkles,
} from 'lucide-react';
import { audioEngine } from '../../core/audio/audioEngine';
import { AspectRatioPreset, getProjectAspectRatio } from '../../types/project';

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
    setPromptModalOpen,
    newProject,
    setCurrentView,
    setAspectRatioPreset,
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
    <header className="h-12 bg-editor-panel border-b border-editor-border px-3.5 flex items-center justify-between select-none z-20 shrink-0">
      {/* Left: Brand, Project Navigation & Settings */}
      <div className="flex items-center space-x-2.5">
        {/* Brand & Project Selector Link */}
        <button
          onClick={() => setCurrentView('projects')}
          title="Open Projects Hub"
          className="flex items-center space-x-2.5 px-2 py-1 -ml-1 rounded-editor-md hover:bg-editor-hover transition-colors group"
        >
          <div className="w-7 h-7 rounded-editor-sm bg-editor-accentAction/20 border border-editor-accent/40 flex items-center justify-center font-bold text-editor-accent text-xs shadow-sm group-hover:border-editor-accent transition-colors">
            CS
          </div>
          <div className="text-left flex items-baseline space-x-1.5">
            <span className="text-xs font-semibold text-editor-text tracking-tight group-hover:text-white transition-colors">
              Cartoon Speaks
            </span>
            <span className="text-[10px] font-medium text-editor-accent px-1 py-0.5 rounded bg-editor-accent/10 border border-editor-accent/20">
              v2
            </span>
          </div>
        </button>

        <div className="h-4 w-px bg-editor-border mx-1" />

        {/* Current Project Name & Hub Switcher */}
        <button
          onClick={() => setCurrentView('projects')}
          title="Switch to Projects Hub"
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text flex items-center space-x-1.5 text-xs transition-colors"
        >
          <Home className="w-3.5 h-3.5 text-editor-muted" />
          <span className="font-medium text-editor-text max-w-[130px] truncate">{project.name}</span>
        </button>

        <button
          onClick={() => setProjectModalOpen(true)}
          title="Save or Export Project JSON"
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text flex items-center space-x-1.5 text-xs transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5 text-editor-muted" />
          <span className="hidden md:inline font-medium">Save / JSON</span>
        </button>

        {/* Aspect Ratio Selector */}
        <div className="h-8 flex items-center space-x-1.5 bg-editor-subpanel border border-editor-border rounded-editor-md px-2.5 transition-colors focus-within:border-editor-accent">
          <Ratio className="w-3.5 h-3.5 text-editor-accent shrink-0" />
          <select
            value={activeRatio}
            onChange={(e) => setAspectRatioPreset(e.target.value as AspectRatioPreset)}
            className="bg-transparent text-editor-text text-xs font-medium focus:outline-none cursor-pointer pr-1"
            title="Change Project Aspect Ratio"
          >
            <option value="16:9" className="bg-editor-elevated text-editor-text">16:9 Landscape (1920×1080)</option>
            <option value="9:16" className="bg-editor-elevated text-editor-text">9:16 Vertical (1080×1920)</option>
            <option value="1:1" className="bg-editor-elevated text-editor-text">1:1 Square (1080×1080)</option>
            <option value="4:5" className="bg-editor-elevated text-editor-text">4:5 Social (1080×1350)</option>
            <option value="4:3" className="bg-editor-elevated text-editor-text">4:3 Standard (1440×1080)</option>
            {activeRatio === 'custom' && (
              <option value="custom" className="bg-editor-elevated text-editor-text">Custom ({project.width}×{project.height})</option>
            )}
          </select>
        </div>
      </div>

      {/* Center: Playback & Undo/Redo Controls */}
      <div className="flex items-center space-x-1">
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Ctrl+Z)"
          className="w-8 h-8 rounded-editor-sm flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          title="Redo (Ctrl+Y)"
          className="w-8 h-8 rounded-editor-sm flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-editor-border mx-1" />

        <button
          onClick={() => {
            audioEngine.stop();
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          title="Rewind to Start"
          className="w-8 h-8 rounded-editor-sm flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className="h-8 px-3 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white font-medium flex items-center space-x-1.5 shadow-sm transition-all active:scale-[0.98]"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
      </div>

      {/* Right: Imports, Lip Sync & Primary Export */}
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
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Import image files (PNG, JPG, WebP)"
        >
          <ImageIcon className="w-3.5 h-3.5 text-editor-muted" />
          <span className="font-medium">Import Image</span>
        </button>

        <button
          onClick={() => audioInputRef.current?.click()}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Import spoken audio files (WAV, MP3)"
        >
          <Music className="w-3.5 h-3.5 text-editor-muted" />
          <span className="font-medium">Import Audio</span>
        </button>

        {/* Prompts Modal Launcher */}
        <button
          onClick={() => setPromptModalOpen(true)}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Open AI Prompt Templates (Script, Storyboard, Faces, Sprite Sheet)"
        >
          <Sparkles className="w-3.5 h-3.5 text-editor-accent" />
          <span className="font-medium">Prompts</span>
        </button>

        <div className="h-4 w-px bg-editor-border mx-0.5" />

        {/* Lip Sync Modal Launcher */}
        <button
          onClick={() => setLipSyncModalOpen(true)}
          className="h-8 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-accent/50 text-editor-accent hover:text-editor-accentHover font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          title="Open Lip-Sync Generator Workspace"
        >
          <Smile className="w-3.5 h-3.5 text-editor-accent" />
          <span>Lip Sync</span>
        </button>

        {/* Video Export Button (Sole Emerald Primary Action) */}
        <button
          onClick={() => setExportModalOpen(true)}
          className="h-8 px-3.5 rounded-editor-md bg-editor-success hover:bg-editor-successHover text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-[0.98]"
          title="Export project to MP4"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Video</span>
        </button>
      </div>
    </header>
  );
};
