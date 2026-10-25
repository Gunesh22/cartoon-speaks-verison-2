import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { EditorProject } from '../../types/project';
import { EditorAsset, MouthSetAsset } from '../../types/assets';
import { validateProjectJson } from './projectManager';
import { saveAsset, saveMouthSet, saveProject, getCachedObjectUrl } from '../assets/assetDb';

export interface BundleAssetEntry {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  filename: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface BundleMouthSetEntry {
  id: string;
  name: string;
  sourceAssetId: string;
  filename: string;
}

export interface ProjectBundleManifest {
  version: 1;
  appName: 'Cartoon Speaks';
  exportedAt: string;
  projectId: string;
  projectName: string;
  assetCount: number;
  mouthSetCount: number;
  assets: BundleAssetEntry[];
  mouthSets: BundleMouthSetEntry[];
}

/**
 * Returns a standard file extension for a given MIME type.
 */
function getExtensionForMimeType(mimeType: string, type: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return '.jpg';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('svg')) return '.svg';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a';
  return type === 'audio' ? '.wav' : '.png';
}

/**
 * Converts a Blob to a Uint8Array.
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Sanitizes and validates archive entry paths against zip-slip traversal.
 */
function validateArchivePath(path: string): void {
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\') || path.includes(':')) {
    throw new Error(`Security validation error: Suspicious entry path in archive: "${path}"`);
  }
}

/**
 * Bundles the full project, its media assets, and mouth sets into a single .cartoonspeaks ZIP blob.
 */
export async function exportProjectBundle(
  project: EditorProject,
  assetsMap: Map<string, EditorAsset>,
  mouthSetsMap: Map<string, MouthSetAsset>
): Promise<Blob> {
  // Collect all asset IDs referenced by this project
  const neededAssetIds = new Set<string>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId) neededAssetIds.add(clip.assetId);
      if (clip.lipSyncData?.audioAssetId) neededAssetIds.add(clip.lipSyncData.audioAssetId);
    }
  }
  for (const aClip of project.audioClips) {
    if (aClip.assetId) neededAssetIds.add(aClip.assetId);
  }

  // Also include any assets explicitly assigned to this projectId
  for (const [id, asset] of assetsMap.entries()) {
    if (asset.projectId === project.id) {
      neededAssetIds.add(id);
    }
  }

  // Collect mouth sets used by project clips or matching projectId
  const neededMouthSetIds = new Set<string>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.lipSyncData?.mouthSetId) {
        neededMouthSetIds.add(clip.lipSyncData.mouthSetId);
      }
    }
  }
  for (const [id, ms] of mouthSetsMap.entries()) {
    if (ms.projectId === project.id) {
      neededMouthSetIds.add(id);
    }
  }

  // Also ensure sourceAssetIds of included mouth sets are bundled
  for (const msId of neededMouthSetIds) {
    const ms = mouthSetsMap.get(msId);
    if (ms?.sourceAssetId) {
      neededAssetIds.add(ms.sourceAssetId);
    }
  }

  const zipFiles: Record<string, Uint8Array> = {};
  const manifestAssets: BundleAssetEntry[] = [];
  const manifestMouthSets: BundleMouthSetEntry[] = [];

  // Pack referenced assets
  for (const assetId of neededAssetIds) {
    const asset = assetsMap.get(assetId);
    if (!asset || !asset.blob) continue;

    const ext = getExtensionForMimeType(asset.mimeType, asset.type);
    const filename = `assets/${asset.id}${ext}`;
    const u8 = await blobToUint8Array(asset.blob);
    zipFiles[filename] = u8;

    manifestAssets.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      mimeType: asset.mimeType,
      filename,
      size: u8.byteLength,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
    });
  }

  // Pack referenced mouth sets
  for (const msId of neededMouthSetIds) {
    const ms = mouthSetsMap.get(msId);
    if (!ms) continue;

    const filename = `mouthSets/${ms.id}.json`;
    const msJsonStr = JSON.stringify(ms, null, 2);
    zipFiles[filename] = strToU8(msJsonStr);

    manifestMouthSets.push({
      id: ms.id,
      name: ms.name,
      sourceAssetId: ms.sourceAssetId,
      filename,
    });
  }

  // Build manifest
  const manifest: ProjectBundleManifest = {
    version: 1,
    appName: 'Cartoon Speaks',
    exportedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    assetCount: manifestAssets.length,
    mouthSetCount: manifestMouthSets.length,
    assets: manifestAssets,
    mouthSets: manifestMouthSets,
  };

  zipFiles['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  zipFiles['project.json'] = strToU8(JSON.stringify(project, null, 2));

  const zipped = zipSync(zipFiles, { level: 6 });
  return new Blob([zipped], { type: 'application/x-cartoonspeaks+zip' });
}

