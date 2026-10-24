import { create } from 'zustand';
import { EditorProject, createDefaultProject, AspectRatioPreset, ASPECT_RATIO_PRESETS } from '../types/project';
import { TrackId, VisualClip, AudioClip } from '../types/timeline';
import { EditorAsset, MouthSetAsset } from '../types/assets';
import {
  moveVisualClip,
  trimClipStart,
  trimClipEnd,
  getSnapTargets,
  snapTimeToTargets,
  validateTracks,
  calculateProjectDuration,
  calculateFitToScreen,
} from '../core/timeline/timelineMath';
import {
  saveProjectToDb,
  loadAllAssets,
  loadAllMouthSets,
  saveAsset as dbSaveAsset,
  saveMouthSet as dbSaveMouthSet,
  deleteAssetFromDb,
  deleteMouthSetFromDb,
  clearAllAssetsFromDb,
} from '../core/assets/assetDb';
import { audioEngine } from '../core/audio/audioEngine';

export type CurrentScreenView = 'projects' | 'editor';

interface EditorState {
  currentView: CurrentScreenView;
  project: EditorProject;
  assets: Map<string, EditorAsset>;
  mouthSets: Map<string, MouthSetAsset>;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedClipTrackId: TrackId | 'audio' | null;
  timelineZoom: number; // Pixels per second
  canvasZoom: number;
  showCheckerboard: boolean;
  diagnosticMode: boolean;
  isLipSyncModalOpen: boolean;
  isExportModalOpen: boolean;
  isProjectModalOpen: boolean;
  isPromptModalOpen: boolean;
  history: EditorProject[];
  historyIndex: number;

  // Actions
  initStore: () => Promise<void>;
  setCurrentView: (view: CurrentScreenView) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  setProject: (project: EditorProject) => void;
  newProject: (name?: string, width?: number, height?: number, fps?: number) => void;
  saveProject: () => Promise<void>;
  renameProject: (name: string) => void;
  setProjectDimensions: (width: number, height: number) => void;
  setAspectRatioPreset: (preset: AspectRatioPreset) => void;
  setProjectDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => Promise<void>;
  stopPlayback: () => void;
  setTimelineZoom: (zoom: number) => void;
  setCanvasZoom: (zoom: number) => void;
  toggleCheckerboard: () => void;
  toggleDiagnosticMode: () => void;
  setLipSyncModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setProjectModalOpen: (open: boolean) => void;
  setPromptModalOpen: (open: boolean) => void;
  
  // Asset Actions
  addAsset: (asset: Omit<EditorAsset, 'url'>) => Promise<EditorAsset>;
  deleteAsset: (assetId: string) => Promise<void>;
  addMouthSet: (mouthSet: MouthSetAsset) => Promise<void>;
  deleteMouthSet: (mouthSetId: string) => Promise<void>;
  clearAllAssets: () => Promise<void>;

  // Clip Actions
  selectClip: (clipId: string | null, trackId?: TrackId | 'audio' | null) => void;
  addVisualClip: (trackId: TrackId, clip: VisualClip) => void;
  updateVisualClip: (clipId: string, updates: Partial<VisualClip>, recordHistory?: boolean) => void;
  moveClip: (clipId: string, newStart: number, targetTrackId?: TrackId, recordHistory?: boolean) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', newTime: number, recordHistory?: boolean) => void;
  duplicateClip: (clipId: string) => void;
  removeClip: (clipId: string) => void;
  fitClipToScreen: (clipId: string, mode?: 'contain' | 'cover') => void;
  centerClipOnScreen: (clipId: string) => void;
  resetClipSize: (clipId: string) => void;

