// Indian Government Portal Signature & Thumb Impression Processor
//
// Every Indian portal (UPSC, SSC, IBPS, NSDL PAN, NTA NEET, Sarathi) mandates
// strict signature dimensions and file size limits (almost universally 10-20 KB
// or under 50 KB) with clean black/blue ink on plain white paper.
//
// This module provides high-speed, client-side pixel enhancement to convert
// shadowy mobile photos of paper signatures into crisp, rejection-proof signatures.

export interface SignaturePreset {
  id: string;
  name: string;
  portal: string;
  widthPx: number;
  heightPx: number;
  minKB: number;
  maxKB: number;
  description: string;
}

export const SIGNATURE_PRESETS: Record<string, SignaturePreset> = {
  ibps: {
    id: 'ibps',
    name: 'IBPS / SBI Banking',
    portal: 'IBPS / SBI PO & Clerk',
    widthPx: 140,
    heightPx: 60,
    minKB: 10,
    maxKB: 20,
    description: 'Strict 140×60 px, 10 to 20 KB black ink requirement',
  },
  ssc: {
    id: 'ssc',
    name: 'SSC Exams (CGL / CHSL / MTS)',
    portal: 'Staff Selection Commission',
    widthPx: 280,
    heightPx: 120,
    minKB: 10,
    maxKB: 20,
    description: '4.0 cm × 2.0 cm aspect, 10 to 20 KB limit',
  },
  upsc: {
    id: 'upsc',
    name: 'UPSC (Civil Services / NDA)',
    portal: 'Union Public Service Commission',
    widthPx: 350,
    heightPx: 150,
    minKB: 20,
    maxKB: 100,
    description: 'Crisp black ink on white background, 20 to 100 KB',
  },
  pan: {
    id: 'pan',
    name: 'PAN Card (NSDL / UTIITSL)',
    portal: 'Income Tax PAN',
    widthPx: 400,
    heightPx: 200,
    minKB: 10,
    maxKB: 50,
    description: '200 DPI resolution, strictly under 50 KB',
  },
  parivahan: {
    id: 'parivahan',
    name: 'Driving Licence (Parivahan)',
    portal: 'Sarathi MoRTH',
    widthPx: 200,
    heightPx: 100,
    minKB: 10,
    maxKB: 20,
    description: 'Parivahan Sewa standard, strictly 10 to 20 KB',
  },
  general: {
    id: 'general',
    name: 'General Indian Portal',
    portal: 'General Govt Application',
    widthPx: 300,
    heightPx: 120,
    minKB: 10,
    maxKB: 50,
    description: 'Standard 2.5:1 ratio, 10 to 50 KB compliant',
  },
};

export interface EnhanceOptions {
  /** Threshold for separating paper from ink (0 to 100, default 55) */
  threshold?: number;
  /** Ink darkness / contrast multiplier (1.0 to 3.0, default 1.8) */
  contrast?: number;
  /** Invert colors (useful for light ink or negative photos) */
  invert?: boolean;
  /** Whether to auto-crop whitespace around ink marks (default true) */
  autoTrim?: boolean;
}

/**
 * Loads an image from a data URL or blob URL.
 */
export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load signature image: ' + String(e)));
    img.src = src;
  });
}

/**
 * Enhances signature by eliminating paper background shadows and making ink crisp.
 */
