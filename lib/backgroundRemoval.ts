// On-device background removal (IS-Net via @imgly/background-removal).
//
// Kept free of React so the app shell can call it (toolbar, shortcuts,
// warm-up) without pulling the background-remover UI into the first bundle.
// The heavy library itself is only fetched on first use via import().

import { getDeviceProfile, markGpuFailed } from './device';

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

// ---------------------------------------------------------------------------
// Device-aware engine
// ---------------------------------------------------------------------------
// One backend decision per app session: WebGPU when the machine has a usable
// adapter (typically 5-10x faster), otherwise multi-threaded WASM on the CPU.
// It must be a single decision — onnxruntime-web caches whichever runtime
// (WebGPU or plain WASM) loads first, so mixing devices across calls (as the
// app previously did: 'gpu' in some places, 'cpu' in others) was fragile.

export type BgQuality = 'auto' | 'fast' | 'best';
type ImglyModel = 'isnet' | 'isnet_fp16' | 'isnet_quint8';
type Device = 'gpu' | 'cpu';

let lockedDevice: Device | null = null;
let localModelsMissing = false;

async function resolveDevice(): Promise<Device> {
  if (!lockedDevice) {
    const profile = await getDeviceProfile();
    lockedDevice = profile.webgpu ? 'gpu' : 'cpu';
  }
  return lockedDevice;
}

/** fp16 is built for GPUs; the 8-bit quantised model is the fast CPU choice. */
function modelFor(quality: BgQuality, device: Device): ImglyModel {
  if (quality === 'best') return 'isnet';
  return device === 'gpu' ? 'isnet_fp16' : 'isnet_quint8';
}

/** Human-readable engine description for the UI. */
export async function describeBackgroundEngine(): Promise<string> {
  const device = await resolveDevice();
  const profile = await getDeviceProfile();
  return device === 'gpu' ? 'GPU accelerated (WebGPU)' : `CPU · ${profile.cores} threads`;
}

function localPublicPath(): string {
  return typeof window !== 'undefined'
    ? `${window.location.origin}/models/background-removal/`
    : '/models/background-removal/';
}

// imgly memoises its model session by JSON.stringify(config). Functions are
// dropped by JSON.stringify, so every call that builds its config here —
// warm-up included — shares one cached session per (model, device, source).
function buildConfig(model: ImglyModel, device: Device, useLocal: boolean, progress?: (key: string, current: number, total: number) => void) {
  return {
    model,
    device,
    ...(useLocal ? { publicPath: localPublicPath() } : {}),
    output: { format: 'image/png' as const, quality: 1.0 },
    ...(progress ? { progress } : {}),
  };
}

function isResourceError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /fetch|resource|not found|publicPath|network|404/i.test(msg);
}

// The ONNX session is not safe to run concurrently — overlapping removals
// (e.g. several photos dropped into the batch at once) corrupt it. This chain
// serialises every call no matter where it comes from.
let bgRemovalQueue: Promise<unknown> = Promise.resolve();

// Warm the model up once while the app is idle so the first real cut-out
// doesn't pay the WASM-compile + model-load cost.
let warmupPromise: Promise<void> | null = null;
export function warmUpBackgroundModel(quality: BgQuality = 'auto'): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const { preload } = await import('@imgly/background-removal');
      const device = await resolveDevice();
      const model = modelFor(quality, device);
      try {
        await preload(buildConfig(model, device, !localModelsMissing));
      } catch (err) {
        if (localModelsMissing || !isResourceError(err)) throw err;
        localModelsMissing = true;
        await preload(buildConfig(model, device, false));
      }
    } catch (err) {
      // Never surface warm-up failures; the real call has its own handling.
      console.warn('Background model warm-up skipped:', err);
      warmupPromise = null;
    }
  })();
  return warmupPromise;
}

export function removeBackground(
  imageData: string,
  quality: BgQuality = 'auto',
  onProgress?: (progress: number) => void,
  onStatusChange?: (statusText: string) => void,
): Promise<string> {
  const run = bgRemovalQueue.then(() => removeBackgroundImpl(imageData, quality, onProgress, onStatusChange));
  // Keep the chain alive even if this call rejects.
  bgRemovalQueue = run.catch(() => undefined);
  return run;
}

async function removeBackgroundImpl(
  imageData: string,
  quality: BgQuality,
  onProgress?: (progress: number) => void,
  onStatusChange?: (statusText: string) => void,
): Promise<string> {
  const { removeBackground: imglyRemoveBackground } = await import('@imgly/background-removal');
  const blob = await prepareInputBlob(imageData);

  // Map imgly's per-stage callbacks onto one steadily increasing percentage:
  // downloads/initialisation fill 0-60%, inference + encode fill 60-100%.
  let shown = 0;
  let phase = '';
  const progress = (key: string, current: number, total: number) => {
    if (total <= 0) return;
    const frac = Math.min(1, current / total);
    const isCompute = key.startsWith('compute');
    const pct = isCompute ? 60 + frac * 40 : 5 + frac * 55;
    const nextPhase = isCompute ? 'Removing background…' : 'Loading AI model…';
    if (nextPhase !== phase) {
      phase = nextPhase;
      onStatusChange?.(nextPhase);
    }
    if (pct > shown) {
      shown = pct;
      onProgress?.(Math.round(pct));
    }
  };

  const attempt = async (device: Device) => {
    const model = modelFor(quality, device);
    if (!localModelsMissing) {
      try {
        return await imglyRemoveBackground(blob, buildConfig(model, device, true, progress));
      } catch (err) {
        if (!isResourceError(err)) throw err;
        localModelsMissing = true;
        console.warn('Offline background model not found, using the online copy:', err);
        onStatusChange?.('Downloading AI model (first run only)…');
      }
    }
    return imglyRemoveBackground(blob, buildConfig(model, device, false, progress));
  };

  let outputBlob: Blob;
  const device = await resolveDevice();
  try {
    outputBlob = await attempt(device);
  } catch (err) {
    if (device === 'gpu' && !isResourceError(err)) {
      // GPU path crashed (driver/adapter quirk): remember it and use the CPU.
      console.warn('GPU background removal failed, switching to CPU:', err);
      markGpuFailed();
      lockedDevice = 'cpu';
      onStatusChange?.('Switching to CPU processing…');
      outputBlob = await attempt('cpu');
    } else if (isResourceError(err)) {
      throw new Error('The background-removal model is not installed and could not be downloaded. Check your internet connection and try again.');
    } else {
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(outputBlob);
  });
}
