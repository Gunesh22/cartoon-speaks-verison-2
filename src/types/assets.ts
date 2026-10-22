export type AssetType = 'image' | 'audio' | 'mouthSheet';

export interface EditorAsset {
  id: string;
  projectId?: string;
  name: string;
  type: AssetType;
  mimeType: string;
  blob: Blob;
  url: string;
  width?: number;
  height?: number;
  duration?: number; // For audio in seconds
  createdAt: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MouthSprite {
  id: string;
  label: string; // 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'
  cropRect: CropRect; // Region in original sprite sheet
  bounds: ContentBounds; // Precise bounding box of visible mouth pixels within cropped sprite
  anchorX: number; // 0..1 normalized within cropped sprite
  anchorY: number; // 0..1 normalized within cropped sprite
  width: number;
  height: number;
  blob: Blob;
  url: string;
}

export interface MouthSetAsset {
  id: string;
  projectId?: string;
  name: string;
  sourceAssetId: string;
  sprites: Record<string, MouthSprite>; // keyed by shape label e.g. 'A', 'B', 'C'
  referenceCellWidth?: number;
  referenceCellHeight?: number;
  templateType?: '3x3' | '4x3' | 'auto';
  createdAt: number;
}
