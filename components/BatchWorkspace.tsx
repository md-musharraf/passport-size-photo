'use client';
import React, { useState, useEffect, useRef } from 'react';
import { 
  FiPrinter, FiDownload, FiTrash2, FiEdit2, FiPlus, 
  FiMove, FiChevronLeft, FiChevronRight, FiUsers, FiSliders,
  FiLoader, FiCheckCircle, FiAlertCircle
} from 'react-icons/fi';
import { BsStars } from 'react-icons/bs';
import { FaRuler } from 'react-icons/fa';
import { PRESETS, PRESET_PIXELS } from '@/lib/presets';
import { getPreset } from '@/lib/presets';
import { computePassportAlignment } from '@/lib/faceAlign';
import { analyzeFace } from '@/lib/faceLandmarker';
import { removeBackground } from '@/lib/backgroundRemoval';
import { importImageFile } from '@/lib/imageImport';
import BatchEditModal from './BatchEditModal';
import { loadJsPDF, preloadJsPDF } from '@/lib/pdf';
import { toast } from '@/lib/toast';

export interface BatchItem {
  id: string;
  name: string;
  originalImage: string;
  processedImage: string | null;
  croppedImage: string | null;
  status: 'pending' | 'bg-removing' | 'face-detecting' | 'ready' | 'error';
  progress: number;
  cropScale: number;
  cropPosition: { x: number; y: number };
  rotation: number;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  temperature: number;
  clothingTemplate: 'none' | 'suit_male' | 'suit_female' | 'tuxedo';
  clothingScale: number;
  clothingPosition: { x: number; y: number };
  clothingRotation: number;
}

interface BatchWorkspaceProps {
  batchItems: BatchItem[];
  onBatchItemsChange: React.Dispatch<React.SetStateAction<BatchItem[]>>;
  preset: string;
  onPresetChange: (preset: string) => void;
  bgColor: string;
  onBgColorChange: (color: string) => void;
  showBorder: boolean;
  onShowBorderChange: (val: boolean) => void;
  borderColor: string;
  onBorderColorChange: (val: string) => void;
  borderSize: number;
  onBorderSizeChange: (val: number) => void;
  spacing: number;
  onSpacingChange: (val: number) => void;
  margin: number;
  onMarginChange: (val: number) => void;
  onExportSuccess?: () => void;
}

