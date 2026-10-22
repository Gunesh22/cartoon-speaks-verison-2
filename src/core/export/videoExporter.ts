import { EditorProject } from '../../types/project';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { renderCompositionFrame } from '../renderer/canvasRenderer';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { audioEngine } from '../audio/audioEngine';

export interface ExportSettings {
  resolution: '720p' | '1080p';
  fps: number;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percentage: number;
  status: string;
}

/**
 * Mixes all project audio clips into a single AudioBuffer using OfflineAudioContext.
 */
export async function mixProjectAudio(
  project: EditorProject,
  assets: Map<string, EditorAsset>,
  sampleRate: number = 44100
): Promise<AudioBuffer | null> {
  if (project.duration <= 0) {
    return null;
  }

  interface AudioScheduleItem {
    assetId: string;
    start: number;
    duration: number;
    volume: number;
    trimStart: number;
  }

  const schedule: AudioScheduleItem[] = [];

  // 1. Gather all explicit audio clips from the timeline
  for (const clip of project.audioClips) {
    schedule.push({
      assetId: clip.assetId,
      start: clip.start,
      duration: clip.duration,
      volume: clip.volume ?? 1,
      trimStart: clip.trimStart ?? 0,
    });
  }

  // 2. Also check visual tracks for lipSync clips that reference an audio asset
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.visible && clip.type === 'lipSync' && clip.lipSyncData?.audioAssetId) {
        const audioId = clip.lipSyncData.audioAssetId;
        const alreadyScheduled = schedule.some(
          (s) => s.assetId === audioId && Math.abs(s.start - clip.start) < 0.2
        );
        if (!alreadyScheduled) {
          schedule.push({
            assetId: audioId,
            start: clip.start,
            duration: clip.duration,
            volume: 1.0,
            trimStart: 0,
          });
        }
      }
    }
  }

  if (schedule.length === 0) {
    return null;
  }

  const lengthSamples = Math.max(1, Math.ceil(project.duration * sampleRate));
  const OfflineCtx =
    typeof window !== 'undefined'
      ? window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
      : (typeof globalThis !== 'undefined' ? (globalThis as any).OfflineAudioContext : null);
  if (!OfflineCtx) return null;

  const offlineCtx = new OfflineCtx(2, lengthSamples, sampleRate);
  let hasValidClips = false;

  for (const item of schedule) {
    const asset = assets.get(item.assetId);
    if (!asset) continue;

    try {
      let decoded: AudioBuffer | null = null;

      // 1. First attempt: use audioEngine's cached buffer or offline loader
      try {
        decoded = await audioEngine.loadAudioBuffer(item.assetId, asset.blob, asset.url);
      } catch (_) {}

      // 2. Second attempt: decode directly via OfflineAudioContext
      if (!decoded) {
        let arrayBuffer: ArrayBuffer | null = null;
        if (asset.blob && typeof asset.blob.arrayBuffer === 'function') {
          arrayBuffer = await asset.blob.arrayBuffer();
        } else if (asset.url) {
          const resp = await fetch(asset.url);
          arrayBuffer = await resp.arrayBuffer();
        }

        if (arrayBuffer) {
          const decodeCtx = new OfflineCtx(1, 1, sampleRate);
          decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
        }
      }

      if (!decoded) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;

      const gain = offlineCtx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, item.volume));
      source.connect(gain);
      gain.connect(offlineCtx.destination);

      const startOnTimeline = Math.max(0, item.start);
      const offset = Math.max(0, item.trimStart);
      const remainingInBuffer = Math.max(0, decoded.duration - offset);
      const duration = Math.min(item.duration, remainingInBuffer);

      if (duration > 0 && startOnTimeline < project.duration) {
        source.start(startOnTimeline, offset, duration);
        hasValidClips = true;
      }
    } catch (e) {
      console.warn(`Failed to process audio clip in export for asset ${item.assetId}:`, e);
    }
  }

  if (!hasValidClips) return null;
  return await offlineCtx.startRendering();
}

/**
 * High-performance MP4 export using WebCodecs VideoEncoder + AudioEncoder + mp4-muxer.
 */
