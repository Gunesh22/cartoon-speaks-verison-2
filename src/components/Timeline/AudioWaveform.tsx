import React, { useEffect, useState, useRef } from 'react';
import { AudioClip } from '../../types/timeline';
import { EditorAsset } from '../../types/assets';
import { audioEngine } from '../../core/audio/audioEngine';
import { getCachedPeaks } from '../../core/audio/waveformGenerator';

interface AudioWaveformProps {
  clip: AudioClip;
  asset?: EditorAsset;
  width: number;
  height?: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  clip,
  asset,
  width,
  height = 28,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadPeaks() {
      if (!asset) {
        setPeaks(null);
        return;
      }
      try {
        let buffer = audioEngine.getAudioBuffer(asset.id);
        if (!buffer) {
          buffer = await audioEngine.loadAudioBuffer(asset.id, asset.blob, asset.url);
        }
        if (buffer && !isCancelled) {
          const extracted = getCachedPeaks(asset.id, buffer);
          setPeaks(extracted);
        }
      } catch (_) {
        if (!isCancelled) setPeaks(null);
      }
    }

    loadPeaks();
    return () => {
      isCancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const totalDuration = asset?.duration || clip.duration;
    if (!canvas || !peaks || !totalDuration || totalDuration <= 0 || width <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    const trimStart = clip.trimStart || 0;
    const trimEnd = clip.trimEnd || trimStart + clip.duration;
    const clipDur = Math.max(0.01, trimEnd - trimStart);

    // Number of vertical waveform bars to draw across width
    const barWidth = 2;
    const barGap = 1;
    const totalBars = Math.max(4, Math.floor(width / (barWidth + barGap)));

    ctx.fillStyle = 'rgba(254, 215, 170, 0.45)'; // Amber/gold highlight

    for (let i = 0; i < totalBars; i++) {
      const barTime = trimStart + (i / totalBars) * clipDur;
      const peakIndex = Math.min(
        peaks.length - 1,
        Math.max(0, Math.floor((barTime / totalDuration) * peaks.length))
      );
      const amp = peaks[peakIndex] || 0.05;
      const barHeight = Math.max(2, Math.round(amp * (height - 4)));
      const x = i * (barWidth + barGap);
      const y = Math.round((height - barHeight) / 2);

      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [peaks, clip, width, height, asset]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(width)}
      height={height}
      className="absolute inset-0 pointer-events-none opacity-70"
    />
  );
};
