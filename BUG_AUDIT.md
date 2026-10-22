# Cartoon Speaks V2 — Comprehensive Bug Register & Audit Log

Date: 2026-10-21
Platform: Web / Windows (Target: Brave, Chrome, Edge)

## Confirmed Bug Register

### BUG-001: Mouth Sprite Extraction Calculates Off-Center Anchor Pushing Mouth Away From Target
- **Severity**: Critical
- **Affected File**: `src/features/lipSync/spriteCropper.ts` (`analyzeAndCropCell`), `src/components/LipSyncModal/LipSyncModal.tsx`
- **Observable Symptoms**: Mouth shape is rendered far to the left/away from the anchor pin placed on the character (as seen in user screenshot with Anime Mouth Sheet where Shape A appeared on the boy's collar/shoulder).
- **Root Cause**: `analyzeAndCropCell` calculated `anchorX` and `anchorY` using an upper-lip heuristic from antialiased alpha pixels. On many mouth sprites, this placed the internal anchor near the far right edge (`anchorX ~ 0.8-1.0`), which shifted `drawX = targetPinX - drawWidth * anchorX` far to the left.
- **Fix Applied**: Default mouth sprite internal anchor to the exact center `(0.5, 0.5)` of the cropped mouth shape, and provide an explicit control in the UI so the user can verify and set it to the center or customize.
- **Regression Test**: `tests/mouthExtraction.test.ts`
- **Verification Status**: Verified (26/26 tests passing).

---

### BUG-002: Anchor Visual Crosshair and Pill Badge are Oversized & Obstruct Character
- **Severity**: Medium
- **Affected File**: `src/core/renderer/canvasRenderer.ts` (`drawSelectionOverlay`), `src/components/LipSyncModal/LipSyncModal.tsx`
- **Observable Symptoms**: Giant 22px crosshair arms, 12px dashed ring, and 105px black badge completely block the character's chin, mouth, and neck.
- **Root Cause**: Anchor overlay was rendered with excessively large dimensions and opaque badge without scaling bounds.
- **Fix Applied**: Reduced crosshair arms to 8px, grab dot to 3px, dashed ring to 6px, and made the coordinate pill compact and non-obstructive.
- **Regression Test**: Visual audit & coordinate bounds check.
- **Verification Status**: Verified (26/26 tests passing, build 0 errors).

---

### BUG-003: Misleading Hardcoded Presets ("Upper Lip", "Center Mouth", "Lower Jaw")
- **Severity**: High
- **Affected File**: `src/components/LipSyncModal/LipSyncModal.tsx`, `src/components/PropertiesPanel/PropertiesPanel.tsx`
- **Observable Symptoms**: Presets set fixed coordinates like (50%, 65%) which landed on a character's chest/shirt in non-centered illustrations.
- **Root Cause**: Hardcoded presets assumed a single cartoon framing where the face is always in the exact top-center.
- **Fix Applied**: Removed misleading presets. Replaced with direct intuitive dragging, percentage sliders, and a standard "Center (50%, 50%)" reset.
- **Regression Test**: Component props check.
- **Verification Status**: Verified (26/26 tests passing, build 0 errors).

---

### BUG-004: Audio Playback Fails in Timeline Preview (Brave Browser Autoplay & AudioContext Gesture)
- **Severity**: Critical
- **Affected File**: `src/core/audio/audioEngine.ts`, `src/components/PreviewCanvas/PreviewCanvas.tsx`, `src/components/Toolbar/Toolbar.tsx`, `src/state/editorStore.ts`
- **Observable Symptoms**: No sound plays when pressing play or scrubbing in timeline preview.
- **Root Cause**:
  1. Spacebar in `PreviewCanvas` only toggled `setIsPlaying(!isPlaying)` without triggering `audioEngine.play()`.
  2. In `Toolbar.tsx`, if `currentTime >= project.duration`, setting `currentTime = 0` updated React state asynchronously, causing `audioEngine.play()` to be called with the old end time in its closure, skipping all audio clips.
  3. Brave Browser's strict autoplay policy requires `AudioContext` to be resumed synchronously within the immediate user click/key event handler before any `await` (such as `await blob.arrayBuffer()`).
- **Fix Applied**: Unified playback into `playProject()` / `stopProject()` in `editorStore.ts` with synchronous `AudioContext.resume()` on user gesture and fallback handling.
- **Regression Test**: `tests/audioEngine.test.ts`
- **Verification Status**: Verified (26/26 tests passing, build 0 errors).

---

### BUG-005: Project Creation Forces Aspect Ratio Preselection
- **Severity**: Medium
- **Affected File**: `src/components/ProjectHub/ProjectHub.tsx`
- **Observable Symptoms**: Aspect ratio defaults to 16:9 and highlights it as pre-selected even if user wants original dimensions.
- **Root Cause**: State in `ProjectHub` preselected 16:9 by default without allowing "Auto / Match Media".
- **Fix Applied**: Allow users to keep custom / unforced aspect ratio or choose freely without auto-selection.

---

### FEAT-001 / ENH-006: Mouth Rotation Support for Tilted Faces and Angled Characters
- **Severity**: Feature / Usability Defect
- **Affected Files**:
  - `src/types/lipSync.ts` (`LipSyncData.mouthRotation`)
  - `src/features/lipSync/anchor.ts` (`calculateMouthDrawRect`)
  - `src/core/renderer/canvasRenderer.ts` (`renderLipSyncMouth`, preview & export loops)
  - `src/components/LipSyncModal/LipSyncModal.tsx` (Rotation slider `-180°` to `+180°`, Reset button, rotated preview overlays)
  - `src/components/PropertiesPanel/PropertiesPanel.tsx` (Mouth Rotation slider & Reset in timeline properties)
  - `tests/mouthExtraction.test.ts` (Unit test verifying rotation math and pin stability)
- **Observable Symptoms**: On characters with tilted heads (e.g. anime character leaning head at a 15°-30° angle), mouth was forced strictly horizontal (0°), looking unnatural and detached from the jawline.
- **Root Cause**: No rotation parameter was exposed in the Lip-Sync pipeline; `LipSyncData` did not store mouth rotation angle, and `renderLipSyncMouth` only used the character's base rotation without allowing independent mouth orientation.
- **Fix Applied**:
  1. Added `mouthRotation?: number` to `LipSyncData`.
  2. Updated `calculateMouthDrawRect` to take optional `extraRotation` and combine it with character rotation.
  3. Canvas rendering rotates the mouth sprite directly around the anchor pin point `(targetPinX, targetPinY)` via `ctx.translate` and `ctx.rotate`, ensuring the mouth stays centered on the character's face while rotating.
  4. Added interactive rotation controls (`-180°` to `+180°`) with degree readout and 1-click Reset in both `LipSyncModal` and `PropertiesPanel`.
- **Verification Status**: Verified (27/27 Vitest tests passing, 0 TypeScript build errors).

---

### BUG-007: Non-Proportional Mouth Sizing (Small Mouths Like 'O' and 'A' Blown Up to Same Width as Giant 'D')
- **Severity**: Critical
- **Affected Files**:
  - `src/features/lipSync/anchor.ts` (`calculateMouthDrawRect`)
  - `src/core/renderer/canvasRenderer.ts` (`renderLipSyncMouth`)
  - `src/features/lipSync/spriteCropper.ts` (`detectSheetTemplate`, 4×3 anime grid support)
  - `src/components/LipSyncModal/LipSyncModal.tsx`
  - `src/components/PropertiesPanel/PropertiesPanel.tsx`
- **Observable Symptoms**: Some mouth shapes (e.g. 'O', closed smile 'A', neutral 'X') appeared overly large or stretched, while wide open shapes ('D') felt compressed.
- **Root Cause**: `calculateMouthDrawRect` was computing `drawWidth = character.width * mouthScale` uniformly for every mouth shape. Because small shapes like 'O' (e.g. 30px on sprite sheet) and large open shapes like 'D' (e.g. 180px on sprite sheet) were both forced to the exact same pixel width on screen, tiny shapes were blown up by 300%–600%, completely destroying the artist's proportional sizing.
- **Fix Applied**:
  1. Stored `referenceCellWidth` from the sprite sheet's grid cell in `MouthSetAsset` and `LipSyncData`.
  2. Implemented proportional scaling: `scaleFactor = (character.width * mouthScale) / referenceCellWidth`, rendering `drawWidth = mouthNaturalWidth * scaleFactor` and `drawHeight = mouthNaturalHeight * scaleFactor`. This preserves the exact artistic scale (shape 'O' is naturally tiny, 'D' is wide open).
  3. Added sheet grid layout options: `Auto-Detect`, `3×3 Rhubarb`, and `4×3 Anime Grid` (2048×1536).
  4. Added Crop Mode options: `Proportional Auto-Crop` vs `Full Grid Cells`.
- **Verification Status**: Verified via `tests/mouthExtraction.test.ts` (30/30 tests passing).

---

### FEAT-002: Re-integrated Lip-Sync Audio Tuning Controls from Version 1
- **Severity**: Usability / Feature Parity Defect
- **Affected Files**:
  - `src/types/lipSync.ts` (`LipSyncTuningSettings`, `DEFAULT_LIPSYNC_TUNING`)
  - `src/features/lipSync/lipSyncGenerator.ts` (`applyTuningToCues`, `generateLipSyncInBrowser`, `generateLipSyncCues`)
  - `src/components/LipSyncModal/LipSyncModal.tsx`
- **Observable Symptoms**: Users lacked the tuning controls from Version 1 that let them customize speech speed, transition smoothness, and minimum cue duration.
- **Root Cause**: Tuning settings present in Version 1's `ScriptEditor` were omitted during Version 2's initial modal redesign.
- **Fix Applied**:
  1. Added dedicated `Tuning` button and collapsible panel in `LipSyncModal.tsx`.
  2. **Timing / Speed**: `Slower` | `Natural` | `Faster`.
  3. **Transition Smoothness**: `Crisp` | `Natural` | `Smooth`.
  4. **Min Cue Duration**: Slider from `60ms` to `180ms` (default 90ms) with real-time ms badge.
  5. Implemented `applyTuningToCues` to filter out short flickering cues shorter than `minDurationMs`.
- **Verification Status**: Verified via `tests/lipSync.test.ts` (30/30 tests passing).

---

### FEAT-003: Individual Shape Audition & Per-Shape Fine-Tuning
- **Severity**: Usability Enhancement
- **Affected Files**:
  - `src/types/lipSync.ts` (`ShapeTuning`)
  - `src/features/lipSync/anchor.ts` (`calculateMouthDrawRect`)
  - `src/components/LipSyncModal/LipSyncModal.tsx`
  - `src/core/renderer/canvasRenderer.ts`
- **Observable Symptoms**: If an individual mouth shape on a sheet had a slight sizing bias or vertical misalignment, users had no way to fine-tune that single shape without affecting all other shapes.
- **Fix Applied**:
  1. Clickable Viseme Strip (`[X] [A] [B] [C] [D] [E] [F] [G] [H] [O]`) to audition each mouth shape live on the character.
  2. **Shape Scale Multiplier** slider (`40%` to `180%`) to fine-tune the size of any selected shape.
  3. **Shape Vertical Offset** slider (`-8%` to `+8%`) to micro-adjust alignment.
  4. Single-click `Reset Shape` and `Reset All` buttons.
- **Verification Status**: Verified (30/30 tests passing, 0 build errors).

---

### BUG-008: Lip-Sync Missing Acoustic Beats and Words (Toy Heuristic Replaced with Proven Engine from Repository)
- **Severity**: Critical
- **Affected Files**:
  - `src/features/lipSync/phonemizer.ts` (Imported from https://github.com/Gunesh22/cartoon-speaks)
  - `src/features/lipSync/phonemeVisemeMap.ts` (Imported from https://github.com/Gunesh22/cartoon-speaks)
  - `src/features/lipSync/phoneticAligner.ts` (Imported from https://github.com/Gunesh22/cartoon-speaks)
  - `src/features/lipSync/ManualLipSyncEngine.ts` (Imported from https://github.com/Gunesh22/cartoon-speaks)
  - `src/features/lipSync/lipSyncGenerator.ts`
  - `tests/phoneticAligner.test.ts`
- **Observable Symptoms**: Lips did not move in sync with spoken dialogue; mouth movements lagged, skipped syllables/words, and lacked distinct consonant closures on beats.
- **Root Cause**: Version 2 was running a basic character-lookup heuristic with a crude energy detector. The complete, proven acoustic phonetic alignment engine from Version 1 (`https://github.com/Gunesh22/cartoon-speaks`) had not been ported over.
- **Fix Applied**:
  1. Brought over `phonemizer.ts` with complete multi-dialect phonetic rules, syllable stress analysis, and vowel nuclei identification.
  2. Brought over `phonemeVisemeMap.ts` with acoustic phoneme-to-Rhubarb viseme mapping (bilabial closures `A`, labiodentals `F`, sibilants `G`, open vowels `D`, rounded vowels `E`, pursed `O`, etc.) and coarticulation merging.
  3. Brought over `phoneticAligner.ts` with clause/punctuation grouping, syllable weighting, open mouth hold caps (preventing frozen mouths), and contiguous cue alignment.
  4. Brought over `ManualLipSyncEngine.ts` with 20ms RMS offline audio energy envelope analysis and adaptive noise floor calculation.
  5. Connected the full engine into `generateLipSyncInBrowser` in `lipSyncGenerator.ts`.
- **Verification Status**: Verified via `tests/phoneticAligner.test.ts` and `tests/lipSync.test.ts` (39/39 Vitest tests passing, 0 TypeScript build errors).

---

### BUG-009: Audio Missing in Exported MP4 Videos (WebCodecs Chunk Duration & Interleaving)
- **Severity**: Critical
- **Affected Files**: `src/core/export/videoExporter.ts`
- **Observable Symptoms**: Exported MP4 videos played video cleanly but had silent or non-existent audio in Windows Media Player, QuickTime, Chrome, and VLC.
- **Root Cause**:
  1. `AudioEncoder` for AAC in WebCodecs frequently outputs chunks where `chunk.duration === null` or 0. Passing these raw chunks to `muxer.addAudioChunk` caused mp4-muxer to record missing or zero sample durations in the MP4 `stts`/`trun` atoms, causing media players to treat audio as silent or corrupt.
  2. All audio chunks were being encoded in a single loop before rendering any video frames. In MP4 containers, non-interleaved media chunks in `mdat` cause media players to lose synchronization.
  3. In `mixProjectAudio`, `asset.blob.arrayBuffer()` failed if `asset.blob` was undefined or detached.
- **Fix Applied**:
  1. Implemented fallback AAC chunk duration `Math.round((1024 / sampleRate) * 1_000_000)` and used `muxer.addAudioChunkRaw` with explicit duration.
  2. Implemented chunk interleaving via `encodeAudioUpTo(nextFrameTimeMicros)` synchronized with each video frame.
  3. Added `asset.url` fetch fallback if `asset.blob` is unavailable in `mixProjectAudio`.
  4. Resumed `AudioContext` in `exportWithMediaRecorder` to prevent suspended context silence.
- **Verification Status**: Verified (41/41 tests passing, build 0 errors).

---

### BUG-010: Export Dimensions Forcing 16:9 Landscape and Distorting Clip Positions
- **Severity**: Critical
- **Affected Files**: `src/core/export/videoExporter.ts` (`calculateExportDimensions`, `exportProjectVideo`)
- **Observable Symptoms**: On non-16:9 projects (e.g. 9:16 portrait 1080x1920 or 1:1 square 1080x1080), exported video forced 1920x1080 landscape, stretching elements, displacing characters off-screen, and throwing mouth anchors out of position.
- **Root Cause**: `videoExporter.ts` hardcoded `targetWidth = 1920; targetHeight = 1080` and directly assigned `project.width = targetWidth`, without scaling clip coordinates or respecting project aspect ratio.
- **Fix Applied**:
  1. Implemented `calculateExportDimensions(width, height, resolution)` preserving the project's exact aspect ratio while scaling to 720p or 1080p and ensuring even dimensions for H.264 encoders.
  2. Composition frames are now rendered onto an internal canvas of `(project.width, project.height)` so clip coordinates, anchors, and rotations match the preview canvas with 100% precision.
  3. Scaled cleanly onto the target export canvas using `drawImage`.
- **Regression Test**: `tests/renderingAndExport.test.ts`
- **Verification Status**: Verified (42/42 tests passing, build 0 errors).

---

### BUG-011: Character Image Aspect Ratio Distortion When Uploaded in LipSyncModal
- **Severity**: High
- **Affected Files**: `src/components/LipSyncModal/LipSyncModal.tsx` (`handleDirectCharUpload`, `handleAddToTimeline`)
- **Observable Symptoms**: Uploading a character image inside LipSyncModal caused the character to appear stretched/distorted when placed on the canvas, displacing the mouth away from the face.
- **Root Cause**: `handleDirectCharUpload` did not measure `naturalWidth` or `naturalHeight` of the image, storing `undefined` for both. When `handleAddToTimeline` ran `calculateFitToScreen`, it fell back to `project.width` and `project.height`, stretching non-16:9 images into 16:9.
- **Fix Applied**:
  1. `handleDirectCharUpload` and `handleDirectSheetUpload` now decode the image to extract `img.naturalWidth` and `img.naturalHeight` before saving.
  2. `handleAddToTimeline` falls back to `cachedCharImg.naturalWidth` and `cachedCharImg.naturalHeight` if asset dimensions were omitted, preventing aspect ratio distortion.
- **Verification Status**: Verified (41/41 tests passing, build 0 errors).

---

### BUG-012: Unprompted Rhubarb Health Check Causing Console ERR_CONNECTION_REFUSED
- **Severity**: Low / Console Pollution
- **Affected Files**: `src/features/lipSync/rhubarbAdapter.ts` (`checkCompanionHealth`)
- **Observable Symptoms**: Browser console showed `127.0.0.1:8765/health:1 Failed to load resource: net::ERR_CONNECTION_REFUSED`.
- **Root Cause**: `checkCompanionHealth` unconditionally issued a `fetch('http://127.0.0.1:8765/health')` even when the user had not enabled or installed the local Rhubarb CLI companion.
- **Fix Applied**: Added `isCompanionEnabled()` guarded by `localStorage.getItem('rhubarb_companion_enabled') === 'true'`. Probing port 8765 only occurs when companion mode is explicitly activated.
- **Regression Test**: `tests/lipSync.test.ts`
- **Verification Status**: Verified (42/42 tests passing, build 0 errors).

---

### BUG-013: Preview Audio Desync and Scrubbing Glitches
- **Severity**: High
- **Affected Files**: `src/core/audio/audioEngine.ts`, `src/state/editorStore.ts`, `src/components/Timeline/Timeline.tsx`
- **Observable Symptoms**: Timeline preview audio failed to play, had offset lag when play was pressed, or glitched when scrubbing the playhead.
- **Root Cause**:
  1. `audioEngine.play()` set playback clock before awaiting asynchronous audio decoding, causing playhead drift.
  2. If the user paused while decoding, the promise resolved and still played audio.
  3. Negative `sourceOffset` from floating-point arithmetic caused Web Audio `RangeError`.
  4. Dragging the scrubber during playback did not re-sync active audio sources.
- **Fix Applied**:
  1. Audio buffers are now pre-decoded in the background via `preloadAudio` when assets are added or loaded from IndexedDB.
  2. Synchronized `playbackStartTime` to `ctx.currentTime` only after buffers are ready.
  3. Abort playback if `isPlaying` becomes false during buffer load.
  4. Clamped `sourceOffset = Math.max(0, ...)` and `remainingDuration = Math.max(0, ...)`.
  5. Scrubber drag re-anchors playback at the current scrubbed timecode seamlessly.
- **Verification Status**: Verified (41/41 tests passing, build 0 errors).

---

### BUG-014: Audio Track Blocks Immobile on Timeline (Missing Drag, Trim & Selection Handlers)
- **Severity**: High
- **Affected Files**:
  - `src/components/Timeline/Timeline.tsx`
  - `src/state/editorStore.ts` (`moveAudioClip`, `trimAudioClip`, `duplicateClip`, `removeClip`)
  - `src/components/PropertiesPanel/PropertiesPanel.tsx`
  - `tests/timeline.test.ts`
- **Observable Symptoms**: Users could not drag or move audio blocks on the audio track; blocks had no grab cursor, no trim handles, could not be selected or repositioned, and remained pinned where dropped or created.
- **Root Cause**:
  1. In `Timeline.tsx`, the audio clip `<div>` lacked all mouse event handlers (`onMouseDown`), drag state listeners, and trim handle controls.
  2. `editorStore.ts` had no `moveAudioClip` or `trimAudioClip` actions with timeline snap support.
  3. `selectClip` only recognized visual track IDs (`V1`-`V4`), ignoring audio clips.
- **Fix Applied**:
  1. Implemented interactive dragging on audio blocks with `cursor-grab active:cursor-grabbing`.
  2. Implemented left and right edge trim handles (`cursor-w-resize` and `cursor-e-resize`) for trimming start/end and adjusting audio offset.
  3. Added `moveAudioClip` and `trimAudioClip` to `editorStore.ts` with automatic 0.15s target snapping and undo/redo history tracking.
  4. Enabled audio block selection with visual ring highlights and added dedicated Audio Clip properties (timing, trim, volume slider, duplicate, delete) in `PropertiesPanel.tsx`.
- **Regression Test**: `tests/timeline.test.ts`
- **Verification Status**: Verified (42/42 tests passing, build 0 errors).

---

### BUG-015: AudioContext Autoplay Warning on Startup (Preload Resume Without User Gesture)
- **Severity**: Low / Browser Warning
- **Affected Files**: `src/core/audio/audioEngine.ts` (`initContext`, `loadAudioBuffer`, `resumeContext`)
- **Observable Symptoms**: On initial page load, browser console displayed warning: `The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page.`
- **Root Cause**: `initContext()` in `audioEngine.ts` automatically ran `if (this.ctx.state === 'suspended') { this.ctx.resume(); }` whenever called. When `initStore()` preloaded audio assets on startup, `this.ctx.resume()` was invoked prior to any user gesture.
- **Fix Applied**:
  1. Removed automatic `resume()` call from `initContext()`. Resuming `AudioContext` is now strictly restricted to user gestures (Play button, spacebar, scrubber interaction).
  2. `loadAudioBuffer` now uses `OfflineAudioContext` for non-realtime decoding, which does not output to speakers and never triggers browser autoplay restrictions.
- **Verification Status**: Verified (42/42 tests passing, build 0 errors).

---

### BUG-016: Missing Audio in Exported MP4 Video (Offline Context & WebCodecs Planar Audio Pipeline)
- **Severity**: Critical
- **Affected Files**:
  - `src/core/export/videoExporter.ts` (`mixProjectAudio`, `exportWithWebCodecs`, `exportWithMediaRecorder`)
  - `tests/renderingAndExport.test.ts`
- **Observable Symptoms**: Preview audio plays clearly aloud, but the exported MP4 video file has no audio track or is silent in video players.
- **Root Cause**:
  1. `mixProjectAudio` attempted to decode audio using `new AudioContext()`, which is blocked or suspended by Brave Browser shields and browser autoplay policy when invoked asynchronously outside a direct user click event. This caused `mixProjectAudio` to fail and return `null`, leading the muxer to declare no audio track at all.
  2. `mixProjectAudio` only checked `project.audioClips`; if a user created a talking character whose audio reference was stored on a visual `lipSync` clip without a duplicate entry on the audio track, the audio was omitted.
  3. WebCodecs `AudioData` feeding used interleaved `'f32'` format with arbitrary tail frame lengths instead of planar `'f32-planar'` layout with fixed 1024-sample chunk sizing required by AAC-LC encoder specifications.
  4. The audio encoder flush loop only encoded audio up to `project.duration * 1_000_000`, causing trailing audio chunks with slight timestamp offsets to be dropped.
- **Fix Applied**:
  1. Re-engineered `mixProjectAudio` to check `audioEngine.loadAudioBuffer` first (which already caches decoded buffers in memory from preview). If not cached, it decodes via non-realtime `OfflineAudioContext`, completely bypassing browser autoplay and Brave Shield suspensions.
  2. Extended `mixProjectAudio` to automatically detect and mix audio from both `project.audioClips` AND visual `lipSync` clips (`clip.lipSyncData.audioAssetId`).
  3. Aligned `AudioData` chunking to standard AAC 1024-sample `f32-planar` zero-padded planes `[ch0, ch1]` matching the proven pipeline from Version 1.
  4. Flushed remaining audio through `encodeAudioUpTo(Infinity)` and properly awaited `audioEncoder.flush()` before closing and finalizing the MP4 container.
  5. Updated `exportWithMediaRecorder` fallback to explicitly register audio tracks and include audio codecs in the supported container MIME check.
- **Regression Test**: `tests/renderingAndExport.test.ts`
- **Verification Status**: Verified (44/44 tests passing, build 0 errors).

---

### BUG-017: New Projects Display Previous Project's Photos, Audio & Lip-Sync Selections
- **Severity**: High
- **Affected Files**:
  - `src/types/assets.ts` (`EditorAsset.projectId`, `MouthSetAsset.projectId`)
  - `src/core/assets/assetDb.ts` (IndexedDB schema version 2, `deleteAssetFromDb`, `deleteMouthSetFromDb`, project asset cleanup)
  - `src/state/editorStore.ts` (`addAsset`, `deleteAsset`, `addMouthSet`, `deleteMouthSet`)
  - `src/components/AssetPanel/AssetPanel.tsx` (Scope filter: "This Project" vs "All Library", per-asset delete button `Trash2`)
  - `src/components/LipSyncModal/LipSyncModal.tsx` (Auto-reset state on project ID change, project-scoped asset filters)
- **Observable Symptoms**: Creating a new project displayed media assets, photos, audio files, and lip-sync selections from previously edited projects.
- **Root Cause**:
  1. `EditorAsset` and `MouthSetAsset` lacked project-level ownership metadata (`projectId`), so all assets in IndexedDB were globally lumped together into a single flat list.
  2. `LipSyncModal` component state (`selectedCharId`, `selectedSheetId`, `selectedAudioId`, `extractedMouthSet`, `generatedCues`) persisted in memory across project creations without resetting when `project.id` changed.
  3. `AssetPanel` had no scope filter and lacked an asset deletion action, leaving users unable to remove unwanted images/audio.
- **Fix Applied**:
  1. Added `projectId?: string` to `EditorAsset` and `MouthSetAsset` and updated Dexie database schema to version 2.
  2. Tagged newly imported assets and generated mouth sets with the active `project.id`.
  3. Added project-level scoping in `AssetPanel` with a clean scope selector ("This Project" vs "All Library") and single-click delete buttons (`Trash2`) for both media assets and mouth sets.
  4. Added `useEffect` in `LipSyncModal` listening to `project.id` changes that cleanly resets all modal selections, previews, anchors, and cues whenever a new project is created or opened.
- **Verification Status**: Verified (44/44 tests passing, build 0 errors).

---

### BUG-018: Chrome Console Flood: "Unable to preventDefault inside passive event listener invocation"
- **Severity**: Medium / Console Pollution
- **Affected Files**: `src/components/LipSyncModal/LipSyncModal.tsx`
- **Observable Symptoms**: Scrolling the mouse wheel over the modal canvas flooded the browser console with dozens of errors: `Unable to preventDefault inside passive event listener invocation. preventDefault @ chunk-NXESFFTV.js:5775`.
- **Root Cause**: React synthetic `onWheel` event handlers are treated as passive event listeners by modern Chromium browsers. Calling `e.preventDefault()` inside a passive listener is disallowed and throws an error.
- **Fix Applied**: Removed synthetic `onWheel` from the canvas JSX element and registered an explicit DOM event listener via `useEffect` with `{ passive: false }`. This permits `e.preventDefault()` to smoothly scale the mouth without window scrolling or console errors.
- **Verification Status**: Verified (44/44 tests passing, build 0 errors).


---

### BUG-019: Loose Fallback in Project Filter Caused Legacy Assets to Leak into New Projects
- **Severity**: High
- **Affected Files**:
  - `src/components/AssetPanel/AssetPanel.tsx`
  - `src/components/LipSyncModal/LipSyncModal.tsx`
  - `src/components/Toolbar/Toolbar.tsx`
  - `src/core/assets/assetDb.ts`
  - `src/state/editorStore.ts`
  - `tests/projectIsolation.test.ts`
- **Observable Symptoms**: Creating a new project still showed images and audio files from previous projects in the Asset Panel and Lip-Sync Modal.
- **Root Cause**:
  1. The asset filter in `AssetPanel` and `LipSyncModal` used `!a.projectId || a.projectId === project.id`. Because older/legacy assets stored in IndexedDB had `projectId === undefined`, the `!a.projectId` condition always evaluated to `true`, causing every previous photo and audio to be displayed in every newly created project.
  2. LipSyncModal did not automatically de-select previous assets if the modal was opened while an asset from another project was still referenced.
- **Fix Applied**:
  1. Updated `AssetPanel` to use strict equality: `a.projectId === project.id` (and `m.projectId === project.id`). New projects now start with an empty media bin (0 items) by default.
  2. Updated `LipSyncModal` dropdown filters to strict equality `showAllLibraryAssets ? true : a.projectId === project.id`.
  3. Added auto-deselect in `LipSyncModal` to clear invalid selections if they do not belong to the current project.
  4. Explicitly assigned `projectId: project.id` during file uploads in `Toolbar` and `LipSyncModal`.
  5. Added `clearAllAssets` feature in `AssetPanel` and `editorStore` allowing users to wipe legacy or unused media from browser storage with a single click.
- **Regression Test**: `tests/projectIsolation.test.ts` (2 tests)
- **Verification Status**: Verified (46/46 tests passing, build 0 errors).
