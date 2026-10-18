'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiX,
  FiUpload,
  FiCheckCircle,
  FiAlertTriangle,
  FiDownload,
  FiSliders,
  FiRefreshCw,
  FiImage,
} from 'react-icons/fi';
import { FaSignature } from 'react-icons/fa';
import {
  SIGNATURE_PRESETS,
  type SignaturePreset,
  loadHtmlImage,
  enhanceSignature,
  fitSignatureToDimensions,
  compressSignatureToTargetKB,
} from '@/lib/signatureProcessor';
import { importImageFile } from '@/lib/imageImport';
import { toast } from '@/lib/toast';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SignatureModal({ isOpen, onClose }: SignatureModalProps) {
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('ibps');
  const [threshold, setThreshold] = useState<number>(55);
  const [contrast, setContrast] = useState<number>(1.8);
  const [invert, setInvert] = useState<boolean>(false);
  const [autoTrim, setAutoTrim] = useState<boolean>(true);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [calculatedKB, setCalculatedKB] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activePreset: SignaturePreset =
    SIGNATURE_PRESETS[selectedPresetId] || SIGNATURE_PRESETS.ibps;

  // Process signature whenever image, preset, or settings change
  const processCurrentSignature = useCallback(async () => {
    if (!rawImage) return;
    setIsProcessing(true);

    try {
      const img = await loadHtmlImage(rawImage);
      // Step 1: Clean background shadow and enhance ink
      const enhanced = enhanceSignature(img, {
        threshold,
        contrast,
        invert,
        autoTrim,
      });

      // Step 2: Fit to portal dimensions
      const fitted = fitSignatureToDimensions(
        enhanced,
        activePreset.widthPx,
        activePreset.heightPx
      );
      canvasRef.current = fitted;

      // Step 3: Compress to target KB range
      const { dataUrl, sizeKB } = await compressSignatureToTargetKB(
        fitted,
        activePreset.minKB,
        activePreset.maxKB
      );

      setPreviewDataUrl(dataUrl);
      setCalculatedKB(sizeKB);
    } catch (err) {
      console.error('Signature processing failed:', err);
      toast('Could not process signature. Please try a different photo.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [rawImage, activePreset, threshold, contrast, invert, autoTrim]);

  useEffect(() => {
    if (rawImage) {
      const timer = setTimeout(() => {
        processCurrentSignature();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [rawImage, processCurrentSignature]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await importImageFile(file);
      setRawImage(dataUrl);
      toast('Signature loaded successfully.', 'success');
    } catch {
      toast('Failed to open signature file.', 'error');
    }
  };

  const handleDownload = (format: 'jpg' | 'png') => {
    if (!canvasRef.current && !previewDataUrl) return;

    let downloadUrl = previewDataUrl;
    if (format === 'png' && canvasRef.current) {
      downloadUrl = canvasRef.current.toDataURL('image/png');
    }

    if (!downloadUrl) return;

    const link = document.createElement('a');
    link.download = `signature-${activePreset.id}-${activePreset.widthPx}x${activePreset.heightPx}-${calculatedKB}kb.${format}`;
    link.href = downloadUrl;
    link.click();
    toast(`Downloaded ${format.toUpperCase()} (${calculatedKB} KB)`, 'success');
  };

  const isCompliant =
    calculatedKB >= activePreset.minKB && calculatedKB <= activePreset.maxKB;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-modal-title"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-card-app border border-border-app rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="px-5 py-3.5 border-b border-border-app flex items-center justify-between bg-panel-app/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-accent-app/15 text-accent-app flex items-center justify-center">
              <FaSignature className="w-4 h-4" />
            </span>
            <div>
              <h2 id="signature-modal-title" className="text-[15px] font-bold text-text-primary leading-tight">
                Signature &amp; Thumb Impression Studio
              </h2>
              <p className="text-[11px] text-text-secondary">
                Auto-remove shadows, sharpen ink &amp; compress to strict 10–20 KB portal limits
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full border border-border-app hover:bg-bg-app flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <FiX className="w-4 h-4" />
          </button>
        </header>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 panel-scrollbar">
          {!rawImage ? (
            /* Upload State */
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border-app hover:border-accent-app rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-bg-app/50 hover:bg-accent-app/5 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-accent-app/10 group-hover:scale-110 flex items-center justify-center text-accent-app transition-transform mb-4">
                <FiUpload className="w-6 h-6" />
              </div>
              <h3 className="text-[16px] font-bold text-text-primary mb-1">
                Drop signature or thumb impression here
              </h3>
              <p className="text-[13px] text-text-secondary max-w-md mb-4">
                Take a phone photo of your signature or ink thumb impression on paper. The AI will remove paper grey/yellow tint and leave crisp dark ink.
              </p>
              <button
                type="button"
                className="studio-btn studio-btn-primary !px-5 !py-2.5"
              >
                Choose Photo / File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Indian Exam Guidance Note */}
              <div className="mt-8 pt-6 border-t border-border-app/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left w-full max-w-xl">
                <div className="p-2.5 rounded-lg bg-panel-app/60 border border-border-app/40 text-[11px]">
                  <span className="font-semibold text-text-primary block">🖊️ Black / Blue Ink</span>
                  <span className="text-text-secondary">Sign with ballpoint pen on plain white unruled paper.</span>
                </div>
                <div className="p-2.5 rounded-lg bg-panel-app/60 border border-border-app/40 text-[11px]">
                  <span className="font-semibold text-text-primary block">📏 140×60 px / 2.5:1</span>
                  <span className="text-text-secondary">IBPS, SBI, SSC require standardized aspect ratio.</span>
                </div>
                <div className="p-2.5 rounded-lg bg-panel-app/60 border border-border-app/40 text-[11px]">
                  <span className="font-semibold text-text-primary block">⚖️ 10 to 20 KB</span>
                  <span className="text-text-secondary">Strictly verified by UPSC, SSC and Banking servers.</span>
                </div>
              </div>
            </div>
          ) : (
            /* Editing & Preview State */
            <div className="space-y-5">
              {/* Preset Selector */}
              <div>
                <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wider block mb-2">
                  Select Target Portal / Exam
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.values(SIGNATURE_PRESETS).map((p) => {
                    const isSelected = selectedPresetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPresetId(p.id)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-accent-app/10 border-accent-app ring-1 ring-accent-app'
                            : 'bg-panel-app/60 border-border-app hover:border-text-secondary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[12px] font-bold truncate ${isSelected ? 'text-accent-app' : 'text-text-primary'}`}>
                            {p.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-secondary flex justify-between">
                          <span>{p.widthPx}×{p.heightPx} px</span>
                          <span className="font-medium text-text-primary">{p.minKB}–{p.maxKB} KB</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Canvas Preview Card */}
              <div className="bg-bg-app border border-border-app rounded-xl p-4 flex flex-col items-center justify-center">
                <div className="w-full flex items-center justify-between mb-2 px-1">
                  <span className="text-[12px] font-medium text-text-secondary flex items-center gap-1.5">
                    <FiImage className="w-3.5 h-3.5" /> Portal Output Preview
                  </span>
                  {/* Compliance Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      isCompliant
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    }`}
                  >
                    {isCompliant ? (
                      <FiCheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <FiAlertTriangle className="w-3.5 h-3.5" />
                    )}
                    {calculatedKB} KB (Target: {activePreset.minKB}–{activePreset.maxKB} KB)
                  </span>
                </div>

                {/* The Preview Frame */}
                <div className="relative max-w-full overflow-hidden p-2 bg-white rounded-lg border border-border-app shadow-inner flex items-center justify-center min-h-[140px]">
                  {isProcessing ? (
                    <div className="flex items-center gap-2 text-neutral-500 text-[13px]">
                      <FiRefreshCw className="w-4 h-4 animate-spin text-accent-app" /> Cleaning signature…
                    </div>
                  ) : previewDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewDataUrl}
                      alt="Cleaned signature preview"
                      className="max-h-[130px] object-contain select-none shadow-sm"
                      style={{
                        width: Math.min(activePreset.widthPx * 2, 450),
                        aspectRatio: `${activePreset.widthPx} / ${activePreset.heightPx}`,
                      }}
                    />
                  ) : null}
                </div>
              </div>

              {/* Adjustments */}
              <div className="bg-panel-app/70 border border-border-app rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
                    <FiSliders className="w-4 h-4 text-accent-app" /> Ink Cleaning &amp; Threshold
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setThreshold(55);
                      setContrast(1.8);
                      setInvert(false);
                      setAutoTrim(true);
                    }}
                    className="text-[11px] text-accent-app hover:underline cursor-pointer"
                  >
                    Reset defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Threshold */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-text-secondary">Shadow removal threshold</span>
                      <span className="font-semibold text-text-primary">{threshold}%</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={90}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-text-secondary">
                      <span>Light shadow</span>
                      <span>Dark shadow</span>
                    </div>
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-text-secondary">Ink darkness / sharpness</span>
                      <span className="font-semibold text-text-primary">{contrast.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={3.0}
                      step={0.1}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-accent-app cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-text-secondary">
                      <span>Original ink</span>
                      <span>Deep black ink</span>
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div className="pt-2 border-t border-border-app/40 flex flex-wrap items-center gap-4 text-[12px]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoTrim}
                      onChange={(e) => setAutoTrim(e.target.checked)}
                      className="w-4 h-4 accent-accent-app rounded"
                    />
                    <span className="text-text-primary">Auto-crop signature margins</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={invert}
                      onChange={(e) => setInvert(e.target.checked)}
                      className="w-4 h-4 accent-accent-app rounded"
                    />
                    <span className="text-text-primary">Invert colors (negative)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <footer className="px-5 py-3.5 border-t border-border-app bg-panel-app/80 flex items-center justify-between gap-3 shrink-0">
          {rawImage ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRawImage(null);
                  setPreviewDataUrl(null);
                }}
                className="studio-btn studio-btn-secondary !text-[13px]"
              >
                Change Photo
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload('png')}
                  className="studio-btn studio-btn-secondary !text-[13px]"
                  title="Download transparent/lossless PNG"
                >
                  PNG
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('jpg')}
                  className="studio-btn studio-btn-primary !text-[13px] flex items-center gap-1.5"
                >
                  <FiDownload className="w-4 h-4" /> Download JPG ({calculatedKB} KB)
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="studio-btn studio-btn-secondary !text-[13px]"
              >
                Close
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
