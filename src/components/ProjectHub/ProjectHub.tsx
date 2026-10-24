import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  listStoredProjects,
  loadProjectFromDb,
  deleteProjectFromDb,
} from '../../core/assets/assetDb';
import {
  validateProjectJson,
  findMissingAssets,
} from '../../core/project/projectManager';
import {
  ASPECT_RATIO_PRESETS,
  AspectRatioPreset,
  getProjectAspectRatio,
  EditorProject,
} from '../../types/project';
import {
  FolderOpen,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Upload,
  ArrowRight,
  Film,
  Monitor,
  Smartphone,
  Square,
  Layout,
  AlertTriangle,
  Play,
} from 'lucide-react';

export const ProjectHub: React.FC = () => {
  const {
    project,
    setProject,
    newProject,
    setCurrentView,
    setPromptModalOpen,
    assets,
  } = useEditorStore();

  const [savedProjects, setSavedProjects] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const [projectDetails, setProjectDetails] = useState<Map<string, EditorProject>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // New Project Form State — preselected 16:9 Landscape
  const [newProjName, setNewProjName] = useState('My Animation Project');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioPreset>('16:9');
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [selectedFps, setSelectedFps] = useState<number>(30);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const list = await listStoredProjects();
      setSavedProjects(list);

      const detailsMap = new Map<string, EditorProject>();
      for (const item of list) {
        const full = await loadProjectFromDb(item.id);
        if (full) detailsMap.set(item.id, full);
      }
      setProjectDetails(detailsMap);
    } catch (e) {
      console.warn('Failed to load project list:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = () => {
    let width = 1920;
    let height = 1080;

    if (selectedRatio === 'custom') {
      width = customWidth;
      height = customHeight;
    } else if (selectedRatio) {
      const preset = ASPECT_RATIO_PRESETS.find((p) => p.id === selectedRatio);
      if (preset) {
        width = preset.width;
        height = preset.height;
      }
    }

    newProject(newProjName || 'Untitled Project', width, height, selectedFps);
    setCurrentView('editor');
  };

  const handleOpenProject = async (id: string) => {
    const loaded = await loadProjectFromDb(id);
    if (loaded) {
      setProject(loaded);
      setCurrentView('editor');
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteProjectFromDb(id);
      await fetchProjects();
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const { valid, project: validatedProj, error } = validateProjectJson(parsed);

        if (!valid || !validatedProj) {
          setImportError(`Invalid project file: ${error || 'Unknown error'}`);
          return;
        }

        const availableIds = new Set(assets.keys());
        const missing = findMissingAssets(validatedProj, availableIds);

        if (missing.length > 0) {
          alert(`Project imported! Note: ${missing.length} media asset(s) are missing from local browser storage.`);
        }

        setProject(validatedProj);
        setCurrentView('editor');
      } catch (err) {
        setImportError('Failed to read file: invalid JSON format');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getRatioIcon = (ratio: AspectRatioPreset) => {
    switch (ratio) {
      case '9:16':
        return <Smartphone className="w-3.5 h-3.5 text-editor-accent" />;
      case '1:1':
        return <Square className="w-3.5 h-3.5 text-editor-accent" />;
      case '4:5':
        return <Smartphone className="w-3.5 h-3.5 text-editor-accent" />;
      case '16:9':
      default:
        return <Monitor className="w-3.5 h-3.5 text-editor-accent" />;
    }
  };

  return (
    <div className="w-screen h-screen overflow-y-auto bg-editor-bg text-editor-text flex flex-col p-4 md:p-6 select-none font-sans">
      {/* Top Header Bar */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between pb-3.5 border-b border-editor-border shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-editor-md bg-editor-accentAction/25 border border-editor-accent/40 flex items-center justify-center font-bold text-editor-accent text-sm shadow-sm">
            CS
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-editor-text flex items-center space-x-2 leading-tight">
              <span>Cartoon Speaks</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-editor-accent/20 text-violet-300 font-semibold border border-editor-accent/40 font-mono">
                v2.0
              </span>
            </h1>
            <p className="text-[11px] text-editor-muted">2D Video Editor & Lip-Sync Animation Studio</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AI Prompts Launcher */}
          <button
            onClick={() => setPromptModalOpen(true)}
            className="px-3 py-1.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
            title="Open AI Prompt Templates (Script, Storyboard, Faces, Sprite Sheet)"
          >
            <Sparkles className="w-3.5 h-3.5 text-editor-accent" />
            <span className="font-medium">AI Prompts</span>
          </button>

          {/* Import JSON */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportJson}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-editor-muted" />
            <span>Import Project JSON</span>
          </button>

          {/* Current Project Button */}
          {project && (
            <button
              onClick={() => setCurrentView('editor')}
              className="px-3.5 py-1.5 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
            >
              <span>Current Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {importError && (
        <div className="max-w-6xl w-full mx-auto mt-2.5 p-2 rounded-editor-md bg-editor-danger/10 border border-editor-danger/30 text-editor-danger text-xs flex items-center space-x-2 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5 items-start">
        {/* Left Column: Create New Project Card */}
        <div className="lg:col-span-5 bg-editor-panel border border-editor-border rounded-editor-xl p-4 md:p-5 shadow-panel space-y-4">
          <div className="flex items-center space-x-2 pb-2.5 border-b border-editor-border/60">
            <Plus className="w-4 h-4 text-editor-accent" />
            <h2 className="text-sm font-semibold text-editor-text">Create New Project</h2>
          </div>

          {/* Project Title Input */}
          <div>
            <label className="text-[11px] font-semibold text-editor-secondary block mb-1">
              Project Title
            </label>
            <input
              type="text"
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              placeholder="e.g. My Cartoon Episode 1"
              className="w-full bg-editor-surface border border-editor-border rounded-editor-md px-3 py-1.5 text-xs text-editor-text focus:outline-none focus:border-editor-accent transition-colors"
            />
          </div>

          {/* Aspect Ratio Options */}
          <div>
            <label className="text-[11px] font-semibold text-editor-secondary block mb-1.5">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECT_RATIO_PRESETS.map((p) => {
                const isSelected = selectedRatio === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedRatio(p.id)}
                    className={`p-2.5 rounded-editor-md border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-editor-accent bg-editor-accent/15 text-white shadow-sm ring-1 ring-editor-accent/50'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight hover:text-editor-text'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {getRatioIcon(p.id)}
                      <span className="font-semibold text-xs truncate">{p.id}</span>
                    </div>
                    <span className="font-mono text-[10px] text-editor-muted">
                      {p.width}×{p.height}
                    </span>
                  </button>
                );
              })}

              {/* Custom Aspect Ratio Option */}
              <button
                type="button"
                onClick={() => setSelectedRatio('custom')}
                className={`p-2.5 rounded-editor-md border text-left flex items-center justify-between transition-all ${
                  selectedRatio === 'custom'
                    ? 'border-editor-accent bg-editor-accent/15 text-white shadow-sm ring-1 ring-editor-accent/50'
                    : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight hover:text-editor-text'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Layout className="w-3.5 h-3.5 text-editor-accent" />
                  <span className="font-semibold text-xs">Custom</span>
                </div>
                <span className="text-[10px] text-editor-muted font-mono">px</span>
              </button>
            </div>

            {selectedRatio === 'custom' && (
              <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 rounded-editor-md bg-editor-surface border border-editor-border">
                <div>
                  <span className="text-[10px] text-editor-muted">Width (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="4096"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1920)}
                    className="w-full bg-editor-panel border border-editor-border rounded px-2.5 py-1 text-xs text-editor-text font-mono mt-0.5 focus:outline-none focus:border-editor-accent"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-editor-muted">Height (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="4096"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(parseInt(e.target.value) || 1080)}
                    className="w-full bg-editor-panel border border-editor-border rounded px-2.5 py-1 text-xs text-editor-text font-mono mt-0.5 focus:outline-none focus:border-editor-accent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Framerate Selection */}
          <div>
            <label className="text-[11px] font-semibold text-editor-secondary block mb-1.5">
              Framerate (FPS)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[24, 30, 60].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSelectedFps(f)}
                  className={`py-1.5 rounded-editor-sm border text-xs font-semibold text-center transition-all ${
                    selectedFps === f
                      ? 'border-editor-accent bg-editor-accentAction text-white shadow-sm ring-1 ring-editor-accent/40'
                      : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight hover:text-editor-text'
                  }`}
                >
                  {f} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Create Button */}
          <div className="pt-2 border-t border-editor-border/80">
            <button
              onClick={handleCreateProject}
              className="w-full py-2.5 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create & Enter Editor</span>
            </button>
          </div>
        </div>

        {/* Right Column: Existing Projects List */}
        <div className="lg:col-span-7 bg-editor-panel border border-editor-border rounded-editor-xl p-4 md:p-5 shadow-panel space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-editor-border/60">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4 text-editor-accent" />
              <h2 className="text-sm font-semibold text-editor-text">
                Recent Projects ({savedProjects.length})
              </h2>
            </div>
            <span className="text-[10px] text-editor-muted font-mono">Browser Storage (IndexedDB)</span>
          </div>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-editor-muted text-xs">
              Loading projects...
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="h-56 border border-dashed border-editor-border rounded-editor-lg bg-editor-surface/40 flex flex-col items-center justify-center text-center p-6 text-editor-muted">
              <Film className="w-8 h-8 mb-2 opacity-40 text-editor-accent" />
              <p className="font-semibold text-editor-secondary text-xs">No saved projects yet</p>
              <p className="text-[11px] text-editor-muted mt-1 max-w-xs">
                Configure a new project on the left or import an existing JSON file to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {savedProjects.map((p) => {
                const fullProj = projectDetails.get(p.id);
                const w = fullProj?.width || 1920;
                const h = fullProj?.height || 1080;
                const ratio = getProjectAspectRatio(w, h);
                const totalClips = fullProj
                  ? fullProj.tracks.reduce((sum, t) => sum + t.clips.length, 0)
                  : 0;

                return (
                  <div
                    key={p.id}
                    className="group bg-editor-surface border border-editor-border rounded-editor-md p-3 hover:border-editor-accent/60 transition-all shadow-sm flex items-center justify-between space-x-3"
                  >
                    {/* Visual aspect ratio badge thumbnail */}
                    <div className="w-14 h-12 bg-editor-panel rounded-editor-sm border border-editor-border flex flex-col items-center justify-center shrink-0 text-editor-accent group-hover:border-editor-accent/50 transition-colors">
                      {getRatioIcon(ratio)}
                      <span className="text-[9px] font-mono font-medium text-editor-muted mt-0.5">{ratio}</span>
                    </div>

                    {/* Project Information */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-editor-text text-xs truncate group-hover:text-white transition-colors" title={p.name}>
                          {p.name}
                        </h3>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-editor-subpanel text-editor-muted border border-editor-border/60 shrink-0">
                          {fullProj ? `${fullProj.fps} FPS` : '30 FPS'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-[10px] text-editor-muted mt-0.5 font-mono">
                        <span>{fullProj?.duration?.toFixed(1) || '10'}s duration</span>
                        <span>•</span>
                        <span>{totalClips} clip{totalClips === 1 ? '' : 's'}</span>
                        <span>•</span>
                        <span>{w}×{h}</span>
                      </div>

                      <div className="text-[9px] text-editor-muted mt-1 flex items-center space-x-1 font-mono">
                        <Clock className="w-3 h-3 text-editor-muted" />
                        <span>Saved {new Date(p.updatedAt).toLocaleDateString()} at {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => handleOpenProject(p.id)}
                        className="px-3 py-1.5 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-colors active:scale-95"
                      >
                        <span>Open Project</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteProject(p.id, p.name)}
                        className="p-1.5 rounded-editor-sm hover:bg-editor-danger/20 text-editor-muted hover:text-editor-danger transition-colors"
                        title="Delete project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
