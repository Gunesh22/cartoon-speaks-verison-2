import { create } from 'zustand';
import { EditorProject, createDefaultProject, AspectRatioPreset, ASPECT_RATIO_PRESETS, AudioTrackSettings } from '../types/project';
import { TrackId, VisualClip, AudioClip, AudioTrackId, TransformKeyframe } from '../types/timeline';
import { EditorAsset, MouthSetAsset } from '../types/assets';
import { setKeyframe, deleteKeyframe } from '../core/timeline/keyframeMath';
import {
  moveVisualClip,
  trimClipStart,
  trimClipEnd,
  getSnapTargets,
  snapTimeToTargets,
  validateTracks,
  calculateProjectDuration,
  getTimelineContentEndTime,
  getStoryEnd,
  getTimelineEnd,
  getEffectiveAnimationDuration,
  calculateFitToScreen,
} from '../core/timeline/timelineMath';
import {
  saveProjectToDb,
  saveSnapshotToDb,
  restoreSnapshotFromDb,
  loadAllAssets,
  loadAllMouthSets,
  saveAsset as dbSaveAsset,
  saveMouthSet as dbSaveMouthSet,
  deleteAssetFromDb,
  deleteMouthSetFromDb,
  clearAllAssetsFromDb,
} from '../core/assets/assetDb';
import { audioEngine } from '../core/audio/audioEngine';
import { clearWaveformCache } from '../core/audio/waveformGenerator';

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
  showSafeZones: boolean;
  showRulers: boolean;
  canvasGuides: Array<{ id: string; orientation: 'horizontal' | 'vertical'; position: number }>;
  showStoryboard: boolean;
  activeTool: 'select' | 'razor';
  inOutRange: { in: number | null; out: number | null };
  isLipSyncModalOpen: boolean;
  isExportModalOpen: boolean;
  isProjectModalOpen: boolean;
  isPromptModalOpen: boolean;
  isRecordModalOpen: boolean;
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
  fitTimelineToContent: () => void;
  setAutoFitToStory: (enabled: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => Promise<void>;
  stopPlayback: () => void;
  setTimelineZoom: (zoom: number) => void;
  setCanvasZoom: (zoom: number) => void;
  toggleCheckerboard: () => void;
  toggleDiagnosticMode: () => void;
  toggleSafeZones: () => void;
  toggleRulers: () => void;
  addCanvasGuide: (orientation: 'horizontal' | 'vertical', position: number) => void;
  removeCanvasGuide: (id: string) => void;
  clearCanvasGuides: () => void;
  toggleStoryboard: () => void;
  setActiveTool: (tool: 'select' | 'razor') => void;
  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  clearInOutRange: () => void;
  setLipSyncModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setProjectModalOpen: (open: boolean) => void;
  setPromptModalOpen: (open: boolean) => void;
  setRecordModalOpen: (open: boolean) => void;
  setSnapshotModalOpen: (open: boolean) => void;

  // Auto-Save and Version Snapshots (Feature 17)
  lastSavedAt: number | null;
  isSaving: boolean;
  isAutosaveEnabled: boolean;
  isSnapshotModalOpen: boolean;
  setAutosaveEnabled: (enabled: boolean) => void;
  createSnapshot: (name?: string) => Promise<string>;
  restoreSnapshot: (snapshotId: string) => Promise<boolean>;
  
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
  splitClip: (clipId: string, splitTime?: number) => void;
  removeClip: (clipId: string) => void;
  fitClipToScreen: (clipId: string, mode?: 'contain' | 'cover') => void;
  centerClipOnScreen: (clipId: string) => void;
  resetClipSize: (clipId: string) => void;

  // Audio Clip Actions (Feature 07)
  addAudioClip: (clip: AudioClip, trackId?: AudioTrackId) => void;
  updateAudioClip: (clipId: string, updates: Partial<AudioClip>, recordHistory?: boolean) => void;
  moveAudioClip: (clipId: string, newStart: number, targetTrackId?: AudioTrackId, recordHistory?: boolean) => void;
  trimAudioClip: (clipId: string, edge: 'start' | 'end', newTime: number, recordHistory?: boolean) => void;
  removeAudioClip: (clipId: string) => void;
  setAudioTrackSettings: (trackId: AudioTrackId, settings: Partial<AudioTrackSettings>) => void;

  // Keyframe Actions (Feature 11)
  addKeyframe: (clipId: string, timeOrKeyframe: number | TransformKeyframe, properties?: Partial<TransformKeyframe>) => void;
  removeKeyframe: (clipId: string, keyframeId: string) => void;
  updateKeyframe: (clipId: string, keyframeId: string, updates: Partial<TransformKeyframe>) => void;
}

