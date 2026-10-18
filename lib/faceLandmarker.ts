// Face analysis powered by Google MediaPipe Face Landmarker (478 3D landmarks
// with iris points + 52 expression blendshapes). It replaces the old
// face-api.js pipeline (2018-era 68-point models on TF.js 1.x) and gives the
// app real measurements instead of box-based guesses:
//   - true chin + forehead points (and the hairline crown from the cutout mask)
//   - iris centres for the eye line
//   - head yaw / pitch, eyes-open and neutral-expression signals
//
// Assets load from /models/mediapipe (copied there by
// `npm run download-face-models`, so the desktop app works fully offline) and
// fall back to the official CDN when they are missing (e.g. plain `npm run dev`).

import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FaceGeometry } from './faceAlign';
import { getDeviceProfile } from './device';

/** Keep in sync with the @mediapipe/tasks-vision version in package.json. */
const MEDIAPIPE_VERSION = '1.0.1';
const CDN_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const CDN_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Analyse at most this many pixels on the long edge — plenty for 478 landmarks. */
const MAX_ANALYSIS_EDGE = 1280;

// Face-mesh landmark indices used below.
const LM = {
  forehead: 10,
  chin: 152,
  noseTip: 1,
  cheekLeft: 234,
  cheekRight: 454,
  irisA: 468,
  irisB: 473,
} as const;

/** Forehead landmark sits just below the hairline; the crown (hair included) is
 *  about this far up the chin→forehead axis. Calibrated against cut-out masks;
 *  when a cut-out exists its alpha mask gives the exact value instead. */
const CROWN_FROM_FOREHEAD = 1.3;

export interface FaceAnalysis extends FaceGeometry {
  /** Number of faces found in the photo. */
  faceCount: number;
  /** Bounding box of the face landmarks in pixels. */
  faceBox: { x: number; y: number; width: number; height: number };
  /** Head roll from the eye line (degrees). */
  rollDeg: number;
  /** Head turn left/right (degrees, 0 = facing the camera). */
  yawDeg: number;
  /** Head nod up/down (degrees, 0 = level). */
  pitchDeg: number;
  /** 0 = closed, 1 = fully open (the less open eye). */
  eyesOpen: number;
  /** 0..1 smile strength. */
  smile: number;
  /** 0..1 mouth-open strength. */
  jawOpen: number;
  /** Average face luminance 0-255. */
  luminance: number;
  /** 0 = evenly lit, 1 = one side completely dark. */
  lightImbalance: number;
  /** The photo already has a transparent (cut-out) background. */
  hasTransparentBg: boolean;
  /** Crown came from the cut-out mask rather than an estimate. */
  crownFromMask: boolean;
  /** Which compute backend produced the result. */
  backend: 'GPU' | 'CPU';
}

let landmarkerPromise: Promise<{ lm: FaceLandmarker; backend: 'GPU' | 'CPU' }> | null = null;
let gpuDelegateBroken = false;

function localBase(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/models/mediapipe` : '/models/mediapipe';
}

async function localAssetsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${localBase()}/face_landmarker.task`, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function createLandmarker(): Promise<{ lm: FaceLandmarker; backend: 'GPU' | 'CPU' }> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const profile = await getDeviceProfile();

  const local = await localAssetsAvailable();
  const sources = local
    ? [{ wasm: `${localBase()}/wasm`, model: `${localBase()}/face_landmarker.task` }]
    : [];
  sources.push({ wasm: CDN_WASM_BASE, model: CDN_MODEL_URL });

  const delegates: ('GPU' | 'CPU')[] = profile.webgl2 && !gpuDelegateBroken ? ['GPU', 'CPU'] : ['CPU'];

  let lastError: unknown = null;
  for (const src of sources) {
    const fileset = await FilesetResolver.forVisionTasks(src.wasm);
    for (const delegate of delegates) {
      try {
        const lm = await quietly(() => FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: src.model, delegate },
          runningMode: 'IMAGE',
          numFaces: 4,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          outputFaceBlendshapes: true,
        }));
        return { lm, backend: delegate };
      } catch (err) {
        lastError = err;
        if (delegate === 'GPU') gpuDelegateBroken = true;
      }
    }
  }
  throw lastError ?? new Error('Face model could not be loaded');
}

