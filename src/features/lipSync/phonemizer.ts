/**
 * Multi-Dialect Phonemizer for English, Romanized Hindi, and Hinglish.
 * Decomposes spoken words into standardized articulatory phoneme tokens.
 */

export type PhonemeCategory =
  | 'bilabial-stop'     // M, P, B, BH, PH (lips pressed together)
  | 'labiodental'       // F, V (teeth on lower lip)
  | 'dental-alveolar'   // T, D, TH, DH, N, R, L (teeth showing)
  | 'sibilant-affricate'// S, Z, SH, CH, CHH, J, JH (teeth smile)
  | 'velar-glottal'     // K, G, KH, GH, H (relaxed open)
  | 'open-vowel'        // AA, A, AH, AE (mouth open wide)
  | 'rounded-open'      // O, AO, AW, AU (rounded open)
  | 'pursed-rounded'    // OO, U, W, QU (lips pursed / puckered)
  | 'front-vowel'       // EE, I, E, Y (smile with teeth)
  | 'tongue-raised'     // TH (English tongue between teeth)
  | 'pause';            // Silence / breath

export interface PhonemeToken {
  phoneme: string;      // Sound identifier (e.g. 'm', 'p', 'b_h', 's', 'v', 'aa')
  ipa: string;          // International Phonetic Alphabet representation
  category: PhonemeCategory;
  weight: number;       // Relative duration weight in the word (0.05 to 0.60)
  minMs: number;        // Articulatory minimum frame time in milliseconds
}

export interface WordPronunciation {
  rawWord: string;
  cleanWord: string;
  language: 'hindi' | 'english' | 'hinglish';
  phonemes: PhonemeToken[];
  source: 'dictionary' | 'phoneme-rule' | 'heuristic-fallback';
}

/**
 * Verified pronunciation dictionary for high-frequency conversational Hindi, Hinglish, and English.
 */
