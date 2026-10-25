import { Track, AudioClip } from './timeline';

export type AspectRatioPreset = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | 'custom';

export interface AspectRatioOption {
  id: AspectRatioPreset;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const ASPECT_RATIO_PRESETS: AspectRatioOption[] = [
  { id: '16:9', label: '16:9 Landscape', width: 1920, height: 1080, description: 'YouTube, TV, Desktop (1920×1080)' },
  { id: '9:16', label: '9:16 Vertical', width: 1080, height: 1920, description: 'TikTok, Instagram Reels, Shorts (1080×1920)' },
  { id: '1:1', label: '1:1 Square', width: 1080, height: 1080, description: 'Instagram Feed, Square Video (1080×1080)' },
  { id: '4:5', label: '4:5 Portrait', width: 1080, height: 1350, description: 'Social Media Portrait (1080×1350)' },
  { id: '4:3', label: '4:3 Standard', width: 1440, height: 1080, description: 'Classic TV / Presentation (1440×1080)' },
];

export function getProjectAspectRatio(width: number, height: number): AspectRatioPreset {
  if (width === 1920 && height === 1080) return '16:9';
  if (width === 1080 && height === 1920) return '9:16';
  if (width === 1080 && height === 1080) return '1:1';
  if (width === 1080 && height === 1350) return '4:5';
  if (width === 1440 && height === 1080) return '4:3';
  return 'custom';
}

export interface AudioTrackSettings {
  volume: number; // 0..1, default 1.0
  muted: boolean; // default false
  solo: boolean; // default false
}

export interface EditorProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // total duration in seconds
  autoFitToStory?: boolean; // When true, playback and export end at storyEnd (visuals + dialogue) without trimming music
  tracks: Track[];
  audioClips: AudioClip[];
  audioTrackSettings?: {
    A1?: AudioTrackSettings;
    A2?: AudioTrackSettings;
  };
  createdAt: number;
  updatedAt: number;
}

export function createDefaultProject(
  name: string = 'Untitled Project',
  width: number = 1920,
  height: number = 1080,
  fps: number = 30
): EditorProject {
  return {
    id: 'proj_' + Math.random().toString(36).substring(2, 9),
    name,
    width,
    height,
    fps,
    duration: 10, // 10 seconds default
    autoFitToStory: true,
    tracks: [
      { id: 'V1', clips: [] },
      { id: 'V2', clips: [] },
      { id: 'V3', clips: [] },
      { id: 'V4', clips: [] },
    ],
    audioClips: [],
    audioTrackSettings: {
      A1: { volume: 1.0, muted: false, solo: false },
      A2: { volume: 0.8, muted: false, solo: false },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
