# Cartoon Speaks Version 2 — 2D Video Editor & Lip-Sync Studio

**Cartoon Speaks Version 2** is a lightweight, browser-based 2D video editor built completely from scratch with React, TypeScript, Vite, HTML5 Canvas 2D, and Web Audio API.

It features an authoritative 4-track timeline (V1–V4), image-based transformations (position, scale, rotation, opacity), persistent IndexedDB asset storage, high-fidelity MP4 video export, and an advanced Lip-Sync Animation Generator that extracts tight mouth bounds and coordinates Rhubarb mouth cues with voice audio.

---

## 1. Architectural Differences & Improvements from Version 1

During the pre-build audit of Version 1, critical structural flaws were identified and resolved:
1. **Authoritative Timeline Model**: Version 1 split sequence timing, clip properties, and state across disparate stores. Version 2 uses a single authoritative project model (`EditorProject`) governed by Zustand with deterministic rendering order (V1 on bottom, V4 on top).
2. **Fixed 4-Track Limit**: Visual clips are strictly constrained to tracks V1, V2, V3, and V4. Audio is managed independently in dedicated audio clips, eliminating track-bloat.
3. **Mouth Bounding Box & Anchor Extraction**: Version 1 used whole grid cells or arbitrary padding, leading to drifting mouth anchors and jumping jaws. Version 2 isolates visible pixels (`alpha > 20`), calculates tight content bounds, and pins the normalized anchor to the center of the upper lip so mouth shapes open downwards naturally.
4. **Clean Preview vs Export Separation**: Selection outlines, transform bounding boxes, and diagnostic crosshairs are rendered on an editor overlay layer and never bleed into exported MP4 videos.
5. **Universal Video Export**: Combines WebCodecs (`VideoEncoder` + `AudioEncoder` + `mp4-muxer`) for native MP4 export with an automatic `MediaRecorder` fallback for universal browser compatibility.
6. **Zero Cloud Dependencies**: All image and audio assets persist in local browser IndexedDB using object URLs without base64 JSON payload bloat.

---

## 2. Folder Structure

```
Cartoon Speaks Version 2/
├── src/
│   ├── app/
│   │   └── EditorApp.tsx               # Root single-screen editor layout
│   ├── components/
│   │   ├── Toolbar/Toolbar.tsx         # Top toolbar with playback & import controls
│   │   ├── AssetPanel/AssetPanel.tsx   # Left panel: Media & Mouth Sets (drag to timeline)
│   │   ├── PreviewCanvas/PreviewCanvas.tsx # Canvas 2D composition preview & transforms
│   │   ├── PropertiesPanel/PropertiesPanel.tsx # Right panel for position, scale, opacity, anchor
│   │   ├── Timeline/Timeline.tsx       # Bottom 4-track timeline with playhead & trim handles
│   │   ├── LipSyncModal/LipSyncModal.tsx # Lip-sync generator with diagnostic preview
│   │   ├── ExportModal/ExportModal.tsx # Video export dialog (720p/1080p, MP4)
│   │   └── ProjectModal/ProjectModal.tsx # Project save, open, JSON import/export
│   ├── core/
│   │   ├── assets/assetDb.ts           # Dexie / IndexedDB persistence & asset cache
│   │   ├── audio/audioEngine.ts        # Web Audio API playback & multi-clip scheduling
│   │   ├── export/videoExporter.ts     # Offline audio mixing & WebCodecs/mp4-muxer export
│   │   ├── project/projectManager.ts   # Project metadata validation & missing asset checks
│   │   ├── renderer/canvasRenderer.ts  # Canvas 2D composition renderer & overlay engine
│   │   └── timeline/timelineMath.ts    # Clip boundaries, snapping, trimming, track ordering
│   ├── features/
│   │   └── lipSync/
│   │       ├── anchor.ts               # Normalized anchor math & transform mapping
│   │       ├── lipSyncGenerator.ts     # In-browser phonetic & energy aligner
│   │       ├── mouthBounds.ts          # Alpha thresholding & tight mouth bounds detection
│   │       ├── rhubarbAdapter.ts       # Rhubarb CLI JSON/TSV parser & companion client
│   │       └── spriteCropper.ts        # 3x3 grid generation & single sprite extraction
│   ├── state/
│   │   └── editorStore.ts              # Zustand authoritative state store with undo/redo
│   ├── styles/
│   │   └── index.css                   # Dark editor styles & scrollbars
│   ├── types/
│   │   ├── assets.ts                   # Asset, MouthSprite, and MouthSet types
│   │   ├── lipSync.ts                  # MouthCue, LipSyncData, Rhubarb types
│   │   ├── project.ts                  # EditorProject schema
│   │   └── timeline.ts                 # VisualClip, AudioClip, TrackId (V1..V4)
│   └── main.tsx                        # Application mount
├── tests/
│   ├── timeline.test.ts                # Timeline math, trimming, 4-track enforcement tests
│   ├── mouthExtraction.test.ts         # Bounds detection, cropping, anchor stability tests
│   ├── lipSync.test.ts                 # Rhubarb JSON/TSV parsing & cue sync tests
│   └── renderingAndExport.test.ts      # Project serialization & schema validation tests
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

---

## 3. Installation and Launch Instructions

### Prerequisites
- Node.js (v18 or higher recommended; developed and tested on v20.18.0)
- npm (v9 or higher; tested on v10.9.0)

### Setup & Run
1. Open a terminal in `Cartoon Speaks Version 2`:
   ```bash
   cd "d:\cartoon speaks version 2"
   ```
2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Run the automated tests:
   ```bash
   npm test
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

