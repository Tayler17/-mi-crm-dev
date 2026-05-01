// Pure Node.js PNG generator — no external deps
// Run: node scripts/gen-icons.mjs
import { createWriteStream } from 'fs';
import { deflateSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/icons');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcBuf = crc32(Buffer.concat([t, data]));
  const crcOut = Buffer.alloc(4); crcOut.writeUInt32BE(crcBuf);
  return Buffer.concat([len, t, data, crcOut]);
}

function generatePNG(size) {
  // Build RGBA pixel data: indigo-to-violet gradient with rounded corners
  const pixels = [];
  const r1 = 0.2 * size; // corner radius

  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      // Rounded corner mask
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      let alpha = 255;
      if (dx < r1 && dy < r1) {
        const dist = Math.sqrt((r1 - dx) ** 2 + (r1 - dy) ** 2);
        if (dist > r1) alpha = 0;
        else if (dist > r1 - 1) alpha = Math.round(255 * (r1 - dist));
      }

      // Gradient: #6366f1 → #8b5cf6 diagonal
      const t = (x + y) / (2 * size);
      const r = Math.round(0x63 + t * (0x8b - 0x63));
      const g = Math.round(0x66 + t * (0x5c - 0x66));
      const b = Math.round(0xf1 + t * (0xf6 - 0xf1));

      // Lightning bolt shape (simple polygon)
      // Bolt: top-right to bottom-left, classic ⚡ shape
      const cx = size / 2, cy = size / 2;
      const s = size * 0.28;
      // Define bolt as filled polygon points (relative to center)
      // Top part: right-leaning
      const pts = [
        [cx + s * 0.15, cy - s],       // top-right
        [cx - s * 0.05, cy + s * 0.05], // mid-left
        [cx + s * 0.3,  cy + s * 0.05], // mid-right
        [cx - s * 0.15, cy + s],        // bottom-left
        [cx + s * 0.05, cy - s * 0.05], // mid-right lower
        [cx - s * 0.3,  cy - s * 0.05], // mid-left upper
      ];
      const inBolt = pointInPolygon(x, y, pts);

      if (alpha === 0) {
        row.push(0, 0, 0, 0);
      } else if (inBolt) {
        row.push(255, 255, 255, alpha);
      } else {
        row.push(r, g, b, alpha);
      }
    }
    // PNG filter byte (0 = None) + row data
    pixels.push(0, ...row);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  // compress, interlace = 0

  const raw = Buffer.from(pixels);
  const idat = deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const size of sizes) {
  const buf = generatePNG(size);
  const file = path.join(outDir, `icon-${size}.png`);
  const ws = createWriteStream(file);
  ws.write(buf);
  ws.end();
  console.log(`✓ icon-${size}.png (${size}x${size})`);
}
