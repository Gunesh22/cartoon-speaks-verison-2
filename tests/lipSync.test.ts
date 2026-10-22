import { describe, it, expect } from 'vitest';
import {
  parseRhubarbJson,
  parseRhubarbTsv,
  sanitizeCues,
  rhubarbAdapter,
} from '../src/features/lipSync/rhubarbAdapter';
import { wordToVisemes, applyTuningToCues } from '../src/features/lipSync/lipSyncGenerator';
import { MouthCue, DEFAULT_LIPSYNC_TUNING } from '../src/types/lipSync';

describe('Lip Sync Parsing and Generation Tests', () => {
  it('parses Rhubarb standard JSON output into normalized MouthCue objects', () => {
    const sampleJson = JSON.stringify({
      metadata: { duration: 2.5, soundFile: 'speech.wav' },
      mouthCues: [
        { start: 0.0, end: 0.25, value: 'X' },
        { start: 0.25, end: 0.8, value: 'B' },
        { start: 0.8, end: 1.6, value: 'C' },
        { start: 1.6, end: 2.5, value: 'A' },
      ],
    });

    const { duration, cues } = parseRhubarbJson(sampleJson);

    expect(duration).toBe(2.5);
    expect(cues.length).toBe(4);
    expect(cues[0].mouthId).toBe('X');
    expect(cues[0].start).toBe(0.0);
    expect(cues[0].end).toBe(0.25);
    expect(cues[1].mouthId).toBe('B');
    expect(cues[2].mouthId).toBe('C');
    expect(cues[3].mouthId).toBe('A');
  });

  it('parses Rhubarb TSV output format', () => {
    const sampleTsv = `0.00\t0.30\tX\n0.30\t0.75\tB\n0.75\t1.50\tD`;
    const { duration, cues } = parseRhubarbTsv(sampleTsv);

    expect(duration).toBe(1.5);
    expect(cues.length).toBe(3);
    expect(cues[0].mouthId).toBe('X');
    expect(cues[1].mouthId).toBe('B');
    expect(cues[2].mouthId).toBe('D');
  });

  it('sanitizes overlapping and out-of-order cues', () => {
    const messyCues: MouthCue[] = [
      { id: '1', start: 0.5, end: 1.2, mouthId: 'B' },
      { id: '2', start: 0.0, end: 0.8, mouthId: 'X' }, // Out of order and overlaps cue 1
      { id: '3', start: 1.5, end: 1.5, mouthId: 'C' }, // Zero duration
    ];

    const clean = sanitizeCues(messyCues);

    expect(clean.length).toBe(3);
    // Should be sorted by start
    expect(clean[0].id).toBe('2');
    expect(clean[0].start).toBe(0.0);
    // Overlap with cue 1 (start 0.5) must be truncated
    expect(clean[0].end).toBe(0.5);

    expect(clean[1].id).toBe('1');
    expect(clean[1].start).toBe(0.5);
    expect(clean[1].end).toBe(1.2);

    // Zero-duration cue should have non-zero duration
    expect(clean[2].end).toBeGreaterThan(clean[2].start);
  });

  it('maps words into appropriate articulatory visemes', () => {
    const visemesHello = wordToVisemes('hello');
    expect(visemesHello.length).toBeGreaterThan(0);
    const shapes = visemesHello.map((v) => v.shape);
    // 'hello' should contain vowel shapes like C, D, E
    expect(shapes.some((s) => ['C', 'D', 'E'].includes(s))).toBe(true);

    const visemesSilence = wordToVisemes('');
    expect(visemesSilence).toEqual([{ shape: 'X', weight: 1.0 }]);
  });

  it('resolves correct active cue at boundaries and transforms global time to clip-local time', () => {
    const clipStart = 3.0; // Clip placed at 3.0s on timeline
    const cues: MouthCue[] = [
      { id: 'c1', start: 0.0, end: 1.0, mouthId: 'X' },
      { id: 'c2', start: 1.0, end: 2.0, mouthId: 'D' },
      { id: 'c3', start: 2.0, end: 3.0, mouthId: 'A' },
    ];

    const getActiveShape = (globalTime: number): string | null => {
      const localTime = globalTime - clipStart;
      if (localTime < 0 || localTime >= 3.0) return null;
      for (const cue of cues) {
        if (localTime >= cue.start && localTime < cue.end) {
          return cue.mouthId;
        }
      }
      return null;
    };

    expect(getActiveShape(2.5)).toBeNull(); // Before clip start
    expect(getActiveShape(3.0)).toBe('X');  // local 0.0 -> cue 1
    expect(getActiveShape(3.5)).toBe('X');  // local 0.5 -> cue 1
    expect(getActiveShape(4.0)).toBe('D');  // local 1.0 -> cue 2
    expect(getActiveShape(5.2)).toBe('A');  // local 2.2 -> cue 3
    expect(getActiveShape(6.0)).toBeNull(); // Past clip end
  });

  it('respects LipSyncTuningSettings to filter out rapid flickering cues shorter than minDurationMs', () => {
    const rapidCues: MouthCue[] = [
      { id: '1', start: 0.0, end: 0.3, mouthId: 'B' },
      { id: '2', start: 0.3, end: 0.34, mouthId: 'C' }, // 40ms blip - shorter than 90ms minDuration
      { id: '3', start: 0.34, end: 0.8, mouthId: 'D' },
    ];

    const tuned = applyTuningToCues(rapidCues, 0.8, {
      speed: 'natural',
      smoothness: 'medium',
      minDurationMs: 90,
    });

    // Short blip (40ms) should be absorbed into previous cue
    expect(tuned.length).toBe(2);
    expect(tuned[0].mouthId).toBe('B');
    expect(tuned[0].end).toBe(0.34);
    expect(tuned[1].mouthId).toBe('D');
    expect(tuned[1].start).toBe(0.34);
  });

  it('guards companion health checks to prevent ERR_CONNECTION_REFUSED when companion is disabled', async () => {
    rhubarbAdapter.setCompanionEnabled(false);
    expect(rhubarbAdapter.isCompanionEnabled()).toBe(false);
    const isUp = await rhubarbAdapter.checkCompanionHealth();
    expect(isUp).toBe(false);
  });
});
