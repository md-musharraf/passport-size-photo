'use client';
import { useState, useEffect, useRef } from 'react';
import CropSlider from './CropSlider';
import { FiCheckCircle, FiAlertTriangle, FiXCircle, FiX, FiSun, FiChevronDown, FiMove } from 'react-icons/fi';
import { FaPaintBrush, FaMagic } from 'react-icons/fa';
import CountryFlag from './CountryFlag';
import { computePassportAlignment, MIN_CROP_POS, MAX_CROP_POS, MIN_CROP_SCALE, MAX_CROP_SCALE } from '@/lib/faceAlign';
import { usePanZoom } from '@/lib/usePanZoom';
import { usePreviewImage } from '@/lib/usePreviewImage';
import { analyzeFace, loadFaceLandmarker, type FaceAnalysis } from '@/lib/faceLandmarker';
import { evaluateCompliance } from '@/lib/compliance';
import { ScreenState } from '../app/page';

interface ImageEditorProps {
  activeScreen: ScreenState;
  setActiveScreen: (screen: ScreenState) => void;
  imageData: string | null;
  originalImage: string | null;
  processedImage: string | null;
  brightness: number;
  contrast: number;
  saturation: number;
  bgColor: string;
  cropPosition: { x: number; y: number };
  cropScale: number;
  rotation?: number;
  exposure?: number;
  temperature?: number;
  
  // Clothing overlay states
  clothingTemplate: 'none' | 'suit_male' | 'suit_female' | 'tuxedo';
  onClothingTemplateChange: (val: 'none' | 'suit_male' | 'suit_female' | 'tuxedo') => void;
  clothingScale: number;
  onClothingScaleChange: (val: number) => void;
  clothingPosition: { x: number; y: number };
  onClothingPositionChange: (val: { x: number; y: number }) => void;
  clothingRotation: number;
  onClothingRotationChange: (val: number) => void;
  canvasActiveItem: 'photo' | 'clothing';
  onCanvasActiveItemChange: (val: 'photo' | 'clothing') => void;

  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onBgColorChange: (value: string) => void;
  onCropPositionChange: (value: { x: number; y: number }) => void;
  onCropScaleChange: (value: number) => void;
  onRotationChange?: (value: number) => void;
  onExposureChange?: (value: number) => void;
  onTemperatureChange?: (value: number) => void;
  onBGRemove: (processed: string) => void;
  isProcessing: boolean;
  preset: string;
  onPresetChange: (preset: string) => void;
  bgRemover?: React.ReactNode;
  downloadButton?: React.ReactNode;
  photoCount: number;
  spacing: number;
  margin: number;
  showCropMarks: boolean;
  showSheetTitle: boolean;
  showPresetInfo: boolean;
  showGenDate: boolean;
  showFooterNotes: boolean;
  autoFitA4: boolean;
  skipCount: number;
  paperSize: 'a4' | '4r';
  onPaperSizeChange: (val: 'a4' | '4r') => void;
  paperOrientation: 'portrait' | 'landscape';
  onPaperOrientationChange: (val: 'portrait' | 'landscape') => void;
  useCustomGrid: boolean;
  onUseCustomGridChange: (val: boolean) => void;
  customGridCols: number;
  onCustomGridColsChange: (val: number) => void;
  customGridRows: number;
  onCustomGridRowsChange: (val: number) => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onSnapshot?: () => void;

  // Slate states
  showSlate: boolean;
  onShowSlateChange: (val: boolean) => void;
  slateName: string;
  onSlateNameChange: (val: string) => void;
  slateDate: string;
  onSlateDateChange: (val: string) => void;

  // Border states
  showBorder: boolean;
  onShowBorderChange: (val: boolean) => void;
  borderColor: string;
  onBorderColorChange: (val: string) => void;
  borderSize: number;
  onBorderSizeChange: (val: number) => void;

  // Multi-Person props
  isMultiPersonMode?: boolean;
  multiPersonImages?: (string | null)[];
}

// Preset specs now live in a single source of truth (lib/presets.ts).
// Re-exported here so existing imports (`from './ImageEditor'`) keep working.
export { PRESETS, PRESET_PIXELS, PASSPORT_PRESETS, getPreset, CLOTHING_TEMPLATES } from '@/lib/presets';
import { PRESETS, PRESET_PIXELS, getPreset, CLOTHING_TEMPLATES } from '@/lib/presets';

const autoAlignMemory = {
  image: { current: null as string | null },
  preset: { current: null as string | null },
};

