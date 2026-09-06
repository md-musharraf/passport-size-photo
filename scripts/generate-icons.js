const fs = require('fs');
const path = require('path');

const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="url(#grad)" />
  <path d="M150 180H200L220 140H292L312 180H362C384 180 402 198 402 220V370C402 392 384 410 362 410H150C128 410 110 392 110 370V220C110 198 128 180 150 180Z" fill="white" />
  <circle cx="256" cy="300" r="65" fill="#3b82f6" stroke="white" stroke-width="12" />
  <circle cx="340" cy="220" r="12" fill="white" />
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
</svg>`;

const PUBLIC_DIR = path.join(__dirname, '../public');

async function main() {
  const sharp = require('sharp');
  
  // Write SVG file
  const svgPath = path.join(PUBLIC_DIR, 'icon.svg');
  fs.writeFileSync(svgPath, svgContent);
  console.log('Saved SVG icon.');

  // Convert SVG to PNG
  const pngPath = path.join(PUBLIC_DIR, 'icon.png');
  await sharp(svgPath)
    .resize(512, 512)
    .png()
    .toFile(pngPath);
  console.log('Generated PNG icon.');

  // Copy PNG as favicon or other icons if needed
  try {
    const icoPath = path.join(PUBLIC_DIR, 'icon.ico');
    // Using sharp to resize and save as png. electron-builder can use png/ico.
    // For nsis build, we can write a simple ico.
    // We will save icon.png as fallback
    fs.copyFileSync(pngPath, icoPath);
    console.log('Saved icon.ico placeholder.');
  } catch (err) {
    console.error('Error creating ico:', err);
  }
}

main().catch(err => {
  console.error('Failed to generate icons:', err);
});