async function exportWithWebCodecs(
  project: EditorProject,
  assets: Map<string, EditorAsset>,
  mouthSets: Map<string, MouthSetAsset>,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  onProgress?: (p: ExportProgress) => void,
  checkCancelled?: () => boolean
): Promise<Blob> {
  const muxerTarget = new ArrayBufferTarget();
  const totalFrames = Math.ceil(project.duration * fps);

  // Mix audio first
  onProgress?.({ frame: 0, totalFrames, percentage: 2, status: 'Mixing audio...' });
  const mixedAudio = await mixProjectAudio(project, assets, 44100);

  // Setup audio encoder with interleaved frame encoding and robust chunk duration
  let audioEncoder: AudioEncoder | null = null;
  const audioSampleRate = 44100;
  let nextAudioOffset = 0;
  let ch0: Float32Array | null = null;
  let ch1: Float32Array | null = null;
  let totalAudioFrames = 0;
  const audioChunkSize = 1024;
  let audioChannels = 2;

  let audioMuxerConfig: { codec: 'aac'; numberOfChannels: number; sampleRate: number } | undefined = undefined;

  if (mixedAudio && typeof AudioEncoder !== 'undefined') {
    audioChannels = Math.min(2, mixedAudio.numberOfChannels);
    ch0 = mixedAudio.getChannelData(0);
    ch1 = audioChannels > 1 ? mixedAudio.getChannelData(1) : ch0;
    totalAudioFrames = ch0.length;

    const aacConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      numberOfChannels: audioChannels,
      sampleRate: audioSampleRate,
      bitrate: 128_000,
    };

    let isAacSupported = false;
    try {
      if (typeof AudioEncoder.isConfigSupported === 'function') {
        const support = await AudioEncoder.isConfigSupported(aacConfig);
        isAacSupported = !!support.supported;
      } else {
        isAacSupported = true;
      }
    } catch (_) {
      isAacSupported = true;
    }

    if (isAacSupported) {
      audioMuxerConfig = {
        codec: 'aac',
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
      };
    }
  }

  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: targetWidth,
      height: targetHeight,
    },
    audio: audioMuxerConfig,
    fastStart: 'in-memory',
  });

  if (audioMuxerConfig && mixedAudio) {
    try {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          const rawDuration = chunk.duration;
          const fallbackDuration = Math.round((audioChunkSize / audioSampleRate) * 1_000_000);
          const duration =
            rawDuration !== null &&
            rawDuration !== undefined &&
            Number.isFinite(rawDuration) &&
            rawDuration > 0
              ? rawDuration
              : fallbackDuration;

          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp, duration, meta);
        },
        error: (e) => console.error('AudioEncoder error:', e),
      });

      await audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
        bitrate: 128_000,
      });
    } catch (err) {
      console.warn('Failed to configure AudioEncoder for AAC:', err);
      try {
        if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      } catch (_) {}
      audioEncoder = null;
    }
  }

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e),
  });

  await videoEncoder.configure({
    codec: 'avc1.4d002a', // Main Profile Level 4.2
    width: targetWidth,
    height: targetHeight,
    bitrate: targetWidth >= 1920 ? 8_000_000 : 4_000_000,
    framerate: fps,
  });

  const encodeAudioUpTo = (targetTimestampMicros: number) => {
    if (!audioEncoder || audioEncoder.state !== 'configured' || !ch0 || !ch1) return;

    while (nextAudioOffset < totalAudioFrames) {
      const chunkTimestampMicros = Math.round((nextAudioOffset / audioSampleRate) * 1_000_000);
      if (chunkTimestampMicros > targetTimestampMicros) {
        break;
      }

      const framesInChunk = Math.min(audioChunkSize, totalAudioFrames - nextAudioOffset);
      const planarData = new Float32Array(audioChunkSize * audioChannels);
      planarData.set(ch0.subarray(nextAudioOffset, nextAudioOffset + framesInChunk), 0);
      if (audioChannels > 1) {
        planarData.set(ch1.subarray(nextAudioOffset, nextAudioOffset + framesInChunk), audioChunkSize);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioSampleRate,
        numberOfFrames: audioChunkSize,
        numberOfChannels: audioChannels,
        timestamp: chunkTimestampMicros,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();
      nextAudioOffset += audioChunkSize;
    }
  };

  // Canvases: project composition canvas and target export canvas
  const compCanvas = document.createElement('canvas');
  compCanvas.width = project.width;
  compCanvas.height = project.height;
  const compCtx = compCanvas.getContext('2d')!;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const exportCtx = exportCanvas.getContext('2d')!;

  const needsScaling = targetWidth !== project.width || targetHeight !== project.height;

  // Render each video frame with interleaved audio
  for (let f = 0; f < totalFrames; f++) {
    if (checkCancelled && checkCancelled()) {
      videoEncoder.close();
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
      throw new Error('Export cancelled by user');
    }

    const time = f / fps;
    const nextFrameTimeMicros = Math.round(((f + 1) / fps) * 1_000_000);

    // Interleave audio encoding up to this video frame
    encodeAudioUpTo(nextFrameTimeMicros);

    const progressPct = 5 + Math.round((f / totalFrames) * 90);
    onProgress?.({
      frame: f + 1,
      totalFrames,
      percentage: progressPct,
      status: `Rendering frame ${f + 1}/${totalFrames}`,
    });

    await renderCompositionFrame(compCtx, {
      canvas: compCanvas,
      project,
      time,
      assets,
      mouthSets,
      showCheckerboard: false,
    });

    let frameSourceCanvas: HTMLCanvasElement;
    if (needsScaling) {
      exportCtx.clearRect(0, 0, targetWidth, targetHeight);
      exportCtx.drawImage(compCanvas, 0, 0, targetWidth, targetHeight);
      frameSourceCanvas = exportCanvas;
    } else {
      frameSourceCanvas = compCanvas;
    }

    const frameTimestamp = Math.round((f / fps) * 1_000_000); // microseconds
    const videoFrame = new VideoFrame(frameSourceCanvas, {
      timestamp: frameTimestamp,
      duration: Math.round((1 / fps) * 1_000_000),
    });

    const isKeyframe = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();
  }

  // Encode remaining audio up to end of video
  if (audioEncoder && audioEncoder.state === 'configured') {
    encodeAudioUpTo(Infinity);
    await audioEncoder.flush();
    audioEncoder.close();
  }

  onProgress?.({ frame: totalFrames, totalFrames, percentage: 96, status: 'Finalizing MP4 file...' });
  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const buffer = muxerTarget.buffer;
  return new Blob([buffer], { type: 'video/mp4' });
}

