'use client';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { FiChevronDown, FiAlertCircle, FiCpu } from 'react-icons/fi';
import { BsStars } from 'react-icons/bs';
import { FaPaintBrush } from 'react-icons/fa';
import { removeBackground, describeBackgroundEngine, type BgQuality } from '@/lib/backgroundRemoval';

// The manual refine tool is big and only needed once the operator opens it.
const BGRefinerModal = dynamic(() => import('./BGRefinerModal'), { ssr: false });

// The engine lives in lib/ so the app shell can use it without this UI.
export { removeBackground, warmUpBackgroundModel, describeBackgroundEngine, type BgQuality } from '@/lib/backgroundRemoval';

interface BGRemoverProps {
  imageData: string;
  processedImage: string | null;
  onBGRemoved: (processedImage: string) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

const QUALITY_OPTIONS: { value: BgQuality; label: string }[] = [
  { value: 'auto', label: 'Automatic (recommended)' },
  { value: 'fast', label: 'Fast' },
  { value: 'best', label: 'Best edges (slower)' },
];

export default function BGRemover({
  imageData,
  processedImage,
  onBGRemoved,
  isProcessing,
  setIsProcessing,
}: BGRemoverProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<BgQuality>('auto');
  const [engine, setEngine] = useState<string>('');
  const [isRefinerOpen, setIsRefinerOpen] = useState(false);

  const hasAutoRunRef = useRef(false);
  const prevImageDataRef = useRef(imageData);

  useEffect(() => {
    describeBackgroundEngine().then(setEngine).catch(() => undefined);
  }, []);

  const handleBGRemove = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText('Loading AI model…');
    setProgress(3);

    try {
      const processed = await removeBackground(imageData, quality, setProgress, setStatusText);
      setProgress(100);
      onBGRemoved(processed);
    } catch (err: any) {
      console.error('BG Removal Error:', err);
      setError(err?.message || 'Could not remove the background. Please try again.');
      setProgress(0);
    } finally {
      setIsProcessing(false);
      describeBackgroundEngine().then(setEngine).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (prevImageDataRef.current !== imageData) {
      hasAutoRunRef.current = false;
      prevImageDataRef.current = imageData;
    }
  }, [imageData]);

  // Start the cut-out automatically the first time a new photo reaches this step.
  useEffect(() => {
    if (!processedImage && imageData && !isProcessing && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      handleBGRemove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedImage, imageData, isProcessing]);

  return (
    <div className="w-full space-y-3">
      {!processedImage && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bg-quality" className="text-[13px] font-medium text-text-secondary">
            Cut-out quality
          </label>
          <div className="relative">
            <select
              id="bg-quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as BgQuality)}
              disabled={isProcessing}
              className="w-full bg-card-app border border-border-app text-text-primary text-[14px] rounded-lg pl-3 pr-8 py-2 outline-none focus:border-accent-app cursor-pointer appearance-none disabled:opacity-50"
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-text-secondary" />
          </div>
        </div>
      )}

      {!processedImage ? (
        <button
          type="button"
          onClick={handleBGRemove}
          disabled={isProcessing}
          className="studio-btn studio-btn-primary w-full"
        >
          {isProcessing ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              <span>Removing background… {progress}%</span>
            </>
          ) : (
            <>
              <BsStars className="w-4 h-4" />
              <span>Remove background</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsRefinerOpen(true)}
          disabled={isProcessing}
          className="studio-btn studio-btn-secondary w-full"
        >
          <FaPaintBrush className="w-4 h-4 text-accent-app" /> Touch up edges
        </button>
      )}

      {isProcessing && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex justify-between text-[13px] text-text-secondary">
            <span>{statusText}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="w-full bg-bg-app h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-accent-app h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {engine && !isProcessing && (
        <p className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <FiCpu className="w-3.5 h-3.5" /> Runs on this device · {engine}
        </p>
      )}

      {error && (
        <div className="p-2.5 bg-danger-app/10 border border-danger-app/30 text-danger-app text-[13px] rounded-lg flex items-start gap-2">
          <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isRefinerOpen && (
        <BGRefinerModal
          isOpen
          onClose={() => setIsRefinerOpen(false)}
          originalImage={imageData}
          aiTransparentImage={processedImage}
          onApply={onBGRemoved}
        />
      )}
    </div>
  );
}
