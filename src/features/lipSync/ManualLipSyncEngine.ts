import { MouthCue, DEFAULT_LIPSYNC_TUNING, LipSyncTuningSettings } from '../../types/lipSync';
import { TimelineCue, buildSpeechTimelineCues } from './phoneticAligner';

export interface LipSyncOptions {
  recognizer?: 'pocketSphinx' | 'phonetic';
  dialogText?: string;
  extendedShapes?: boolean;
  tuning?: LipSyncTuningSettings;
}

function generateId(prefix: string = 'cue'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
}

export class ManualLipSyncEngine {
  readonly id = 'browser-phonetic';
  readonly name = 'Browser Phonetic & Energy Aligner';
  readonly description = 'Generates speech-aligned mouth cues directly in-browser using audio energy envelope and dialogue phonetics';

  async isAvailable(): Promise<boolean> {
    return true; // Always available in any modern browser
  }

  async generateLipSync(
    audioBlob: Blob,
    scriptText: string,
    duration: number,
    options?: LipSyncOptions
  ): Promise<{ cues: MouthCue[]; duration: number }> {
    if (duration <= 0) {
      return {
        duration: 1.0,
        cues: [
          { id: generateId('cue'), start: 0, end: 1.0, mouthId: 'X', shape: 'X' },
        ],
      };
    }

    const tuning: LipSyncTuningSettings = options?.tuning || DEFAULT_LIPSYNC_TUNING;

    // Step 1: Detect speech intervals and silence intervals from offline audio envelope
    let speechIntervals: Array<{ start: number; end: number }> = [];
    let silenceIntervals: Array<{ start: number; end: number }> = [];

    try {
      const detected = await this.detectAudioIntervals(audioBlob, duration);
      speechIntervals = detected.speechIntervals;
      silenceIntervals = detected.silenceIntervals;
    } catch {
      // Fallback if audio decode fails: speech from 0.1s to duration - 0.1s
      speechIntervals = [{ start: 0.1, end: Math.max(0.2, duration - 0.1) }];
      silenceIntervals = [];
    }

    if (speechIntervals.length === 0) {
      speechIntervals = [{ start: 0.1, end: Math.max(0.2, duration - 0.1) }];
    }

    // Step 2: Extract words from script
    const words = scriptText
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);

    // Step 3: Build timed, phoneme-based timeline cues with duration safeguards
    const rawCues = buildSpeechTimelineCues(words, speechIntervals, duration, tuning, silenceIntervals);
    const cues: MouthCue[] = rawCues.map((c) => ({
      id: c.id,
      start: c.start,
      end: c.end,
      mouthId: c.mouthId || c.shape || 'X',
      shape: c.shape || c.mouthId || 'X',
      text: c.text,
      phoneme: c.phoneme,
      ipa: c.ipa,
      source: c.source,
    }));

    return {
      duration,
      cues,
    };
  }

  /**
   * Offline audio analysis at 20ms resolution (50 Hz).
   * Identifies speech activity and genuine silence intervals.
   */
  private async detectAudioIntervals(
    audioBlob: Blob,
    duration: number
  ): Promise<{
    speechIntervals: Array<{ start: number; end: number }>;
    silenceIntervals: Array<{ start: number; end: number }>;
  }> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const ctx = OfflineCtx
      ? new OfflineCtx(1, 1, 44100)
      : new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if ('close' in ctx && typeof ctx.close === 'function') {
      await ctx.close().catch(() => {});
    }

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms analysis window
    const numWindows = Math.floor(channelData.length / windowSize);

    if (numWindows === 0) {
      return {
        speechIntervals: [{ start: 0, end: duration }],
        silenceIntervals: [],
      };
    }

    // Calculate RMS energy per 20ms window
    const energies: number[] = [];
    let maxEnergy = 0;
    for (let w = 0; w < numWindows; w++) {
      let sumSquares = 0;
      const start = w * windowSize;
      for (let s = 0; s < windowSize; s++) {
        const val = channelData[start + s];
        sumSquares += val * val;
      }
      const rms = Math.sqrt(sumSquares / windowSize);
      energies.push(rms);
      if (rms > maxEnergy) maxEnergy = rms;
    }

    // Determine adaptive noise floor and speech threshold
    const sortedEnergies = [...energies].sort((a, b) => a - b);
    const noiseFloor = sortedEnergies[Math.floor(sortedEnergies.length * 0.15)] || 0.002;
    const threshold = Math.max(0.008, Math.min(maxEnergy * 0.12, noiseFloor * 2.5));

    // Raw speech intervals
    const rawIntervals: Array<{ start: number; end: number }> = [];
    let inSpeech = false;
    let segStart = 0;

    for (let w = 0; w < numWindows; w++) {
      const isAbove = energies[w] > threshold;
      const time = (w * windowSize) / sampleRate;

      if (!inSpeech && isAbove) {
        inSpeech = true;
        segStart = time;
      } else if (inSpeech && !isAbove) {
        inSpeech = false;
        if (time - segStart >= 0.05) {
          rawIntervals.push({ start: segStart, end: time });
        }
      }
    }

    if (inSpeech) {
      rawIntervals.push({ start: segStart, end: duration });
    }

    // Merge only micro-dips (< 80ms) typical of consonant closures
    // Real pauses (>= 80ms) remain separated so silence 'X' can be placed
    const speechIntervals: Array<{ start: number; end: number }> = [];
    for (const seg of rawIntervals) {
      const prev = speechIntervals[speechIntervals.length - 1];
      if (prev && seg.start - prev.end < 0.08) {
        prev.end = seg.end;
      } else {
        speechIntervals.push({ ...seg });
      }
    }

    // Derive silence intervals between speech bursts
    const silenceIntervals: Array<{ start: number; end: number }> = [];
    let currentPos = 0;
    for (const speech of speechIntervals) {
      if (speech.start - currentPos >= 0.12) {
        silenceIntervals.push({ start: currentPos, end: speech.start });
      }
      currentPos = speech.end;
    }
    if (duration - currentPos >= 0.12) {
      silenceIntervals.push({ start: currentPos, end: duration });
    }

    return {
      speechIntervals: speechIntervals.length > 0 ? speechIntervals : [{ start: 0, end: duration }],
      silenceIntervals,
    };
  }
}

export const manualLipSyncEngine = new ManualLipSyncEngine();
