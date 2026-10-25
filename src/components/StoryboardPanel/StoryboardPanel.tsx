import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  BookOpen,
  X,
  Upload,
  Copy,
  Check,
  Plus,
  Trash2,
  FileText,
  Sparkles,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface StoryboardNote {
  id: string;
  title: string;
  content: string;
  timestamp?: number;
}

export const StoryboardPanel: React.FC = () => {
  const {
    showStoryboard,
    toggleStoryboard,
    project,
    assets,
    addAsset,
    deleteAsset,
    setPromptModalOpen,
  } = useEditorStore();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'references'>('script');
  const [notes, setNotes] = useState<StoryboardNote[]>([
    {
      id: 'scene_1',
      title: 'Scene 1 — Opening Hook',
      content:
        '[thoughtful] Aapne shirt gift ki thi... [chuckles] ya usse pehenne ka decision bhi? [short pause] Shirt uski hai. Pasand aapki hai. [sighs] Dono ek hi honi chahiye, yeh kab tay hua?',
    },
    {
      id: 'scene_2',
      title: 'Scene 2 — Character Reaction',
      content:
        '[sarcastic] Oh wow, brilliant strategy. Let me just freeze here while you figure out which mouth shape goes next.',
    },
  ]);

  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!showStoryboard) return null;

  // Filter image assets associated with this project
  const referenceImages = Array.from(assets.values()).filter(
    (a) => a.type === 'image' && (!a.projectId || a.projectId === project.id)
  );

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddNote = () => {
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return;
    setNotes((prev) => [
      ...prev,
      {
        id: `note_${Date.now()}`,
        title: newNoteTitle.trim() || `Scene Note ${prev.length + 1}`,
        content: newNoteContent.trim(),
        timestamp: Date.now(),
      },
    ]);
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsAddingNote(false);
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleUploadRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await addAsset({
        id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `[Ref] ${file.name}`,
        type: 'image',
        mimeType: file.type || 'image/png',
        blob: file,
        createdAt: Date.now(),
      });
    }
  };

  return (
    <aside className="w-80 border-r border-editor-border bg-editor-panel flex flex-col h-full z-20 shrink-0 select-none animate-in slide-in-from-left-2 duration-150">
      {/* Header */}
      <div className="h-10 px-3 border-b border-editor-border flex items-center justify-between bg-editor-surface">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-editor-accent" />
          <span className="font-semibold text-xs text-editor-text tracking-wide">
            Storyboard & Script
          </span>
        </div>
        <button
          onClick={toggleStoryboard}
          title="Close Storyboard Panel"
          className="w-6 h-6 rounded flex items-center justify-center text-editor-muted hover:text-editor-text hover:bg-editor-hover transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Sub-Tabs */}
      <div className="flex border-b border-editor-border bg-editor-bg/60 text-xs font-medium">
        <button
          onClick={() => setActiveTab('script')}
          className={`flex-1 py-2 text-center transition-colors border-b-2 ${
            activeTab === 'script'
              ? 'border-editor-accent text-editor-accent bg-editor-surface/40'
              : 'border-transparent text-editor-muted hover:text-editor-secondary'
          }`}
        >
          Scene Scripts ({notes.length})
        </button>
        <button
          onClick={() => setActiveTab('references')}
          className={`flex-1 py-2 text-center transition-colors border-b-2 ${
            activeTab === 'references'
              ? 'border-editor-accent text-editor-accent bg-editor-surface/40'
              : 'border-transparent text-editor-muted hover:text-editor-secondary'
          }`}
        >
          Art Refs ({referenceImages.length})
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'script' && (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-editor-muted font-medium uppercase tracking-wider">
                Dialogue Cue Cards
              </span>
              <button
                onClick={() => setIsAddingNote((v) => !v)}
                className="text-[11px] text-editor-accent hover:text-editor-accentHover flex items-center space-x-1 font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Cue</span>
              </button>
            </div>

            {/* Quick Prompts Modal Opener */}
            <button
              onClick={() => setPromptModalOpen(true)}
              className="w-full py-2 px-2.5 rounded-editor-md border border-editor-accent/40 bg-editor-accent/10 hover:bg-editor-accent/20 text-editor-accent text-xs flex items-center justify-between transition-colors shadow-sm"
            >
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-semibold">AI Script & Emotion Prompts</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Add note card form */}
            {isAddingNote && (
              <div className="p-2.5 bg-editor-surface border border-editor-accent/40 rounded-editor-md space-y-2">
                <input
                  type="text"
                  placeholder="Scene / Character Title"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="w-full px-2 py-1 bg-editor-bg border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-editor-accent"
                />
                <textarea
                  placeholder="Paste dialogue with [emotion] and [action] tags..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={3}
                  className="w-full px-2 py-1 bg-editor-bg border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-editor-accent resize-none font-mono text-[11px]"
                />
                <div className="flex justify-end space-x-1.5">
                  <button
                    onClick={() => setIsAddingNote(false)}
                    className="px-2 py-1 rounded text-[11px] text-editor-muted hover:text-editor-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNote}
                    className="px-2.5 py-1 rounded bg-editor-accent text-white text-[11px] font-medium"
                  >
                    Save Cue
                  </button>
                </div>
              </div>
            )}

            {/* Notes list */}
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3 bg-editor-surface border border-editor-border rounded-editor-md hover:border-editor-borderLight transition-all group relative"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-xs text-editor-text truncate max-w-[190px]">
                    {note.title}
                  </h4>
                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(note.id, note.content)}
                      title="Copy script to clipboard"
                      className="p-1 rounded hover:bg-editor-hover text-editor-muted hover:text-editor-text transition-colors"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-3.5 h-3.5 text-editor-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      title="Delete card"
                      className="p-1 rounded hover:bg-editor-hover text-editor-muted hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-editor-secondary font-mono leading-relaxed bg-editor-bg/80 p-2 rounded border border-editor-border/50 whitespace-pre-wrap select-text">
                  {note.content}
                </p>
              </div>
            ))}
          </>
        )}

        {activeTab === 'references' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUploadRef}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-3 border border-dashed border-editor-border hover:border-editor-accent rounded-editor-md flex items-center justify-center space-x-2 text-xs text-editor-muted hover:text-editor-accent bg-editor-surface/30 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="font-medium">Upload Character / Pose Reference</span>
            </button>

            {referenceImages.length === 0 ? (
              <div className="text-center py-8 text-editor-muted text-xs">
                No visual references loaded. Upload character model sheets or pose guides above.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {referenceImages.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative bg-editor-surface border border-editor-border rounded-editor-md overflow-hidden aspect-square flex flex-col"
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-contain p-1"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                      <span className="text-[9px] text-white font-medium truncate">
                        {asset.name}
                      </span>
                      <div className="flex justify-end">
                        <button
                          onClick={() => deleteAsset(asset.id)}
                          title="Remove reference"
                          className="p-1 rounded bg-black/50 text-red-300 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
