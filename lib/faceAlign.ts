// Passport auto-align math, extracted as a pure function so it can be unit-tested
// and shared by the single-photo editor and the batch pipeline.
//
// The editor renders the portrait with `object-cover` inside a frame whose aspect
// ratio is the selected preset (widthMm : heightMm), then applies:
//
//   translate(-50%,-50%) translate(Tx%,Ty%) scale(s)
//   where Tx = -(cropX-50), Ty = -(cropY-50), s = cropScale/100
//
// Working through that transform, a source point at vertical fraction `v` of the
// image lands at frame fraction:
//
//   frameFracY(v) = 0.5 + (v-0.5)*R*s + (50-cropY)/100
//
// (and symmetrically for X with Rx). R / Rx are the object-cover ratios below.
// Inverting that to place a chosen point at a chosen target is the whole job.
//
// The previous implementation used `cropPosition = 100 - facePct`, which targets
// the frame CENTRE with the wrong sign — it pushed off-centre faces further off
// centre — and scaled the head to a fixed 55% box regardless of the document
// standard. Both are fixed here.

export interface AlignPreset {
  headMinPct: number;
  headMaxPct: number;
  eyeMinPct: number;
  eyeMaxPct: number;
  widthMm: number;
  heightMm: number;
}

export interface AlignInput {
  imgW: number;
  imgH: number;
  /** Detector face-box height in pixels (eyebrow-ish to chin). */
  boxHeight: number;
  /** Detector face-box centre X in pixels. */
  faceCenterX: number;
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  preset: AlignPreset;
  /** Detector box height -> crown-to-chin head height. Matches the live meter. */
  headBoxExpansion?: number;
}

export interface AlignResult {
  cropScale: number;
  cropX: number;
  cropY: number;
  rotationDeg: number;
  /** Estimated head height as % of photo, as the compliance meter reports it. */
  estHeadPct: number;
}

/** Detector box height -> crown-to-chin head height. Shared by the aligner and
 *  the live compliance meter so the two can never disagree. */
export const HEAD_BOX_EXPANSION = 1.4;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function computePassportAlignment(inp: AlignInput): AlignResult {
  const expansion = inp.headBoxExpansion ?? 1.4;

  // --- Roll correction from the eye line -----------------------------------
  const dx = inp.rightEye.x - inp.leftEye.x;
  const dy = inp.rightEye.y - inp.leftEye.y;
  const rotationDeg = -((Math.atan2(dy, dx) * 180) / Math.PI);

  const eyeX = (inp.leftEye.x + inp.rightEye.x) / 2;
  const eyeY = (inp.leftEye.y + inp.rightEye.y) / 2;

  // --- Head size -> preset head band (kept consistent with the live meter) --
  const faceBoxRatio = inp.boxHeight / inp.imgH;
  const targetHeadPct = (inp.preset.headMinPct + inp.preset.headMaxPct) / 2;
  // meter model: headPct = faceBoxRatio * expansion * cropScale
  const cropScale = clamp(targetHeadPct / (faceBoxRatio * expansion), 50, 200);
  const s = cropScale / 100;

  // --- object-cover ratios (image aspect vs frame aspect) ------------------
  const a = inp.imgW / inp.imgH; // image aspect
  const f = inp.preset.widthMm / inp.preset.heightMm; // frame aspect
  const R = a >= f ? 1 : f / a; // vertical cover ratio
  const Rx = a >= f ? a / f : 1; // horizontal cover ratio

  // --- Horizontal: centre the face (target frame fraction 0.5) -------------
  const u = clamp(eyeX / inp.imgW, 0, 1); // eye midline is a stabler centre than box centre
  const uFace = clamp(inp.faceCenterX / inp.imgW, 0, 1);
  const uc = (u + uFace) / 2; // blend eye midline + box centre
  const cropX = clamp(50 + 100 * (uc - 0.5) * Rx * s, 0, 100);

  // --- Vertical: put the eye line into the preset eye band ------------------
  const v = clamp(eyeY / inp.imgH, 0, 1);
  const targetEyeFrac = (inp.preset.eyeMinPct + inp.preset.eyeMaxPct) / 2 / 100;
  const cropY = clamp(100 - 100 * targetEyeFrac + 100 * (v - 0.5) * R * s, 0, 100);

  const estHeadPct = Math.round(faceBoxRatio * expansion * cropScale);

  return {
    cropScale: Math.round(cropScale),
    cropX: Math.round(cropX),
    cropY: Math.round(cropY),
    rotationDeg: Math.round(rotationDeg * 10) / 10,
    estHeadPct,
  };
}
