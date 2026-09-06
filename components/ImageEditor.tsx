'use client';
import { useState, useEffect, useRef } from 'react';
import CropSlider from './CropSlider';
import { 
  FiCamera, FiRefreshCw, FiCheck, FiCheckCircle, FiAlertCircle, FiX,
  FiLayout, FiSun, FiRotateCw, FiSliders, FiEye, FiUser, FiTarget, 
  FiPrinter, FiFileText, FiSmile, FiChevronUp, FiChevronDown, FiThermometer
} from 'react-icons/fi';
import { FaRuler, FaPaintBrush, FaRegLightbulb, FaMagic } from 'react-icons/fa';
import { BiMoveHorizontal, BiMoveVertical } from 'react-icons/bi';
import { IoContrast } from 'react-icons/io5';
import { BsStars, BsEyedropper, BsMouse } from 'react-icons/bs';
import CountryFlag from './CountryFlag';
import { computePassportAlignment, HEAD_BOX_EXPANSION } from '@/lib/faceAlign';
import { ensureFaceModels, makeDetectorOptions } from '@/lib/faceModels';
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
export { PRESETS, PRESET_PIXELS, PASSPORT_PRESETS, getPreset } from '@/lib/presets';
import { PRESETS, PRESET_PIXELS, PASSPORT_PRESETS, getPreset } from '@/lib/presets';