export function renderPassportItem(
  item: BatchItem,
  specs: { widthPx: number; heightPx: number; widthMm: number; heightMm: number },
  bgColor: string,
  showBorder: boolean,
  borderColor: string,
  borderSize: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(item.originalImage);
        return;
      }

      const scaleMultiplier = 3;
      canvas.width = specs.widthPx * scaleMultiplier;
      canvas.height = specs.heightPx * scaleMultiplier;

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      let filterString = `brightness(${item.brightness}%) contrast(${item.contrast}%) saturate(${item.saturation}%) brightness(${item.exposure}%)`;
      ctx.filter = filterString;

      const scaleX = canvas.width / img.width;
      const scaleY = canvas.height / img.height;
      const fitScale = Math.max(scaleX, scaleY);
      const wFit = img.width * fitScale;
      const hFit = img.height * fitScale;

      const canvasCenterX = canvas.width / 2;
      const canvasCenterY = canvas.height / 2;
      ctx.translate(canvasCenterX, canvasCenterY);

      const offsetX = ((50 - item.cropPosition.x) / 100) * canvas.width;
      const offsetY = ((50 - item.cropPosition.y) / 100) * canvas.height;
      ctx.translate(offsetX, offsetY);

      const scaleVal = item.cropScale / 100;
      ctx.scale(scaleVal, scaleVal);
      ctx.rotate((item.rotation * Math.PI) / 180);

      ctx.drawImage(img, -wFit / 2, -hFit / 2, wFit, hFit);
      ctx.restore();

      if (item.temperature !== 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = item.temperature > 0 
          ? `rgba(245, 158, 11, ${Math.abs(item.temperature) / 250})`
          : `rgba(59, 130, 246, ${Math.abs(item.temperature) / 250})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      const handleResolve = () => {
        if (showBorder) {
          ctx.save();
          ctx.strokeStyle = borderColor;
          const borderThicknessPx = (borderSize / specs.widthMm) * canvas.width;
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

      if (item.clothingTemplate !== 'none') {
        const clothImg = new Image();
        clothImg.onload = () => {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.translate(canvasCenterX, canvasCenterY);

          const clothOffsetX = ((item.clothingPosition.x - 50) / 100) * canvas.width;
          const clothOffsetY = ((item.clothingPosition.y - 50) / 100) * canvas.height;
          ctx.translate(clothOffsetX, clothOffsetY);

          const clothScaleVal = item.clothingScale / 100;
          ctx.scale(clothScaleVal, clothScaleVal);
          ctx.rotate((item.clothingRotation * Math.PI) / 180);

          const wCloth = canvas.width;
          const hCloth = canvas.height;
          ctx.drawImage(clothImg, -wCloth / 2, -hCloth / 2, wCloth, hCloth);
          ctx.restore();
          
          handleResolve();
        };
        clothImg.onerror = () => {
          handleResolve();
        };
        clothImg.src = item.clothingTemplate === 'suit_male' ? 'clothing/suit_male.png'
                     : item.clothingTemplate === 'suit_female' ? 'clothing/suit_female.png'
                     : 'clothing/tuxedo.png';
      } else {
        handleResolve();
      }
    };
    img.onerror = () => resolve(item.originalImage);
    img.src = item.processedImage || item.originalImage;
  });
}

export default function BatchWorkspace({
  batchItems,
  onBatchItemsChange,
  preset,
  onPresetChange,
  bgColor,
  onBgColorChange,
  showBorder,
  onShowBorderChange,
  borderColor,
  onBorderColorChange,
  borderSize,
  onBorderSizeChange,
  spacing,
  onSpacingChange,
  margin,
  onMarginChange,
  onExportSuccess,
}: BatchWorkspaceProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [editingItem, setEditingItem] = useState<BatchItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // HTML5 Drag and Drop index tracker
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const currentPresetSpecs = PRESET_PIXELS[preset as keyof typeof PRESET_PIXELS] || PRESET_PIXELS.us;

  // The PDF library is loaded on demand; fetch it now so Export is instant.
  useEffect(() => {
    preloadJsPDF();
  }, []);

  // Render composite image reactive trigger
  useEffect(() => {
    const renderAllReady = async () => {
      let changed = false;
      const updated = await Promise.all(
        batchItems.map(async (item) => {
          if (item.status === 'ready' && !item.croppedImage) {
            const cropped = await renderPassportItem(
              item,
              currentPresetSpecs,
              bgColor,
              showBorder,
              borderColor,
              borderSize
            );
            changed = true;
            return { ...item, croppedImage: cropped };
          }
          return item;
        })
      );
      if (changed) {
        onBatchItemsChange(updated);
      }
    };
    renderAllReady();
  }, [batchItems, preset, bgColor, showBorder, borderColor, borderSize]);

  // Per-item AI pipeline for newly added files: background removal -> face
  // alignment -> composite render. Runs once per item as its image finishes loading.
  const triggerItemAI = async (item: BatchItem) => {
    const updateItem = (updates: Partial<BatchItem>) => {
      onBatchItemsChange(prev => prev.map(it => it.id === item.id ? { ...it, ...updates } : it));
    };

    // 0. Remove the background first. Calls are globally serialised inside
    //    removeBackground(), so dropping several photos at once no longer fires
    //    concurrent model sessions (which previously made batch removal fail).
    let cutoutImage: string | null = null;
    updateItem({ status: 'bg-removing', progress: 5 });
    try {
      cutoutImage = await removeBackground(
        item.originalImage,
        'auto',
        (p) => updateItem({ status: 'bg-removing', progress: Math.max(5, Math.round(p * 0.9)) }),
      );
      updateItem({ processedImage: cutoutImage, progress: 95 });
    } catch (bgErr) {
      // Non-fatal: keep the original photo (with background) and carry on so the
      // person still appears in the queue instead of vanishing.
      console.warn('Background removal failed for batch item, keeping original:', bgErr);
    }

    const workingItem: BatchItem = { ...item, processedImage: cutoutImage ?? item.processedImage };

    updateItem({ status: 'face-detecting', progress: 96 });

    try {
      // 1. Face alignment via MediaPipe Face Landmarker
      let faceCropPos = { x: 50, y: 50 };
      let faceCropScale = 100;
      let faceRotation = 0;

      try {
        // Detect on the cut-out when we have one: its alpha mask gives the
        // true top of the head for accurate head sizing.
        const face = await analyzeFace(workingItem.processedImage ?? item.originalImage);
        if (face) {
          const align = computePassportAlignment(face, getPreset(preset));
          faceCropPos = { x: align.cropX, y: align.cropY };
          faceCropScale = align.cropScale;
          faceRotation = align.rotationDeg;
        }
      } catch (faceErr) {
        console.warn('Face detection error for batch item:', faceErr);
      }

      // 2. Compile composite (workingItem carries the background-removed cutout)
      const tempItem: BatchItem = {
        ...workingItem,
        cropPosition: faceCropPos,
        cropScale: faceCropScale,
        rotation: faceRotation,
        status: 'ready',
      };

      const finalCropped = await renderPassportItem(
        tempItem,
        currentPresetSpecs,
        bgColor,
        showBorder,
        borderColor,
        borderSize
      );

      updateItem({
        cropPosition: faceCropPos,
        cropScale: faceCropScale,
        rotation: faceRotation,
        croppedImage: finalCropped,
        status: 'ready',
        progress: 100
      });

    } catch (err) {
      console.error('Processing failed for batch item:', err);
      const tempItem: BatchItem = {
        ...workingItem,
        status: 'ready',
      };
      const finalCropped = await renderPassportItem(
        tempItem,
        currentPresetSpecs,
        bgColor,
        showBorder,
        borderColor,
        borderSize
      );
      updateItem({
        croppedImage: finalCropped,
        status: 'ready',
        progress: 100
      });
    }
  };

  // Items can arrive already loaded but unprocessed — e.g. several photos
  // chosen together on the start screen, or a restored session. Start the AI
  // pipeline for each of those exactly once (it previously never ran for
  // them, leaving the queue stuck on "Calibrating face").
  const startedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const item of batchItems) {
      if (item.status === 'pending' && item.originalImage && !startedRef.current.has(item.id)) {
        startedRef.current.add(item.id);
        triggerItemAI(item);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchItems]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addFilesToBatch(Array.from(files));
    e.target.value = '';
  };

  const addFilesToBatch = (files: File[]) => {
    const newItems = files.map((file, idx) => {
      const id = Math.random().toString(36).substring(7);
      const item: BatchItem = {
        id,
        name: file.name.split('.')[0] || `Person ${batchItems.length + idx + 1}`,
        originalImage: '',
        processedImage: null,
        croppedImage: null,
        status: 'pending',
        progress: 0,
        cropScale: 100,
        cropPosition: { x: 50, y: 50 },
        rotation: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        exposure: 100,
        temperature: 0,
        clothingTemplate: 'none',
        clothingScale: 100,
        clothingPosition: { x: 50, y: 55 },
        clothingRotation: 0,
      };

      // Upright + print-size capped, then run the AI pipeline. The pipeline is
      // started outside the state updater (updaters must stay side-effect free).
      importImageFile(file)
        .then((dataUrl) => {
          startedRef.current.add(id);
          onBatchItemsChange(prev => prev.map(it => (it.id === id ? { ...it, originalImage: dataUrl } : it)));
          triggerItemAI({ ...item, originalImage: dataUrl });
        })
        .catch(() => {
          onBatchItemsChange(prev => prev.map(it => (it.id === id ? { ...it, status: 'error' } : it)));
        });

      return item;
    });

    onBatchItemsChange(prev => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    onBatchItemsChange(batchItems.filter(item => item.id !== id));
  };

  const openEditModal = (item: BatchItem) => {
    setEditingItem(item);
    setIsEditModalOpen(true);
  };

  const saveEditedItem = async (updatedItem: BatchItem) => {
    // Re-render composite image
    const cropped = await renderPassportItem(
      updatedItem,
      currentPresetSpecs,
      bgColor,
      showBorder,
      borderColor,
      borderSize
    );
    const finalItem = { ...updatedItem, croppedImage: cropped };
    onBatchItemsChange(batchItems.map(it => it.id === updatedItem.id ? finalItem : it));
  };

  // Drag and Drop reordering handlers
  const handleDragStart = (idx: number) => {
    setDraggedIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIdx) return;
    
    // Swap items in state array
    const updated = [...batchItems];
    const draggedItem = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(targetIdx, 0, draggedItem);
    
    setDraggedIndex(targetIdx);
    onBatchItemsChange(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Calculate layout variables
  const rowsPerPage = 6;
  const totalPages = Math.ceil(batchItems.length / rowsPerPage) || 1;
  const visibleItems = batchItems.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

  // Auto-fit calculations for A4 portrait
  // pw = (A4_width - 2*margin - 5*spacing) / 6
  const marginMm = margin;
  const spacingMm = spacing;
  const pageWMm = 210;
  const pageHMm = 297;
  const availableWidth = pageWMm - 2 * marginMm;
  const photoWMm = (availableWidth - 5 * spacingMm) / 6;
  const ratio = currentPresetSpecs.widthMm / currentPresetSpecs.heightMm;
  const photoHMm = photoWMm / ratio;

  // Print PDF logic
  const downloadBatchPDF = async () => {
    if (batchItems.length === 0) return;

    let jsPDF;
    try {
      jsPDF = await loadJsPDF();
    } catch {
      toast('Could not load the PDF exporter. Check your connection and try again.', 'error');
      return;
    }
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) {
        doc.addPage();
      }

      const itemsInPage = batchItems.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);

      itemsInPage.forEach((item, rowIdx) => {
        if (!item.croppedImage) return;

        const y = marginMm + rowIdx * (photoHMm + spacingMm);

        for (let colIdx = 0; colIdx < 6; colIdx++) {
          const x = marginMm + colIdx * (photoWMm + spacingMm);
          doc.addImage(item.croppedImage, 'JPEG', x, y, photoWMm, photoHMm);
        }
      });
    }

    doc.save(`passport-batch-${Date.now()}.pdf`);
    onExportSuccess?.();
  };

  // Print sheets via hidden iframe
  const printBatchSheets = () => {
    if (batchItems.length === 0) return;

    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'fixed';
    printWindow.style.right = '0';
    printWindow.style.bottom = '0';
    printWindow.style.width = '0';
    printWindow.style.height = '0';
    printWindow.style.border = '0';
    document.body.appendChild(printWindow);

    const doc = printWindow.contentDocument || printWindow.contentWindow?.document;
    if (!doc) return;

    let pagesHtml = '';
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const itemsInPage = batchItems.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
      
      let rowsHtml = '';
      itemsInPage.forEach((item) => {
        if (!item.croppedImage) return;

        let cellsHtml = '';
        for (let c = 0; c < 6; c++) {
          cellsHtml += `<img src="${item.croppedImage}" style="width: ${photoWMm}mm; height: ${photoHMm}mm; margin-right: ${spacingMm}mm; border-radius: 0;" />`;
        }

        rowsHtml += `
          <div style="display: flex; margin-bottom: ${spacingMm}mm; height: ${photoHMm}mm;">
            ${cellsHtml}
          </div>
        `;
      });

      pagesHtml += `
        <div style="
          width: ${pageWMm}mm; 
          height: ${pageHMm}mm; 
          padding: ${marginMm}mm; 
          box-sizing: border-box; 
          page-break-after: always;
          background-color: #ffffff;
        ">
          ${rowsHtml}
        </div>
      `;
    }

    doc.write(`
      <html>
        <head>
          <title>Print Passport Photos</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; background-color: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() {
                window.parent.document.body.removeChild(window.frameElement);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden min-h-0">
      
      {/* COLUMN 1: Settings Panel (Left side, 340px) */}
      <aside className="w-full md:w-[320px] bg-panel-app border-r border-border-app p-4 space-y-4 overflow-y-auto select-none shrink-0">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-accent-app uppercase tracking-widest flex items-center gap-1.5">
            <FiSliders className="w-4 h-4" /> Layout Settings
          </h3>
          <p className="text-[10px] text-text-secondary">Configure sizing and sheet margins.</p>
        </div>

        {/* Presets */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">Photo Size Preset</label>
          <select
            value={preset}
            onChange={(e) => onPresetChange(e.target.value)}
            className="w-full min-h-[40px] px-3 bg-card-app border border-border-app rounded-xl text-text-primary text-[13px] font-bold outline-none focus:border-accent-app cursor-pointer"
          >
            {Object.entries(PRESETS).map(([key, value]) => (
              <option key={key} value={key} className="bg-panel-app">{value.name} ({value.width}x{value.height}mm)</option>
            ))}
          </select>
        </div>

        {/* Background Color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">Background Color</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'White', color: '#FFFFFF' },
              { label: 'Royal', color: '#0F2C59' },
              { label: 'Sky', color: '#A1CAF1' },
              { label: 'Blue', color: '#3182CE' }
            ].map((c) => (
              <button
                key={c.label}
                onClick={() => onBgColorChange(c.color)}
                className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                  bgColor === c.color 
                    ? 'border-accent-app bg-accent-app/10 text-accent-app font-black shadow-inner shadow-accent-app/5' 
                    : 'border-border-app bg-card-app text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="w-3.5 h-3.5 mx-auto rounded border border-black/10 mb-1" style={{ backgroundColor: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photo Border */}
        <div className="border-t border-border-app/40 pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-black text-neutral-400 uppercase tracking-wider">Photo Cut Border</label>
            <input
              type="checkbox"
              checked={showBorder}
              onChange={(e) => onShowBorderChange(e.target.checked)}
              className="w-5 h-5 accent-accent-app cursor-pointer"
            />
          </div>

          {showBorder && (
            <div className="space-y-3.5 pl-0.5 animate-fadeIn">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-[11px] font-bold text-text-secondary">
                  <span>Border Size</span>
                  <span className="text-accent-app">{borderSize} mm</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  value={borderSize}
                  onChange={(e) => onBorderSizeChange(Number(e.target.value))}
                  className="w-full accent-accent-app cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-neutral-400">Border Color</label>
                <div className="flex gap-2">
                  {['#000000', '#CBCBCB', '#F3F4F6'].map((color) => (
                    <button
                      key={color}
                      onClick={() => onBorderColorChange(color)}
                      className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                        borderColor === color ? 'border-accent-app ring-2 ring-accent-app/20 scale-110' : 'border-border-app'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Margins and Spacing */}
        <div className="border-t border-border-app/40 pt-3 space-y-3">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-bold text-text-secondary">
              <span>Grid Gap (Spacing)</span>
              <span className="text-accent-app">{spacing} mm</span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={spacing}
              onChange={(e) => onSpacingChange(Number(e.target.value))}
              className="w-full accent-accent-app cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-[11px] font-bold text-text-secondary">
              <span>Page Margin</span>
              <span className="text-accent-app">{margin} mm</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="0.5"
              value={margin}
              onChange={(e) => onMarginChange(Number(e.target.value))}
              className="w-full accent-accent-app cursor-pointer"
            />
          </div>
        </div>
      </aside>

      {/* COLUMN 2: Batch List (Center panel, flex-1) */}
      <section className="flex-1 bg-bg-app border-r border-border-app p-4 flex flex-col min-h-0 select-none">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-widest">
              <FiUsers className="w-4 h-4 text-accent-app animate-pulse" /> Batch Queue ({batchItems.length} persons)
            </h2>
            <p className="text-[10px] text-text-secondary">Drag rows to reorder. Processed in parallel automatically.</p>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="studio-btn studio-btn-primary py-1 px-3 text-xs"
          >
            <FiPlus className="w-3.5 h-3.5 mr-1" /> Add Photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Drag and Drop Queue Area */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {batchItems.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="h-full min-h-[300px] border-2 border-dashed border-border-app rounded-2xl flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:border-accent-app/50 hover:bg-panel-app/20 transition-all"
            >
              <FiUsers className="w-12 h-12 text-accent-app/40 mb-3" />
              <h3 className="text-sm font-bold text-text-primary mb-1">Queue is empty</h3>
              <p className="text-[11px] text-text-secondary max-w-xs">Click here or drag-and-drop multiple portraits to begin auto processing.</p>
            </div>
          ) : (
            batchItems.map((item, idx) => {
              const isProcessing = item.status === 'bg-removing' || item.status === 'face-detecting' || item.status === 'pending';
              const isReady = item.status === 'ready';
              const isError = item.status === 'error';

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`
                    p-3.5 rounded-xl border flex items-center justify-between gap-4 bg-panel-app/70 backdrop-blur-sm transition-all relative group cursor-grab active:cursor-grabbing
                    ${draggedIndex === idx ? 'opacity-40 border-accent-app' : 'border-border-app/50 hover:border-border-app hover:bg-panel-app'}
                  `}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Drag Handle */}
                    <div className="text-neutral-500 hover:text-white transition-colors cursor-move shrink-0">
                      <FiMove className="w-4 h-4" />
                    </div>

                    {/* Numeric index */}
                    <span className="text-xs font-black text-neutral-500 shrink-0 w-4">
                      {idx + 1}
                    </span>

                    {/* Thumbnails */}
                    <div className="relative w-12 h-12 rounded-lg border border-border-app/40 bg-bg-app overflow-hidden shrink-0">
                      {item.croppedImage ? (
                        <img src={item.croppedImage} alt="cropped preview" className="w-full h-full object-cover" />
                      ) : item.originalImage ? (
                        <img src={item.originalImage} alt="original" className="w-full h-full object-cover opacity-60" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-card-app/40 text-neutral-500">
                          <FiLoader className="w-5 h-5 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Meta info & Progress */}
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={item.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const updated = [...batchItems];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          onBatchItemsChange(updated);
                        }}
                        className="text-xs font-bold text-text-primary bg-transparent outline-none focus:border-b border-accent-app/50 w-full pb-0.5 truncate"
                        placeholder="Candidate Name"
                      />
                      
                      <div className="flex items-center gap-2 mt-1 select-none">
                        {isProcessing && (
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-accent-app uppercase tracking-wider">
                            <FiLoader className="w-3 h-3 animate-spin text-accent-app" />
                            {item.status === 'bg-removing' ? `Removing BG (${item.progress}%)` : 'Calibrating Face...'}
                          </div>
                        )}
                        {isReady && (
                          <div className="flex items-center gap-1 text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                            <FiCheckCircle className="w-3 h-3" /> Ready
                          </div>
                        )}
                        {isError && (
                          <div className="flex items-center gap-1 text-[9px] font-black text-danger-app uppercase tracking-wider">
                            <FiAlertCircle className="w-3 h-3" /> Process Error
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 select-none shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEditModal(item)}
                      disabled={isProcessing}
                      className="w-8 h-8 rounded-lg bg-card-app hover:bg-border-app disabled:opacity-35 disabled:cursor-not-allowed text-text-secondary hover:text-text-primary transition-all flex items-center justify-center cursor-pointer border border-border-app/45"
                      title="Adjust crop, suits or filters"
                    >
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-8 h-8 rounded-lg bg-danger-app/10 hover:bg-danger-app hover:text-white text-danger-app transition-all flex items-center justify-center cursor-pointer border border-danger-app/20"
                      title="Delete item"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* COLUMN 3: Paginated Visual A4 Preview (Right side, 380px) */}
      <section className="w-full md:w-[380px] bg-panel-app p-4 flex flex-col justify-between items-center select-none shrink-0 min-h-0 relative">
        <div className="w-full space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-1.5">
                <FaRuler className="w-4 h-4 text-accent-app" /> A4 Print Preview
              </h3>
              <p className="text-[10px] text-text-secondary">Live sheet simulation, 6 copies per row.</p>
            </div>
            
            {/* Quick action buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={printBatchSheets}
                disabled={batchItems.length === 0}
                className="studio-btn studio-btn-primary p-2 text-xs rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer shrink-0"
                title="Direct Print"
              >
                <FiPrinter className="w-4 h-4" />
              </button>
              <button
                onClick={downloadBatchPDF}
                disabled={batchItems.length === 0}
                className="studio-btn studio-btn-success p-2 text-xs rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer shrink-0"
                title="Download PDF"
              >
                <FiDownload className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Paginated Sheet Render */}
          <div className="flex-1 flex items-center justify-center w-full py-4 min-h-[300px]">
            <div 
              className="relative w-full max-w-[240px] xl:max-w-[280px] bg-white border border-slate-200 rounded shadow-2xl flex flex-col justify-between overflow-hidden select-none transition-all duration-300"
              style={{
                aspectRatio: '210 / 297'
              }}
            >
              {/* Sheet Header Guidance */}
              <div 
                className="text-center border-b border-slate-100 pb-0.5 mb-1.5 text-slate-400 font-bold shrink-0 select-none"
                style={{
                  paddingTop: '2.5%',
                  height: '6%',
                  transform: 'scale(0.85)',
                  fontSize: '3px'
                }}
              >
                Passport Photo Batch Sheet (Page {currentPage + 1} of {totalPages})
              </div>

              {/* Grid content */}
              <div className="flex-1 flex items-start justify-center w-full min-h-0 relative">
                <div 
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${(spacingMm / pageHMm) * 100}%`,
                    paddingLeft: `${(marginMm / pageWMm) * 100}%`,
                    paddingRight: `${(marginMm / pageWMm) * 100}%`,
                    paddingTop: `${(marginMm / pageHMm) * 100}%`,
                    paddingBottom: `${(marginMm / pageHMm) * 100}%`,
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  {visibleItems.map((item, rowIdx) => {
                    const rowKey = `${item.id}-${rowIdx}`;
                    
                    return (
                      <div 
                        key={rowKey}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                          gap: `${(spacingMm / pageWMm) * 100}%`,
                          width: '100%',
                          height: 'fit-content'
                        }}
                      >
                        {Array.from({ length: 6 }).map((_, colIdx) => (
                          <div
                            key={colIdx}
                            className="relative border border-slate-150 overflow-hidden"
                            style={{
                              aspectRatio: `${ratio}`,
                              backgroundColor: item.croppedImage ? 'transparent' : bgColor
                            }}
                          >
                            {/* Photo display */}
                            {item.croppedImage ? (
                              <img
                                src={item.croppedImage}
                                alt="passport tile"
                                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                                <span className="text-[4px] text-slate-400">WAIT</span>
                              </div>
                            )}
                            
                            {/* Crop Border Guide */}
                            {showBorder && (
                              <div 
                                className="absolute inset-0 pointer-events-none z-20"
                                style={{
                                  border: `calc(${borderSize} * (100% / ${currentPresetSpecs.widthMm})) solid ${borderColor}`,
                                  boxSizing: 'border-box'
                                }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sheet Footer Guidance */}
              <div 
                className="text-center text-slate-400 font-bold shrink-0 select-none pb-1"
                style={{
                  fontSize: '3px',
                  transform: 'scale(0.8)',
                  height: '4%',
                }}
              >
                Print at 100% scale. Do not fit to page.
              </div>
            </div>
          </div>
        </div>

        {/* Pagination buttons */}
        <div className="w-full flex items-center justify-between border-t border-border-app/40 pt-3.5 select-none">
          <button
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0}
            className="px-3 py-1.5 rounded-lg border border-border-app bg-card-app hover:bg-border-app disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-text-primary flex items-center gap-1 cursor-pointer transition-colors"
          >
            <FiChevronLeft className="w-4 h-4" /> Previous
          </button>
          
          <span className="text-xs font-black text-text-secondary">
            Page {currentPage + 1} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
            disabled={currentPage === totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-border-app bg-card-app hover:bg-border-app disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-text-primary flex items-center gap-1 cursor-pointer transition-colors"
          >
            Next <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Manual Touch Up Modal */}
      <BatchEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingItem(null);
        }}
        item={editingItem}
        onSave={saveEditedItem}
        presetWidthMm={currentPresetSpecs.widthMm}
        presetHeightMm={currentPresetSpecs.heightMm}
        bgColor={bgColor}
      />

      {/* Hidden button to hook into page footer's Export Sheet button */}
      <button 
        id="download-pdf-hidden-trigger" 
        className="hidden" 
        onClick={downloadBatchPDF} 
      />
    </div>
  );
}
