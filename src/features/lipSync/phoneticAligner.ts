import { MouthCue, CueWarning, CueAlignmentSource, LipSyncTuningSettings, RhubarbShape } from '../../types/lipSync';
import { phonemizeWord } from './phonemizer';
import { phonemesToVisemes } from './phonemeVisemeMap';

export interface TimelineCue {
  id: string;
  start: number;
  end: number;
  shape: RhubarbShape | string;
  mouthId?: string;
  text?: string;
  phoneme?: string;
  ipa?: string;
  source?: CueAlignmentSource;
}

function generateId(prefix: string = 'cue'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
}

export interface PhonemeViseme {
  shape: string; // Rhubarb shapes: X, A, B, C, D, E, F, G, H, O
  weight: number; // Proportion of the word duration (0.0 to 1.0)
  phoneme?: string;
  ipa?: string;
  source?: CueAlignmentSource;
}

export interface WordArticulation {
  word: string;
  cleanWord: string;
  language: string;
  source: CueAlignmentSource;
  phonemes: string;
  ipa: string;
  visemes: PhonemeViseme[];
}

/**
 * High-frequency dictionary mapping common spoken words (English & multilingual transliteration)
 * to natural, articulatory viseme shapes.
 *
 * Rhubarb viseme definitions:
 * - A: Closed mouth, lips pressed together (M, B, P).
 * - B: Slightly open with teeth showing (EE, D, S, T, N, Z).
 * - C: Open mouth with relaxed lips (EH, AE, K, G).
 * - D: Wide open mouth (AA, AH, AY).
 * - E: Slightly rounded open mouth (AO, ER, O).
 * - F: Upper teeth on lower lip (F, V).
 * - G: Smile with teeth showing (CH, J, SH).
 * - H: Open mouth with tongue raised (TH, L).
 * - O: Small rounded / pursed opening (W, Q, OO, U).
 * - X: Rest / Neutral idle shape (Silence, pause).
 */