/**
 * Validates and extracts a .cartoonspeaks bundle from a Blob or raw Uint8Array.
 */
export async function importProjectBundle(
  bundleData: Blob | Uint8Array,
  options?: { newProjectId?: boolean }
): Promise<{
  project: EditorProject;
  assets: EditorAsset[];
  mouthSets: MouthSetAsset[];
  manifest: ProjectBundleManifest;
}> {
  const bytes = bundleData instanceof Blob ? await blobToUint8Array(bundleData) : bundleData;
  const unzipped = unzipSync(bytes);

  // Validate archive paths against zip-slip
  for (const path of Object.keys(unzipped)) {
    validateArchivePath(path);
  }

  // Validate manifest.json
  if (!unzipped['manifest.json']) {
    throw new Error('Invalid bundle: Missing manifest.json in archive root.');
  }

  const manifestStr = strFromU8(unzipped['manifest.json']);
  let manifest: ProjectBundleManifest;
  try {
    manifest = JSON.parse(manifestStr);
  } catch {
    throw new Error('Invalid bundle: manifest.json is corrupted or not valid JSON.');
  }

  if (manifest.appName !== 'Cartoon Speaks') {
    throw new Error(`Invalid bundle: Incompatible appName "${manifest.appName}".`);
  }

  if (manifest.version !== 1) {
    throw new Error(`Unsupported bundle format version ${manifest.version}.`);
  }

  // Validate project.json
  if (!unzipped['project.json']) {
    throw new Error('Invalid bundle: Missing project.json in archive root.');
  }

  const projectStr = strFromU8(unzipped['project.json']);
  let parsedProjectJson: unknown;
  try {
    parsedProjectJson = JSON.parse(projectStr);
  } catch {
    throw new Error('Invalid bundle: project.json is not valid JSON.');
  }

  const validation = validateProjectJson(parsedProjectJson);
  if (!validation.valid || !validation.project) {
    throw new Error(`Invalid project state in bundle: ${validation.error || 'Validation failed'}`);
  }

  const loadedProject = validation.project;
  const targetProjectId = options?.newProjectId
    ? `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    : loadedProject.id;

  loadedProject.id = targetProjectId;

  // Extract assets
  const restoredAssets: EditorAsset[] = [];
  for (const entry of manifest.assets) {
    const rawData = unzipped[entry.filename];
    if (!rawData) {
      throw new Error(`Missing expected asset binary in bundle: ${entry.filename}`);
    }

    const blob = new Blob([rawData], { type: entry.mimeType });
    restoredAssets.push({
      id: entry.id,
      name: entry.name,
      type: entry.type as 'image' | 'audio',
      mimeType: entry.mimeType,
      blob,
      url: getCachedObjectUrl(entry.id, blob),
      width: entry.width,
      height: entry.height,
      duration: entry.duration,
      projectId: targetProjectId,
      createdAt: Date.now(),
    });
  }

  // Extract mouth sets
  const restoredMouthSets: MouthSetAsset[] = [];
  for (const entry of manifest.mouthSets) {
    const rawData = unzipped[entry.filename];
    if (!rawData) {
      continue;
    }
    try {
      const msData: MouthSetAsset = JSON.parse(strFromU8(rawData));
      msData.projectId = targetProjectId;
      restoredMouthSets.push(msData);
    } catch (e) {
      console.warn(`Failed to parse mouth set "${entry.filename}":`, e);
    }
  }

  return {
    project: loadedProject,
    assets: restoredAssets,
    mouthSets: restoredMouthSets,
    manifest,
  };
}

/**
 * Saves all imported bundle data into IndexedDB.
 */
export async function persistImportedBundle(bundle: {
  project: EditorProject;
  assets: EditorAsset[];
  mouthSets: MouthSetAsset[];
}): Promise<void> {
  for (const asset of bundle.assets) {
    await saveAsset(asset);
  }
  for (const ms of bundle.mouthSets) {
    await saveMouthSet(ms);
  }
  await saveProject(bundle.project);
}

/**
 * Helper to initiate browser download for exported .cartoonspeaks bundle.
 */
export function downloadBundle(blob: Blob, projectName: string): void {
  const safeName = projectName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'project';
  const filename = `${safeName}.cartoonspeaks`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