/** Load (once) and return the shared face landmarker. Safe to call repeatedly. */
export function loadFaceLandmarker(): Promise<{ lm: FaceLandmarker; backend: 'GPU' | 'CPU' }> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch((err) => {
      landmarkerPromise = null; // allow a retry later (e.g. after reconnecting)
      throw err;
    });
  }
  return landmarkerPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the photo'));
    img.src = src;
  });
}

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight) || 1;
  const k = Math.min(1, MAX_ANALYSIS_EDGE / longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function blendScore(categories: { categoryName: string; score: number }[] | undefined, name: string): number {
  return categories?.find((c) => c.categoryName === name)?.score ?? 0;
}

// MediaPipe's WASM runtime prints routine status lines ("INFO: Created
// TensorFlow Lite XNNPACK delegate…", glog "I…/W…" lines) through
// console.error, which looks like a failure in DevTools and in the Next.js dev
// overlay. Route just those lines to console.debug while MediaPipe is running.
const MP_LOG = /^(INFO:|[IW]\d{4} |Graph successfully|OpenGL error checking)/;
let quietDepth = 0;
let realError: typeof console.error | null = null;
let realLog: typeof console.log | null = null;
let realWarn: typeof console.warn | null = null;

async function quietly<T>(fn: () => T | Promise<T>): Promise<T> {
  if (quietDepth++ === 0) {
    realError = console.error;
    realLog = console.log;
    realWarn = console.warn;
    const route = (orig: (...a: unknown[]) => void) => (...args: unknown[]) =>
      typeof args[0] === 'string' && MP_LOG.test(args[0]) ? console.debug(...args) : orig(...args);
    console.error = route(realError);
    console.log = route(realLog);
    console.warn = route(realWarn);
  }
  try {
    return await fn();
  } finally {
    if (--quietDepth === 0) {
      console.error = realError!;
      console.log = realLog!;
      console.warn = realWarn!;
    }
  }
}

function detect(lm: FaceLandmarker, canvas: HTMLCanvasElement) {
  return quietly(() => lm.detect(canvas));
}

const MAX_FACE_CACHE = 8;
const faceAnalysisCache = new Map<string, FaceAnalysis>();

function getFaceCacheKey(src: string): string {
  const len = src.length;
  if (len < 300) return src;
  return `${len}_${src.slice(0, 80)}_${src.slice(Math.floor(len / 2), Math.floor(len / 2) + 80)}_${src.slice(-80)}`;
}

/**
 * Detect the main face in `src` and measure everything the passport tools need.
 * Returns null when no face is found. Coordinates are in the source image's
 * natural pixel size.
 */
export async function analyzeFace(src: string): Promise<FaceAnalysis | null> {
  const cacheKey = getFaceCacheKey(src);
  if (faceAnalysisCache.has(cacheKey)) {
    return faceAnalysisCache.get(cacheKey)!;
  }

  const img = await loadImage(src);
  const canvas = toCanvas(img);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  let { lm, backend } = await loadFaceLandmarker();
  let result;
  try {
    result = await detect(lm, canvas);
  } catch (err) {
    if (backend !== 'GPU') throw err;
    // GPU delegate failed at run time (driver quirk) — rebuild on CPU once.
    gpuDelegateBroken = true;
    lm.close();
    landmarkerPromise = null;
    ({ lm, backend } = await loadFaceLandmarker());
    result = await detect(lm, canvas);
  }

  const faces = result.faceLandmarks ?? [];
  if (!faces.length) return null;

  // Pick the largest face — the subject, not someone in the background.
  let best = 0;
  let bestArea = -1;
  faces.forEach((pts, i) => {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) {
      bestArea = area;
      best = i;
    }
  });

  const pts = faces[best];
  const px = (p: NormalizedLandmark) => ({ x: p.x * W, y: p.y * H });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x * W);
    maxX = Math.max(maxX, p.x * W);
    minY = Math.min(minY, p.y * H);
    maxY = Math.max(maxY, p.y * H);
  }
  const faceBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

  // Iris landmarks only exist on the full 478-point mesh; fall back to box-relative guesses.
  const irisA = pts[LM.irisA] ? px(pts[LM.irisA]) : { x: minX + faceBox.width * 0.3, y: minY + faceBox.height * 0.4 };
  const irisB = pts[LM.irisB] ? px(pts[LM.irisB]) : { x: minX + faceBox.width * 0.7, y: minY + faceBox.height * 0.4 };
  const [leftEye, rightEye] = irisA.x <= irisB.x ? [irisA, irisB] : [irisB, irisA];

  const chin = px(pts[LM.chin]);
  const forehead = px(pts[LM.forehead]);
  const cheekL = pts[LM.cheekLeft];
  const cheekR = pts[LM.cheekRight];
  const faceCenterX = ((cheekL.x + cheekR.x) / 2) * W;

  const rollDeg = (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;

  // Head pose from the 3D mesh (z shares x's scale, so multiply by W).
  const yawDeg = (Math.atan2((cheekR.z - cheekL.z) * W, (cheekR.x - cheekL.x) * W) * 180) / Math.PI;
  const top = pts[LM.forehead];
  const bottom = pts[LM.chin];
  const pitchDeg = (Math.atan2((bottom.z - top.z) * W, (bottom.y - top.y) * H) * 180) / Math.PI;

  // Crown: extend chin→forehead, then snap to the real hair edge when the
  // photo is already a cut-out (alpha mask available).
  const axis = { x: forehead.x - chin.x, y: forehead.y - chin.y };
  let crown = { x: chin.x + axis.x * CROWN_FROM_FOREHEAD, y: chin.y + axis.y * CROWN_FROM_FOREHEAD };

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const k = canvas.width / W;
  let hasTransparentBg = false;
  let crownFromMask = false;
  let luminance = 0;
  let lightImbalance = 0;

  if (ctx) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const cw = canvas.width;
    const ch = canvas.height;
    const alphaAt = (x: number, y: number) => data[(y * cw + x) * 4 + 3];

    // Cut-out = both top corners see-through (shoulders usually reach the
    // bottom ones), or a clear share of the picture transparent.
    let clear = 0;
    let sampled = 0;
    for (let i = 3; i < data.length; i += 4 * 97) {
      sampled++;
      if (data[i] < 48) clear++;
    }
    hasTransparentBg = (alphaAt(0, 0) < 48 && alphaAt(cw - 1, 0) < 48) || clear / Math.max(1, sampled) > 0.08;

    if (hasTransparentBg) {
      const faceW = Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y) * W;
      const x0 = Math.max(0, Math.round((forehead.x - faceW * 0.2) * k));
      const x1 = Math.min(cw - 1, Math.round((forehead.x + faceW * 0.2) * k));
      const yStart = Math.max(0, Math.round((forehead.y - faceBox.height) * k));
      const yEnd = Math.max(0, Math.round(forehead.y * k));
      for (let y = yStart; y <= yEnd && x1 > x0; y++) {
        let opaque = 0;
        for (let x = x0; x <= x1; x++) if (alphaAt(x, y) > 128) opaque++;
        if (opaque / (x1 - x0 + 1) >= 0.25) {
          const maskY = y / k;
          // Hair touching the top edge means the real crown is out of frame;
          // keep whichever estimate is higher.
          const crownY = y === 0 ? Math.min(maskY, crown.y) : maskY;
          const t = (chin.y - crownY) / Math.max(1, chin.y - forehead.y);
          const tc = Math.min(Math.max(t, 1.0), 1.7);
          crown = { x: chin.x + axis.x * tc, y: chin.y + axis.y * tc };
          crownFromMask = true;
          break;
        }
      }
    }

    // Lighting: average luminance and left/right balance over the inner face.
    const fx0 = Math.round((faceBox.x + faceBox.width * 0.2) * k);
    const fx1 = Math.round((faceBox.x + faceBox.width * 0.8) * k);
    const fy0 = Math.round((faceBox.y + faceBox.height * 0.3) * k);
    const fy1 = Math.round((faceBox.y + faceBox.height * 0.75) * k);
    const midX = (fx0 + fx1) / 2;
    let sumL = 0, nL = 0, sumR = 0, nR = 0;
    for (let y = Math.max(0, fy0); y < Math.min(ch, fy1); y += 2) {
      for (let x = Math.max(0, fx0); x < Math.min(cw, fx1); x += 2) {
        const i = (y * cw + x) * 4;
        if (data[i + 3] < 128) continue;
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (x < midX) { sumL += l; nL++; } else { sumR += l; nR++; }
      }
    }
    const aL = nL ? sumL / nL : 0;
    const aR = nR ? sumR / nR : 0;
    luminance = nL + nR ? (sumL + sumR) / (nL + nR) : 0;
    lightImbalance = Math.max(aL, aR) > 0 ? Math.abs(aL - aR) / Math.max(aL, aR) : 0;
  }

  const shapes = result.faceBlendshapes?.[best]?.categories;
  const blinkL = blendScore(shapes, 'eyeBlinkLeft');
  const blinkR = blendScore(shapes, 'eyeBlinkRight');
  const smile = (blendScore(shapes, 'mouthSmileLeft') + blendScore(shapes, 'mouthSmileRight')) / 2;
  const jawOpen = blendScore(shapes, 'jawOpen');

  const analysis: FaceAnalysis = {
    imgW: W,
    imgH: H,
    leftEye,
    rightEye,
    crown,
    chin,
    faceCenterX,
    faceCount: faces.length,
    faceBox,
    rollDeg,
    yawDeg,
    pitchDeg,
    eyesOpen: shapes ? 1 - Math.max(blinkL, blinkR) : 1,
    smile,
    jawOpen,
    luminance,
    lightImbalance,
    hasTransparentBg,
    crownFromMask,
    backend,
  };

  if (faceAnalysisCache.size >= MAX_FACE_CACHE) {
    const firstKey = faceAnalysisCache.keys().next().value;
    if (firstKey) faceAnalysisCache.delete(firstKey);
  }
  faceAnalysisCache.set(cacheKey, analysis);

  return analysis;
}
