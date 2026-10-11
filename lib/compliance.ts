// Live photo-compliance checklist. Pure function of the last face analysis and
// the current crop, so it updates instantly while the operator drags or zooms
// (no re-detection needed) and can be unit-tested.

import { measureFraming, type AlignPreset, type FrameView } from './faceAlign';
import type { FaceAnalysis } from './faceLandmarker';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ComplianceCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Short hint shown when the check is not passing. */
  hint?: string;
}

export interface ComplianceReport {
  checks: ComplianceCheck[];
  overall: CheckStatus;
  passed: number;
}

type Signals = Pick<
  FaceAnalysis,
  | 'imgW' | 'imgH' | 'leftEye' | 'rightEye' | 'crown' | 'chin' | 'faceCenterX'
  | 'faceCount' | 'yawDeg' | 'pitchDeg' | 'eyesOpen' | 'smile' | 'jawOpen'
  | 'luminance' | 'lightImbalance'
>;

const band = (v: number, lo: number, hi: number, slack: number): CheckStatus =>
  v >= lo && v <= hi ? 'pass' : v >= lo - slack && v <= hi + slack ? 'warn' : 'fail';

export function evaluateCompliance(
  face: Signals,
  preset: AlignPreset,
  view: FrameView,
  opts: { backgroundRemoved: boolean },
): ComplianceReport {
  const m = measureFraming(face, preset, view);
  const checks: ComplianceCheck[] = [];

  const head = band(m.headPct, preset.headMinPct, preset.headMaxPct, 5);
  checks.push({
    id: 'head',
    label: 'Head size',
    status: m.crownPct < -1 || m.chinPct > 101 ? 'fail' : head,
    detail: `${Math.round(m.headPct)}% (needs ${preset.headMinPct}–${preset.headMaxPct}%)`,
    hint: m.crownPct < -1 ? 'Top of head is cut off — zoom out' : m.headPct < preset.headMinPct ? 'Zoom in a little' : 'Zoom out a little',
  });

  checks.push({
    id: 'eyes-level',
    label: 'Eye height',
    status: band(m.eyePct, preset.eyeMinPct, preset.eyeMaxPct, 4),
    detail: `${Math.round(m.eyePct)}% from top (needs ${preset.eyeMinPct}–${preset.eyeMaxPct}%)`,
    hint: m.eyePct < preset.eyeMinPct ? 'Move the photo down' : 'Move the photo up',
  });

  checks.push({
    id: 'center',
    label: 'Centered',
    status: band(m.centerPct, 46, 54, 6),
    detail: `${Math.round(m.centerPct)}% from left`,
    hint: m.centerPct < 50 ? 'Move the photo right' : 'Move the photo left',
  });

  const tilt = Math.abs(m.residualTiltDeg);
  checks.push({
    id: 'tilt',
    label: 'Head straight',
    status: tilt <= 2 ? 'pass' : tilt <= 6 ? 'warn' : 'fail',
    detail: `${m.residualTiltDeg > 0 ? '+' : ''}${m.residualTiltDeg.toFixed(1)}° tilt`,
    hint: 'Use Auto-align or the Rotate slider',
  });

  const turn = Math.max(Math.abs(face.yawDeg), Math.abs(face.pitchDeg));
  checks.push({
    id: 'facing',
    label: 'Facing camera',
    status: turn <= 10 ? 'pass' : turn <= 18 ? 'warn' : 'fail',
    detail: turn <= 10 ? 'Looking straight' : Math.abs(face.yawDeg) >= Math.abs(face.pitchDeg) ? 'Head turned sideways' : 'Head tilted up/down',
    hint: 'Retake with the face square to the camera',
  });

  checks.push({
    id: 'eyes-open',
    label: 'Eyes open',
    status: face.eyesOpen >= 0.55 ? 'pass' : face.eyesOpen >= 0.35 ? 'warn' : 'fail',
    detail: face.eyesOpen >= 0.55 ? 'Clearly visible' : 'Eyes look closed',
    hint: 'Retake with eyes fully open',
  });

  const expressive = Math.max(face.smile, face.jawOpen * 1.4);
  checks.push({
    id: 'expression',
    label: 'Neutral expression',
    status: expressive < 0.45 ? 'pass' : expressive < 0.75 ? 'warn' : 'fail',
    detail: expressive < 0.45 ? 'Mouth closed' : face.jawOpen * 1.4 > face.smile ? 'Mouth open' : 'Smiling',
    hint: 'Most passports need a closed-mouth, neutral face',
  });

  const lum = face.luminance;
  const lightStatus: CheckStatus =
    lum >= 105 && lum <= 215 && face.lightImbalance <= 0.22 ? 'pass'
      : lum >= 80 && lum <= 235 && face.lightImbalance <= 0.4 ? 'warn'
        : 'fail';
  checks.push({
    id: 'light',
    label: 'Even lighting',
    status: lightStatus,
    detail: face.lightImbalance > 0.22 ? 'Shadow on one side' : lum < 105 ? 'A bit dark' : lum > 215 ? 'A bit bright' : 'Balanced',
    hint: lum < 105 ? 'Try Auto enhance or raise Brightness' : 'Use soft, even front light',
  });

  checks.push({
    id: 'background',
    label: 'Plain background',
    status: opts.backgroundRemoved ? 'pass' : 'warn',
    detail: opts.backgroundRemoved ? 'Background replaced' : 'Original background',
    hint: 'Run Remove background',
  });

  if (face.faceCount > 1) {
    checks.push({
      id: 'single',
      label: 'One person only',
      status: 'warn',
      detail: `${face.faceCount} faces found`,
      hint: 'Crop so only the applicant is in the photo',
    });
  }

  const overall: CheckStatus = checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'pass';
  return { checks, overall, passed: checks.filter((c) => c.status === 'pass').length };
}
