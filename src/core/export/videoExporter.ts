import { EditorProject } from '../../types/project';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { renderCompositionFrame } from '../renderer/canvasRenderer';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { audioEngine } from '../audio/audioEngine';
import { calculateProjectDuration } from '../timeline/timelineMath';

export interface ExportSettings {
  resolution: '720p' | '1080p';
  fps: number;
  format?: 'mp4' | 'webm-alpha';
  transparent?: boolean;
  range?: { start: number; end: number };
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percentage: number;
  status: string;
}

/**
 * Mixes all project audio clips into a single AudioBuffer using OfflineAudioContext.
 * Supports exporting specific In/Out range (Feature 15).
 */
export async function mixProjectAudio(
  project: EditorProject,
  assets: Map<string, EditorAsset>,
  sampleRate: number = 44100,
  range?: { start: number; end: number }
): Promise<AudioBuffer | null> {
  const rangeStart = range ? Math.max(0, range.start) : 0;
  const effectiveMax = calculateProjectDuration(project.tracks, project.audioClips, project.duration);
  const rangeEnd = range ? Math.min(effectiveMax, range.end) : effectiveMax;
  const rangeDuration = Math.max(0, rangeEnd - rangeStart);

  if (rangeDuration <= 0) {
    return null;
  }

  interface AudioScheduleItem {
    assetId: string;
    start: number;
    duration: number;
    volume: number;
    trimStart: number;
    clipDuration: number;
    clipTimeStart: number;
    clipTimeEnd: number;
    fadeIn?: number;
    fadeOut?: number;
  }

  const schedule: AudioScheduleItem[] = [];
  const trackSettings = project.audioTrackSettings;
  const hasSolo = !!(trackSettings?.A1?.solo || trackSettings?.A2?.solo);

  // 1. Gather all explicit audio clips from the timeline
  // Strict WYSIWYG: project.audioClips is the single authoritative source of truth for audio.
  for (const clip of project.audioClips) {
    const trackId = clip.trackId || 'A1';
    const conf = trackSettings?.[trackId];
    if (hasSolo) {
      if (!conf?.solo) continue;
    } else if (conf?.muted) {
      continue;
    }

    const clipEnd = clip.start + clip.duration;
    if (clipEnd <= rangeStart || clip.start >= rangeEnd) {
      // Audio clip is outside requested export range
      continue;
    }

    const overlapStart = Math.max(clip.start, rangeStart);
    const overlapEnd = Math.min(clipEnd, rangeEnd);
    const scheduledStart = overlapStart - rangeStart;
    const scheduledDuration = overlapEnd - overlapStart;
    const offsetFromClipStart = overlapStart - clip.start;
    const scheduledTrimStart = (clip.trimStart ?? 0) + offsetFromClipStart;
    const clipTimeStart = offsetFromClipStart;
    const clipTimeEnd = overlapEnd - clip.start;
    const trackVol = conf?.volume ?? 1.0;
    const effectiveVolume = (clip.volume ?? 1) * trackVol;

    schedule.push({
      assetId: clip.assetId,
      start: scheduledStart,
      duration: scheduledDuration,
      volume: effectiveVolume,
      trimStart: scheduledTrimStart,
      clipDuration: clip.duration,
      clipTimeStart,
      clipTimeEnd,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
    });
  }

  if (schedule.length === 0) {
    return null;
  }

  const lengthSamples = Math.max(1, Math.ceil(rangeDuration * sampleRate));
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
      const targetVol = Math.max(0, Math.min(1, item.volume));
      gain.gain.value = targetVol;

      const startOnTimeline = Math.max(0, item.start);
      const offset = Math.max(0, item.trimStart);
      const remainingInBuffer = Math.max(0, decoded.duration - offset);
      const duration = Math.min(item.duration, remainingInBuffer);

      // Apply Fade In / Fade Out Envelopes with exact range-boundary slicing
      const clipFadeIn = Math.min(item.clipDuration / 2, Math.max(0, item.fadeIn || 0));
      const clipFadeOut = Math.min(item.clipDuration / 2, Math.max(0, item.fadeOut || 0));
      const clipFadeOutStart = item.clipDuration - clipFadeOut;

      // 1. Initial gain at startOnTimeline
      let initialGain = targetVol;
      if (clipFadeIn > 0 && item.clipTimeStart < clipFadeIn) {
        initialGain = (item.clipTimeStart / clipFadeIn) * targetVol;
      }
      if (typeof gain.gain.setValueAtTime === 'function') {
        gain.gain.setValueAtTime(initialGain, startOnTimeline);
      }

      // 2. Fade-in ramp if range intersects the fade-in region
      if (clipFadeIn > 0 && item.clipTimeStart < clipFadeIn) {
        const rampDuration = Math.min(duration, clipFadeIn - item.clipTimeStart);
        if (rampDuration > 0 && typeof gain.gain.linearRampToValueAtTime === 'function') {
          const reachedGain = ((item.clipTimeStart + rampDuration) / clipFadeIn) * targetVol;
          gain.gain.linearRampToValueAtTime(reachedGain, startOnTimeline + rampDuration);
        }
      }

      // 3. Fade-out ramp if range intersects the fade-out region
      if (clipFadeOut > 0 && item.clipTimeEnd > clipFadeOutStart) {
        const fadeOutRampStartOffset = Math.max(0, clipFadeOutStart - item.clipTimeStart);
        const rampStartTime = startOnTimeline + fadeOutRampStartOffset;
        if (fadeOutRampStartOffset > 0 && typeof gain.gain.setValueAtTime === 'function') {
          gain.gain.setValueAtTime(targetVol, rampStartTime);
        }
        if (typeof gain.gain.linearRampToValueAtTime === 'function') {
          const endGain = Math.max(0, (item.clipDuration - item.clipTimeEnd) / clipFadeOut) * targetVol;
          gain.gain.linearRampToValueAtTime(endGain, startOnTimeline + duration);
        }
      }

      source.connect(gain);
      gain.connect(offlineCtx.destination);

      if (duration > 0 && startOnTimeline < rangeDuration) {
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
  range?: { start: number; end: number },
  onProgress?: (p: ExportProgress) => void,
  checkCancelled?: () => boolean
): Promise<Blob> {
  const muxerTarget = new ArrayBufferTarget();
  const rangeStart = range ? Math.max(0, range.start) : 0;
  const effectiveMax = calculateProjectDuration(project.tracks, project.audioClips, project.duration);
  const rangeEnd = range ? Math.min(effectiveMax, range.end) : effectiveMax;
  const rangeDuration = Math.max(0.05, rangeEnd - rangeStart);
  const totalFrames = Math.ceil(rangeDuration * fps);

  // Mix audio first
  onProgress?.({ frame: 0, totalFrames, percentage: 2, status: 'Mixing audio...' });
  const mixedAudio = await mixProjectAudio(project, assets, 44100, range);

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

    const time = rangeStart + f / fps;
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
  options?: {
    transparent?: boolean;
    format?: 'mp4' | 'webm-alpha';
    range?: { start: number; end: number };
  },
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

  const isAlphaWebm = options?.format === 'webm-alpha' || !!options?.transparent;
  const rangeStart = options?.range ? Math.max(0, options.range.start) : 0;
  const effectiveMax = calculateProjectDuration(project.tracks, project.audioClips, project.duration);
  const rangeEnd = options?.range ? Math.min(effectiveMax, options.range.end) : effectiveMax;
  const rangeDuration = Math.max(0.05, rangeEnd - rangeStart);

  const needsScaling = targetWidth !== project.width || targetHeight !== project.height;
  const stream = exportCanvas.captureStream(fps);

  // Mix audio if available
  const mixedAudio = await mixProjectAudio(project, assets, 44100, options?.range);
  let audioCtx: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  if (mixedAudio) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const dest = audioCtx.createMediaStreamDestination();
        audioSourceNode = audioCtx.createBufferSource();
        audioSourceNode.buffer = mixedAudio;
        audioSourceNode.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch (e) {
      console.warn('Could not attach audio to MediaRecorder stream:', e);
    }
  }

  let mimeType = 'video/webm';
  if (isAlphaWebm) {
    const supportedAlpha = typeof MediaRecorder !== 'undefined'
      ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'].find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;

    if (!supportedAlpha && typeof MediaRecorder !== 'undefined') {
      throw new Error(
        'Transparent video export requires VP9 or VP8 WebM encoding support in MediaRecorder, which is not supported in this browser. Please use Chrome, Brave, or Edge for transparent export.'
      );
    }
    mimeType = supportedAlpha || 'video/webm;codecs=vp9';
  } else {
    mimeType = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4;codecs=avc1,aac',
      'video/mp4',
      'video/webm;codecs="vp9,opus"',
      'video/webm;codecs="vp8,opus"',
      'video/webm',
    ].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || 'video/webm';
  }

  const recordedChunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const totalDurationMs = rangeDuration * 1000;
  const frameDurationMs = 1000 / fps;
  const totalFrames = Math.ceil(rangeDuration * fps);
  recorder.start();

  // Start real-time audio playback strictly in lockstep with recorder start
  if (audioSourceNode) {
    try {
      audioSourceNode.start(0);
    } catch (e) {
      console.warn('AudioSourceNode start failed:', e);
    }
  }

  const exportStartTime = performance.now();
  let frameCount = 0;

  while (true) {
    if (checkCancelled && checkCancelled()) {
      recorder.stop();
      if (audioSourceNode) {
        try { audioSourceNode.stop(); } catch (_) {}
      }
      if (audioCtx) audioCtx.close().catch(() => {});
      throw new Error('Export cancelled by user');
    }

    const elapsedMs = performance.now() - exportStartTime;
    if (elapsedMs >= totalDurationMs) {
      break;
    }

    // Visual composition timestamp is strictly locked to range
    const time = Math.min(rangeEnd, rangeStart + elapsedMs / 1000);
    frameCount++;

    const pct = Math.min(95, Math.round((elapsedMs / totalDurationMs) * 95));
    onProgress?.({
      frame: frameCount,
      totalFrames,
      percentage: pct,
      status: `Capturing frame ${frameCount}/${totalFrames}`,
    });

    await renderCompositionFrame(compCtx, {
      canvas: compCanvas,
      project,
      time,
      assets,
      mouthSets,
      showCheckerboard: false,
      transparent: isAlphaWebm,
    });

    if (needsScaling) {
      exportCtx.clearRect(0, 0, targetWidth, targetHeight);
      exportCtx.drawImage(compCanvas, 0, 0, targetWidth, targetHeight);
    } else {
      exportCtx.clearRect(0, 0, targetWidth, targetHeight);
      exportCtx.drawImage(compCanvas, 0, 0);
    }

    // Precise frame pacing against elapsed wall clock:
    // sleep remaining time until next frame deadline, preventing cumulative drift
    const nextTargetTime = exportStartTime + frameCount * frameDurationMs;
    const remainingWaitMs = nextTargetTime - performance.now();
    if (remainingWaitMs > 0) {
      await new Promise((r) => setTimeout(r, remainingWaitMs));
    }
  }

  // Render final frame at rangeEnd to ensure visual completeness
  await renderCompositionFrame(compCtx, {
    canvas: compCanvas,
    project,
    time: rangeEnd,
    assets,
    mouthSets,
    showCheckerboard: false,
    transparent: isAlphaWebm,
  });
  if (needsScaling) {
    exportCtx.clearRect(0, 0, targetWidth, targetHeight);
    exportCtx.drawImage(compCanvas, 0, 0, targetWidth, targetHeight);
  } else {
    exportCtx.clearRect(0, 0, targetWidth, targetHeight);
    exportCtx.drawImage(compCanvas, 0, 0);
  }
  await new Promise((r) => setTimeout(r, Math.max(20, Math.round(frameDurationMs / 2))));

  return new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      if (audioSourceNode) {
        try { audioSourceNode.stop(); } catch (_) {}
      }
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
 * or WebM with alpha for transparent video export, or falls back safely to MediaRecorder.
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
  const isTransparent = settings.format === 'webm-alpha' || !!settings.transparent;

  let blob: Blob;
  let ext = isTransparent ? 'webm' : 'mp4';

  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  if (!isTransparent && hasWebCodecs) {
    try {
      blob = await exportWithWebCodecs(
        project,
        assets,
        mouthSets,
        targetWidth,
        targetHeight,
        fps,
        settings.range,
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
        { transparent: isTransparent, format: settings.format, range: settings.range },
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
      { transparent: isTransparent, format: settings.format, range: settings.range },
      onProgress,
      checkCancelled
    );
    ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Cartoon_Speaks_V2';
  const rangeTag = settings.range
    ? `_range_${settings.range.start.toFixed(1)}s-${settings.range.end.toFixed(1)}s`
    : '';
  const alphaTag = isTransparent ? '_alpha' : '';
  const filename = `${safeName}_${settings.resolution}_${fps}fps${rangeTag}${alphaTag}.${ext}`;

  const rangeDuration = settings.range
    ? Math.max(0.05, settings.range.end - settings.range.start)
    : project.duration;
  const totalFrames = Math.ceil(rangeDuration * fps);

  onProgress?.({
    frame: totalFrames,
    totalFrames,
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
