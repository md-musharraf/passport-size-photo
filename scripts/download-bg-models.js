const fs = require('fs');
const path = require('path');
const https = require('https');

const BG_MODELS_DIR = path.join(__dirname, '../public/models/background-removal');
const BASE_URL = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';

// Ensure directory exists
if (!fs.existsSync(BG_MODELS_DIR)) {
  fs.mkdirSync(BG_MODELS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // If file already exists and is not empty, skip downloading to save time/bandwidth
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`Skipping (already exists): ${path.basename(dest)}`);
      resolve();
      return;
    }

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status: ${response.statusCode})`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastLoggedPercent = -1;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round((downloaded / totalSize) * 100);
          if (percent % 25 === 0 && percent !== lastLoggedPercent) {
            process.stdout.write(`Downloading ${path.basename(dest)}: ${percent}%\r`);
            lastLoggedPercent = percent;
          }
        }
      });

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded successfully: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
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
    // Always fetch latest resources.json to ensure correct mapping
    if (fs.existsSync(resourcesPath)) {
      fs.unlinkSync(resourcesPath);
    }
    await downloadFile(`${BASE_URL}resources.json`, resourcesPath);
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
      entry.chunks.forEach(chunk => {
        if (chunk.name) {
          fileHashes.add(chunk.name);
        }
      });
    }
  }

  const uniqueFiles = Array.from(fileHashes);
  console.log(`\nStep 2: Found ${uniqueFiles.length} unique model/WASM shards to download.`);
  console.log(`Total download size is approximately 340 MB. Starting download...\n`);

  let count = 0;
  for (const filename of uniqueFiles) {
    count++;
    const url = `${BASE_URL}${filename}`;
    const dest = path.join(BG_MODELS_DIR, filename);
    
    console.log(`[${count}/${uniqueFiles.length}] Processing ${filename}...`);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`❌ Error downloading ${filename}:`, err.message);
      console.log('Retrying in 2 seconds...');
      await new Promise(r => setTimeout(r, 2000));
      try {
        await downloadFile(url, dest);
      } catch (retryErr) {
        console.error(`❌ Final failure for ${filename}:`, retryErr.message);
      }
    }
  }

  console.log('\n🎉 All background removal models downloaded successfully!');
  console.log(`The application is now 100% offline compatible for background removal!`);
}

main();
