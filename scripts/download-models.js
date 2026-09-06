const fs = require('fs');
const path = require('path');
const https = require('https');

const MODELS_DIR = path.join(__dirname, '../public/models');
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2', // required: the SSD manifest references TWO shards
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1'
];

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

console.log('Starting face-api.js models download...');

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
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
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  for (const filename of files) {
    const url = `${BASE_URL}${filename}`;
    const dest = path.join(MODELS_DIR, filename);
    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`Error downloading ${filename}:`, err.message);
    }
  }
  console.log('All downloads complete!');
}

main();