/**
 * Universal fallback using Canvas MediaRecorder (supports WebM / MP4 depending on browser).
 */
async function exportWithMediaRecorder(
  project: EditorProject,
  assets: Map<string, EditorAsset>,
  mouthSets: Map<string, MouthSetAsset>,
  targetWidth: number,
  targetHeight: number,
  fps: number,
  onProgress?: (p: ExportProgress) => void,
  checkCancelled?: () => boolean
): Promise<Blob> {
  const compCanvas = document.createElement('canvas');
  compCanvas.width = project.width;
  compCanvas.height = project.height;
  const compCtx = compCanvas.getContext('2d')!;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const exportCtx = exportCanvas.getContext('2d')!;

  const needsScaling = targetWidth !== project.width || targetHeight !== project.height;
  const stream = exportCanvas.captureStream(fps);

  // Mix audio if available
  const mixedAudio = await mixProjectAudio(project, assets, 44100);
  let audioCtx: AudioContext | null = null;
  if (mixedAudio) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const dest = audioCtx.createMediaStreamDestination();
        const src = audioCtx.createBufferSource();
        src.buffer = mixedAudio;
        src.connect(dest);
        src.start();
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch (e) {
      console.warn('Could not attach audio to MediaRecorder stream:', e);
    }
  }

  const mimeType = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs=avc1,aac',
    'video/mp4',
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
    'video/webm',
  ].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  const recordedChunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const totalFrames = Math.ceil(project.duration * fps);
  recorder.start();

  for (let f = 0; f < totalFrames; f++) {
    if (checkCancelled && checkCancelled()) {
      recorder.stop();
      if (audioCtx) audioCtx.close().catch(() => {});
      throw new Error('Export cancelled by user');
    }

    const time = f / fps;
    const pct = Math.round((f / totalFrames) * 95);
    onProgress?.({
      frame: f + 1,
      totalFrames,
      percentage: pct,
      status: `Capturing frame ${f + 1}/${totalFrames}`,
    });

    await renderCompositionFrame(compCtx, {
      canvas: compCanvas,
      project,
      time,
      assets,
      mouthSets,
      showCheckerboard: false,
    });

    if (needsScaling) {
      exportCtx.clearRect(0, 0, targetWidth, targetHeight);
      exportCtx.drawImage(compCanvas, 0, 0, targetWidth, targetHeight);
    } else {
      exportCtx.clearRect(0, 0, targetWidth, targetHeight);
      exportCtx.drawImage(compCanvas, 0, 0);
    }

    // Wait 1 frame duration
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      if (audioCtx) audioCtx.close().catch(() => {});
      const finalBlob = new Blob(recordedChunks, { type: mimeType });
      resolve(finalBlob);
    };
    recorder.stop();
  });
}

