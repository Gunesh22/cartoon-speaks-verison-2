import { LipSyncData } from './lipSync';

export type TrackId = 'V1' | 'V2' | 'V3' | 'V4';

export const TRACK_IDS: TrackId[] = ['V4', 'V3', 'V2', 'V1']; // Render order: V1 bottom, V4 top

export type AudioTrackId = 'A1' | 'A2';
export const AUDIO_TRACK_IDS: AudioTrackId[] = ['A1', 'A2'];

export interface TransformKeyframe {
  id: string;
  time: number; // in seconds relative to clip start (0 <= time <= clip.duration)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number; // degrees
  opacity?: number; // 0..1
  easing?: 'linear' | 'ease-in-out' | 'hold';
}

export interface VisualClip {
  id: string;
  assetId: string;
  start: number; // in seconds
  duration: number; // in seconds
  x: number; // canvas x (pixels)
  y: number; // canvas y (pixels)
  width: number; // rendered width (pixels)
  height: number; // rendered height (pixels)
  rotation: number; // degrees
  opacity: number; // 0..1
  visible: boolean;
  type: 'image' | 'lipSync';
  lipSyncData?: LipSyncData;
  idleMotion?: boolean; // Procedural breathing & subtle sway (Feature 03)
  keyframes?: TransformKeyframe[]; // Animated transform keyframes (Feature 11)
}

export interface Track {
  id: TrackId;
  clips: VisualClip[];
}

export interface AudioClip {
  id: string;
  assetId: string;
  start: number; // in seconds on global timeline
  duration: number; // in seconds
  volume: number; // 0..1
  trimStart: number; // offset into source audio in seconds
  trimEnd: number; // end offset into source audio in seconds
  fadeIn?: number; // fade-in duration in seconds (Feature 09)
  fadeOut?: number; // fade-out duration in seconds (Feature 09)
  trackId?: AudioTrackId; // 'A1' (Dialogue) or 'A2' (BGM / SFX) (Feature 07)
}
