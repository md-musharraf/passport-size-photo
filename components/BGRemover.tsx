'use client';
import { useState, useEffect, useRef } from 'react';
import BGRefinerModal from './BGRefinerModal';
import { FiChevronDown, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { BsStars } from 'react-icons/bs';
import { FaPaintBrush } from 'react-icons/fa';

// Convert a data: URL to a Blob locally (bypassing fetch CORS restrictions in
// Electron file:// contexts). Handles both base64 payloads (photo uploads) and
// non-base64 payloads such as ";utf8," / URL-encoded inline SVG — the latter
// previously threw "Failed to execute 'atob'" because it isn't base64.
function dataURLtoBlob(dataurl: string): Blob {
  const commaIdx = dataurl.indexOf(',');
  const header = dataurl.slice(0, commaIdx);
  const payload = dataurl.slice(commaIdx + 1);
  const mime = header.match(/:(.*?)[;,]/)?.[1] || 'image/png';

  if (/;base64/i.test(header)) {
    const bstr = atob(payload);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // Non-base64 (text) data URL, e.g. inline SVG — decode any percent-encoding.
  let text = payload;
  try {
    text = decodeURIComponent(payload);
  } catch {
    /* payload wasn't percent-encoded; use as-is */
  }
  return new Blob([text], { type: mime });
}

// The AI cutout model runs at ~1024px internally, so feeding it a full-resolution
// phone photo (often 3000-4000px) just wastes decode time and memory for zero extra
// mask detail. Downscaling the long edge to this cap first makes removal dramatically
// faster while staying well above the print resolution of any passport photo.
// 1024 matches the isnet model's own working resolution, so the cutout mask is
// bit-for-bit identical to feeding a larger image while cutting preprocessing and
// PNG-encoding time — and it is still ~2x the pixels of the final print size.
const MAX_INPUT_DIMENSION = 1024;

// Downscale a large image before background removal. Returns a Blob ready for the model.
// If the image is already small enough it is returned unchanged (no re-encode).
async function prepareInputBlob(imageData: string): Promise<Blob> {
  // Load the source into an <img> so we can measure and (optionally) resize it.
  const img = document.createElement('img');
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
    img.src = imageData;
  });

  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);

  // Already small enough — hand the original bytes straight through.
  if (longEdge <= MAX_INPUT_DIMENSION || longEdge === 0) {
    if (imageData.startsWith('data:')) return dataURLtoBlob(imageData);
    const response = await fetch(imageData);
    return response.blob();
  }

  const scale = MAX_INPUT_DIMENSION / longEdge;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Canvas unavailable — fall back to the untouched original.
    if (imageData.startsWith('data:')) return dataURLtoBlob(imageData);
    return (await fetch(imageData)).blob();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? dataURLtoBlob(canvas.toDataURL('image/png'))),
      'image/png',
    );
  });
}

// The @imgly WASM/ONNX session is a single shared resource and is NOT safe to run
// concurrently — firing several removals at once (e.g. when a user drops multiple
// photos into the batch, each triggering its own callback) corrupts the session and
// makes removals silently fail. This global chain serialises every call so they run
// one after another no matter where they are triggered from.
let bgRemovalQueue: Promise<unknown> = Promise.resolve();

// Warm the AI model up once, while the app sits idle, so the very first real
// cutout doesn't pay the ~20s WASM-compile + model-fetch cost. Safe to call
// repeatedly — it only ever runs a single preload.
let warmupPromise: Promise<void> | null = null;
export function warmUpBackgroundModel(
  modelQuality: 'isnet' | 'isnet_fp16' | 'isnet_quint8' = 'isnet_quint8',
): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const { preload } = await import('@imgly/background-removal');
      const localPublicPath = typeof window !== 'undefined'
        ? `${window.location.origin}/models/background-removal/`
        : '/models/background-removal/';
      try {
        await preload({ model: modelQuality, publicPath: localPublicPath });
      } catch {
        // Local models missing (e.g. running before download) — fall back to the
        // library default so the warm-up still primes the WASM runtime.
        await preload({ model: modelQuality });
      }
    } catch (err) {
      // Never let a warm-up failure surface to the user; the real removal path
      // has its own error handling and CDN fallback.
      console.warn('Background model warm-up skipped:', err);
      warmupPromise = null; // allow a later retry
    }
  })();
  return warmupPromise;
}

