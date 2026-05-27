// SVG -> Tauri icon set (PNG + ICO)
// Usage: node scripts/convert-icon.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'assets', 'logo.svg');
const OUT = path.resolve(__dirname, '..', 'src-tauri', 'icons');

const SOURCE_SVG = fs.readFileSync(SRC, 'utf8');
const ICON_FILL_RATIO = 0.98;

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
];

// Ensure output dir
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  for (const { name, size } of sizes) {
    const buf = await renderIconPng(size);
    const outPath = path.join(OUT, name);
    fs.writeFileSync(outPath, buf);
    console.log(`  ${name} (${buf.length} bytes)`);
  }

  const icoEntries = await Promise.all([32, 128, 256].map(async size => ({
    width: size,
    height: size,
    buffer: await renderIconPng(size),
  })));
  const ico = createIco(icoEntries);
  const icoPath = path.join(OUT, 'icon.ico');
  fs.writeFileSync(icoPath, ico);
  console.log(`  icon.ico (${ico.length} bytes)`);

  // ICNS placeholder — Tauri 4.x only uses it on macOS, we copy the 128px PNG
  // Tauri actually bundles from PNGs, so ICNS/ICO are just formalities
  const icnsPath = path.join(OUT, 'icon.icns');
  const png128 = await renderIconPng(128);
  fs.writeFileSync(icnsPath, png128); // macOS accepts PNG-based icns in practice
  console.log(`  icon.icns (${png128.length} bytes, PNG fallback)`);

  console.log('\nDone. Icons written to src-tauri/icons/');
}

async function renderIconPng(size) {
  const contentSize = Math.round(size * ICON_FILL_RATIO);
  const trimmed = await sharp(Buffer.from(SOURCE_SVG))
    .resize(1024, 1024, { fit: 'contain' })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(contentSize, contentSize, { fit: 'contain' })
    .png()
    .toBuffer();

  const meta = await sharp(trimmed).metadata();
  const left = Math.floor((size - meta.width) / 2);
  const right = size - meta.width - left;
  const top = Math.floor((size - meta.height) / 2);
  const bottom = size - meta.height - top;

  return sharp(trimmed)
    .extend({
      top,
      bottom,
      left,
      right,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
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
    dir.writeUInt8(e.width === 256 ? 0 : e.width, 0);
    dir.writeUInt8(e.height === 256 ? 0 : e.height, 1);
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
