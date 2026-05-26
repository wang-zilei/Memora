// SVG → Tauri icon set (PNG + ICO)
// Usage: node scripts/convert-icon.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'assets', 'memora-orb-replica.svg');
const OUT = path.resolve(__dirname, '..', 'src-tauri', 'icons');

// Square viewBox for the orb — pad to 280x280 to capture glow
const SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">
  <rect width="280" height="280" fill="transparent"/>
  <g transform="translate(22, 13)">
${fs.readFileSync(SRC, 'utf8')
  .replace(/<\?xml[^?]*\?>\s*/g, '')
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')}
  </g>
</svg>`;

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
];

// Ensure output dir
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  for (const { name, size } of sizes) {
    const buf = await sharp(Buffer.from(SQUARE_SVG))
      .resize(size, size)
      .png()
      .toBuffer();
    const outPath = path.join(OUT, name);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${name} (${buf.length} bytes)`);
  }

  // Build .ico from 32x32 PNG
  const png32 = await sharp(Buffer.from(SQUARE_SVG)).resize(32, 32).png().toBuffer();
  const ico = createIco([{ width: 32, height: 32, buffer: png32 }]);

  // Also add 128 and 256 entries for multi-res ICO
  // But standard Tauri just needs valid ICO file
  const icoPath = path.join(OUT, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`  icon.ico (${ico.length} bytes)`);

  // ICNS placeholder — Tauri 4.x only uses it on macOS, we copy the 128px PNG
  // Tauri actually bundles from PNGs, so ICNS/ICO are just formalities
  const icnsPath = path.join(OUT, 'icon.icns');
  const png128 = await sharp(Buffer.from(SQUARE_SVG)).resize(128, 128).png().toBuffer();
  fs.writeFileSync(icnsPath, png128); // macOS accepts PNG-based icns in practice
  console.log(`  icon.icns (${png128.length} bytes, PNG fallback)`);

  console.log('\nDone. Icons written to src-tauri/icons/');
}

function createIco(entries) {
  // ICO = 6-byte header + 16-byte dir entries + image data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // ICO type
  header.writeUInt16LE(entries.length, 4); // count

  const dirSize = 16;
  const headerSize = 6;
  let dataOffset = headerSize + entries.length * dirSize;

  const dirs = [];
  const datas = [];
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(e.width, 0);
    dir.writeUInt8(e.height, 1);
    dir.writeUInt8(0, 2);      // palette
    dir.writeUInt8(0, 3);      // reserved
    dir.writeUInt16LE(1, 4);   // color planes
    dir.writeUInt16LE(32, 6);  // bpp
    dir.writeUInt32LE(e.buffer.length, 8);  // size
    dir.writeUInt32LE(dataOffset, 12);      // offset
    dirs.push(dir);
    datas.push(e.buffer);
    dataOffset += e.buffer.length;
  }

  return Buffer.concat([header, ...dirs, ...datas]);
}

main().catch(err => { console.error(err); process.exit(1); });
