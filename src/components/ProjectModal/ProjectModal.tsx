import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  listStoredProjects,
  loadProjectFromDb,
  deleteProjectFromDb,
} from '../../core/assets/assetDb';
import {
  exportProjectToJson,
  validateProjectJson,
  findMissingAssets,
} from '../../core/project/projectManager';
import {
  X,
  FolderOpen,
  Save,
  Download,
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  Check,
} from 'lucide-react';

export const ProjectModal: React.FC = () => {
  const {
    isProjectModalOpen,
    setProjectModalOpen,
    project,
    setProject,
    newProject,
    saveProject,
    renameProject,
    assets,
  } = useEditorStore();

  const [projectName, setProjectName] = useState(project.name);
  const [savedProjects, setSavedProjects] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjectName(project.name);
  }, [project.name]);

  const refreshProjectList = async () => {
    try {
      const list = await listStoredProjects();
      setSavedProjects(list);
    } catch (e) {
      console.warn('Could not list projects:', e);
    }
  };

  useEffect(() => {
    if (isProjectModalOpen) {
      refreshProjectList();
    }
  }, [isProjectModalOpen]);

  if (!isProjectModalOpen) return null;

  const handleSave = async () => {
    renameProject(projectName);
    await saveProject();
    setSaveSuccess(true);
    await refreshProjectList();
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleLoad = async (id: string) => {
    const loaded = await loadProjectFromDb(id);
    if (loaded) {
      setProject(loaded);
      setProjectModalOpen(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this saved project?')) {
      await deleteProjectFromDb(id);
      await refreshProjectList();
    }
  };

  const handleExportJson = () => {
    const jsonStr = exportProjectToJson(project);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_v2_project.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          setImportWarning(`Invalid project JSON file: ${error || 'Unknown error'}`);
          return;
        }

        const availableIds = new Set(assets.keys());
        const missing = findMissingAssets(validatedProj, availableIds);

        if (missing.length > 0) {
          setImportWarning(`Project imported! Warning: ${missing.length} referenced media asset(s) are not in your local IndexedDB.`);
        } else {
          setImportWarning(null);
        }

        setProject(validatedProj);
        refreshProjectList();
      } catch (err) {
        setImportWarning('Failed to read file: invalid JSON format');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-editor-elevated border border-editor-border rounded-editor-xl shadow-modal flex flex-col overflow-hidden text-xs text-editor-text">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-editor-sm bg-editor-accent/15 border border-editor-accent/30 flex items-center justify-center text-editor-accent">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Project Manager</h2>
              <p className="text-[10px] text-editor-muted leading-tight">Save, open, and export project workspace metadata</p>
            </div>
          </div>
          <button
            onClick={() => setProjectModalOpen(false)}
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center hover:bg-editor-hover text-editor-muted hover:text-editor-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5 max-h-[70vh] overflow-y-auto">
          {importWarning && (
            <div className="p-2.5 rounded-editor-md bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>{importWarning}</span>
            </div>
          )}

          {/* Current Project Name & Save */}
          <div className="bg-editor-surface p-3 rounded-editor-md border border-editor-border space-y-2.5">
            <label className="font-semibold text-editor-secondary block">Current Project</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project Name..."
                className="flex-1 bg-editor-panel border border-editor-border rounded-editor-sm px-3 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent text-xs"
              />
              <button
                onClick={handleSave}
                className="px-3.5 py-1.5 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white font-medium flex items-center space-x-1.5 shadow-sm transition-colors"
              >
                {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saveSuccess ? 'Saved!' : 'Save'}</span>
              </button>
            </div>

            {/* Import & Export JSON buttons */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover text-editor-secondary hover:text-editor-text border border-editor-border flex items-center space-x-1.5 text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-editor-accent" />
                <span>Export JSON</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportJson}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover text-editor-secondary hover:text-editor-text border border-editor-border flex items-center space-x-1.5 text-xs transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-editor-secondary" />
                <span>Import JSON</span>
              </button>
            </div>
          </div>

          {/* Saved Projects in Local IndexedDB */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-editor-secondary">Saved Projects</span>
              <button
                onClick={() => {
                  newProject();
                  setProjectModalOpen(false);
                }}
                className="text-editor-accent hover:text-editor-accentHover flex items-center space-x-1 text-[11px] font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Create New</span>
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <div className="p-4 border border-dashed border-editor-border rounded-editor-md bg-editor-surface/40 text-center text-editor-muted">
                No saved projects yet. Click "Save" above to persist this project in browser storage.
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedProjects.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-editor-sm bg-editor-surface border border-editor-border flex items-center justify-between hover:border-editor-accent/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-editor-text text-xs">{p.name}</p>
                      <p className="text-[10px] text-editor-muted flex items-center space-x-1 mt-0.5 font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(p.updatedAt).toLocaleDateString()} {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleLoad(p.id)}
                        className="px-2.5 py-1 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white font-medium text-xs transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1 rounded-editor-sm hover:bg-editor-danger/20 text-editor-muted hover:text-editor-danger transition-colors"
                        title="Delete saved project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-editor-border px-4 flex items-center justify-end bg-editor-panel shrink-0">
          <button
            onClick={() => setProjectModalOpen(false)}
            className="px-3.5 py-1.5 rounded-editor-sm hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