---

## 4. Completed & Verified Features

- [x] **Single-Screen UI**: Professional dark layout (Toolbar, Asset Panel, Central Preview, Properties Panel, Bottom Timeline).
- [x] **Image & Audio Import**: Direct file input and drag-and-drop into project bin.
- [x] **Local Persistence**: IndexedDB storage through Dexie caches all imported images, audio buffers, mouth sets, and projects across browser refreshes.
- [x] **Strict 4-Track Timeline**: Visual tracks are strictly limited to `V1`, `V2`, `V3`, `V4` (with `V4` on top). Audio is scheduled on a dedicated audio lane.
- [x] **Interactive Canvas 2D Preview**: Select, move, resize (maintaining aspect ratio), and rotate images directly on the composition canvas.
- [x] **Selection Overlay Exclusion**: Outlines, resize handles, and anchor crosshairs are rendered on an editor layer only and never appear in exported videos.
- [x] **Mouth Bounds & Upper-Lip Anchor**: Pure pixel-analysis algorithm identifies exact mouth bounds, removes transparent margins, and pins mouth shapes to the character's upper lip.
- [x] **Lip-Sync Modal**:
  - Accepts character image, 3x3 mouth sprite sheet, spoken audio, and dialogue text.
  - Automatically crops sprite sheet into 9 individual mouth shapes (A, B, C, D, E, F, G, H, X).
  - Generates synchronized mouth cues (supporting local Rhubarb CLI companion or in-browser phonetic audio energy aligner).
  - Diagnostic preview mode displays character anchor crosshair, mouth bounds, and individual sprite inspection.
  - Interactive playback in modal to audition synchronization before adding to timeline.
  - "Add to Timeline" button creates the visual lip-sync clip and links audio to the audio timeline.
- [x] **Video Export (MP4)**: Offline audio mixer and WebCodecs (`VideoEncoder` + `AudioEncoder` + `mp4-muxer`) render clean 720p/1080p MP4 videos with audio sync.
- [x] **Project Management**: Save, open, rename, delete projects, export metadata as JSON, and import JSON with schema validation and missing asset warnings.
- [x] **Automated Test Suite**: 23 automated tests covering timeline calculations, mouth extraction, Rhubarb parsing, and export validation (all passing).
