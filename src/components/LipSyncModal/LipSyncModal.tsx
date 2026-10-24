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
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
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

  const [showAllLibraryAssets, setShowAllLibraryAssets] = useState<boolean>(false);

  // Reset modal state whenever project changes
  const lastProjectIdRef = useRef<string>(project.id);
  useEffect(() => {
    if (project.id !== lastProjectIdRef.current) {
      lastProjectIdRef.current = project.id;
      setSelectedCharId('');
      setSelectedSheetId('');
      setSelectedAudioId('');
      setExtractedMouthSet(null);
      setGeneratedCues([]);
      setCharMouthAnchor({ x: 0.5, y: 0.5 });
      setMouthSpriteAnchor({ anchorX: 0.5, anchorY: 0.5 });
      setMouthScale(0.25);
      setMouthRotation(0);
      setDialogueText('Hello world, welcome to Cartoon Speaks Version 2!');
      setModalPlaying(false);
      setModalTime(0);
    }
  }, [project.id]);

  // If not showing all library assets, automatically deselect assets from other projects
  useEffect(() => {
    if (!showAllLibraryAssets) {
      if (selectedCharId) {
        const a = assets.get(selectedCharId);
        if (!a || a.projectId !== project.id) setSelectedCharId('');
      }
      if (selectedSheetId) {
        const a = assets.get(selectedSheetId);
        if (!a || a.projectId !== project.id) setSelectedSheetId('');
      }
      if (selectedAudioId) {
        const a = assets.get(selectedAudioId);
        if (!a || a.projectId !== project.id) setSelectedAudioId('');
      }
    }
  }, [showAllLibraryAssets, project.id, assets, selectedCharId, selectedSheetId, selectedAudioId]);

  const imageAssets = Array.from(assets.values()).filter(
    (a) => a.type === 'image' && (showAllLibraryAssets ? true : a.projectId === project.id)
  );
  const audioAssets = Array.from(assets.values()).filter(
    (a) => a.type === 'audio' && (showAllLibraryAssets ? true : a.projectId === project.id)
  );

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
      ctx.fillStyle = '#15161B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#6B7280';
      ctx.font = '500 13px Inter, sans-serif';
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
    ctx.fillStyle = '#15161B';
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

        // Diagnostic Overlay for Mouth Bounds
        if (showDiagnostic) {
          // Bounding box around mouth shape
          ctx.strokeStyle = '#8B5CF6';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(localMouthX, localMouthY, drawRect.drawWidth, drawRect.drawHeight);
          ctx.setLineDash([]);

          // Resize handle (bottom right corner)
          const handleSize = 9;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#7C3AED';
          ctx.lineWidth = 1.5;
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
          ctx.fillStyle = 'rgba(25, 26, 32, 0.9)';
          ctx.fillRect(localMouthX, localMouthY - 18, 80, 16);
          ctx.fillStyle = '#C4B5FD';
          ctx.font = '600 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`Shape [${activeShape}]`, localMouthX + 4, localMouthY - 6);
        }
        ctx.restore();
      }
    }

    // Anchor Crosshair when Diagnostic is ON
    if (showDiagnostic) {
      const pinX = charX + targetW * charMouthAnchor.x;
      const pinY = charY + targetH * charMouthAnchor.y;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;

      // Compact Character Anchor Crosshair
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pinX - 8, pinY);
      ctx.lineTo(pinX + 8, pinY);
      ctx.moveTo(pinX, pinY - 8);
      ctx.lineTo(pinX, pinY + 8);
      ctx.stroke();

      // Center Anchor Dot
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(pinX, pinY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Subtle ring
      ctx.strokeStyle = '#F43F5E';
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
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !isLipSyncModalOpen) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.015 : -0.015;
      setMouthScale((prev) => Math.max(0.06, Math.min(0.8, Number((prev + delta).toFixed(3)))));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [isLipSyncModalOpen]);

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
      // Fallback
    }

    const asset = await addAsset({
      id: `char_${Date.now()}`,
      name: file.name,
      type: 'image',
      mimeType: file.type || 'image/png',
      blob: file,
      width,
      height,
      projectId: project.id,
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
      projectId: project.id,
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
      projectId: project.id,
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

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = ratio * lipSyncDuration;
    setModalTime(seekTime);
    if (modalAudioRef.current) {
      modalAudioRef.current.currentTime = seekTime;
    }
  };

  const handleAddToTimeline = () => {
    if (!selectedCharAsset || !extractedMouthSet || !selectedAudioAsset) return;

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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-5xl h-[88vh] bg-editor-elevated border border-editor-border rounded-editor-xl shadow-modal flex flex-col overflow-hidden text-xs text-editor-text">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-editor-sm bg-editor-accent/15 border border-editor-accent/30 flex items-center justify-center text-editor-accent">
              <Smile className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Lip-Sync Animation Generator</h2>
              <p className="text-[10px] text-editor-muted leading-tight">
                Position mouth with cursor on canvas • Auto-crops 9 Rhubarb viseme shapes
              </p>
            </div>
          </div>
          <button
            onClick={() => setLipSyncModalOpen(false)}
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center hover:bg-editor-hover text-editor-muted hover:text-editor-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Inputs & Right Canvas */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Column: Form & Inputs */}
          <div className="w-[360px] bg-editor-panel border-r border-editor-border p-3.5 overflow-y-auto space-y-3.5 shrink-0">
            {errorMessage && (
              <div className="p-2.5 rounded-editor-md bg-editor-danger/10 border border-editor-danger/30 text-editor-danger flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Scope Filter */}
            <div className="flex items-center justify-between pb-1 border-b border-editor-border/60 text-[11px]">
              <span className="text-editor-muted font-medium">Source Filter</span>
              <button
                type="button"
                onClick={() => setShowAllLibraryAssets(!showAllLibraryAssets)}
                className="text-xs text-editor-accent hover:text-editor-accentHover underline font-medium transition-colors"
              >
                {showAllLibraryAssets ? 'All Saved Media' : 'Current Project'}
              </button>
            </div>

            {/* Step 1: Character Asset */}
            <div className="space-y-1">
              <label className="font-semibold text-editor-text block">
                1. Character Image
              </label>
              <div className="flex space-x-1.5">
                <select
                  value={selectedCharId}
                  onChange={(e) => setSelectedCharId(e.target.value)}
                  className="flex-1 bg-editor-surface border border-editor-border rounded-editor-sm px-2.5 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent cursor-pointer"
                >
                  <option value="">Select Character Image...</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id} className="bg-editor-elevated">{a.name}</option>
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
                  title="Upload New Character Image"
                  className="px-2.5 py-1.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Step 2: Mouth Sprite Sheet */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-editor-text">
                  2. Mouth Sprite Sheet
                </label>
                {isExtractingSheet && (
                  <span className="text-[10px] text-editor-accent animate-pulse font-medium">Extracting...</span>
                )}
              </div>
              <div className="flex space-x-1.5">
                <select
                  value={selectedSheetId}
                  onChange={(e) => setSelectedSheetId(e.target.value)}
                  className="flex-1 bg-editor-surface border border-editor-border rounded-editor-sm px-2.5 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent cursor-pointer"
                >
                  <option value="">Select Mouth Sprite Sheet...</option>
                  {imageAssets.map((a) => (
                    <option key={a.id} value={a.id} className="bg-editor-elevated">{a.name}</option>
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
                  className="px-2.5 py-1.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Grid Layout & Crop Mode Options */}
              {selectedSheetAsset && (
                <div className="mt-2 p-2 bg-editor-surface border border-editor-border rounded-editor-sm space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-editor-muted">Sheet Layout:</span>
                    <div className="flex bg-editor-subpanel rounded-editor-sm p-0.5 border border-editor-border">
                      {(['auto', '3x3', '4x3'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setGridTemplate(t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            gridTemplate === t
                              ? 'bg-editor-accentAction text-white'
                              : 'text-editor-muted hover:text-editor-text'
                          }`}
                        >
                          {t === 'auto' ? 'Auto' : t === '3x3' ? '3×3' : '4×3'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-editor-muted">Crop Sizing:</span>
                    <div className="flex bg-editor-subpanel rounded-editor-sm p-0.5 border border-editor-border">
                      <button
                        type="button"
                        onClick={() => setCropMode('crop')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          cropMode === 'crop'
                            ? 'bg-editor-accentAction text-white'
                            : 'text-editor-muted hover:text-editor-text'
                        }`}
                        title="Proportional scaling preserves natural size differences between shapes"
                      >
                        Proportional
                      </button>
                      <button
                        type="button"
                        onClick={() => setCropMode('cell')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          cropMode === 'cell'
                            ? 'bg-editor-accentAction text-white'
                            : 'text-editor-muted hover:text-editor-text'
                        }`}
                        title="Uniform full cell boundaries"
                      >
                        Full Cells
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Spoken Audio */}
            <div className="space-y-1">
              <label className="font-semibold text-editor-text block">
                3. Spoken Audio File
              </label>
              <div className="flex space-x-1.5">
                <select
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                  className="flex-1 bg-editor-surface border border-editor-border rounded-editor-sm px-2.5 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent cursor-pointer"
                >
                  <option value="">Select Spoken Audio...</option>
                  {audioAssets.map((a) => (
                    <option key={a.id} value={a.id} className="bg-editor-elevated">
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
                  className="px-2.5 py-1.5 rounded-editor-sm bg-editor-subpanel hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Step 4: Dialogue Text */}
            <div className="space-y-1">
              <label className="font-semibold text-editor-text block">
                4. Spoken Dialogue Text
              </label>
              <textarea
                rows={2}
                value={dialogueText}
                onChange={(e) => setDialogueText(e.target.value)}
                placeholder="Type spoken dialogue for speech sync..."
                className="w-full bg-editor-surface border border-editor-border rounded-editor-sm px-2.5 py-1.5 text-editor-text focus:outline-none focus:border-editor-accent resize-none font-mono text-[11px]"
              />
            </div>

            {/* Action Row: Generate & Tuning */}
            <div className="space-y-2 pt-1">
              <div className="flex space-x-2">
                <button
                  onClick={handleGenerate}
                  disabled={isProcessing || !selectedCharId || !selectedSheetId || !selectedAudioId}
                  className="flex-1 py-2 rounded-editor-md bg-editor-accentAction hover:bg-editor-accent disabled:opacity-35 text-white font-semibold flex items-center justify-center space-x-2 shadow-sm transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Synchronizing Speech...' : 'Generate Lip Sync'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowTuningPopover(!showTuningPopover)}
                  className={`px-3 py-2 rounded-editor-md border font-medium flex items-center space-x-1.5 transition-colors ${
                    showTuningPopover
                      ? 'bg-editor-accent text-white border-editor-accent'
                      : 'bg-editor-subpanel text-editor-secondary border-editor-border hover:bg-editor-hover'
                  }`}
                  title="Speech speed, smoothness, and min duration tuning"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Tuning</span>
                  {showTuningPopover ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Lip-Sync Tuning Drawer */}
              {showTuningPopover && (
                <div className="p-3 bg-editor-surface border border-editor-accent/40 rounded-editor-md space-y-2.5 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between text-xs font-semibold text-editor-accent border-b border-editor-border pb-1">
                    <span className="flex items-center space-x-1">
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Audio Sync Tuning</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTuning(DEFAULT_LIPSYNC_TUNING)}
                      className="text-[10px] text-editor-muted hover:text-editor-text underline font-normal"
                    >
                      Reset Defaults
                    </button>
                  </div>

                  {/* Speed */}
                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-1">
                      <span>Timing Speed</span>
                      <span className="capitalize text-editor-text font-medium">{tuning.speed}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-editor-subpanel p-0.5 rounded-editor-sm border border-editor-border">
                      {(['slower', 'natural', 'faster'] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setTuning((prev) => ({ ...prev, speed: spd }))}
                          className={`py-1 text-center text-[10px] font-semibold rounded capitalize transition-all ${
                            tuning.speed === spd
                              ? 'bg-editor-accentAction text-white'
                              : 'text-editor-muted hover:text-editor-text'
                          }`}
                        >
                          {spd}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Smoothness */}
                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-1">
                      <span>Transition Smoothness</span>
                      <span className="text-editor-text font-medium">
                        {tuning.smoothness === 'low' ? 'Crisp' : tuning.smoothness === 'high' ? 'Smooth' : 'Natural'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-editor-subpanel p-0.5 rounded-editor-sm border border-editor-border">
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
                              ? 'bg-editor-accentAction text-white'
                              : 'text-editor-muted hover:text-editor-text'
                          }`}
                        >
                          {sm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Min Cue Duration */}
                  <div>
                    <div className="flex justify-between items-center text-[11px] text-editor-secondary mb-0.5">
                      <span>Min Cue Duration</span>
                      <span className="font-mono text-editor-accent font-semibold bg-editor-subpanel px-1.5 py-0.5 rounded border border-editor-border text-[10px]">
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
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Position & Anchor Fine-Tuning */}
            <div className="bg-editor-surface border border-editor-border rounded-editor-md p-3 space-y-3">
              {/* Mouth Placement on Character */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-editor-accent font-semibold text-xs">
                  <span className="flex items-center space-x-1">
                    <Move className="w-3.5 h-3.5" />
                    <span>Mouth Position on Character</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCharMouthAnchor({ x: 0.5, y: 0.5 })}
                    className="text-[10px] text-editor-muted hover:text-editor-text underline font-normal"
                    title="Center on character (50%, 50%)"
                  >
                    Reset (50%, 50%)
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-0.5">
                      <span>Position X</span>
                      <span className="font-mono text-editor-text">{Math.round(charMouthAnchor.x * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.005"
                      value={charMouthAnchor.x}
                      onChange={(e) => setCharMouthAnchor((prev) => ({ ...prev, x: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-0.5">
                      <span>Position Y</span>
                      <span className="font-mono text-editor-text">{Math.round(charMouthAnchor.y * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.005"
                      value={charMouthAnchor.y}
                      onChange={(e) => setCharMouthAnchor((prev) => ({ ...prev, y: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Mouth Center Anchor */}
              <div className="pt-2 border-t border-editor-border/60 space-y-1.5">
                <div className="flex items-center justify-between text-editor-accent font-semibold text-xs">
                  <span className="flex items-center space-x-1">
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Mouth Center Anchor</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMouthSpriteAnchor({ anchorX: 0.5, anchorY: 0.5 })}
                    className="px-2 py-0.5 text-[10px] rounded-editor-sm bg-editor-accent/15 hover:bg-editor-accent/25 border border-editor-accent/30 text-editor-accent transition-colors"
                  >
                    Put at Center
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-0.5">
                      <span>Internal X</span>
                      <span className="font-mono text-editor-text">{Math.round(mouthSpriteAnchor.anchorX * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mouthSpriteAnchor.anchorX}
                      onChange={(e) => setMouthSpriteAnchor((prev) => ({ ...prev, anchorX: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-editor-secondary mb-0.5">
                      <span>Internal Y</span>
                      <span className="font-mono text-editor-text">{Math.round(mouthSpriteAnchor.anchorY * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mouthSpriteAnchor.anchorY}
                      onChange={(e) => setMouthSpriteAnchor((prev) => ({ ...prev, anchorY: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Mouth Scale */}
              <div className="pt-2 border-t border-editor-border/60">
                <div className="flex justify-between text-[11px] text-editor-secondary mb-0.5">
                  <span>Mouth Scale (or wheel on canvas)</span>
                  <span className="font-mono text-editor-text font-medium">{Math.round(mouthScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.06"
                  max="0.75"
                  step="0.01"
                  value={mouthScale}
                  onChange={(e) => setMouthScale(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Mouth Rotation */}
              <div className="pt-2 border-t border-editor-border/60">
                <div className="flex justify-between items-center text-[11px] text-editor-secondary mb-0.5">
                  <span className="flex items-center space-x-1">
                    <RotateCw className="w-3 h-3 text-editor-accent" />
                    <span>Mouth Rotation</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-editor-text">
                      {mouthRotation > 0 ? `+${mouthRotation}°` : `${mouthRotation}°`}
                    </span>
                    {mouthRotation !== 0 && (
                      <button
                        type="button"
                        onClick={() => setMouthRotation(0)}
                        className="text-[10px] text-editor-muted hover:text-editor-text underline ml-1"
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
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Canvas & Audio Scrubber */}
          <div className="flex-1 bg-editor-bg flex flex-col p-4 overflow-hidden min-h-0 justify-between">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between pb-2.5 border-b border-editor-border shrink-0">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowDiagnostic(!showDiagnostic)}
                  className={`px-2.5 py-1 rounded-editor-sm text-xs flex items-center space-x-1.5 transition-colors ${
                    showDiagnostic
                      ? 'bg-editor-accentAction text-white font-medium'
                      : 'bg-editor-subpanel text-editor-muted hover:text-editor-text border border-editor-border'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Diagnostic Overlay</span>
                </button>

                <span className="text-[11px] text-editor-muted hidden sm:inline">
                  Drag mouth on canvas to position • Scroll wheel to scale
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
                    className="w-7 h-7 rounded-editor-sm flex items-center justify-center hover:bg-editor-hover text-editor-secondary hover:text-editor-text transition-colors"
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
                    className="h-7 px-3 rounded-editor-sm bg-editor-accentAction hover:bg-editor-accent text-white flex items-center space-x-1.5 shadow-sm font-medium transition-colors"
                  >
                    {modalPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    <span>{modalPlaying ? 'Pause' : 'Play Audio Sync'}</span>
                  </button>
                  <span className="font-mono text-[11px] text-editor-secondary">
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
                style={{ cursor: canvasCursor }}
                className="max-w-full max-h-full border border-editor-border rounded-editor-md bg-editor-surface shadow-modal select-none"
              />
            </div>

            {/* Audio & Cue Scrubber Bar */}
            {generatedCues.length > 0 && (
              <div className="py-2 shrink-0">
                <div
                  onClick={handleScrubberClick}
                  className="h-6 bg-editor-subpanel rounded-editor-sm border border-editor-border relative cursor-pointer overflow-hidden flex items-center shadow-inner"
                >
                  {/* Cues visualization blocks */}
                  {generatedCues.map((cue, idx) => {
                    const left = (cue.start / lipSyncDuration) * 100;
                    const width = ((cue.end - cue.start) / lipSyncDuration) * 100;
                    return (
                      <div
                        key={idx}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className="absolute top-0 bottom-0 border-r border-black/40 bg-editor-accent/25 text-[9px] font-bold text-violet-200 flex items-center justify-center truncate px-0.5"
                        title={`${cue.mouthId} (${cue.start.toFixed(2)}s - ${cue.end.toFixed(2)}s)`}
                      >
                        {cue.mouthId}
                      </div>
                    );
                  })}
                  {/* Scrubber playhead line */}
                  <div
                    style={{ left: `${(modalTime / lipSyncDuration) * 100}%` }}
                    className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-md pointer-events-none"
                  />
                </div>
              </div>
            )}

            {/* Visemes Strip to click, audition, and fine-tune individual shapes */}
            {extractedMouthSet && (
              <div className="border-t border-editor-border pt-2 flex flex-col space-y-2 shrink-0">
                <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
                  <span className="text-[10px] text-editor-muted shrink-0 font-medium uppercase tracking-wider">Audition:</span>
                  {Object.keys(extractedMouthSet.sprites).map((shape) => {
                    const sp = extractedMouthSet.sprites[shape];
                    const isInspecting = selectedShapeToInspect === shape;
                    const isTuned = Boolean(shapeTunings[shape]?.scaleMultiplier && shapeTunings[shape]?.scaleMultiplier !== 1.0) || Boolean(shapeTunings[shape]?.offsetY);

                    return (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => setSelectedShapeToInspect(shape)}
                        className={`shrink-0 flex items-center space-x-1.5 px-2 py-1 rounded-editor-sm border transition-all relative ${
                          isInspecting
                            ? 'border-editor-accent bg-editor-accent/20 text-editor-text font-bold shadow-sm'
                            : 'border-editor-border bg-editor-surface text-editor-secondary hover:border-editor-accent/50'
                        }`}
                        title={`Audition shape ${shape}${isTuned ? ' (Custom Tuned)' : ''}`}
                      >
                        <div className="w-5 h-5 bg-black/40 rounded flex items-center justify-center overflow-hidden border border-editor-border/40">
                          <img src={sp.url} alt={shape} className="w-full h-full object-contain" />
                        </div>
                        <span className="text-[11px] font-mono">{shape}</span>
                        {isTuned && (
                          <span className="w-1.5 h-1.5 rounded-full bg-editor-accent absolute top-1 right-1" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Per-Shape Fine-Tuning Bar */}
                {selectedShapeToInspect && (
                  <div className="flex items-center justify-between bg-editor-subpanel px-3 py-1.5 rounded-editor-sm border border-editor-border text-[11px]">
                    <div className="flex items-center space-x-3">
                      <span className="font-semibold text-editor-accent flex items-center space-x-1">
                        <SlidersHorizontal className="w-3 h-3 text-editor-accent" />
                        <span>Tune [{selectedShapeToInspect}]:</span>
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-editor-muted">Scale:</span>
                        <span className="font-mono text-editor-text w-9 font-medium">
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
                          className="w-20"
                        />
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <span className="text-editor-muted">Vertical Offset:</span>
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
                          className="w-16"
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
                          className="text-[10px] text-editor-muted hover:text-editor-text underline"
                        >
                          Reset [{selectedShapeToInspect}]
                        </button>
                      )}
                      {Object.keys(shapeTunings).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShapeTunings({})}
                          className="text-[10px] text-editor-muted hover:text-editor-text underline ml-1"
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
        <div className="h-12 border-t border-editor-border px-4 py-2 flex items-center justify-between bg-editor-panel shrink-0">
          <div className="text-[11px] text-editor-secondary flex items-center space-x-1.5">
            {extractedMouthSet ? (
              generatedCues.length > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-editor-success shrink-0" />
                  <span>{generatedCues.length} speech cues synchronized ({sourceType.toUpperCase()}). Ready to add to timeline.</span>
                </>
              ) : (
                <span>Mouth shapes ready. Click "Generate Lip Sync" to synchronize dialogue.</span>
              )
            ) : (
              <span>Select character image and mouth sprite sheet above to start.</span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setLipSyncModalOpen(false)}
              className="px-3.5 py-1.5 rounded-editor-sm hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text font-medium transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleAddToTimeline}
              disabled={!extractedMouthSet || generatedCues.length === 0}
              className="px-4 py-1.5 rounded-editor-sm bg-editor-success hover:bg-editor-successHover disabled:opacity-35 text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-all"
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
