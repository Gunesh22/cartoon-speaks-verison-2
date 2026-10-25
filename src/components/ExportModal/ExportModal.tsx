import React, { useState, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  exportProjectVideo,
  triggerBlobDownload,
  ExportProgress,
  calculateExportDimensions,
} from '../../core/export/videoExporter';
import { getEffectiveAnimationDuration } from '../../core/timeline/timelineMath';
import { exportProjectBundle, downloadBundle } from '../../core/project/projectBundle';
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
    inOutRange,
  } = useEditorStore();

  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [format, setFormat] = useState<'mp4' | 'webm-alpha'>('mp4');
  const [exportRangeMode, setExportRangeMode] = useState<'full' | 'inOut'>('full');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportedBlob, setExportedBlob] = useState<{ blob: Blob; filename: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCancelledRef = useRef<boolean>(false);

  const hasInOut = inOutRange && (inOutRange.in !== null || inOutRange.out !== null);
  const inTime = inOutRange?.in ?? 0;
  const effectiveMaxDuration = project.duration;
  const outTime = inOutRange?.out ?? effectiveMaxDuration;
  const inOutDuration = Math.max(0, outTime - inTime);

  const dim1080 = calculateExportDimensions(project.width, project.height, '1080p');
  const dim720 = calculateExportDimensions(project.width, project.height, '720p');

  const isAlphaSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ||
      MediaRecorder.isTypeSupported('video/webm;codecs=vp8'));

  if (!isExportModalOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setExportedBlob(null);
    isCancelledRef.current = false;

    try {
      const range =
        exportRangeMode === 'inOut' && hasInOut
          ? { start: inTime, end: outTime }
          : undefined;

      const result = await exportProjectVideo(
        project,
        assets,
        mouthSets,
        {
          resolution,
          fps,
          format,
          transparent: format === 'webm-alpha',
          range,
        },
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
              {/* Output Format (Feature 14) */}
              <div>
                <label className="font-semibold text-editor-secondary block mb-1.5">
                  Export Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('mp4')}
                    className={`py-2 px-2.5 rounded-editor-md border text-left transition-all ${
                      format === 'mp4'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text">MP4 Video</div>
                    <div className="text-[10px] text-editor-muted mt-0.5">H.264 / AAC Standard</div>
                  </button>

                  <button
                    type="button"
                    disabled={!isAlphaSupported}
                    onClick={() => isAlphaSupported && setFormat('webm-alpha')}
                    title={
                      isAlphaSupported
                        ? 'Export transparent WebM video'
                        : 'WebM alpha export requires VP9 or VP8 codec support (Chrome, Brave, or Edge required)'
                    }
                    className={`py-2 px-2.5 rounded-editor-md border text-left transition-all ${
                      !isAlphaSupported
                        ? 'opacity-40 cursor-not-allowed border-editor-border bg-editor-surface'
                        : format === 'webm-alpha'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text flex items-center justify-between">
                      <span>WebM Alpha</span>
                      <span className="text-[9px] bg-violet-900/60 text-violet-300 px-1 py-0.2 rounded font-mono">
                        {isAlphaSupported ? 'Alpha' : 'No VP9/VP8'}
                      </span>
                    </div>
                    <div className="text-[10px] text-editor-muted mt-0.5">
                      {isAlphaSupported ? 'Transparent Background' : 'Unsupported in this browser'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Timeline Export Range (Feature 15) */}
              <div>
                <label className="font-semibold text-editor-secondary block mb-1.5 flex items-center justify-between">
                  <span>Export Range</span>
                  <span className="text-[10px] text-editor-muted font-normal">Press I and O on timeline</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportRangeMode('full')}
                    className={`py-2 px-2.5 rounded-editor-md border text-left transition-all ${
                      exportRangeMode === 'full'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text">Entire Project</div>
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">
                      0.0s – {effectiveMaxDuration.toFixed(1)}s ({effectiveMaxDuration.toFixed(1)}s)
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => hasInOut && setExportRangeMode('inOut')}
                    disabled={!hasInOut}
                    className={`py-2 px-2.5 rounded-editor-md border text-left transition-all ${
                      !hasInOut
                        ? 'opacity-50 cursor-not-allowed border-editor-border/50 bg-editor-surface/50 text-editor-muted'
                        : exportRangeMode === 'inOut'
                        ? 'border-editor-success bg-editor-success/10 text-editor-text shadow-sm'
                        : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-borderLight'
                    }`}
                  >
                    <div className="font-semibold text-xs text-editor-text">In/Out Range</div>
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">
                      {hasInOut
                        ? `${inTime.toFixed(1)}s – ${outTime.toFixed(1)}s (${inOutDuration.toFixed(1)}s)`
                        : 'No In/Out marks set'}
                    </div>
                  </button>
                </div>
              </div>

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
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">
                      {dim1080.targetWidth} × {dim1080.targetHeight}
                    </div>
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
                    <div className="text-[10px] text-editor-muted font-mono mt-0.5">
                      {dim720.targetWidth} × {dim720.targetHeight}
                    </div>
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

              {/* Project Bundle Backup (Feature 16) */}
              <div className="pt-2 border-t border-editor-border/60">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const bundleBlob = await exportProjectBundle(project, assets, mouthSets);
                      downloadBundle(bundleBlob, project.name);
                    } catch (e) {
                      setErrorMessage(`Failed to export bundle: ${e instanceof Error ? e.message : String(e)}`);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-editor-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium text-xs flex items-center justify-between transition-colors shadow-sm"
                >
                  <div className="flex items-center space-x-2">
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold text-editor-text">Export Project Bundle (.cartoonspeaks)</span>
                  </div>
                  <span className="text-[10px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">
                    ZIP
                  </span>
                </button>
                <p className="text-[10px] text-editor-muted mt-1 leading-tight">
                  Packages project file, character artwork, mouth cues, and audio into a portable ZIP archive.
                </p>
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
