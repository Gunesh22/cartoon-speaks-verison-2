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
  Mic,
  ChevronDown,
  History,
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
    undo,
    redo,
    historyIndex,
    history,
    addAsset,
    setLipSyncModalOpen,
    setExportModalOpen,
    setProjectModalOpen,
    setPromptModalOpen,
    setRecordModalOpen,
    setSnapshotModalOpen,
    isSaving,
    lastSavedAt,
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
    <header className="h-12 bg-editor-panel border-b border-editor-border/80 px-3 flex items-center justify-between select-none z-20 shrink-0 gap-2">
      {/* Group A — Project & History Controls (Left) */}
      <div className="flex items-center space-x-1.5 shrink-0">
        {/* Brand / Home link */}
        <button
          onClick={() => setCurrentView('projects')}
          title="Open Projects Dashboard"
          className="flex items-center space-x-2 px-2 py-1 rounded-editor-md hover:bg-editor-hover transition-colors group"
        >
          <div className="w-6 h-6 rounded-editor-sm bg-editor-accentAction/20 border border-editor-accent/40 flex items-center justify-center font-bold text-editor-accent text-[11px] shadow-sm group-hover:border-editor-accent transition-colors">
            CS
          </div>
          <span className="hidden xl:inline text-xs font-semibold text-editor-text tracking-tight group-hover:text-white transition-colors">
            Cartoon Speaks
          </span>
        </button>

        {/* Project Name & Switcher */}
        <button
          onClick={() => setCurrentView('projects')}
          title="Current project (click to switch projects)"
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text flex items-center space-x-1.5 text-xs transition-colors max-w-[150px] sm:max-w-[180px]"
        >
          <Home className="w-3.5 h-3.5 text-editor-muted shrink-0" />
          <span className="font-medium text-editor-text truncate">{project.name}</span>
        </button>

        {/* Save / JSON Modal */}
        <button
          onClick={() => setProjectModalOpen(true)}
          title="Save or Export Project JSON"
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text flex items-center space-x-1.5 text-xs transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5 text-editor-muted" />
          <span className="hidden lg:inline font-medium">Save/JSON</span>
        </button>

        {/* Version History & Snapshots Modal (Feature 17) */}
        <button
          onClick={() => setSnapshotModalOpen(true)}
          title="Open Version History & Snapshots (Feature 17)"
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text flex items-center space-x-1.5 text-xs transition-colors"
        >
          <History className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden lg:inline font-medium">History</span>
          {isSaving ? (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping ml-0.5" />
          ) : lastSavedAt ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="Auto-saved" />
          ) : null}
        </button>

        {/* Undo / Redo */}
        <div className="flex items-center bg-editor-subpanel/60 border border-editor-border/60 rounded-editor-md p-0.5 ml-1">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="w-7 h-7 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="w-7 h-7 rounded flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Group B & C — Canvas Configuration & Playback (Center-Aligned) */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Group B — Aspect Ratio */}
        <div className="h-8 flex items-center space-x-1.5 bg-editor-subpanel/80 border border-editor-border/80 rounded-editor-md px-2.5 transition-colors focus-within:border-editor-accent">
          <Ratio className="w-3.5 h-3.5 text-editor-accent shrink-0" />
          <select
            value={activeRatio}
            onChange={(e) => setAspectRatioPreset(e.target.value as AspectRatioPreset)}
            className="bg-transparent text-editor-text text-xs font-medium focus:outline-none cursor-pointer pr-1"
            title="Change Project Aspect Ratio"
          >
            <option value="16:9" className="bg-editor-elevated text-editor-text">16:9 (1920×1080)</option>
            <option value="9:16" className="bg-editor-elevated text-editor-text">9:16 (1080×1920)</option>
            <option value="1:1" className="bg-editor-elevated text-editor-text">1:1 (1080×1080)</option>
            <option value="4:5" className="bg-editor-elevated text-editor-text">4:5 (1080×1350)</option>
            <option value="4:3" className="bg-editor-elevated text-editor-text">4:3 (1440×1080)</option>
            {activeRatio === 'custom' && (
              <option value="custom" className="bg-editor-elevated text-editor-text">Custom ({project.width}×{project.height})</option>
            )}
          </select>
        </div>

        <div className="h-4 w-px bg-editor-border/60 mx-0.5" />

        {/* Group C — Playback Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              audioEngine.stop();
              setIsPlaying(false);
              setCurrentTime(0);
            }}
            title="Rewind to Start"
            aria-label="Rewind to Start"
            className="w-8 h-8 rounded-editor-md flex items-center justify-center text-editor-secondary hover:text-editor-text hover:bg-editor-hover active:bg-editor-active transition-colors border border-editor-border/60 bg-editor-subpanel/50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleTogglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className={`h-8 px-3 rounded-editor-md font-medium flex items-center space-x-1.5 shadow-sm transition-all active:scale-[0.98] ${
              isPlaying
                ? 'bg-editor-accent text-white shadow-glow-accent'
                : 'bg-editor-accentAction hover:bg-editor-accent text-white'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
            <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
        </div>
      </div>

      {/* Group D & E — Media Tools & Final Export (Right) */}
      <div className="flex items-center space-x-1.5 shrink-0">
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

        {/* Group D: Media and Creation Tools */}
        <button
          onClick={() => imageInputRef.current?.click()}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Import image files (PNG, JPG, WebP)"
        >
          <ImageIcon className="w-3.5 h-3.5 text-editor-muted" />
          <span className="font-medium hidden sm:inline">Image</span>
        </button>

        <button
          onClick={() => audioInputRef.current?.click()}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Import spoken audio files (WAV, MP3)"
        >
          <Music className="w-3.5 h-3.5 text-editor-muted" />
          <span className="font-medium hidden sm:inline">Audio</span>
        </button>

        <button
          onClick={() => setRecordModalOpen(true)}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-red-500/30 text-editor-secondary hover:text-red-300 text-xs flex items-center space-x-1.5 transition-colors"
          title="Record voice-over directly via microphone"
        >
          <Mic className="w-3.5 h-3.5 text-red-400" />
          <span className="font-medium hidden md:inline">Record</span>
        </button>

        <button
          onClick={() => setPromptModalOpen(true)}
          className="h-8 px-2.5 rounded-editor-md bg-editor-subpanel/80 hover:bg-editor-hover border border-editor-border/80 text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
          title="Open AI Prompt Templates (Script, Storyboard, Faces, Sprite Sheet)"
        >
          <Sparkles className="w-3.5 h-3.5 text-editor-accent" />
          <span className="font-medium hidden lg:inline">Prompts</span>
        </button>

        {/* Lip Sync Modal Launcher */}
        <button
          onClick={() => setLipSyncModalOpen(true)}
          className="h-8 px-3 rounded-editor-md bg-editor-accent/15 hover:bg-editor-accent/25 border border-editor-accent/40 text-editor-accent hover:text-editor-accentHover font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          title="Open Lip-Sync Generator Workspace"
        >
          <Smile className="w-3.5 h-3.5 text-editor-accent" />
          <span>Lip Sync</span>
        </button>

        <div className="h-4 w-px bg-editor-border/80 mx-1" />

        {/* Group E: Video Export Button (Sole Emerald Primary Action) */}
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
