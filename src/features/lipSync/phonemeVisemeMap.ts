import { PhonemeCategory, PhonemeToken } from './phonemizer';
import { RhubarbShape } from '../../types/lipSync';

export interface MappedViseme {
  shape: RhubarbShape | string;
  phoneme: string;
  ipa: string;
  category: PhonemeCategory;
  weight: number;
  minMs: number;
}

/**
 * Maps a single phoneme token to the character's sprite sheet shape.
 *
 * Rhubarb Specification & Sprite Mapping:
 * - A: Closed mouth, lips pressed together (Bilabials: M, B, P, BH)
 * - B: Slightly open with teeth showing (Dentals / Alveolars: T, D, S, Z, N, R, DH, TH-Hindi)
 * - C: Open relaxed / smile (Velars & Front Vowels: K, G, KH, GH, H, EE, I, E)
 * - D: Wide open mouth (Open Vowels: AA, A, AH, AE)
 * - E: Slightly rounded open mouth (Rounded Vowels: O, AO, AW)
 * - F: Upper teeth resting on lower lip (Labiodentals: F, V, PH)
 * - G: Smile with teeth visible (Sibilants & Affricates: SH, CH, CHH, J, JH)
 * - H: Open mouth with tongue raised (Linguals: TH-English, L)
 * - O: Small pursed / rounded opening (Glides & Back Vowels: W, U, OO, QU)
 * - X: Rest / Neutral idle shape (Silence, pause)
 */
export function mapPhonemeToViseme(token: PhonemeToken): RhubarbShape {
  switch (token.category) {
    case 'bilabial-stop':
      return 'A'; // Lips closed (M, P, B, BH)

    case 'labiodental':
      return 'F'; // Teeth on lip (F, V)

    case 'sibilant-affricate':
      return 'G'; // Teeth smile (SH, CH, J)

    case 'tongue-raised':
      return 'H'; // Tongue behind teeth (English TH)

    case 'open-vowel':
      return 'D'; // Open wide (AA, A)

    case 'rounded-open':
      return 'E'; // Rounded open (O, AO, AW)

    case 'pursed-rounded':
      return 'O'; // Pursed / puckered (W, OO, U)

    case 'front-vowel':
      return 'C'; // Smile / front vowel (EE, I, E)

    case 'velar-glottal':
      return 'C'; // Relaxed open (K, G, KH, H)

    case 'dental-alveolar':
      return 'B'; // Teeth showing (T, D, S, N, R)

    case 'pause':
    default:
      return 'X'; // Rest
  }
}

/**
 * Transforms an array of phoneme tokens into coarticulated, sequence-preserving viseme frames.
 * Adjacent identical viseme shapes are coarticulated (merged into a combined weight).
 */
export function phonemesToVisemes(phonemes: PhonemeToken[]): MappedViseme[] {
  if (phonemes.length === 0) {
    return [{
      shape: 'X',
      phoneme: 'silence',
      ipa: 'x',
      category: 'pause',
      weight: 1.0,
      minMs: 40,
    }];
  }

  const rawVisemes: MappedViseme[] = phonemes.map((p) => ({
    shape: mapPhonemeToViseme(p),
    phoneme: p.phoneme,
    ipa: p.ipa,
    category: p.category,
    weight: p.weight,
    minMs: p.minMs,
  }));

  // Coarticulation pass: merge adjacent phonemes that share the exact same mouth shape
  // e.g. /k/ ('C') + /iː/ ('C') -> 'C' with combined weight and combined IPA
  const coarticulated: MappedViseme[] = [];
  for (const v of rawVisemes) {
    const prev = coarticulated[coarticulated.length - 1];
    if (prev && prev.shape === v.shape) {
      prev.weight += v.weight;
      prev.minMs = Math.max(prev.minMs, v.minMs);
      prev.phoneme = `${prev.phoneme}+${v.phoneme}`;
      prev.ipa = `${prev.ipa}${v.ipa}`;
    } else {
      coarticulated.push({ ...v });
    }
  }

  // Normalize weights so they sum to 1.0
  const totalW = coarticulated.reduce((sum, v) => sum + v.weight, 0);
  if (totalW > 0) {
    for (const v of coarticulated) {
      v.weight /= totalW;
    }
  }

  return coarticulated;
}
