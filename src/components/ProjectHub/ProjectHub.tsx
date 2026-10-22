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
} from 'lucide-react';

export const ProjectHub: React.FC = () => {
  const {
    project,
    setProject,
    newProject,
    setCurrentView,
    assets,
  } = useEditorStore();

  const [savedProjects, setSavedProjects] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const [projectDetails, setProjectDetails] = useState<Map<string, EditorProject>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // New Project Form State
  const [newProjName, setNewProjName] = useState('My Animation Project');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioPreset | null>(null);
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
        return <Smartphone className="w-3.5 h-3.5 text-pink-400" />;
      case '1:1':
        return <Square className="w-3.5 h-3.5 text-purple-400" />;
      case '4:5':
        return <Smartphone className="w-3.5 h-3.5 text-amber-400" />;
      case '16:9':
      default:
        return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#121316] text-gray-100 flex flex-col p-4 md:p-6 select-none">
      {/* Top Header Bar */}
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between pb-3 border-b border-editor-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-base shadow-md">
            CS
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center space-x-2 leading-tight">
              <span>Cartoon Speaks</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-600/30 text-blue-400 font-normal border border-blue-500/40">
                v2.0
              </span>
            </h1>
            <p className="text-[11px] text-gray-400">2D Video Editor & Lip-Sync Animation Studio</p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportJson}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-gray-300 text-xs flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Import Project JSON</span>
          </button>

          {project && (
            <button
              onClick={() => setCurrentView('editor')}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow transition-colors"
            >
              <span>Current Project</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {importError && (
        <div className="max-w-6xl w-full mx-auto mt-2 p-2 rounded bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center space-x-2 flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{importError}</span>
        </div>
      )}

      {/* Main Container: Fits strictly on screen with NO page scrolling */}
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 mt-3 flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Create New Project Card (Compact) */}
        <div className="lg:col-span-5 bg-editor-panel border border-editor-border rounded-xl p-4 shadow-lg flex flex-col justify-between overflow-hidden">
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Create New Project</h2>
            </div>

            {/* Project Title Input */}
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                Project Title
              </label>
              <input
                type="text"
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="e.g. My Cartoon Episode 1"
                className="w-full bg-editor-bg border border-editor-border rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Aspect Ratio Options (Compact 2-Column Grid) */}
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ASPECT_RATIO_PRESETS.map((p) => {
                  const isSelected = selectedRatio === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedRatio(p.id)}
                      className={`p-2 rounded-lg border text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm'
                          : 'border-editor-border bg-editor-subpanel text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        {getRatioIcon(p.id)}
                        <span className="font-semibold text-[11px] text-white truncate">{p.id}</span>
                      </div>
                      <span className="font-mono text-[10px] text-gray-400">
                        {p.width}×{p.height}
                      </span>
                    </button>
                  );
                })}

                {/* Custom Aspect Ratio Option */}
                <button
                  type="button"
                  onClick={() => setSelectedRatio('custom')}
                  className={`p-2 rounded-lg border text-left flex items-center justify-between transition-colors ${
                    selectedRatio === 'custom'
                      ? 'border-blue-500 bg-blue-950/40 text-blue-200'
                      : 'border-editor-border bg-editor-subpanel text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Layout className="w-3.5 h-3.5 text-teal-400" />
                    <span className="font-semibold text-[11px] text-white">Custom</span>
                  </div>
                  <span className="text-[10px] text-gray-400">px</span>
                </button>
              </div>

              {selectedRatio === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-1.5 p-2 rounded-lg bg-editor-bg border border-editor-border">
                  <div>
                    <span className="text-[10px] text-gray-400">Width (px)</span>
                    <input
                      type="number"
                      min="100"
                      max="4096"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1920)}
                      className="w-full bg-editor-subpanel border border-editor-border rounded px-2 py-0.5 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400">Height (px)</span>
                    <input
                      type="number"
                      min="100"
                      max="4096"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(parseInt(e.target.value) || 1080)}
                      className="w-full bg-editor-subpanel border border-editor-border rounded px-2 py-0.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Framerate Selection (Compact row) */}
            <div>
              <label className="text-[11px] font-semibold text-gray-300 block mb-1">
                Framerate (FPS)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[24, 30, 60].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedFps(f)}
                    className={`py-1 rounded-lg border text-xs font-semibold text-center transition-colors ${
                      selectedFps === f
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-editor-border bg-editor-subpanel text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {f} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Create Button (Always pinned and visible without scrolling) */}
          <div className="pt-3 border-t border-editor-border mt-3">
            <button
              onClick={handleCreateProject}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 shadow-lg transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create & Enter Editor</span>
            </button>
          </div>
        </div>

        {/* Right Column: Existing Projects List */}
        <div className="lg:col-span-7 bg-editor-panel border border-editor-border rounded-xl p-4 shadow-lg flex flex-col overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-editor-border mb-3 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">
                Saved Projects ({savedProjects.length})
              </h2>
            </div>
            <span className="text-[11px] text-gray-500 font-mono">Browser IndexedDB</span>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
              Loading saved projects...
            </div>
          ) : savedProjects.length === 0 ? (
            <div className="flex-1 border border-dashed border-editor-border rounded-lg bg-editor-bg/40 flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <Film className="w-8 h-8 mb-2 opacity-40 text-gray-500" />
              <p className="font-semibold text-gray-300 text-xs">No saved projects yet</p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-xs">
                Create a project using the form on the left, or import an existing JSON project.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 content-start">
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
                    className="group bg-editor-subpanel border border-editor-border rounded-lg p-3 hover:border-blue-500/80 transition-all shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Bar with Aspect Ratio Badge */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-editor-panel text-gray-300 font-mono border border-editor-border flex items-center space-x-1">
                          {getRatioIcon(ratio)}
                          <span>{ratio.toUpperCase()} ({w}×{h})</span>
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {fullProj ? `${fullProj.fps} FPS` : ''}
                        </span>
                      </div>

                      {/* Project Name */}
                      <h3 className="font-bold text-white text-xs truncate group-hover:text-blue-400 transition-colors" title={p.name}>
                        {p.name}
                      </h3>

                      {/* Metadata */}
                      <div className="text-[10px] text-gray-400 mt-0.5 flex items-center space-x-2">
                        <span>Duration: {fullProj?.duration?.toFixed(1) || '10'}s</span>
                        <span>•</span>
                        <span>{totalClips} clips</span>
                      </div>

                      <div className="text-[9px] text-gray-500 mt-1.5 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(p.updatedAt).toLocaleDateString()} {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-2.5 pt-2 border-t border-editor-border/80 flex items-center justify-between">
                      <button
                        onClick={() => handleOpenProject(p.id)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] flex items-center space-x-1 shadow transition-colors"
                      >
                        <span>Open in Editor</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>

                      <button
                        onClick={() => handleDeleteProject(p.id, p.name)}
                        className="p-1 rounded hover:bg-red-950/60 text-gray-500 hover:text-red-400 transition-colors"
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
