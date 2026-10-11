// Normalise imported photos once, at the door.
//
// Modern phones produce 12–50 MP photos. Keeping those as full-size data URLs
// made every later step (face analysis, cut-out, preview, undo history,
// autosave, PDF export) slow and memory-hungry, especially on low-end PCs.
// A passport photo prints at most ~600×830 px (50×70 mm @ 300 DPI), so even
// with 3× zoom a 2400 px long edge keeps full print quality.
//
// Decoding through createImageBitmap / <img> also applies the EXIF
// orientation, so sideways phone photos arrive upright.

const MAX_EDGE = 2400;
const JPEG_QUALITY = 0.92;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// toBlob encodes off the main thread in most browsers, so a large photo
// doesn't freeze the page the way the synchronous toDataURL does.
function encodeCanvas(canvas: HTMLCanvasElement, type: string): Promise<string> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) readAsDataUrl(blob).then(resolve, () => resolve(canvas.toDataURL(type, JPEG_QUALITY)));
        else resolve(canvas.toDataURL(type, JPEG_QUALITY));
      },
      type,
      JPEG_QUALITY,
    );
  });
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> (e.g. HEIC/odd formats some engines can't bitmap) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('This image format is not supported'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Read an image file as a data URL, upright and capped to a print-safe size.
 * PNGs keep their format (they may carry transparency); everything else
 * becomes a high-quality JPEG.
 */
export async function importImageFile(file: Blob): Promise<string> {
  const keepPng = file.type === 'image/png';
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return readAsDataUrl(file); // last resort: hand the bytes through untouched
  }

  try {
    const { width, height } = decoded;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
    // Small JPEGs need no work at all — avoid a lossy re-encode.
    if (scale === 1 && file.type === 'image/jpeg') return readAsDataUrl(file);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return readAsDataUrl(file);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    return await encodeCanvas(canvas, keepPng ? 'image/png' : 'image/jpeg');
  } finally {
    decoded.close();
  }
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif)$/i.test(file.name);
}
