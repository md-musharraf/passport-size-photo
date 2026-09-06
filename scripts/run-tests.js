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
// CRYPTOGRAPHY LICENSE CRYPTO SETUP
// ==========================================
const SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
const KEY = crypto.createHash('sha256').update(SALT).digest();

function generateLicenseKey(machineId, expiryDate) {
  const cleanMachineId = machineId.trim().toLowerCase();
  const payload = `${cleanMachineId}|${expiryDate}`;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const licenseKey = iv.toString('hex') + encrypted;
  return licenseKey.toLowerCase();
}

function decryptLicenseKey(licenseKey) {
  const cleanKey = licenseKey.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (cleanKey.length <= 32) {
    throw new Error('Invalid license key format');
  }
  const ivHex = cleanKey.substring(0, 32);
  const encryptedHex = cleanKey.substring(32);
  
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  const parts = decrypted.split('|');
  if (parts.length < 2) {
    throw new Error('Decrypted payload does not contain separator');
  }
  
  return {
    machineId: parts[0],
    expirationDate: parts.slice(1).join('|'),
  };
}

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

describe('License Key Cryptography Module', () => {
  it('should encrypt and decrypt a license key successfully', () => {
    const machineId = 'f34023bd-b09e-4e4a-b5e1-88df55cc8210';
    const expiryDate = '2028-12-31';

    const key = generateLicenseKey(machineId, expiryDate);
    expect(key).toBeDefined();

    const decrypted = decryptLicenseKey(key);
    expect(decrypted.machineId).toBe(machineId);
    expect(decrypted.expirationDate).toBe(expiryDate);
  });

  it('should throw an error for invalid key sizes', () => {
    expect(() => decryptLicenseKey('short_key')).toThrow(/format/);
  });

  it('should throw decryption error for tampered key data', () => {
    const corruptedKey = 'a'.repeat(64); // 64 hex characters (valid format but random text)
    expect(() => decryptLicenseKey(corruptedKey)).toThrow();
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

    const content = fs.readFileSync(modalPath, 'utf8');
    expect(content.includes('6299019431')).toBe(true);
    expect(content.includes('devwithmusharraf@gmail.com')).toBe(true);
    expect(content.includes('md-musharraf-dev')).toBe(true);
    expect(content.includes('mush_a_rraf')).toBe(true);
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
