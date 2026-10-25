import Dexie, { type Table } from 'dexie';
import { EditorAsset, MouthSetAsset, MouthSprite } from '../../types/assets';
import { EditorProject } from '../../types/project';

export interface StoredAssetRecord {
  id: string;
  projectId?: string;
  name: string;
  type: string;
  mimeType: string;
  blob: Blob;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: number;
}

export interface StoredMouthSetRecord {
  id: string;
  projectId?: string;
  name: string;
  sourceAssetId: string;
  spritesJson: string; // Serialized sprites data
  createdAt: number;
}

export interface StoredProjectRecord {
  id: string;
  name: string;
  dataJson: string;
  updatedAt: number;
}

export interface StoredSnapshotRecord {
  id: string;
  projectId: string;
  name?: string;
  dataJson: string;
  isAuto: boolean;
  createdAt: number;
}

class CartoonDatabase extends Dexie {
  assets!: Table<StoredAssetRecord, string>;
  mouthSets!: Table<StoredMouthSetRecord, string>;
  projects!: Table<StoredProjectRecord, string>;
  snapshots!: Table<StoredSnapshotRecord, string>;

  constructor() {
    super('CartoonSpeaksV2_DB');
    this.version(1).stores({
      assets: 'id, type, name, createdAt',
      mouthSets: 'id, sourceAssetId, createdAt',
      projects: 'id, name, updatedAt',
    });
    this.version(2).stores({
      assets: 'id, projectId, type, name, createdAt',
      mouthSets: 'id, projectId, sourceAssetId, createdAt',
      projects: 'id, name, updatedAt',
    });
    this.version(3).stores({
      assets: 'id, projectId, type, name, createdAt',
      mouthSets: 'id, projectId, sourceAssetId, createdAt',
      projects: 'id, name, updatedAt',
      snapshots: 'id, projectId, createdAt, isAuto',
    });
  }
}

export const db = new CartoonDatabase();

// In-memory cache for Object URLs, decoded HTMLImageElements, and failed URLs
const objectUrlCache = new Map<string, string>();
const imageElementCache = new Map<string, HTMLImageElement>();
const failedImageUrls = new Set<string>();

export function getCachedObjectUrl(id: string, blob: Blob): string {
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!;
  }
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
}

export function revokeCachedObjectUrl(id: string): void {
  const url = objectUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(id);
  }
  imageElementCache.delete(id);
}

export async function getImageElement(assetId: string, url: string): Promise<HTMLImageElement> {
  if (!url || failedImageUrls.has(url)) {
    throw new Error(`Invalid or already failed URL for asset ${assetId}`);
  }

  if (imageElementCache.has(assetId)) {
    const cached = imageElementCache.get(assetId)!;
    if (cached.complete && cached.naturalWidth > 0) {
      return cached;
    }
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageElementCache.set(assetId, img);
      resolve(img);
    };
    img.onerror = (e) => {
      failedImageUrls.add(url);
      reject(new Error(`Failed to load image for asset ${assetId}: ${e}`));
    };
    img.src = url;
  });
}

/**
 * Saves an EditorAsset into IndexedDB and returns asset with cached URL.
 */
export async function saveAsset(asset: Omit<EditorAsset, 'url'>): Promise<EditorAsset> {
  await db.assets.put({
    id: asset.id,
    projectId: asset.projectId,
    name: asset.name,
    type: asset.type,
    mimeType: asset.mimeType,
    blob: asset.blob,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    createdAt: asset.createdAt,
  });

  const url = getCachedObjectUrl(asset.id, asset.blob);
  return { ...asset, url };
}

/**
 * Loads all stored assets from IndexedDB into memory with cached object URLs.
 */
export async function loadAllAssets(): Promise<EditorAsset[]> {
  const records = await db.assets.toArray();
  return records.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    type: r.type as EditorAsset['type'],
    mimeType: r.mimeType,
    blob: r.blob,
    width: r.width,
    height: r.height,
    duration: r.duration,
    createdAt: r.createdAt,
    url: getCachedObjectUrl(r.id, r.blob),
  }));
}

/**
 * Saves a MouthSet into IndexedDB.
 */
export async function saveMouthSet(mouthSet: MouthSetAsset): Promise<void> {
  const sanitizedSprites: Record<string, any> = {};
  for (const [key, sprite] of Object.entries(mouthSet.sprites)) {
    sanitizedSprites[key] = {
      ...sprite,
      url: sprite.url && sprite.url.startsWith('blob:') ? '' : sprite.url,
      blob: undefined,
    };
  }
  await db.mouthSets.put({
    id: mouthSet.id,
    projectId: mouthSet.projectId,
    name: mouthSet.name,
    sourceAssetId: mouthSet.sourceAssetId,
    spritesJson: JSON.stringify(sanitizedSprites),
    createdAt: mouthSet.createdAt,
  });
}

