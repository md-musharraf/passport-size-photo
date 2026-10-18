const fs = require('fs');
const path = require('path');

const BG_MODELS_DIR = path.join(__dirname, '../public/models/background-removal');
const OUT_MODELS_DIR = path.join(__dirname, '../out/models/background-removal');
const BASE_URL = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';

// Ensure directories exist
if (!fs.existsSync(BG_MODELS_DIR)) {
  fs.mkdirSync(BG_MODELS_DIR, { recursive: true });
}

async function downloadFileWithRetry(url, dest, retries = 3) {
  // If file already exists and is non-empty, skip
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buffer);
      return;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Failed to download ${path.basename(dest)} after ${retries} attempts: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function runPool(items, limit, fn) {
  let index = 0;
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item, index++));
    executing.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(executing);
}

async function main() {
  console.log('----------------------------------------------------');
  console.log('🤖 AI Background Removal Offline Models Downloader');
  console.log('----------------------------------------------------');
  console.log(`Target directory: ${BG_MODELS_DIR}\n`);

  // 1. Download resources.json first
  console.log('Step 1: Downloading resources metadata...');
  const resourcesPath = path.join(BG_MODELS_DIR, 'resources.json');
  try {
    await downloadFileWithRetry(`${BASE_URL}resources.json`, resourcesPath);
    console.log('✓ resources.json downloaded successfully.');
  } catch (err) {
    console.error('Failed to download resources.json. Please check your internet connection.', err.message);
    process.exit(1);
  }

  // 2. Read resources.json to find all chunks
  const resources = JSON.parse(fs.readFileSync(resourcesPath, 'utf8'));
  const fileHashes = new Set();

  for (const key in resources) {
    const entry = resources[key];
    if (entry && entry.chunks) {
      entry.chunks.forEach((chunk) => {
        if (chunk.name) {
          fileHashes.add(chunk.name);
        }
      });
    }
  }

  const uniqueFiles = Array.from(fileHashes);
  console.log(`\nStep 2: Found ${uniqueFiles.length} unique model/WASM shards to download.`);
  console.log(`Starting parallel download with concurrency 5...\n`);

  let completed = 0;
  await runPool(uniqueFiles, 5, async (filename) => {
    const url = `${BASE_URL}${filename}`;
    const dest = path.join(BG_MODELS_DIR, filename);
    await downloadFileWithRetry(url, dest);
    completed++;
    const pct = Math.round((completed / uniqueFiles.length) * 100);
    process.stdout.write(`\rProgress: [${completed}/${uniqueFiles.length}] (${pct}%) downloaded: ${filename.slice(0, 16)}...`);
  });

  console.log('\n\nSyncing to out/ directory if present...');
  if (fs.existsSync(path.join(__dirname, '../out'))) {
    if (!fs.existsSync(OUT_MODELS_DIR)) {
      fs.mkdirSync(OUT_MODELS_DIR, { recursive: true });
    }
    const allDownloaded = fs.readdirSync(BG_MODELS_DIR);
    for (const f of allDownloaded) {
      fs.copyFileSync(path.join(BG_MODELS_DIR, f), path.join(OUT_MODELS_DIR, f));
    }
    console.log(`✓ Copied ${allDownloaded.length} model files to out/models/background-removal/`);
  }

  console.log('\n🎉 All background removal models downloaded successfully!');
  console.log(`The desktop app is now 100% offline compatible for background removal!\n`);
}

main().catch((err) => {
  console.error('\nFatal error in model downloader:', err);
  process.exit(1);
});
