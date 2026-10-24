import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  Image as ImageIcon,
  Music,
  Smile,
  Layers,
  Trash2,
  PlusCircle,
  Clock,
  Upload,
  HardDrive,
} from 'lucide-react';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { TrackId } from '../../types/timeline';
import { calculateFitToScreen } from '../../core/timeline/timelineMath';

export const AssetPanel: React.FC = () => {
  const {
    assets,
    mouthSets,
    deleteAsset,
    deleteMouthSet,
    clearAllAssets,
    addAsset,
    currentTime,
    addVisualClip,
    addAudioClip,
    project,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<'media' | 'projectAssets'>('media');
  const [scope, setScope] = useState<'project' | 'all'>('project');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allAssets = Array.from(assets.values());
  const assetList =
    scope === 'project'
      ? allAssets.filter((a) => a.projectId === project.id)
      : allAssets;

  const allMouthSets = Array.from(mouthSets.values());
  const mouthSetList =
    scope === 'project'
      ? allMouthSets.filter((m) => m.projectId === project.id)
      : allMouthSets;

  const handleAddImageToTimeline = (asset: EditorAsset, targetTrack: TrackId = 'V1') => {
    const baseW = asset.width || project.width;
    const baseH = asset.height || project.height;
    const fit = calculateFitToScreen(baseW, baseH, project.width, project.height, 'contain');

    addVisualClip(targetTrack, {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      assetId: asset.id,
      start: currentTime,
      duration: 5.0,
      x: fit.x,
      y: fit.y,
      width: fit.width,
      height: fit.height,
      rotation: 0,
      opacity: 1.0,
      visible: true,
      type: 'image',
    });
  };

  const handleAddAudioToTimeline = (asset: EditorAsset) => {
    addAudioClip({
      id: `aclip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      assetId: asset.id,
      start: currentTime,
      duration: asset.duration || 5.0,
      volume: 1.0,
      trimStart: 0,
      trimEnd: asset.duration || 5.0,
    });
  };

  const handleDragStart = (e: React.DragEvent, asset: EditorAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      assetId: asset.id,
      assetType: asset.type,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    }));
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImg = file.type.startsWith('image/');
      let width: number | undefined;
      let height: number | undefined;
      let duration: number | undefined = isImg ? undefined : 5;

      if (isImg) {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        await new Promise<void>((resolve) => {
          img.onload = () => {
            width = img.naturalWidth;
            height = img.naturalHeight;
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.src = objectUrl;
        });
      } else {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
          duration = buffer.duration;
          ctx.close().catch(() => {});
        } catch {
          // Fallback duration
        }
      }

      await addAsset({
        id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: file.name,
        type: isImg ? 'image' : 'audio',
        mimeType: file.type || (isImg ? 'image/png' : 'audio/wav'),
        blob: file,
        width,
        height,
        duration,
        projectId: project.id,
        createdAt: Date.now(),
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <aside className="w-64 bg-editor-panel border-r border-editor-border flex flex-col h-full select-none text-xs shrink-0">
      {/* Hidden input for quick import in empty state */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*"
        className="hidden"
        onChange={handleQuickUpload}
      />

      {/* Tab Switcher */}
      <div className="flex border-b border-editor-border bg-editor-panel/50 p-1">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-1.5 rounded-editor-sm text-center font-medium flex items-center justify-center space-x-1.5 transition-all ${
            activeTab === 'media'
              ? 'bg-editor-subpanel text-editor-text shadow-sm border border-editor-border/60'
              : 'text-editor-secondary hover:text-editor-text hover:bg-editor-hover/50'
          }`}
        >
          <Layers className={`w-3.5 h-3.5 ${activeTab === 'media' ? 'text-editor-accent' : 'text-editor-muted'}`} />
          <span>Media</span>
          <span className="text-[10px] text-editor-muted font-mono">({assetList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('projectAssets')}
          className={`flex-1 py-1.5 rounded-editor-sm text-center font-medium flex items-center justify-center space-x-1.5 transition-all ${
            activeTab === 'projectAssets'
              ? 'bg-editor-subpanel text-editor-text shadow-sm border border-editor-border/60'
              : 'text-editor-secondary hover:text-editor-text hover:bg-editor-hover/50'
          }`}
        >
          <Smile className={`w-3.5 h-3.5 ${activeTab === 'projectAssets' ? 'text-editor-accent' : 'text-editor-muted'}`} />
          <span>Mouth Sets</span>
          <span className="text-[10px] text-editor-muted font-mono">({mouthSetList.length})</span>
        </button>
      </div>

      {/* Scope Selector */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-editor-panel border-b border-editor-border text-[11px]">
        <div className="flex items-center space-x-1.5">
          <span className="text-editor-muted font-medium text-[10px] uppercase tracking-wider">Scope</span>
          <div className="flex bg-editor-subpanel rounded-editor-sm p-0.5 border border-editor-border">
            <button
              type="button"
              onClick={() => setScope('project')}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                scope === 'project'
                  ? 'bg-editor-hover text-editor-text font-medium shadow-sm'
                  : 'text-editor-muted hover:text-editor-text'
              }`}
            >
              Project
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                scope === 'all'
                  ? 'bg-editor-hover text-editor-text font-medium shadow-sm'
                  : 'text-editor-muted hover:text-editor-text'
              }`}
            >
              Library ({allAssets.length})
            </button>
          </div>
        </div>

        {allAssets.length > 0 && scope === 'all' && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear all stored media from the browser library?')) {
                clearAllAssets();
              }
            }}
            title="Clear all stored media in browser storage"
            className="text-[10px] text-editor-danger hover:underline px-1 py-0.5 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {activeTab === 'media' && (
          <>
            {assetList.length === 0 ? (
              <div className="h-56 border border-dashed border-editor-border rounded-editor-lg bg-editor-surface/40 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-editor-subpanel border border-editor-border flex items-center justify-center mb-2.5 text-editor-muted">
                  <ImageIcon className="w-5 h-5 opacity-60" />
                </div>
                <p className="font-medium text-editor-text text-xs">No media assets</p>
                <p className="text-[11px] text-editor-muted mt-1 max-w-[170px] leading-relaxed">
                  Import character images or voice audio files to edit
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 px-3 py-1.5 rounded-editor-md bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-text text-[11px] font-medium flex items-center space-x-1.5 shadow-sm transition-colors"
                >
                  <Upload className="w-3 h-3 text-editor-accent" />
                  <span>Import Media</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {assetList.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, asset)}
                    className="group relative bg-editor-subpanel border border-editor-border rounded-editor-md p-1.5 hover:border-editor-accent/60 cursor-grab active:cursor-grabbing transition-all shadow-sm"
                  >
                    {/* Thumbnail / Icon Container */}
                    <div className="w-full h-24 bg-editor-surface rounded-editor-sm overflow-hidden flex items-center justify-center relative border border-editor-border/40">
                      {asset.type === 'image' ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-amber-400">
                          <Music className="w-7 h-7 mb-1 opacity-90" />
                          <span className="text-[10px] text-editor-muted font-mono">
                            {asset.duration ? `${asset.duration.toFixed(1)}s` : 'Audio'}
                          </span>
                        </div>
                      )}

                      {/* Quick Add overlay button */}
                      <button
                        onClick={() => {
                          if (asset.type === 'image') {
                            handleAddImageToTimeline(asset, 'V1');
                          } else {
                            handleAddAudioToTimeline(asset);
                          }
                        }}
                        title="Add to Timeline at Playhead"
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity backdrop-blur-[1px]"
                      >
                        <PlusCircle className="w-6 h-6 text-editor-accent hover:scale-110 transition-transform" />
                      </button>

                      {/* Delete asset button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${asset.name}"?`)) {
                            deleteAsset(asset.id);
                          }
                        }}
                        title="Delete Asset from Storage"
                        className="absolute top-1 right-1 p-1 rounded-editor-sm bg-black/70 hover:bg-editor-danger text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Asset Name & Meta */}
                    <p className="mt-1.5 text-[11px] font-medium text-editor-text truncate" title={asset.name}>
                      {asset.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-editor-muted mt-0.5 font-mono">
                      <span className="text-[9px] uppercase tracking-wider">{asset.type}</span>
                      {asset.width && asset.height && (
                        <span>{asset.width}×{asset.height}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'projectAssets' && (
          <>
            {mouthSetList.length === 0 ? (
              <div className="h-56 border border-dashed border-editor-border rounded-editor-lg bg-editor-surface/40 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-editor-subpanel border border-editor-border flex items-center justify-center mb-2.5 text-editor-muted">
                  <Smile className="w-5 h-5 opacity-60" />
                </div>
                <p className="font-medium text-editor-text text-xs">No mouth sets generated</p>
                <p className="text-[11px] text-editor-muted mt-1 max-w-[170px] leading-relaxed">
                  Use "Lip Sync" in the top toolbar to generate viseme mouth sets
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mouthSetList.map((mSet) => {
                  const spriteKeys = Object.keys(mSet.sprites);
                  return (
                    <div
                      key={mSet.id}
                      className="bg-editor-subpanel border border-editor-border rounded-editor-md p-2.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-editor-text truncate pr-2 text-xs" title={mSet.name}>
                          {mSet.name}
                        </span>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-editor-accent/15 text-editor-accent font-medium border border-editor-accent/25">
                            {spriteKeys.length} shapes
                          </span>
                          <button
                            onClick={() => {
                              if (confirm(`Delete mouth set "${mSet.name}"?`)) {
                                deleteMouthSet(mSet.id);
                              }
                            }}
                            title="Delete Mouth Set"
                            className="p-1 rounded-editor-sm hover:bg-editor-danger/20 text-editor-muted hover:text-editor-danger transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Mini sprite grid preview */}
                      <div className="grid grid-cols-5 gap-1 bg-editor-surface p-1.5 rounded-editor-sm border border-editor-border/40">
                        {spriteKeys.slice(0, 5).map((k) => (
                          <div key={k} className="flex flex-col items-center">
                            <div className="w-7 h-7 bg-black/40 rounded flex items-center justify-center overflow-hidden border border-editor-border/30">
                              <img
                                src={mSet.sprites[k].url}
                                alt={k}
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <span className="text-[9px] font-mono text-editor-muted mt-0.5">{k}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Asset Panel Footer */}
      <div className="p-2 border-t border-editor-border bg-editor-panel text-editor-muted text-[11px] flex items-center space-x-1.5 shrink-0">
        <HardDrive className="w-3.5 h-3.5 text-editor-accent/80 shrink-0" />
        <span className="truncate">Local browser storage active</span>
      </div>
    </aside>
  );
};
