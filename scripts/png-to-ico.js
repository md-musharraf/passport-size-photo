const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const pngPath = path.join(__dirname, '../public/icon.png');
  const icoPath = path.join(__dirname, '../public/icon.ico');

  if (!fs.existsSync(pngPath)) {
    console.error(`Error: PNG icon not found at ${pngPath}`);
    process.exit(1);
  }

  const image = sharp(pngPath);
  const metadata = await image.metadata();
  console.log(`Source PNG Dimensions: ${metadata.width}x${metadata.height}`);

  // Create a high-quality 256x256 PNG buffer
  const pngBuffer = await image.resize(256, 256).png().toBuffer();

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved (must be 0)
  header.writeUInt16LE(1, 2); // Type (1 for ICO)
  header.writeUInt16LE(1, 4); // Number of images (1)

  // ICO directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0); // Width: 256 (0 represents 256)
  entry.writeUInt8(0, 1); // Height: 256 (0 represents 256)
  entry.writeUInt8(0, 2); // Color palette count (0 for no palette)
  entry.writeUInt8(0, 3); // Reserved (0)
  entry.writeUInt16LE(1, 4); // Color planes (1)
  entry.writeUInt16LE(32, 6); // Bits per pixel (32)
  entry.writeUInt32LE(pngBuffer.length, 8); // Size of image data in bytes
  entry.writeUInt32LE(22, 12); // Offset of image data from beginning of file (6 + 16 = 22)

  // Combine header, entry, and png data
  const icoBuffer = Buffer.concat([header, entry, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Successfully generated a valid Windows ICO file at ${icoPath} (size: ${icoBuffer.length} bytes)`);
}

main().catch(console.error);
