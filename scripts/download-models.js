// Prepares the MediaPipe Face Landmarker for fully offline use:
//   public/models/mediapipe/wasm/*            <- copied from node_modules
//   public/models/mediapipe/face_landmarker.task <- downloaded from Google
//
// The app loads these local copies first and only falls back to the CDN when
// they are missing, so desktop builds work without an internet connection.
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(__dirname, '../public/models/mediapipe');
const WASM_OUT = path.join(OUT_DIR, 'wasm');
const WASM_SRC = path.join(__dirname, '../node_modules/@mediapipe/tasks-vision/wasm');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_DEST = path.join(OUT_DIR, 'face_landmarker.task');

// FilesetResolver.forVisionTasks() picks the SIMD or no-SIMD build at run time.
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          res.resume();
          resolve(download(res.headers.location, dest, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`));
          return;
        }
        const tmp = `${dest}.part`;
        const file = fs.createWriteStream(tmp);
        res.pipe(file);
        file.on('finish', () => file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        }));
        file.on('error', (err) => {
          fs.rmSync(tmp, { force: true });
          reject(err);
        });
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(WASM_OUT, { recursive: true });

  if (!fs.existsSync(WASM_SRC)) {
    console.error('Missing node_modules/@mediapipe/tasks-vision — run `npm install` first.');
    process.exit(1);
  }
  for (const f of WASM_FILES) {
    fs.copyFileSync(path.join(WASM_SRC, f), path.join(WASM_OUT, f));
  }
  console.log(`Copied MediaPipe runtime (${WASM_FILES.length} files) to ${path.relative(process.cwd(), WASM_OUT)}`);

  if (fs.existsSync(MODEL_DEST) && fs.statSync(MODEL_DEST).size > 1_000_000) {
    console.log('Face Landmarker model already present — skipping download.');
    return;
  }
  console.log('Downloading Face Landmarker model (~3.7 MB)...');
  try {
    await download(MODEL_URL, MODEL_DEST);
    console.log('Face model ready.');
  } catch (err) {
    console.error(`Could not download the face model: ${err.message}`);
    console.error('The app will fall back to loading it online.');
    process.exitCode = 1;
  }
}

main();
