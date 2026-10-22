import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock assetDb IndexedDB operations for Vitest Node.js environment
vi.mock('../src/core/assets/assetDb', () => ({
  saveAsset: vi.fn(async (asset: any) => ({ ...asset, url: 'blob:mock' })),
  saveMouthSet: vi.fn(async () => {}),
  deleteAssetFromDb: vi.fn(async () => {}),
  deleteMouthSetFromDb: vi.fn(async () => {}),
  clearAllAssetsFromDb: vi.fn(async () => {}),
  loadAllAssets: vi.fn(async () => []),
  loadAllMouthSets: vi.fn(async () => []),
  saveProjectToDb: vi.fn(async () => {}),
  loadProjectFromDb: vi.fn(async () => null),
  listStoredProjects: vi.fn(async () => []),
  deleteProjectFromDb: vi.fn(async () => {}),
}));

import { useEditorStore } from '../src/state/editorStore';
import { EditorAsset } from '../src/types/assets';

describe('Project Asset Isolation Tests', () => {
  beforeEach(() => {
    // Reset store state
    useEditorStore.setState({
      assets: new Map(),
      mouthSets: new Map(),
    });
  });

  it('isolates assets per project so new projects do not display previous project media', async () => {
    const store = useEditorStore.getState();

    // 1. Create Project A
    store.newProject('Project A');
    const projectA = useEditorStore.getState().project;
    expect(projectA.name).toBe('Project A');

    // 2. Add an asset to Project A
    const dummyBlob = new Blob(['image data'], { type: 'image/png' });
    const assetA: Omit<EditorAsset, 'url'> = {
      id: 'asset_projA_1',
      name: 'characterA.png',
      type: 'image',
      mimeType: 'image/png',
      blob: dummyBlob,
      width: 500,
      height: 500,
      createdAt: Date.now(),
    };

    await useEditorStore.getState().addAsset(assetA);

    const assetsAfterA = useEditorStore.getState().assets;
    expect(assetsAfterA.size).toBe(1);
    expect(assetsAfterA.get('asset_projA_1')?.projectId).toBe(projectA.id);

    // Filter for Project A: exactly 1 asset
    const projectAAssets = Array.from(assetsAfterA.values()).filter(
      (a) => a.projectId === projectA.id
    );
    expect(projectAAssets.length).toBe(1);

    // 3. User creates a brand New Project (Project B)
    useEditorStore.getState().newProject('Project B');
    const projectB = useEditorStore.getState().project;
    expect(projectB.id).not.toBe(projectA.id);
    expect(projectB.name).toBe('Project B');

    // 4. In Project B, filtering for current project must return EMPTY (0 assets)
    const currentAssets = useEditorStore.getState().assets;
    const projectBAssets = Array.from(currentAssets.values()).filter(
      (a) => a.projectId === projectB.id
    );
    expect(projectBAssets.length).toBe(0);

    // 5. Legacy unassigned assets (projectId = undefined) must not leak into Project B
    const legacyAsset: EditorAsset = {
      id: 'legacy_asset_old',
      name: 'old_photo.png',
      type: 'image',
      mimeType: 'image/png',
      blob: dummyBlob,
      url: 'blob:old',
      createdAt: Date.now() - 100000,
      projectId: undefined,
    };
    useEditorStore.setState((state) => {
      const next = new Map(state.assets);
      next.set(legacyAsset.id, legacyAsset);
      return { assets: next };
    });

    const projectBStrictAssets = Array.from(useEditorStore.getState().assets.values()).filter(
      (a) => a.projectId === projectB.id
    );
    expect(projectBStrictAssets.length).toBe(0);

    // 6. All Library scope contains both project A asset and legacy asset
    const allLibraryAssets = Array.from(useEditorStore.getState().assets.values());
    expect(allLibraryAssets.length).toBe(2);
  });

  it('clears all assets and mouthsets when clearAllAssets is invoked', async () => {
    const dummyBlob = new Blob(['test'], { type: 'audio/wav' });
    const asset: Omit<EditorAsset, 'url'> = {
      id: 'test_audio_1',
      name: 'dialogue.wav',
      type: 'audio',
      mimeType: 'audio/wav',
      blob: dummyBlob,
      duration: 3.5,
      createdAt: Date.now(),
    };

    await useEditorStore.getState().addAsset(asset);
    expect(useEditorStore.getState().assets.size).toBe(1);

    await useEditorStore.getState().clearAllAssets();
    expect(useEditorStore.getState().assets.size).toBe(0);
    expect(useEditorStore.getState().mouthSets.size).toBe(0);
  });
});
