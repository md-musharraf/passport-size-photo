// Passport auto-align math, kept as pure functions so it can be unit-tested
// (scripts/test-face-align.mjs) and shared by the single-photo editor, the
// batch pipeline and the live compliance meter.
//
// The editor renders the portrait with `object-cover` inside a frame whose
// aspect ratio is the selected preset (widthMm : heightMm), then applies:
//
//   translate(-50%,-50%) translate(Tx%,Ty%) scale(s) rotate(θ)
//   where Tx = -(cropX-50), Ty = -(cropY-50), s = cropScale/100
//
// The PDF/PNG renderers draw with the exact same transform order, so mapping a
// source pixel through `projectToFrame` tells us precisely where it lands on
// the printed photo. Alignment is just that mapping solved in reverse.
//
// Units: work in "frame units" where the frame is f wide and 1 tall
// (f = widthMm / heightMm). object-cover draws the image Rx·f wide and R tall.

export interface Point {
  x: number;
  y: number;
}

export interface AlignPreset {
  headMinPct: number;
  headMaxPct: number;
  eyeMinPct: number;
  eyeMaxPct: number;
  widthMm: number;
  heightMm: number;
}

/** Facial geometry in source-image pixels (as returned by lib/faceLandmarker). */
export interface FaceGeometry {
  imgW: number;
  imgH: number;
  /** Eye centres; order does not matter. */
  leftEye: Point;
  rightEye: Point;
  /** Top of the head (hair included) and bottom of the chin. */
  crown: Point;
  chin: Point;
  /** Horizontal centre of the face. */
  faceCenterX: number;
}

/** The editor's crop state. */
export interface FrameView {
  cropX: number;
  cropY: number;
  cropScale: number;
  rotationDeg: number;
}

export interface AlignResult extends FrameView {
  /** Head height (crown to chin) as % of the photo height after alignment. */
  estHeadPct: number;
}