export function removeBackground(
  imageData: string,
  modelQuality: 'isnet' | 'isnet_fp16' | 'isnet_quint8' = 'isnet_quint8',
  deviceBackend: 'gpu' | 'cpu' = 'cpu',
  onProgress?: (progress: number) => void,
  onStatusChange?: (statusText: string) => void
): Promise<string> {
  const run = bgRemovalQueue.then(() =>
    removeBackgroundImpl(imageData, modelQuality, deviceBackend, onProgress, onStatusChange)
  );
  // Keep the chain alive even if this call rejects, so a single failure never
  // permanently blocks every subsequent removal.
  bgRemovalQueue = run.catch(() => undefined);
  return run;
}

async function removeBackgroundImpl(
  imageData: string,
  modelQuality: 'isnet' | 'isnet_fp16' | 'isnet_quint8' = 'isnet_quint8',
  deviceBackend: 'gpu' | 'cpu' = 'cpu',
  onProgress?: (progress: number) => void,
  onStatusChange?: (statusText: string) => void
): Promise<string> {
  const { removeBackground: imglyRemoveBackground } = await import('@imgly/background-removal');

  // Resize oversized inputs before handing them to the model (major speed win).
  const blob = await prepareInputBlob(imageData);

  const localPublicPath = typeof window !== 'undefined'
    ? `${window.location.origin}/models/background-removal/`
    : '/models/background-removal/';

  let outputBlob: Blob;
  try {
    if (onStatusChange) {
      onStatusChange('Loading local AI model...');
    }
    // Attempt local load first. Use absolute path relative to dev or custom protocol origin
    outputBlob = await imglyRemoveBackground(blob, {
      model: modelQuality,
      publicPath: localPublicPath,
      device: deviceBackend,
      output: {
        format: 'image/png',
        quality: 1.0,
      },
      progress: (key, current, total) => {
        if (onProgress && total > 0) {
          onProgress(Math.round((current / total) * 100));
        }
      }
    });
  } catch (localErr) {
    console.warn('Local background removal model not found or failed, falling back to CDN:', localErr);
    if (onStatusChange) {
      onStatusChange('Local model not found. Fetching from AI cloud CDN...');
    }
    // Fallback to default CDN (omit publicPath so it uses library default)
    outputBlob = await imglyRemoveBackground(blob, {
      model: modelQuality,
      device: deviceBackend,
      output: {
        format: 'image/png',
        quality: 1.0,
      },
      progress: (key, current, total) => {
        if (onProgress && total > 0) {
          onProgress(Math.round((current / total) * 100));
        }
      }
    });
  }
  
  // Convert output blob back to base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(outputBlob);
  });
}

