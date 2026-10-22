import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { EditorAsset, MouthSetAsset, MouthSprite } from '../../types/assets';
import { MouthCue, LipSyncTuningSettings, DEFAULT_LIPSYNC_TUNING, ShapeTuning } from '../../types/lipSync';
import {
  generateGridCells,
  analyzeAndCropCell,
  cropSpriteToBlob,
  STANDARD_RHUBARB_LABELS,
  STANDARD_4X3_ANIME_LABELS,
  detectSheetTemplate,
} from '../../features/lipSync/spriteCropper';
import { calculateMouthDrawRect } from '../../features/lipSync/anchor';
import { generateLipSyncCues } from '../../features/lipSync/lipSyncGenerator';
import { calculateFitToScreen } from '../../core/timeline/timelineMath';
import {
  X,
  Smile,
  Upload,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Check,
  Crosshair,
  AlertCircle,
  Sparkles,
  Move,
  Maximize2,
  Volume2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
} from 'lucide-react';

export const LipSyncModal: React.FC = () => {
  const {
    isLipSyncModalOpen,
    setLipSyncModalOpen,
    assets,
    addAsset,
    addMouthSet,
    addVisualClip,
    addAudioClip,
    currentTime,
    project,
  } = useEditorStore();

  // Inputs
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [dialogueText, setDialogueText] = useState<string>('Hello world, welcome to Cartoon Speaks Version 2!');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExtractingSheet, setIsExtractingSheet] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sheet extraction settings & tuning
  const [gridTemplate, setGridTemplate] = useState<'auto' | '3x3' | '4x3'>('auto');
  const [cropMode, setCropMode] = useState<'crop' | 'cell'>('crop');
  const [tuning, setTuning] = useState<LipSyncTuningSettings>(DEFAULT_LIPSYNC_TUNING);
  const [showTuningPopover, setShowTuningPopover] = useState<boolean>(false);
  const [shapeTunings, setShapeTunings] = useState<Record<string, ShapeTuning>>({});

  // Extracted Sprites and Cues
  const [extractedMouthSet, setExtractedMouthSet] = useState<MouthSetAsset | null>(null);
  const [generatedCues, setGeneratedCues] = useState<MouthCue[]>([]);
  const [lipSyncDuration, setLipSyncDuration] = useState<number>(5.0);
  const [sourceType, setSourceType] = useState<'rhubarb' | 'browser'>('browser');

  // Mouth position and scale
  const [charMouthAnchor, setCharMouthAnchor] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [mouthSpriteAnchor, setMouthSpriteAnchor] = useState<{ anchorX: number; anchorY: number }>({ anchorX: 0.5, anchorY: 0.5 });
  const [mouthScale, setMouthScale] = useState<number>(0.25);
  const [mouthRotation, setMouthRotation] = useState<number>(0);
  const [showDiagnostic, setShowDiagnostic] = useState<boolean>(true);
  const [selectedShapeToInspect, setSelectedShapeToInspect] = useState<string>('A');

  // Direct Mouse Dragging on Preview Canvas
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'resize'>('none');
  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialScale, setInitialScale] = useState<number>(0.25);
  const [canvasCursor, setCanvasCursor] = useState<string>('crosshair');

  // Preview playback in modal
  const [modalPlaying, setModalPlaying] = useState<boolean>(false);
  const [modalTime, setModalTime] = useState<number>(0);
  const modalAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Cache for decoded HTMLImageElements to prevent canvas flickering
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const charInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const imageAssets = Array.from(assets.values()).filter((a) => a.type === 'image');
  const audioAssets = Array.from(assets.values()).filter((a) => a.type === 'audio');

  const selectedCharAsset = assets.get(selectedCharId);
  const selectedSheetAsset = assets.get(selectedSheetId);
  const selectedAudioAsset = assets.get(selectedAudioId);

  // Preload and cache HTMLImageElement
  const getPreloadedImage = useCallback((url: string): HTMLImageElement | null => {
    if (imageCacheRef.current.has(url)) {
      const cached = imageCacheRef.current.get(url)!;
      if (cached.complete && cached.naturalWidth > 0) return cached;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      imageCacheRef.current.set(url, img);
    };
    return null;
  }, []);

  // Automatically segment & crop mouth sheet into shapes as soon as sheet is selected
  useEffect(() => {
    if (!selectedSheetAsset || !isLipSyncModalOpen) return;

    let isCancelled = false;
    const extractSheet = async () => {
      setIsExtractingSheet(true);
      try {
        const sheetImg = new Image();
        sheetImg.crossOrigin = 'anonymous';
        sheetImg.src = selectedSheetAsset.url;
        await new Promise((res, rej) => {
          sheetImg.onload = res;
          sheetImg.onerror = rej;
        });

        if (isCancelled) return;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = sheetImg.naturalWidth;
        offCanvas.height = sheetImg.naturalHeight;
        const offCtx = offCanvas.getContext('2d')!;
        offCtx.drawImage(sheetImg, 0, 0);
        const fullImageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);

        const detected = detectSheetTemplate(sheetImg.naturalWidth, sheetImg.naturalHeight);
        const effectiveTemplate = gridTemplate === 'auto' ? detected.template : gridTemplate;
        const cols = effectiveTemplate === '4x3' ? 4 : 3;
        const rows = 3;
        const labels = effectiveTemplate === '4x3' ? STANDARD_4X3_ANIME_LABELS : STANDARD_RHUBARB_LABELS;

        const cells = generateGridCells(offCanvas.width, offCanvas.height, cols, rows, labels);
        const sprites: Record<string, MouthSprite> = {};
        const cellW = offCanvas.width / cols;
        const cellH = offCanvas.height / rows;

        for (const cell of cells) {
          const analysis = analyzeAndCropCell(fullImageData, cell.cellRect, 4);
          const targetCropRect = cropMode === 'cell' ? cell.cellRect : analysis.tightCropRect;
          const { blob, url } = await cropSpriteToBlob(sheetImg, targetCropRect);

          sprites[cell.label] = {
            id: `sprite_${cell.label}_${Date.now()}`,
            label: cell.label,
            cropRect: targetCropRect,
            bounds: analysis.contentBounds,
            anchorX: cropMode === 'cell' ? 0.5 : analysis.anchorX,
            anchorY: cropMode === 'cell' ? 0.5 : analysis.anchorY,
            width: targetCropRect.width,
            height: targetCropRect.height,
            blob,
            url,
          };
          // Preload sprite into image cache
          getPreloadedImage(url);
        }

        const mouthSet: MouthSetAsset = {
          id: `mouthset_${Date.now()}`,
          name: `${selectedSheetAsset.name} (Extracted)`,
          sourceAssetId: selectedSheetAsset.id,
          sprites,
          referenceCellWidth: cellW,
          referenceCellHeight: cellH,
          templateType: effectiveTemplate,
          createdAt: Date.now(),
        };

        if (!isCancelled) {
          setExtractedMouthSet(mouthSet);
          await addMouthSet(mouthSet);
        }
      } catch (e) {
        console.warn('Failed to auto-extract sprite sheet:', e);
      } finally {
        if (!isCancelled) setIsExtractingSheet(false);
      }
    };

    extractSheet();
    return () => {
      isCancelled = true;
    };
  }, [selectedSheetAsset, isLipSyncModalOpen, gridTemplate, cropMode, addMouthSet, getPreloadedImage]);

  // Sync duration with selected audio duration
  useEffect(() => {
    if (selectedAudioAsset?.duration) {
      setLipSyncDuration(selectedAudioAsset.duration);
    }
  }, [selectedAudioAsset]);

  // Modal Audio Sync Loop
  useEffect(() => {
    if (!isLipSyncModalOpen) return;
    let animId: number | undefined;

    if (modalPlaying && modalAudioRef.current) {
      const update = () => {
        if (modalAudioRef.current) {
          setModalTime(modalAudioRef.current.currentTime);
          if (modalAudioRef.current.ended) {
            setModalPlaying(false);
            setModalTime(0);
          } else {
            animId = requestAnimationFrame(update);
          }
        }
      };
      animId = requestAnimationFrame(update);
    }
    return () => {
      if (animId !== undefined) cancelAnimationFrame(animId);
    };
  }, [modalPlaying, isLipSyncModalOpen]);

  // Preload Character Image
  useEffect(() => {
    if (selectedCharAsset?.url) {
      getPreloadedImage(selectedCharAsset.url);
    }
  }, [selectedCharAsset, getPreloadedImage]);

  // Render modal preview on canvas
  const renderPreview = useCallback(() => {
    if (!isLipSyncModalOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!selectedCharAsset) {
      ctx.fillStyle = '#1c1d22';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#6b7280';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a Character image on the left to begin', canvas.width / 2, canvas.height / 2);
      return;
    }

    const charImg = imageCacheRef.current.get(selectedCharAsset.url);
    if (!charImg || !charImg.complete || charImg.naturalWidth === 0) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedCharAsset.url;
      img.onload = () => {
        imageCacheRef.current.set(selectedCharAsset.url, img);
        renderPreview();
      };
      return;
    }

    // Draw dark studio backdrop
    ctx.fillStyle = '#18191e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate centered character bounds
    const charAspect = charImg.naturalWidth / charImg.naturalHeight;
    const targetW = canvas.width * 0.72;
    const targetH = targetW / charAspect;
    const charX = (canvas.width - targetW) / 2;
    const charY = (canvas.height - targetH) / 2;

    ctx.drawImage(charImg, charX, charY, targetW, targetH);

    // Determine active shape
    let activeShape = selectedShapeToInspect || 'A';
    if (generatedCues.length > 0 && modalPlaying) {
      for (const cue of generatedCues) {
        if (modalTime >= cue.start && modalTime < cue.end) {
          activeShape = cue.mouthId;
          break;
        }
      }
    }

    // Render active mouth shape on character
    if (extractedMouthSet && extractedMouthSet.sprites[activeShape]) {
      const sprite = extractedMouthSet.sprites[activeShape];
      const mouthImg = imageCacheRef.current.get(sprite.url);

      if (!mouthImg || !mouthImg.complete || mouthImg.naturalWidth === 0) {
        const mImg = new Image();
        mImg.crossOrigin = 'anonymous';
        mImg.src = sprite.url;
        mImg.onload = () => {
          imageCacheRef.current.set(sprite.url, mImg);
          renderPreview();
        };
      } else {
        const shapeTuning = shapeTunings[activeShape];
        const scaleMultiplier = shapeTuning?.scaleMultiplier ?? 1.0;
        const shapeOffset = shapeTuning ? { x: shapeTuning.offsetX || 0, y: shapeTuning.offsetY || 0 } : undefined;

        const drawRect = calculateMouthDrawRect(
          { x: charX, y: charY, width: targetW, height: targetH },
          charMouthAnchor,
          sprite.width || mouthImg.naturalWidth,
          sprite.height || mouthImg.naturalHeight,
          mouthScale,
          mouthSpriteAnchor,
          mouthRotation,
          extractedMouthSet.referenceCellWidth,
          scaleMultiplier,
          shapeOffset
        );

        ctx.save();
        ctx.translate(drawRect.targetPinX, drawRect.targetPinY);
        if (mouthRotation) {
          ctx.rotate((mouthRotation * Math.PI) / 180);
        }

        const localMouthX = -drawRect.drawWidth * mouthSpriteAnchor.anchorX;
        const localMouthY = -drawRect.drawHeight * mouthSpriteAnchor.anchorY;

        ctx.drawImage(
          mouthImg,
          localMouthX,
          localMouthY,
          drawRect.drawWidth,
          drawRect.drawHeight
        );

        // Diagnostic Overlay for Mouth Bounds (rotates seamlessly with mouth)
        if (showDiagnostic) {
          // Tight bounding box around mouth shape
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(localMouthX, localMouthY, drawRect.drawWidth, drawRect.drawHeight);
          ctx.setLineDash([]);

          // Resize handle (bottom right corner)
          const handleSize = 10;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.fillRect(
            localMouthX + drawRect.drawWidth - handleSize / 2,
            localMouthY + drawRect.drawHeight - handleSize / 2,
            handleSize,
            handleSize
          );
          ctx.strokeRect(
            localMouthX + drawRect.drawWidth - handleSize / 2,
            localMouthY + drawRect.drawHeight - handleSize / 2,
            handleSize,
            handleSize
          );

          // Shape info pill badge
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(localMouthX, localMouthY - 18, 90, 16);
          ctx.fillStyle = '#93c5fd';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`Shape [${activeShape}]`, localMouthX + 4, localMouthY - 6);
        }
        ctx.restore();
      }
    }

    // Always render the prominent Version 1 Anchor Crosshair when Diagnostic is ON
    if (showDiagnostic) {
      const pinX = charX + targetW * charMouthAnchor.x;
      const pinY = charY + targetH * charMouthAnchor.y;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;

      // 1. Compact Green Character Anchor Crosshair (arms length 8px)
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pinX - 8, pinY);
      ctx.lineTo(pinX + 8, pinY);
      ctx.moveTo(pinX, pinY - 8);
      ctx.lineTo(pinX, pinY + 8);
      ctx.stroke();

      // 2. Center Anchor Grab Dot (radius 2.5px)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(pinX, pinY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Subtle Rose dashed circle (radius 6px)
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(pinX, pinY, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }
  }, [
    isLipSyncModalOpen,
    selectedCharAsset,
    extractedMouthSet,
    selectedShapeToInspect,
    generatedCues,
    modalPlaying,
    modalTime,
    charMouthAnchor,
    mouthSpriteAnchor,
    mouthScale,
    mouthRotation,
    shapeTunings,
    showDiagnostic,
  ]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  // Convert mouse event coordinates into normalized character coordinates
  const clientToCharCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = previewCanvasRef.current;
      if (!canvas || !selectedCharAsset) return null;

      const charImg = imageCacheRef.current.get(selectedCharAsset.url);
      if (!charImg || charImg.naturalHeight === 0) return null;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const mouseCanvasX = (clientX - rect.left) * scaleX;
      const mouseCanvasY = (clientY - rect.top) * scaleY;

      const charAspect = charImg.naturalWidth / charImg.naturalHeight;
      const targetW = canvas.width * 0.72;
      const targetH = targetW / charAspect;
      const charX = (canvas.width - targetW) / 2;
      const charY = (canvas.height - targetH) / 2;

      const normX = Math.max(0, Math.min(1, (mouseCanvasX - charX) / targetW));
      const normY = Math.max(0, Math.min(1, (mouseCanvasY - charY) / targetH));

      return {
        normX: Number(normX.toFixed(3)),
        normY: Number(normY.toFixed(3)),
        mouseCanvasX,
        mouseCanvasY,
        charX,
        charY,
        targetW,
        targetH,
      };
    },
    [selectedCharAsset]
  );

  // Pointer Handlers for Dragging Mouth & Anchor on Canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const coords = clientToCharCoords(e.clientX, e.clientY);
    if (!coords) return;

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}

    // Check if clicking resize handle at bottom-right of mouth
    const charW = coords.targetW;
    const mouthW = charW * mouthScale;
    const mouthH = mouthW * 0.5;
    const pinX = coords.charX + charW * charMouthAnchor.x;
    const pinY = coords.charY + coords.targetH * charMouthAnchor.y;
    const handleX = pinX + mouthW / 2;
    const handleY = pinY + mouthH / 2;

    if (Math.hypot(coords.mouseCanvasX - handleX, coords.mouseCanvasY - handleY) < 18) {
      setDragMode('resize');
      setDragStartMouse({ x: e.clientX, y: e.clientY });
      setInitialScale(mouthScale);
      return;
    }

    // Move mouth anchor directly to clicked / dragged position
    setDragMode('move');
    setCharMouthAnchor({ x: coords.normX, y: coords.normY });
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = clientToCharCoords(e.clientX, e.clientY);
    if (!coords) return;

    if (dragMode === 'none') {
      const charW = coords.targetW;
      const mouthW = charW * mouthScale;
      const mouthH = mouthW * 0.5;
      const pinX = coords.charX + charW * charMouthAnchor.x;
      const pinY = coords.charY + coords.targetH * charMouthAnchor.y;
      const handleX = pinX + mouthW / 2;
      const handleY = pinY + mouthH / 2;

      if (Math.hypot(coords.mouseCanvasX - handleX, coords.mouseCanvasY - handleY) < 18) {
        setCanvasCursor('nwse-resize');
      } else if (Math.hypot(coords.mouseCanvasX - pinX, coords.mouseCanvasY - pinY) < 24) {
        setCanvasCursor('grab');
      } else {
        setCanvasCursor('crosshair');
      }
      return;
    }

    if (dragMode === 'move') {
      setCanvasCursor('grabbing');
      setCharMouthAnchor({ x: coords.normX, y: coords.normY });
    } else if (dragMode === 'resize') {
      setCanvasCursor('nwse-resize');
      const deltaX = (e.clientX - dragStartMouse.x) / 300;
      const newScale = Math.max(0.06, Math.min(0.8, initialScale + deltaX));
      setMouthScale(Number(newScale.toFixed(3)));
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
    setDragMode('none');
    setCanvasCursor('crosshair');
  };

  // Scroll wheel on canvas to scale mouth up/down smoothly
  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.015 : -0.015;
    setMouthScale((prev) => Math.max(0.06, Math.min(0.8, Number((prev + delta).toFixed(3)))));
  };

  // Upload handlers
  const handleDirectCharUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let width: number | undefined;
    let height: number | undefined;
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      width = img.naturalWidth;
      height = img.naturalHeight;
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback if image decode fails
    }

    const asset = await addAsset({
      id: `char_${Date.now()}`,
      name: file.name,
      type: 'image',
      mimeType: file.type || 'image/png',
      blob: file,
      width,
      height,
      createdAt: Date.now(),
    });
    setSelectedCharId(asset.id);
  };

  const handleDirectSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let width: number | undefined;
    let height: number | undefined;
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      width = img.naturalWidth;
      height = img.naturalHeight;
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback
    }

    const asset = await addAsset({
      id: `sheet_${Date.now()}`,
      name: file.name,
      type: 'image',
      mimeType: file.type || 'image/png',
      blob: file,
      width,
      height,
      createdAt: Date.now(),
    });
    setSelectedSheetId(asset.id);
  };

  const handleDirectAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let dur = 5;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      dur = buf.duration;
      ctx.close().catch(() => {});
    } catch {}
    const asset = await addAsset({
      id: `audio_${Date.now()}`,
      name: file.name,
      type: 'audio',
      mimeType: file.type || 'audio/wav',
      blob: file,
      duration: dur,
      createdAt: Date.now(),
    });
    setSelectedAudioId(asset.id);
  };

  // Generate Lip-Sync Action
  const handleGenerate = async () => {
    if (!selectedCharAsset) {
      setErrorMessage('Please select or upload a character image');
      return;
    }
    if (!selectedSheetAsset) {
      setErrorMessage('Please select or upload a mouth sprite sheet');
      return;
    }
    if (!selectedAudioAsset) {
      setErrorMessage('Please select or upload an audio file');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const audioDuration = selectedAudioAsset.duration || 5.0;
      const { cues, duration, source } = await generateLipSyncCues(
        selectedAudioAsset.blob,
        dialogueText,
        audioDuration,
        tuning
      );

      setGeneratedCues(cues);
      setLipSyncDuration(duration);
      setSourceType(source);
    } catch (err) {
      setErrorMessage(`Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Scrubber click on modal timeline bar
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = ratio * lipSyncDuration;
    setModalTime(seekTime);
    if (modalAudioRef.current) {
      modalAudioRef.current.currentTime = seekTime;
    }
  };

  // Add Confirmed Lip-Sync Result to Timeline
  const handleAddToTimeline = () => {
    if (!selectedCharAsset || !extractedMouthSet || !selectedAudioAsset) return;

    // Fit character cleanly to screen by default while maintaining aspect ratio
    const cachedCharImg = imageCacheRef.current.get(selectedCharAsset.url);
    const naturalWidth = selectedCharAsset.width || cachedCharImg?.naturalWidth || project.width;
    const naturalHeight = selectedCharAsset.height || cachedCharImg?.naturalHeight || project.height;

    const fit = calculateFitToScreen(
      naturalWidth,
      naturalHeight,
      project.width,
      project.height,
      'contain'
    );

    // 1. Add Visual Lip-Sync Clip
    addVisualClip('V2', {
      id: `lip_clip_${Date.now()}`,
      assetId: selectedCharAsset.id,
      start: currentTime,
      duration: lipSyncDuration,
      x: fit.x,
      y: fit.y,
      width: fit.width,
      height: fit.height,
      rotation: 0,
      opacity: 1.0,
      visible: true,
      type: 'lipSync',
      lipSyncData: {
        characterAssetId: selectedCharAsset.id,
        audioAssetId: selectedAudioAsset.id,
        mouthSetId: extractedMouthSet.id,
        cues: generatedCues,
        mouthAnchor: charMouthAnchor,
        spriteAnchor: mouthSpriteAnchor,
        mouthScale,
        mouthRotation,
        referenceCellWidth: extractedMouthSet.referenceCellWidth,
        referenceCellHeight: extractedMouthSet.referenceCellHeight,
        sizingMode: cropMode === 'cell' ? 'uniform' : 'proportional',
        tuning,
        shapeTunings,
      },
    });

    // 2. Add Audio Clip into Audio Track
    addAudioClip({
      id: `aclip_${Date.now()}`,
      assetId: selectedAudioAsset.id,
      start: currentTime,
      duration: lipSyncDuration,
      volume: 1.0,
      trimStart: 0,
      trimEnd: lipSyncDuration,
    });

    setLipSyncModalOpen(false);
  };

  if (!isLipSyncModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-5xl h-[90vh] bg-editor-panel border border-editor-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs text-gray-200">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-5 flex items-center justify-between bg-editor-subpanel flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
              <Smile className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Lip-Sync Animation Generator</h2>
              <p className="text-[10px] text-gray-400 leading-none">
                Drag mouth with cursor on the canvas • Auto-crops 9 Rhubarb visemes
              </p>
            </div>
          </div>
          <button
            onClick={() => setLipSyncModalOpen(false)}
            className="p-1.5 rounded hover:bg-editor-panel text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Inputs & Right Canvas */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Column: Form & Inputs */}
          <div className="w-[370px] border-r border-editor-border p-4 overflow-y-auto space-y-3.5 flex-shrink-0">
            {errorMessage && (
              <div className="p-2.5 rounded bg-red-950/60 border border-red-800 text-red-200 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Input 1: Character Asset */}
            <div>
              <label className="font-semibold text-gray-300 block mb-1">
                1. Character Asset
              </label>
              <div className="flex space-x-2">
                <select
                  value={selectedCharId}
                  onChange={(e) => setSelectedCharId(e.target.value)}
                  className="flex-1 bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select Character Image...</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <input
                  ref={charInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleDirectCharUpload}
                />
                <button
                  onClick={() => charInputRef.current?.click()}
                  title="Upload New Character"
                  className="px-2.5 py-1.5 rounded bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-gray-300"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Input 2: Mouth Sprite Sheet */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-gray-300">
                  2. Mouth Sprite Sheet
                </label>
                {isExtractingSheet && (
                  <span className="text-[10px] text-purple-400 animate-pulse">Extracting shapes...</span>
                )}
              </div>
              <div className="flex space-x-2">
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  className="flex-1 bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select Mouth Sprite Sheet...</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <input
                  ref={sheetInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleDirectSheetUpload}
                />
                <button
                  onClick={() => sheetInputRef.current?.click()}
                  title="Upload New Sprite Sheet"
                  className="px-2.5 py-1.5 rounded bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-gray-300"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>

              {/* Grid Layout & Crop Mode Options */}
              {selectedSheetAsset && (
                <div className="mt-2 p-2 bg-editor-bg/60 border border-editor-border/60 rounded-md space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Sheet Grid:</span>
                    <div className="flex bg-editor-subpanel rounded p-0.5 border border-editor-border">
                      {(['auto', '3x3', '4x3'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setGridTemplate(t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            gridTemplate === t
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {t === 'auto' ? 'Auto' : t === '3x3' ? '3×3 (9)' : '4×3 Anime'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Crop Sizing:</span>
                    <div className="flex bg-editor-subpanel rounded p-0.5 border border-editor-border">
                      <button
                        type="button"
                        onClick={() => setCropMode('crop')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          cropMode === 'crop'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                        title="Proportional scaling preserves artist's scale (small mouths stay small, open mouths stay wide)"
                      >
                        Proportional
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropMode('cell')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          cropMode === 'cell'
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                        title="Keep full 1:1 cell frames without auto-trimming"
                      >
                        Full Cells
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input 3: Audio File */}
            <div>
              <label className="font-semibold text-gray-300 block mb-1">
                3. Spoken Audio File
              </label>
              <div className="flex space-x-2">
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="flex-1 bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-purple-500"
                >
                  <option value="">Select Spoken Audio...</option>
                  {audioAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.duration?.toFixed(1)}s)
                    </option>
                  ))}
                </select>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleDirectAudioUpload}
                />
                <button
                  onClick={() => audioInputRef.current?.click()}
                  title="Upload New Audio"
                  className="px-2.5 py-1.5 rounded bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-gray-300"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Input 4: Dialogue Text */}
            <div>
              <label className="font-semibold text-gray-300 block mb-1">
                4. Spoken Dialogue Text
              </label>
              <textarea
                rows={2}
                value={dialogueText}
                onChange={(e) => setDialogueText(e.target.value)}
                placeholder="Paste or type the dialogue..."
                className="w-full bg-editor-bg border border-editor-border rounded px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-purple-500 resize-none font-mono text-[11px]"
              />
            </div>

            {/* Action Row: Generate + Tuning Popover Toggle */}
            <div className="space-y-2">
              <div className="flex space-x-2">
                <button
                  onClick={handleGenerate}
                  disabled={isProcessing || !selectedCharId || !selectedSheetId || !selectedAudioId}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-medium flex items-center justify-center space-x-2 shadow-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isProcessing ? 'Generating Speech Sync...' : 'Generate Lip Sync'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTuningPopover(!showTuningPopover)}
                  className={`px-3 py-2 rounded-lg border font-medium flex items-center space-x-1.5 transition-colors ${
                    showTuningPopover
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-editor-subpanel text-gray-300 border-editor-border hover:bg-editor-hover'
                  }`}
                  title="Tune speech speed, smoothness, and min cue duration"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Tuning</span>
                  {showTuningPopover ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Lip-Sync Tuning Panel */}
              {showTuningPopover && (
                <div className="p-3 bg-editor-bg border border-purple-500/40 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs font-semibold text-purple-300 border-b border-editor-border pb-1">
                    <span className="flex items-center space-x-1">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Lip-Sync Audio Tuning</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTuning(DEFAULT_LIPSYNC_TUNING)}
                      className="text-[10px] text-gray-400 hover:text-white underline font-normal"
                    >
                      Reset Defaults
                    </button>
                  </div>

                  {/* 1. Timing Speed */}
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span>Timing Speed</span>
                      <span className="capitalize text-gray-200 font-medium">{tuning.speed}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-editor-subpanel p-0.5 rounded border border-editor-border">
                      {(['slower', 'natural', 'faster'] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setTuning((prev) => ({ ...prev, speed: spd }))}
                          className={`py-1 text-center text-[10px] font-semibold rounded capitalize transition-all ${
                            tuning.speed === spd
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {spd}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Transition Smoothness */}
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span>Smoothness</span>
                      <span className="text-gray-200 font-medium">
                        {tuning.smoothness === 'low' ? 'Crisp' : tuning.smoothness === 'high' ? 'Smooth' : 'Natural'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-editor-subpanel p-0.5 rounded border border-editor-border">
                      {[
                        { id: 'low', label: 'Crisp' },
                        { id: 'medium', label: 'Natural' },
                        { id: 'high', label: 'Smooth' },
                      ].map((sm) => (
                        <button
                          key={sm.id}
                          type="button"
                          onClick={() => setTuning((prev) => ({ ...prev, smoothness: sm.id as any }))}
                          className={`py-1 text-center text-[10px] font-semibold rounded transition-all ${
                            tuning.smoothness === sm.id
                              ? 'bg-purple-600 text-white'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          {sm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Min Duration */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] text-gray-400 mb-0.5">
                      <span>Min Cue Duration</span>
                      <span className="font-mono text-purple-300 font-semibold bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800 text-[10px]">
                        {tuning.minDurationMs}ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="60"
                      max="180"
                      step="5"
                      value={tuning.minDurationMs}
                      onChange={(e) => setTuning((prev) => ({ ...prev, minDurationMs: parseInt(e.target.value) || 90 }))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Anchor & Scale Fine-Tuning */}
            <div className="bg-editor-subpanel border border-editor-border rounded-lg p-3 space-y-3">
              {/* 1. Outside Anchor: Mouth Placement on Character */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-purple-400 font-semibold text-xs">
                  <span className="flex items-center space-x-1">
                    <Move className="w-3.5 h-3.5" />
                    <span>Mouth Position on Character</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCharMouthAnchor({ x: 0.5, y: 0.5 })}
                    className="text-[10px] text-gray-400 hover:text-white underline font-normal"
                    title="Center on character (50%, 50%)"
                  >
                    Reset (50%, 50%)
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                      <span>Position X</span>
                      <span className="font-mono text-gray-200">{Math.round(charMouthAnchor.x * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.005"
                      value={charMouthAnchor.x}
                      onChange={(e) => setCharMouthAnchor((prev) => ({ ...prev, x: parseFloat(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                      <span>Position Y</span>
                      <span className="font-mono text-gray-200">{Math.round(charMouthAnchor.y * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.005"
                      value={charMouthAnchor.y}
                      onChange={(e) => setCharMouthAnchor((prev) => ({ ...prev, y: parseFloat(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Inside Anchor: Mouth Sprite Internal Anchor */}
              <div className="pt-2 border-t border-editor-border/60 space-y-1.5">
                <div className="flex items-center justify-between text-purple-400 font-semibold text-xs">
                  <span className="flex items-center space-x-1">
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Mouth Sprite Center Anchor</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMouthSpriteAnchor({ anchorX: 0.5, anchorY: 0.5 })}
                    className="px-2 py-0.5 text-[10px] rounded bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-200"
                    title="Put mouth anchor at exact center"
                  >
                    Put at Center
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                      <span>Mouth Internal X</span>
                      <span className="font-mono text-gray-200">{Math.round(mouthSpriteAnchor.anchorX * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mouthSpriteAnchor.anchorX}
                      onChange={(e) => setMouthSpriteAnchor((prev) => ({ ...prev, anchorX: parseFloat(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                      <span>Mouth Internal Y</span>
                      <span className="font-mono text-gray-200">{Math.round(mouthSpriteAnchor.anchorY * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mouthSpriteAnchor.anchorY}
                      onChange={(e) => setMouthSpriteAnchor((prev) => ({ ...prev, anchorY: parseFloat(e.target.value) }))}
                      className="w-full accent-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Mouth Scale */}
              <div className="pt-2 border-t border-editor-border/60">
                <div className="flex justify-between text-[11px] text-gray-400 mb-0.5">
                  <span>Mouth Scale (or scroll wheel on canvas)</span>
                  <span className="font-mono text-gray-200">{Math.round(mouthScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.06"
                  max="0.75"
                  step="0.01"
                  value={mouthScale}
                  onChange={(e) => setMouthScale(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>

              {/* 4. Mouth Rotation */}
              <div className="pt-2 border-t border-editor-border/60">
                <div className="flex justify-between items-center text-[11px] text-gray-400 mb-0.5">
                  <span className="flex items-center space-x-1">
                    <RotateCw className="w-3 h-3 text-purple-400" />
                    <span>Mouth Rotation</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-gray-200">
                      {mouthRotation > 0 ? `+${mouthRotation}°` : `${mouthRotation}°`}
                    </span>
                    {mouthRotation !== 0 && (
                      <button
                        type="button"
                        onClick={() => setMouthRotation(0)}
                        className="text-[10px] text-gray-400 hover:text-white underline ml-1"
                        title="Reset rotation to 0°"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={mouthRotation}
                  onChange={(e) => setMouthRotation(parseInt(e.target.value) || 0)}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Canvas & Audio Scrubber */}
          <div className="flex-1 bg-editor-bg flex flex-col p-4 overflow-hidden min-h-0 justify-between">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between pb-2.5 border-b border-editor-border flex-shrink-0">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowDiagnostic(!showDiagnostic)}
                  className={`px-2.5 py-1 rounded text-xs flex items-center space-x-1.5 transition-colors ${
                    showDiagnostic
                      ? 'bg-purple-600 text-white'
                      : 'bg-editor-subpanel text-gray-400 hover:text-white'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Diagnostic Overlay</span>
                </button>

                <span className="text-[10px] text-gray-500 hidden sm:inline">
                  Tip: Click & drag mouth on canvas to position
                </span>
              </div>

              {/* Playback Controls in Modal */}
              {selectedAudioAsset && (
                <div className="flex items-center space-x-2">
                  <audio
                    ref={modalAudioRef}
                    src={selectedAudioAsset.url}
                    onPlay={() => setModalPlaying(true)}
                    onPause={() => setModalPlaying(false)}
                    className="hidden"
                  />
                  <button
                    onClick={() => {
                      if (modalAudioRef.current) {
                        modalAudioRef.current.currentTime = 0;
                        setModalTime(0);
                      }
                    }}
                    className="p-1.5 rounded hover:bg-editor-subpanel text-gray-400"
                    title="Rewind"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (!modalAudioRef.current) return;
                      if (modalPlaying) {
                        modalAudioRef.current.pause();
                      } else {
                        modalAudioRef.current.play();
                      }
                    }}
                    className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 shadow"
                  >
                    {modalPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                    <span>{modalPlaying ? 'Pause' : 'Play Audio Sync'}</span>
                  </button>
                  <span className="font-mono text-[11px] text-gray-300">
                    {modalTime.toFixed(1)}s / {lipSyncDuration.toFixed(1)}s
                  </span>
                </div>
              )}
            </div>

            {/* Central Interactive Preview Canvas */}
            <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden relative">
              <canvas
                ref={previewCanvasRef}
                width={640}
                height={480}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onWheel={handleCanvasWheel}
                style={{ cursor: canvasCursor }}
                className="max-w-full max-h-full border border-editor-border rounded-lg bg-[#18191e] shadow-2xl select-none"
              />
            </div>

            {/* Audio & Cue Scrubber Bar */}
            {generatedCues.length > 0 && (
              <div className="py-2 flex-shrink-0">
                <div
                  onClick={handleScrubberClick}
                  className="h-6 bg-editor-subpanel rounded border border-editor-border relative cursor-pointer overflow-hidden flex items-center"
                >
                  {/* Cues visualization blocks */}
                  {generatedCues.map((cue, idx) => {
                    const left = (cue.start / lipSyncDuration) * 100;
                    const width = ((cue.end - cue.start) / lipSyncDuration) * 100;
                    return (
                      <div
                        key={idx}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className="absolute top-0 bottom-0 border-r border-black/40 bg-purple-600/30 text-[9px] font-bold text-purple-200 flex items-center justify-center truncate px-0.5"
                        title={`${cue.mouthId} (${cue.start.toFixed(2)}s - ${cue.end.toFixed(2)}s)`}
                      >
                        {cue.mouthId}
                      </div>
                    );
                  })}
                  {/* Red scrubber playhead */}
                  <div
                    style={{ left: `${(modalTime / lipSyncDuration) * 100}%` }}
                    className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-md pointer-events-none"
                  />
                </div>
              </div>
            )}

            {/* Visemes Strip to click, audition, and fine-tune individual shapes */}
            {extractedMouthSet && (
              <div className="border-t border-editor-border pt-2 flex flex-col space-y-2 flex-shrink-0">
                <div className="flex items-center space-x-2 overflow-x-auto">
                  <span className="text-[10px] text-gray-400 flex-shrink-0">Audition Shape:</span>
                  {Object.keys(extractedMouthSet.sprites).map((shape) => {
                    const sp = extractedMouthSet.sprites[shape];
                    const isInspecting = selectedShapeToInspect === shape;
                    const isTuned = Boolean(shapeTunings[shape]?.scaleMultiplier && shapeTunings[shape]?.scaleMultiplier !== 1.0) || Boolean(shapeTunings[shape]?.offsetY);

                    return (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => setSelectedShapeToInspect(shape)}
                        className={`flex-shrink-0 flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors relative ${
                          isInspecting
                            ? 'border-purple-500 bg-purple-950/60 text-purple-300 font-bold'
                            : 'border-editor-border bg-editor-subpanel text-gray-400 hover:border-gray-500'
                        }`}
                        title={`Audition shape ${shape}${isTuned ? ' (Tuned)' : ''}`}
                      >
                        <div className="w-6 h-6 bg-black/40 rounded flex items-center justify-center overflow-hidden">
                          <img src={sp.url} alt={shape} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[11px]">{shape}</span>
                        {isTuned && (
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 absolute top-1 right-1" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Per-Shape Fine-Tuning Bar */}
                {selectedShapeToInspect && (
                  <div className="flex items-center justify-between bg-editor-subpanel/70 px-3 py-1.5 rounded border border-editor-border text-[11px]">
                    <div className="flex items-center space-x-3">
                      <span className="font-semibold text-purple-300 flex items-center space-x-1">
                        <SlidersHorizontal className="w-3 h-3 text-purple-400" />
                        <span>Fine-Tune Shape [{selectedShapeToInspect}]:</span>
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400">Scale:</span>
                        <span className="font-mono text-gray-200 w-9">
                          {Math.round((shapeTunings[selectedShapeToInspect]?.scaleMultiplier ?? 1.0) * 100)}%
                        </span>
                        <input
                          type="range"
                          min="0.4"
                          max="1.8"
                          step="0.05"
                          value={shapeTunings[selectedShapeToInspect]?.scaleMultiplier ?? 1.0}
                          onChange={(e) => {
                            const mult = parseFloat(e.target.value);
                            setShapeTunings((prev) => ({
                              ...prev,
                              [selectedShapeToInspect]: {
                                ...prev[selectedShapeToInspect],
                                scaleMultiplier: mult,
                              },
                            }));
                          }}
                          className="w-20 accent-purple-500"
                        />
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-gray-400">Vertical Offset:</span>
                        <input
                          type="range"
                          min="-0.08"
                          max="0.08"
                          step="0.005"
                          value={shapeTunings[selectedShapeToInspect]?.offsetY ?? 0}
                          onChange={(e) => {
                            const offY = parseFloat(e.target.value);
                            setShapeTunings((prev) => ({
                              ...prev,
                              [selectedShapeToInspect]: {
                                ...prev[selectedShapeToInspect],
                                offsetY: offY,
                              },
                            }));
                          }}
                          className="w-16 accent-purple-500"
                          title="Fine-tune vertical alignment of this mouth shape"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {(Boolean(shapeTunings[selectedShapeToInspect]?.scaleMultiplier && shapeTunings[selectedShapeToInspect]?.scaleMultiplier !== 1.0) ||
                        Boolean(shapeTunings[selectedShapeToInspect]?.offsetY)) && (
                        <button
                          type="button"
                          onClick={() => {
                            setShapeTunings((prev) => {
                              const next = { ...prev };
                              delete next[selectedShapeToInspect];
                              return next;
                            });
                          }}
                          className="text-[10px] text-gray-400 hover:text-white underline"
                        >
                          Reset Shape [{selectedShapeToInspect}]
                        </button>
                      )}
                      {Object.keys(shapeTunings).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShapeTunings({})}
                          className="text-[10px] text-gray-500 hover:text-gray-300 underline ml-1"
                        >
                          Reset All
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-13 border-t border-editor-border px-5 py-2.5 flex items-center justify-between bg-editor-subpanel flex-shrink-0">
          <div className="text-[11px] text-gray-400">
            {extractedMouthSet
              ? generatedCues.length > 0
                ? `✓ ${generatedCues.length} speech cues synchronized (${sourceType.toUpperCase()}). Ready to add.`
                : 'Mouth shapes extracted. Click "Generate Lip Sync" to align dialogue.'
              : 'Select character and mouth sprite sheet above.'}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setLipSyncModalOpen(false)}
              className="px-3.5 py-1.5 rounded hover:bg-editor-panel text-gray-300"
            >
              Cancel
            </button>

            <button
              onClick={handleAddToTimeline}
              disabled={!extractedMouthSet || generatedCues.length === 0}
              className="px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium flex items-center space-x-2 shadow"
            >
              <Check className="w-4 h-4" />
              <span>Add to Timeline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