export const COMMON_WORD_VISEMES: Record<string, PhonemeViseme[]> = {
  // Common conversational English
  hi: [
    { shape: 'D', weight: 0.60 }, // Open vowel /aɪ/
    { shape: 'C', weight: 0.40 }, // Smiling off-glide /i/
  ],
  hello: [
    { shape: 'C', weight: 0.20 },
    { shape: 'D', weight: 0.30 },
    { shape: 'H', weight: 0.20 },
    { shape: 'E', weight: 0.30 }, // Open rounded /oʊ/
  ],
  hey: [
    { shape: 'C', weight: 0.30 },
    { shape: 'D', weight: 0.70 },
  ],
  my: [
    { shape: 'A', weight: 0.35 }, // Bilabial /m/ (lips pressed together)
    { shape: 'D', weight: 0.65 }, // Open vowel /aɪ/
  ],
  me: [
    { shape: 'A', weight: 0.35 }, // M closure
    { shape: 'C', weight: 0.65 }, // E vowel
  ],
  name: [
    { shape: 'B', weight: 0.25 }, // Alveolar /n/
    { shape: 'C', weight: 0.45 }, // Vowel /eɪ/
    { shape: 'A', weight: 0.30 }, // Bilabial /m/ closure (lips closed!)
  ],
  is: [
    { shape: 'C', weight: 0.55 }, // Vowel /ɪ/
    { shape: 'B', weight: 0.45 }, // Sibilant /z/
  ],
  it: [
    { shape: 'C', weight: 0.55 },
    { shape: 'B', weight: 0.45 },
  ],
  i: [
    { shape: 'D', weight: 0.60 },
    { shape: 'C', weight: 0.40 },
  ],
  am: [
    { shape: 'D', weight: 0.55 },
    { shape: 'A', weight: 0.45 }, // M closure
  ],
  you: [
    { shape: 'C', weight: 0.25 },
    { shape: 'O', weight: 0.75 }, // Pursed /uː/
  ],
  your: [
    { shape: 'C', weight: 0.25 },
    { shape: 'E', weight: 0.75 },
  ],
  the: [
    { shape: 'H', weight: 0.35 }, // TH
    { shape: 'C', weight: 0.65 },
  ],
  this: [
    { shape: 'H', weight: 0.25 },
    { shape: 'C', weight: 0.45 },
    { shape: 'B', weight: 0.30 },
  ],
  that: [
    { shape: 'H', weight: 0.25 },
    { shape: 'D', weight: 0.50 },
    { shape: 'B', weight: 0.25 },
  ],
  to: [
    { shape: 'B', weight: 0.30 },
    { shape: 'O', weight: 0.70 },
  ],
  and: [
    { shape: 'D', weight: 0.55 },
    { shape: 'B', weight: 0.45 },
  ],
  a: [{ shape: 'D', weight: 1.0 }],
  an: [
    { shape: 'D', weight: 0.60 },
    { shape: 'B', weight: 0.40 },
  ],
  are: [{ shape: 'D', weight: 1.0 }],
  welcome: [
    { shape: 'O', weight: 0.20 }, // W
    { shape: 'C', weight: 0.25 }, // E
    { shape: 'H', weight: 0.15 }, // L
    { shape: 'C', weight: 0.15 }, // C
    { shape: 'A', weight: 0.25 }, // M closure
  ],
  yes: [
    { shape: 'C', weight: 0.25 },
    { shape: 'C', weight: 0.45 },
    { shape: 'B', weight: 0.30 },
  ],
  no: [
    { shape: 'B', weight: 0.30 },
    { shape: 'E', weight: 0.70 },
  ],
  what: [
    { shape: 'O', weight: 0.30 },
    { shape: 'D', weight: 0.45 },
    { shape: 'B', weight: 0.25 },
  ],
  how: [
    { shape: 'C', weight: 0.25 },
    { shape: 'E', weight: 0.75 },
  ],
  good: [
    { shape: 'C', weight: 0.25 },
    { shape: 'O', weight: 0.50 },
    { shape: 'B', weight: 0.25 },
  ],
  fine: [
    { shape: 'F', weight: 0.30 }, // Labiodental /f/ (teeth on lip)
    { shape: 'D', weight: 0.45 },
    { shape: 'B', weight: 0.25 },
  ],
  very: [
    { shape: 'F', weight: 0.30 }, // Labiodental /v/ (teeth on lip)
    { shape: 'C', weight: 0.40 },
    { shape: 'C', weight: 0.30 },
  ],
  nice: [
    { shape: 'B', weight: 0.25 },
    { shape: 'D', weight: 0.50 },
    { shape: 'B', weight: 0.25 },
  ],
  meet: [
    { shape: 'A', weight: 0.30 }, // M closure
    { shape: 'C', weight: 0.50 },
    { shape: 'B', weight: 0.20 },
  ],

  // Specific phrases & Indian / Hinglish / English vocabulary
  happy: [
    { shape: 'C', weight: 0.15 }, // H onset aspirate
    { shape: 'D', weight: 0.35 }, // Open vowel /æ/
    { shape: 'A', weight: 0.25 }, // Closed lips /p/ (bilabial)
    { shape: 'C', weight: 0.25 }, // Smiling off-glide /i/
  ],
  thoughts: [
    { shape: 'H', weight: 0.25 }, // Tongue behind teeth /θ/
    { shape: 'E', weight: 0.45 }, // Open rounded /ɔː/
    { shape: 'B', weight: 0.30 }, // Sibilant /ts/ (teeth together)
  ],
  thought: [
    { shape: 'H', weight: 0.30 },
    { shape: 'E', weight: 0.50 },
    { shape: 'B', weight: 0.20 },
  ],
  manan: [
    { shape: 'A', weight: 0.25 }, // M (closed lips)
    { shape: 'D', weight: 0.30 }, // Open vowel /ʌ/
    { shape: 'B', weight: 0.20 }, // N dental
    { shape: 'D', weight: 0.15 }, // Open vowel /ʌ/
    { shape: 'B', weight: 0.10 }, // N closure
  ],
  ashram: [
    { shape: 'D', weight: 0.30 }, // Open vowel /ɑː/
    { shape: 'G', weight: 0.25 }, // SH sibilant (teeth smile)
    { shape: 'C', weight: 0.15 }, // R liquid / A vowel
    { shape: 'A', weight: 0.30 }, // M (closed lips!)
  ],
  par: [
    { shape: 'A', weight: 0.30 }, // P (closed lips!)
    { shape: 'D', weight: 0.45 }, // A open vowel
    { shape: 'B', weight: 0.25 }, // R dental flap
  ],
  aap: [
    { shape: 'D', weight: 0.60 }, // AA open wide vowel
    { shape: 'A', weight: 0.40 }, // P bilabial stop (lips closed!)
  ],
  aapka: [
    { shape: 'D', weight: 0.35 }, // AA long open vowel
    { shape: 'A', weight: 0.25 }, // P (closed lips!)
    { shape: 'C', weight: 0.15 }, // K velar
    { shape: 'D', weight: 0.25 }, // A vowel
  ],
  apka: [
    { shape: 'D', weight: 0.35 },
    { shape: 'A', weight: 0.25 },
    { shape: 'C', weight: 0.15 },
    { shape: 'D', weight: 0.25 },
  ],
  sabhi: [
    { shape: 'B', weight: 0.20 }, // Dental sibilant /s/
    { shape: 'D', weight: 0.30 }, // Open vowel /ʌ/
    { shape: 'A', weight: 0.25 }, // Aspirated bilabial /bʱ/ (lips closed!)
    { shape: 'C', weight: 0.25 }, // Close front vowel /iː/ (smile)
  ],
  swagat: [
    { shape: 'B', weight: 0.15 }, // S dental
    { shape: 'O', weight: 0.20 }, // W rounded / pursed lips
    { shape: 'D', weight: 0.35 }, // AA open wide vowel
    { shape: 'C', weight: 0.15 }, // G velar stop
    { shape: 'B', weight: 0.15 }, // T dental stop
  ],
  namaste: [
    { shape: 'B', weight: 0.15 }, // N dental
    { shape: 'C', weight: 0.15 }, // A short vowel
    { shape: 'A', weight: 0.20 }, // M bilabial stop (lips firmly closed!)
    { shape: 'D', weight: 0.20 }, // A open vowel
    { shape: 'B', weight: 0.15 }, // ST dental cluster (teeth showing)
    { shape: 'C', weight: 0.15 }, // E front vowel (smile)
  ],
  khushi: [
    { shape: 'C', weight: 0.20 }, // KH aspirated velar
    { shape: 'O', weight: 0.35 }, // U rounded pursed vowel
    { shape: 'G', weight: 0.25 }, // SH sibilant (teeth smile)
    { shape: 'C', weight: 0.20 }, // I close front vowel (smile)
  ],
  khoobsurat: [
    { shape: 'C', weight: 0.14 }, // KH velar
    { shape: 'O', weight: 0.24 }, // OO rounded vowel
    { shape: 'A', weight: 0.20 }, // B bilabial stop (lips closed!)
    { shape: 'B', weight: 0.14 }, // S dental sibilant
    { shape: 'O', weight: 0.14 }, // U rounded vowel
    { shape: 'B', weight: 0.14 }, // RAT dental stop
  ],
  khubsurat: [
    { shape: 'C', weight: 0.14 },
    { shape: 'O', weight: 0.24 },
    { shape: 'A', weight: 0.20 },
    { shape: 'B', weight: 0.14 },
    { shape: 'O', weight: 0.14 },
    { shape: 'B', weight: 0.14 },
  ],
  ek: [
    { shape: 'C', weight: 0.60 }, // E front vowel
    { shape: 'B', weight: 0.40 }, // K stop
  ],
  aaiye: [
    { shape: 'D', weight: 0.55 }, // AA open vowel
    { shape: 'C', weight: 0.45 }, // IYE front glide / smile
  ],
  hai: [
    { shape: 'C', weight: 0.25 }, // H aspirate
    { shape: 'D', weight: 0.45 }, // AI open vowel
    { shape: 'C', weight: 0.30 }, // Off-glide
  ],
  hain: [
    { shape: 'C', weight: 0.20 },
    { shape: 'D', weight: 0.45 },
    { shape: 'B', weight: 0.35 },
  ],
  ho: [
    { shape: 'C', weight: 0.25 },
    { shape: 'E', weight: 0.75 },
  ],
  hoga: [
    { shape: 'C', weight: 0.20 },
    { shape: 'E', weight: 0.40 },
    { shape: 'C', weight: 0.20 },
    { shape: 'D', weight: 0.20 },
  ],
  hogi: [
    { shape: 'C', weight: 0.20 },
    { shape: 'E', weight: 0.40 },
    { shape: 'C', weight: 0.20 },
    { shape: 'C', weight: 0.20 },
  ],
  bhi: [
    { shape: 'A', weight: 0.40 }, // BH bilabial closure (lips closed!)
    { shape: 'C', weight: 0.60 }, // I smile vowel
  ],
  bahut: [
    { shape: 'A', weight: 0.25 }, // B bilabial closure
    { shape: 'D', weight: 0.25 }, // A vowel
    { shape: 'O', weight: 0.30 }, // U rounded vowel
    { shape: 'B', weight: 0.20 }, // T dental stop
  ],
  accha: [
    { shape: 'D', weight: 0.35 }, // A open vowel
    { shape: 'G', weight: 0.35 }, // CCH sibilant smile
    { shape: 'D', weight: 0.30 }, // A open vowel
  ],
  achha: [
    { shape: 'D', weight: 0.35 },
    { shape: 'G', weight: 0.35 },
    { shape: 'D', weight: 0.30 },
  ],
  shukriya: [
    { shape: 'G', weight: 0.25 }, // SH sibilant smile
    { shape: 'O', weight: 0.30 }, // U rounded vowel
    { shape: 'C', weight: 0.20 }, // K velar
    { shape: 'D', weight: 0.25 }, // YA open vowel
  ],
  dhanyavad: [
    { shape: 'B', weight: 0.20 }, // DH dental stop
    { shape: 'D', weight: 0.25 }, // A open vowel
    { shape: 'B', weight: 0.15 }, // N dental nasal
    { shape: 'F', weight: 0.20 }, // V labiodental (teeth on lip)
    { shape: 'D', weight: 0.20 }, // D dental stop
  ],
  alvida: [
    { shape: 'D', weight: 0.20 }, // A open
    { shape: 'H', weight: 0.15 }, // L tongue
    { shape: 'F', weight: 0.25 }, // V teeth on lip
    { shape: 'C', weight: 0.20 }, // I smile
    { shape: 'D', weight: 0.20 }, // DA dental open
  ],
  aur: [
    { shape: 'E', weight: 0.65 }, // AU rounded open
    { shape: 'B', weight: 0.35 }, // R dental flap
  ],
  kya: [
    { shape: 'C', weight: 0.30 }, // K velar
    { shape: 'D', weight: 0.70 }, // YA open vowel
  ],
  kyun: [
    { shape: 'C', weight: 0.25 },
    { shape: 'E', weight: 0.50 },
    { shape: 'B', weight: 0.25 },
  ],
  kyon: [
    { shape: 'C', weight: 0.25 },
    { shape: 'E', weight: 0.50 },
    { shape: 'B', weight: 0.25 },
  ],
  kaise: [
    { shape: 'C', weight: 0.25 },
    { shape: 'D', weight: 0.35 },
    { shape: 'B', weight: 0.20 },
    { shape: 'C', weight: 0.20 },
  ],
  hum: [
    { shape: 'C', weight: 0.25 },
    { shape: 'D', weight: 0.40 },
    { shape: 'A', weight: 0.35 }, // M closure (lips closed!)
  ],
  tum: [
    { shape: 'B', weight: 0.25 },
    { shape: 'O', weight: 0.40 },
    { shape: 'A', weight: 0.35 }, // M closure (lips closed!)
  ],
  mera: [
    { shape: 'A', weight: 0.25 }, // M closure
    { shape: 'C', weight: 0.35 },
    { shape: 'B', weight: 0.15 },
    { shape: 'D', weight: 0.25 },
  ],
  meri: [
    { shape: 'A', weight: 0.25 },
    { shape: 'C', weight: 0.35 },
    { shape: 'B', weight: 0.15 },
    { shape: 'C', weight: 0.25 },
  ],
  shanti: [
    { shape: 'G', weight: 0.25 },
    { shape: 'D', weight: 0.35 },
    { shape: 'B', weight: 0.25 },
    { shape: 'C', weight: 0.15 },
  ],
  baat: [
    { shape: 'A', weight: 0.30 }, // B closure
    { shape: 'D', weight: 0.45 }, // AA open
    { shape: 'B', weight: 0.25 }, // T dental
  ],
  zindagi: [
    { shape: 'B', weight: 0.20 },
    { shape: 'C', weight: 0.25 },
    { shape: 'B', weight: 0.20 },
    { shape: 'C', weight: 0.15 },
    { shape: 'C', weight: 0.20 },
  ],
};

