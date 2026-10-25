import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { listProjectSnapshots, deleteSnapshotFromDb, StoredSnapshotRecord } from '../../core/assets/assetDb';
import {
  X,
  History,
  Bookmark,
  RotateCcw,
  Trash2,
  Clock,
  Plus,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const SnapshotModal: React.FC = () => {
  const {
    isSnapshotModalOpen,
    setSnapshotModalOpen,
    project,
    restoreSnapshot,
    createSnapshot,
    lastSavedAt,
    isSaving,
  } = useEditorStore();

  const [snapshots, setSnapshots] = useState<StoredSnapshotRecord[]>([]);
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [filter, setFilter] = useState<'all' | 'checkpoints' | 'auto'>('all');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadSnapshots = async () => {
    if (!project?.id) return;
    try {
      const records = await listProjectSnapshots(project.id);
      setSnapshots(records);
    } catch (e) {
      console.warn('Failed to load snapshots:', e);
    }
  };

  useEffect(() => {
    if (isSnapshotModalOpen) {
      loadSnapshots();
      setStatusMessage(null);
    }
  }, [isSnapshotModalOpen, project.id, lastSavedAt]);

  if (!isSnapshotModalOpen) return null;

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCheckpointName.trim() || 'Manual Checkpoint';
    await createSnapshot(name);
    setNewCheckpointName('');
    setStatusMessage(`Saved checkpoint "${name}"`);
    await loadSnapshots();
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRestore = async (snap: StoredSnapshotRecord) => {
    const confirmMsg = `Restore version "${snap.name || 'Snapshot'}" from ${new Date(snap.createdAt).toLocaleTimeString()}?\nAny unsaved changes in current session will be overwritten.`;
    if (!window.confirm(confirmMsg)) return;

    const ok = await restoreSnapshot(snap.id);
    if (ok) {
      setStatusMessage('Project restored successfully!');
      setTimeout(() => {
        setSnapshotModalOpen(false);
      }, 1000);
    } else {
      setStatusMessage('Failed to restore snapshot.');
    }
  };

  const handleDelete = async (snapId: string) => {
    await deleteSnapshotFromDb(snapId);
    await loadSnapshots();
  };

  const filteredSnapshots = snapshots.filter((s) => {
    if (filter === 'checkpoints') return !s.isAuto;
    if (filter === 'auto') return s.isAuto;
    return true;
  });

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return isToday ? `Today at ${timeStr}` : `${date.toLocaleDateString()} ${timeStr}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-panel border border-editor-border rounded-editor-lg shadow-modal w-full max-w-xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-editor-border">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-editor-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Version History & Snapshots</h2>
              <p className="text-[11px] text-editor-muted">
                {project.name} · Auto-saves & manual checkpoints
              </p>
            </div>
          </div>
          <button
            onClick={() => setSnapshotModalOpen(false)}
            className="p-1 rounded text-editor-muted hover:text-editor-text hover:bg-editor-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Status Message */}
          {statusMessage && (
            <div className="p-2.5 rounded-editor-sm bg-editor-accent/15 border border-editor-accent/30 text-editor-accent text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Create Manual Checkpoint Form */}
          <form onSubmit={handleCreateCheckpoint} className="flex gap-2">
            <input
              type="text"
              placeholder="Name this checkpoint (e.g. 'Before scene 2 changes')..."
              value={newCheckpointName}
              onChange={(e) => setNewCheckpointName(e.target.value)}
              className="flex-1 bg-editor-surface border border-editor-border rounded-editor-sm px-3 py-1.5 text-xs text-editor-text focus:outline-none focus:border-editor-accent placeholder:text-editor-muted/60"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-editor-sm bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex items-center space-x-1.5 transition-colors shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Checkpoint</span>
            </button>
          </form>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-editor-border/60 pb-2">
            <div className="flex space-x-1 bg-editor-surface p-0.5 rounded-editor-sm border border-editor-border text-[11px]">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'all'
                    ? 'bg-editor-subpanel text-editor-text font-medium shadow-sm'
                    : 'text-editor-muted hover:text-editor-text'
                }`}
              >
                All ({snapshots.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('checkpoints')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'checkpoints'
                    ? 'bg-editor-subpanel text-editor-text font-medium shadow-sm'
                    : 'text-editor-muted hover:text-editor-text'
                }`}
              >
                Checkpoints ({snapshots.filter((s) => !s.isAuto).length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('auto')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === 'auto'
                    ? 'bg-editor-subpanel text-editor-text font-medium shadow-sm'
                    : 'text-editor-muted hover:text-editor-text'
                }`}
              >
                Rolling Auto-Saves ({snapshots.filter((s) => s.isAuto).length})
              </button>
            </div>

            <div className="text-[10px] text-editor-muted flex items-center space-x-1">
              <Clock className="w-3 h-3 text-editor-muted" />
              <span>
                {isSaving
                  ? 'Saving...'
                  : lastSavedAt
                  ? `Last auto-saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : 'Auto-save active'}
              </span>
            </div>
          </div>

          {/* Snapshots List */}
          {filteredSnapshots.length === 0 ? (
            <div className="text-center py-8 text-editor-muted space-y-1">
              <Bookmark className="w-6 h-6 mx-auto opacity-30 text-amber-400" />
              <p className="text-xs">No version snapshots found for this project.</p>
              <p className="text-[10px]">Auto-saves are captured as you edit, or create a checkpoint anytime.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSnapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="p-2.5 rounded-editor-md bg-editor-surface/80 border border-editor-border/80 flex items-center justify-between hover:bg-editor-subpanel/50 transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                        snap.isAuto
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {snap.isAuto ? <Clock className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-editor-text text-xs truncate">
                          {snap.name || (snap.isAuto ? 'Auto-Save' : 'Manual Checkpoint')}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium uppercase ${
                            snap.isAuto
                              ? 'bg-blue-950/60 text-blue-300 border border-blue-500/20'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-500/20'
                          }`}
                        >
                          {snap.isAuto ? 'Auto' : 'Checkpoint'}
                        </span>
                      </div>
                      <span className="text-[10px] text-editor-muted font-mono block">
                        {formatTimestamp(snap.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0 ml-3">
                    <button
                      type="button"
                      onClick={() => handleRestore(snap)}
                      title="Restore project to this snapshot version"
                      className="px-2 py-1 rounded bg-editor-accent/15 hover:bg-editor-accent/25 border border-editor-accent/30 text-editor-accent text-[11px] font-medium flex items-center space-x-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(snap.id)}
                      title="Delete this snapshot record"
                      className="p-1 rounded text-editor-muted hover:text-editor-danger hover:bg-editor-danger/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-editor-border bg-editor-surface/50 flex items-center justify-between text-[11px] text-editor-muted">
          <span>Rolling auto-saves keep up to 10 recent revisions per project.</span>
          <button
            onClick={() => setSnapshotModalOpen(false)}
            className="px-3 py-1 rounded bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-text transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
