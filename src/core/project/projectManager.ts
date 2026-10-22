import { EditorProject, createDefaultProject } from '../../types/project';
import { validateTracks } from '../timeline/timelineMath';

export interface ProjectMetadataFile {
  version: 2;
  project: EditorProject;
  referencedAssetIds: string[];
}

/**
 * Validates an imported project JSON object.
 */
export function validateProjectJson(data: unknown): { valid: boolean; project?: EditorProject; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File does not contain valid JSON data' };
  }

  const obj = data as Partial<EditorProject & { project?: EditorProject }>;
  const proj = obj.project || obj;

  if (!proj.id || typeof proj.name !== 'string') {
    return { valid: false, error: 'Project is missing required id or name' };
  }

  if (typeof proj.width !== 'number' || typeof proj.height !== 'number') {
    return { valid: false, error: 'Project is missing width or height dimensions' };
  }

  if (!Array.isArray(proj.tracks)) {
    return { valid: false, error: 'Project tracks must be an array' };
  }

  // Sanitize and enforce 4-track schema
  const validatedTracks = validateTracks(proj.tracks);

  const cleanProject: EditorProject = {
    id: proj.id,
    name: proj.name,
    width: proj.width || 1920,
    height: proj.height || 1080,
    fps: proj.fps || 30,
    duration: Math.max(1, proj.duration || 10),
    tracks: validatedTracks,
    audioClips: Array.isArray(proj.audioClips) ? proj.audioClips : [],
    createdAt: proj.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  return { valid: true, project: cleanProject };
}

/**
 * Serializes project metadata to downloadable JSON string.
 */
export function exportProjectToJson(project: EditorProject): string {
  const referencedAssetIds = new Set<string>();

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId) referencedAssetIds.add(clip.assetId);
      if (clip.lipSyncData) {
        if (clip.lipSyncData.characterAssetId) referencedAssetIds.add(clip.lipSyncData.characterAssetId);
        if (clip.lipSyncData.audioAssetId) referencedAssetIds.add(clip.lipSyncData.audioAssetId);
      }
    }
  }

  for (const aClip of project.audioClips) {
    if (aClip.assetId) referencedAssetIds.add(aClip.assetId);
  }

  const exportObj: ProjectMetadataFile = {
    version: 2,
    project,
    referencedAssetIds: Array.from(referencedAssetIds),
  };

  return JSON.stringify(exportObj, null, 2);
}

/**
 * Checks for missing assets in a project given a set of currently available asset IDs.
 */
export function findMissingAssets(project: EditorProject, availableAssetIds: Set<string>): string[] {
  const missing = new Set<string>();

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId && !availableAssetIds.has(clip.assetId)) {
        missing.add(clip.assetId);
      }
      if (clip.lipSyncData?.audioAssetId && !availableAssetIds.has(clip.lipSyncData.audioAssetId)) {
        missing.add(clip.lipSyncData.audioAssetId);
      }
    }
  }

  for (const aClip of project.audioClips) {
    if (aClip.assetId && !availableAssetIds.has(aClip.assetId)) {
      missing.add(aClip.assetId);
    }
  }

  return Array.from(missing);
}