const PRONUNCIATION_LEXICON: Record<string, { language: 'hindi' | 'english' | 'hinglish'; phonemes: PhonemeToken[] }> = {
  // --- Benchmark Words Requested by User ---
  namaste: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'n', ipa: 'n̪', category: 'dental-alveolar', weight: 0.14, minMs: 50 },
      { phoneme: 'a', ipa: 'ə', category: 'front-vowel', weight: 0.12, minMs: 50 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.22, minMs: 65 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.20, minMs: 70 },
      { phoneme: 'st', ipa: 'st̪', category: 'dental-alveolar', weight: 0.16, minMs: 55 },
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.16, minMs: 60 },
    ],
  },
  happy: {
    language: 'english',
    phonemes: [
      { phoneme: 'h', ipa: 'h', category: 'velar-glottal', weight: 0.15, minMs: 50 },
      { phoneme: 'ae', ipa: 'æ', category: 'open-vowel', weight: 0.40, minMs: 80 },
      { phoneme: 'p', ipa: 'p', category: 'bilabial-stop', weight: 0.22, minMs: 55 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.23, minMs: 60 },
    ],
  },
  thoughts: {
    language: 'english',
    phonemes: [
      { phoneme: 'th', ipa: 'θ', category: 'tongue-raised', weight: 0.25, minMs: 60 },
      { phoneme: 'aw', ipa: 'ɔː', category: 'rounded-open', weight: 0.50, minMs: 110 },
      { phoneme: 'ts', ipa: 'ts', category: 'dental-alveolar', weight: 0.25, minMs: 60 },
    ],
  },
  thought: {
    language: 'english',
    phonemes: [
      { phoneme: 'th', ipa: 'θ', category: 'tongue-raised', weight: 0.30, minMs: 60 },
      { phoneme: 'aw', ipa: 'ɔː', category: 'rounded-open', weight: 0.50, minMs: 110 },
      { phoneme: 't', ipa: 't', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
    ],
  },
  ki: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.40, minMs: 50 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.60, minMs: 70 },
    ],
  },
  taraf: {
    language: 'hindi',
    phonemes: [
      { phoneme: 't', ipa: 't̪', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.30, minMs: 75 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'f', ipa: 'f', category: 'labiodental', weight: 0.30, minMs: 65 },
    ],
  },
  aap: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.60, minMs: 90 },
      { phoneme: 'p', ipa: 'p', category: 'bilabial-stop', weight: 0.40, minMs: 65 },
    ],
  },
  aapka: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.35, minMs: 80 },
      { phoneme: 'p', ipa: 'p', category: 'bilabial-stop', weight: 0.25, minMs: 60 },
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.25, minMs: 65 },
    ],
  },
  apka: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.35, minMs: 80 },
      { phoneme: 'p', ipa: 'p', category: 'bilabial-stop', weight: 0.25, minMs: 60 },
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.25, minMs: 65 },
    ],
  },
  sabhi: {
    language: 'hindi',
    phonemes: [
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.20, minMs: 55 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.30, minMs: 75 },
      { phoneme: 'bh', ipa: 'bʱ', category: 'bilabial-stop', weight: 0.25, minMs: 65 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.25, minMs: 65 },
    ],
  },
  manan: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.24, minMs: 65 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.28, minMs: 70 },
      { phoneme: 'n', ipa: 'n̪', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.18, minMs: 60 },
      { phoneme: 'n', ipa: 'n̪', category: 'dental-alveolar', weight: 0.10, minMs: 45 },
    ],
  },
  ashram: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.30, minMs: 85 },
      { phoneme: 'sh', ipa: 'ʃ', category: 'sibilant-affricate', weight: 0.25, minMs: 65 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.10, minMs: 45 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.20, minMs: 65 },
    ],
  },
  hardik: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'h', ipa: 'ɦ', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.35, minMs: 80 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'd', ipa: 'd̪', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'ik', ipa: 'ɪk', category: 'velar-glottal', weight: 0.20, minMs: 55 },
    ],
  },
  swagat: {
    language: 'hindi',
    phonemes: [
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.16, minMs: 50 },
      { phoneme: 'w', ipa: 'ʋ', category: 'pursed-rounded', weight: 0.20, minMs: 60 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.34, minMs: 90 },
      { phoneme: 'g', ipa: 'ɡ', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 't', ipa: 't̪', category: 'dental-alveolar', weight: 0.15, minMs: 50 },
    ],
  },
  aaiye: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.55, minMs: 100 },
      { phoneme: 'iye', ipa: 'ɪjeː', category: 'front-vowel', weight: 0.45, minMs: 80 },
    ],
  },
  dhanyavaad: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'dh', ipa: 'd̪ʱ', category: 'dental-alveolar', weight: 0.16, minMs: 50 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.18, minMs: 60 },
      { phoneme: 'ny', ipa: 'n̪j', category: 'dental-alveolar', weight: 0.16, minMs: 50 },
      { phoneme: 'v', ipa: 'ʋ', category: 'labiodental', weight: 0.16, minMs: 55 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.20, minMs: 80 },
      { phoneme: 'd', ipa: 'd̪', category: 'dental-alveolar', weight: 0.14, minMs: 50 },
    ],
  },
  dhanyavad: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'dh', ipa: 'd̪ʱ', category: 'dental-alveolar', weight: 0.16, minMs: 50 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.18, minMs: 60 },
      { phoneme: 'ny', ipa: 'n̪j', category: 'dental-alveolar', weight: 0.16, minMs: 50 },
      { phoneme: 'v', ipa: 'ʋ', category: 'labiodental', weight: 0.16, minMs: 55 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.20, minMs: 80 },
      { phoneme: 'd', ipa: 'd̪', category: 'dental-alveolar', weight: 0.14, minMs: 50 },
    ],
  },
  khushi: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'kh', ipa: 'kʰ', category: 'velar-glottal', weight: 0.20, minMs: 50 },
      { phoneme: 'u', ipa: 'uː', category: 'pursed-rounded', weight: 0.35, minMs: 85 },
      { phoneme: 'sh', ipa: 'ʃ', category: 'sibilant-affricate', weight: 0.25, minMs: 65 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.20, minMs: 60 },
    ],
  },
  khoobsurat: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'kh', ipa: 'kʰ', category: 'velar-glottal', weight: 0.14, minMs: 45 },
      { phoneme: 'oo', ipa: 'uː', category: 'pursed-rounded', weight: 0.24, minMs: 80 },
      { phoneme: 'b', ipa: 'b', category: 'bilabial-stop', weight: 0.20, minMs: 65 },
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.14, minMs: 50 },
      { phoneme: 'u', ipa: 'u', category: 'pursed-rounded', weight: 0.14, minMs: 55 },
      { phoneme: 'rat', ipa: 'ɾət̪', category: 'dental-alveolar', weight: 0.14, minMs: 55 },
    ],
  },
  khubsurat: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'kh', ipa: 'kʰ', category: 'velar-glottal', weight: 0.14, minMs: 45 },
      { phoneme: 'oo', ipa: 'uː', category: 'pursed-rounded', weight: 0.24, minMs: 80 },
      { phoneme: 'b', ipa: 'b', category: 'bilabial-stop', weight: 0.20, minMs: 65 },
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.14, minMs: 50 },
      { phoneme: 'u', ipa: 'u', category: 'pursed-rounded', weight: 0.14, minMs: 55 },
      { phoneme: 'rat', ipa: 'ɾət̪', category: 'dental-alveolar', weight: 0.14, minMs: 55 },
    ],
  },
  ek: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.60, minMs: 80 },
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.40, minMs: 50 },
    ],
  },
  par: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'p', ipa: 'p', category: 'bilabial-stop', weight: 0.30, minMs: 60 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.45, minMs: 75 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  hai: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'h', ipa: 'ɦ', category: 'velar-glottal', weight: 0.25, minMs: 50 },
      { phoneme: 'ai', ipa: 'ɛː', category: 'open-vowel', weight: 0.45, minMs: 85 },
      { phoneme: 'i', ipa: 'j', category: 'front-vowel', weight: 0.30, minMs: 55 },
    ],
  },
  hain: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'h', ipa: 'ɦ', category: 'velar-glottal', weight: 0.20, minMs: 45 },
      { phoneme: 'ai', ipa: 'ɛ̃ː', category: 'open-vowel', weight: 0.45, minMs: 85 },
      { phoneme: 'n', ipa: 'n̪', category: 'dental-alveolar', weight: 0.35, minMs: 55 },
    ],
  },
  bhi: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'bh', ipa: 'bʱ', category: 'bilabial-stop', weight: 0.40, minMs: 70 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.60, minMs: 80 },
    ],
  },
  bahut: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'b', ipa: 'b', category: 'bilabial-stop', weight: 0.25, minMs: 60 },
      { phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 0.25, minMs: 65 },
      { phoneme: 'u', ipa: 'ɦʊ', category: 'pursed-rounded', weight: 0.30, minMs: 75 },
      { phoneme: 't', ipa: 't̪', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
    ],
  },
  se: {
    language: 'hindi',
    phonemes: [
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.35, minMs: 55 },
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.65, minMs: 80 },
    ],
  },
  aur: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'au', ipa: 'ɔːr', category: 'rounded-open', weight: 0.65, minMs: 90 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.35, minMs: 50 },
    ],
  },
  kya: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'ky', ipa: 'kj', category: 'velar-glottal', weight: 0.30, minMs: 50 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.70, minMs: 100 },
    ],
  },
  hi: {
    language: 'english',
    phonemes: [
      { phoneme: 'h', ipa: 'h', category: 'velar-glottal', weight: 0.20, minMs: 45 },
      { phoneme: 'ai', ipa: 'aɪ', category: 'open-vowel', weight: 0.80, minMs: 90 },
    ],
  },
  hello: {
    language: 'english',
    phonemes: [
      { phoneme: 'h', ipa: 'h', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 'e', ipa: 'ɛ', category: 'front-vowel', weight: 0.25, minMs: 65 },
      { phoneme: 'l', ipa: 'l', category: 'dental-alveolar', weight: 0.25, minMs: 55 },
      { phoneme: 'o', ipa: 'oʊ', category: 'rounded-open', weight: 0.35, minMs: 85 },
    ],
  },
  hey: {
    language: 'english',
    phonemes: [
      { phoneme: 'h', ipa: 'h', category: 'velar-glottal', weight: 0.25, minMs: 45 },
      { phoneme: 'ey', ipa: 'eɪ', category: 'open-vowel', weight: 0.75, minMs: 85 },
    ],
  },
  my: {
    language: 'english',
    phonemes: [
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.35, minMs: 65 },
      { phoneme: 'ai', ipa: 'aɪ', category: 'open-vowel', weight: 0.65, minMs: 85 },
    ],
  },
  me: {
    language: 'english',
    phonemes: [
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.35, minMs: 65 },
      { phoneme: 'ee', ipa: 'iː', category: 'front-vowel', weight: 0.65, minMs: 80 },
    ],
  },
  name: {
    language: 'english',
    phonemes: [
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
      { phoneme: 'ey', ipa: 'eɪ', category: 'front-vowel', weight: 0.45, minMs: 75 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.30, minMs: 65 },
    ],
  },
  is: {
    language: 'english',
    phonemes: [
      { phoneme: 'i', ipa: 'ɪ', category: 'front-vowel', weight: 0.55, minMs: 65 },
      { phoneme: 'z', ipa: 'z', category: 'dental-alveolar', weight: 0.45, minMs: 55 },
    ],
  },
  it: {
    language: 'english',
    phonemes: [
      { phoneme: 'i', ipa: 'ɪ', category: 'front-vowel', weight: 0.55, minMs: 65 },
      { phoneme: 't', ipa: 't', category: 'dental-alveolar', weight: 0.45, minMs: 50 },
    ],
  },
  i: {
    language: 'english',
    phonemes: [
      { phoneme: 'ai', ipa: 'aɪ', category: 'open-vowel', weight: 1.0, minMs: 80 },
    ],
  },
  am: {
    language: 'english',
    phonemes: [
      { phoneme: 'ae', ipa: 'æ', category: 'open-vowel', weight: 0.55, minMs: 75 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.45, minMs: 65 },
    ],
  },
  you: {
    language: 'english',
    phonemes: [
      { phoneme: 'y', ipa: 'j', category: 'front-vowel', weight: 0.25, minMs: 50 },
      { phoneme: 'oo', ipa: 'uː', category: 'pursed-rounded', weight: 0.75, minMs: 90 },
    ],
  },
  your: {
    language: 'english',
    phonemes: [
      { phoneme: 'y', ipa: 'j', category: 'front-vowel', weight: 0.25, minMs: 50 },
      { phoneme: 'o', ipa: 'ɔːr', category: 'rounded-open', weight: 0.75, minMs: 85 },
    ],
  },
  the: {
    language: 'english',
    phonemes: [
      { phoneme: 'th', ipa: 'ð', category: 'tongue-raised', weight: 0.35, minMs: 55 },
      { phoneme: 'e', ipa: 'ə', category: 'front-vowel', weight: 0.65, minMs: 65 },
    ],
  },
  this: {
    language: 'english',
    phonemes: [
      { phoneme: 'th', ipa: 'ð', category: 'tongue-raised', weight: 0.25, minMs: 55 },
      { phoneme: 'i', ipa: 'ɪ', category: 'front-vowel', weight: 0.45, minMs: 65 },
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.30, minMs: 55 },
    ],
  },
  that: {
    language: 'english',
    phonemes: [
      { phoneme: 'th', ipa: 'ð', category: 'tongue-raised', weight: 0.25, minMs: 55 },
      { phoneme: 'ae', ipa: 'æ', category: 'open-vowel', weight: 0.50, minMs: 75 },
      { phoneme: 't', ipa: 't', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  to: {
    language: 'english',
    phonemes: [
      { phoneme: 't', ipa: 't', category: 'dental-alveolar', weight: 0.30, minMs: 50 },
      { phoneme: 'oo', ipa: 'uː', category: 'pursed-rounded', weight: 0.70, minMs: 80 },
    ],
  },
  and: {
    language: 'english',
    phonemes: [
      { phoneme: 'ae', ipa: 'æ', category: 'open-vowel', weight: 0.55, minMs: 70 },
      { phoneme: 'nd', ipa: 'nd', category: 'dental-alveolar', weight: 0.45, minMs: 60 },
    ],
  },
  a: {
    language: 'english',
    phonemes: [{ phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 1.0, minMs: 60 }],
  },
  an: {
    language: 'english',
    phonemes: [
      { phoneme: 'ae', ipa: 'æ', category: 'open-vowel', weight: 0.60, minMs: 65 },
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.40, minMs: 50 },
    ],
  },
  are: {
    language: 'english',
    phonemes: [{ phoneme: 'aa', ipa: 'ɑːr', category: 'open-vowel', weight: 1.0, minMs: 80 }],
  },
  welcome: {
    language: 'english',
    phonemes: [
      { phoneme: 'w', ipa: 'w', category: 'pursed-rounded', weight: 0.20, minMs: 55 },
      { phoneme: 'e', ipa: 'ɛ', category: 'front-vowel', weight: 0.25, minMs: 65 },
      { phoneme: 'l', ipa: 'l', category: 'dental-alveolar', weight: 0.15, minMs: 50 },
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.15, minMs: 45 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.25, minMs: 65 },
    ],
  },
  yes: {
    language: 'english',
    phonemes: [
      { phoneme: 'y', ipa: 'j', category: 'front-vowel', weight: 0.25, minMs: 50 },
      { phoneme: 'e', ipa: 'ɛ', category: 'front-vowel', weight: 0.45, minMs: 65 },
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.30, minMs: 55 },
    ],
  },
  no: {
    language: 'english',
    phonemes: [
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.30, minMs: 50 },
      { phoneme: 'o', ipa: 'oʊ', category: 'rounded-open', weight: 0.70, minMs: 85 },
    ],
  },
  what: {
    language: 'english',
    phonemes: [
      { phoneme: 'w', ipa: 'w', category: 'pursed-rounded', weight: 0.30, minMs: 55 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.45, minMs: 70 },
      { phoneme: 't', ipa: 't', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  how: {
    language: 'english',
    phonemes: [
      { phoneme: 'h', ipa: 'h', category: 'velar-glottal', weight: 0.25, minMs: 45 },
      { phoneme: 'au', ipa: 'aʊ', category: 'rounded-open', weight: 0.75, minMs: 90 },
    ],
  },
  good: {
    language: 'english',
    phonemes: [
      { phoneme: 'g', ipa: 'ɡ', category: 'velar-glottal', weight: 0.25, minMs: 50 },
      { phoneme: 'oo', ipa: 'ʊ', category: 'pursed-rounded', weight: 0.50, minMs: 75 },
      { phoneme: 'd', ipa: 'd', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  fine: {
    language: 'english',
    phonemes: [
      { phoneme: 'f', ipa: 'f', category: 'labiodental', weight: 0.30, minMs: 60 },
      { phoneme: 'ai', ipa: 'aɪ', category: 'open-vowel', weight: 0.45, minMs: 80 },
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  very: {
    language: 'english',
    phonemes: [
      { phoneme: 'v', ipa: 'v', category: 'labiodental', weight: 0.30, minMs: 60 },
      { phoneme: 'e', ipa: 'ɛ', category: 'front-vowel', weight: 0.40, minMs: 65 },
      { phoneme: 'i', ipa: 'i', category: 'front-vowel', weight: 0.30, minMs: 60 },
    ],
  },
  accha: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.35, minMs: 70 },
      { phoneme: 'cch', ipa: 'tʃʰ', category: 'sibilant-affricate', weight: 0.35, minMs: 65 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.30, minMs: 80 },
    ],
  },
  achha: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.35, minMs: 70 },
      { phoneme: 'cch', ipa: 'tʃʰ', category: 'sibilant-affricate', weight: 0.35, minMs: 65 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.30, minMs: 80 },
    ],
  },
  shukriya: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'sh', ipa: 'ʃ', category: 'sibilant-affricate', weight: 0.25, minMs: 60 },
      { phoneme: 'u', ipa: 'ʊ', category: 'pursed-rounded', weight: 0.30, minMs: 70 },
      { phoneme: 'kr', ipa: 'kɾ', category: 'velar-glottal', weight: 0.20, minMs: 50 },
      { phoneme: 'ya', ipa: 'jɑː', category: 'open-vowel', weight: 0.25, minMs: 75 },
    ],
  },
  alvida: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.20, minMs: 60 },
      { phoneme: 'l', ipa: 'l', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'v', ipa: 'ʋ', category: 'labiodental', weight: 0.25, minMs: 55 },
      { phoneme: 'i', ipa: 'ɪ', category: 'front-vowel', weight: 0.20, minMs: 55 },
      { phoneme: 'da', ipa: 'd̪ɑː', category: 'open-vowel', weight: 0.20, minMs: 75 },
    ],
  },
  kyun: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'ky', ipa: 'kj', category: 'velar-glottal', weight: 0.25, minMs: 50 },
      { phoneme: 'oo', ipa: 'ũː', category: 'pursed-rounded', weight: 0.50, minMs: 80 },
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  kyon: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'ky', ipa: 'kj', category: 'velar-glottal', weight: 0.25, minMs: 50 },
      { phoneme: 'o', ipa: 'õː', category: 'rounded-open', weight: 0.50, minMs: 80 },
      { phoneme: 'n', ipa: 'n', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  kaise: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'k', ipa: 'k', category: 'velar-glottal', weight: 0.25, minMs: 50 },
      { phoneme: 'ai', ipa: 'ɛː', category: 'open-vowel', weight: 0.35, minMs: 75 },
      { phoneme: 's', ipa: 's', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.20, minMs: 65 },
    ],
  },
  hum: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'h', ipa: 'ɦ', category: 'velar-glottal', weight: 0.25, minMs: 45 },
      { phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.40, minMs: 70 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.35, minMs: 65 },
    ],
  },
  tum: {
    language: 'hindi',
    phonemes: [
      { phoneme: 't', ipa: 't̪', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
      { phoneme: 'u', ipa: 'ʊ', category: 'pursed-rounded', weight: 0.40, minMs: 70 },
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.35, minMs: 65 },
    ],
  },
  mera: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.25, minMs: 65 },
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.35, minMs: 70 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.25, minMs: 75 },
    ],
  },
  meri: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'm', ipa: 'm', category: 'bilabial-stop', weight: 0.25, minMs: 65 },
      { phoneme: 'e', ipa: 'eː', category: 'front-vowel', weight: 0.35, minMs: 70 },
      { phoneme: 'r', ipa: 'ɾ', category: 'dental-alveolar', weight: 0.15, minMs: 45 },
      { phoneme: 'i', ipa: 'iː', category: 'front-vowel', weight: 0.25, minMs: 65 },
    ],
  },
  shanti: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'sh', ipa: 'ʃ', category: 'sibilant-affricate', weight: 0.25, minMs: 60 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.35, minMs: 75 },
      { phoneme: 'n', ipa: 'n̪', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'ti', ipa: 't̪iː', category: 'front-vowel', weight: 0.20, minMs: 60 },
    ],
  },
  baat: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'b', ipa: 'b', category: 'bilabial-stop', weight: 0.30, minMs: 65 },
      { phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.45, minMs: 80 },
      { phoneme: 't', ipa: 't̪', category: 'dental-alveolar', weight: 0.25, minMs: 50 },
    ],
  },
  zindagi: {
    language: 'hindi',
    phonemes: [
      { phoneme: 'z', ipa: 'z', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'i', ipa: 'ɪ', category: 'front-vowel', weight: 0.25, minMs: 60 },
      { phoneme: 'nd', ipa: 'n̪d̪', category: 'dental-alveolar', weight: 0.20, minMs: 50 },
      { phoneme: 'a', ipa: 'ə', category: 'front-vowel', weight: 0.15, minMs: 45 },
      { phoneme: 'gi', ipa: 'ɡiː', category: 'front-vowel', weight: 0.20, minMs: 65 },
    ],
  },
};

