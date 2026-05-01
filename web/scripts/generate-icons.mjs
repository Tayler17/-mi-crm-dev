// Run once: node scripts/generate-icons.mjs
// Requires: npm install --save-dev sharp
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath   = path.join(__dirname, '../public/icons/icon.svg');
const outDir    = path.join(__dirname, '../public/icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}
