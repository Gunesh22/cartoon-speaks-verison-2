export type LipSyncSpeed = 'slower' | 'natural' | 'faster';
export type TransitionSmoothness = 'low' | 'medium' | 'high';

export type RhubarbShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X' | 'O';

export type CueAlignmentSource =
  | 'rhubarb'
  | 'heuristic'
  | 'manual'
  | 'dictionary'
  | 'phoneme-rule'
  | 'heuristic-fallback'
  | 'unknown';

export interface CueWarning {
  cueId: string;
  type: 'long-duration' | 'open-in-silence' | 'exceeds-duration' | 'overlap' | 'negative-duration';
  message: string;
  severity: 'warning' | 'error';
}

export interface LipSyncTuningSettings {
  speed: LipSyncSpeed;
  smoothness: TransitionSmoothness;
  minDurationMs: number; // in milliseconds (default 90)
}

export const DEFAULT_LIPSYNC_TUNING: LipSyncTuningSettings = {
  speed: 'natural',
  smoothness: 'medium',
  minDurationMs: 90,
};

export interface ShapeTuning {
  scaleMultiplier?: number; // e.g. 1.0 = 100%, 0.8 = 80%, 1.2 = 120%
  offsetX?: number; // normalized offset relative to character width
  offsetY?: number; // normalized offset relative to character height
}

export interface MouthCue {
  id: string;
  start: number; // in seconds relative to clip start
  end: number;   // in seconds relative to clip start
  mouthId: string; // Rhubarb shape: A, B, C, D, E, F, G, H, X, O
  shape?: RhubarbShape | string;
  text?: string;
  phoneme?: string;
  ipa?: string;
  source?: CueAlignmentSource;
}

export interface LipSyncData {
  audioAssetId: string;
  mouthSetId?: string;
  characterAssetId: string;
  cues: MouthCue[];
  mouthAnchor: {
    x: number; // 0..1 normalized on character (outside anchor)
    y: number; // 0..1 normalized on character (outside anchor)
  };
  spriteAnchor?: {
    anchorX: number; // 0..1 normalized within mouth sprite (inside anchor, default 0.5)
    anchorY: number; // 0..1 normalized within mouth sprite (inside anchor, default 0.5)
  };
  mouthScale: number; // Default 0.25 (25% of character width)
  mouthRotation?: number; // In degrees
  referenceCellWidth?: number; // Reference sprite sheet cell width for proportional scaling
  referenceCellHeight?: number;
  sizingMode?: 'proportional' | 'uniform';
  tuning?: LipSyncTuningSettings;
  shapeTunings?: Record<string, ShapeTuning>; // Per-shape fine tuning overrides
}

export interface RhubarbOutputCue {
  start: number;
  end: number;
  value: string;
}

export interface RhubarbJsonOutput {
  metadata?: {
    duration?: number;
    soundFile?: string;
  };
  mouthCues?: RhubarbOutputCue[];
}
