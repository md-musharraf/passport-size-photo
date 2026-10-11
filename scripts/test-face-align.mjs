// Unit tests for lib/faceAlign.ts (run with `npm test`; Node 22+ strips the
// TypeScript types natively).
import assert from 'node:assert/strict';
import {
  computePassportAlignment,
  measureFraming,
  projectToFrame,
} from '../lib/faceAlign.ts';

let passed = 0;
const failures = [];
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}
const near = (actual, expected, tol, what) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: expected ${expected} ±${tol}, got ${actual}`);

const PRESETS = {
  us: { widthMm: 50.8, heightMm: 50.8, headMinPct: 50, headMaxPct: 69, eyeMinPct: 34, eyeMaxPct: 45 },
  in: { widthMm: 35, heightMm: 45, headMinPct: 60, headMaxPct: 80, eyeMinPct: 30, eyeMaxPct: 45 },
  ca: { widthMm: 50, heightMm: 70, headMinPct: 44, headMaxPct: 51, eyeMinPct: 30, eyeMaxPct: 40 },
};

// Synthetic face: eyes, crown and chin around a centre point, optionally rolled.
function face(imgW, imgH, { cx, cy, headH, rollDeg = 0 }) {
  const th = (rollDeg * Math.PI) / 180;
  const rot = (dx, dy) => ({ x: cx + dx * Math.cos(th) - dy * Math.sin(th), y: cy + dx * Math.sin(th) + dy * Math.cos(th) });
  const eyeDy = -headH * 0.08;
  return {
    imgW,
    imgH,
    leftEye: rot(-headH * 0.15, eyeDy),
    rightEye: rot(headH * 0.15, eyeDy),
    crown: rot(0, -headH * 0.5),
    chin: rot(0, headH * 0.5),
    faceCenterX: rot(0, eyeDy).x,
  };
}

// Independent re-implementation of the canvas renderer used for PNG/PDF export
// (components/BatchWorkspace.tsx renderPassportItem): object-cover draw, then
// translate → scale → rotate around the canvas centre.
function canvasProject(p, g, preset, view) {
  const cw = preset.widthMm * 10;
  const ch = preset.heightMm * 10;
  const fit = Math.max(cw / g.imgW, ch / g.imgH);
  const lx = p.x * fit - (g.imgW * fit) / 2;
  const ly = p.y * fit - (g.imgH * fit) / 2;
  const th = (view.rotationDeg * Math.PI) / 180;
  const s = view.cropScale / 100;
  const rx = (lx * Math.cos(th) - ly * Math.sin(th)) * s;
  const ry = (lx * Math.sin(th) + ly * Math.cos(th)) * s;
  const x = cw / 2 + ((50 - view.cropX) / 100) * cw + rx;
  const y = ch / 2 + ((50 - view.cropY) / 100) * ch + ry;
  return { x: x / cw, y: y / ch };
}

console.log('\n=== Running: Passport auto-alignment ===');

const cases = [
  ['portrait phone photo → US square', 3000, 4000, PRESETS.us],
  ['landscape photo → India 35x45', 1600, 1200, PRESETS.in],
  ['square photo → Canada 50x70', 1000, 1000, PRESETS.ca],
  ['portrait photo → India 35x45', 820, 1024, PRESETS.in],
];

for (const [name, w, h, preset] of cases) {
  for (const rollDeg of [0, 7]) {
    it(`${name}${rollDeg ? ' (head tilted 7°)' : ''}: head and eyes land in band`, () => {
      const g = face(w, h, { cx: w * 0.42, cy: h * 0.38, headH: h * 0.28, rollDeg });
      const a = computePassportAlignment(g, preset);
      const m = measureFraming(g, preset, a);
      near(m.headPct, (preset.headMinPct + preset.headMaxPct) / 2, 0.6, 'head %');
      near(m.eyePct, (preset.eyeMinPct + preset.eyeMaxPct) / 2, 0.8, 'eye %');
      near(m.centerPct, 50, 0.8, 'centre %');
      near(m.residualTiltDeg, 0, 0.11, 'residual tilt');
      near(a.rotationDeg, -rollDeg, 0.11, 'rotation');
    });
  }
}

it('fixes the old object-cover bug: tall photo in a square frame is not oversized', () => {
  // Previously the scale ignored the cover ratio, so a 3:4 photo in the US
  // square frame came out with a head ~33% too big (outside the 50–69% band).
  const g = face(3000, 4000, { cx: 1500, cy: 1500, headH: 1200 });
  const a = computePassportAlignment(g, PRESETS.us);
  const m = measureFraming(g, PRESETS.us, a);
  assert.ok(m.headPct >= 50 && m.headPct <= 69, `head ${m.headPct}% outside US band`);
});

it('keeps the top of the head inside the frame when there is room in the eye band', () => {
  // Very tall hair: crown far above the eyes.
  const g = face(1000, 1300, { cx: 500, cy: 520, headH: 420 });
  g.crown = { x: 500, y: 520 - 420 * 0.85 };
  const a = computePassportAlignment(g, PRESETS.in);
  const m = measureFraming(g, PRESETS.in, a);
  assert.ok(m.crownPct >= 2.5 || m.eyePct >= PRESETS.in.eyeMaxPct - 0.5, `crown ${m.crownPct}% cut off`);
  assert.ok(m.eyePct <= PRESETS.in.eyeMaxPct + 0.5, `eye ${m.eyePct}% left the band`);
});

it('preview projection matches the PNG/PDF canvas renderer exactly', () => {
  const g = face(1200, 1600, { cx: 640, cy: 560, headH: 500, rollDeg: -5 });
  for (const preset of Object.values(PRESETS)) {
    const view = { cropX: 37, cropY: 61, cropScale: 143, rotationDeg: 6.5 };
    for (const p of [g.leftEye, g.chin, g.crown, { x: 0, y: 0 }, { x: 1200, y: 1600 }]) {
      const a = projectToFrame(p, g, preset, view);
      const b = canvasProject(p, g, preset, view);
      near(a.x, b.x, 1e-9, 'x');
      near(a.y, b.y, 1e-9, 'y');
    }
  }
});

it('clamps zoom to the editor range for tiny or huge faces', () => {
  const tiny = computePassportAlignment(face(4000, 3000, { cx: 2000, cy: 1500, headH: 60 }), PRESETS.in);
  const huge = computePassportAlignment(face(800, 1000, { cx: 400, cy: 500, headH: 2400 }), PRESETS.in);
  assert.equal(tiny.cropScale, 300);
  assert.equal(huge.cropScale, 30);
});

console.log(`\nface-align: ${passed}/${passed + failures.length} passed`);
if (failures.length) process.exit(1);
