import { MouthCue, LipSyncTuningSettings, DEFAULT_LIPSYNC_TUNING } from '../../types/lipSync';
import { sanitizeCues, rhubarbAdapter } from './rhubarbAdapter';
import { manualLipSyncEngine } from './ManualLipSyncEngine';

// Phonetic viseme mapping for English letters & common diphthongs
const CHAR_TO_VISEME: Record<string, string> = {
  m: 'A', b: 'A', p: 'A',
  s: 'B', z: 'B', d: 'B', t: 'B', n: 'B', r: 'B',
  e: 'C', k: 'C', g: 'C', y: 'C', i: 'C',
  a: 'D', h: 'D',
  o: 'E',
  f: 'F', v: 'F',
  j: 'G', c: 'G',
  l: 'H',
  u: 'E', w: 'E',
};

/**
 * Maps a single word to a natural sequence of viseme shapes with weights.
 */
export function wordToVisemes(word: string): Array<{ shape: string; weight: number }> {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return [{ shape: 'X', weight: 1.0 }];

  // Common high frequency words
  if (clean === 'the') return [{ shape: 'H', weight: 0.4 }, { shape: 'C', weight: 0.6 }];
  if (clean === 'and') return [{ shape: 'D', weight: 0.5 }, { shape: 'B', weight: 0.5 }];
  if (clean === 'to') return [{ shape: 'B', weight: 0.3 }, { shape: 'E', weight: 0.7 }];
  if (clean === 'in' || clean === 'is' || clean === 'it') return [{ shape: 'C', weight: 0.5 }, { shape: 'B', weight: 0.5 }];
  if (clean === 'you') return [{ shape: 'C', weight: 0.3 }, { shape: 'E', weight: 0.7 }];
  if (clean === 'that') return [{ shape: 'H', weight: 0.3 }, { shape: 'D', weight: 0.4 }, { shape: 'B', weight: 0.3 }];
  if (clean === 'hello') return [{ shape: 'C', weight: 0.2 }, { shape: 'D', weight: 0.3 }, { shape: 'H', weight: 0.2 }, { shape: 'E', weight: 0.3 }];
  if (clean === 'hi' || clean === 'hey') return [{ shape: 'D', weight: 0.6 }, { shape: 'C', weight: 0.4 }];

  const shapes: string[] = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const nextCh = clean[i + 1];

    if (ch === 't' && nextCh === 'h') {
      shapes.push('H');
      i++;
    } else if (ch === 's' && nextCh === 'h') {
      shapes.push('G');
      i++;
    } else if (ch === 'c' && nextCh === 'h') {
      shapes.push('G');
      i++;
    } else if (ch === 'e' && nextCh === 'e') {
      shapes.push('B');
      i++;
    } else if (ch === 'o' && nextCh === 'o') {
      shapes.push('E');
      i++;
    } else {
      shapes.push(CHAR_TO_VISEME[ch] || 'C');
    }
  }

  // Deduplicate consecutive identical shapes
  const filtered: string[] = [];
  for (const s of shapes) {
    if (filtered.length === 0 || filtered[filtered.length - 1] !== s) {
      filtered.push(s);
    }
  }

  if (filtered.length === 0) return [{ shape: 'X', weight: 1.0 }];

  const weight = 1.0 / filtered.length;
  return filtered.map((shape) => ({ shape, weight }));
}

/**
 * Analyzes audio amplitude to detect speech vs silence intervals.
 */