export const CLOTHING_TEMPLATES = [
  { id: 'none' as const, name: 'Original', path: '' },
  { id: 'suit_male' as const, name: 'Male Suit', path: 'clothing/suit_male.png' },
  { id: 'suit_female' as const, name: 'Female Suit', path: 'clothing/suit_female.png' },
  { id: 'tuxedo' as const, name: 'Tuxedo', path: 'clothing/tuxedo.png' },
];

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
  const [faceChecklist, setFaceChecklist] = useState({
    detected: true,
    centered: true,
    lightingOk: true,
    rotatedOk: true,
  });
  // Raw biometric measurements from the last face detection, used by the
  // live ICAO compliance panel. Null until a detection has run.
  const [compliance, setCompliance] = useState<{
    faceBoxRatio: number; // face-box height / source-image height
    tiltDeg: number;      // head roll in degrees
    centerX: number;      // face centre X as % of source width
    faceLuminance: number; // average face luminance 0-255
  } | null>(null);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [isRetouched, setIsRetouched] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' | 'warning' } | null>(null);

  const [openSections, setOpenSections] = useState({
    presets: true,
    slate: false,
    bg: false,
    adjust: false,
    ai: false,
    print: false
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Synchronize expanded accordion to active screen state
  useEffect(() => {
    if (activeScreen === 'presets') {
      setOpenSections({ presets: true, slate: false, bg: false, adjust: false, ai: false, print: false });
    } else if (activeScreen === 'adjust') {
      setOpenSections({ presets: false, slate: true, bg: true, adjust: true, ai: true, print: false });
    } else if (activeScreen === 'print-sheet') {
      setOpenSections({ presets: false, slate: false, bg: false, adjust: false, ai: false, print: true });
    }
  }, [activeScreen]);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number; clothingX: number; clothingY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Wheel to zoom cropScale or clothingScale
  const cropScaleRef = useRef(cropScale);
  const clothingScaleRef = useRef(clothingScale);
  
  useEffect(() => { cropScaleRef.current = cropScale; }, [cropScale]);
  useEffect(() => { clothingScaleRef.current = clothingScale; }, [clothingScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (!imageData) return;
      e.preventDefault();
      const zoomSpeed = 0.04;
      const delta = e.deltaY < 0 ? 1 : -1;

      if (canvasActiveItem === 'clothing' && clothingTemplate !== 'none') {
        const newScale = Math.round(clothingScaleRef.current * (1 + delta * zoomSpeed));
        onClothingScaleChange(Math.min(Math.max(newScale, 30), 300));
      } else {
        const newScale = Math.round(cropScaleRef.current * (1 + delta * zoomSpeed));
        onCropScaleChange(Math.min(Math.max(newScale, 30), 300));
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, [imageData, canvasActiveItem, clothingTemplate, onCropScaleChange, onClothingScaleChange]);

  // Load face-api models offline
  useEffect(() => {
    const loadModels = async () => {
      try {
        const faceapi = await import('face-api.js');
        // Loads tiny + landmarks, and SSD MobileNet only if its shards are fully
        // present (sharper box when available; graceful tiny fallback otherwise).
        await ensureFaceModels(faceapi);
        setFaceModelsLoaded(true);
      } catch (err) {
        console.error('Error loading face-api models:', err);
        setMessage({ text: 'Biometric face models loading skipped. Manual positioning active.', type: 'info' });
      }
    };
    loadModels();
  }, []);

  // Auto-run face align when original image changes or preset standard changes
  const autoAlignedRef = useRef<string | null>(null);
  const lastPresetRef = useRef<string>(preset);
  useEffect(() => {
    const isImageChanged = originalImage && autoAlignedRef.current !== originalImage;
    const isPresetChanged = lastPresetRef.current !== preset;

    if (originalImage && faceModelsLoaded && (isImageChanged || isPresetChanged)) {
      autoAlignedRef.current = originalImage;
      lastPresetRef.current = preset;
      // Delay slightly to ensure browser canvas ready
      setTimeout(() => {
        handleAutoAlign();
      }, 500);
    }
  }, [originalImage, preset, faceModelsLoaded]);

  // Run face-api detection and align coordinates
  // Run face-api detection and align coordinates
  async function handleAutoAlign() {
    if (!imageData || !faceModelsLoaded) return;
    setIsDetectingFace(true);
    setMessage({ text: 'Calibrating face landmarks against passport guides...', type: 'info' });

    try {
      const faceapi = await import('face-api.js');
      const img = new Image();
      img.src = imageData;
      
      img.onload = async () => {
        // Prefer the more accurate SSD MobileNet detector; fall back to tiny.
        const detectorOpts = makeDetectorOptions(faceapi);

        // Pick the largest detected face (most likely the subject) for robustness.
        const detections = await faceapi
          .detectAllFaces(img, detectorOpts as any)
          .withFaceLandmarks();
        const detection = detections && detections.length
          ? detections.reduce((a, b) => (a.detection.box.area >= b.detection.box.area ? a : b))
          : null;

        if (!detection) {
          setMessage({ text: 'Biometric Warning: Face not detected. Adjust cropping box manually.', type: 'warning' });
          setFaceChecklist({
            detected: false,
            centered: false,
            lightingOk: false,
            rotatedOk: false
          });
          setCompliance(null);
          setIsDetectingFace(false);
          return;
        }

        const box = detection.detection.box;
        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        const getCenter = (points: { x: number; y: number }[]) => {
          const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
          return { x: sum.x / points.length, y: sum.y / points.length };
        };

        const leftEyeCenter = getCenter(leftEye);
        const rightEyeCenter = getCenter(rightEye);

        // Preset-aware alignment: scales the head to the selected document's ICAO
        // head band and drops the eye line into its eye band (verified in
        // lib/faceAlign unit tests).
        const p = getPreset(preset);
        const align = computePassportAlignment({
          imgW: img.width,
          imgH: img.height,
          boxHeight: box.height,
          faceCenterX: box.x + box.width / 2,
          leftEye: leftEyeCenter,
          rightEye: rightEyeCenter,
          preset: p,
          headBoxExpansion: HEAD_BOX_EXPANSION,
        });

        const angleDeg = align.rotationDeg; // roll, already sign-corrected for display below
        const pctX = Math.round(((box.x + box.width / 2) / img.width) * 100);
        const boxHeightRatio = box.height / img.height;

        onCropPositionChange({ x: align.cropX, y: align.cropY });
        onCropScaleChange(align.cropScale);
        if (onRotationChange) onRotationChange(align.rotationDeg);

        const isRotatedOk = Math.abs(angleDeg) < 4;
        const isCentered = pctX > 43 && pctX < 57;

        // Auto brightness simulation
        let isLightingOk = true;
        let faceLuminance = 0;
        try {
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            const faceX = Math.max(0, Math.round(box.x));
            const faceY = Math.max(0, Math.round(box.y));
            const faceW = Math.min(img.width - faceX, Math.round(box.width));
            const faceH = Math.min(img.height - faceY, Math.round(box.height));
            if (faceW > 0 && faceH > 0) {
              tempCanvas.width = faceW;
              tempCanvas.height = faceH;
              tempCtx.drawImage(img, faceX, faceY, faceW, faceH, 0, 0, faceW, faceH);
              const imgData = tempCtx.getImageData(0, 0, faceW, faceH);
              const data = imgData.data;
              let sumL = 0;
              for (let i = 0; i < data.length; i += 16) {
                sumL += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              }
              const avgL = sumL / (data.length / 16);
              faceLuminance = avgL;
              isLightingOk = avgL >= 115 && avgL <= 210;
              if (avgL < 140) {
                onBrightnessChange(100 + Math.min(30, Math.round((145 - avgL) * 0.5)));
              }
            }
          }
        } catch (e) {}

        setFaceChecklist({
          detected: true,
          centered: isCentered,
          lightingOk: isLightingOk,
          rotatedOk: isRotatedOk
        });

        setCompliance({
          faceBoxRatio: boxHeightRatio,
          tiltDeg: angleDeg,
          centerX: pctX,
          faceLuminance,
        });

        setMessage({ text: 'AI alignment parameters completed successfully.', type: 'success' });
        onSnapshot?.();
      };
    } catch (err) {
      setMessage({ text: 'AI Face detection models failed to compute.', type: 'error' });
    } finally {
      setIsDetectingFace(false);
    }
  };

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageData) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cropX: cropPosition.x,
      cropY: cropPosition.y,
      clothingX: clothingPosition.x,
      clothingY: clothingPosition.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current || !containerRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    if (canvasActiveItem === 'clothing' && clothingTemplate !== 'none') {
      // Scale translation speed
      const scaleMultiplier = 0.5;
      const newX = dragStartRef.current.clothingX + (dx / width) * 100 * scaleMultiplier;
      const newY = dragStartRef.current.clothingY + (dy / height) * 100 * scaleMultiplier;
      onClothingPositionChange({
        x: Math.min(Math.max(newX, 0), 100),
        y: Math.min(Math.max(newY, 0), 100)
      });
    } else {
      const pctDx = (dx / width) * 100;
      const pctDy = (dy / height) * 100;
      onCropPositionChange({
        x: Math.min(Math.max(dragStartRef.current.cropX - pctDx, 0), 100),
        y: Math.min(Math.max(dragStartRef.current.cropY - pctDy, 0), 100)
      });
    }
  };

  const handleMouseUpOrLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      onSnapshot?.();
    }
  };

  const handleEnhanceClick = () => {
    if (!isEnhanced) {
      onBrightnessChange(106);
      onContrastChange(112);
      onSaturationChange(105);
      if (onExposureChange) onExposureChange(102);
      setIsEnhanced(true);
      setMessage({ text: 'AI enhancements active.', type: 'success' });
    } else {
      onBrightnessChange(100);
      onContrastChange(100);
      onSaturationChange(100);
      if (onExposureChange) onExposureChange(100);
      setIsEnhanced(false);
      setMessage({ text: 'AI enhancements removed.', type: 'info' });
    }
    onSnapshot?.();
  };

  const handleRetouchClick = () => {
    if (!isRetouched) {
      setIsRetouched(true);
      setMessage({ text: 'AI Skin Smoothing retouches active.', type: 'success' });
    } else {
      setIsRetouched(false);
      setMessage({ text: 'AI Skin Smoothing retouches disabled.', type: 'info' });
    }
    onSnapshot?.();
  };

  const getAspectRatioStyle = () => {
    const p = getPreset(preset);
    return { aspectRatio: `${p.widthMm} / ${p.heightMm}` };
  };

  // ---- Live ICAO compliance report -------------------------------------
  // Estimates how well the current framing meets the selected document
  // standard. Head-size updates live as the Scale Zoom slider changes; the
  // other metrics come from the last face detection (Auto-Align). Clearly an
  // estimate — the detector box is expanded to approximate crown-to-chin.
  type ComplianceStatus = 'pass' | 'warn' | 'fail';
  interface ComplianceCheck { label: string; status: ComplianceStatus; detail: string; }
  // HEAD_BOX_EXPANSION is imported from lib/faceAlign so the meter and the
  // auto-aligner share one source of truth.

  const getComplianceReport = (): { checks: ComplianceCheck[]; overall: ComplianceStatus } | null => {
    if (!compliance) return null;
    const p = getPreset(preset);

    // Head height as a % of the photo, applying the live zoom.
    const headPct = Math.round(compliance.faceBoxRatio * HEAD_BOX_EXPANSION * cropScale);
    const headStatus: ComplianceStatus =
      headPct >= p.headMinPct && headPct <= p.headMaxPct ? 'pass'
        : headPct >= p.headMinPct - 6 && headPct <= p.headMaxPct + 6 ? 'warn'
          : 'fail';

    // Head tilt (roll). The app auto-corrects rotation, so small values are fine.
    const absTilt = Math.abs(compliance.tiltDeg);
    const tiltStatus: ComplianceStatus = absTilt <= 3 ? 'pass' : absTilt <= 10 ? 'warn' : 'fail';

    // Horizontal centering of the face.
    const cx = compliance.centerX;
    const centerStatus: ComplianceStatus =
      cx >= 44 && cx <= 56 ? 'pass' : cx >= 38 && cx <= 62 ? 'warn' : 'fail';

    // Even facial lighting (average luminance 0-255).
    const lum = Math.round(compliance.faceLuminance);
    const lightStatus: ComplianceStatus =
      lum >= 130 && lum <= 205 ? 'pass' : lum >= 110 && lum <= 225 ? 'warn' : 'fail';

    const checks: ComplianceCheck[] = [
      { label: 'Head size', status: headStatus, detail: `${headPct}% · target ${p.headMinPct}–${p.headMaxPct}%` },
      { label: 'Head straight', status: tiltStatus, detail: `${compliance.tiltDeg > 0 ? '+' : ''}${compliance.tiltDeg}° tilt` },
      { label: 'Centered', status: centerStatus, detail: `${cx}% from left` },
      { label: 'Even lighting', status: lightStatus, detail: lum >= 130 && lum <= 205 ? 'balanced' : lum < 130 ? 'a bit dark' : 'a bit bright' },
    ];
    const overall: ComplianceStatus = checks.some(c => c.status === 'fail') ? 'fail'
      : checks.some(c => c.status === 'warn') ? 'warn' : 'pass';
    return { checks, overall };
  };
  const complianceReport = getComplianceReport();

  const filterStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) brightness(${exposure}%) ${
      isRetouched ? 'contrast(98%) brightness(101%) saturate(102%) blur(0.3px)' : ''
    }`,
    transform: `translate(-50%, -50%) translate(${(cropPosition.x - 50) * -1}%, ${(cropPosition.y - 50) * -1}%) scale(${cropScale / 100}) rotate(${rotation}deg)`,
    transformOrigin: '50% 50%',
    transition: isDragging ? 'none' : 'transform 0.15s ease-out'
  };

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

  return (
    <div className="w-full h-full flex bg-bg-app text-white overflow-hidden select-none">
      {/* Invisible triggers linked to global header buttons */}
      <button id="ai-auto-align-trigger" className="hidden" onClick={handleAutoAlign} />
      <button id="ai-enhance-trigger" className="hidden" onClick={handleEnhanceClick} />
      <button id="ai-retouch-trigger" className="hidden" onClick={handleRetouchClick} />

      {/* 1. Center Workspace Area (45-50% width) */}
      <div className="flex-1 flex flex-col justify-between items-center h-full overflow-hidden p-4 relative bg-bg-app border-r border-border-app">
        
        {/* Messages */}
        <div className="w-full flex flex-col items-center gap-1 shrink-0 select-none z-10">
          {message && (
            <div className={`w-full max-w-lg p-2.5 rounded-xl border flex justify-between items-start text-xs shrink-0 transition-all ${
              message.type === 'success' ? 'bg-success-app/10 border-success-app text-success-app' :
              message.type === 'error' ? 'bg-danger-app/10 border-danger-app text-danger-app' :
              message.type === 'warning' ? 'bg-accent-app/10 border-accent-app text-accent-app' :
              'bg-card-app border-border-app text-text-secondary'
            }`}>
              <div className="font-semibold">{message.text}</div>
              <button onClick={() => setMessage(null)} className="text-neutral-400 hover:text-white ml-2 cursor-pointer flex items-center justify-center">
                <FiX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Viewport Canvas container */}
        <div className="relative flex items-center justify-center my-auto w-full select-none py-3 min-h-[300px] flex-1">
          {activeScreen === 'print-sheet' ? (
            /* Print sheet preview grid */
            (() => {
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
                  className="relative w-full max-w-[220px] xl:max-w-[260px] bg-white border border-slate-200 rounded shadow-2xl flex flex-col justify-between overflow-hidden select-none transition-all duration-300"
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
                                      src={imageData}
                                      alt="Print Preview Tile"
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
            })()
          ) : (
            /* Single Crop Canvas View with Biometric Overlay guides */
            <>
              {/* Biometric guides indicators (Left Side) */}
              <div className="absolute left-[-110px] top-[15px] bottom-[15px] w-[95px] pointer-events-none hidden xl:block select-none font-sans">
                <div className="absolute top-[15%] -translate-y-1/2 right-0 flex items-center gap-1.5 text-[11px] font-bold text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-accent-app shadow-[0_0_6px_var(--accent-app)]" /> Head Top
                </div>
                <div className="absolute top-[38%] -translate-y-1/2 right-0 flex items-center gap-1.5 text-[11px] font-bold text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" /> Eye Line
                </div>
                <div className="absolute top-[53%] -translate-y-1/2 right-0 flex items-center gap-1.5 text-[11px] font-bold text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" /> Nose Line
                </div>
                <div className="absolute top-[72%] -translate-y-1/2 right-0 flex items-center gap-1.5 text-[11px] font-bold text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-slate-500 shadow-[0_0_6px_rgba(255,255,255,0.2)]" /> Chin Line
                </div>
              </div>

              {/* Passport crop boundary box */}
              <div 
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                className={`relative w-full max-w-[210px] xl:max-w-[250px] 2xl:max-w-[290px] max-h-[44vh] xl:max-h-[48vh] overflow-hidden rounded-2xl border select-none shadow-2xl transition-all duration-300 z-10 ${
                  canvasActiveItem === 'clothing' ? 'border-accent-app ring-2 ring-accent-app/20 cursor-move' : 'border-border-app cursor-move'
                }`}
                style={{ 
                  backgroundColor: bgColor,
                  ...getAspectRatioStyle()
                }}
              >
                {imageData ? (
                  <div className="w-full h-full relative">
                    <img
                      src={imageData}
                      alt="Biometric Portrait"
                      style={filterStyle}
                      className="absolute left-1/2 top-1/2 w-full h-full object-cover pointer-events-none"
                    />

                    {/* Clothing template overlay layer */}
                    {clothingTemplate !== 'none' && (
                      <img
                        src={getClothingPath()}
                        alt="Clothing Overlay"
                        style={clothingStyle}
                        className="absolute pointer-events-none"
                      />
                    )}

                    {/* Slate Overlay */}
                    {showSlate && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-white border-t border-neutral-300 text-black text-center select-none font-sans font-bold z-20 flex flex-col justify-center"
                        style={{ height: '16%' }}
                      >
                        <div className="w-full px-1 truncate" style={{ fontSize: 'calc(4px + 1vw)', lineHeight: '1.1' }}>
                          {slateName ? slateName.toUpperCase() : '[CANDIDATE NAME]'}
                        </div>
                        <div className="w-full px-1 truncate mt-0.5 text-neutral-700" style={{ fontSize: 'calc(3px + 0.8vw)', lineHeight: '1.1' }}>
                          {slateDate ? slateDate.toUpperCase() : '[DATE OF PHOTO]'}
                        </div>
                      </div>
                    )}

                    {/* Custom Border Overlay */}
                    {showBorder && (
                      <div 
                        className="absolute inset-0 pointer-events-none z-20"
                        style={{
                          border: `calc(${borderSize} * (100% / ${PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.widthMm || 35})) solid ${borderColor}`,
                          boxSizing: 'border-box'
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
                    No image loaded
                  </div>
                )}

                {/* Biometric Horizontal guidelines */}
                <div className="absolute left-0 right-0 top-[15%] border-t border-dashed border-accent-app/70 pointer-events-none z-20" />
                <div className="absolute left-0 right-0 top-[38%] border-t border-dashed border-blue-500/70 pointer-events-none z-20" />
                <div className="absolute left-0 right-0 top-[53%] border-t border-dashed border-emerald-500/70 pointer-events-none z-20" />
                <div className="absolute left-0 right-0 top-[72%] border-t border-dashed border-neutral-400/40 pointer-events-none z-20" />

                {/* Biometric Face Silhouette Overlay */}
                {imageData && (
                  <div 
                    className="absolute inset-0 pointer-events-none z-10 biometric-guide-pulse flex items-center justify-center"
                    style={{ 
                      '--pulse-color': (faceChecklist.detected && faceChecklist.centered && faceChecklist.rotatedOk && faceChecklist.lightingOk) ? '#16A34A' : '#DC2626' 
                    } as any}
                  >
                    <svg viewBox="0 0 100 100" className="w-[72%] h-[72%] opacity-40">
                      <ellipse cx="50" cy="45" rx="21" ry="27" fill="none" stroke={(faceChecklist.detected && faceChecklist.centered && faceChecklist.rotatedOk && faceChecklist.lightingOk) ? '#16A34A' : '#DC2626'} strokeWidth="1.2" strokeDasharray="3 3" />
                      <line x1="20" y1="41" x2="80" y2="41" stroke={(faceChecklist.detected && faceChecklist.centered && faceChecklist.rotatedOk && faceChecklist.lightingOk) ? '#16A34A' : '#DC2626'} strokeWidth="0.8" strokeDasharray="2 3" />
                      <line x1="50" y1="10" x2="50" y2="90" stroke={(faceChecklist.detected && faceChecklist.centered && faceChecklist.rotatedOk && faceChecklist.lightingOk) ? '#16A34A' : '#DC2626'} strokeWidth="0.6" strokeDasharray="2 3" />
                      <line x1="25" y1="72" x2="75" y2="72" stroke={(faceChecklist.detected && faceChecklist.centered && faceChecklist.rotatedOk && faceChecklist.lightingOk) ? '#16A34A' : '#DC2626'} strokeWidth="0.8" strokeDasharray="2 3" />
                    </svg>
                  </div>
                )}

                {/* Canvas Active Item Badge */}
                <div className="absolute bottom-2 left-2 bg-neutral-900/90 border border-border-app text-[10px] text-white px-2 py-0.5 rounded backdrop-blur select-none font-bold z-25">
                  Preset: {PRESETS[preset as keyof typeof PRESETS]?.name.split(' / ')[0]}
                </div>

                {clothingTemplate !== 'none' && (
                  <div className="absolute bottom-2 right-2 bg-accent-app/90 border border-accent-hover text-[10px] text-white px-2 py-0.5 rounded backdrop-blur select-none font-bold z-25">
                    Editing: {canvasActiveItem === 'clothing' ? 'Formal Suit' : 'Photo'}
                  </div>
                )}
              </div>

              {/* Physical Height dimension scale indicator (right side) */}
              <div className="absolute right-[-24px] top-[15px] bottom-[15px] w-6 flex items-center justify-center pointer-events-none select-none">
                <div className="absolute top-0 bottom-0 w-[1px] bg-border-app" />
                <div className="absolute top-0 -translate-x-1/2 left-1/2 border-b-[5px] border-b-neutral-500 border-x-[4px] border-x-transparent" />
                <div className="absolute bottom-0 -translate-x-1/2 left-1/2 border-t-[5px] border-t-neutral-500 border-x-[4px] border-x-transparent" />
                <div className="absolute left-[10px] bg-neutral-900 border border-border-app px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 rounded whitespace-nowrap z-20">
                  {PRESETS[preset as keyof typeof PRESETS]?.height || 45} mm
                </div>
              </div>

              {/* Physical Width dimension scale indicator (bottom side) */}
              <div className="absolute bottom-[2px] left-[20px] right-[20px] h-6 flex items-center justify-center pointer-events-none select-none">
                <div className="absolute left-0 right-0 h-[1px] bg-border-app" />
                <div className="absolute left-0 -translate-y-1/2 top-1/2 border-r-[5px] border-r-neutral-500 border-y-[4px] border-y-transparent" />
                <div className="absolute right-0 -translate-y-1/2 top-1/2 border-l-[5px] border-l-neutral-500 border-y-[4px] border-y-transparent" />
                <div className="absolute top-[8px] bg-neutral-900 border border-border-app px-1.5 py-0.5 text-[10px] font-bold text-neutral-400 rounded whitespace-nowrap z-20">
                  {PRESETS[preset as keyof typeof PRESETS]?.width || 35} mm
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tip text */}
        <div className="flex flex-col items-center gap-1 shrink-0 select-none pb-1 relative z-10 text-[13px] text-neutral-400 font-semibold mt-3">
          {clothingTemplate !== 'none' ? (
            <div className="flex gap-4">
              <span><BsMouse className="w-3.5 h-3.5 inline mr-1 text-neutral-400" /> Drag Photo / Suit to adjust</span>
              <span>• Scroll to Zoom active item</span>
              <span className="text-accent-app">Active Selection: {canvasActiveItem === 'clothing' ? 'Formal Suit' : 'Photo'}</span>
            </div>
          ) : (
            <span><BsMouse className="w-3.5 h-3.5 inline mr-1 text-neutral-400" /> Drag photo to reposition • Scroll to Zoom</span>
          )}
        </div>
      </div>

      {/* 2. Right Settings Panel (360px) */}
      <aside className="w-[360px] border-l border-border-app bg-panel-app flex flex-col h-full overflow-hidden shrink-0 select-none z-20">
        <div className="flex-1 overflow-y-auto panel-scrollbar p-4 space-y-4 h-full pb-20">
          
          {/* STEP 1: Presets selection panel */}
          {activeScreen === 'presets' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-[17px] font-bold text-accent-app flex items-center gap-1.5">
                  <FaRuler className="w-5 h-5 text-accent-app" /> 1. Select Size Standard
                </h3>
                <p className="text-[12px] text-text-secondary">
                  Choose the document photo preset standard for your customer.
                </p>
              </div>

              {/* Visual presets cards grid */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {Object.entries(PRESETS).map(([key, data]) => {
                  const isActive = preset === key;
                  const meta = getPreset(key);
                  const customLabel = meta.label;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onPresetChange(key);
                        onSnapshot?.();
                      }}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between h-[90px] relative overflow-hidden select-none group ${
                        isActive
                          ? 'bg-accent-app/10 border-accent-app shadow-lg shadow-accent-app/5 ring-1 ring-accent-app/50'
                          : 'bg-card-app border-border-app hover:bg-panel-app hover:border-border-app'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CountryFlag code={meta.country} className="w-5 h-3.5 rounded-[2px] shrink-0 shadow-sm ring-1 ring-black/10" />
                          <span className={`text-[11px] font-black tracking-wider truncate uppercase ${isActive ? 'text-accent-app' : 'text-neutral-400 group-hover:text-text-primary'}`}>
                            {customLabel}
                          </span>
                        </div>
                        <p className="text-[9px] text-text-secondary font-semibold mt-1 line-clamp-2">
                          {data.name.split(' / ')[0]}
                        </p>
                      </div>
                      <div className="text-[9px] font-bold text-accent-app bg-accent-app/10 px-1.5 py-0.5 rounded w-max select-none">
                        {data.width} × {data.height} mm
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Preset specs card */}
              <div className="bg-card-app border border-border-app rounded-xl p-4 text-[13px] text-text-secondary space-y-2.5">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-accent-app">Preset Biometrics Specs</h4>
                <div className="flex justify-between border-b border-border-app/40 pb-1.5">
                  <span>Width × Height:</span>
                  <span className="text-text-primary font-bold">{PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.widthMm} × {PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.heightMm} mm</span>
                </div>
                <div className="flex justify-between border-b border-border-app/40 pb-1.5">
                  <span>Aspect Ratio:</span>
                  <span className="text-text-primary font-bold">{PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.ratio}</span>
                </div>
                <div className="flex justify-between">
                  <span>Printed Grid Capacity:</span>
                  <span className="text-text-primary font-bold">{PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.cols} × {PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS]?.rows} photos</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Adjust & Cutout panel */}
          {activeScreen === 'adjust' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-[17px] font-bold text-accent-app flex items-center gap-1.5">
                  <FiSliders className="w-5 h-5 text-accent-app" /> 2. Edit & Biometrics
                </h3>
                <p className="text-[12px] text-text-secondary">
                  Remove background, adjust crop alignment, and apply formal clothing.
                </p>
              </div>

              {/* Background Color & Removal */}
              <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-border-app/40 pb-2">
                  <span className="text-[12px] font-bold text-text-primary uppercase tracking-wider">
                    Background Settings
                  </span>
                  {!processedImage && (
                    <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-black uppercase tracking-wider animate-pulse">
                      Background Not Cut
                    </span>
                  )}
                </div>
                
                {/* AI Cutout */}
                <div className="w-full">
                  {bgRemover}
                </div>

                {/* Swatches */}
                {processedImage && (
                  <div className="space-y-2 animate-fadeIn">
                    <label className="text-[11px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                      Backdrop Colors
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {[
                        { name: 'White (Govt Exams / UPSC)', value: '#FFFFFF' },
                        { name: 'Sky Blue (Passport Standard)', value: '#A1CAF1' },
                        { name: 'Royal Blue (Corporate / School)', value: '#0A5C9E' },
                        { name: 'Light Gray (Official IDs)', value: '#F5F5F5' },
                        { name: 'Traditional Red', value: '#D32F2F' },
                      ].map((color) => {
                        const isActive = bgColor.toUpperCase() === color.value.toUpperCase();
                        return (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => {
                              onBgColorChange(color.value);
                              onSnapshot?.();
                            }}
                            title={color.name}
                            className={`w-8 h-8 rounded-full border transition-all cursor-pointer relative ${
                              isActive 
                                ? 'border-accent-app scale-110 ring-2 ring-accent-app/20' 
                                : 'border-border-app hover:scale-105'
                            }`}
                            style={{ backgroundColor: color.value }}
                          >
                            {isActive && (
                              <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-accent-app" />
                            )}
                          </button>
                        );
                      })}
                      
                      {/* Pipette custom */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            document.getElementById('adjust-pipette-picker')?.click();
                          }}
                          title="Custom Color"
                          className={`w-8 h-8 rounded-full border transition-all flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-amber-500 to-pink-500 cursor-pointer hover:scale-105`}
                        >
                          {!['#FFFFFF', '#A1CAF1', '#0A5C9E', '#F5F5F5', '#D32F2F'].includes(bgColor.toUpperCase()) && (
                            <span className="w-4.5 h-4.5 rounded-full border border-white/40" style={{ backgroundColor: bgColor }} />
                          )}
                        </button>
                        <input
                          id="adjust-pipette-picker"
                          type="color"
                          value={['#FFFFFF', '#A1CAF1', '#0A5C9E', '#F5F5F5', '#D32F2F'].includes(bgColor.toUpperCase()) ? '#FFFFFF' : bgColor}
                          onChange={(e) => {
                            onBgColorChange(e.target.value);
                          }}
                          onBlur={() => onSnapshot?.()}
                          className="absolute inset-0 opacity-0 w-8 h-8 pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* AI & Retouch Tools */}
              <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-border-app/40 pb-2">
                  <span className="text-[12px] font-bold text-text-primary uppercase tracking-wider">
                    AI & Retouch Tools
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Skin Retouch */}
                  <button
                    type="button"
                    onClick={handleRetouchClick}
                    className={`py-2.5 px-3 rounded-xl border text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      isRetouched 
                        ? 'bg-pink-500/15 border-pink-500 text-pink-400 shadow shadow-pink-500/10' 
                        : 'bg-panel-app border-border-app text-text-secondary hover:text-text-primary hover:bg-border-app'
                    }`}
                  >
                    <FaPaintBrush className={`w-3.5 h-3.5 ${isRetouched ? 'text-pink-400' : 'text-neutral-400'}`} />
                    <span>Skin Retouch</span>
                    {isRetouched && <FiCheckCircle className="w-3.5 h-3.5 text-pink-400 ml-0.5" />}
                  </button>

                  {/* Auto Enhance */}
                  <button
                    type="button"
                    onClick={handleEnhanceClick}
                    className={`py-2.5 px-3 rounded-xl border text-[12px] font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      isEnhanced 
                        ? 'bg-accent-app/15 border-accent-app text-accent-app shadow shadow-accent-app/10' 
                        : 'bg-panel-app border-border-app text-text-secondary hover:text-text-primary hover:bg-border-app'
                    }`}
                  >
                    <FiSliders className={`w-3.5 h-3.5 ${isEnhanced ? 'text-accent-app' : 'text-neutral-400'}`} />
                    <span>Auto Enhance</span>
                    {isEnhanced && <FiCheckCircle className="w-3.5 h-3.5 text-accent-app ml-0.5" />}
                  </button>

                  {/* Auto Align */}
                  <button
                    type="button"
                    disabled={!faceModelsLoaded || isDetectingFace}
                    onClick={handleAutoAlign}
                    className={`col-span-2 py-2.5 px-3 rounded-xl border text-[12.5px] font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isDetectingFace 
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400 cursor-wait' 
                        : 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {isDetectingFace ? (
                      <svg className="animate-spin h-4 w-4 text-emerald-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <FaMagic className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>AI Auto-Align Face & Biometrics</span>
                  </button>
                </div>
              </div>

              {/* ICAO Compliance Report */}
              {complianceReport && (
                <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-border-app/40 pb-2">
                    <span className="text-[12px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <FiCheckCircle className="w-3.5 h-3.5 text-accent-app" /> Compliance Check
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                        complianceReport.overall === 'pass'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : complianceReport.overall === 'warn'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {complianceReport.overall === 'pass' ? 'Ready' : complianceReport.overall === 'warn' ? 'Review' : 'Fix Needed'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {complianceReport.checks.map((c) => (
                      <div key={c.label} className="flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              c.status === 'pass' ? 'bg-emerald-400' : c.status === 'warn' ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                          />
                          <span className="font-semibold text-text-primary">{c.label}</span>
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            c.status === 'pass' ? 'text-emerald-400' : c.status === 'warn' ? 'text-amber-400' : 'text-red-400'
                          }`}
                        >
                          {c.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-secondary leading-snug pt-1 border-t border-border-app/30">
                    Estimate for {getPreset(preset).name}. Adjust <span className="font-bold text-text-primary">Scale Zoom</span> to tune head size; re-run Auto-Align after big changes.
                  </p>
                </div>
              )}

              {/* Photo Crop Alignment */}
              <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border-app/40 pb-2">
                  <span className="text-[12px] font-bold text-text-primary uppercase tracking-wider">
                    Crop & Face Alignment
                  </span>
                </div>

                <div className="space-y-3.5">
                  <CropSlider 
                    label="Scale Zoom" 
                    min={30} 
                    max={250} 
                    value={cropScale} 
                    onChange={onCropScaleChange} 
                    onMouseUp={onSnapshot}
                  />
                  
                  {onRotationChange && (
                    <CropSlider 
                      label="Rotate Angle" 
                      min={-30} 
                      max={30} 
                      value={rotation} 
                      suffix="°" 
                      onChange={onRotationChange} 
                      onMouseUp={onSnapshot}
                    />
                  )}

                  <div className="pt-2 border-t border-border-app/30 space-y-3.5 mt-2">
                    <CropSlider 
                      label="Move Horiz (X)" 
                      min={0} 
                      max={100} 
                      value={cropPosition.x} 
                      onChange={(val) => onCropPositionChange({ ...cropPosition, x: val })} 
                      onMouseUp={onSnapshot}
                    />
                    <CropSlider 
                      label="Move Vert (Y)" 
                      min={0} 
                      max={100} 
                      value={cropPosition.y} 
                      onChange={(val) => onCropPositionChange({ ...cropPosition, y: val })} 
                      onMouseUp={onSnapshot}
                    />
                  </div>
                </div>

                {/* Accordion for manual color adjustments */}
                <div className="border-t border-border-app/40 pt-2.5 mt-1 select-none">
                  <details className="group">
                    <summary className="text-[11px] font-black text-neutral-400 uppercase tracking-widest pl-0.5 cursor-pointer flex justify-between items-center outline-none list-none select-none">
                      <span>Advanced Color Tuning</span>
                      <span className="text-xs transition-transform group-open:rotate-180">▼</span>
                    </summary>
                    <div className="space-y-3 pt-3">
                      <CropSlider 
                        label="Brightness" 
                        min={50} 
                        max={150} 
                        value={brightness} 
                        onChange={onBrightnessChange} 
                        onMouseUp={onSnapshot}
                      />
                      <CropSlider 
                        label="Contrast" 
                        min={50} 
                        max={150} 
                        value={contrast} 
                        onChange={onContrastChange} 
                        onMouseUp={onSnapshot}
                      />
                      <CropSlider 
                        label="Saturation" 
                        min={50} 
                        max={150} 
                        value={saturation} 
                        onChange={onSaturationChange} 
                        onMouseUp={onSnapshot}
                      />
                      {onExposureChange && (
                        <CropSlider 
                          label="Exposure" 
                          min={50} 
                          max={150} 
                          value={exposure} 
                          onChange={onExposureChange} 
                          onMouseUp={onSnapshot}
                        />
                      )}
                      {onTemperatureChange && (
                        <CropSlider 
                          label="Color Warmth" 
                          min={-50} 
                          max={50} 
                          value={temperature} 
                          onChange={onTemperatureChange} 
                          onMouseUp={onSnapshot}
                        />
                      )}
                    </div>
                  </details>
                </div>
              </div>

              {/* Clothes Template Changer & Slate Overlay */}
              <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-4">
                <span className="text-[12px] font-bold text-text-primary uppercase tracking-wider block border-b border-border-app/40 pb-2">
                  Suits & Biometric Slate
                </span>

                {/* Clothing Templates Selector */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                    Formal Clothes Change
                  </label>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {CLOTHING_TEMPLATES.map((tmpl) => {
                      const isActive = clothingTemplate === tmpl.id;
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => {
                            onClothingTemplateChange(tmpl.id);
                            if (tmpl.id !== 'none') {
                              onCanvasActiveItemChange('clothing');
                            } else {
                              onCanvasActiveItemChange('photo');
                            }
                            onSnapshot?.();
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-[12px] font-bold transition-all text-center cursor-pointer select-none ${
                            isActive 
                              ? 'bg-accent-app/15 border-accent-app text-accent-app shadow' 
                              : 'bg-card-app border-border-app text-text-secondary hover:text-text-primary hover:bg-panel-app'
                          }`}
                        >
                          {tmpl.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Suit Adjuster Controls (Sliders) */}
                {clothingTemplate !== 'none' && (
                  <div className="bg-panel-app/60 border border-border-app/80 p-3 rounded-xl space-y-3.5 animate-fadeIn">
                    <div className="flex justify-between items-center bg-card-app border border-border-app p-2 rounded-lg">
                      <span className="text-[11px] font-black text-neutral-400 uppercase tracking-wider">Drag to adjust:</span>
                      <div className="flex rounded overflow-hidden border border-border-app">
                        <button
                          type="button"
                          onClick={() => onCanvasActiveItemChange('photo')}
                          className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors ${canvasActiveItem === 'photo' ? 'bg-accent-app text-white' : 'bg-panel-app text-text-secondary hover:text-text-primary'}`}
                        >
                          Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => onCanvasActiveItemChange('clothing')}
                          className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors ${canvasActiveItem === 'clothing' ? 'bg-accent-app text-white' : 'bg-panel-app text-text-secondary hover:text-text-primary'}`}
                        >
                          Suit
                        </button>
                      </div>
                    </div>

                    <CropSlider 
                      label="Suit Scale Size" 
                      min={40} 
                      max={220} 
                      value={clothingScale} 
                      onChange={onClothingScaleChange} 
                      onMouseUp={onSnapshot}
                    />
                    <CropSlider 
                      label="Suit Position Horiz" 
                      min={10} 
                      max={90} 
                      value={clothingPosition.x} 
                      onChange={(val) => onClothingPositionChange({ ...clothingPosition, x: val })} 
                      onMouseUp={onSnapshot}
                    />
                    <CropSlider 
                      label="Suit Position Vert" 
                      min={10} 
                      max={90} 
                      value={clothingPosition.y} 
                      onChange={(val) => onClothingPositionChange({ ...clothingPosition, y: val })} 
                      onMouseUp={onSnapshot}
                    />
                  </div>
                )}

                {/* Exam Slate */}
                <div className="border-t border-border-app/40 pt-3 space-y-3">
                  <div className="flex items-center justify-between select-none">
                    <label htmlFor="enable-slate-cb" className="app-label flex items-center gap-2 cursor-pointer text-[12px] font-bold text-text-primary uppercase tracking-wider">
                      Govt Exam Slate (Name & DOP)
                    </label>
                    <input
                      id="enable-slate-cb"
                      type="checkbox"
                      checked={showSlate}
                      onChange={(e) => {
                        onShowSlateChange(e.target.checked);
                        onSnapshot?.();
                      }}
                      className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
                    />
                  </div>

                  {showSlate && (
                    <div className="space-y-3.5 pt-2 border-t border-border-app/40 animate-fadeIn">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                          Candidate Name (UPSC / SSC)
                        </label>
                        <input
                          type="text"
                          value={slateName}
                          onChange={(e) => {
                            onSlateNameChange(e.target.value);
                            onSnapshot?.();
                          }}
                          className="w-full min-h-[40px] px-3 bg-panel-app border border-border-app rounded-lg text-text-primary font-semibold text-[13px] outline-none focus:border-accent-app"
                          placeholder="E.g. AMIT KUMAR"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center pl-0.5">
                          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                            Photo Date (DOP)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const day = String(d.getDate()).padStart(2, '0');
                              const month = String(d.getMonth() + 1).padStart(2, '0');
                              const year = d.getFullYear();
                              onSlateDateChange(`DOP: ${day}/${month}/${year}`);
                              onSnapshot?.();
                            }}
                            className="text-[10px] font-bold text-accent-app hover:text-accent-hover bg-accent-app/10 px-2 py-0.5 rounded cursor-pointer transition-colors"
                          >
                            ⚡ Fill Today&apos;s Date
                          </button>
                        </div>
                        <input
                          type="text"
                          value={slateDate}
                          onChange={(e) => {
                            onSlateDateChange(e.target.value);
                            onSnapshot?.();
                          }}
                          className="w-full min-h-[40px] px-3 bg-panel-app border border-border-app rounded-lg text-text-primary font-semibold text-[13px] outline-none focus:border-accent-app"
                          placeholder="E.g. DOP: 12/06/2026"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Print layout setup */}
          {activeScreen === 'print-sheet' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-[17px] font-bold text-accent-app flex items-center gap-1.5">
                  <FiPrinter className="w-5 h-5 text-accent-app" /> 3. Layout & Export
                </h3>
                <p className="text-[12px] text-text-secondary">
                  Configure the sheet margins, slots to skip, and export the document.
                </p>
              </div>
              
              {downloadButton}
            </div>
          )}

        </div>
      </aside>

    </div>
  );
}