/**
 * Phonetically decomposes any spoken word or transliterated name into syllable-based visemes.
 * Models physical speech articulators:
 * - Bilabial consonants (M, B, P) press lips together ('A').
 * - Labiodental consonants (F, V, PH) place upper teeth on lower lip ('F').
 * - Sibilants & affricates (SH, CH, J) show teeth with a smile ('G').
 * - Tongue behind teeth (TH, L) raise tongue ('H').
 * - Rounded lips / glides (W, QU, U, OO) purse mouth ('O').
 * - Dentals / stops (T, D, S, Z, N, R) narrow mouth with teeth visible ('B').
 * - Open vowels (AA, AH, A) open wide ('D').
 * - Smile vowels (EE, I, E, Y) open in a relaxed smile ('C').
 * - Rounded open vowels (O, AO, AW) open with rounded lips ('E').
 */
/**
 * Articulates a spoken word through the multi-dialect phonemizer and centralized viseme map.
 * Returns inferred phoneme tokens, IPA string, alignment source (dictionary vs phoneme-rule),
 * and the sequence of visemes.
 */
export function getWordArticulation(rawWord: string): WordArticulation {
  const cleanWord = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleanWord) {
    return {
      word: rawWord,
      cleanWord: '',
      language: 'english',
      source: 'heuristic-fallback',
      phonemes: 'pause',
      ipa: 'x',
      visemes: [{ shape: 'X', weight: 1.0, source: 'heuristic-fallback' }],
    };
  }

  const pronunciation = phonemizeWord(rawWord);
  const mapped = phonemesToVisemes(pronunciation.phonemes);
  const phonemeTokens = pronunciation.phonemes.map((p) => p.phoneme).join('-');
  const ipaStr = pronunciation.phonemes.map((p) => p.ipa).join('');

  return {
    word: rawWord,
    cleanWord: pronunciation.cleanWord,
    language: pronunciation.language,
    source: pronunciation.source,
    phonemes: phonemeTokens,
    ipa: ipaStr,
    visemes: mapped.map((m) => ({
      shape: m.shape,
      weight: m.weight,
      phoneme: m.phoneme,
      ipa: m.ipa,
      source: pronunciation.source,
    })),
  };
}

