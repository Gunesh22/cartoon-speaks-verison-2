# Cartoon Speaks V2 — Comprehensive Bug Audit & Repair Report

Date: 2026-10-21  
Target Environment: Web / Windows (Brave, Chrome, Edge)

---

## 1. Executive Summary

| Category | Count | Status |
|---|---|---|
| **Total Bugs Identified** | 5 | All Fixed & Verified |
| **Critical Severity** | 2 | Fixed |
| **High Severity** | 1 | Fixed |
| **Medium Severity** | 2 | Fixed |
| **Vitest Tests** | 26 / 26 passing | 100% Passed |
| **Production Build** | `tsc && vite build` | Built in 7.15s, 0 errors |

---

## 2. Detailed Root-Cause Analyses & Repairs

### BUG-001 (Critical): Mouth Sprite Extraction Skewed Alignment (The "Two Anchors" Problem)
- **Symptom**: In the Lip-Sync Modal, mouth sprites were rendered far to the left of the anchor crosshair (as shown in the user's screenshot with an anime sprite sheet where Shape A landed on the boy's shoulder/collar).
- **Root Cause**: `analyzeAndCropCell` attempted an upper-lip heuristic from antialiased alpha pixels that pushed the sprite's internal anchor to the far edge (`anchorX ~ 0.8-1.0`), displacing `drawX = targetPinX - drawWidth * anchorX`.
- **Repair**:
  1. Defaulted the cropped mouth sprite internal anchor to the exact center `(0.5, 0.5)` in `src/features/lipSync/spriteCropper.ts`.
  2. Provided full user control over both anchors in `LipSyncModal.tsx`:
     - **Outside Anchor**: Mouth Placement on the Character (X/Y sliders & canvas dragging).
     - **Inside Anchor**: Mouth Sprite Internal Anchor with a 1-click **"Put at Center (50%, 50%)"** button and fine-tuning sliders.
  3. Added regression tests in `tests/mouthExtraction.test.ts` verifying that asymmetric and symmetric sprites default strictly to `(0.5, 0.5)`.

---

### BUG-002 (Medium): Oversized Anchor Crosshair & Obtrusive Coordinate Badge
- **Symptom**: Anchor crosshair had 22px arms, 12px dashed ring, and an oversized 105px black box covering the character's chin, collar, and mouth.
- **Root Cause**: Hardcoded dimensions in `canvasRenderer.ts` and `LipSyncModal.tsx`.
- **Repair**:
  1. Reduced crosshair arms from 22px to 8px.
  2. Reduced center grab dot from 5px to 2.5px.
  3. Reduced dashed ring from 12px to 6px.
  4. Removed the giant 105px black text box so character facial art is completely visible.

---

### BUG-003 (High): Misleading Hardcoded Presets ("Upper Lip", "Center Mouth", "Lower Jaw")
- **Symptom**: Presets set fixed numbers (50%, 65%) which landed on the boy's t-shirt in non-centered illustrations.
- **Root Cause**: Presets assumed every illustration's mouth is located at exactly 65% height.
- **Repair**:
  1. Removed "Upper Lip", "Center Mouth", and "Lower Jaw" fake presets from `LipSyncModal.tsx` and `PropertiesPanel.tsx`.
  2. Replaced with direct cursor dragging on the character, clean X & Y percentage sliders, and a standard "Center (50%, 50%)" reset button.

---

### BUG-004 (Critical): Audio Playback in Timeline & Canvas Preview Silent
- **Symptom**: Pressing Play or Spacebar in the preview produced no audio.
- **Root Cause**:
  1. Spacebar in `PreviewCanvas` only toggled `setIsPlaying` without invoking `audioEngine.play()`.
  2. In `Toolbar.tsx`, when `currentTime >= project.duration`, setting `currentTime = 0` was asynchronous in React state, causing `audioEngine.play()` to run with the old end time, skipping all clips.
  3. Strict browser autoplay policies (especially Brave and Chrome) require `AudioContext` to be resumed synchronously on direct user interaction before any `await` calls.
  4. `loadAudioBuffer` failed if `asset.blob` was undefined or missing `arrayBuffer`.
- **Repair**:
  1. Added `resumeContext()` in `audioEngine.ts` to immediately unlock `AudioContext` on user gesture.
  2. Unified playback in `editorStore.ts` via `togglePlay()` and `stopPlayback()`.
  3. Added fallback to `fetch(asset.url)` if `asset.blob` is unavailable, and cloned ArrayBuffer to prevent detachment errors.
  4. Connected Spacebar in `PreviewCanvas.tsx` to `togglePlay()`.

---

### BUG-005 (Medium): Aspect Ratio Auto-Selection in Project Hub
- **Symptom**: Project creation screen forced 16:9 as pre-selected with blue highlighting by default.
- **Root Cause**: `selectedRatio` in `ProjectHub.tsx` was initialized to `'16:9'`.
- **Repair**:
  1. Initialized `selectedRatio` to `null` so no preset is auto-selected or highlighted by default.
  2. Allowed custom resolution inputs and neutral cards until the user intentionally chooses a ratio.

---

## 3. Verification & Test Results

```
 RUN  v2.1.9 D:/cartoon speaks version 2

 ✓ tests/timeline.test.ts (11 tests) 13ms
 ✓ tests/renderingAndExport.test.ts (3 tests) 14ms
 ✓ tests/lipSync.test.ts (5 tests) 15ms
 ✓ tests/mouthExtraction.test.ts (7 tests) 17ms

 Test Files  4 passed (4)
      Tests  26 passed (26)
   Duration  1.33s
```

```
✓ 1974 modules transformed.
dist/index.html                   0.55 kB │ gzip:   0.37 kB
dist/assets/index-DwrWhB64.css   29.68 kB │ gzip:   5.95 kB
dist/assets/index-C2X64FJQ.js   423.10 kB │ gzip: 126.39 kB
✓ built in 7.15s
```
