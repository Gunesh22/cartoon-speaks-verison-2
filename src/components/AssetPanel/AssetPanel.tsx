import React, { useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  Image as ImageIcon,
  Music,
  Smile,
  Layers,
  Trash2,
  PlusCircle,
  Clock,
} from 'lucide-react';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { TrackId } from '../../types/timeline';
import { calculateFitToScreen } from '../../core/timeline/timelineMath';

export const AssetPanel: React.FC = () => {
  const {
    assets,
    mouthSets,
    currentTime,
    addVisualClip,
    addAudioClip,
    project,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<'media' | 'projectAssets'>('media');

  const assetList = Array.from(assets.values());
  const mouthSetList = Array.from(mouthSets.values());

  const handleAddImageToTimeline = (asset: EditorAsset, targetTrack: TrackId = 'V1') => {
    // Fit to canvas screen by default while maintaining aspect ratio and centering
    const baseW = asset.width || project.width;
    const baseH = asset.height || project.height;
    const fit = calculateFitToScreen(baseW, baseH, project.width, project.height, 'contain');

    addVisualClip(targetTrack, {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      assetId: asset.id,
      start: currentTime,
      duration: 5.0, // 5s default
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

  return (
    <aside className="w-64 bg-editor-panel border-r border-editor-border flex flex-col h-full select-none text-xs">
      {/* Tab Switcher */}
      <div className="flex border-b border-editor-border bg-editor-subpanel">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-2 text-center font-medium border-b-2 flex items-center justify-center space-x-1.5 transition-colors ${
            activeTab === 'media'
              ? 'border-blue-500 text-blue-400 bg-editor-panel'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Media ({assetList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('projectAssets')}
          className={`flex-1 py-2 text-center font-medium border-b-2 flex items-center justify-center space-x-1.5 transition-colors ${
            activeTab === 'projectAssets'
              ? 'border-purple-500 text-purple-400 bg-editor-panel'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Smile className="w-3.5 h-3.5" />
          <span>Mouth Sets ({mouthSetList.length})</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'media' && (
          <>
            {assetList.length === 0 ? (
              <div className="h-48 border border-dashed border-editor-border rounded flex flex-col items-center justify-center p-4 text-center text-gray-400">
                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                <p className="font-medium text-gray-300">No media imported</p>
                <p className="text-[11px] mt-1 text-gray-500">
                  Use "Import Image" or "Import Audio" in toolbar
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {assetList.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, asset)}
                    className="group relative bg-editor-subpanel border border-editor-border rounded p-1.5 hover:border-blue-500 cursor-grab active:cursor-grabbing transition-colors"
                  >
                    {/* Thumbnail / Icon */}
                    <div className="w-full h-24 bg-editor-bg rounded overflow-hidden flex items-center justify-center relative">
                      {asset.type === 'image' ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-amber-400">
                          <Music className="w-8 h-8 mb-1" />
                          <span className="text-[10px] text-gray-400">
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
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                      >
                        <PlusCircle className="w-6 h-6 text-blue-400" />
                      </button>
                    </div>

                    {/* Asset Name & Meta */}
                    <p className="mt-1 text-[11px] text-gray-300 truncate" title={asset.name}>
                      {asset.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mt-0.5">
                      <span>{asset.type.toUpperCase()}</span>
                      {asset.width && asset.height && (
                        <span>{asset.width}x{asset.height}</span>
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
              <div className="h-48 border border-dashed border-editor-border rounded flex flex-col items-center justify-center p-4 text-center text-gray-400">
                <Smile className="w-8 h-8 mb-2 opacity-50" />
                <p className="font-medium text-gray-300">No mouth sets generated</p>
                <p className="text-[11px] mt-1 text-gray-500">
                  Click "Lip Sync" in toolbar to create a mouth set
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mouthSetList.map((mSet) => {
                  const spriteKeys = Object.keys(mSet.sprites);
                  return (
                    <div
                      key={mSet.id}
                      className="bg-editor-subpanel border border-editor-border rounded p-2.5"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-gray-200">{mSet.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300">
                          {spriteKeys.length} shapes
                        </span>
                      </div>

                      {/* Mini sprite grid preview */}
                      <div className="grid grid-cols-5 gap-1 bg-editor-bg p-1 rounded">
                        {spriteKeys.slice(0, 5).map((k) => (
                          <div key={k} className="flex flex-col items-center">
                            <div className="w-8 h-8 bg-black/40 rounded flex items-center justify-center overflow-hidden">
                              <img
                                src={mSet.sprites[k].url}
                                alt={k}
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <span className="text-[9px] text-gray-400 mt-0.5">{k}</span>
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

      {/* Asset Panel Footer / Tip */}
      <div className="p-2.5 border-t border-editor-border bg-editor-panel text-gray-400 text-[11px] flex items-center space-x-1">
        <Clock className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <span className="truncate">Assets persist in local browser storage</span>
      </div>
    </aside>
  );
};