export interface FramingMeasurement {
  /** Crown-to-chin height as % of photo height. */
  headPct: number;
  /** Eye line, % of photo height measured from the top. */
  eyePct: number;
  /** Face centre, % of photo width measured from the left. */
  centerPct: number;
  /** Top of head, % from the top (negative = cut off). */
  crownPct: number;
  /** Chin, % from the top (over 100 = cut off). */
  chinPct: number;
  /** Remaining head tilt in degrees after the current rotation. */
  residualTiltDeg: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Zoom range the editor exposes; alignment never leaves it. */
export const MIN_CROP_SCALE = 30;
export const MAX_CROP_SCALE = 300;
/** Pan range (%). Going past 0/100 lets a face near the photo edge still be
 *  centred; the uncovered area simply shows the backdrop colour. */
export const MIN_CROP_POS = -50;
export const MAX_CROP_POS = 150;

/** Keep at least this much of the frame above the crown when we can. */
const MIN_TOP_MARGIN = 0.03;

function coverRatios(imgW: number, imgH: number, preset: AlignPreset) {
  const a = imgW / imgH; // image aspect
  const f = preset.widthMm / preset.heightMm; // frame aspect
  return {
    f,
    R: a >= f ? 1 : f / a, // drawn height / frame height
    Rx: a >= f ? a / f : 1, // drawn width / frame width
  };
}

/** Roll of the eye line, in degrees (positive = right eye lower on screen). */
export function eyeRollDeg(a: Point, b: Point): number {
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  return (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
}

/** Map a source pixel to frame fractions (0..1 inside the photo). */
export function projectToFrame(
  p: Point,
  img: { imgW: number; imgH: number },
  preset: AlignPreset,
  view: FrameView,
): Point {
  const { f, R, Rx } = coverRatios(img.imgW, img.imgH, preset);
  const px = (p.x / img.imgW - 0.5) * Rx * f;
  const py = (p.y / img.imgH - 0.5) * R;
  const th = (view.rotationDeg * Math.PI) / 180;
  const rx = px * Math.cos(th) - py * Math.sin(th);
  const ry = px * Math.sin(th) + py * Math.cos(th);
  const s = view.cropScale / 100;
  return {
    x: 0.5 + (s * rx) / f + (50 - view.cropX) / 100,
    y: 0.5 + s * ry + (50 - view.cropY) / 100,
  };
}

/** Where the important facial features currently land on the photo. */
export function measureFraming(
  g: FaceGeometry,
  preset: AlignPreset,
  view: FrameView,
): FramingMeasurement {
  const { f } = coverRatios(g.imgW, g.imgH, preset);
  const eyeMid = { x: (g.leftEye.x + g.rightEye.x) / 2, y: (g.leftEye.y + g.rightEye.y) / 2 };
  const crown = projectToFrame(g.crown, g, preset, view);
  const chin = projectToFrame(g.chin, g, preset, view);
  const eye = projectToFrame(eyeMid, g, preset, view);
  const center = projectToFrame({ x: g.faceCenterX, y: eyeMid.y }, g, preset, view);
  const headLen = Math.hypot((chin.x - crown.x) * f, chin.y - crown.y);
  return {
    headPct: round1(headLen * 100),
    eyePct: round1(eye.y * 100),
    centerPct: round1(center.x * 100),
    crownPct: round1(crown.y * 100),
    chinPct: round1(chin.y * 100),
    residualTiltDeg: round1(eyeRollDeg(g.leftEye, g.rightEye) + view.rotationDeg),
  };
}

/**
 * Solve the crop so the head height sits in the middle of the preset's head
 * band, the eye line sits in the middle of its eye band, the face is centred
 * horizontally and the eye line is level.
 */
export function computePassportAlignment(g: FaceGeometry, preset: AlignPreset): AlignResult {
  const { f, R, Rx } = coverRatios(g.imgW, g.imgH, preset);

  // Level the eyes.
  const rotationDeg = round1(-eyeRollDeg(g.leftEye, g.rightEye));
  const th = (rotationDeg * Math.PI) / 180;

  // Head size: drawn head height in frame units is (headLen/imgH)·R·s.
  const headLen = Math.max(1, Math.hypot(g.chin.x - g.crown.x, g.chin.y - g.crown.y));
  const targetHead = (preset.headMinPct + preset.headMaxPct) / 200;
  const cropScale = round1(clamp((targetHead / ((headLen / g.imgH) * R)) * 100, MIN_CROP_SCALE, MAX_CROP_SCALE));
  const s = cropScale / 100;

  // Reference point: eye-line height, horizontally between the eye midpoint
  // and the face centre (more stable than either alone on a turned head).
  const eyeMid = { x: (g.leftEye.x + g.rightEye.x) / 2, y: (g.leftEye.y + g.rightEye.y) / 2 };
  const ref = { x: (eyeMid.x + g.faceCenterX) / 2, y: eyeMid.y };
  const px = (ref.x / g.imgW - 0.5) * Rx * f;
  const py = (ref.y / g.imgH - 0.5) * R;
  const rx = px * Math.cos(th) - py * Math.sin(th);
  const ry = px * Math.sin(th) + py * Math.cos(th);

  const targetEye = (preset.eyeMinPct + preset.eyeMaxPct) / 200;
  let cropX = 50 + (100 * s * rx) / f;
  let cropY = 50 + 100 * (s * ry + 0.5 - targetEye);

  // If the hair would be cut off at the top, move the photo down — but never
  // so far that the eye line leaves its band.
  const view: FrameView = { cropX, cropY, cropScale, rotationDeg };
  const crownY = projectToFrame(g.crown, g, preset, view).y;
  if (crownY < MIN_TOP_MARGIN) {
    const room = preset.eyeMaxPct / 100 - targetEye;
    const shift = Math.min(MIN_TOP_MARGIN - crownY, Math.max(0, room));
    cropY -= shift * 100;
  }

  cropX = round1(clamp(cropX, MIN_CROP_POS, MAX_CROP_POS));
  cropY = round1(clamp(cropY, MIN_CROP_POS, MAX_CROP_POS));

  const final: FrameView = { cropX, cropY, cropScale, rotationDeg };
  return { ...final, estHeadPct: measureFraming(g, preset, final).headPct };
}
