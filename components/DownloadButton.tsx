'use client';
import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { PRESETS, PRESET_PIXELS } from './ImageEditor';
import { 
  FiPrinter, FiImage, FiSave, FiCheckCircle, FiBarChart2, 
  FiFileText, FiType, FiFile, FiCheck, FiX, FiChevronDown, FiDownload,
  FiSliders, FiInfo, FiCalendar, FiLayout, FiUsers
} from 'react-icons/fi';
import { BiMoveHorizontal } from 'react-icons/bi';
import { FaRuler } from 'react-icons/fa';
import MultiPersonPanel from './MultiPersonPanel';

interface DownloadButtonProps {
  imageData: string | null;
  brightness: number;
  contrast: number;
  saturation: number;
  bgColor: string;
  cropPosition: { x: number; y: number };
  cropScale: number;
  rotation?: number;
  exposure?: number;
  temperature?: number;
  preset: string;

  // Clothing states
  clothingTemplate: 'none' | 'suit_male' | 'suit_female' | 'tuxedo';
  clothingScale: number;
  clothingPosition: { x: number; y: number };
  clothingRotation: number;

  photoCount: number;
  onPhotoCountChange: (val: number) => void;
  spacing: number;
  onSpacingChange: (val: number) => void;
  margin: number;
  onMarginChange: (val: number) => void;
  showCropMarks: boolean;
  onShowCropMarksChange: (val: boolean) => void;
  showSheetTitle: boolean;
  onShowSheetTitleChange: (val: boolean) => void;
  showPresetInfo: boolean;
  onShowPresetInfoChange: (val: boolean) => void;
  showGenDate: boolean;
  onShowGenDateChange: (val: boolean) => void;
  showFooterNotes: boolean;
  onShowFooterNotesChange: (val: boolean) => void;
  autoFitA4: boolean;
  onAutoFitA4Change: (val: boolean) => void;

  skipCount: number;
  onSkipCountChange: (val: number) => void;
  isCustomCount: boolean;
  onIsCustomCountChange: (val: boolean) => void;
  customCount: number;
  onCustomCountChange: (val: number) => void;
  skipMode: string;
  onSkipModeChange: (val: string) => void;
  customSkip: number;
  onCustomSkipChange: (val: number) => void;
  onSaveProject?: () => void;
  onExportSuccess?: (fileData: any) => void;
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

  // Slate states
  showSlate: boolean;
  slateName: string;
  slateDate: string;

  // Border states
  showBorder: boolean;
  onShowBorderChange: (val: boolean) => void;
  borderColor: string;
  onBorderColorChange: (val: string) => void;
  borderSize: number;
  onBorderSizeChange: (val: number) => void;

  // Multi-Person Mode
  isMultiPersonMode: boolean;
  onMultiPersonModeChange: (val: boolean) => void;
  multiPersonImages: (string | null)[];  // Array of up to 6 processed person images
  onMultiPersonImagesChange: (images: (string | null)[]) => void;
}

// PRESET_PIXELS is imported from the shared source of truth (via ImageEditor).