export default function ImageEditor({
  activeScreen,
  setActiveScreen,
  imageData,
  originalImage,
  processedImage,
  brightness,
  contrast,
  saturation,
  bgColor,
  cropPosition,
  cropScale,
  rotation = 0,
  exposure = 100,
  temperature = 0,
  
  clothingTemplate,
  onClothingTemplateChange,
  clothingScale,
  onClothingScaleChange,
  clothingPosition,
  onClothingPositionChange,
  clothingRotation,
  onClothingRotationChange,
  canvasActiveItem,
  onCanvasActiveItemChange,

  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onBgColorChange,
  onCropPositionChange,
  onCropScaleChange,
  onRotationChange,
  onExposureChange,
  onTemperatureChange,
  onBGRemove,
  isProcessing,
  preset,
  onPresetChange,
  bgRemover,
  downloadButton,
  photoCount,
  spacing,
  margin,
  showCropMarks,
  showSheetTitle,
  showPresetInfo,
  showGenDate,
  showFooterNotes,
  autoFitA4,
  skipCount,
  paperSize,
  onPaperSizeChange,
  paperOrientation,
  onPaperOrientationChange,
  useCustomGrid,
  onUseCustomGridChange,
  customGridCols,
  onCustomGridColsChange,
  customGridRows,
  onCustomGridRowsChange,
  theme,
  onThemeToggle,
  onSnapshot,

  // Slate props
  showSlate,
  onShowSlateChange,
  slateName,
  onSlateNameChange,
  slateDate,
  onSlateDateChange,

  // Border props
  showBorder,
  onShowBorderChange,
  borderColor,
  onBorderColorChange,
  borderSize,
  onBorderSizeChange,

  // Multi-Person props
  isMultiPersonMode = false,
  multiPersonImages = []
}: ImageEditorProps) {
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [isDetectingFace, setIsDetectingFace] = useState(false);
  // Last MediaPipe face analysis of the displayed photo. The compliance
  // checklist is derived from it plus the live crop, so it updates while the
  // operator drags/zooms without re-running detection.
  const [faceAnalysis, setFaceAnalysis] = useState<FaceAnalysis | null>(null);
  const [faceMissing, setFaceMissing] = useState(false);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [isRetouched, setIsRetouched] = useState(false);
  // Transient status line shown over the canvas (doesn't shift the layout).
  // Success/info messages fade on their own; warnings/errors stay until closed.
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' | 'warning' } | null>(null);
  useEffect(() => {
    if (!message || message.type === 'warning' || message.type === 'error') return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  // ── Canvas gestures: drag to pan, wheel / pinch to zoom ───────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const editingClothing = canvasActiveItem === 'clothing' && clothingTemplate !== 'none';
  const clampPos = (v: number) => Math.min(Math.max(v, MIN_CROP_POS), MAX_CROP_POS);
  const clampScale = (v: number) => Math.min(Math.max(Math.round(v), MIN_CROP_SCALE), MAX_CROP_SCALE);

  const { isDragging } = usePanZoom(containerRef, !!imageData && activeScreen !== 'print-sheet', {
    getStart: () =>
      editingClothing
        ? { x: clothingPosition.x, y: clothingPosition.y, scale: clothingScale }
        : { x: cropPosition.x, y: cropPosition.y, scale: cropScale },
    onPan: (dx, dy, start) => {
      if (editingClothing) {
        onClothingPositionChange({
          x: Math.min(Math.max(start.x + dx, 0), 100),
          y: Math.min(Math.max(start.y + dy, 0), 100),
        });
      } else {
        onCropPositionChange({ x: clampPos(start.x - dx), y: clampPos(start.y - dy) });
      }
    },
    onZoom: (factor, start) => {
      if (editingClothing) onClothingScaleChange(clampScale(start.scale * factor));
      else onCropScaleChange(clampScale(start.scale * factor));
    },
    onEnd: () => onSnapshot?.(),
  });

  // Load the MediaPipe face model once (GPU delegate when available, CPU otherwise).
  useEffect(() => {
    let cancelled = false;
    loadFaceLandmarker()
      .then(() => {
        if (!cancelled) setFaceModelsLoaded(true);
      })
      .catch((err) => {
        console.error('Face model failed to load:', err);
        if (!cancelled) {
          setMessage({ text: 'Face detection is unavailable. You can still position the photo by hand.', type: 'info' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-align when a new photo arrives or the document standard changes.
  // Remembered at module level so leaving and re-entering the editor (e.g.
  // Back to the start screen) never re-aligns over the operator's own tweaks.
  const autoAlignedRef = autoAlignMemory.image;
  const lastPresetRef = autoAlignMemory.preset;
  // The crop the last auto-align produced; if the operator hasn't touched it
  // since, a later (better) analysis may silently refine it.
  const lastAutoViewRef = useRef<string | null>(null);
  const viewKey = `${cropPosition.x}|${cropPosition.y}|${cropScale}|${rotation}`;

  useEffect(() => {
    const isImageChanged = originalImage && autoAlignedRef.current !== originalImage;
    const isPresetChanged = !!lastPresetRef.current && lastPresetRef.current !== preset;

    if (originalImage && faceModelsLoaded && (isImageChanged || isPresetChanged)) {
      autoAlignedRef.current = originalImage;
      lastPresetRef.current = preset;
      handleAutoAlign();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage, preset, faceModelsLoaded]);

  // Keep the measurements in sync with whatever image is on screen:
  //  - when the cut-out arrives, its alpha mask gives the true top of the
  //    head, so re-measure (and refine the crop if the operator hasn't
  //    touched it since auto-align);
  //  - after a remount (e.g. Back to the start screen), just re-measure.
  const analyzedImageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!faceModelsLoaded || !imageData || analyzedImageRef.current === imageData) return;
    if (originalImage && autoAlignedRef.current !== originalImage) return; // full auto-align pending
    const untouched = lastAutoViewRef.current === viewKey;
    const isNewCutout = !!processedImage && imageData === processedImage;
    handleAutoAlign({ applyCrop: untouched && isNewCutout, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData, faceModelsLoaded]);

  // Detect the face, then fit head size / eye line / centring / roll to the preset.
  async function handleAutoAlign(opts: { applyCrop?: boolean; quiet?: boolean } = {}) {
    const { applyCrop = true, quiet = false } = opts;
    if (!imageData || !faceModelsLoaded) return;
    const source = imageData;
    analyzedImageRef.current = source;
    setIsDetectingFace(true);
    if (!quiet) setMessage({ text: 'Finding the face and fitting it to the guides…', type: 'info' });

    try {
      const face = await analyzeFace(source);

      if (!face) {
        setFaceAnalysis(null);
        setFaceMissing(true);
        if (!quiet) setMessage({ text: 'No face found. Drag and zoom the photo to fit the guides by hand.', type: 'warning' });
        return;
      }

      setFaceMissing(false);
      setFaceAnalysis(face);

      if (applyCrop) {
        const align = computePassportAlignment(face, getPreset(preset));
        onCropPositionChange({ x: align.cropX, y: align.cropY });
        onCropScaleChange(align.cropScale);
        onRotationChange?.(align.rotationDeg);
        lastAutoViewRef.current = `${align.cropX}|${align.cropY}|${align.cropScale}|${align.rotationDeg}`;

        // Gently lift under-exposed faces (never darken).
        if (!quiet && face.luminance > 0 && face.luminance < 140) {
          onBrightnessChange(100 + Math.min(30, Math.round((145 - face.luminance) * 0.5)));
        }
      }

      if (!quiet) {
        setMessage({
          text: face.faceCount > 1
            ? `Aligned the largest of ${face.faceCount} faces. Check it is the right person.`
            : 'Face aligned to the passport guides.',
          type: face.faceCount > 1 ? 'warning' : 'success',
        });
      }
      if (applyCrop) onSnapshot?.();
    } catch (err) {
      console.error('Face analysis failed:', err);
      if (!quiet) setMessage({ text: 'Face detection failed. You can still position the photo by hand.', type: 'error' });
    } finally {
      setIsDetectingFace(false);
    }
  }

  const handleEnhanceClick = () => {
    if (!isEnhanced) {
      onBrightnessChange(106);
      onContrastChange(112);
      onSaturationChange(105);
      if (onExposureChange) onExposureChange(102);
      setIsEnhanced(true);
      setMessage({ text: 'Auto enhance on.', type: 'success' });
    } else {
      onBrightnessChange(100);
      onContrastChange(100);
      onSaturationChange(100);
      if (onExposureChange) onExposureChange(100);
      setIsEnhanced(false);
      setMessage({ text: 'Auto enhance off.', type: 'info' });
    }
    onSnapshot?.();
  };

  const handleRetouchClick = () => {
    if (!isRetouched) {
      setIsRetouched(true);
      setMessage({ text: 'Skin softening on.', type: 'success' });
    } else {
      setIsRetouched(false);
      setMessage({ text: 'Skin softening off.', type: 'info' });
    }
    onSnapshot?.();
  };

  // ---- Live compliance report ------------------------------------------
  // Recomputed on every render from the last face analysis + current crop.
  const complianceReport = faceAnalysis
    ? evaluateCompliance(
        faceAnalysis,
        getPreset(preset),
        { cropX: cropPosition.x, cropY: cropPosition.y, cropScale, rotationDeg: rotation },
        { backgroundRemoved: !!processedImage },
      )
    : null;

  const filterStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) brightness(${exposure}%) ${
      isRetouched ? 'contrast(98%) brightness(101%) saturate(102%) blur(0.3px)' : ''
    }`,
    transform: `translate(-50%, -50%) translate(${(cropPosition.x - 50) * -1}%, ${(cropPosition.y - 50) * -1}%) scale(${cropScale / 100}) rotate(${rotation}deg)`,
    transformOrigin: '50% 50%',
    transition: isDragging ? 'none' : 'transform 0.15s ease-out'
  };

  // The print-sheet preview repeats the photo in every tile; a smaller copy
  // keeps that screen smooth on phones. Only computed on that screen.
  const sheetImage = usePreviewImage(activeScreen === 'print-sheet' ? imageData : null, 1024);

  // Clothing image styling
  const getClothingPath = () => {
    const tmpl = CLOTHING_TEMPLATES.find(c => c.id === clothingTemplate);
    return tmpl?.path ? tmpl.path : '';
  };

  const clothingStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    transform: `translate(-50%, -50%) translate(${(clothingPosition.x - 50)}%, ${(clothingPosition.y - 50)}%) scale(${clothingScale / 100}) rotate(${clothingRotation}deg)`,
    transformOrigin: '50% 50%',
    left: '50%',
    top: '50%',
    zIndex: 15,
    pointerEvents: 'none' as const,
    transition: (isDragging && canvasActiveItem === 'clothing') ? 'none' : 'transform 0.15s ease-out',
  };

  // ---- Guide geometry from the selected document's real spec --------------
  const spec = getPreset(preset);
  const frameAspect = spec.widthMm / spec.heightMm;
  const headMid = (spec.headMinPct + spec.headMaxPct) / 2;
  const eyeMid = (spec.eyeMinPct + spec.eyeMaxPct) / 2;
  // Crown→eye is roughly 47% of crown→chin, so the oval is anchored on the eye line.
  const ovalTop = eyeMid - headMid * 0.47;
  const ovalWidth = (headMid * 0.66) / frameAspect;
  // Guide colour reflects framing only (size, eye line, centring, tilt) —
  // expression or background issues shouldn't make the guides look wrong.
  const framing = complianceReport?.checks.filter((c) => ['head', 'eyes-level', 'center', 'tilt'].includes(c.id)) ?? [];
  const framingStatus = framing.some((c) => c.status === 'fail') ? 'fail' : framing.some((c) => c.status === 'warn') ? 'warn' : 'pass';
  const guideColor = !complianceReport
    ? faceMissing ? '#DC2626' : '#2F6FD0'
    : framingStatus === 'pass' ? '#16A34A' : framingStatus === 'warn' ? '#D97706' : '#DC2626';

  const warmthOverlay =
    temperature !== 0
      ? {
          backgroundColor: temperature > 0
            ? `rgba(245, 158, 11, ${Math.abs(temperature) / 250})`
            : `rgba(59, 130, 246, ${Math.abs(temperature) / 250})`,
          mixBlendMode: 'color' as const,
        }
      : null;

  const BACKDROPS = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Off-white / light grey', value: '#F5F5F5' },
    { name: 'Light blue', value: '#A1CAF1' },
    { name: 'Royal blue', value: '#0A5C9E' },
    { name: 'Red', value: '#D32F2F' },
  ];
  const isCustomBackdrop = !BACKDROPS.some((c) => c.value === bgColor.toUpperCase());

  return (
    <div className="w-full h-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden panel-scrollbar">
      {/* Invisible triggers linked to the toolbar / keyboard shortcuts */}
      <button id="ai-auto-align-trigger" className="hidden" onClick={() => handleAutoAlign()} />
      <button id="ai-enhance-trigger" className="hidden" onClick={handleEnhanceClick} />
      <button id="ai-retouch-trigger" className="hidden" onClick={handleRetouchClick} />

      {/* ── Canvas area ───────────────────────────────────────── */}
      <div className="relative shrink-0 lg:shrink lg:flex-1 min-w-0 flex flex-col items-center justify-center px-4 pt-14 pb-6 lg:pt-14 bg-bg-app min-h-[58dvh] lg:min-h-0 lg:h-full [--fh:44dvh] [--fw:74vw] sm:[--fw:60vw] lg:[--fh:min(64dvh,620px)] lg:[--fw:calc(100vw-600px)]">
        {/* Status line */}
        {message && activeScreen !== 'print-sheet' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-[90%] animate-fadeIn">
            <div
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] elevate-md bg-card-app ${
                message.type === 'success'
                  ? 'border-success-app/40 text-success-app'
                  : message.type === 'error'
                    ? 'border-danger-app/40 text-danger-app'
                    : message.type === 'warning'
                      ? 'border-warning-app/40 text-warning-app'
                      : 'border-border-app text-text-secondary'
              }`}
            >
              {isDetectingFace && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin shrink-0" />
              )}
              <span className="truncate">{message.text}</span>
              {(message.type === 'warning' || message.type === 'error') && (
                <button onClick={() => setMessage(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 cursor-pointer">
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {activeScreen === 'print-sheet' ? (
          <div className="w-full flex items-center justify-center">
            {(() => {
              const specs = PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS] || PRESET_PIXELS.us;
              let pw = specs.widthMm;
              let ph = specs.heightMm;

              const headerHeight = (showSheetTitle || showPresetInfo || showGenDate) ? 22 : 0;
              const footerHeight = showFooterNotes ? 12 : 0;

              const pageW = paperSize === 'a4' ? 210 : 101.6;
              const pageH = paperSize === 'a4' ? 297 : 152.4;

              const actualPageW = paperOrientation === 'portrait' ? pageW : pageH;
              const actualPageH = paperOrientation === 'portrait' ? pageH : pageW;

              const availableWidth = Math.max(0, actualPageW - 2 * margin);
              const availableHeight = Math.max(0, actualPageH - 2 * margin - headerHeight - footerHeight);

              let colsCount = 1;
              let rowsCount = 1;

              if (useCustomGrid) {
                colsCount = customGridCols;
                rowsCount = customGridRows;

                const ratio = specs.widthMm / specs.heightMm;
                const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
                const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;

                pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
                ph = pw / ratio;
              } else if (paperSize === 'a4') {
                const activeCopies = autoFitA4 ? 36 : photoCount;
                if (activeCopies === 5) {
                  colsCount = 5;
                } else {
                  colsCount = 6;
                }
                
                const ratio = specs.widthMm / specs.heightMm;
                const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
                pw = Math.min(specs.widthMm, pw_limit);
                ph = pw / ratio;
                
                rowsCount = Math.max(1, Math.floor(availableHeight / (ph + spacing)));
              } else {
                // Fixed 4R grid layouts based on orientation and copy count (6 or 8)
                if (paperOrientation === 'landscape') {
                  colsCount = photoCount === 8 ? 4 : 3;
                  rowsCount = 2;
                } else {
                  colsCount = 2;
                  rowsCount = photoCount === 8 ? 4 : 3;
                }
                const ratio = specs.widthMm / specs.heightMm;
                const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
                const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;
                pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
                ph = pw / ratio;
              }

              const maxCapacity = colsCount * rowsCount;
              const activePhotoCount = autoFitA4 ? maxCapacity : photoCount;

              const gridWidth = colsCount * pw + (colsCount - 1) * spacing;
              const gridHeight = rowsCount * ph + (rowsCount - 1) * spacing;
              const startX = (actualPageW - gridWidth) / 2;
              const startY = margin + headerHeight;

              const getPercentW = (mm: number) => `${(mm / actualPageW) * 100}%`;
              const getPercentH = (mm: number) => `${(mm / actualPageH) * 100}%`;

              return (
                <div 
                  className="relative w-[min(78vw,340px)] lg:w-[min(30vw,400px)] bg-white border border-slate-200 rounded shadow-2xl flex flex-col justify-between overflow-hidden select-none transition-all duration-300"
                  style={{
                    aspectRatio: `${actualPageW} / ${actualPageH}`
                  }}
                >
                  
                  {/* Header Preview */}
                  {(showSheetTitle || showPresetInfo || showGenDate) && (
                    <div 
                      className="text-center border-b border-slate-200/50 pb-0.5 mb-1.5 text-slate-800 font-bold origin-top shrink-0 select-none"
                      style={{
                        paddingTop: '2.5%',
                        height: '7.4%',
                        transform: 'scale(0.85)',
                      }}
                    >
                      {showSheetTitle && <div style={{ fontSize: '4.5px', lineHeight: '1' }}>Precision Passport Photos Sheet</div>}
                      {(showPresetInfo || showGenDate) && (
                        <div style={{ fontSize: '3px', color: '#6b7280', marginTop: '1px', fontWeight: 'normal' }}>
                          {showPresetInfo && `Preset: ${PRESETS[preset as keyof typeof PRESETS]?.name || preset} (${pw}x${ph}mm)`}
                          {showPresetInfo && showGenDate && ' | '}
                          {showGenDate && `Generated: ${new Date().toLocaleDateString()}`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Grid Area using absolute positioning to match print/PDF exactly */}
                  <div className="flex-1 w-full min-h-0 relative">
                    {Array.from({ length: activePhotoCount }).map((_, idx) => {
                      const slotIndex = idx + skipCount;
                      if (slotIndex >= colsCount * rowsCount) return null;
                      const col = slotIndex % colsCount;
                      const row = Math.floor(slotIndex / colsCount);
                      const x = startX + col * (pw + spacing);
                      const y = startY + row * (ph + spacing);

                      return (
                        <div 
                          key={idx}
                          className="absolute border border-slate-200 overflow-hidden shadow-sm"
                          style={{
                            left: getPercentW(x),
                            top: getPercentH(y),
                            width: getPercentW(pw),
                            height: getPercentH(ph),
                            backgroundColor: bgColor
                          }}
                        >
                          {/* Dynamic Custom Border Overlay */}
                          {showBorder && (
                            <div 
                              className="absolute inset-0 pointer-events-none z-20"
                              style={{
                                border: `calc(${borderSize} * (100% / ${pw})) solid ${borderColor}`,
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                          {/* Crop Marks Overlay in Preview */}
                          {showCropMarks && (
                            <div className="absolute inset-0 pointer-events-none z-10">
                              <div className="absolute top-0 left-0 w-1 h-[0.5px] bg-slate-350" />
                              <div className="absolute top-0 left-0 w-[0.5px] h-1 bg-slate-350" />
                              <div className="absolute top-0 right-0 w-1 h-[0.5px] bg-slate-350" />
                              <div className="absolute top-0 right-0 w-[0.5px] h-1 bg-slate-350" />
                              <div className="absolute bottom-0 left-0 w-1 h-[0.5px] bg-slate-350" />
                              <div className="absolute bottom-0 left-0 w-[0.5px] h-1 bg-slate-350" />
                              <div className="absolute bottom-0 right-0 w-1 h-[0.5px] bg-slate-350" />
                              <div className="absolute bottom-0 right-0 w-[0.5px] h-1 bg-slate-350" />
                            </div>
                          )}

                          {imageData && (
                            <div className="w-full h-full relative">
                              {(() => {
                                const personImg = (isMultiPersonMode && multiPersonImages && multiPersonImages.length > 0)
                                  ? multiPersonImages[row % multiPersonImages.length]
                                  : null;
                                
                                if (personImg) {
                                  return (
                                    <img
                                      src={personImg}
                                      alt="Print Preview Tile"
                                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                                    />
                                  );
                                }

                                return (
                                  <>
                                    <img
                                      src={sheetImage ?? imageData}
                                      alt="Print Preview Tile"
                                      decoding="async"
                                      style={{
                                        ...filterStyle,
                                        transform: `translate(-50%, -50%) translate(${(cropPosition.x - 50) * -1}%, ${(cropPosition.y - 50) * -1}%) scale(${(cropScale / 100)}) rotate(${rotation}deg)`,
                                        transition: 'none'
                                      }}
                                      className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none"
                                    />
                                    {clothingTemplate !== 'none' && (
                                      <img
                                        src={getClothingPath()}
                                        style={{
                                          ...clothingStyle,
                                          transform: `translate(-50%, -50%) translate(${(clothingPosition.x - 50)}%, ${(clothingPosition.y - 50)}%) scale(${clothingScale / 100}) rotate(${clothingRotation}deg)`,
                                          position: 'absolute',
                                          transition: 'none'
                                        }}
                                        className="pointer-events-none"
                                      />
                                    )}
                                    {showSlate && (
                                      <div 
                                        className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-300 text-black text-center select-none font-sans font-bold z-20 flex flex-col justify-center"
                                        style={{ height: '16%', fontSize: '3px', transform: 'scale(0.95)', transformOrigin: 'bottom center', lineHeight: '1' }}
                                      >
                                        <div className="truncate px-0.5" style={{ fontSize: '2.4px' }}>
                                          {slateName ? slateName.toUpperCase() : 'NAME'}
                                        </div>
                                        <div className="truncate px-0.5 text-slate-700 mt-[0.3px]" style={{ fontSize: '2px' }}>
                                          {slateDate ? slateDate.toUpperCase() : 'DATE'}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer Preview */}
                  {showFooterNotes && (
                    <div 
                      className="text-center text-slate-400 font-bold shrink-0 select-none"
                      style={{
                        fontSize: '3px',
                        transform: 'scale(0.8)',
                        paddingBottom: '2.5%',
                        height: '4%',
                      }}
                    >
                      Print scale at 100% (No Scaling). Use high-gloss papers.
                    </div>
                  )}

                </div>
              );
            })()}
          </div>
        ) : (
          <>
            <div className="relative">
              {/* Photo frame at the document's exact aspect ratio */}
              <div
                ref={containerRef}
                className={`touch-none-canvas relative overflow-hidden rounded-sm select-none elevate-lg ring-1 ${
                  editingClothing ? 'ring-2 ring-accent-app' : 'ring-black/10'
                } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  backgroundColor: bgColor,
                  aspectRatio: `${spec.widthMm} / ${spec.heightMm}`,
                  height: `min(var(--fh), calc(var(--fw) * ${(1 / frameAspect).toFixed(4)}))`,
                }}
              >
                {imageData ? (
                  <>
                    <img
                      src={imageData}
                      alt="Portrait being edited"
                      draggable={false}
                      style={{ ...filterStyle, willChange: 'transform' }}
                      className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none"
                    />

                    {/* Warmth tint — same blend the exporter applies */}
                    {warmthOverlay && <div className="absolute inset-0 pointer-events-none z-[5]" style={warmthOverlay} />}

                    {clothingTemplate !== 'none' && (
                      <img src={getClothingPath()} alt="" draggable={false} style={clothingStyle} className="absolute pointer-events-none" />
                    )}

                    {showSlate && (
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-white border-t border-neutral-300 text-black text-center font-sans font-bold z-20 flex flex-col justify-center"
                        style={{ height: '16%' }}
                      >
                        <div className="w-full px-1 truncate" style={{ fontSize: 'clamp(8px, 1.6vh, 15px)', lineHeight: '1.1' }}>
                          {slateName ? slateName.toUpperCase() : '[CANDIDATE NAME]'}
                        </div>
                        <div className="w-full px-1 truncate mt-0.5 text-neutral-700" style={{ fontSize: 'clamp(7px, 1.3vh, 12px)', lineHeight: '1.1' }}>
                          {slateDate ? slateDate.toUpperCase() : '[DATE OF PHOTO]'}
                        </div>
                      </div>
                    )}

                    {showBorder && (
                      <div
                        className="absolute inset-0 pointer-events-none z-20"
                        style={{
                          border: `calc(${borderSize} * (100% / ${spec.widthMm})) solid ${borderColor}`,
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">No photo</div>
                )}

                {/* Guides: eye zone, head outline and centre line for this document */}
                {imageData && activeScreen === 'adjust' && (
                  <div className="absolute inset-0 pointer-events-none z-10 biometric-guide-pulse">
                    <div
                      className="absolute left-0 right-0"
                      style={{
                        top: `${spec.eyeMinPct}%`,
                        height: `${spec.eyeMaxPct - spec.eyeMinPct}%`,
                        backgroundColor: `${guideColor}1F`,
                        borderTop: `1px dashed ${guideColor}`,
                        borderBottom: `1px dashed ${guideColor}`,
                      }}
                    />
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed" style={{ borderColor: `${guideColor}99` }} />
                    <div
                      className="absolute rounded-[50%] border-[1.5px] border-dashed"
                      style={{
                        top: `${ovalTop}%`,
                        height: `${headMid}%`,
                        left: `${50 - ovalWidth / 2}%`,
                        width: `${ovalWidth}%`,
                        borderColor: guideColor,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Physical size rulers */}
              <div className="absolute left-0 right-0 -bottom-6 flex items-center gap-1.5 text-[11px] text-text-secondary pointer-events-none">
                <span className="flex-1 h-px bg-border-app" />
                <span className="tabular-nums">{spec.widthMm} mm</span>
                <span className="flex-1 h-px bg-border-app" />
              </div>
              <div className="absolute top-0 bottom-0 -right-7 flex flex-col items-center gap-1.5 text-[11px] text-text-secondary pointer-events-none">
                <span className="flex-1 w-px bg-border-app" />
                <span className="tabular-nums [writing-mode:vertical-rl] rotate-180">{spec.heightMm} mm</span>
                <span className="flex-1 w-px bg-border-app" />
              </div>
            </div>

            <div className="mt-10 flex flex-col items-center gap-2 text-[13px] text-text-secondary text-center">
              {clothingTemplate !== 'none' && (
                <div className="inline-flex rounded-md border border-border-app bg-card-app p-0.5" role="group" aria-label="What to move">
                  {(['photo', 'clothing'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onCanvasActiveItemChange(item)}
                      aria-pressed={canvasActiveItem === item}
                      className={`px-3 py-1 rounded text-[13px] cursor-pointer transition-colors ${
                        canvasActiveItem === item ? 'bg-accent-app text-white' : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      Move {item === 'photo' ? 'photo' : 'outfit'}
                    </button>
                  ))}
                </div>
              )}
              <span>
                <FiMove className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Drag to move · scroll or pinch to zoom
              </span>
              {activeScreen === 'adjust' && imageData && (
                <span className="flex items-center gap-3 text-[12px]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-[1px]" style={{ backgroundColor: `${guideColor}40`, border: `1px dashed ${guideColor}` }} /> Eyes here
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-3 rounded-[50%] border border-dashed" style={{ borderColor: guideColor }} /> Head outline
                  </span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Settings panel ───────────────────────────────────── */}
      <aside className="w-full lg:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-border-app bg-panel-app lg:h-full lg:overflow-y-auto panel-scrollbar">
        <div className="p-4 space-y-4 pb-8">
          {/* STEP: document size */}
          {activeScreen === 'presets' && (
            <>
              <PanelIntro title="Choose the document" text="The photo size and face position rules follow this choice." />

              <div className="grid grid-cols-2 gap-2">
                {Object.keys(PRESETS).map((key) => {
                  const meta = getPreset(key);
                  const isActive = preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onPresetChange(key);
                        onSnapshot?.();
                      }}
                      aria-pressed={isActive}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-colors flex flex-col gap-1.5 min-h-[76px] ${
                        isActive
                          ? 'bg-accent-app/8 border-accent-app ring-1 ring-accent-app'
                          : 'bg-card-app border-border-app hover:border-text-secondary/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <CountryFlag code={meta.country} className="w-5 h-3.5 rounded-[2px] shrink-0 ring-1 ring-black/10" />
                        <span className={`text-[13px] font-medium leading-tight line-clamp-2 ${isActive ? 'text-accent-app' : 'text-text-primary'}`}>
                          {meta.label}
                        </span>
                      </span>
                      <span className="text-[12px] text-text-secondary tabular-nums">
                        {meta.widthMm} × {meta.heightMm} mm
                      </span>
                    </button>
                  );
                })}
              </div>

              <Card title={spec.name}>
                <dl className="text-[13px] divide-y divide-border-app/70">
                  {[
                    ['Photo size', `${spec.widthMm} × ${spec.heightMm} mm`],
                    ['Head height', `${spec.headMinPct}–${spec.headMaxPct}% of photo`],
                    ['Eye line', `${spec.eyeMinPct}–${spec.eyeMaxPct}% from top`],
                    ['Print resolution', `${PRESET_PIXELS[preset]?.widthPx} × ${PRESET_PIXELS[preset]?.heightPx} px @ 300 DPI`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-text-secondary">{k}</dt>
                      <dd className="text-text-primary font-medium text-right">{v}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between items-center gap-3 py-1.5">
                    <dt className="text-text-secondary">Suggested background</dt>
                    <dd className="flex items-center gap-1.5 font-medium">
                      <span className="w-4 h-4 rounded-full border border-border-app" style={{ backgroundColor: spec.bgColor }} />
                      {spec.bgColor}
                    </dd>
                  </div>
                </dl>
              </Card>
            </>
          )}

          {/* STEP: edit */}
          {activeScreen === 'adjust' && (
            <>
              <PanelIntro title="Edit & check" text="Fix anything flagged below, then continue to printing." />

              {/* Live photo check */}
              <Card
                title="Photo check"
                aside={
                  complianceReport ? (
                    <span
                      className={`text-[12px] font-medium px-2 py-0.5 rounded-md ${
                        complianceReport.overall === 'pass'
                          ? 'bg-success-app/12 text-success-app'
                          : complianceReport.overall === 'warn'
                            ? 'bg-warning-app/12 text-warning-app'
                            : 'bg-danger-app/12 text-danger-app'
                      }`}
                    >
                      {complianceReport.passed}/{complianceReport.checks.length} passed
                    </span>
                  ) : null
                }
              >
                {complianceReport ? (
                  <ul className="space-y-2">
                    {complianceReport.checks.map((c) => {
                      const Icon = c.status === 'pass' ? FiCheckCircle : c.status === 'warn' ? FiAlertTriangle : FiXCircle;
                      const tone = c.status === 'pass' ? 'text-success-app' : c.status === 'warn' ? 'text-warning-app' : 'text-danger-app';
                      return (
                        <li key={c.id} className="flex items-start gap-2.5 text-[13px]">
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2">
                              <span className="font-medium text-text-primary">{c.label}</span>
                              <span className="text-text-secondary text-right tabular-nums">{c.detail}</span>
                            </div>
                            {c.status !== 'pass' && c.hint && <p className={`text-[12px] ${tone}`}>{c.hint}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[13px] text-text-secondary flex items-center gap-2">
                    {faceMissing ? (
                      <>
                        <FiAlertTriangle className="w-4 h-4 text-warning-app shrink-0" /> No face found — position the photo by hand.
                      </>
                    ) : (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-accent-app/30 border-t-accent-app animate-spin shrink-0" />
                        {faceModelsLoaded ? 'Checking the photo…' : 'Loading face model…'}
                      </>
                    )}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!faceModelsLoaded || isDetectingFace}
                  onClick={() => handleAutoAlign()}
                  className="studio-btn studio-btn-secondary w-full"
                >
                  <FaMagic className="w-4 h-4 text-accent-app" />
                  {isDetectingFace ? 'Aligning…' : 'Auto-align face'}
                </button>
              </Card>

              {/* Background */}
              <Card
                title="Background"
                aside={
                  !processedImage ? (
                    <span className="text-[12px] font-medium text-warning-app bg-warning-app/12 px-2 py-0.5 rounded-md">Not removed</span>
                  ) : (
                    <span className="text-[12px] font-medium text-success-app bg-success-app/12 px-2 py-0.5 rounded-md">Removed</span>
                  )
                }
              >
                {bgRemover}
                {processedImage && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[13px] font-medium text-text-secondary">Backdrop colour</span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {BACKDROPS.map((color) => {
                        const isActive = bgColor.toUpperCase() === color.value;
                        return (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => {
                              onBgColorChange(color.value);
                              onSnapshot?.();
                            }}
                            title={color.name}
                            aria-label={color.name}
                            aria-pressed={isActive}
                            className={`w-8 h-8 rounded-full border cursor-pointer transition-shadow ${
                              isActive ? 'border-accent-app ring-2 ring-accent-app ring-offset-2 ring-offset-card-app' : 'border-border-app'
                            }`}
                            style={{ backgroundColor: color.value }}
                          />
                        );
                      })}
                      <label
                        title="Custom colour"
                        className={`relative w-8 h-8 rounded-full border cursor-pointer overflow-hidden bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] ${
                          isCustomBackdrop ? 'ring-2 ring-accent-app ring-offset-2 ring-offset-card-app border-accent-app' : 'border-border-app'
                        }`}
                      >
                        {isCustomBackdrop && (
                          <span className="absolute inset-1.5 rounded-full border border-white/60" style={{ backgroundColor: bgColor }} />
                        )}
                        <input
                          type="color"
                          aria-label="Custom backdrop colour"
                          value={isCustomBackdrop ? bgColor : '#FFFFFF'}
                          onChange={(e) => onBgColorChange(e.target.value)}
                          onBlur={() => onSnapshot?.()}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </Card>

              {/* Position */}
              <Card title="Position & size">
                <CropSlider label="Zoom" min={MIN_CROP_SCALE} max={MAX_CROP_SCALE} value={cropScale} onChange={onCropScaleChange} onMouseUp={onSnapshot} />
                {onRotationChange && (
                  <CropSlider label="Rotate" min={-30} max={30} step={0.5} value={rotation} suffix="°" onChange={onRotationChange} onMouseUp={onSnapshot} />
                )}
                <CropSlider
                  label="Left / right"
                  min={MIN_CROP_POS}
                  max={MAX_CROP_POS}
                  value={cropPosition.x}
                  onChange={(val) => onCropPositionChange({ ...cropPosition, x: val })}
                  onMouseUp={onSnapshot}
                />
                <CropSlider
                  label="Up / down"
                  min={MIN_CROP_POS}
                  max={MAX_CROP_POS}
                  value={cropPosition.y}
                  onChange={(val) => onCropPositionChange({ ...cropPosition, y: val })}
                  onMouseUp={onSnapshot}
                />
              </Card>

              {/* Light & colour */}
              <Card title="Light & colour">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleEnhanceClick}
                    aria-pressed={isEnhanced}
                    className={`studio-btn !px-2 text-[14px] ${isEnhanced ? 'bg-accent-app/10 border-accent-app text-accent-app' : 'studio-btn-secondary'}`}
                  >
                    <FiSun className="w-4 h-4" /> Auto enhance
                  </button>
                  <button
                    type="button"
                    onClick={handleRetouchClick}
                    aria-pressed={isRetouched}
                    className={`studio-btn !px-2 text-[14px] ${isRetouched ? 'bg-accent-app/10 border-accent-app text-accent-app' : 'studio-btn-secondary'}`}
                  >
                    <FaPaintBrush className="w-3.5 h-3.5" /> Soften skin
                  </button>
                </div>
                <details className="group">
                  <summary className="text-[13px] font-medium text-text-secondary cursor-pointer flex justify-between items-center list-none py-1 hover:text-text-primary">
                    Manual adjustments
                    <FiChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 pt-2">
                    <CropSlider label="Brightness" min={50} max={150} value={brightness} onChange={onBrightnessChange} onMouseUp={onSnapshot} />
                    <CropSlider label="Contrast" min={50} max={150} value={contrast} onChange={onContrastChange} onMouseUp={onSnapshot} />
                    <CropSlider label="Saturation" min={50} max={150} value={saturation} onChange={onSaturationChange} onMouseUp={onSnapshot} />
                    {onExposureChange && (
                      <CropSlider label="Exposure" min={50} max={150} value={exposure} onChange={onExposureChange} onMouseUp={onSnapshot} />
                    )}
                    {onTemperatureChange && (
                      <CropSlider label="Warmth" min={-50} max={50} value={temperature} suffix="" onChange={onTemperatureChange} onMouseUp={onSnapshot} />
                    )}
                  </div>
                </details>
              </Card>

              {/* Extras */}
              <Card title="Extras">
                <details className="group" open={clothingTemplate !== 'none'}>
                  <summary className="text-[13px] font-medium text-text-secondary cursor-pointer flex justify-between items-center list-none py-1 hover:text-text-primary">
                    Formal outfit
                    <FiChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      {CLOTHING_TEMPLATES.map((tmpl) => {
                        const isActive = clothingTemplate === tmpl.id;
                        return (
                          <button
                            key={tmpl.id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => {
                              onClothingTemplateChange(tmpl.id);
                              onCanvasActiveItemChange(tmpl.id !== 'none' ? 'clothing' : 'photo');
                              onSnapshot?.();
                            }}
                            className={`py-2 px-2 rounded-md border text-[13px] cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-accent-app/10 border-accent-app text-accent-app font-medium'
                                : 'bg-card-app border-border-app text-text-primary hover:border-text-secondary/50'
                            }`}
                          >
                            {tmpl.id === 'none' ? 'None' : tmpl.name}
                          </button>
                        );
                      })}
                    </div>
                    {clothingTemplate !== 'none' && (
                      <>
                        <CropSlider label="Outfit size" min={40} max={220} value={clothingScale} onChange={onClothingScaleChange} onMouseUp={onSnapshot} />
                        <CropSlider
                          label="Outfit left / right"
                          min={10}
                          max={90}
                          value={clothingPosition.x}
                          onChange={(val) => onClothingPositionChange({ ...clothingPosition, x: val })}
                          onMouseUp={onSnapshot}
                        />
                        <CropSlider
                          label="Outfit up / down"
                          min={10}
                          max={90}
                          value={clothingPosition.y}
                          onChange={(val) => onClothingPositionChange({ ...clothingPosition, y: val })}
                          onMouseUp={onSnapshot}
                        />
                      </>
                    )}
                  </div>
                </details>

                <div className="border-t border-border-app pt-3 space-y-3">
                  <label htmlFor="enable-slate-cb" className="flex items-center justify-between gap-3 cursor-pointer">
                    <span>
                      <span className="block text-[13px] font-medium text-text-primary">Name &amp; date strip</span>
                      <span className="block text-[12px] text-text-secondary">For exam forms (UPSC, SSC, etc.)</span>
                    </span>
                    <input
                      id="enable-slate-cb"
                      type="checkbox"
                      checked={showSlate}
                      onChange={(e) => {
                        onShowSlateChange(e.target.checked);
                        onSnapshot?.();
                      }}
                      className="w-5 h-5 accent-accent-app cursor-pointer shrink-0"
                    />
                  </label>

                  {showSlate && (
                    <div className="space-y-3 animate-fadeIn">
                      <label className="flex flex-col gap-1">
                        <span className="text-[12px] font-medium text-text-secondary">Candidate name</span>
                        <input
                          type="text"
                          value={slateName}
                          onChange={(e) => onSlateNameChange(e.target.value)}
                          onBlur={() => onSnapshot?.()}
                          className="w-full h-10 px-3 bg-card-app border border-border-app rounded-md text-text-primary text-[14px] outline-none focus:border-accent-app"
                          placeholder="e.g. AMIT KUMAR"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="flex justify-between items-center text-[12px] font-medium text-text-secondary">
                          Photo date
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const day = String(d.getDate()).padStart(2, '0');
                              const month = String(d.getMonth() + 1).padStart(2, '0');
                              onSlateDateChange(`DOP: ${day}/${month}/${d.getFullYear()}`);
                              onSnapshot?.();
                            }}
                            className="text-[12px] text-accent-app hover:underline cursor-pointer"
                          >
                            Use today
                          </button>
                        </span>
                        <input
                          type="text"
                          value={slateDate}
                          onChange={(e) => onSlateDateChange(e.target.value)}
                          onBlur={() => onSnapshot?.()}
                          className="w-full h-10 px-3 bg-card-app border border-border-app rounded-md text-text-primary text-[14px] outline-none focus:border-accent-app"
                          placeholder="e.g. DOP: 12/06/2026"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* STEP: print */}
          {activeScreen === 'print-sheet' && (
            <>
              <PanelIntro title="Print sheet" text="Choose paper and copies, then export a print-ready PDF." />
              {downloadButton}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function PanelIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="app-section-title">{title}</h2>
      <p className="text-[13px] text-text-secondary">{text}</p>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card-app border border-border-app rounded-lg p-4 space-y-3 elevate-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
