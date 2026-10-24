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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-editor-elevated border border-editor-border rounded-editor-xl shadow-modal flex flex-col overflow-hidden text-xs text-editor-text">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-editor-sm bg-editor-success/15 border border-editor-success/30 flex items-center justify-center text-editor-success">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Export Video (MP4)</h2>
              <p className="text-[10px] text-editor-muted leading-tight">Render hardware-accelerated MP4 composition</p>
            </div>
          </div>
          <button
            onClick={() => !isExporting && setExportModalOpen(false)}
            disabled={isExporting}
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center hover:bg-editor-hover text-editor-muted hover:text-editor-text disabled:opacity-30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {errorMessage && (
            <div className="p-2.5 rounded-editor-md bg-editor-danger/10 border border-editor-danger/30 text-editor-danger flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {exportedBlob && (
            <div className="p-3 rounded-editor-md bg-editor-success/15 border border-editor-success/40 text-editor-text flex items-start space-x-2.5">
              <CheckCircle className="w-5 h-5 text-editor-success shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-editor-text">Export Complete!</p>
                <p className="text-[11px] text-editor-muted mt-0.5 font-mono">
                  {exportedBlob.filename} • {(exportedBlob.blob.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}

          {!isExporting && !exportedBlob && (
            <>
              {/* Resolution Selection */}
              <div>
                <label className="font-semibold text-editor-secondary block mb-1.5">
                  Output Resolution
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`py-2.5 px-3 rounded-editor-md border text-left transition-all ${
                      resolution === '1080p'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text">1080p Full HD</div>
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">1920 × 1080</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`py-2.5 px-3 rounded-editor-md border text-left transition-all ${
                      resolution === '720p'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text">720p HD</div>
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">1280 × 720</div>
                  </button>
                </div>
              </div>

              {/* Framerate Selection */}
              <div>
                <label className="font-semibold text-editor-secondary block mb-1.5">
                  Framerate (FPS)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[24, 30, 60].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFps(f)}
                      className={`py-1.5 rounded-editor-sm border text-center font-semibold text-xs transition-colors ${
                        fps === f
                          ? 'border-editor-success bg-editor-success/15 text-editor-text shadow-sm'
                          : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Composition Summary */}
              <div className="bg-editor-surface p-3 rounded-editor-md border border-editor-border space-y-1.5 text-editor-secondary text-[11px]">
                <div className="flex justify-between">
                  <span className="text-editor-muted">Duration:</span>
                  <span className="font-mono text-editor-text font-medium">{project.duration.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-editor-muted">Visual Layers:</span>
                  <span className="font-mono text-editor-text font-medium">
                    {project.tracks.reduce((sum, t) => sum + t.clips.length, 0)} clips
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-editor-muted">Audio Clips:</span>
                  <span className="font-mono text-editor-text font-medium">{project.audioClips.length} clips</span>
                </div>
              </div>
            </>
          )}

          {/* Export Progress Display */}
          {isExporting && progress && (
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-editor-text flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-editor-success" />
                  <span>{progress.status}</span>
                </span>
                <span className="font-mono font-bold text-editor-success">{progress.percentage}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-editor-surface rounded-full overflow-hidden border border-editor-border">
                <div
                  className="h-full bg-editor-success transition-all duration-150"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>

              <div className="text-center text-[10px] text-editor-muted font-mono">
                Frame {progress.frame} of {progress.totalFrames}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="h-12 border-t border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <button
            onClick={() => setExportModalOpen(false)}
            className="px-3 py-1.5 rounded-editor-sm hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text font-medium transition-colors"
          >
            Close
          </button>

          {isExporting ? (
            <button
              onClick={handleCancelExport}
              className="px-3.5 py-1.5 rounded-editor-sm bg-editor-danger/20 hover:bg-editor-danger/30 border border-editor-danger/50 text-editor-danger font-medium transition-colors"
            >
              Cancel Export
            </button>
          ) : exportedBlob ? (
            <button
              onClick={() => triggerBlobDownload(exportedBlob.blob, exportedBlob.filename)}
              className="px-4 py-1.5 rounded-editor-sm bg-editor-success hover:bg-editor-successHover text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download Again</span>
            </button>
          ) : (
            <button
              onClick={handleStartExport}
              className="px-4 py-1.5 rounded-editor-sm bg-editor-success hover:bg-editor-successHover text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
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