export function extractWordVisemes(rawWord: string): PhonemeViseme[] {
  return getWordArticulation(rawWord).visemes;
}


/**
 * Computes phonetic weight for a spoken word based on syllable count,
 * consonant stops, and prosodic phrase-final lengthening.
 * Syllables dictate acoustic duration in spoken speech (not raw character count).
 */
export function getWordPhoneticWeight(rawWord: string): number {
  const clean = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 1.0;

  // Syllables: count vowel nucleus clusters (vowels/diphthongs carry ~70% of duration)
  const vowelMatches = clean.match(/[aeiouy]+/g);
  const syllables = vowelMatches ? vowelMatches.length : 1;

  // Consonant closures take brief rapid frames
  const consonants = Math.max(0, clean.length - (clean.match(/[aeiouy]/g)?.length || 0));

  // Each syllable vowel carries ~1.6 duration units, consonants ~0.45 units
  let weight = syllables * 1.6 + consonants * 0.45;

  // Phrase-final lengthening: words ending with pause punctuation naturally elongate
  if (
    rawWord.includes(',') ||
    rawWord.includes(';') ||
    rawWord.includes(':') ||
    rawWord.includes('.') ||
    rawWord.includes('?') ||
    rawWord.includes('!')
  ) {
    weight += 0.9;
  }
  return Math.max(1.0, weight);
}

/**
 * Condenses extracted visemes down to the maximum number that can fit into a word's duration,
 * strictly preserving chronological sound order (speech flow), visual closures, and vowel nuclei.
 */
