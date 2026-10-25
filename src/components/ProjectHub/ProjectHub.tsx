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
import { importProjectBundle, persistImportedBundle } from '../../core/project/projectBundle';
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
  Download,
  ArrowRight,
  Film,
  Monitor,
  Smartphone,
  Square,
  Layout,
  AlertTriangle,
} from 'lucide-react';

export const ProjectHub: React.FC = () => {
  const {
    project,
    setProject,
    newProject,
    setCurrentView,
    setPromptModalOpen,
    assets,
    initStore,
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
  const bundleInputRef = useRef<HTMLInputElement>(null);

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
      await initStore();
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

  const handleImportBundle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setImportError(null);
      const bundle = await importProjectBundle(file);
      await persistImportedBundle(bundle);
      await initStore();
      await fetchProjects();
      setProject(bundle.project);
      setCurrentView('editor');
    } catch (err) {
      setImportError(`Failed to import bundle: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
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
    <div className="w-screen h-screen overflow-y-auto bg-editor-bg text-editor-text flex flex-col p-4 md:p-6 lg:p-8 select-none font-sans">
      {/* Top Header Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between pb-4 border-b border-editor-border/80 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-editor-md bg-editor-accentAction/20 border border-editor-accent/40 flex items-center justify-center font-bold text-editor-accent text-xs shadow-sm">
            CS
          </div>
          <div>
            <div className="flex items-center space-x-2 leading-none">
              <h1 className="text-sm font-semibold tracking-tight text-editor-text">
                Cartoon Speaks
              </h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-editor-accent/15 text-violet-300 font-semibold border border-editor-accent/30 font-mono">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-editor-muted mt-0.5">2D Video Editor & Lip-Sync Studio</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AI Prompts Launcher */}
          <button
            onClick={() => setPromptModalOpen(true)}
            className="h-8 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
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
            className="h-8 px-3 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text text-xs flex items-center space-x-1.5 transition-colors"
            title="Import project from JSON file"
          >
            <Upload className="w-3.5 h-3.5 text-editor-muted" />
            <span>Import JSON</span>
          </button>

          {/* Import Project Bundle (.cartoonspeaks) (Feature 16) */}
          <input
            ref={bundleInputRef}
            type="file"
            accept=".cartoonspeaks,.zip,application/zip"
            className="hidden"
            onChange={handleImportBundle}
          />
          <button
            onClick={() => bundleInputRef.current?.click()}
            className="h-8 px-3 rounded-editor-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs flex items-center space-x-1.5 transition-colors shadow-sm"
            title="Import complete project bundle with all media files (.cartoonspeaks)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400 rotate-180" />
            <span>Import Bundle</span>
          </button>

          {/* Current Project Button */}
          {project && (
            <button
              onClick={() => setCurrentView('editor')}
              className="h-8 px-3.5 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
            >
              <span>Current Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {importError && (
        <div className="max-w-5xl w-full mx-auto mt-3 p-2.5 rounded-editor-md bg-editor-danger/10 border border-editor-danger/30 text-editor-danger text-xs flex items-center space-x-2 shrink-0 animate-modal-enter">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start flex-1">
        {/* Left Column: Create New Project Card */}
        <section className="lg:col-span-5 bg-editor-panel border border-editor-border/80 rounded-editor-lg p-5 shadow-panel space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-editor-border/60">
            <Plus className="w-4 h-4 text-editor-accent" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-editor-text">Create Project</h2>
          </div>

          {/* Project Title Input */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-editor-secondary block">
              Project Title
            </label>
            <input
              type="text"
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              placeholder="e.g. My Cartoon Episode 1"
              className="w-full bg-editor-surface border border-editor-border rounded-editor-md px-3 py-1.5 text-xs text-editor-text focus:outline-none focus:border-editor-accent input-focus transition-colors"
            />
          </div>

          {/* Aspect Ratio Options */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-editor-secondary block">
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
                    className={`p-2.5 rounded-editor-md border text-left flex items-center justify-between transition-smooth ${
                      isSelected
                        ? 'border-editor-accent bg-editor-accent/15 text-white shadow-sm ring-1 ring-editor-accent/40'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderFocus/40 hover:text-editor-text'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {getRatioIcon(p.id)}
                      <span className="font-medium text-xs truncate">{p.id}</span>
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
                className={`p-2.5 rounded-editor-md border text-left flex items-center justify-between transition-smooth ${
                  selectedRatio === 'custom'
                    ? 'border-editor-accent bg-editor-accent/15 text-white shadow-sm ring-1 ring-editor-accent/40'
                    : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderFocus/40 hover:text-editor-text'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Layout className="w-3.5 h-3.5 text-editor-accent" />
                  <span className="font-medium text-xs">Custom</span>
                </div>
                <span className="text-[10px] text-editor-muted font-mono">Custom px</span>
              </button>
            </div>

            {selectedRatio === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2 animate-dropdown-enter">
                <div>
                  <span className="text-[10px] text-editor-muted block mb-0.5">Width (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="4096"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1920)}
                    className="w-full bg-editor-surface border border-editor-border rounded px-2.5 py-1 text-xs text-editor-text font-mono input-focus"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-editor-muted block mb-0.5">Height (px)</span>
                  <input
                    type="number"
                    min="100"
                    max="4096"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(parseInt(e.target.value) || 1080)}
                    className="w-full bg-editor-surface border border-editor-border rounded px-2.5 py-1 text-xs text-editor-text font-mono input-focus"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Framerate Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-editor-secondary block">
              Framerate (FPS)
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-editor-surface rounded-editor-md border border-editor-border">
              {[24, 30, 60].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSelectedFps(f)}
                  className={`py-1.5 rounded-editor-sm text-xs font-medium text-center transition-smooth ${
                    selectedFps === f
                      ? 'bg-editor-accentAction text-white shadow-sm'
                      : 'text-editor-muted hover:text-editor-text'
                  }`}
                >
                  {f} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Create Button */}
          <div className="pt-2">
            <button
              onClick={handleCreateProject}
              className="w-full h-10 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Project</span>
            </button>
          </div>
        </section>

        {/* Right Column: Existing Projects List */}
        <section className="lg:col-span-7 bg-editor-panel border border-editor-border/80 rounded-editor-lg p-5 shadow-panel space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-editor-border/60">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4 text-editor-accent" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-editor-text">
                Recent Projects ({savedProjects.length})
              </h2>
            </div>
            <span className="text-[10px] text-editor-muted font-mono">Local Storage (IndexedDB)</span>
          </div>

          {isLoading ? (
            <div className="h-48 flex items-center justify-center text-editor-muted text-xs">
              Loading projects...
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="h-56 border border-dashed border-editor-border/80 rounded-editor-lg bg-editor-surface/30 flex flex-col items-center justify-center text-center p-6 text-editor-muted">
              <Film className="w-8 h-8 mb-2 opacity-30 text-editor-accent" />
              <p className="font-medium text-editor-secondary text-xs">No saved projects yet</p>
              <p className="text-[11px] text-editor-muted mt-1 max-w-xs">
                Configure a project on the left or import an existing JSON file to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
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
                    className="group bg-editor-surface/80 hover:bg-editor-surface border border-editor-border/70 hover:border-editor-accent/40 rounded-editor-md p-3 transition-smooth flex items-center justify-between gap-3 shadow-sm"
                  >
                    {/* Visual aspect ratio badge */}
                    <div className="w-12 h-11 bg-editor-subpanel rounded-editor-sm border border-editor-border/60 flex flex-col items-center justify-center shrink-0 text-editor-accent group-hover:border-editor-accent/30 transition-colors">
                      {getRatioIcon(ratio)}
                      <span className="text-[9px] font-mono font-medium text-editor-muted mt-0.5">{ratio}</span>
                    </div>

                    {/* Project Information */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-editor-text text-xs truncate group-hover:text-white transition-colors" title={p.name}>
                          {p.name}
                        </h3>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-editor-subpanel text-editor-muted border border-editor-border/50 shrink-0">
                          {fullProj ? `${fullProj.fps} FPS` : '30 FPS'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-[10px] text-editor-muted mt-0.5 font-mono">
                        <span>{fullProj?.duration?.toFixed(1) || '10'}s</span>
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
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenProject(p.id)}
                        className="h-7.5 px-3 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteProject(p.id, p.name)}
                        className="w-7.5 h-7.5 rounded-editor-sm hover:bg-editor-danger/15 text-editor-muted hover:text-editor-danger flex items-center justify-center transition-colors"
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
        </section>
      </main>
    </div>
  );
};