export async function detectSpeechIntervals(
  audioBlob: Blob,
  fallbackDuration: number
): Promise<{ speech: Array<{ start: number; end: number }>; totalDuration: number }> {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return {
        speech: [{ start: 0.1, end: Math.max(0.2, fallbackDuration - 0.1) }],
        totalDuration: fallbackDuration,
      };
    }

    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration || fallbackDuration;

    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = Math.floor(sampleRate * 0.04); // 40ms window
    const numWindows = Math.floor(data.length / windowSize);

    // Calculate RMS energy per window
    const rmsValues: number[] = new Array(numWindows);
    let maxRms = 0;
    for (let i = 0; i < numWindows; i++) {
      let sum = 0;
      const offset = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        const val = data[offset + j];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / windowSize);
      rmsValues[i] = rms;
      if (rms > maxRms) maxRms = rms;
    }

    ctx.close().catch(() => {});

    const threshold = Math.max(0.015, maxRms * 0.15);
    const speech: Array<{ start: number; end: number }> = [];
    let inSpeech = false;
    let segStart = 0;

    for (let i = 0; i < numWindows; i++) {
      const time = (i * windowSize) / sampleRate;
      const isVoice = rmsValues[i] >= threshold;

      if (isVoice && !inSpeech) {
        inSpeech = true;
        segStart = time;
      } else if (!isVoice && inSpeech) {
        inSpeech = false;
        if (time - segStart > 0.08) {
          speech.push({ start: segStart, end: time });
        }
      }
    }

    if (inSpeech && duration - segStart > 0.08) {
      speech.push({ start: segStart, end: duration });
    }

    if (speech.length === 0) {
      speech.push({ start: 0.1, end: Math.max(0.2, duration - 0.1) });
    }

    return { speech, totalDuration: duration };
  } catch {
    return {
      speech: [{ start: 0.1, end: Math.max(0.2, fallbackDuration - 0.1) }],
      totalDuration: fallbackDuration,
    };
  }
}

/**
 * Applies tuning settings (minimum duration filter, transition smoothness, speed adjustments) to generated cues.
 */
export function applyTuningToCues(cues: MouthCue[], totalDuration: number, tuning: LipSyncTuningSettings): MouthCue[] {
  if (cues.length === 0) return cues;

  const minDurationSec = Math.max(0.04, (tuning.minDurationMs || 90) / 1000);
  const result: MouthCue[] = [];

  // 1. Min duration pass: merge very short non-rest cues with previous or next cue
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const dur = cue.end - cue.start;

    if (dur < minDurationSec && cue.mouthId !== 'X') {
      if (result.length > 0) {
        // Extend previous cue to cover this short blip
        result[result.length - 1].end = cue.end;
        continue;
      } else if (i + 1 < cues.length) {
        // Extend next cue backwards
        cues[i + 1].start = cue.start;
        continue;
      }
    }
    result.push({ ...cue });
  }

  // 2. Smoothness pass for 'high' smoothness
  if (tuning.smoothness === 'high' && result.length >= 3) {
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];

      // If sandwiched between identical shapes and very brief, absorb it
      if (prev.mouthId === next.mouthId && curr.mouthId !== 'X' && (curr.end - curr.start) < 0.12) {
        prev.end = next.end;
        result.splice(i, 2);
        i--;
      }
    }
  }

  return sanitizeCues(result);
}

/**
 * Generates lip-sync cues from audio and dialogue text using the browser engine.
 * Leverages ManualLipSyncEngine (full phonetic dictionary + 20ms audio energy envelope analysis).
 */