export function condenseVisemes(visemes: PhonemeViseme[], maxCount: number): PhonemeViseme[] {
  if (visemes.length <= maxCount || maxCount <= 0) return visemes;

  if (maxCount === 1) {
    // Single shape for entire word: prioritize primary open/rounded vowel nucleus (D, O, E) first,
    // so the mouth opens for vocalization rather than staying closed on a consonant
    const openVowel = visemes.find((v) => v.shape === 'D' || v.shape === 'O' || v.shape === 'E');
    if (openVowel) return [{ ...openVowel, weight: 1.0 }];

    const vowelCandidates = visemes.filter((v) => v.shape === 'D' || v.shape === 'O' || v.shape === 'E' || v.shape === 'C');
    if (vowelCandidates.length > 0) {
      const topVowel = [...vowelCandidates].sort((a, b) => b.weight - a.weight)[0];
      return [{ ...topVowel, weight: 1.0 }];
    }

    const sorted = [...visemes].sort((a, b) => b.weight - a.weight);
    return [{ ...sorted[0], weight: 1.0 }];
  }

  // When condensing to maxCount >= 2:
  // MUST PRESERVE CHRONOLOGICAL ORDER (Speech flows forward in time).
  // Calculate an articulatory priority score for each phoneme:
  // - Bilabial/labiodental closures ('A', 'F'): visually paramount (+10)
  // - Primary vowel nuclei ('D', 'O', 'E'): mouth openness / rounding (+8)
  // - Secondary vowels / sibilants ('C', 'G', 'H'): (+6)
  // - Word onset (index 0) & offset (last index): lexical boundary clarity (+4)
  const scored = visemes.map((v, idx) => {
    let score = v.weight;
    if (v.shape === 'A' || v.shape === 'F') score += 10;
    else if (v.shape === 'D' || v.shape === 'O' || v.shape === 'E') score += 8;
    else if (v.shape === 'G' || v.shape === 'H') score += 6;
    else if (v.shape === 'C') score += 5;

    if (idx === 0) score += 4;
    if (idx === visemes.length - 1) score += 3;

    return { v, idx, score };
  });

  // Pick top maxCount by score, then sort STRICTLY by original chronological index
  const selectedItems = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .sort((a, b) => a.idx - b.idx);

  // Merge adjacent duplicate shapes
  const merged: PhonemeViseme[] = [];
  for (const item of selectedItems) {
    const prev = merged[merged.length - 1];
    if (prev && prev.shape === item.v.shape) {
      prev.weight += item.v.weight;
    } else {
      merged.push({ ...item.v });
    }
  }

  // Normalize weights so they sum to 1.0
  const totalW = merged.reduce((sum, item) => sum + item.weight, 0);
  return merged.map((item) => ({
    ...item,
    weight: totalW > 0 ? item.weight / totalW : 1.0 / merged.length,
  }));
}

/**
 * Speech timeline cue builder:
 * - Detects punctuation clauses and maps them to acoustic speech intervals
 * - Distributes word durations based on syllable count and phonetic demand
 * - Respects LipSyncTuningSettings (minDurationMs, speed, smoothness)
 * - Tags cues with phoneme/word text and 'heuristic' source
 * - Ensures natural pauses ('X') match audio pauses
 */