export default function DownloadButton({
  imageData,
  brightness,
  contrast,
  saturation,
  bgColor,
  cropPosition,
  cropScale,
  rotation = 0,
  exposure = 100,
  temperature = 0,
  preset,

  clothingTemplate,
  clothingScale,
  clothingPosition,
  clothingRotation,

  photoCount,
  onPhotoCountChange,
  spacing,
  onSpacingChange,
  margin,
  onMarginChange,
  showCropMarks,
  onShowCropMarksChange,
  showSheetTitle,
  onShowSheetTitleChange,
  showPresetInfo,
  onShowPresetInfoChange,
  showGenDate,
  onShowGenDateChange,
  showFooterNotes,
  onShowFooterNotesChange,
  autoFitA4,
  onAutoFitA4Change,

  skipCount,
  onSkipCountChange,
  isCustomCount,
  onIsCustomCountChange,
  customCount,
  onCustomCountChange,
  skipMode,
  onSkipModeChange,
  customSkip,
  onCustomSkipChange,
  onSaveProject,
  onExportSuccess,
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

  // Slate props
  showSlate,
  slateName,
  slateDate,

  // Border props
  showBorder,
  onShowBorderChange,
  borderColor,
  onBorderColorChange,
  borderSize,
  onBorderSizeChange,

  // Multi-Person props
  isMultiPersonMode,
  onMultiPersonModeChange,
  multiPersonImages,
  onMultiPersonImagesChange
}: DownloadButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  // Track previous paper size to detect transitions
  const [prevPaperSize, setPrevPaperSize] = useState(paperSize);

  // Enforce A4 is always portrait, and set defaults for 4R
  useEffect(() => {
    if (paperSize === 'a4' && paperOrientation !== 'portrait') {
      onPaperOrientationChange('portrait');
    }
    
    // Default 4R to landscape and clamp photoCount
    if (paperSize === '4r' && prevPaperSize === 'a4') {
      onPaperOrientationChange('landscape');
      onAutoFitA4Change(false);
      onIsCustomCountChange(false);
      if (photoCount !== 6 && photoCount !== 8) {
        onPhotoCountChange(6);
      }
    }
    
    setPrevPaperSize(paperSize);
  }, [paperSize, paperOrientation, onPaperOrientationChange, onAutoFitA4Change, onIsCustomCountChange, onPhotoCountChange, photoCount, prevPaperSize]);

  // Clamp 4R copies to 6 or 8
  useEffect(() => {
    if (paperSize === '4r') {
      if (autoFitA4) {
        onAutoFitA4Change(false);
      }
      if (photoCount !== 6 && photoCount !== 8) {
        onPhotoCountChange(6);
      }
    }
  }, [paperSize, photoCount, autoFitA4, onAutoFitA4Change, onPhotoCountChange]);

  // Cyber Cafe target KB size compression states
  const [compressToKB, setCompressToKB] = useState<boolean>(false);
  const [targetKB, setTargetKB] = useState<number>(50); // Default 50KB (UPSC/Passport Seva limit)
  const [compressPreset, setCompressPreset] = useState<'none' | '20kb' | '50kb' | 'custom'>('none');



  const getPresetSpecs = () => {
    return PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS] || PRESET_PIXELS.us;
  };

  // Helper to compute exact grid layouts (A4 or 4x6, portrait or landscape)
  const getGridSpecs = () => {
    const specs = getPresetSpecs();
    let pw = specs.widthMm;
    let ph = specs.heightMm;

    // Calculate header and footer heights in mm
    const headerHeight = (showSheetTitle || showPresetInfo || showGenDate) ? 22 : 0;
    const footerHeight = showFooterNotes ? 12 : 0;

    // Dimensions in mm
    const pageW = paperSize === 'a4' ? 210 : 101.6;
    const pageH = paperSize === 'a4' ? 297 : 152.4;

    // A4 is always portrait. 4R uses user-selected orientation.
    const effectiveOrientation = paperSize === 'a4' ? 'portrait' : paperOrientation;
    const actualPageW = effectiveOrientation === 'portrait' ? pageW : pageH;
    const actualPageH = effectiveOrientation === 'portrait' ? pageH : pageW;

    // Available dimensions minus margins
    const availableWidth = Math.max(0, actualPageW - 2 * margin);
    const availableHeight = Math.max(0, actualPageH - 2 * margin - headerHeight - footerHeight);

    let colsCount = 1;
    let rowsCount = 1;

    if (useCustomGrid) {
      colsCount = customGridCols;
      rowsCount = customGridRows;

      // Calculate photo size so it fits the custom grid dimensions
      const ratio = specs.widthMm / specs.heightMm; // preset aspect ratio
      const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
      const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;

      // Scale to fit both limits
      pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
      ph = pw / ratio;
    } else if (paperSize === '4r') {
      // Fixed 4R grid layouts based on orientation and copy count (6 or 8)
      if (effectiveOrientation === 'landscape') {
        // 4R Landscape: 8 copies -> 2 rows × 4 cols; 6 copies -> 2 rows × 3 cols
        colsCount = photoCount === 8 ? 4 : 3;
        rowsCount = 2;
      } else {
        // 4R Portrait: 8 copies -> 4 rows × 2 cols; 6 copies -> 3 rows × 2 cols
        colsCount = 2;
        rowsCount = photoCount === 8 ? 4 : 3;
      }
      // Scale photo to fit the fixed grid
      const ratio = specs.widthMm / specs.heightMm;
      const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
      const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;
      pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
      ph = pw / ratio;
    } else {
      // A4 Portrait — Indian CSC owner rules:
      // Max 6 cols per row. If exactly 5 copies → 5 cols. If <= 4, keep size of 6 cols but place from start.
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
    }

    const maxCapacity = colsCount * rowsCount;

    // Grid size in mm
    const gridWidth = colsCount * pw + (colsCount - 1) * spacing;
    const gridHeight = rowsCount * ph + (rowsCount - 1) * spacing;

    // Horizontal centering offset, vertical top alignment (maximizes paper savings for studios)
    const startX = (actualPageW - gridWidth) / 2;
    const startY = margin + headerHeight;

    return {
      pw,
      ph,
      colsCount,
      rowsCount,
      maxCapacity,
      gridWidth,
      gridHeight,
      startX,
      startY,
      headerHeight,
      footerHeight,
      actualPageW,
      actualPageH
    };
  };

  const specs = getGridSpecs();

  // Sync default counts
  useEffect(() => {
    const currentSpecs = getGridSpecs();
    const defaultCopies = Math.min(6, currentSpecs.maxCapacity);
    
    if (autoFitA4) {
      onPhotoCountChange(currentSpecs.maxCapacity);
      onIsCustomCountChange(false);
    } else {
      if (photoCount > currentSpecs.maxCapacity) {
        onPhotoCountChange(currentSpecs.maxCapacity);
      }
    }
  }, [preset, margin, spacing, showSheetTitle, showPresetInfo, showGenDate, showFooterNotes, autoFitA4, useCustomGrid, customGridCols, customGridRows]);

  const selectCopies = (count: number) => {
    const currentSpecs = getGridSpecs();
    const clampedCount = Math.min(currentSpecs.maxCapacity, Math.max(1, count));
    onIsCustomCountChange(false);
    onPhotoCountChange(clampedCount);
  };

  const handleSkipModeChange = (val: string) => {
    onSkipModeChange(val);
    if (val === 'custom') {
      onSkipCountChange(customSkip);
    } else {
      onSkipCountChange(Number(val));
    }
  };

  const handleCustomSkipChange = (val: number) => {
    const currentSpecs = getGridSpecs();
    const clamped = Math.max(0, Math.min(currentSpecs.maxCapacity - 1, val));
    onCustomSkipChange(clamped);
    onSkipCountChange(clamped);
  };

  // Helper to compress image down to a specific target size (KB) by binary-searching Jpeg quality and scaling dimensions if needed
  const compressImageToKB = async (canvas: HTMLCanvasElement, targetSizeKB: number): Promise<string> => {
    let minQuality = 0.05;
    let maxQuality = 0.98;
    let quality = 0.85;
    let blob: Blob | null = null;

    // 1. Binary search for Jpeg Quality
    for (let step = 0; step < 7; step++) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
      if (!blob) break;
      const sizeKB = blob.size / 1024;
      if (sizeKB > targetSizeKB) {
        maxQuality = quality;
        quality = (quality + minQuality) / 2;
      } else {
        minQuality = quality;
        quality = (quality + maxQuality) / 2;
      }
    }

    // 2. If it's still too large (e.g. extremely complex image), scale down the dimensions
    let scale = 0.95;
    while (blob && (blob.size / 1024) > targetSizeKB && scale > 0.3) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.round(canvas.width * scale);
      tempCanvas.height = Math.round(canvas.height * scale);
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        blob = await new Promise<Blob | null>((resolve) => {
          tempCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.5); // use moderate quality
        });
      }
      scale -= 0.1;
    }

    if (blob) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob!);
      });
    }

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Compile final image applying photo adjustments and clothing overlay on an offline canvas
  const applyFilters = (img: HTMLImageElement, format: 'image/jpeg' | 'image/png' = 'image/jpeg'): Promise<string> => {
    return new Promise((resolve) => {
      const currentSpecs = getPresetSpecs();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve(imageData || '');
        return;
      }

      const scaleMultiplier = 3; // 3x scaling for sharp 300 DPI exports
      canvas.width = currentSpecs.widthPx * scaleMultiplier;
      canvas.height = currentSpecs.heightPx * scaleMultiplier;

      const handleResolve = async () => {
        if (showSlate) {
          const slateHeight = Math.round(canvas.height * 0.16);
          
          // Draw white rectangle
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, canvas.height - slateHeight, canvas.width, slateHeight);
          
          // Draw a very thin separation line at the top of the slate
          ctx.strokeStyle = '#D1D5DB';
          ctx.lineWidth = 1 * scaleMultiplier; // scaleMultiplier is 3
          ctx.beginPath();
          ctx.moveTo(0, canvas.height - slateHeight);
          ctx.lineTo(canvas.width, canvas.height - slateHeight);
          ctx.stroke();

          // Write text with auto-scaling to prevent overflow of long names
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const maxSafeWidth = canvas.width - (20 * scaleMultiplier);
          const drawTextScaled = (text: string, centerY: number, baseFontSize: number) => {
            let fontSize = baseFontSize;
            ctx.font = `bold ${fontSize}px Arial`;
            let textWidth = ctx.measureText(text).width;
            
            while (textWidth > maxSafeWidth && fontSize > 10 * scaleMultiplier) {
              fontSize -= 2;
              ctx.font = `bold ${fontSize}px Arial`;
              textWidth = ctx.measureText(text).width;
            }
            ctx.fillText(text, canvas.width / 2, centerY);
          };

          const nameFontSize = Math.round(canvas.height * 0.052);
          const dateFontSize = Math.round(canvas.height * 0.046);

          if (slateName && slateDate) {
            drawTextScaled(slateName.toUpperCase(), canvas.height - slateHeight * 0.65, nameFontSize);
            drawTextScaled(slateDate.toUpperCase(), canvas.height - slateHeight * 0.28, dateFontSize);
          } else if (slateName) {
            drawTextScaled(slateName.toUpperCase(), canvas.height - slateHeight * 0.5, nameFontSize);
          } else if (slateDate) {
            drawTextScaled(slateDate.toUpperCase(), canvas.height - slateHeight * 0.5, nameFontSize);
          }
          ctx.restore();
        }

        // Draw photo border
        if (showBorder) {
          ctx.save();
          ctx.strokeStyle = borderColor;
          // Calculate border thickness in pixels on the canvas
          // scaleMultiplier is 3
          const gridSpecs = getGridSpecs();
          const borderThicknessPx = (borderSize / gridSpecs.pw) * canvas.width;
          ctx.lineWidth = borderThicknessPx;
          ctx.strokeRect(
            borderThicknessPx / 2,
            borderThicknessPx / 2,
            canvas.width - borderThicknessPx,
            canvas.height - borderThicknessPx
          );
          ctx.restore();
        }

        if (format === 'image/jpeg' && compressToKB) {
          const compressed = await compressImageToKB(canvas, targetKB);
          resolve(compressed);
        } else {
          resolve(canvas.toDataURL(format, format === 'image/jpeg' ? 0.98 : undefined));
        }
      };

      // Draw backdrop color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Setup adjustment filters
      let filterString = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) brightness(${exposure}%)`;
      ctx.filter = filterString;

      // Fit photo (object-cover styling)
      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      const fitScale = Math.max(scaleX, scaleY);
      const wFit = img.width * fitScale;
      const hFit = img.height * fitScale;

      const canvasCenterX = canvas.width / 2;
      const canvasCenterY = canvas.height / 2;
      ctx.translate(canvasCenterX, canvasCenterY);

      // User manual crop offsets
      const offsetX = ((50 - cropPosition.x) / 100) * canvas.width;
      const offsetY = ((50 - cropPosition.y) / 100) * canvas.height;
      ctx.translate(offsetX, offsetY);

      // Photo zoom and rotation
      const scaleVal = cropScale / 100;
      ctx.scale(scaleVal, scaleVal);
      ctx.rotate((rotation * Math.PI) / 180);

      // Render photo
      ctx.drawImage(img, -wFit / 2, -hFit / 2, wFit, hFit);
      ctx.restore();

      // Apply warmth / temperature filter
      if (temperature !== 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = temperature > 0 
          ? `rgba(245, 158, 11, ${Math.abs(temperature) / 250})`
          : `rgba(59, 130, 246, ${Math.abs(temperature) / 250})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Draw Clothing template overlay if selected
      if (clothingTemplate !== 'none') {
        const clothImg = new Image();
        clothImg.onload = () => {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Translate to center
          ctx.translate(canvasCenterX, canvasCenterY);

          // Add suit offset translation
          const clothOffsetX = ((clothingPosition.x - 50) / 100) * canvas.width;
          const clothOffsetY = ((clothingPosition.y - 50) / 100) * canvas.height;
          ctx.translate(clothOffsetX, clothOffsetY);

          // Scale and rotate
          const clothScaleVal = clothingScale / 100;
          ctx.scale(clothScaleVal, clothScaleVal);
          ctx.rotate((clothingRotation * Math.PI) / 180);

          // Draw the clothing overlay centered
          const wCloth = canvas.width;
          const hCloth = canvas.height;
          ctx.drawImage(clothImg, -wCloth / 2, -hCloth / 2, wCloth, hCloth);
          ctx.restore();
          
          handleResolve();
        };
        clothImg.onerror = () => {
          handleResolve();
        };
        clothImg.src = clothingTemplate === 'suit_male' ? 'clothing/suit_male.png'
                     : clothingTemplate === 'suit_female' ? 'clothing/suit_female.png'
                     : 'clothing/tuxedo.png';
      } else {
        handleResolve();
      }
    });
  };

  const triggerSuccessAnimation = () => {
    setShowExportSuccess(true);
    setTimeout(() => {
      setShowExportSuccess(false);
      onExportSuccess?.({
        preset,
        photoCount
      });
    }, 1000);
  };

  const downloadPNG = () => {
    if (!imageData) return;
    setGenerating(true);
    const img = new Image();
    img.onload = async () => {
      const processedData = await applyFilters(img, 'image/png');
      const link = document.createElement('a');
      link.download = `passport-studio-cutout-${preset}-${Date.now()}.png`;
      link.href = processedData;
      link.click();
      setGenerating(false);
      triggerSuccessAnimation();
    };
    img.src = imageData;
  };

  const downloadJPG = () => {
    if (!imageData) return;
    setGenerating(true);
    const img = new Image();
    img.onload = async () => {
      const processedData = await applyFilters(img, 'image/jpeg');
      const link = document.createElement('a');
      link.download = `passport-studio-${preset}-${Date.now()}.jpg`;
      link.href = processedData;
      link.click();
      setGenerating(false);
      triggerSuccessAnimation();
    };
    img.src = imageData;
  };

  const getExportFilename = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const hh = String(today.getHours()).padStart(2, '0');
    const min = String(today.getMinutes()).padStart(2, '0');
    const ss = String(today.getSeconds()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `passport-sheet-${yyyy}${mm}${dd}-${hh}${min}${ss}-${rand}.pdf`;
  };

  // Helper: process a single multi-person image, center-cropping it to the preset aspect ratio, filling backdrop color & border
  const processPersonImage = (personImageData: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const currentSpecs = getPresetSpecs();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(personImageData);
          return;
        }

        const scaleMultiplier = 3; // 3x scaling for sharp 300 DPI exports
        canvas.width = currentSpecs.widthPx * scaleMultiplier;
        canvas.height = currentSpecs.heightPx * scaleMultiplier;

        // Draw backdrop color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image with object-cover fit
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fit photo (object-cover styling)
        const scaleX = canvas.width / img.width;
        const scaleY = canvas.height / img.height;
        const fitScale = Math.max(scaleX, scaleY);
        const wFit = img.width * fitScale;
        const hFit = img.height * fitScale;

        const canvasCenterX = canvas.width / 2;
        const canvasCenterY = canvas.height / 2;
        ctx.translate(canvasCenterX, canvasCenterY);
        ctx.drawImage(img, -wFit / 2, -hFit / 2, wFit, hFit);
        ctx.restore();

        // Draw photo border
        if (showBorder) {
          ctx.save();
          ctx.strokeStyle = borderColor;
          const gridSpecs = getGridSpecs();
          const borderThicknessPx = (borderSize / gridSpecs.pw) * canvas.width;
          ctx.lineWidth = borderThicknessPx;
          ctx.strokeRect(
            borderThicknessPx / 2,
            borderThicknessPx / 2,
            canvas.width - borderThicknessPx,
            canvas.height - borderThicknessPx
          );
          ctx.restore();
        }

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => resolve(personImageData);
      img.src = personImageData;
    });
  };

  const downloadPDF = () => {
    if (!imageData) return;
    setGenerating(true);
    const img = new Image();
    img.onload = async () => {
      const processedData = await applyFilters(img);
      const gridSpecs = getGridSpecs();
      
      // A4 is always portrait
      const effectiveOrientation = paperSize === 'a4' ? 'portrait' : paperOrientation;
      
      const doc = new jsPDF({
        orientation: effectiveOrientation,
        unit: 'mm',
        format: paperSize === 'a4' ? 'a4' : [101.6, 152.4]
      });

      const pageW = gridSpecs.actualPageW;
      const pageH = gridSpecs.actualPageH;

      // Draw header
      if (showSheetTitle || showPresetInfo || showGenDate) {
        let textY = margin + 6;
        if (showSheetTitle) {
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(31, 41, 55); // #1F2937
          doc.text('Passport Photo Sheet', pageW / 2, textY, { align: 'center' });
          textY += 6;
        }

        const subtitleParts = [];
        if (showPresetInfo) {
          const presetName = PRESETS[preset as keyof typeof PRESETS]?.name || preset;
          subtitleParts.push(`Preset: ${presetName} (${gridSpecs.pw}x${gridSpecs.ph}mm)`);
        }
        if (showGenDate) {
          const dateStr = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          subtitleParts.push(`Generated: ${dateStr}`);
        }

        if (subtitleParts.length > 0) {
          doc.setFont('Helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128); // #6B7280
          doc.text(subtitleParts.join(' | '), pageW / 2, textY, { align: 'center' });
        }
      }

      // Multi-Person Mode: Pre-process all person images through the same filters
      let rowImageMap: Record<number, string> = {};
      if (isMultiPersonMode && multiPersonImages.length > 0) {
        for (let rowIdx = 0; rowIdx < gridSpecs.rowsCount; rowIdx++) {
          const personImg = multiPersonImages[rowIdx % multiPersonImages.length];
          if (personImg) {
            rowImageMap[rowIdx] = await processPersonImage(personImg);
          } else {
            rowImageMap[rowIdx] = processedData; // fallback to main photo
          }
        }
      }

      // Draw photos and crop marks
      const activeCopies = autoFitA4 ? gridSpecs.maxCapacity : photoCount;
      for (let i = 0; i < activeCopies; i++) {
        const slotIndex = i + skipCount;
        if (slotIndex >= gridSpecs.colsCount * gridSpecs.rowsCount) break;
        const col = slotIndex % gridSpecs.colsCount;
        const row = Math.floor(slotIndex / gridSpecs.colsCount);
        const x = gridSpecs.startX + col * (gridSpecs.pw + spacing);
        const y = gridSpecs.startY + row * (gridSpecs.ph + spacing);

        // Use per-row image in multi-person mode, otherwise use the single processed image
        const imageForSlot = (isMultiPersonMode && rowImageMap[row]) ? rowImageMap[row] : processedData;
        doc.addImage(imageForSlot, 'JPEG', x, y, gridSpecs.pw, gridSpecs.ph);

        if (showCropMarks) {
          doc.setLineWidth(0.08);
          doc.setDrawColor(180, 180, 180);
          const markLen = 2; // 2mm ticks

          // Top-Left
          doc.line(x - markLen, y, x, y);
          doc.line(x, y - markLen, x, y);

          // Top-Right
          doc.line(x + gridSpecs.pw, y, x + gridSpecs.pw + markLen, y);
          doc.line(x + gridSpecs.pw, y - markLen, x + gridSpecs.pw, y);

          // Bottom-Left
          doc.line(x - markLen, y + gridSpecs.ph, x, y + gridSpecs.ph);
          doc.line(x, y + gridSpecs.ph, x, y + gridSpecs.ph + markLen);

          // Bottom-Right
          doc.line(x + gridSpecs.pw, y + gridSpecs.ph, x + gridSpecs.pw + markLen, y + gridSpecs.ph);
          doc.line(x + gridSpecs.pw, y + gridSpecs.ph, x + gridSpecs.pw, y + gridSpecs.ph + markLen);
        }
      }

      // Draw footer
      if (showFooterNotes) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text('Print at 100% scale. Do not fit to page.', pageW / 2, pageH - margin - 4, { align: 'center' });
      }

      doc.save(getExportFilename());
      setGenerating(false);
      triggerSuccessAnimation();
    };
    img.src = imageData;
  };

  const printSheet = () => {
    if (!imageData) return;
    setGenerating(true);
    const img = new Image();
    img.onload = async () => {
      try {
        const processedData = await applyFilters(img);
        const gridSpecs = getGridSpecs();
        const pageW = gridSpecs.actualPageW;
        const pageH = gridSpecs.actualPageH;
        
        const printWindow = document.createElement('iframe');
        printWindow.style.position = 'fixed';
        printWindow.style.right = '0';
        printWindow.style.bottom = '0';
        printWindow.style.width = '0';
        printWindow.style.height = '0';
        printWindow.style.border = '0';
        document.body.appendChild(printWindow);

        const doc = printWindow.contentDocument || printWindow.contentWindow?.document;
        if (!doc) {
          setGenerating(false);
          return;
        }

        const activeCopies = autoFitA4 ? gridSpecs.maxCapacity : photoCount;

        // Multi-Person Mode: Pre-process all person images
        let rowImageMapPrint: Record<number, string> = {};
        if (isMultiPersonMode && multiPersonImages.length > 0) {
          for (let rowIdx = 0; rowIdx < gridSpecs.rowsCount; rowIdx++) {
            const personImg = multiPersonImages[rowIdx % multiPersonImages.length];
            if (personImg) {
              rowImageMapPrint[rowIdx] = await processPersonImage(personImg);
            } else {
              rowImageMapPrint[rowIdx] = processedData;
            }
          }
        }

        let photoItemsHTML = '';
        for (let i = 0; i < activeCopies; i++) {
          const slotIndex = i + skipCount;
          if (slotIndex >= gridSpecs.colsCount * gridSpecs.rowsCount) break;
          const col = slotIndex % gridSpecs.colsCount;
          const row = Math.floor(slotIndex / gridSpecs.colsCount);
          const x = gridSpecs.startX + col * (gridSpecs.pw + spacing);
          const y = gridSpecs.startY + row * (gridSpecs.ph + spacing);

          // Use per-row image in multi-person mode
          const imageForSlot = (isMultiPersonMode && rowImageMapPrint[row]) ? rowImageMapPrint[row] : processedData;

          let cropMarksHTML = '';
          if (showCropMarks) {
            cropMarksHTML = `
              <!-- Top Left -->
              <div style="position: absolute; left: -2mm; top: 0; width: 2mm; height: 0.08mm; background: #b4b4b4;"></div>
              <div style="position: absolute; left: 0; top: -2mm; width: 0.08mm; height: 2mm; background: #b4b4b4;"></div>
              <!-- Top Right -->
              <div style="position: absolute; right: -2mm; top: 0; width: 2mm; height: 0.08mm; background: #b4b4b4;"></div>
              <div style="position: absolute; right: 0; top: -2mm; width: 0.08mm; height: 2mm; background: #b4b4b4;"></div>
              <!-- Bottom Left -->
              <div style="position: absolute; left: -2mm; bottom: 0; width: 2mm; height: 0.08mm; background: #b4b4b4;"></div>
              <div style="position: absolute; left: 0; bottom: -2mm; width: 0.08mm; height: 2mm; background: #b4b4b4;"></div>
              <!-- Bottom Right -->
              <div style="position: absolute; right: -2mm; bottom: 0; width: 2mm; height: 0.08mm; background: #b4b4b4;"></div>
              <div style="position: absolute; right: 0; bottom: -2mm; width: 0.08mm; height: 2mm; background: #b4b4b4;"></div>
            `;
          }

          photoItemsHTML += `
            <div class="photo-item" style="
              position: absolute;
              left: ${x}mm;
              top: ${y}mm;
              width: ${gridSpecs.pw}mm;
              height: ${gridSpecs.ph}mm;
            ">
              <img src="${imageForSlot}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
              ${cropMarksHTML}
            </div>
          `;
        }

        let headerHTML = '';
        if (showSheetTitle || showPresetInfo || showGenDate) {
          const subtitleParts = [];
          if (showPresetInfo) {
            const presetName = PRESETS[preset as keyof typeof PRESETS]?.name || preset;
            subtitleParts.push(`Preset: ${presetName} (${gridSpecs.pw}x${gridSpecs.ph}mm)`);
          }
          if (showGenDate) {
            const dateStr = new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
            subtitleParts.push(`Generated: ${dateStr}`);
          }

          headerHTML = `
            <div class="header" style="position: absolute; left: 0; width: ${pageW}mm; top: ${margin}mm; text-align: center; height: ${gridSpecs.headerHeight}mm;">
              ${showSheetTitle ? `<h1 style="margin: 0; font-size: 12pt; font-weight: bold; color: #1f2937;">Passport Photo Sheet</h1>` : ''}
              ${subtitleParts.length > 0 ? `<p style="margin: 1.5mm 0 0 0; color: #6b7280; font-size: 8pt;">${subtitleParts.join(' | ')}</p>` : ''}
            </div>
          `;
        }

        let footerHTML = '';
        if (showFooterNotes) {
          footerHTML = `
            <div class="footer" style="position: absolute; left: 0; width: ${pageW}mm; top: ${pageH - margin - 8}mm; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 8pt; font-weight: bold;">Print at 100% scale. Do not fit to page.</p>
            </div>
          `;
        }

        const pageSizeCSS = paperSize === 'a4' 
          ? `size: A4 ${paperOrientation};` 
          : `size: ${pageW}mm ${pageH}mm;`;

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              @page { ${pageSizeCSS} margin: 0; }
              html, body {
                margin: 0; padding: 0;
                width: ${pageW}mm; height: ${pageH}mm;
                font-family: Arial, sans-serif;
                background-color: #ffffff;
              }
              .sheet { width: ${pageW}mm; height: ${pageH}mm; position: relative; }
              .photo-item { box-sizing: border-box; }
            </style>
          </head>
          <body>
            <div class="sheet">
              ${headerHTML}
              <div class="grid-container">
                ${photoItemsHTML}
              </div>
              ${footerHTML}
            </div>
          </body>
          </html>
        `;

        doc.open();
        doc.write(htmlContent);
        doc.close();

        const checkImageLoaded = () => {
          const images = doc.getElementsByTagName('img');
          let allLoaded = true;
          for (let i = 0; i < images.length; i++) {
            if (!images[i].complete) {
              allLoaded = false;
              break;
            }
          }
          if (!allLoaded) {
            setTimeout(checkImageLoaded, 40);
          } else {
            printWindow.contentWindow?.focus();
            printWindow.contentWindow?.print();
            setTimeout(() => {
              if (printWindow.parentNode) {
                document.body.removeChild(printWindow);
              }
              setGenerating(false);
              triggerSuccessAnimation();
            }, 1000);
          }
        };
        checkImageLoaded();
      } catch (err) {
        setGenerating(false);
      }
    };
    img.src = imageData;
  };

  // Derive print mode from toggles
  const getDerivedPrintMode = () => {
    if (!showSheetTitle && !showPresetInfo && !showGenDate && !showFooterNotes) {
      return 'studio';
    }
    if (showSheetTitle && showPresetInfo && showGenDate && showFooterNotes) {
      return 'information';
    }
    if (!showSheetTitle && showPresetInfo && !showGenDate && !showFooterNotes && showCropMarks) {
      return 'compliance';
    }
    return 'custom';
  };

  const printMode = getDerivedPrintMode();

  const handlePrintModeChange = (mode: string) => {
    if (mode === 'studio') {
      onShowSheetTitleChange(false);
      onShowPresetInfoChange(false);
      onShowGenDateChange(false);
      onShowFooterNotesChange(false);
    } else if (mode === 'information') {
      onShowSheetTitleChange(true);
      onShowPresetInfoChange(true);
      onShowGenDateChange(true);
      onShowFooterNotesChange(true);
    } else if (mode === 'compliance') {
      onShowSheetTitleChange(false);
      onShowPresetInfoChange(true);
      onShowGenDateChange(false);
      onShowFooterNotesChange(false);
      onShowCropMarksChange(true);
    }
  };

  const quickChips = [6, 8, 12, 16, 20, 24, 30, 36];

  return (
    <div className="space-y-3 relative select-none">
      {/* Hidden bindings */}
      <button id="download-jpg-hidden-trigger" className="hidden" onClick={downloadJPG} />
      <button id="download-png-hidden-trigger" className="hidden" onClick={downloadPNG} />
      <button id="download-pdf-hidden-trigger" className="hidden" onClick={downloadPDF} />
      <button id="print-sheet-hidden-trigger" className="hidden" onClick={printSheet} />
      <button id="save-project-hidden-trigger" className="hidden" onClick={() => {
        onSaveProject?.();
        triggerSuccessAnimation();
      }} />

      {/* Print settings controls */}
      <div className="bg-card-app border border-border-app rounded-xl p-4 space-y-4">
        
        {/* ⚡ 1-Click Cyber Cafe Quick Print Presets */}
        <div className="flex flex-col gap-1.5 bg-accent-app/10 border border-accent-app/30 p-3 rounded-xl">
          <span className="text-[11px] font-black text-accent-app uppercase tracking-wider flex items-center gap-1 select-none">
            ⚡ 1-Click Cyber Cafe Print Presets
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onPaperSizeChange('4r');
                onPaperOrientationChange('landscape');
                onUseCustomGridChange(false);
                onAutoFitA4Change(false);
                onIsCustomCountChange(false);
                onPhotoCountChange(8);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-card-app hover:bg-accent-app hover:text-white border border-border-app text-[11px] font-bold text-text-primary text-left transition-all cursor-pointer flex items-center justify-between shadow-sm"
              title="Set 4x6 Landscape Sheet with 8 Passport Photos"
            >
              <span>8 Photos (4×6)</span>
              <span className="text-[9px] bg-accent-app/20 px-1.5 py-0.5 rounded font-extrabold">4R</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPaperSizeChange('4r');
                onPaperOrientationChange('landscape');
                onUseCustomGridChange(false);
                onAutoFitA4Change(false);
                onIsCustomCountChange(false);
                onPhotoCountChange(6);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-card-app hover:bg-accent-app hover:text-white border border-border-app text-[11px] font-bold text-text-primary text-left transition-all cursor-pointer flex items-center justify-between shadow-sm"
              title="Set 4x6 Landscape Sheet with 6 Passport Photos"
            >
              <span>6 Photos (4×6)</span>
              <span className="text-[9px] bg-accent-app/20 px-1.5 py-0.5 rounded font-extrabold">4R</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPaperSizeChange('a4');
                onPaperOrientationChange('portrait');
                onUseCustomGridChange(false);
                onAutoFitA4Change(false);
                onIsCustomCountChange(false);
                onPhotoCountChange(30);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-card-app hover:bg-accent-app hover:text-white border border-border-app text-[11px] font-bold text-text-primary text-left transition-all cursor-pointer flex items-center justify-between shadow-sm"
              title="Set A4 Portrait Sheet with 30 Passport Photos"
            >
              <span>30 Photos (A4)</span>
              <span className="text-[9px] bg-accent-app/20 px-1.5 py-0.5 rounded font-extrabold">A4</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onPaperSizeChange('a4');
                onPaperOrientationChange('portrait');
                onUseCustomGridChange(false);
                onAutoFitA4Change(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-card-app hover:bg-accent-app hover:text-white border border-border-app text-[11px] font-bold text-text-primary text-left transition-all cursor-pointer flex items-center justify-between shadow-sm"
              title="Set Full A4 Sheet Auto-Fit Grid"
            >
              <span>Full Sheet (A4)</span>
              <span className="text-[9px] bg-accent-app/20 px-1.5 py-0.5 rounded font-extrabold">Auto</span>
            </button>
          </div>
        </div>

        {/* Layout Mode Presets */}
        <div className="flex flex-col gap-1.5">
          <label className="app-label flex items-center gap-1.5">
            <FiSliders className="w-4 h-4 text-accent-app" /> Print Layout Mode
          </label>
          <div className="relative">
            <select
              value={printMode}
              onChange={(e) => handlePrintModeChange(e.target.value)}
              className="w-full min-h-[48px] bg-panel-app border border-border-app text-text-primary text-[15px] font-semibold rounded-xl pl-4 pr-10 py-2 outline-none focus:border-accent-app cursor-pointer appearance-none shadow-inner"
            >
              <option value="studio">Studio Mode (Maximum Photos)</option>
              <option value="information">Information Mode (With Metadata)</option>
              <option value="compliance">Compliance Mode (Preset & Crop Marks)</option>
              <option value="custom">Custom Mode...</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Paper Size Selector */}
        <div className="flex flex-col gap-1.5 animate-fadeIn">
          <label className="app-label flex items-center gap-1.5">
            <FiFileText className="w-4 h-4 text-accent-app" /> Paper Size
          </label>
          <div className="relative">
            <select
              value={paperSize}
              onChange={(e) => onPaperSizeChange(e.target.value as 'a4' | '4r')}
              className="w-full min-h-[48px] bg-panel-app border border-border-app text-text-primary text-[15px] font-semibold rounded-xl pl-4 pr-10 py-2 outline-none focus:border-accent-app cursor-pointer appearance-none shadow-inner"
            >
              <option value="a4">A4 Sheet (210×297 mm)</option>
              <option value="4r">4R Size Sheet (102×152 mm / 4×6 in)</option>
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Orientation Selector — Only shown for 4R paper */}
        {paperSize === '4r' && (
          <div className="flex flex-col gap-1.5 animate-fadeIn">
            <label className="app-label flex items-center gap-1.5">
              <BiMoveHorizontal className="w-4 h-4 text-accent-app" /> 4R Orientation
            </label>
            <div className="relative">
              <select
                value={paperOrientation}
                onChange={(e) => onPaperOrientationChange(e.target.value as 'portrait' | 'landscape')}
                className="w-full min-h-[48px] bg-panel-app border border-border-app text-text-primary text-[15px] font-semibold rounded-xl pl-4 pr-10 py-2 outline-none focus:border-accent-app cursor-pointer appearance-none shadow-inner"
              >
                <option value="portrait">
                  Portrait — {photoCount === 8 ? '2×4 Grid (8 Photos)' : '2×3 Grid (6 Photos)'}
                </option>
                <option value="landscape">
                  Landscape — {photoCount === 8 ? '4×2 Grid (8 Photos)' : '3×2 Grid (6 Photos)'}
                </option>
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
                <FiChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* Copies selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="app-label flex items-center gap-1.5">
              <FiBarChart2 className="w-4 h-4 text-accent-app" /> Copies Count
            </label>
            <span className="text-[13px] font-bold text-accent-app bg-accent-app/10 px-2 py-0.5 rounded-md">
              {autoFitA4 ? `${specs.maxCapacity} (Auto)` : `${photoCount} Copies`}
            </span>
          </div>
          <div className="relative">
            <select
              value={paperSize === '4r' ? photoCount : (autoFitA4 ? 'auto' : (isCustomCount ? 'custom' : photoCount))}
              onChange={(e) => {
                const val = e.target.value;
                if (paperSize === '4r') {
                  onAutoFitA4Change(false);
                  onIsCustomCountChange(false);
                  onPhotoCountChange(Number(val));
                } else {
                  if (val === 'auto') {
                    onAutoFitA4Change(true);
                  } else if (val === 'custom') {
                    onAutoFitA4Change(false);
                    onIsCustomCountChange(true);
                    onPhotoCountChange(customCount);
                  } else {
                    onAutoFitA4Change(false);
                    onIsCustomCountChange(false);
                    onPhotoCountChange(Number(val));
                  }
                }
              }}
              className="w-full min-h-[48px] bg-panel-app border border-border-app text-text-primary text-[15px] font-semibold rounded-xl pl-4 pr-10 py-2 outline-none focus:border-accent-app cursor-pointer appearance-none shadow-inner"
            >
              {paperSize === '4r' ? (
                <>
                  <option value={6}>6 Photos</option>
                  <option value={8}>8 Photos</option>
                </>
              ) : (
                <>
                  <option value="auto">Auto Fit Paper ({specs.maxCapacity} Photos)</option>
                  {quickChips.map((val) => {
                    if (val > specs.maxCapacity) return null;
                    return (
                      <option key={val} value={val}>
                        {val} Photos ({Math.ceil(val / specs.colsCount)} rows)
                      </option>
                    );
                  })}
                  <option value="custom" className="text-accent-app font-bold">Custom Count...</option>
                </>
              )}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
              <FiChevronDown className="w-4 h-4" />
            </div>
          </div>

          {/* Quick Selection chips */}
          <div className="flex flex-wrap gap-2 my-1 select-none">
            {paperSize === '4r' ? (
              [6, 8].map((num) => {
                const isActive = photoCount === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      onAutoFitA4Change(false);
                      onIsCustomCountChange(false);
                      onPhotoCountChange(num);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-accent-app text-white border-accent-app'
                        : 'bg-card-app hover:bg-panel-app border-border-app text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {num} Photos
                  </button>
                );
              })
            ) : (
              <>
                {quickChips.map((num) => {
                  if (num > specs.maxCapacity) return null;
                  const isActive = !autoFitA4 && photoCount === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        onAutoFitA4Change(false);
                        selectCopies(num);
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-accent-app text-white border-accent-app'
                          : 'bg-card-app hover:bg-panel-app border-border-app text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {num}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    onAutoFitA4Change(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                    autoFitA4
                      ? 'bg-accent-app text-white border-accent-app'
                      : 'bg-card-app hover:bg-panel-app border-border-app text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Auto Fit ({specs.maxCapacity})
                </button>
              </>
            )}
          </div>
          
          {!autoFitA4 && isCustomCount && paperSize !== '4r' && (
            <div className="mt-1">
              <input
                type="number"
                min={1}
                max={specs.maxCapacity}
                value={customCount}
                onChange={(e) => {
                  const val = Math.min(specs.maxCapacity, Math.max(1, Number(e.target.value)));
                  onCustomCountChange(val);
                  onPhotoCountChange(val);
                }}
                className="w-full min-h-[44px] px-3 bg-bg-app border border-border-app rounded-lg text-text-primary font-semibold text-[15px]"
                placeholder={`Enter custom copies (1-${specs.maxCapacity})`}
              />
            </div>
          )}
        </div>

        {/* Grid Layout Mode / Customization */}
        <div className="bg-panel-app/60 border border-border-app rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="app-label flex items-center gap-1.5 font-bold text-accent-app">
              <FiLayout className="w-4 h-4" /> Grid Layout Mode
            </label>
            <div className="flex rounded-lg overflow-hidden border border-border-app">
              <button
                type="button"
                onClick={() => {
                  onUseCustomGridChange(false);
                  onAutoFitA4Change(false);
                }}
                className={`px-3 py-1 text-[11px] font-bold cursor-pointer transition-all ${
                  !useCustomGrid 
                    ? 'bg-accent-app text-white' 
                    : 'bg-card-app text-text-secondary hover:text-text-primary'
                }`}
              >
                Auto-Fit
              </button>
              <button
                type="button"
                onClick={() => {
                  onUseCustomGridChange(true);
                }}
                className={`px-3 py-1 text-[11px] font-bold cursor-pointer transition-all ${
                  useCustomGrid 
                    ? 'bg-accent-app text-white' 
                    : 'bg-card-app text-text-secondary hover:text-text-primary'
                }`}
              >
                Custom Grid
              </button>
            </div>
          </div>

          {useCustomGrid && (
            <div className="space-y-3 pt-2.5 border-t border-border-app/40 animate-fadeIn">
              <p className="text-[10px] text-accent-app font-semibold pl-0.5">
                Note: Photos automatically resize to fit your specified grid rows/columns.
              </p>
              
              {/* Columns Slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center pl-0.5">
                  <span className="text-[11px] font-black text-neutral-400 uppercase tracking-widest">Columns (Photos per Row)</span>
                  <span className="text-xs font-black text-text-primary">{customGridCols}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={customGridCols}
                  onChange={(e) => onCustomGridColsChange(Number(e.target.value))}
                  className="w-full cursor-pointer accent-accent-app"
                />
              </div>

              {/* Rows Slider */}
              <div className="space-y-1">
                <div className="flex justify-between items-center pl-0.5">
                  <span className="text-[11px] font-black text-neutral-400 uppercase tracking-widest">Rows (Photos per Column)</span>
                  <span className="text-xs font-black text-text-primary">{customGridRows}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={customGridRows}
                  onChange={(e) => onCustomGridRowsChange(Number(e.target.value))}
                  className="w-full cursor-pointer accent-accent-app"
                />
              </div>

              {/* Quick Grid Config Options */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { label: '6×6 Grid (A4)', cols: 6, rows: 6 },
                  { label: '4×2 Grid (4R)', cols: 4, rows: 2 },
                  { label: '5×5 Grid', cols: 5, rows: 5 },
                  { label: '4×4 Grid', cols: 4, rows: 4 },
                ].map((g) => {
                  const isActive = customGridCols === g.cols && customGridRows === g.rows;
                  return (
                    <button
                      key={g.label}
                      type="button"
                      onClick={() => {
                        onCustomGridColsChange(g.cols);
                        onCustomGridRowsChange(g.rows);
                      }}
                      className={`py-1 px-2 rounded-md border text-[9px] font-bold transition-all text-center cursor-pointer select-none ${
                        isActive 
                          ? 'bg-accent-app text-white border-accent-app' 
                          : 'bg-card-app border-border-app text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Page Margin Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span className="app-label flex items-center gap-1.5">
              <FiSliders className="w-4 h-4 text-accent-app" /> Page Margin
            </span>
            <span className="text-[13px] font-bold text-text-primary">{margin} mm</span>
          </div>
          <input
            type="range"
            min={2}
            max={25}
            step={1}
            value={margin}
            onChange={(e) => onMarginChange(Number(e.target.value))}
            className="w-full cursor-pointer accent-accent-app"
          />
        </div>

        {/* Gap Spacing Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span className="app-label flex items-center gap-1.5">
              <BiMoveHorizontal className="w-4 h-4 text-accent-app" /> Gap Between Photos
            </span>
            <span className="text-[13px] font-bold text-text-primary">{spacing} mm</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={spacing}
            onChange={(e) => onSpacingChange(Number(e.target.value))}
            className="w-full cursor-pointer accent-accent-app"
          />
        </div>

        {/* Photo Border Settings */}
        <div className="bg-panel-app/60 border border-border-app rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="enable-border-cb" className="app-label flex items-center gap-1.5 font-bold text-accent-app cursor-pointer">
              <FiCheckCircle className="w-4 h-4" /> Photo Border
            </label>
            <input
              type="checkbox"
              id="enable-border-cb"
              checked={showBorder}
              onChange={(e) => onShowBorderChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          {showBorder && (
            <div className="space-y-3 pt-2.5 border-t border-border-app/40 animate-fadeIn">
              {/* Border Color */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                  Border Color
                </span>
                <div className="flex items-center gap-2">
                  {[
                    { name: 'Black', value: '#000000' },
                    { name: 'Dark Gray', value: '#374151' },
                    { name: 'Light Gray', value: '#D1D5DB' },
                    { name: 'White', value: '#FFFFFF' },
                  ].map((color) => {
                    const isActive = borderColor.toUpperCase() === color.value.toUpperCase();
                    return (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => onBorderColorChange(color.value)}
                        title={color.name}
                        className={`w-6 h-6 rounded-full border transition-all cursor-pointer relative ${
                          isActive 
                            ? 'border-accent-app scale-110 ring-2 ring-accent-app/20' 
                            : 'border-border-app hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.value }}
                      >
                        {isActive && (
                          <span className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-accent-app" />
                        )}
                      </button>
                    );
                  })}
                  
                  {/* Custom color picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById('border-color-picker')?.click();
                      }}
                      className="w-6 h-6 rounded-full border border-border-app flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-amber-500 to-pink-500 cursor-pointer hover:scale-105"
                    >
                      {!['#000000', '#374151', '#D1D5DB', '#FFFFFF'].includes(borderColor.toUpperCase()) && (
                        <span className="w-4.5 h-4.5 rounded-full border border-white/40" style={{ backgroundColor: borderColor }} />
                      )}
                    </button>
                    <input
                      id="border-color-picker"
                      type="color"
                      value={borderColor}
                      onChange={(e) => onBorderColorChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-6 h-6 pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              {/* Border Thickness */}
              <div className="space-y-1">
                <div className="flex justify-between items-center pl-0.5">
                  <span className="text-[11px] font-black text-neutral-400 uppercase tracking-widest">Border Size</span>
                  <span className="text-xs font-black text-text-primary">{borderSize} mm</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={2.0}
                  step={0.1}
                  value={borderSize}
                  onChange={(e) => onBorderSizeChange(Number(e.target.value))}
                  className="w-full cursor-pointer accent-accent-app"
                />
              </div>
            </div>
          )}
        </div>

        {/* Skip Slots Selector */}
        {skipMode === 'custom' && (
          <div className="flex flex-col gap-1.5">
            <label className="app-label flex items-center gap-1.5">
              <FaRuler className="w-4 h-4 text-accent-app" /> Skip Slots
            </label>
            <input
              type="number"
              min={0}
              max={specs.maxCapacity - 1}
              value={customSkip}
              onChange={(e) => handleCustomSkipChange(Number(e.target.value))}
              className="w-full min-h-[44px] px-3 bg-bg-app border border-border-app rounded-lg text-text-primary font-semibold text-[15px]"
              placeholder="Enter slots to skip"
            />
          </div>
        )}

        {/* Header / Footer detail toggles */}
        <div className="space-y-3 pt-3 border-t border-border-app">
          
          <div className="flex items-center justify-between select-none">
            <label htmlFor="show-crop-marks-cb" className="app-label flex items-center gap-2 cursor-pointer text-sm">
              <FiCheckCircle className="w-4 h-4 text-text-secondary" /> Show Crop Marks
            </label>
            <input
              id="show-crop-marks-cb"
              type="checkbox"
              checked={showCropMarks}
              onChange={(e) => onShowCropMarksChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between select-none">
            <label htmlFor="show-title-cb" className="app-label flex items-center gap-2 cursor-pointer text-sm">
              <FiType className="w-4 h-4 text-text-secondary" /> Show Sheet Title
            </label>
            <input
              id="show-title-cb"
              type="checkbox"
              checked={showSheetTitle}
              onChange={(e) => onShowSheetTitleChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between select-none">
            <label htmlFor="show-preset-cb" className="app-label flex items-center gap-2 cursor-pointer text-sm">
              <FiInfo className="w-4 h-4 text-text-secondary" /> Show Preset Information
            </label>
            <input
              id="show-preset-cb"
              type="checkbox"
              checked={showPresetInfo}
              onChange={(e) => onShowPresetInfoChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between select-none">
            <label htmlFor="show-date-cb" className="app-label flex items-center gap-2 cursor-pointer text-sm">
              <FiCalendar className="w-4 h-4 text-text-secondary" /> Show Generation Date
            </label>
            <input
              id="show-date-cb"
              type="checkbox"
              checked={showGenDate}
              onChange={(e) => onShowGenDateChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border-app pt-3 select-none">
            <label htmlFor="show-footer-cb" className="app-label flex items-center gap-2 cursor-pointer text-sm">
              <FiFile className="w-4 h-4 text-text-secondary" /> Show Footer Notes
            </label>
            <input
              id="show-footer-cb"
              type="checkbox"
              checked={showFooterNotes}
              onChange={(e) => onShowFooterNotesChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

        </div>

        {/* Target KB Size Compressor */}
        <div className="bg-panel-app/50 border border-border-app rounded-xl p-3 space-y-3 pt-3 mt-1">
          <div className="flex items-center justify-between">
            <label htmlFor="kb-compress-cb" className="app-label flex items-center gap-1.5 font-bold text-accent-app cursor-pointer">
              <FiDownload className="w-4 h-4" /> Size Optimizer (KB)
            </label>
            <input
              type="checkbox"
              id="kb-compress-cb"
              checked={compressToKB}
              onChange={(e) => {
                setCompressToKB(e.target.checked);
                if (e.target.checked && compressPreset === 'none') {
                  setCompressPreset('50kb');
                  setTargetKB(50);
                } else if (!e.target.checked) {
                  setCompressPreset('none');
                }
              }}
              className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
            />
          </div>

          {compressToKB && (
            <div className="space-y-3 pt-2.5 border-t border-border-app/40 animate-fadeIn">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                  Govt Portal Limit
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '20kb', label: 'Max 20KB', value: 20 },
                    { id: '50kb', label: 'Max 50KB', value: 50 },
                    { id: 'custom', label: 'Custom...', value: targetKB },
                  ].map((p) => {
                    const isActive = compressPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setCompressPreset(p.id as any);
                          if (p.id !== 'custom') {
                            setTargetKB(p.value);
                          }
                        }}
                        className={`py-1.5 px-1 rounded-lg border text-[11px] font-bold transition-all text-center cursor-pointer select-none ${
                          isActive 
                            ? 'bg-accent-app/15 border-accent-app text-accent-app' 
                            : 'bg-card-app border-border-app text-text-secondary hover:text-text-primary hover:bg-panel-app'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {compressPreset === 'custom' && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center pl-0.5">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Max Size Limit</span>
                    <span className="text-xs font-black text-text-primary">{targetKB} KB</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={targetKB}
                    onChange={(e) => setTargetKB(Number(e.target.value))}
                    className="w-full cursor-pointer accent-accent-app"
                  />
                </div>
              )}
              
              <p className="text-[10px] text-neutral-500 font-semibold leading-relaxed pl-0.5">
                Compresses Jpeg quality & dims dynamically to guarantee it stays under {targetKB}KB.
              </p>
            </div>
          )}
        </div>

        {/* Multi-Person Mode (A4 only) */}
        {paperSize === 'a4' && (
          <div className="bg-panel-app/60 border border-border-app rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="multi-person-cb" className="app-label flex items-center gap-1.5 font-bold text-accent-app cursor-pointer">
                <FiUsers className="w-4 h-4" /> Multi-Person Sheet
              </label>
              <input
                type="checkbox"
                id="multi-person-cb"
                checked={isMultiPersonMode}
                onChange={(e) => onMultiPersonModeChange(e.target.checked)}
                className="w-5 h-5 accent-accent-app rounded border-border-app cursor-pointer"
              />
            </div>
            {isMultiPersonMode && (
              <div className="animate-fadeIn mt-2 pt-2 border-t border-border-app/40">
                <MultiPersonPanel
                  isMultiPersonMode={isMultiPersonMode}
                  onMultiPersonModeChange={onMultiPersonModeChange}
                  multiPersonImages={multiPersonImages}
                  onMultiPersonImagesChange={onMultiPersonImagesChange}
                  bgColor={bgColor}
                  maxRows={specs.rowsCount}
                />
              </div>
            )}
          </div>
        )}

        {/* Action buttons (Direct exports) */}
        <div className="space-y-3 pt-4 border-t border-border-app">
          <button
            onClick={downloadJPG}
            disabled={generating || !imageData}
            className="studio-btn studio-btn-primary flex items-center justify-center gap-2 w-full text-[14px] font-black uppercase tracking-wider py-3 rounded-xl shadow-lg shadow-accent-app/10 cursor-pointer transition-all active:scale-98"
          >
            <FiImage className="w-5 h-5" /> Download Single Photo (JPEG)
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={downloadPDF}
              disabled={generating || !imageData}
              className="studio-btn studio-btn-secondary flex items-center justify-center gap-2 w-full text-xs py-2.5 rounded-xl cursor-pointer"
            >
              <FiDownload className="w-4 h-4" /> Export PDF Sheet
            </button>
            <button
              onClick={printSheet}
              disabled={generating || !imageData}
              className="studio-btn studio-btn-secondary flex items-center justify-center gap-2 w-full text-xs py-2.5 rounded-xl cursor-pointer"
            >
              <FiPrinter className="w-4 h-4" /> Print Sheet
            </button>
          </div>
        </div>

      </div>

      {/* Trigger CTA triggers on Success Page */}
      {showExportSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
          <div className="bg-panel-app border border-border-app rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full mx-4 animate-in zoom-in-95 duration-250">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 text-success-app rounded-full flex items-center justify-center">
              <FiCheckCircle className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-[18px] font-bold text-text-primary uppercase tracking-wider">Sheet compiled</h4>
              <p className="text-[14px] text-text-secondary mt-1 font-semibold">DPI scales adjusted. Check downloads folder.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