export async function generateLipSyncInBrowser(
  audioBlob: Blob,
  dialogueText: string,
  audioDuration: number,
  tuning: LipSyncTuningSettings = DEFAULT_LIPSYNC_TUNING
): Promise<{ cues: MouthCue[]; duration: number }> {
  try {
    const result = await manualLipSyncEngine.generateLipSync(
      audioBlob,
      dialogueText,
      audioDuration,
      { tuning }
    );
    if (result && result.cues && result.cues.length > 0) {
      return result;
    }
  } catch (err) {
    console.warn('ManualLipSyncEngine acoustic aligner failed, using fallback:', err);
  }

  const { speech, totalDuration } = await detectSpeechIntervals(audioBlob, audioDuration);
  const words = dialogueText.trim().split(/\s+/).filter((w) => w.length > 0);

  const cues: MouthCue[] = [];
  const duration = Math.max(totalDuration, audioDuration);

  // If there's an initial silence before the first speech segment
  if (speech.length > 0 && speech[0].start > 0.05) {
    cues.push({
      id: `cue_init_${Date.now()}`,
      start: 0,
      end: speech[0].start,
      mouthId: 'X',
    });
  }

  if (words.length === 0) {
    // When no words are typed, modulate open/closed shapes along speech intervals
    for (let i = 0; i < speech.length; i++) {
      const seg = speech[i];
      const mid = (seg.start + seg.end) / 2;
      cues.push({ id: `c_${i}_1`, start: seg.start, end: mid, mouthId: 'C' });
      cues.push({ id: `c_${i}_2`, start: mid, end: seg.end, mouthId: 'B' });

      const nextSeg = speech[i + 1];
      const gapEnd = nextSeg ? nextSeg.start : duration;
      if (gapEnd - seg.end > 0.05) {
        cues.push({ id: `gap_${i}`, start: seg.end, end: gapEnd, mouthId: 'X' });
      }
    }
  } else {
    // Distribute words across speech intervals
    const totalSpeechTime = speech.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    let wordIdx = 0;

    for (let sIdx = 0; sIdx < speech.length; sIdx++) {
      const seg = speech[sIdx];
      const segDur = seg.end - seg.start;
      const proportion = segDur / totalSpeechTime;
      const wordsForSeg = Math.max(1, Math.round(words.length * proportion));
      const segWords = words.slice(wordIdx, wordIdx + wordsForSeg);
      wordIdx += wordsForSeg;

      if (segWords.length === 0) {
        cues.push({ id: `seg_${sIdx}`, start: seg.start, end: seg.end, mouthId: 'B' });
      } else {
        const wordDur = segDur / segWords.length;
        for (let w = 0; w < segWords.length; w++) {
          const wStart = seg.start + w * wordDur;
          const visemes = wordToVisemes(segWords[w]);

          let visemeStart = wStart;
          for (let v = 0; v < visemes.length; v++) {
            const vDur = wordDur * visemes[v].weight;
            const vEnd = visemeStart + vDur;
            cues.push({
              id: `cue_${sIdx}_${w}_${v}`,
              start: visemeStart,
              end: vEnd,
              mouthId: visemes[v].shape,
            });
            visemeStart = vEnd;
          }
        }
      }

      // Add rest cue between segments
      const nextSeg = speech[sIdx + 1];
      const gapEnd = nextSeg ? nextSeg.start : duration;
      if (gapEnd - seg.end > 0.04) {
        cues.push({ id: `gap_${sIdx}`, start: seg.end, end: gapEnd, mouthId: 'X' });
      }
    }
  }

  // Ensure trailing rest cue if needed
  const lastEnd = cues.length > 0 ? cues[cues.length - 1].end : 0;
  if (lastEnd < duration) {
    cues.push({ id: `cue_end_${Date.now()}`, start: lastEnd, end: duration, mouthId: 'X' });
  }

  const tunedCues = applyTuningToCues(cues, duration, tuning);
  return { duration, cues: sanitizeCues(tunedCues) };
}

/**
 * Unified Lip-Sync Generator:
 * Tries local Rhubarb companion if available; falls back smoothly to in-browser engine.
 */
export async function generateLipSyncCues(
  audioBlob: Blob,
  dialogueText: string,
  audioDuration: number,
  tuning: LipSyncTuningSettings = DEFAULT_LIPSYNC_TUNING
): Promise<{ cues: MouthCue[]; duration: number; source: 'rhubarb' | 'browser' }> {
  const isCompanionUp = await rhubarbAdapter.checkCompanionHealth();
  if (isCompanionUp) {
    try {
      const result = await rhubarbAdapter.generateWithCompanion(audioBlob, dialogueText);
      const tunedCues = applyTuningToCues(result.cues, result.duration, tuning);
      return { cues: tunedCues, duration: result.duration, source: 'rhubarb' };
    } catch (e) {
      console.warn('Rhubarb companion failed, falling back to browser aligner:', e);
    }
  }

  const result = await generateLipSyncInBrowser(audioBlob, dialogueText, audioDuration, tuning);
  return { ...result, source: 'browser' };
}