let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
  }
  autosaveTimeout = setTimeout(async () => {
    const state = useEditorStore.getState();
    if (!state.isAutosaveEnabled || state.isPlaying) return;
    try {
      useEditorStore.setState({ isSaving: true });
      await saveProjectToDb(state.project);
      await saveSnapshotToDb(state.project.id, state.project, true, 'Autosave');
      useEditorStore.setState({ isSaving: false, lastSavedAt: Date.now() });
    } catch (e) {
      console.warn('Autosave failed:', e);
      useEditorStore.setState({ isSaving: false });
    }
  }, 3000);
}

function clampPlaybackToDuration(
  duration: number,
  currentTime: number,
  isPlaying: boolean
): { currentTime: number; isPlaying: boolean } {
  if (currentTime >= duration) {
    if (isPlaying) {
      audioEngine.stop();
    }
    return { currentTime: duration, isPlaying: false };
  }
  return { currentTime, isPlaying };
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
  showSafeZones: false,
  showRulers: false,
  canvasGuides: [],
  showStoryboard: false,
  activeTool: 'select',
  inOutRange: { in: null, out: null },
  isLipSyncModalOpen: false,
  isExportModalOpen: false,
  isProjectModalOpen: false,
  isPromptModalOpen: false,
  isRecordModalOpen: false,
  isSnapshotModalOpen: false,
  lastSavedAt: null,
  isSaving: false,
  isAutosaveEnabled: true,
  setSnapshotModalOpen: (open: boolean) => set({ isSnapshotModalOpen: open }),
  setAutosaveEnabled: (enabled: boolean) => set({ isAutosaveEnabled: enabled }),
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

      // Auto-recalculate timeline duration to match current clips
      const currentProj = get().project;
      const derivedDuration = calculateProjectDuration(currentProj.tracks, currentProj.audioClips, 5.0);
      const clamped = clampPlaybackToDuration(derivedDuration, get().currentTime, get().isPlaying);

      set({
        assets: assetMap,
        mouthSets: mouthSetMap,
        project: currentProj.duration !== derivedDuration ? { ...currentProj, duration: derivedDuration } : currentProj,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      });
    } catch (e) {
      console.warn('Failed to load initial assets from IndexedDB:', e);
    }
  },

  setCurrentView: (currentView: CurrentScreenView) => {
    if (currentView === 'projects') {
      get().saveProject().catch((err) => console.warn('Failed to save project on view exit:', err));
    }
    set({ currentView });
  },

  pushHistory: () => {
    const { project, history, historyIndex } = get();
    const cloned = JSON.parse(JSON.stringify(project)) as EditorProject;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(cloned);
    // Limit history stack to 30 snapshots
    if (newHistory.length > 30) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
    scheduleAutosave();
  },

  undo: () => {
    const { history, historyIndex, currentTime, isPlaying, project } = get();
    if (historyIndex > 0) {
      const newHistory = [...history];
      newHistory[historyIndex] = JSON.parse(JSON.stringify(project)) as EditorProject;
      const newIndex = historyIndex - 1;
      const target = JSON.parse(JSON.stringify(newHistory[newIndex])) as EditorProject;
      const duration = calculateProjectDuration(target.tracks, target.audioClips, 5.0);
      target.duration = duration;
      const clamped = clampPlaybackToDuration(duration, currentTime, isPlaying);
      set({ project: target, history: newHistory, historyIndex: newIndex, currentTime: clamped.currentTime, isPlaying: clamped.isPlaying });
    }
  },

  redo: () => {
    const { history, historyIndex, currentTime, isPlaying } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const target = JSON.parse(JSON.stringify(history[newIndex])) as EditorProject;
      const duration = calculateProjectDuration(target.tracks, target.audioClips, 5.0);
      target.duration = duration;
      const clamped = clampPlaybackToDuration(duration, currentTime, isPlaying);
      set({ project: target, historyIndex: newIndex, currentTime: clamped.currentTime, isPlaying: clamped.isPlaying });
    }
  },

  setProject: (newProj) => {
    get().pushHistory();
    const tracks = validateTracks(newProj.tracks);
    const audioClips = Array.isArray(newProj.audioClips) ? newProj.audioClips : [];
    const duration = calculateProjectDuration(tracks, audioClips, 5.0);
    set({
      project: { ...newProj, tracks, audioClips, duration },
      selectedClipId: null,
      selectedClipTrackId: null,
      currentTime: 0,
      currentView: 'editor', // Switch to editor view when project is set
    });
  },

  newProject: (name = 'New Project', width = 1920, height = 1080, fps = 30) => {
    get().pushHistory();
    audioEngine.stop();
    clearWaveformCache();
    audioEngine.clearAudioBuffers();
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
    set({ isSaving: true });
    try {
      await saveProjectToDb(project);
      await saveSnapshotToDb(project.id, project, true, 'Autosave');
      set({ isSaving: false, lastSavedAt: Date.now() });
    } catch (e) {
      console.warn('Failed to save project:', e);
      set({ isSaving: false });
    }
  },

  createSnapshot: async (name?: string) => {
    const { project } = get();
    const snap = await saveSnapshotToDb(project.id, project, false, name);
    set({ lastSavedAt: Date.now() });
    return snap.id;
  },

  restoreSnapshot: async (snapshotId: string) => {
    const loaded = await restoreSnapshotFromDb(snapshotId);
    if (!loaded) return false;
    get().pushHistory();
    get().setProject(loaded);
    return true;
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

  fitTimelineToContent: () => {
    get().pushHistory();
    set((state) => {
      // Prioritize story end (visuals + dialogue), non-destructively preserving audio clips
      const storyEnd = getStoryEnd(state.project.tracks, state.project.audioClips);
      const timelineEnd = getTimelineEnd(state.project.tracks, state.project.audioClips);
      const targetEnd = storyEnd > 0 ? storyEnd : (timelineEnd > 0 ? timelineEnd : 5.0);
      return {
        project: { ...state.project, duration: targetEnd, updatedAt: Date.now() },
      };
    });
    get().saveProject().catch(() => {});
  },

  setAutoFitToStory: (enabled: boolean) => {
    get().pushHistory();
    set((state) => ({
      project: { ...state.project, autoFitToStory: enabled, updatedAt: Date.now() },
    }));
    get().saveProject().catch(() => {});
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
      await audioEngine.play(project.audioClips, assets, startTime, project.audioTrackSettings);
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

  toggleSafeZones: () => set((state) => ({ showSafeZones: !state.showSafeZones })),

  toggleRulers: () => set((state) => ({ showRulers: !state.showRulers })),

  addCanvasGuide: (orientation, position) =>
    set((state) => ({
      canvasGuides: [
        ...state.canvasGuides,
        {
          id: `guide_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orientation,
          position: Math.round(position),
        },
      ],
    })),

  removeCanvasGuide: (id) =>
    set((state) => ({
      canvasGuides: state.canvasGuides.filter((g) => g.id !== id),
    })),

  clearCanvasGuides: () => set({ canvasGuides: [] }),

  toggleStoryboard: () => set((state) => ({ showStoryboard: !state.showStoryboard })),

  setActiveTool: (activeTool) => set({ activeTool }),

  setInPoint: (inTime) =>
    set((state) => {
      const out = state.inOutRange.out;
      const validIn = inTime !== null ? Math.max(0, Math.min(state.project.duration, inTime)) : null;
      // If in is after out, reset out
      const validOut = out !== null && validIn !== null && validIn >= out ? null : out;
      return { inOutRange: { in: validIn, out: validOut } };
    }),

  setOutPoint: (outTime) =>
    set((state) => {
      const inPt = state.inOutRange.in;
      const validOut = outTime !== null ? Math.max(0, Math.min(state.project.duration, outTime)) : null;
      // If out is before in, reset in
      const validIn = inPt !== null && validOut !== null && validOut <= inPt ? null : inPt;
      return { inOutRange: { in: validIn, out: validOut } };
    }),

  clearInOutRange: () => set({ inOutRange: { in: null, out: null } }),

  setLipSyncModalOpen: (isLipSyncModalOpen: boolean) => set({ isLipSyncModalOpen }),

  setExportModalOpen: (isExportModalOpen: boolean) => set({ isExportModalOpen }),

  setProjectModalOpen: (isProjectModalOpen: boolean) => set({ isProjectModalOpen }),
  setPromptModalOpen: (isPromptModalOpen: boolean) => set({ isPromptModalOpen }),
  setRecordModalOpen: (isRecordModalOpen: boolean) => set({ isRecordModalOpen }),

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
    clearWaveformCache(assetId);
    audioEngine.removeAudioBuffer(assetId);
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
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: clip.id,
        selectedClipTrackId: trackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
    get().saveProject().catch((err) => console.warn('Failed to save after adding visual clip:', err));
  },

  updateVisualClip: (clipId, updates, recordHistory = false) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, ...updates } : clip)),
      }));
      const duration = calculateProjectDuration(tracks, state.project.audioClips);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
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
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);

      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: clipId,
        selectedClipTrackId: destTrackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
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
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
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
        const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
        return {
          project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
          selectedClipId: duplicatedAudio.id,
          selectedClipTrackId: 'audio',
          currentTime: clamped.currentTime,
          isPlaying: clamped.isPlaying,
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
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);

      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: duplicated.id,
        selectedClipTrackId: targetTrackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
  },

  splitClip: (clipId, splitTime) => {
    const at = splitTime !== undefined ? splitTime : get().currentTime;
    get().pushHistory();

    set((state) => {
      // Check audio clips first
      const audioIndex = state.project.audioClips.findIndex((c) => c.id === clipId);
      if (audioIndex !== -1) {
        const clip = state.project.audioClips[audioIndex];
        const clipEnd = clip.start + clip.duration;
        // Require at least 0.1s margin on both pieces
        if (at <= clip.start + 0.1 || at >= clipEnd - 0.1) return state;

        const firstDuration = Number((at - clip.start).toFixed(4));
        const secondDuration = Number((clipEnd - at).toFixed(4));
        const firstPiece: AudioClip = {
          ...clip,
          duration: firstDuration,
          trimEnd: Number(((clip.trimStart || 0) + firstDuration).toFixed(4)),
          fadeOut: 0,
        };
        const secondPiece: AudioClip = {
          ...clip,
          id: `aclip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          start: Number(at.toFixed(4)),
          duration: secondDuration,
          trimStart: Number(((clip.trimStart || 0) + firstDuration).toFixed(4)),
          trimEnd: Number(((clip.trimStart || 0) + firstDuration + secondDuration).toFixed(4)),
          fadeIn: 0,
        };

        const audioClips = [
          ...state.project.audioClips.slice(0, audioIndex),
          firstPiece,
          secondPiece,
          ...state.project.audioClips.slice(audioIndex + 1),
        ];

        const duration = calculateProjectDuration(state.project.tracks, audioClips);
        const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);

        return {
          project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
          selectedClipId: secondPiece.id,
          selectedClipTrackId: 'audio',
          currentTime: clamped.currentTime,
          isPlaying: clamped.isPlaying,
        };
      }

      // Check visual clips
      let targetTrackId: TrackId | null = null;
      let targetClipIndex = -1;
      let originalClip: VisualClip | null = null;

      for (const track of state.project.tracks) {
        const idx = track.clips.findIndex((c) => c.id === clipId);
        if (idx !== -1) {
          targetTrackId = track.id;
          targetClipIndex = idx;
          originalClip = track.clips[idx];
          break;
        }
      }

      if (!originalClip || !targetTrackId || targetClipIndex === -1) return state;

      const clipEnd = originalClip.start + originalClip.duration;
      if (at <= originalClip.start + 0.1 || at >= clipEnd - 0.1) return state;

      const firstDuration = Number((at - originalClip.start).toFixed(4));
      const secondDuration = Number((clipEnd - at).toFixed(4));
      const localSplit = firstDuration;

      // Handle lip-sync cues if present (cues are in local seconds relative to clip.start)
      let firstCues = originalClip.lipSyncData?.cues;
      let secondCues = originalClip.lipSyncData?.cues;
      if (originalClip.lipSyncData?.cues) {
        firstCues = originalClip.lipSyncData.cues
          .filter((c) => c.start < localSplit)
          .map((c) => ({
            ...c,
            end: Number(Math.min(localSplit, c.end).toFixed(4)),
          }))
          .filter((c) => c.end > c.start);

        secondCues = originalClip.lipSyncData.cues
          .filter((c) => c.end > localSplit)
          .map((c) => ({
            ...c,
            id: `cue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            start: Number(Math.max(0, c.start - localSplit).toFixed(4)),
            end: Number(Math.min(secondDuration, c.end - localSplit).toFixed(4)),
          }))
          .filter((c) => c.end > c.start);
      }

      const firstPiece: VisualClip = {
        ...originalClip,
        duration: firstDuration,
        lipSyncData: originalClip.lipSyncData
          ? { ...originalClip.lipSyncData, cues: firstCues || [] }
          : undefined,
      };

      const secondPiece: VisualClip = {
        ...originalClip,
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        start: Number(at.toFixed(4)),
        duration: secondDuration,
        lipSyncData: originalClip.lipSyncData
          ? { ...originalClip.lipSyncData, cues: secondCues || [] }
          : undefined,
      };

      const tracks = state.project.tracks.map((track) => {
        if (track.id === targetTrackId) {
          const newClips = [...track.clips];
          newClips.splice(targetClipIndex, 1, firstPiece, secondPiece);
          return { ...track, clips: newClips };
        }
        return track;
      });

      const duration = calculateProjectDuration(tracks, state.project.audioClips);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);

      return {
        project: { ...state.project, tracks, duration, updatedAt: Date.now() },
        selectedClipId: secondPiece.id,
        selectedClipTrackId: targetTrackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
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
      const duration = calculateProjectDuration(tracks, audioClips, 5.0);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      return {
        project: { ...state.project, tracks, audioClips, duration, updatedAt: Date.now() },
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
        selectedClipTrackId: state.selectedClipId === clipId ? null : state.selectedClipTrackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
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

  addAudioClip: (clip, trackId) => {
    get().pushHistory();
    set((state) => {
      const assignedTrack = trackId || clip.trackId || 'A1';
      const audioClips = [...state.project.audioClips, { ...clip, trackId: assignedTrack }];
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      if (state.isPlaying && clamped.isPlaying) {
        audioEngine.stop();
        audioEngine.play(audioClips, get().assets, clamped.currentTime, state.project.audioTrackSettings);
      }
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
    get().saveProject().catch((err) => console.warn('Failed to save after adding audio clip:', err));
  },

  updateAudioClip: (clipId, updates, recordHistory = true) => {
    if (recordHistory) get().pushHistory();
    set((state) => {
      const audioClips = state.project.audioClips.map((c) => (c.id === clipId ? { ...c, ...updates } : c));
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      if (state.isPlaying && clamped.isPlaying) {
        audioEngine.stop();
        audioEngine.play(audioClips, get().assets, clamped.currentTime, state.project.audioTrackSettings);
      }
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
  },

  moveAudioClip: (clipId, newStart, targetTrackId, recordHistory = false) => {
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
      const destTrack = targetTrackId || clip.trackId || 'A1';
      const audioClips = state.project.audioClips.map((c) =>
        c.id === clipId ? { ...c, start: updatedStart, trackId: destTrack } : c
      );
      const duration = calculateProjectDuration(state.project.tracks, audioClips);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      if (state.isPlaying && clamped.isPlaying) {
        audioEngine.stop();
        audioEngine.play(audioClips, get().assets, clamped.currentTime, state.project.audioTrackSettings);
      }
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
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
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      if (state.isPlaying && clamped.isPlaying) {
        audioEngine.stop();
        audioEngine.play(audioClips, get().assets, clamped.currentTime, state.project.audioTrackSettings);
      }
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
  },

  removeAudioClip: (clipId) => {
    get().pushHistory();
    set((state) => {
      const audioClips = state.project.audioClips.filter((c) => c.id !== clipId);
      const duration = calculateProjectDuration(state.project.tracks, audioClips, 5.0);
      const clamped = clampPlaybackToDuration(duration, state.currentTime, state.isPlaying);
      if (state.isPlaying && clamped.isPlaying) {
        audioEngine.stop();
        audioEngine.play(audioClips, get().assets, clamped.currentTime, state.project.audioTrackSettings);
      }
      return {
        project: { ...state.project, audioClips, duration, updatedAt: Date.now() },
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
        selectedClipTrackId: state.selectedClipId === clipId ? null : state.selectedClipTrackId,
        currentTime: clamped.currentTime,
        isPlaying: clamped.isPlaying,
      };
    });
  },

  setAudioTrackSettings: (trackId, settings) => {
    get().pushHistory();
    set((state) => {
      const current = state.project.audioTrackSettings || {
        A1: { volume: 1.0, muted: false, solo: false },
        A2: { volume: 0.8, muted: false, solo: false },
      };
      const updatedTrack = {
        ...(current[trackId] || { volume: 1.0, muted: false, solo: false }),
        ...settings,
      };
      const audioTrackSettings = {
        ...current,
        [trackId]: updatedTrack,
      };
      return {
        project: { ...state.project, audioTrackSettings, updatedAt: Date.now() },
      };
    });
  },

  addKeyframe: (clipId, timeOrKeyframe, properties = {}) => {
    get().pushHistory();
    const time = typeof timeOrKeyframe === 'number' ? timeOrKeyframe : timeOrKeyframe.time;
    const props = typeof timeOrKeyframe === 'number' ? properties : { ...timeOrKeyframe, ...properties };
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => {
          if (c.id !== clipId) return c;
          const kfs = setKeyframe(c.keyframes || [], time, props);
          return { ...c, keyframes: kfs };
        }),
      }));
      return {
        project: { ...state.project, tracks, updatedAt: Date.now() },
      };
    });
  },

  removeKeyframe: (clipId, keyframeId) => {
    get().pushHistory();
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => {
          if (c.id !== clipId) return c;
          const kfs = deleteKeyframe(c.keyframes || [], keyframeId);
          return { ...c, keyframes: kfs };
        }),
      }));
      return {
        project: { ...state.project, tracks, updatedAt: Date.now() },
      };
    });
  },

  updateKeyframe: (clipId, keyframeId, updates) => {
    set((state) => {
      const tracks = state.project.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((c) => {
          if (c.id !== clipId || !c.keyframes) return c;
          const kfs = c.keyframes.map((k) => (k.id === keyframeId ? { ...k, ...updates } : k));
          return { ...c, keyframes: kfs.sort((a, b) => a.time - b.time) };
        }),
      }));
      return {
        project: { ...state.project, tracks, updatedAt: Date.now() },
      };
    });
  },
}));