/**
 * Calculates target export dimensions preserving the project's exact aspect ratio
 * and ensuring even pixel dimensions required by H.264/AVC encoders.
 */
export function calculateExportDimensions(
  projectWidth: number,
  projectHeight: number,
  resolution: '720p' | '1080p'
): { targetWidth: number; targetHeight: number } {
  const baseDim = Math.min(projectWidth, projectHeight);
  const targetBase = resolution === '720p' ? 720 : 1080;
  const scale = targetBase / baseDim;

  let targetWidth = Math.round(projectWidth * scale);
  let targetHeight = Math.round(projectHeight * scale);

  if (targetWidth % 2 !== 0) targetWidth += 1;
  if (targetHeight % 2 !== 0) targetHeight += 1;

  return { targetWidth, targetHeight };
}

/**
 * Main Video Export entrypoint.
 * Automatically selects WebCodecs + mp4-muxer for high quality MP4,
 * or falls back safely to MediaRecorder.
 */
export async function exportProjectVideo(
  project: EditorProject,
  assets: Map<string, EditorAsset>,
  mouthSets: Map<string, MouthSetAsset>,
  settings: ExportSettings,
  onProgress?: (p: ExportProgress) => void,
  checkCancelled?: () => boolean
): Promise<{ blob: Blob; filename: string }> {
  // Proportional resolution calculation preserving project aspect ratio
  const { targetWidth, targetHeight } = calculateExportDimensions(
    project.width,
    project.height,
    settings.resolution
  );

  const fps = settings.fps || 30;

  let blob: Blob;
  let ext = 'mp4';

  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  if (hasWebCodecs) {
    try {
      blob = await exportWithWebCodecs(
        project,
        assets,
        mouthSets,
        targetWidth,
        targetHeight,
        fps,
        onProgress,
        checkCancelled
      );
    } catch (err) {
      console.warn('WebCodecs export failed, falling back to MediaRecorder:', err);
      blob = await exportWithMediaRecorder(
        project,
        assets,
        mouthSets,
        targetWidth,
        targetHeight,
        fps,
        onProgress,
        checkCancelled
      );
      ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    }
  } else {
    blob = await exportWithMediaRecorder(
      project,
      assets,
      mouthSets,
      targetWidth,
      targetHeight,
      fps,
      onProgress,
      checkCancelled
    );
    ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Cartoon_Speaks_V2';
  const filename = `${safeName}_${settings.resolution}_${fps}fps.${ext}`;

  onProgress?.({
    frame: Math.ceil(project.duration * fps),
    totalFrames: Math.ceil(project.duration * fps),
    percentage: 100,
    status: 'Export complete!',
  });

  return { blob, filename };
}

/**
 * Automatically triggers a browser download for a Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