export function enhanceSignature(
  source: HTMLImageElement | HTMLCanvasElement,
  options: EnhanceOptions = {}
): HTMLCanvasElement {
  const { threshold = 55, contrast = 1.8, invert = false, autoTrim = true } = options;

  const w = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;

  // Work on downscaled canvas if image is exceptionally large (e.g. 48MP phone photo)
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const workW = Math.max(1, Math.round(w * scale));
  const workH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0, workW, workH);
  const imgData = ctx.getImageData(0, 0, workW, workH);
  const data = imgData.data;

  // Step 1: Calculate average luminance across sampling points to detect overall paper lightness
  let sumL = 0;
  let countL = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sumL += 0.299 * r + 0.587 * g + 0.114 * b;
    countL++;
  }
  const avgL = countL > 0 ? sumL / countL : 128;

  // Dynamic cutoff based on threshold setting (0-100) and average paper lighting
  const baseCutoff = (threshold / 100) * 255;
  const cutoff = avgL > 180 ? Math.min(250, baseCutoff * 1.05) : baseCutoff;

  let minX = workW;
  let minY = workH;
  let maxX = 0;
  let maxY = 0;
  let hasInk = false;

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const idx = (y * workW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Luminance
      let lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (invert) lum = 255 - lum;

      if (lum >= cutoff) {
        // Paper background -> Pure crisp white
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
      } else {
        // Ink detected -> deepen ink color based on contrast
        hasInk = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Smooth contrast ramp
        const factor = Math.max(0, (cutoff - lum) / cutoff);
        const deepened = Math.max(0, 255 - Math.pow(factor, 1 / contrast) * 255);

        data[idx] = Math.round(deepened);
        data[idx + 1] = Math.round(deepened);
        data[idx + 2] = Math.round(deepened);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Step 2: Auto-trim whitespace if ink was detected
  if (autoTrim && hasInk && maxX > minX && maxY > minY) {
    const pad = Math.max(10, Math.round(Math.min(workW, workH) * 0.04));
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(workW - cropX, (maxX - minX) + pad * 2);
    const cropH = Math.min(workH - cropY, (maxY - minY) + pad * 2);

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = cropW;
    trimmedCanvas.height = cropH;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (trimmedCtx) {
      trimmedCtx.fillStyle = '#FFFFFF';
      trimmedCtx.fillRect(0, 0, cropW, cropH);
      trimmedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return trimmedCanvas;
    }
  }

  return canvas;
}

/**
 * Fits a signature canvas onto standard portal dimensions, centered on clean white.
 */
export function fitSignatureToDimensions(
  signatureCanvas: HTMLCanvasElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = targetW;
  result.height = targetH;
  const ctx = result.getContext('2d');
  if (!ctx) return signatureCanvas;

  // Background white
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  // Preserve aspect ratio and fit with margin
  const marginW = targetW * 0.08;
  const marginH = targetH * 0.08;
  const availW = targetW - marginW * 2;
  const availH = targetH - marginH * 2;

  const scale = Math.min(availW / signatureCanvas.width, availH / signatureCanvas.height);
  const drawW = signatureCanvas.width * scale;
  const drawH = signatureCanvas.height * scale;
  const drawX = (targetW - drawW) / 2;
  const drawY = (targetH - drawH) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(signatureCanvas, drawX, drawY, drawW, drawH);

  return result;
}

/**
 * Binary-searches JPEG quality and adapts resolution to guarantee the output
 * strictly meets the Indian portal's target file size range (e.g. 10KB - 20KB).
 */
export async function compressSignatureToTargetKB(
  canvas: HTMLCanvasElement,
  targetMinKB: number,
  targetMaxKB: number
): Promise<{ dataUrl: string; sizeKB: number; quality: number }> {
  // If no canvas or 0 dimensions, return blank
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { dataUrl: '', sizeKB: 0, quality: 0.8 };
  }

  const toBlob = (c: HTMLCanvasElement, q: number): Promise<Blob | null> => {
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', q));
  };

  let activeCanvas = canvas;
  let lowQ = 0.15;
  let highQ = 0.96;
  let bestDataUrl = '';
  let bestSizeKB = 0;
  let bestQ = 0.8;

  // Pass 1: Try binary search on current resolution
  for (let iter = 0; iter < 6; iter++) {
    const midQ = (lowQ + highQ) / 2;
    const blob = await toBlob(activeCanvas, midQ);
    if (!blob) break;

    const sizeKB = blob.size / 1024;
    bestSizeKB = sizeKB;
    bestQ = midQ;

    if (sizeKB <= targetMaxKB && sizeKB >= targetMinKB) {
      // Perfect match inside government window
      const reader = new FileReader();
      const url = await new Promise<string>((res) => {
        reader.onloadend = () => res(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return { dataUrl: url, sizeKB: Math.round(sizeKB * 10) / 10, quality: Math.round(midQ * 100) / 100 };
    }

    if (sizeKB > targetMaxKB) {
      highQ = midQ;
    } else {
      lowQ = midQ;
    }
  }

  // Pass 2: If still oversized at low quality, scale down dimensions
  let scale = 0.85;
  while (bestSizeKB > targetMaxKB && scale >= 0.35) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.round(canvas.width * scale);
    scaledCanvas.height = Math.round(canvas.height * scale);
    const sCtx = scaledCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#FFFFFF';
      sCtx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
      activeCanvas = scaledCanvas;

      const blob = await toBlob(activeCanvas, 0.7);
      if (blob) {
        bestSizeKB = blob.size / 1024;
        if (bestSizeKB <= targetMaxKB) {
          const reader = new FileReader();
          const url = await new Promise<string>((res) => {
            reader.onloadend = () => res(reader.result as string);
            reader.readAsDataURL(blob);
          });
          return { dataUrl: url, sizeKB: Math.round(bestSizeKB * 10) / 10, quality: 0.7 };
        }
      }
    }
    scale -= 0.15;
  }

  // Final fallback export
  const finalBlob = (await toBlob(activeCanvas, bestQ)) || (await toBlob(canvas, 0.8));
  if (finalBlob) {
    const reader = new FileReader();
    bestDataUrl = await new Promise<string>((res) => {
      reader.onloadend = () => res(reader.result as string);
      reader.readAsDataURL(finalBlob);
    });
    bestSizeKB = finalBlob.size / 1024;
  }

  return {
    dataUrl: bestDataUrl,
    sizeKB: Math.round(bestSizeKB * 10) / 10,
    quality: Math.round(bestQ * 100) / 100,
  };
}
