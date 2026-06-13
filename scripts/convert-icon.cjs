// PNG -> app icon set (PNG + ICO)
// Usage: node scripts/convert-icon.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'assets', 'newlogo-cropped.svg');
const ASSET_OUT = path.resolve(__dirname, '..', 'assets', 'icons');
const TAURI_OUT = path.resolve(__dirname, '..', 'src-tauri', 'icons');

const assetSizes = [32, 64, 128, 256, 512, 1024];
const tauriPngs = [
  { name: '32x32.png', size: 32 },
  { name: '64x64.png', size: 64 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
];

async function main() {
  ensureDir(ASSET_OUT);
  ensureDir(TAURI_OUT);

  for (const size of assetSizes) {
    const buf = await renderPng(size);
    const outPath = path.join(ASSET_OUT, `app-icon-${size}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`  assets/icons/app-icon-${size}.png (${buf.length} bytes)`);
  }

  for (const { name, size } of tauriPngs) {
    const buf = await renderPng(size);
    const outPath = path.join(TAURI_OUT, name);
    fs.writeFileSync(outPath, buf);
    console.log(`  src-tauri/icons/${name} (${buf.length} bytes)`);
  }

  const icoEntries = await Promise.all([16, 24, 32, 48, 64, 96, 128, 256].map(async size => ({
    width: size,
    height: size,
    buffer: await renderPng(size),
  })));
  const ico = createIco(icoEntries);
  fs.writeFileSync(path.join(ASSET_OUT, 'app-icon.ico'), ico);
  fs.writeFileSync(path.join(TAURI_OUT, 'icon.ico'), ico);
  console.log(`  icon.ico (${ico.length} bytes)`);

  const png512 = await renderPng(512);
  fs.writeFileSync(path.join(TAURI_OUT, 'icon.icns'), png512);
  console.log(`  src-tauri/icons/icon.icns (${png512.length} bytes, PNG fallback)`);

  console.log('\nDone. Icons written to assets/icons/ and src-tauri/icons/.');
}

async function renderPng(size) {
  const radius = Math.round(size * 0.178);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="black"/>
    </svg>`
  );
  return sharp(SRC)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: '#ffffff' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16;
  const headerSize = 6;
  let dataOffset = headerSize + entries.length * dirSize;

  const dirs = [];
  const datas = [];
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(e.width === 256 ? 0 : e.width, 0);
    dir.writeUInt8(e.height === 256 ? 0 : e.height, 1);
    dir.writeUInt8(0, 2);
    dir.writeUInt8(0, 3);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(e.buffer.length, 8);
    dir.writeUInt32LE(dataOffset, 12);
    dirs.push(dir);
    datas.push(e.buffer);
    dataOffset += e.buffer.length;
  }

  return Buffer.concat([header, ...dirs, ...datas]);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