/**
 * Phonemizes an individual word using the pronunciation lexicon, or systematic Hindi/English phonological rules.
 */
export function phonemizeWord(rawWord: string): WordPronunciation {
  const cleanWord = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!cleanWord) {
    return {
      rawWord,
      cleanWord: '',
      language: 'english',
      phonemes: [{ phoneme: 'pause', ipa: 'x', category: 'pause', weight: 1.0, minMs: 40 }],
      source: 'heuristic-fallback',
    };
  }

  // 1. Direct dictionary match
  if (PRONUNCIATION_LEXICON[cleanWord]) {
    const entry = PRONUNCIATION_LEXICON[cleanWord];
    return {
      rawWord,
      cleanWord,
      language: entry.language,
      phonemes: entry.phonemes.map((p) => ({ ...p })),
      source: 'dictionary',
    };
  }

  // 2. Systematic Rule-Based Phonemizer (Indo-Aryan Hindi / Hinglish phonology prioritized)
  const phonemes: PhonemeToken[] = [];
  let i = 0;
  const len = cleanWord.length;

  while (i < len) {
    const ch = cleanWord[i];
    const next = cleanWord[i + 1] || '';
    const next2 = cleanWord[i + 2] || '';

    // Aspirated Bilabial Stop (BH as in "bhai", "sabhi") -> bilabial closure
    if (ch === 'b' && next === 'h') {
      phonemes.push({ phoneme: 'bh', ipa: 'bʱ', category: 'bilabial-stop', weight: 0.28, minMs: 65 });
      i += 2;
      continue;
    }

    // Bilabial Stops (M, P, B, double consonants PP, BB, MM)
    if (ch === 'm' || ch === 'p' || ch === 'b') {
      const skip = (next === ch) ? 2 : 1;
      phonemes.push({ phoneme: ch, ipa: ch, category: 'bilabial-stop', weight: 0.26, minMs: 60 });
      i += skip;
      continue;
    }

    // Labiodental Fricatives (F, V, PH)
    if (ch === 'f' || ch === 'v' || (ch === 'p' && next === 'h')) {
      const skip = (ch === 'p' && next === 'h') ? 2 : (next === ch ? 2 : 1);
      phonemes.push({ phoneme: 'f', ipa: 'f', category: 'labiodental', weight: 0.26, minMs: 60 });
      i += skip;
      continue;
    }

    // Aspirated Velars (KH as in "khushi", GH as in "ghar")
    if ((ch === 'k' && next === 'h') || (ch === 'g' && next === 'h')) {
      phonemes.push({ phoneme: ch + 'h', ipa: ch === 'k' ? 'kʰ' : 'ɡʱ', category: 'velar-glottal', weight: 0.24, minMs: 50 });
      i += 2;
      continue;
    }

    // Sibilants and Affricates (SH, CH, CHH, JH, J, ZH)
    if (
      (ch === 's' && next === 'h') ||
      (ch === 'c' && next === 'h') ||
      (ch === 'j' && next === 'h') ||
      (ch === 'z' && next === 'h') ||
      ch === 'j'
    ) {
      let skip = (ch === 'j') ? 1 : 2;
      if (ch === 'c' && next === 'h' && next2 === 'h') {
        skip = 3; // 'chh'
      }
      phonemes.push({ phoneme: 'sh', ipa: 'ʃ', category: 'sibilant-affricate', weight: 0.26, minMs: 60 });
      i += skip;
      continue;
    }

    // Dental / Alveolar Stops (TH, DH, L)
    if ((ch === 't' && next === 'h') || (ch === 'd' && next === 'h') || ch === 'l') {
      const skip = (next === 'h') ? 2 : (next === 'l' ? 2 : 1);
      const isDental = (ch === 't' && next === 'h') || (ch === 'd' && next === 'h');
      phonemes.push({
        phoneme: isDental ? ch + 'h' : 'l',
        ipa: isDental ? (ch === 't' ? 't̪ʰ' : 'd̪ʱ') : 'l',
        category: 'dental-alveolar',
        weight: 0.22,
        minMs: 50,
      });
      i += skip;
      continue;
    }

    // Rounded Glides & Labiovelar (W, WH, QU)
    if (ch === 'w' || (ch === 'q' && next === 'u') || (ch === 'w' && next === 'h')) {
      const skip = (ch === 'q' || next === 'h') ? 2 : 1;
      phonemes.push({ phoneme: 'w', ipa: 'ʋ', category: 'pursed-rounded', weight: 0.24, minMs: 55 });
      i += skip;
      continue;
    }

    // Long Vowels (AA, EE, OO)
    if (ch === 'a' && next === 'a') {
      phonemes.push({ phoneme: 'aa', ipa: 'ɑː', category: 'open-vowel', weight: 0.45, minMs: 85 });
      i += 2;
      continue;
    }
    if (ch === 'e' && next === 'e') {
      phonemes.push({ phoneme: 'ee', ipa: 'iː', category: 'front-vowel', weight: 0.40, minMs: 75 });
      i += 2;
      continue;
    }
    if (ch === 'o' && next === 'o') {
      phonemes.push({ phoneme: 'oo', ipa: 'uː', category: 'pursed-rounded', weight: 0.45, minMs: 80 });
      i += 2;
      continue;
    }

    // Diphthongs (AI, AY, AU, AW, OI, OY)
    if ((ch === 'a' && (next === 'i' || next === 'y')) || (ch === 'e' && next === 'i')) {
      phonemes.push({ phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.28, minMs: 60 });
      phonemes.push({ phoneme: 'i', ipa: 'j', category: 'front-vowel', weight: 0.24, minMs: 55 });
      i += 2;
      continue;
    }
    if (ch === 'a' && (next === 'u' || next === 'w')) {
      phonemes.push({ phoneme: 'a', ipa: 'ɑː', category: 'open-vowel', weight: 0.30, minMs: 65 });
      phonemes.push({ phoneme: 'u', ipa: 'ʊ', category: 'pursed-rounded', weight: 0.25, minMs: 55 });
      i += 2;
      continue;
    }
    if (ch === 'o' && (next === 'u' || next === 'w')) {
      phonemes.push({ phoneme: 'o', ipa: 'oː', category: 'rounded-open', weight: 0.30, minMs: 65 });
      phonemes.push({ phoneme: 'u', ipa: 'ʊ', category: 'pursed-rounded', weight: 0.25, minMs: 55 });
      i += 2;
      continue;
    }

    // Single Vowels
    if (ch === 'a') {
      phonemes.push({ phoneme: 'a', ipa: 'ʌ', category: 'open-vowel', weight: 0.36, minMs: 70 });
      i++;
      continue;
    }
    if (ch === 'e' || ch === 'i' || ch === 'y') {
      phonemes.push({ phoneme: ch, ipa: 'ɪ', category: 'front-vowel', weight: 0.32, minMs: 60 });
      i++;
      continue;
    }
    if (ch === 'o') {
      phonemes.push({ phoneme: 'o', ipa: 'oː', category: 'rounded-open', weight: 0.36, minMs: 70 });
      i++;
      continue;
    }
    if (ch === 'u') {
      phonemes.push({ phoneme: 'u', ipa: 'uː', category: 'pursed-rounded', weight: 0.36, minMs: 70 });
      i++;
      continue;
    }

    // Dentals / Alveolars (S, T, D, N, Z, R)
    if (ch === 's' || ch === 't' || ch === 'd' || ch === 'z' || ch === 'n' || ch === 'r') {
      const skip = (next === ch) ? 2 : 1;
      phonemes.push({ phoneme: ch, ipa: ch, category: 'dental-alveolar', weight: 0.22, minMs: 50 });
      i += skip;
      continue;
    }

    // Velars & Glottals (K, G, C, Q, X, H)
    phonemes.push({ phoneme: ch, ipa: ch, category: 'velar-glottal', weight: 0.20, minMs: 45 });
    i++;
  }

  if (phonemes.length === 0) {
    return {
      rawWord,
      cleanWord,
      language: 'hinglish',
      phonemes: [{ phoneme: 'a', ipa: 'ə', category: 'open-vowel', weight: 1.0, minMs: 60 }],
      source: 'heuristic-fallback',
    };
  }

  // Normalize weights to sum to 1.0
  const totalW = phonemes.reduce((sum, p) => sum + p.weight, 0);
  if (totalW > 0) {
    for (const p of phonemes) {
      p.weight /= totalW;
    }
  }

  return {
    rawWord,
    cleanWord,
    language: 'hinglish',
    phonemes,
    source: 'phoneme-rule',
  };
}