export function buildSpeechTimelineCues(
  words: string[],
  speechIntervals: Array<{ start: number; end: number }>,
  totalDuration: number,
  tuning?: LipSyncTuningSettings,
  _silenceIntervals?: Array<{ start: number; end: number }>
): TimelineCue[] {
  const cues: TimelineCue[] = [];
  const speed = tuning?.speed || 'natural';
  const maxOpenVowelSec = speed === 'slower' ? 0.35 : speed === 'faster' ? 0.20 : 0.26;

  // Filter valid speech intervals
  const validIntervals = speechIntervals
    .map((int) => ({
      start: Math.max(0, Math.min(totalDuration, int.start)),
      end: Math.max(0, Math.min(totalDuration, int.end)),
    }))
    .filter((int) => int.end - int.start >= 0.06);

  if (validIntervals.length === 0) {
    // If no speech intervals detected, default to full rest
    return [
      { id: generateId('cue'), start: 0, end: totalDuration, shape: 'X', text: 'silence', source: 'heuristic' },
    ];
  }

  // Pre-speech silence
  if (validIntervals[0].start >= 0.06) {
    cues.push({
      id: generateId('cue'),
      start: 0,
      end: validIntervals[0].start,
      shape: 'X',
      text: 'pause',
      source: 'heuristic',
    });
  }

  // Clean words list
  const cleanWords = words.map((w) => w.trim()).filter((w) => w.length > 0);

  // Group words into punctuation clauses (delimited by comma, semicolon, colon, period, question, exclamation)
  const clauses: string[][] = [];
  let currentClause: string[] = [];

  for (const w of cleanWords) {
    currentClause.push(w);
    const hasPunctuation =
      w.includes(',') ||
      w.includes(';') ||
      w.includes(':') ||
      w.includes('.') ||
      w.includes('?') ||
      w.includes('!');
    if (hasPunctuation) {
      clauses.push(currentClause);
      currentClause = [];
    }
  }
  if (currentClause.length > 0) {
    clauses.push(currentClause);
  }

  // Allocate words to each interval
  const wordsPerInterval: string[][] = [];

  if (clauses.length === validIntervals.length && clauses.length > 1) {
    // Exact clause-to-interval match: Clause i maps directly to Interval i
    for (let i = 0; i < validIntervals.length; i++) {
      wordsPerInterval.push(clauses[i]);
    }
  } else if (validIntervals.length === 1) {
    wordsPerInterval.push(cleanWords);
  } else {
    // Distribute words proportional to the acoustic duration of each interval
    const totalSpeechDuration = validIntervals.reduce((sum, int) => sum + (int.end - int.start), 0);
    let wordIdx = 0;

    for (let i = 0; i < validIntervals.length; i++) {
      const isLastInterval = i === validIntervals.length - 1;
      if (isLastInterval) {
        wordsPerInterval.push(cleanWords.slice(wordIdx));
      } else {
        const intervalDur = validIntervals[i].end - validIntervals[i].start;
        const durFraction = intervalDur / totalSpeechDuration;
        const targetCount = Math.max(1, Math.round(cleanWords.length * durFraction));
        const assigned = cleanWords.slice(wordIdx, wordIdx + targetCount);
        wordsPerInterval.push(assigned);
        wordIdx += targetCount;
      }
    }
  }

  for (let i = 0; i < validIntervals.length; i++) {
    const interval = validIntervals[i];
    const intervalDuration = interval.end - interval.start;
    if (intervalDuration <= 0.05) continue;

    const currentWords = wordsPerInterval[i] || [];

    if (currentWords.length === 0) {
      // Natural rhythmic speech cadence when script is empty
      const cadenceVisemes = ['B', 'D', 'C', 'A', 'B', 'D', 'E', 'B', 'C', 'A', 'O', 'D'];
      const targetStep = Math.max(0.10, Math.min(0.18, intervalDuration / Math.max(4, Math.round(intervalDuration / 0.14))));
      let curr = interval.start;
      let cIdx = 0;

      while (curr < interval.end - 0.04) {
        const nextEnd = Math.min(interval.end, curr + targetStep);
        cues.push({
          id: generateId('cue'),
          start: curr,
          end: nextEnd,
          shape: cadenceVisemes[cIdx % cadenceVisemes.length],
          source: 'heuristic',
        });
        curr = nextEnd;
        cIdx++;
      }
    } else {
      // Weight words by syllable count, vowel nuclei, and prosodic lengthening
      const wordWeights = currentWords.map((w) => getWordPhoneticWeight(w));
      const totalWeight = wordWeights.reduce((a, b) => a + b, 0);

      let currWordStart = interval.start;

      for (let w = 0; w < currentWords.length; w++) {
        const rawWord = currentWords[w];
        const cleanWord = rawWord.replace(/[^a-zA-Z]/g, '');
        const isLastWord = w === currentWords.length - 1;
        const hasPausePunctuation =
          rawWord.includes(',') ||
          rawWord.includes(';') ||
          rawWord.includes(':') ||
          rawWord.includes('.');

        // Word duration allocated from interval
        const wordAlloc = isLastWord
          ? interval.end - currWordStart
          : intervalDuration * (wordWeights[w] / totalWeight);

        const wordEnd = Math.min(interval.end, currWordStart + wordAlloc);
        const actualWordDuration = wordEnd - currWordStart;

        // If word has punctuation comma and interval allows (and no acoustic pause follows immediately), reserve micro-pause 'X'
        const hasAcousticPauseAfter = isLastWord && !!validIntervals[i + 1] && (validIntervals[i + 1].start - interval.end >= 0.08);
        const pauseAlloc = (hasPausePunctuation && !hasAcousticPauseAfter && actualWordDuration > 0.35) ? 0.10 : 0;
        const speechDuration = actualWordDuration - pauseAlloc;

        const wordArt = getWordArticulation(rawWord);
        const minSliceSec = tuning?.minDurationMs && tuning.minDurationMs >= 140
          ? Math.max(0.038, (tuning.minDurationMs / 1000) * 0.75)
          : 0.038;
        const maxShapes = Math.max(1, Math.floor(speechDuration / minSliceSec));
        const visemes = condenseVisemes(wordArt.visemes, maxShapes);
        let currShapeStart = currWordStart;

        for (let v = 0; v < visemes.length; v++) {
          const viseme = visemes[v];
          const isLastViseme = v === visemes.length - 1;

          let shapeDuration = isLastViseme
            ? (currWordStart + speechDuration) - currShapeStart
            : speechDuration * viseme.weight;

          // If an open vowel is computed to be > maxOpenVowelSec,
          // split it with a natural articulatory relaxation to prevent frozen open mouths
          const isOpenVowel = viseme.shape === 'D' || viseme.shape === 'C' || viseme.shape === 'E' || viseme.shape === 'H';

          if (isOpenVowel && shapeDuration > maxOpenVowelSec) {
            // Split: main open peak, then easing off-glide
            const peakDuration = Math.min(maxOpenVowelSec * 0.7, shapeDuration * 0.65);

            // 1. Peak open shape
            cues.push({
              id: generateId('cue'),
              start: currShapeStart,
              end: currShapeStart + peakDuration,
              shape: viseme.shape,
              text: cleanWord,
              phoneme: viseme.phoneme || wordArt.phonemes,
              ipa: viseme.ipa || wordArt.ipa,
              source: wordArt.source,
            });

            // 2. Easing shape (relaxing towards mouth center C or B)
            const easingShape = viseme.shape === 'D' ? 'C' : 'B';
            cues.push({
              id: generateId('cue'),
              start: currShapeStart + peakDuration,
              end: currShapeStart + shapeDuration,
              shape: easingShape,
              text: cleanWord,
              phoneme: viseme.phoneme || wordArt.phonemes,
              ipa: viseme.ipa || wordArt.ipa,
              source: wordArt.source,
            });
          } else {
            cues.push({
              id: generateId('cue'),
              start: currShapeStart,
              end: currShapeStart + shapeDuration,
              shape: viseme.shape,
              text: cleanWord,
              phoneme: viseme.phoneme || wordArt.phonemes,
              ipa: viseme.ipa || wordArt.ipa,
              source: wordArt.source,
            });
          }

          currShapeStart += shapeDuration;
        }

        // Add punctuation micro-pause if reserved
        if (pauseAlloc > 0) {
          cues.push({
            id: generateId('cue'),
            start: currWordStart + speechDuration,
            end: wordEnd,
            shape: 'X',
            text: 'pause',
            phoneme: 'pause',
            ipa: 'x',
            source: 'heuristic-fallback',
          });
        }

        currWordStart = wordEnd;
      }
    }

    // Silence between speech intervals
    const nextInterval = validIntervals[i + 1];
    if (nextInterval && nextInterval.start - interval.end >= 0.08) {
      cues.push({
        id: generateId('cue'),
        start: interval.end,
        end: nextInterval.start,
        shape: 'X',
        text: 'pause',
        phoneme: 'pause',
        ipa: 'x',
        source: 'heuristic-fallback',
      });
    }
  }

  // Trailing silence
  const lastCueEnd = cues.length > 0 ? cues[cues.length - 1].end : 0;
  if (lastCueEnd < totalDuration - 0.04) {
    cues.push({
      id: generateId('cue'),
      start: lastCueEnd,
      end: totalDuration,
      shape: 'X',
      text: 'pause',
      phoneme: 'pause',
      ipa: 'x',
      source: 'heuristic-fallback',
    });
  }

  return smoothAndFilterCues(cues, totalDuration, tuning);
}