  // Audio Clip Actions
  addAudioClip: (clip: AudioClip) => void;
  updateAudioClip: (clipId: string, updates: Partial<AudioClip>, recordHistory?: boolean) => void;
  moveAudioClip: (clipId: string, newStart: number, recordHistory?: boolean) => void;
  trimAudioClip: (clipId: string, edge: 'start' | 'end', newTime: number, recordHistory?: boolean) => void;
  removeAudioClip: (clipId: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentView: 'projects', // Start at the Project Window Hub
  project: createDefaultProject(),
  assets: new Map(),
  mouthSets: new Map(),
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  selectedClipTrackId: null,
  timelineZoom: 60, // 60px per second default
  canvasZoom: 0.6,
  showCheckerboard: false,
  diagnosticMode: false,
  isLipSyncModalOpen: false,
  isExportModalOpen: false,
  isProjectModalOpen: false,
  isPromptModalOpen: false,
  history: [],
  historyIndex: -1,

  initStore: async () => {
    try {
      const storedAssets = await loadAllAssets();
      const assetMap = new Map<string, EditorAsset>();
      for (const a of storedAssets) {
        assetMap.set(a.id, a);
        if (a.type === 'audio') {
          audioEngine.preloadAudio(a.id, a.blob, a.url);
        }
      }

      const storedMouthSets = await loadAllMouthSets();
      const mouthSetMap = new Map<string, MouthSetAsset>();
      for (const m of storedMouthSets) mouthSetMap.set(m.id, m);

      set({ assets: assetMap, mouthSets: mouthSetMap });
    } catch (e) {
      console.warn('Failed to load initial assets from IndexedDB:', e);
    }
  },

  setCurrentView: (currentView: CurrentScreenView) => set({ currentView }),

  pushHistory: () => {
    const { project, history, historyIndex } = get();
    const cloned = JSON.parse(JSON.stringify(project)) as EditorProject;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(cloned);
    // Limit history stack to 30 snapshots
    if (newHistory.length > 30) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const target = JSON.parse(JSON.stringify(history[newIndex])) as EditorProject;
      set({ project: target, historyIndex: newIndex });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const target = JSON.parse(JSON.stringify(history[newIndex])) as EditorProject;
      set({ project: target, historyIndex: newIndex });
    }
  },

  setProject: (newProj) => {
    get().pushHistory();
    set({
      project: { ...newProj, tracks: validateTracks(newProj.tracks) },
      selectedClipId: null,
      selectedClipTrackId: null,
      currentTime: 0,
      currentView: 'editor', // Switch to editor view when project is set
    });
  },

  newProject: (name = 'New Project', width = 1920, height = 1080, fps = 30) => {
    get().pushHistory();
    audioEngine.stop();
    const proj = createDefaultProject(name, width, height, fps);
    set({
      project: proj,
      selectedClipId: null,
      selectedClipTrackId: null,
      currentTime: 0,
      isPlaying: false,
      currentView: 'editor',
      isLipSyncModalOpen: false,
      isExportModalOpen: false,
      isProjectModalOpen: false,
    });
  },

  saveProject: async () => {
    const { project } = get();
    await saveProjectToDb(project);
  },

  renameProject: (name: string) => {
    get().pushHistory();
    set((state) => ({
      project: { ...state.project, name, updatedAt: Date.now() },
    }));
  },

  setProjectDimensions: (width: number, height: number) => {
    get().pushHistory();
    set((state) => ({
      project: {
        ...state.project,
        width: Math.max(100, width),
        height: Math.max(100, height),
        updatedAt: Date.now(),
      },
    }));
  },

  setAspectRatioPreset: (preset: AspectRatioPreset) => {
    const found = ASPECT_RATIO_PRESETS.find((p) => p.id === preset);
    if (found) {
      get().setProjectDimensions(found.width, found.height);
    }
  },

  setProjectDuration: (duration: number) => {
    get().pushHistory();
    set((state) => ({
      project: { ...state.project, duration: Math.max(1, duration), updatedAt: Date.now() },
    }));
  },

