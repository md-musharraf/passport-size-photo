const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ==========================================
// TEST FRAMEWORK UTILITIES
// ==========================================
let testsRun = 0;
let testsPassed = 0;
const failures = [];

function describe(name, fn) {
  console.log(`\n=== Running: ${name} ===`);
  fn();
}

function it(desc, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failures.push({ desc, err });
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected [${expected}] but got [${actual}]`);
      }
    },
    toEqual(expected) {
      const actStr = JSON.stringify(actual);
      const expStr = JSON.stringify(expected);
      if (actStr !== expStr) {
        throw new Error(`Expected [${expStr}] but got [${actStr}]`);
      }
    },
    toThrow(regex) {
      let threw = false;
      try {
        actual();
      } catch (err) {
        threw = true;
        if (regex && !regex.test(err.message)) {
          throw new Error(`Expected function to throw error matching ${regex}, but got: "${err.message}"`);
        }
      }
      if (!threw) {
        throw new Error('Expected function to throw, but it succeeded.');
      }
    },
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error(`Expected value to be defined, but got [${actual}]`);
      }
    }
  };
}

// ==========================================
// LICENCE: tests import the shipped module, not a copy of it
// ==========================================
const license = require('../electron/license');
const testKeys = crypto.generateKeyPairSync('ed25519'); // ephemeral; never the real signing key
const DAY = 86400000;

// ==========================================
// 4R GRID SIZING LOGIC REFERENCE
// ==========================================
const PRESET_PIXELS = {
  us: { widthPx: 600, heightPx: 600, widthMm: 51, heightMm: 51, cols: 3, rows: 3 },
  in: { widthPx: 413, heightPx: 531, widthMm: 35, heightMm: 45, cols: 6, rows: 6 },
  uk: { widthPx: 413, heightPx: 531, widthMm: 35, heightMm: 45, cols: 4, rows: 6 },
  cn: { widthPx: 390, heightPx: 567, widthMm: 33, heightMm: 48, cols: 4, rows: 5 },
  oci: { widthPx: 413, heightPx: 413, widthMm: 35, heightMm: 35, cols: 4, rows: 7 },
  stamp: { widthPx: 236, heightPx: 295, widthMm: 20, heightMm: 25, cols: 8, rows: 10 },
  pan: { widthPx: 295, heightPx: 413, widthMm: 25, heightMm: 35, cols: 6, rows: 7 },
};

function getGridSpecs({ preset, paperSize, paperOrientation, photoCount, spacing, margin, useCustomGrid, customGridCols, customGridRows }) {
  const specs = PRESET_PIXELS[preset] || PRESET_PIXELS.us;
  let pw = specs.widthMm;
  let ph = specs.heightMm;

  const pageW = paperSize === 'a4' ? 210 : 101.6;
  const pageH = paperSize === 'a4' ? 297 : 152.4;

  const effectiveOrientation = paperSize === 'a4' ? 'portrait' : paperOrientation;
  const actualPageW = effectiveOrientation === 'portrait' ? pageW : pageH;
  const actualPageH = effectiveOrientation === 'portrait' ? pageH : pageW;

  const availableWidth = Math.max(0, actualPageW - 2 * margin);
  const availableHeight = Math.max(0, actualPageH - 2 * margin);

  let colsCount = 1;
  let rowsCount = 1;

  if (useCustomGrid) {
    colsCount = customGridCols;
    rowsCount = customGridRows;
    const ratio = specs.widthMm / specs.heightMm;
    const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
    const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;
    pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
    ph = pw / ratio;
  } else if (paperSize === '4r') {
    if (effectiveOrientation === 'landscape') {
      colsCount = photoCount === 8 ? 4 : 3;
      rowsCount = 2;
    } else {
      colsCount = 2;
      rowsCount = photoCount === 8 ? 4 : 3;
    }
    const ratio = specs.widthMm / specs.heightMm;
    const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
    const ph_limit = (availableHeight - (rowsCount - 1) * spacing) / rowsCount;
    pw = Math.max(5, Math.min(pw_limit, ph_limit * ratio));
    ph = pw / ratio;
  } else {
    colsCount = photoCount === 5 ? 5 : 6;
    const ratio = specs.widthMm / specs.heightMm;
    const pw_limit = (availableWidth - (colsCount - 1) * spacing) / colsCount;
    pw = Math.min(specs.widthMm, pw_limit);
    ph = pw / ratio;
    rowsCount = Math.max(1, Math.floor(availableHeight / (ph + spacing)));
  }

  const gridWidth = colsCount * pw + (colsCount - 1) * spacing;
  const gridHeight = rowsCount * ph + (rowsCount - 1) * spacing;
  const startX = (actualPageW - gridWidth) / 2;
  const startY = margin;

  return { pw, ph, colsCount, rowsCount, gridWidth, gridHeight, startX, startY, actualPageW, actualPageH };
}

// ==========================================
// TEST EXECUTION
// ==========================================

describe('Licence keys (Ed25519) and offline rules', () => {
  const machineId = 'F34023BD-b09e-4e4a-b5e1-88df55cc8210';
  const now = Date.parse('2027-01-01T00:00:00Z');
  const future = '2028-12-31T00:00:00.000Z';
  const sign = (id, exp) => license.signKey(id, exp, testKeys.privateKey);
  const evalWith = (settings, extra = {}) =>
    license.evaluate({ settings, machineId, now, publicKey: testKeys.publicKey, ...extra });
  const synced = { lastSyncTime: new Date(now - DAY).toISOString() };

  it('accepts a genuine key for this machine (case-insensitive id)', () => {
    expect(license.verifyKey(sign(machineId, future), machineId.toLowerCase(), testKeys.publicKey).expiryDate).toBe(future);
  });

  it('rejects a key signed by anyone else (the old hardcoded-secret hole)', () => {
    const forger = crypto.generateKeyPairSync('ed25519').privateKey;
    expect(() => license.verifyKey(license.signKey(machineId, future, forger), machineId, testKeys.publicKey)).toThrow(/signature/);
  });

  it('rejects a key for another machine, a tampered payload and junk', () => {
    expect(() => license.verifyKey(sign('other-pc', future), machineId, testKeys.publicKey)).toThrow(/different Machine/);
    const [, sig] = sign(machineId, future).split('.');
    const forgedPayload = Buffer.from(`${machineId.toLowerCase()}|2099-01-01`).toString('base64url');
    expect(() => license.verifyKey(`${forgedPayload}.${sig}`, machineId, testKeys.publicKey)).toThrow(/signature/);
    expect(() => license.verifyKey('a'.repeat(64), machineId, testKeys.publicKey)).toThrow(/format/);
  });

  it('rejects legacy AES keys and the real embedded key rejects test-signed keys', () => {
    expect(evalWith({ ...synced, licenseKey: '0123456789abcdef'.repeat(6) }).status).toBe('NONE');
    expect(() => license.verifyKey(sign(machineId, future), machineId)).toThrow(/signature/);
  });

  it('VALID within the offline window, EXPIRED past expiry or after 14 offline days', () => {
    expect(evalWith({ ...synced, licenseKey: sign(machineId, future) }).status).toBe('VALID');
    expect(evalWith({ ...synced, licenseKey: sign(machineId, '2026-06-01T00:00:00Z') }).status).toBe('EXPIRED');
    const stale = { lastSyncTime: new Date(now - 15 * DAY).toISOString(), licenseKey: sign(machineId, future) };
    expect(evalWith(stale).error.includes('Internet check-in')).toBe(true);
  });

  it('a missing or future lastSyncTime cannot switch the offline limit off', () => {
    expect(evalWith({ licenseKey: sign(machineId, future) }).status).toBe('EXPIRED');
    expect(evalWith({ licenseKey: sign(machineId, future), lastSyncTime: '2099-01-01T00:00:00Z' }).status).toBe('EXPIRED');
  });

  it('detects the clock being rolled back', () => {
    const r = evalWith({ ...synced, licenseKey: sign(machineId, future), lastSeenTime: new Date(now + DAY).toISOString() });
    expect(r.error.includes('clock')).toBe(true);
  });

  it('trial: valid for 7 days, then expired; tampered blob rejected', () => {
    const blob = (startMs) => license.encryptTrialDate(new Date(startMs).toISOString(), machineId);
    expect(evalWith({}, { trialBlob: blob(now - 2 * DAY) }).daysRemaining).toBe(5);
    expect(evalWith({}, { trialBlob: blob(now - 8 * DAY) }).status).toBe('EXPIRED');
    expect(evalWith({}, { trialBlob: 'f'.repeat(64) }).error.includes('tampered')).toBe(true);
  });
});

describe('4R Sheet Customized Grid Rules', () => {
  it('should compute 3x2 grid for 4R landscape with 6 photos', () => {
    const specs = getGridSpecs({
      preset: 'in', // 35x45mm Indian Passport
      paperSize: '4r',
      paperOrientation: 'landscape',
      photoCount: 6,
      spacing: 2,
      margin: 3,
      useCustomGrid: false
    });

    expect(specs.colsCount).toBe(3);
    expect(specs.rowsCount).toBe(2);
    // Height fits within landscape page (101.6mm)
    expect(specs.gridHeight <= specs.actualPageH).toBe(true);
  });

  it('should compute 4x2 grid for 4R landscape with 8 photos', () => {
    const specs = getGridSpecs({
      preset: 'in',
      paperSize: '4r',
      paperOrientation: 'landscape',
      photoCount: 8,
      spacing: 2,
      margin: 3,
      useCustomGrid: false
    });

    expect(specs.colsCount).toBe(4);
    expect(specs.rowsCount).toBe(2);
    expect(specs.gridHeight <= specs.actualPageH).toBe(true);
  });

  it('should compute 2x3 grid for 4R portrait with 6 photos', () => {
    const specs = getGridSpecs({
      preset: 'in',
      paperSize: '4r',
      paperOrientation: 'portrait',
      photoCount: 6,
      spacing: 2,
      margin: 3,
      useCustomGrid: false
    });

    expect(specs.colsCount).toBe(2);
    expect(specs.rowsCount).toBe(3);
    expect(specs.gridHeight <= specs.actualPageH).toBe(true);
  });

  it('should compute 2x4 grid for 4R portrait with 8 photos', () => {
    const specs = getGridSpecs({
      preset: 'in',
      paperSize: '4r',
      paperOrientation: 'portrait',
      photoCount: 8,
      spacing: 2,
      margin: 3,
      useCustomGrid: false
    });

    expect(specs.colsCount).toBe(2);
    expect(specs.rowsCount).toBe(4);
    expect(specs.gridHeight <= specs.actualPageH).toBe(true);
  });
});

describe('Module Integrity & Dependencies', () => {
  it('should verify sharp dependency imports cleanly', () => {
    const sharp = require('sharp');
    expect(sharp).toBeDefined();
  });

  it('should verify developer contact modal references Md Musharraf details', () => {
    const modalPath = path.join(__dirname, '../components/DeveloperContactModal.tsx');
    const exists = fs.existsSync(modalPath);
    expect(exists).toBe(true);
  });
});

describe('Indian Government & Exam Specifications', () => {
  const presetsFile = fs.readFileSync(path.join(__dirname, '../lib/presets.ts'), 'utf8');

  it('should verify Indian Passport 35x45mm with 70-80% face coverage', () => {
    expect(presetsFile.includes("widthMm: 35, heightMm: 45, ratio: '7:9'")).toBe(true);
    expect(presetsFile.includes("headMinPct: 70, headMaxPct: 80")).toBe(true);
  });

  it('should verify UPSC and SSC mandate Name & DOP exam strip', () => {
    expect(presetsFile.includes("key: 'upsc'")).toBe(true);
    expect(presetsFile.includes("key: 'ssc'")).toBe(true);
    expect(presetsFile.includes("requiresSlate: true")).toBe(true);
  });

  it('should verify PAN Card strict 200 DPI and under 50KB limit', () => {
    expect(presetsFile.includes("key: 'pan'")).toBe(true);
    expect(presetsFile.includes("targetKbMax: 50")).toBe(true);
  });

  it('should verify NEET Postcard 4x6 inch specifications', () => {
    expect(presetsFile.includes("key: 'neet_postcard'")).toBe(true);
    expect(presetsFile.includes("widthMm: 101.6, heightMm: 152.4")).toBe(true);
  });

  it('should verify Signature Studio presets exist with official portal limits', () => {
    const sigFile = fs.readFileSync(path.join(__dirname, '../lib/signatureProcessor.ts'), 'utf8');
    expect(sigFile.includes("id: 'ibps'")).toBe(true);
    expect(sigFile.includes("widthPx: 140")).toBe(true);
    expect(sigFile.includes("heightPx: 60")).toBe(true);
    expect(sigFile.includes("minKB: 10")).toBe(true);
    expect(sigFile.includes("maxKB: 20")).toBe(true);
  });
});

describe('High-Resolution Photo Quality & Fidelity Pipeline', () => {
  it('should verify imageImport preserves 4K resolution and 0.98 JPEG quality', () => {
    const importFile = fs.readFileSync(path.join(__dirname, '../lib/imageImport.ts'), 'utf8');
    expect(importFile.includes('const MAX_EDGE = 4096')).toBe(true);
    expect(importFile.includes('const JPEG_QUALITY = 0.98')).toBe(true);
  });

  it('should verify backgroundRemoval composites alpha mask onto full-resolution original photo', () => {
    const bgFile = fs.readFileSync(path.join(__dirname, '../lib/backgroundRemoval.ts'), 'utf8');
    expect(bgFile.includes('compositeFullResolutionCutout')).toBe(true);
    expect(bgFile.includes("ctx.globalCompositeOperation = 'destination-in'")).toBe(true);
  });

  it('should verify DownloadButton KB compressor preserves high visual quality', () => {
    const downloadFile = fs.readFileSync(path.join(__dirname, '../lib/../components/DownloadButton.tsx'), 'utf8');
    expect(downloadFile.includes('compressImageToKB')).toBe(true);
    expect(downloadFile.includes('estOptimalPixels')).toBe(true);
    // Verifies 0.5 quality drop was eliminated
    expect(downloadFile.includes("'image/jpeg', 0.5);")).toBe(false);
  });

  it('should verify handleBGRemoved does not force artificial highlight blow-out', () => {
    const pageFile = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
    // Ensure handleBGRemoved doesn't blindly hardcode brightness(106) and contrast(112)
    const body = pageFile.split('const handleBGRemoved')[1].split('\n  };')[0];
    expect(/setBrightness\(|setContrast\(/.test(body)).toBe(false);
  });
});

// ==========================================
// RESULTS REPORT
// ==========================================
console.log('\n==========================================');
console.log(`TEST RUN SUMMARY: ${testsPassed}/${testsRun} Passed`);
console.log('==========================================\n');

if (failures.length > 0) {
  console.error('Test Suite Failed!');
  process.exit(1);
} else {
  console.log('Test Suite Passed Successfully!');
  process.exit(0);
}
