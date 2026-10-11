// A small copy of a photo for places that only ever show it tiny, such as the
// print-sheet preview, which repeats the photo up to ~40 times. Painting (and
// CSS-filtering) a full-size 2400 px image in every tile is what made that
// screen slow on phones and low-end PCs; a copy sized for the tile is enough.
//
// Until the copy is ready (or if it can't be made) the original is returned,
// so callers never show an empty tile.

import { useEffect, useState } from 'react';

// One entry per (source, size); kept small because sources are large strings.
const cache = new Map<string, Promise<string | null>>();
const MAX_CACHE = 6;

function makePreview(src: string, maxEdge: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
      if (!longEdge || longEdge <= maxEdge) return resolve(null);
      const scale = maxEdge / longEdge;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Cut-outs are transparent PNGs — keep the alpha so the backdrop shows.
      const type = src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), type, 0.9);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getPreview(src: string, maxEdge: number): Promise<string | null> {
  const key = `${maxEdge}|${src}`;
  let entry = cache.get(key);
  if (entry) {
    // Most recently used goes last, so eviction never hits the one on screen.
    cache.delete(key);
    cache.set(key, entry);
  } else {
    entry = makePreview(src, maxEdge);
    cache.set(key, entry);
    if (cache.size > MAX_CACHE) {
      const oldestKey = cache.keys().next().value as string;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      oldest?.then((url) => url && URL.revokeObjectURL(url));
    }
  }
  return entry;
}

/** `src` downscaled so its long edge is at most `maxEdge` px. */
export function usePreviewImage(src: string | null, maxEdge: number): string | null {
  const [preview, setPreview] = useState<{ src: string; url: string } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    getPreview(src, maxEdge).then((url) => {
      if (!cancelled && url) setPreview({ src, url });
    });
    return () => {
      cancelled = true;
    };
  }, [src, maxEdge]);

  return preview && preview.src === src ? preview.url : src;
}