/**
 * Normalizes, aligns, and cleans cues:
 * - Merges consecutive identical shapes
 * - Caps open mouth holds so mouths never stay frozen open
 * - Preserves essential closures (A, F, B, G)
 * - Eliminates sub-frame jitter (< 35ms)
 * - Ensures contiguous timeline alignment
 */
export function smoothAndFilterCues(
  rawCues: TimelineCue[],
  totalDuration?: number,
  tuning?: LipSyncTuningSettings
): TimelineCue[] {
  if (rawCues.length === 0) return [];

  const speed = tuning?.speed || 'natural';
  const maxOpenVowelSec = speed === 'slower' ? 0.35 : speed === 'faster' ? 0.20 : 0.26;

  // Sort chronologically
  const sorted = [...rawCues].sort((a, b) => a.start - b.start);

  // 1. First pass: merge adjacent cues with the exact same shape
  const merged: TimelineCue[] = [];
  for (const cue of sorted) {
    if (cue.end <= cue.start) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.shape.toUpperCase() === cue.shape.toUpperCase()) {
      prev.end = Math.max(prev.end, cue.end);
      if (!prev.text && cue.text) prev.text = cue.text;
      if (!prev.phoneme && cue.phoneme) prev.phoneme = cue.phoneme;
      if (!prev.ipa && cue.ipa) prev.ipa = cue.ipa;
      if (!prev.source && cue.source) prev.source = cue.source;
    } else {
      merged.push({
        ...cue,
        id: cue.id || generateId('cue'),
        shape: cue.shape.toUpperCase(),
      });
    }
  }

  // 2. Second pass: break long open mouth shapes (respecting speed tuning)
  const capped: TimelineCue[] = [];
  const openShapes = new Set(['D', 'C', 'E', 'H', 'O']);

  for (const cue of merged) {
    const dur = cue.end - cue.start;

    if (dur > maxOpenVowelSec + 0.08 && openShapes.has(cue.shape)) {
      let curr = cue.start;
      while (curr < cue.end - 0.04) {
        const segmentDur = Math.min(maxOpenVowelSec, cue.end - curr);
        const isMiddle = curr > cue.start && (cue.end - curr > maxOpenVowelSec);
        const shape = isMiddle ? (cue.shape === 'D' ? 'C' : 'B') : cue.shape;

        capped.push({
          ...cue,
          id: generateId('cue'),
          start: curr,
          end: curr + segmentDur,
          shape,
        });
        curr += segmentDur;
      }
    } else {
      capped.push({ ...cue });
    }
  }

  // 3. Third pass: Enforce minimum frame duration to eliminate sub-frame flicker (< 35ms)
  // while preserving crisp consonant closures and speech flow
  const minFiltered: TimelineCue[] = [];
  const minDur = Math.max(0.035, (tuning?.minDurationMs ?? 90) / 1000);
  for (let i = 0; i < capped.length; i++) {
    const cue = capped[i];
    const dur = cue.end - cue.start;

    // Silence 'X' is kept if it represents a pause
    if (cue.shape === 'X') {
      minFiltered.push({ ...cue });
      continue;
    }

    const isClosure = cue.shape === 'A' || cue.shape === 'F';
    const effectiveMin = isClosure
      ? Math.min(0.045, minDur)
      : (tuning?.speed === 'slower' || minDur >= 0.16)
      ? Math.min(0.17, minDur * 0.92)
      : 0.035;

    if (dur < effectiveMin) {
      if (minFiltered.length > 0 && minFiltered[minFiltered.length - 1].shape !== 'X') {
        minFiltered[minFiltered.length - 1].end = cue.end;
        continue;
      } else if (i + 1 < capped.length && capped[i + 1].shape !== 'X') {
        capped[i + 1].start = cue.start;
        continue;
      }
    }

    minFiltered.push({ ...cue });
  }

  // 4. Fourth pass: Merge any newly adjacent identical shapes created by pass 3
  const reMerged: TimelineCue[] = [];
  for (const cue of minFiltered) {
    if (cue.end <= cue.start) continue;
    const prev = reMerged[reMerged.length - 1];
    if (prev && prev.shape.toUpperCase() === cue.shape.toUpperCase()) {
      prev.end = Math.max(prev.end, cue.end);
      if (!prev.text && cue.text) prev.text = cue.text;
      if (!prev.phoneme && cue.phoneme) prev.phoneme = cue.phoneme;
      if (!prev.ipa && cue.ipa) prev.ipa = cue.ipa;
      if (!prev.source && cue.source) prev.source = cue.source;
    } else {
      reMerged.push({ ...cue });
    }
  }

  // 5. Fifth pass: Ensure contiguous timeline alignment (no gaps or overlaps)
  const contiguous: TimelineCue[] = [];
  for (let i = 0; i < reMerged.length; i++) {
    const curr = reMerged[i];
    const prev = contiguous[contiguous.length - 1];

    if (prev) {
      // Align boundaries to avoid micro-gaps or overlaps
      if (Math.abs(curr.start - prev.end) < 0.05) {
        curr.start = prev.end;
      } else if (curr.start > prev.end + 0.05) {
        // Real gap: insert rest shape X
        contiguous.push({
          id: generateId('cue'),
          start: prev.end,
          end: curr.start,
          shape: 'X',
          text: 'pause',
          source: curr.source || 'heuristic',
        });
      }
    }

    if (curr.end > curr.start + 0.03) {
      contiguous.push({
        id: generateId('cue'),
        start: parseFloat(curr.start.toFixed(3)),
        end: parseFloat(curr.end.toFixed(3)),
        shape: curr.shape,
        text: curr.text,
        source: curr.source,
      });
    }
  }

  // 4. Fourth pass: merge any newly adjacent identical shapes created by contiguous alignment
  const finalized: TimelineCue[] = [];
  for (const c of contiguous) {
    const prev = finalized[finalized.length - 1];
    if (prev && prev.shape === c.shape) {
      prev.end = c.end;
      if (!prev.text && c.text) prev.text = c.text;
    } else {
      finalized.push({ ...c });
    }
  }

  // 5. Ensure last cue covers up to totalDuration if provided
  if (totalDuration && totalDuration > 0 && finalized.length > 0) {
    const last = finalized[finalized.length - 1];
    if (last.end < totalDuration - 0.03) {
      finalized.push({
        id: generateId('cue'),
        start: last.end,
        end: parseFloat(totalDuration.toFixed(3)),
        shape: 'X',
        text: 'pause',
        source: last.source || 'heuristic',
      });
    } else if (last.end > totalDuration + 0.05) {
      last.end = parseFloat(totalDuration.toFixed(3));
    }
  }

  return finalized.map((c) => ({
    ...c,
    mouthId: c.mouthId || c.shape || 'X',
  }));
}