  setCurrentTime: (time: number) => {
    const { project } = get();
    const clamped = Math.max(0, Math.min(project.duration, time));
    set({ currentTime: clamped });
  },

  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),

  togglePlay: async () => {
    const { isPlaying, currentTime, project, assets } = get();
    if (isPlaying) {
      audioEngine.stop();
      set({ isPlaying: false });
    } else {
      audioEngine.resumeContext();
      const startTime = currentTime >= project.duration ? 0 : currentTime;
      set({ isPlaying: true, currentTime: startTime });
      await audioEngine.play(project.audioClips, assets, startTime);
    }
  },

  stopPlayback: () => {
    audioEngine.stop();
    set({ isPlaying: false });
  },

  setTimelineZoom: (timelineZoom: number) => set({ timelineZoom: Math.max(20, Math.min(250, timelineZoom)) }),

  setCanvasZoom: (canvasZoom: number) => set({ canvasZoom: Math.max(0.1, Math.min(3.0, canvasZoom)) }),

  toggleCheckerboard: () => set((state) => ({ showCheckerboard: !state.showCheckerboard })),

  toggleDiagnosticMode: () => set((state) => ({ diagnosticMode: !state.diagnosticMode })),

  setLipSyncModalOpen: (isLipSyncModalOpen: boolean) => set({ isLipSyncModalOpen }),

  setExportModalOpen: (isExportModalOpen: boolean) => set({ isExportModalOpen }),

  setProjectModalOpen: (isProjectModalOpen: boolean) => set({ isProjectModalOpen }),
  setPromptModalOpen: (isPromptModalOpen: boolean) => set({ isPromptModalOpen }),

  addAsset: async (asset) => {
    const { project } = get();
    const assetToSave = { ...asset, projectId: asset.projectId || project.id };
    const saved = await dbSaveAsset(assetToSave);
    if (saved.type === 'audio') {
      audioEngine.preloadAudio(saved.id, saved.blob, saved.url);
    }
    set((state) => {
      const next = new Map(state.assets);
      next.set(saved.id, saved);
      return { assets: next };
    });
    return saved;
  },

  deleteAsset: async (assetId: string) => {
    await deleteAssetFromDb(assetId);
    set((state) => {
      const nextAssets = new Map(state.assets);
      nextAssets.delete(assetId);
      return { assets: nextAssets };
    });
  },

  addMouthSet: async (mouthSet) => {
    const { project } = get();
    const setWithProject = { ...mouthSet, projectId: mouthSet.projectId || project.id };
    await dbSaveMouthSet(setWithProject);
    set((state) => {
      const next = new Map(state.mouthSets);
      next.set(setWithProject.id, setWithProject);
      return { mouthSets: next };
    });
  },

  deleteMouthSet: async (mouthSetId: string) => {
    await deleteMouthSetFromDb(mouthSetId);
    set((state) => {
      const nextSets = new Map(state.mouthSets);
      nextSets.delete(mouthSetId);
      return { mouthSets: nextSets };
    });
  },

  clearAllAssets: async () => {
    await clearAllAssetsFromDb();
    set({
      assets: new Map(),
      mouthSets: new Map(),
    });
  },

  selectClip: (clipId, trackId) => {
    if (!clipId) {
      set({ selectedClipId: null, selectedClipTrackId: null });
      return;
    }
    if (trackId) {
      set({ selectedClipId: clipId, selectedClipTrackId: trackId });
      return;
    }
    // Find trackId
    const { project } = get();
    for (const track of project.tracks) {
      if (track.clips.some((c) => c.id === clipId)) {
        set({ selectedClipId: clipId, selectedClipTrackId: track.id });
        return;
      }
    }
    if (project.audioClips.some((c) => c.id === clipId)) {
      set({ selectedClipId: clipId, selectedClipTrackId: 'audio' });
      return;
    }
    set({ selectedClipId: clipId, selectedClipTrackId: null });
  },

  addVisualClip: (trackId, clip) => {
    get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((t) => {
        if (t.id === trackId) {
          return { ...t, clips: [...t.clips, clip] };
        }
        return t;
      });
      const duration = calculateProjectDuration(tracks, state.project.audioClips);
      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: clip.id,
        selectedClipTrackId: trackId,
      };
    });
  },

  updateVisualClip: (clipId, updates, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...updates } : clip)),
      }));
      const duration = calculateProjectDuration(tracks, state.project.audioClips);
      return { project: { ...state.project, tracks, duration, updatedAt: Date.now() } };
    });
  },

  moveClip: (clipId, newStart, targetTrackId, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    const { project } = get();
    const snapTargets = getSnapTargets(project.tracks, project.audioClips, clipId);

    set((state) => {
      let foundClip: VisualClip | null = null;
      let sourceTrackId: TrackId | null = null;

      for (const track of state.project.tracks) {
        const c = track.clips.find((item) => item.id === clipId);
        if (c) {
          foundClip = c;
          sourceTrackId = track.id;
          break;
        }
      }

      if (!foundClip || !sourceTrackId) return state;

      const destTrackId = targetTrackId || sourceTrackId;
      const moved = moveVisualClip(foundClip, newStart, snapTargets);

      const tracks = state.project.tracks.map((t) => {
        if (t.id === sourceTrackId && sourceTrackId !== destTrackId) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === destTrackId) {
          if (sourceTrackId === destTrackId) {
            return { ...t, clips: t.clips.map((c) => (c.id === clipId ? moved : c)) };
          } else {
            return { ...t, clips: [...t.clips, moved] };
          }
        }
        return t;
      });

      const duration = calculateProjectDuration(tracks, state.project.audioClips);

      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: clipId,
        selectedClipTrackId: destTrackId,
      };
    });
  },

  trimClip: (clipId, edge, newTime, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId) return clip;
          return edge === 'start'
            ? trimClipStart(clip, newTime)
            : trimClipEnd(clip, newTime);
        }),
      }));
      const duration = calculateProjectDuration(tracks, state.project.audioClips);
      return { project: { ...state.project, tracks, duration, updatedAt: Date.now() } };
    });
  },

  duplicateClip: (clipId) => {
    get().pushHistory();
    set((state) => {
      // Check if it is an audio clip
      const audioOrig = state.project.audioClips.find((c) => c.id === clipId);
      if (audioOrig) {
        const duplicatedAudio: AudioClip = {
          ...audioOrig,
          id: `aclip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          start: audioOrig.start + audioOrig.duration,
        };
        const audioClips = [...state.project.audioClips, duplicatedAudio];
        const duration = calculateProjectDuration(state.project.tracks, audioClips);
        return {
          project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
          selectedClipId: duplicatedAudio.id,
          selectedClipTrackId: 'audio',
        };
      }

      let duplicated: VisualClip | null = null;
      let targetTrackId: TrackId | null = null;

      for (const track of state.project.tracks) {
        const c = track.clips.find((item) => item.id === clipId);
        if (c) {
          targetTrackId = track.id;
          duplicated = {
            ...c,
            id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            start: c.start + c.duration, // place immediately after
          };
          break;
        }
      }

      if (!duplicated || !targetTrackId) return state;

      const tracks = state.project.tracks.map((t) => {
        if (t.id === targetTrackId) {
          return { ...t, clips: [...t.clips, duplicated!] };
        }
        return t;
      });

      const duration = calculateProjectDuration(tracks, state.project.audioClips);

      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: duplicated.id,
        selectedClipTrackId: targetTrackId,
      };
    });
  },

  removeClip: (clipId) => {
    get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      }));
      const audioClips = state.project.audioClips.filter((c) => c.id !== clipId);
      const duration = calculateProjectDuration(tracks, audioClips);
      return {
        project: { ...state.project, tracks, audioClips, duration, updatedAt: Date.now() },
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
        selectedClipTrackId: state.selectedClipId === clipId ? null : state.selectedClipTrackId,
      };
    });
  },

  fitClipToScreen: (clipId, mode = 'contain') => {
    get().pushHistory();
    const { project, assets } = get();
    let targetClip: VisualClip | null = null;
    for (const track of project.tracks) {
      const c = track.clips.find((item) => item.id === clipId);
      if (c) {
        targetClip = c;
        break;
      }
    }
    if (!targetClip) return;

    const asset = assets.get(targetClip.assetId);
    const sourceW = asset?.width || targetClip.width;
    const sourceH = asset?.height || targetClip.height;
    const fit = calculateFitToScreen(sourceW, sourceH, project.width, project.height, mode);

    get().updateVisualClip(clipId, {
      x: fit.x,
      y: fit.y,
      width: fit.width,
      height: fit.height,
      rotation: 0,
    }, false);
  },

  centerClipOnScreen: (clipId) => {
    get().pushHistory();
    const { project } = get();
    let targetClip: VisualClip | null = null;
    for (const track of project.tracks) {
      const c = track.clips.find((item) => item.id === clipId);
      if (c) {
        targetClip = c;
        break;
      }
    }
    if (!targetClip) return;

    const x = Math.round((project.width - targetClip.width) / 2);
    const y = Math.round((project.height - targetClip.height) / 2);
    get().updateVisualClip(clipId, { x, y }, false);
  },

  resetClipSize: (clipId) => {
    get().pushHistory();
    const { project, assets } = get();
    let targetClip: VisualClip | null = null;
    for (const track of project.tracks) {
      const c = track.clips.find((item) => item.id === clipId);
      if (c) {
        targetClip = c;
        break;
      }
    }
    if (!targetClip) return;

    const asset = assets.get(targetClip.assetId);
    const width = asset?.width || 400;
    const height = asset?.height || 400;
    const x = Math.round((project.width - width) / 2);
    const y = Math.round((project.height - height) / 2);

    get().updateVisualClip(clipId, { x, y, width, height, rotation: 0 }, false);
  },

  addAudioClip: (clip) => {
    get().pushHistory();
    set((state) => {
      const audioClips = [...state.project.audioClips, clip];
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
      };
    });
  },

  updateAudioClip: (clipId, updates, recordHistory = true) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const audioClips = state.project.audioClips.map((c) => (c.id === clipId ? { ...c, ...updates } : c));
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      return { project: { ...state.project, audioClips, duration, updatedAt: Date.now() } };
    });
  },

  moveAudioClip: (clipId, newStart, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    const { project } = get();
    const snapTargets = getSnapTargets(project.tracks, project.audioClips, clipId);

    set((state) => {
      const clip = state.project.audioClips.find((c) => c.id === clipId);
      if (!clip) return state;

      let clampedStart = Math.max(0, newStart);
      if (snapTargets.length > 0) {
        const snappedStart = snapTimeToTargets(clampedStart, snapTargets, 0.15);
        if (snappedStart !== clampedStart) {
          clampedStart = snappedStart;
        } else {
          const proposedEnd = clampedStart + clip.duration;
          const snappedEnd = snapTimeToTargets(proposedEnd, snapTargets, 0.15);
          if (snappedEnd !== proposedEnd) {
            clampedStart = Math.max(0, snappedEnd - clip.duration);
          }
        }
      }

      const updatedStart = Number(clampedStart.toFixed(4));
      const audioClips = state.project.audioClips.map((c) =>
        c.id === clipId ? { ...c, start: updatedStart } : c
      );
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
      };
    });
  },

  trimAudioClip: (clipId, edge, newTime, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const clip = state.project.audioClips.find((c) => c.id === clipId);
      if (!clip) return state;

      let updated = { ...clip };
      if (edge === 'start') {
        const oldEnd = clip.start + clip.duration;
        let start = Math.max(0, newTime);
        start = Math.min(start, oldEnd - 0.1);
        const duration = Math.max(0.1, oldEnd - start);
        const trimmedDelta = start - clip.start;
        const trimStart = Math.max(0, (clip.trimStart || 0) + trimmedDelta);
        updated = {
          ...clip,
          start: Number(start.toFixed(4)),
          duration: Number(duration.toFixed(4)),
          trimStart: Number(trimStart.toFixed(4)),
        };
      } else {
        const end = Math.max(clip.start + 0.1, newTime);
        const duration = end - clip.start;
        updated = {
          ...clip,
          duration: Number(duration.toFixed(4)),
          trimEnd: Number(((clip.trimStart || 0) + duration).toFixed(4)),
        };
      }

      const audioClips = state.project.audioClips.map((c) => (c.id === clipId ? updated : c));
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
      };
    });
  },

  removeAudioClip: (clipId) => {
    get().pushHistory();
    set((state) => {
      const audioClips = state.project.audioClips.filter((c) => c.id !== clipId);
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
        selectedClipTrackId: state.selectedClipId === clipId ? null : state.selectedClipTrackId,
      };
    });
  },
}));
