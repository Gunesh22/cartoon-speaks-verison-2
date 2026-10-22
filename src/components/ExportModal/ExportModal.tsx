import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { exportProjectVideo, triggerBlobDownload, ExportProgress } from '../../core/export/videoExporter';
import {
  X,
  Download,
  Video,
  CheckCircle,
  AlertCircle,
  Loader2,
  Film,
} from 'lucide-react';

export const ExportModal: React.FC = () => {
  const {
    isExportModalOpen,
    setExportModalOpen,
    project,
    assets,
    mouthSets,
  } = useEditorStore();

  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportedBlob, setExportedBlob] = useState<{ blob: Blob; filename: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCancelledRef = useRef<boolean>(false);

  if (!isExportModalOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setExportedBlob(null);
    isCancelledRef.current = false;

    try {
      const result = await exportProjectVideo(
        project,
        assets,
        mouthSets,
        { resolution, fps },
        (p) => setProgress(p),
        () => isCancelledRef.current
      );

      setExportedBlob(result);
      // Trigger instant download
      triggerBlobDownload(result.blob, result.filename);
    } catch (err) {
      if (isCancelledRef.current) {
        setErrorMessage('Export was cancelled.');
      } else {
        setErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancelExport = () => {
    isCancelledRef.current = true;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-editor-panel border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs text-gray-200">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-subpanel">
          <div className="flex items-center space-x-2">
            <Video className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-gray-100">Export Video (MP4)</h2>
          </div>
          <button
            onClick={() => !isExporting && setExportModalOpen(false)}
            disabled={isExporting}
            className="p-1 rounded hover:bg-editor-panel text-gray-400 hover:text-white disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded bg-red-950/60 border border-red-800 text-red-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {exportedBlob && (
            <div className="p-3 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-200 flex items-start space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Export Complete!</p>
                <p className="text-[11px] text-emerald-300">
                  {exportedBlob.filename} ({(exportedBlob.blob.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              </div>
            </div>
          )}

          {!isExporting && !exportedBlob && (
            <>
              {/* Resolution Selection */}
              <div>
                <label className="font-semibold text-gray-300 block mb-1.5">
                  Output Resolution
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`py-2 px-3 rounded border text-left transition-colors ${
                      resolution === '1080p'
                        ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                        : 'border-editor-border bg-editor-subpanel text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-bold">1080p Full HD</div>
                    <div className="text-[10px] text-gray-500">1920 × 1080</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`py-2 px-3 rounded border text-left transition-colors ${
                      resolution === '720p'
                        ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                        : 'border-editor-border bg-editor-subpanel text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-bold">720p HD</div>
                    <div className="text-[10px] text-gray-500">1280 × 720</div>
                  </button>
                </div>
              </div>

              {/* Framerate Selection */}
              <div>
                <label className="font-semibold text-gray-300 block mb-1.5">
                  Framerate (FPS)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[24, 30, 60].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`py-1.5 rounded border text-center font-medium ${
                        fps === f
                          ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                          : 'border-editor-border bg-editor-subpanel text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Composition Summary */}
              <div className="bg-editor-subpanel p-3 rounded border border-editor-border space-y-1 text-gray-400 text-[11px]">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-mono text-gray-200">{project.duration.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Visual Tracks:</span>
                  <span className="font-mono text-gray-200">
                    {project.tracks.reduce((sum, t) => sum + t.clips.length, 0)} clips
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Audio Tracks:</span>
                  <span className="font-mono text-gray-200">{project.audioClips.length} clips</span>
                </div>
              </div>
            </>
          )}

          {/* Export Progress Display */}
          {isExporting && progress && (
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-300 flex items-center space-x-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>{progress.status}</span>
                </span>
                <span className="font-mono font-bold text-emerald-400">{progress.percentage}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-editor-bg rounded-full overflow-hidden border border-editor-border">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <div className="text-center text-[10px] text-gray-500">
                Frame {progress.frame} of {progress.totalFrames}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="h-14 border-t border-editor-border px-4 flex items-center justify-between bg-editor-subpanel">
          <button
            onClick={() => setExportModalOpen(false)}
            className="px-3 py-1.5 rounded hover:bg-editor-panel text-gray-300"
          >
            Close
          </button>

          {isExporting ? (
            <button
              onClick={handleCancelExport}
              className="px-4 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white font-medium"
            >
              Cancel Export
            </button>
          ) : exportedBlob ? (
            <button
              onClick={() => triggerBlobDownload(exportedBlob.blob, exportedBlob.filename)}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center space-x-1.5 shadow"
            >
              <Download className="w-4 h-4" />
              <span>Download Again</span>
            </button>
          ) : (
            <button
              onClick={handleStartExport}
              className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center space-x-2 shadow"
            >
              <Film className="w-4 h-4" />
              <span>Start Export</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