/**
 * Validates timeline cues and returns actionable warnings:
 * - Flags mouth shapes held longer than 500ms
 * - Flags open-mouth shapes during detected silence
 * - Flags cues extending beyond total audio duration
 * - Flags overlapping cues
 * - Flags invalid / negative durations
 */
export function validateTimelineCues(
  cues: TimelineCue[],
  totalDuration: number,
  silenceIntervals?: Array<{ start: number; end: number }>
): CueWarning[] {
  const warnings: CueWarning[] = [];
  const openShapes = new Set(['C', 'D', 'E', 'H', 'O']);

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const duration = cue.end - cue.start;

    // 1. Invalid or negative duration
    if (duration <= 0.02) {
      warnings.push({
        cueId: cue.id,
        type: 'negative-duration',
        message: `Cue duration is too short or invalid (${(duration * 1000).toFixed(0)}ms).`,
        severity: 'error',
      });
    }

    // 2. Holds open longer than 500ms (Requirement 5)
    if (duration > 0.50 && cue.shape !== 'X') {
      warnings.push({
        cueId: cue.id,
        type: 'long-duration',
        message: `Mouth shape '${cue.shape}' is held for ${(duration * 1000).toFixed(0)}ms (>500ms). Consider splitting for natural speech.`,
        severity: 'warning',
      });
    }

    // 3. Extends beyond total audio duration (Requirement 5)
    if (totalDuration > 0 && cue.end > totalDuration + 0.05) {
      warnings.push({
        cueId: cue.id,
        type: 'exceeds-duration',
        message: `Cue ends at ${cue.end.toFixed(2)}s, which extends beyond audio duration (${totalDuration.toFixed(2)}s).`,
        severity: 'error',
      });
    }

    // 4. Overlaps with previous cue (Requirement 5)
    if (i > 0) {
      const prev = cues[i - 1];
      if (cue.start < prev.end - 0.01) {
        warnings.push({
          cueId: cue.id,
          type: 'overlap',
          message: `Cue overlaps with previous cue '${prev.shape}' by ${((prev.end - cue.start) * 1000).toFixed(0)}ms.`,
          severity: 'warning',
        });
      }
    }

    // 5. Open-mouth shape during detected silence (Requirement 5)
    if (silenceIntervals && openShapes.has(cue.shape)) {
      for (const sil of silenceIntervals) {
        const overlapStart = Math.max(cue.start, sil.start);
        const overlapEnd = Math.min(cue.end, sil.end);
        if (overlapEnd - overlapStart > 0.12) {
          warnings.push({
            cueId: cue.id,
            type: 'open-in-silence',
            message: `Open mouth shape '${cue.shape}' is used during detected audio silence (${(overlapEnd - overlapStart).toFixed(2)}s).`,
            severity: 'warning',
          });
          break;
        }
      }
    }
  }

  return warnings;
}
