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

        // Check for missing assets
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-editor-panel border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs text-gray-200">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-subpanel">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-gray-100">Project Manager</h2>
          </div>
          <button
            onClick={() => setProjectModalOpen(false)}
            className="p-1 rounded hover:bg-editor-panel text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {importWarning && (
            <div className="p-3 rounded bg-amber-950/60 border border-amber-800 text-amber-200 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{importWarning}</span>
            </div>
          )}

          {/* Current Project Name & Save */}
          <div className="bg-editor-subpanel p-3.5 rounded border border-editor-border space-y-3">
            <label className="font-semibold text-gray-200 block">Current Project</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project Name..."
                className="flex-1 bg-editor-bg border border-editor-border rounded px-3 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center space-x-1.5 shadow"
              >
                {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{saveSuccess ? 'Saved!' : 'Save'}</span>
              </button>
            </div>

            {/* Import & Export JSON buttons */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded bg-editor-panel hover:bg-editor-border text-gray-300 border border-editor-border flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Export JSON Metadata</span>
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
                className="px-3 py-1.5 rounded bg-editor-panel hover:bg-editor-border text-gray-300 border border-editor-border flex items-center space-x-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Import JSON</span>
              </button>
            </div>
          </div>

          {/* Saved Projects in Local IndexedDB */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-gray-300">Saved Projects in Browser Storage</span>
              <button
                onClick={() => {
                  newProject();
                  setProjectModalOpen(false);
                }}
                className="text-blue-400 hover:underline flex items-center space-x-1 text-[11px]"
              >
                <Plus className="w-3 h-3" />
                <span>Create New</span>
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <div className="p-4 border border-dashed border-editor-border rounded text-center text-gray-500">
                No saved projects yet. Click "Save" above to persist this project.
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedProjects.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded bg-editor-subpanel border border-editor-border flex items-center justify-between hover:border-gray-500 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-200">{p.name}</p>
                      <p className="text-[10px] text-gray-500 flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(p.updatedAt).toLocaleString()}</span>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleLoad(p.id)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1 rounded hover:bg-red-900/40 text-red-400"
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
        <div className="h-12 border-t border-editor-border px-4 flex items-center justify-end bg-editor-subpanel">
          <button
            onClick={() => setProjectModalOpen(false)}
            className="px-4 py-1.5 rounded hover:bg-editor-panel text-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