/**
 * Loads all mouth sets from IndexedDB.
 */
export async function loadAllMouthSets(): Promise<MouthSetAsset[]> {
  const records = await db.mouthSets.toArray();
  return records.map((r) => {
    const sprites: Record<string, MouthSprite> = JSON.parse(r.spritesJson);
    for (const s of Object.values(sprites)) {
      // Clear all expired blob URLs loaded from persistent storage
      if (s.url && s.url.startsWith('blob:')) {
        s.url = '';
      }
    }
    return {
      id: r.id,
      projectId: r.projectId,
      name: r.name,
      sourceAssetId: r.sourceAssetId,
      sprites,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Deletes an asset permanently from IndexedDB and revokes cached object URL.
 */
export async function deleteAssetFromDb(id: string): Promise<void> {
  revokeCachedObjectUrl(id);
  await db.assets.delete(id);
}

/**
 * Deletes a mouth set from IndexedDB.
 */
export async function deleteMouthSetFromDb(id: string): Promise<void> {
  await db.mouthSets.delete(id);
}

/**
 * Permanently removes all assets and mouth sets from IndexedDB and revokes object URLs.
 */
export async function clearAllAssetsFromDb(): Promise<void> {
  const all = await db.assets.toArray();
  for (const a of all) {
    revokeCachedObjectUrl(a.id);
  }
  await db.assets.clear();
  await db.mouthSets.clear();
}

/**
 * Saves an EditorProject to IndexedDB.
 */
export async function saveProjectToDb(project: EditorProject): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await db.projects.put({
    id: project.id,
    name: project.name,
    dataJson: JSON.stringify(project),
    updatedAt: Date.now(),
  });
}

export const saveProject = saveProjectToDb;

/**
 * Saves a version snapshot for a project.
 * Automatically keeps at most 10 rolling autosaves per project.
 */
export async function saveSnapshotToDb(
  projectId: string,
  project: EditorProject,
  isAuto: boolean = true,
  name?: string
): Promise<StoredSnapshotRecord> {
  const snapshot: StoredSnapshotRecord = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    projectId,
    name: name || (isAuto ? 'Autosave Snapshot' : 'Manual Checkpoint'),
    dataJson: JSON.stringify(project),
    isAuto,
    createdAt: Date.now(),
  };

  if (typeof indexedDB === 'undefined') return snapshot;
  await db.snapshots.put(snapshot);

  // If auto snapshot, trim rolling history to maximum 10
  if (isAuto) {
    try {
      const autoSnaps = await db.snapshots
        .where('projectId')
        .equals(projectId)
        .filter((s) => s.isAuto)
        .sortBy('createdAt');

      if (autoSnaps.length > 10) {
        const toDelete = autoSnaps.slice(0, autoSnaps.length - 10);
        await db.snapshots.bulkDelete(toDelete.map((s) => s.id));
      }
    } catch (e) {
      console.warn('Failed to trim old autosaves:', e);
    }
  }

  return snapshot;
}

/**
 * Retrieves all stored snapshots for a specific project sorted descending by createdAt.
 */
export async function listProjectSnapshots(projectId: string): Promise<StoredSnapshotRecord[]> {
  const snaps = await db.snapshots
    .where('projectId')
    .equals(projectId)
    .reverse()
    .sortBy('createdAt');
  return snaps;
}

/**
 * Deletes a snapshot by its ID.
 */
export async function deleteSnapshotFromDb(id: string): Promise<void> {
  await db.snapshots.delete(id);
}

/**
 * Restores project from snapshot record.
 */
export async function restoreSnapshotFromDb(snapshotId: string): Promise<EditorProject | null> {
  const snap = await db.snapshots.get(snapshotId);
  if (!snap) return null;
  return JSON.parse(snap.dataJson);
}

/**
 * Loads an EditorProject from IndexedDB by ID.
 */
export async function loadProjectFromDb(id: string): Promise<EditorProject | null> {
  const rec = await db.projects.get(id);
  if (!rec) return null;
  return JSON.parse(rec.dataJson);
}

/**
 * Lists all stored project summaries.
 */
export async function listStoredProjects(): Promise<Array<{ id: string; name: string; updatedAt: number }>> {
  const recs = await db.projects.toArray();
  return recs.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }));
}

/**
 * Deletes a project from IndexedDB and all its associated assets and snapshots.
 */
export async function deleteProjectFromDb(id: string): Promise<void> {
  await db.projects.delete(id);
  try {
    const projectAssets = await db.assets.where('projectId').equals(id).toArray();
    for (const a of projectAssets) {
      revokeCachedObjectUrl(a.id);
    }
    await db.assets.where('projectId').equals(id).delete();
    await db.mouthSets.where('projectId').equals(id).delete();
    await db.snapshots.where('projectId').equals(id).delete();
  } catch (_) {}
}