interface BGRemoverProps {
  imageData: string;
  processedImage: string | null;
  onBGRemoved: (processedImage: string) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

export default function BGRemover({
  imageData,
  processedImage,
  onBGRemoved,
  isProcessing,
  setIsProcessing,
}: BGRemoverProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Ready to remove background');
  const [error, setError] = useState<string | null>(null);
  const [modelQuality, setModelQuality] = useState<'isnet' | 'isnet_fp16' | 'isnet_quint8'>('isnet_quint8');
  const [deviceBackend, setDeviceBackend] = useState<'gpu' | 'cpu'>('cpu');
  const [isRefinerOpen, setIsRefinerOpen] = useState(false);

  const hasAutoRunRef = useRef(false);
  const prevImageDataRef = useRef(imageData);

  const handleBGRemove = async () => {
    setIsProcessing(true);
    setError(null);
    setStatusText('Loading AI model...');
    setProgress(5);
    
    try {
      const processed = await removeBackground(
        imageData, 
        modelQuality, 
        deviceBackend,
        (p) => {
          setProgress(p);
          if (p < 20) {
            setStatusText('Initializing AI model...');
          } else if (p < 60) {
            setStatusText('Scanning photo...');
          } else if (p < 90) {
            setStatusText('Detecting subject contours...');
          } else {
            setStatusText('Removing background...');
          }
        },
        (status) => {
          setStatusText(status);
        }
      );
      setProgress(100);
      setStatusText('Background removed successfully!');
      onBGRemoved(processed);
    } catch (err: any) {
      console.error('BG Removal Error:', err);
      setError(err?.message || 'Failed to remove background. Please try again.');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (prevImageDataRef.current !== imageData) {
      hasAutoRunRef.current = false;
      prevImageDataRef.current = imageData;
    }
  }, [imageData]);

  useEffect(() => {
    if (!processedImage && imageData && imageData !== '' && !isProcessing && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      handleBGRemove();
    }
  }, [processedImage, imageData, isProcessing]);

  return (
    <div className="w-full mt-2 space-y-3">
      {/* Model Quality Selection */}
      {!processedImage && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider pl-0.5 select-none">
            AI Background Cutout Mode
          </span>
          <div className="relative">
            <select
              value={modelQuality}
              onChange={(e) => setModelQuality(e.target.value as any)}
              disabled={isProcessing}
              className="w-full bg-card-app border border-border-app text-text-primary text-[12.5px] font-bold rounded-xl px-3 py-1.5 outline-none focus:border-accent-app cursor-pointer appearance-none shadow-inner disabled:opacity-50"
            >
              <option value="isnet_quint8" className="bg-bg-app text-text-primary">
                Fast Mode (Quick processing, CPU safe)
              </option>
              <option value="isnet" className="bg-bg-app text-text-primary">
                Ultra Mode (Precision edges, CPU safe)
              </option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
              <FiChevronDown className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!processedImage ? (
        <button
          onClick={handleBGRemove}
          disabled={isProcessing}
          className={`
            w-full py-2.5 rounded-xl font-extrabold transition-all text-sm flex items-center justify-center gap-2 cursor-pointer select-none
            ${isProcessing 
              ? 'bg-accent-app/20 text-accent-app border border-accent-app/30 cursor-wait' 
              : 'bg-accent-app hover:bg-accent-hover hover:scale-[1.01] active:scale-[0.99] text-white shadow-lg shadow-accent-app/10 border border-accent-app/20'
            }
          `}
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4 text-accent-app" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Removing Background ({progress}%)</span>
            </>
          ) : (
            <>
              <BsStars className="w-4 h-4 text-white animate-pulse" />
              <span>Remove Background</span>
            </>
          )}
        </button>
      ) : (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setIsRefinerOpen(true)}
            disabled={isProcessing}
            className="w-full py-2.5 px-4 rounded-xl bg-accent-app hover:bg-accent-hover text-white font-extrabold text-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent-app/15 border border-accent-app/20 flex items-center justify-center gap-1.5 animate-fadeIn"
          >
            <FaPaintBrush className="w-4 h-4 text-white" /> Retouch Background
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="space-y-1.5 mt-2.5 px-1">
          <div className="flex justify-between text-[12px] text-text-secondary font-semibold">
            <span>{statusText}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-bg-app h-1.5 rounded-full overflow-hidden border border-border-app">
            <div 
              className="bg-gradient-to-r from-accent-app to-accent-hover h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2.5 p-2 bg-danger-app/10 border border-danger-app/30 text-danger-app text-xs rounded-lg flex items-center gap-1.5">
          <FiAlertCircle className="w-4 h-4 text-danger-app shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Manual Refinement Dialog Modal */}
      <BGRefinerModal
        isOpen={isRefinerOpen}
        onClose={() => setIsRefinerOpen(false)}
        originalImage={imageData}
        aiTransparentImage={processedImage}
        onApply={onBGRemoved}
      />
    </div>
  );
}

