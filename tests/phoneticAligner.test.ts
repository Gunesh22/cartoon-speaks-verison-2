import { describe, it, expect } from 'vitest';
import {
  extractWordVisemes,
  getWordArticulation,
  buildSpeechTimelineCues,
  smoothAndFilterCues,
  validateTimelineCues,
  condenseVisemes,
} from '../src/features/lipSync/phoneticAligner';

describe('Phonetic Aligner & Natural Lip-Sync Engine', () => {
  it('extracts natural phoneme visemes with bilabial closures', () => {
    // "Happy" must contain bilabial closure 'A' (/p/)
    const happyVisemes = extractWordVisemes('Happy');
    expect(happyVisemes.some((v) => v.shape === 'A')).toBe(true);

    // "Manan" starts with M closure 'A'
    const mananVisemes = extractWordVisemes('Manan');
    expect(mananVisemes[0].shape).toBe('A');

    // "Ashram" ends with M closure 'A'
    const ashramVisemes = extractWordVisemes('Ashram');
    expect(ashramVisemes.some((v) => v.shape === 'A')).toBe(true);

    // "swagat" has pursed 'O' (/w/) and open vowel 'D'
    const swagatVisemes = extractWordVisemes('swagat');
    expect(swagatVisemes.some((v) => v.shape === 'O')).toBe(true);
    expect(swagatVisemes.some((v) => v.shape === 'D')).toBe(true);
  });

  it('generates speech-aligned cues for "Happy Thoughts, Manan Ashram par aapka swagat hai" without long open holds', () => {
    const words = ['Happy', 'Thoughts,', 'Manan', 'Ashram', 'par', 'aapka', 'swagat', 'hai'];
    const totalDuration = 3.87;
    const speechIntervals = [{ start: 0.12, end: 3.65 }];
    const silenceIntervals = [
      { start: 0, end: 0.12 },
      { start: 3.65, end: 3.87 },
    ];

    const cues = buildSpeechTimelineCues(
      words,
      speechIntervals,
      totalDuration,
      { speed: 'natural', smoothness: 'medium', minDurationMs: 90 },
      silenceIntervals
    );

    expect(cues.length).toBeGreaterThan(15);

    // 1. Initial silence
    expect(cues[0].shape).toBe('X');
    expect(cues[0].start).toBe(0);

    // 2. Final silence
    const lastCue = cues[cues.length - 1];
    expect(lastCue.shape).toBe('X');
    expect(lastCue.end).toBeCloseTo(totalDuration, 2);

    // 3. NO mouth shape should stay open for >= 500ms (Requirement 2 & 5)
    for (const cue of cues) {
      const dur = cue.end - cue.start;
      if (cue.shape !== 'X') {
        expect(dur).toBeLessThanOrEqual(0.35); // Max 350ms for natural speech articulation
      }
    }

    // 4. Closed-lip consonants ('A' for M, P, B) must be represented throughout the sentence
    const aCues = cues.filter((c) => c.shape === 'A');
    expect(aCues.length).toBeGreaterThanOrEqual(4);

    // 5. Contiguous boundaries (no overlapping cues or negative durations)
    for (let i = 0; i < cues.length - 1; i++) {
      expect(cues[i].end).toBeCloseTo(cues[i + 1].start, 3);
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
    }

    // 6. Validation should report 0 warnings
    const warnings = validateTimelineCues(cues, totalDuration, silenceIntervals);
    expect(warnings.length).toBe(0);
  });

  it('flags mouth shapes held longer than 500ms in validateTimelineCues', () => {
    const problematicCues = [
      { id: '1', start: 0.0, end: 0.85, shape: 'D' }, // 850ms open mouth hold!
      { id: '2', start: 0.85, end: 1.0, shape: 'A' },
      { id: '3', start: 1.0, end: 3.87, shape: 'X' },
    ];

    const warnings = validateTimelineCues(problematicCues, 3.87);
    expect(warnings.some((w) => w.type === 'long-duration')).toBe(true);
  });

  it('smooths consecutive identical shapes without eating essential closures', () => {
    const raw = [
      { id: '1', start: 0.0, end: 0.12, shape: 'D' },
      { id: '2', start: 0.12, end: 0.20, shape: 'A' }, // 80ms closure
      { id: '3', start: 0.20, end: 0.35, shape: 'C' },
    ];

    const smoothed = smoothAndFilterCues(raw, 0.35);
    // Closure 'A' must still be present
    expect(smoothed.some((c) => c.shape === 'A')).toBe(true);
  });

  it('aligns punctuation clauses accurately to distinct speech intervals across pauses', () => {
    // 2 speech intervals separated by a 200ms breath pause between 1.10s and 1.30s
    const words = ['Happy', 'Thoughts,', 'Manan', 'Ashram', 'par', 'aapka', 'swagat', 'hai'];
    const speechIntervals = [
      { start: 0.12, end: 1.10 }, // "Happy Thoughts,"
      { start: 1.30, end: 3.65 }, // "Manan Ashram par aapka swagat hai"
    ];
    const totalDuration = 3.87;

    const cues = buildSpeechTimelineCues(words, speechIntervals, totalDuration);

    // 1. Cues in Interval 0 (up to 1.10s) must only belong to "Happy Thoughts,"
    const interval0Cues = cues.filter((c) => c.start >= 0.12 && c.end <= 1.10);
    expect(interval0Cues.length).toBeGreaterThan(0);
    for (const c of interval0Cues) {
      if (c.text) {
        expect(['Happy', 'Thoughts', 'pause']).toContain(c.text);
      }
    }

    // 2. Pause between 1.10s and 1.30s must be marked as 'X'
    const pauseCue = cues.find((c) => Math.abs(c.start - 1.10) < 0.05 && c.shape === 'X');
    expect(pauseCue).toBeDefined();

    // 3. Immediately after the pause (at 1.30s), the second interval starts with "Manan" /m/ closure 'A'
    const mananFirstCue = cues.find((c) => Math.abs(c.start - 1.30) < 0.05);
    expect(mananFirstCue).toBeDefined();
    expect(mananFirstCue?.shape).toBe('A'); // Bilabial /m/ closure
    expect(mananFirstCue?.text).toBe('Manan');
    expect(['dictionary', 'phoneme-rule']).toContain(mananFirstCue?.source);
  });

  it('adjusts mouth cue density and count according to minDurationMs and speed tuning', () => {
    const words = [
      'Welcome', 'to', 'our', 'channel,', 'today', 'we', 'are', 'exploring', 'the',
      'beautiful', 'campus', 'and', 'learning', 'about', 'animation.'
    ];
    const totalDuration = 6.0;
    const speechIntervals = [{ start: 0.1, end: 5.8 }];

    // 1. Snappy / Fast (minDuration 60ms)
    const snappyCues = buildSpeechTimelineCues(
      words,
      speechIntervals,
      totalDuration,
      { speed: 'faster', smoothness: 'low', minDurationMs: 60 }
    );

    // 2. Slow / Deliberate (minDuration 180ms)
    const slowCues = buildSpeechTimelineCues(
      words,
      speechIntervals,
      totalDuration,
      { speed: 'slower', smoothness: 'high', minDurationMs: 180 }
    );

    // Snappy must generate significantly more mouth cues than slow
    expect(snappyCues.length).toBeGreaterThan(slowCues.length);
    // Slow cues must have fewer mouth movements
    expect(slowCues.length).toBeLessThan(snappyCues.length * 0.75);

    // In slowCues, every speech cue should respect minDurationMs (>= 170ms, allowing minor rounding)
    // closures (A, F) are protected down to 50ms
    for (const cue of slowCues) {
      if (cue.shape !== 'X' && cue.shape !== 'A' && cue.shape !== 'F') {
        expect(cue.end - cue.start).toBeGreaterThanOrEqual(0.16);
      }
    }
  });

  it('correctly maps Hindi and Hinglish articulatory visemes and preserves sound order', () => {
    // 1. "aap" opens on 'D' (aa) and closes on 'A' (p) - NEVER closed lips for the whole word!
    const aapVisemes = extractWordVisemes('aap');
    expect(aapVisemes.length).toBeGreaterThanOrEqual(2);
    expect(aapVisemes[0].shape).toBe('D');
    expect(aapVisemes[1].shape).toBe('A');

    // 2. "Happy" has open vowel 'D' and closure 'A' in chronological order
    const happyVisemes = extractWordVisemes('Happy');
    const happyShapes = happyVisemes.map((v) => v.shape);
    expect(happyShapes).toContain('D');
    expect(happyShapes).toContain('A');
    expect(happyShapes.indexOf('D')).toBeLessThan(happyShapes.indexOf('A'));

    // 3. "Thoughts" has 'H' (th), 'E' (rounded open), and 'B' (ts teeth)
    const thoughtsVisemes = extractWordVisemes('Thoughts');
    const thoughtsShapes = thoughtsVisemes.map((v) => v.shape);
    expect(thoughtsShapes).toEqual(['H', 'E', 'B']);

    // 4. "sabhi" articulates 'B' (s) -> 'D' (a) -> 'A' (bh closure) -> 'C' (i smile)
    const sabhiVisemes = extractWordVisemes('sabhi');
    const sabhiShapes = sabhiVisemes.map((v) => v.shape);
    expect(sabhiShapes).toEqual(['B', 'D', 'A', 'C']);

    // 5. "swagat" articulates 'B' (s) -> 'O' (w pursed) -> 'D' (aa open) -> 'C' (g) -> 'B' (t)
    const swagatVisemes = extractWordVisemes('swagat');
    const swagatShapes = swagatVisemes.map((v) => v.shape);
    expect(swagatShapes).toContain('B');
    expect(swagatShapes).toContain('O');
    expect(swagatShapes).toContain('D');
    expect(swagatShapes.indexOf('O')).toBeLessThan(swagatShapes.indexOf('D'));

    // 6. "Namaste" contains dental 'B' (n), bilabial closure 'A' (m), open vowel 'D' (a), dental 'B' (st), smile 'C' (e)
    const namasteVisemes = extractWordVisemes('Namaste');
    const namasteShapes = namasteVisemes.map((v) => v.shape);
    expect(namasteShapes).toContain('B');
    expect(namasteShapes).toContain('A');
    expect(namasteShapes).toContain('D');
    expect(namasteShapes).toContain('C');

    // 7. "khushi" contains 'C' (kh), 'O' (u pursed), 'G' (sh smile teeth), 'C' (i smile)
    const khushiVisemes = extractWordVisemes('khushi');
    const khushiShapes = khushiVisemes.map((v) => v.shape);
    expect(khushiShapes).toEqual(['C', 'O', 'G', 'C']);

    // 8. "khoobsurat" articulates 'C' (kh) -> 'O' (oo) -> 'A' (b closure) -> 'B' (s) -> 'O' (u) -> 'B' (rat)
    const khoobsuratVisemes = extractWordVisemes('khoobsurat');
    const khoobsuratShapes = khoobsuratVisemes.map((v) => v.shape);
    expect(khoobsuratShapes).toContain('O');
    expect(khoobsuratShapes).toContain('A');
    expect(khoobsuratShapes).toContain('B');
  });

  it('preserves chronological sound order and vowel nuclei when condensing visemes', () => {
    // Word "aap": when condensed to 2 shapes, it MUST be D then A, NOT A then D!
    const aapCondensed = condenseVisemes(extractWordVisemes('aap'), 2);
    expect(aapCondensed[0].shape).toBe('D');
    expect(aapCondensed[1].shape).toBe('A');

    // Word "Happy": when condensed to 1 shape, it must choose the vowel nucleus 'D', NOT a closed mouth 'A'!
    const happySingle = condenseVisemes(extractWordVisemes('Happy'), 1);
    expect(happySingle[0].shape).toBe('D');

    // Word "sabhi": when condensed to 3 shapes, maintains forward order B -> D -> A or B -> A -> C
    const sabhiCondensed = condenseVisemes(extractWordVisemes('sabhi'), 3);
    const sabhiShapes = sabhiCondensed.map((v) => v.shape);
    expect(sabhiShapes.indexOf('A')).toBeGreaterThan(0); // Closure 'A' (/bh/) is in middle/end, never beginning!
  });

  it('articulates all 13 benchmark words with correct phonemes, sources, and shapes', () => {
    const benchmarkWords = [
      'Namaste', 'Happy', 'Thoughts', 'ki', 'taraf', 'aap',
      'sabhi', 'Manan', 'Ashram', 'hardik', 'swagat', 'aaiye', 'dhanyavaad'
    ];

    for (const w of benchmarkWords) {
      const art = getWordArticulation(w);
      expect(art.visemes.length).toBeGreaterThan(0);
      expect(art.source).toBe('dictionary');
      expect(art.phonemes.length).toBeGreaterThan(0);
      expect(art.ipa.length).toBeGreaterThan(0);
    }

    // 1. Namaste: B (n) -> C (a) -> A (m closure) -> D (a open) -> B (st dental) -> C (e front)
    expect(extractWordVisemes('Namaste').map((v) => v.shape)).toEqual(['B', 'C', 'A', 'D', 'B', 'C']);
    // 2. Happy: C (h) -> D (ae open) -> A (p closure) -> C (i smile)
    expect(extractWordVisemes('Happy').map((v) => v.shape)).toEqual(['C', 'D', 'A', 'C']);
    // 3. Thoughts: H (th tongue) -> E (aw rounded) -> B (ts dental)
    expect(extractWordVisemes('Thoughts').map((v) => v.shape)).toEqual(['H', 'E', 'B']);
    // 4. ki: C (k + i coarticulated)
    expect(extractWordVisemes('ki').map((v) => v.shape)).toEqual(['C']);
    // 5. taraf: B (t) -> D (a) -> B (r) -> F (f teeth on lip)
    expect(extractWordVisemes('taraf').map((v) => v.shape)).toEqual(['B', 'D', 'B', 'F']);
    // 6. aap: D (aa open) -> A (p closure)
    expect(extractWordVisemes('aap').map((v) => v.shape)).toEqual(['D', 'A']);
    // 7. sabhi: B (s) -> D (a) -> A (bh closure) -> C (i smile)
    expect(extractWordVisemes('sabhi').map((v) => v.shape)).toEqual(['B', 'D', 'A', 'C']);
    // 8. Manan: A (m) -> D (a) -> B (n) -> D (a) -> B (n)
    expect(extractWordVisemes('Manan').map((v) => v.shape)).toEqual(['A', 'D', 'B', 'D', 'B']);
    // 9. Ashram: D (aa) -> G (sh smile teeth) -> B (r) -> D (a) -> A (m closure)
    expect(extractWordVisemes('Ashram').map((v) => v.shape)).toEqual(['D', 'G', 'B', 'D', 'A']);
    // 10. hardik: C (h) -> D (aa) -> B (rd) -> C (ik)
    expect(extractWordVisemes('hardik').map((v) => v.shape)).toEqual(['C', 'D', 'B', 'C']);
    // 11. swagat: B (s) -> O (w pursed) -> D (aa open) -> C (g) -> B (t)
    expect(extractWordVisemes('swagat').map((v) => v.shape)).toEqual(['B', 'O', 'D', 'C', 'B']);
    // 12. aaiye: D (aa open) -> C (iye smile)
    expect(extractWordVisemes('aaiye').map((v) => v.shape)).toEqual(['D', 'C']);
    // 13. dhanyavaad: B (dh) -> D (a) -> B (ny) -> F (v teeth on lip) -> D (aa open) -> B (d)
    expect(extractWordVisemes('dhanyavaad').map((v) => v.shape)).toEqual(['B', 'D', 'B', 'F', 'D', 'B']);
  });
});
