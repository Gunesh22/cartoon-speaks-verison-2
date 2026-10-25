/**
 * Audio Waveform Peak Extractor (Feature 06)
 * Generates lightweight, cached waveform peaks from AudioBuffers for timeline visualization.
 * 100% native Web Audio API, zero external dependencies.
 */

const peakCache = new Map<string, Float32Array>();

/**
 * Extracts normalized peak amplitudes (0..1) from an AudioBuffer.
 * Samples the buffer into `samplesPerSecond` peaks (default 20 points per second).
 */
export function extractWaveformPeaks(
  audioBuffer: AudioBuffer,
  samplesPerSecond: number = 20
): Float32Array {
  const channelData = audioBuffer.getChannelData(0); // Left channel or mono
  const totalSamples = channelData.length;
  const duration = audioBuffer.duration;
  const numPeaks = Math.max(10, Math.ceil(duration * samplesPerSecond));
  const blockSize = Math.floor(totalSamples / numPeaks);

  const peaks = new Float32Array(numPeaks);

  for (let i = 0; i < numPeaks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, totalSamples);
    let max = 0;

    for (let j = start; j < end; j++) {
      const val = Math.abs(channelData[j]);
      if (val > max) {
        max = val;
      }
    }
    peaks[i] = Number(Math.min(1, max).toFixed(3));
  }

  return peaks;
}

/**
 * Retrieves or extracts cached waveform peaks for an asset.
 */
export function getCachedPeaks(
  assetId: string,
  audioBuffer?: AudioBuffer
): Float32Array | null {
  if (peakCache.has(assetId)) {
    return peakCache.get(assetId)!;
  }
  if (!audioBuffer) {
    return null;
  }
  const peaks = extractWaveformPeaks(audioBuffer);
  peakCache.set(assetId, peaks);
  return peaks;
}

/**
 * Clears waveform cache for a specific asset or all assets.
 */
export function clearWaveformCache(assetId?: string): void {
  if (assetId) {
    peakCache.delete(assetId);
  } else {
    peakCache.clear();
  }
}
