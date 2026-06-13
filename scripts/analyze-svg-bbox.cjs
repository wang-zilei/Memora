// Analyze SVG and compute tight bounding box of core paths
const fs = require('fs');
const svg = fs.readFileSync('assets/newlogo.svg', 'utf8');

const elements = [];
const elRegex = /<(path|rect)([^>]*)>/g;
let m;
while ((m = elRegex.exec(svg)) !== null) {
  const tag = m[1];
  const attrs = m[2];
  const dMatch = attrs.match(/d="([^"]*)"/);
  const txMatch = attrs.match(/translate\(([-\d]+)[,\s]+([-\d]+)\)/);
  const fillMatch = attrs.match(/fill="([^"]*)"/);

  elements.push({
    tag,
    d: dMatch ? dMatch[1] : '',
    tx: txMatch ? parseInt(txMatch[1]) : 0,
    ty: txMatch ? parseInt(txMatch[2]) : 0,
    fill: fillMatch ? fillMatch[1] : ''
  });
}

// Parse path to get bounding box
function pathBbox(d) {
  if (!d) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  const tokens = d.match(/[A-Za-z]|[-\d.]+/g) || [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  function track() {
    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
  }

  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i]; i++;
    if (cmd === 'M') { cx = +tokens[i]; cy = +tokens[i+1]; i += 2; sx = cx; sy = cy; track(); }
    else if (cmd === 'm') { cx += +tokens[i]; cy += +tokens[i+1]; i += 2; sx = cx; sy = cy; track(); }
    else if (cmd === 'L') { cx = +tokens[i]; cy = +tokens[i+1]; i += 2; track(); }
    else if (cmd === 'l') { cx += +tokens[i]; cy += +tokens[i+1]; i += 2; track(); }
    else if (cmd === 'H') { cx = +tokens[i]; i++; track(); }
    else if (cmd === 'h') { cx += +tokens[i]; i++; track(); }
    else if (cmd === 'V') { cy = +tokens[i]; i++; track(); }
    else if (cmd === 'v') { cy += +tokens[i]; i++; track(); }
    else if (cmd === 'C') { i += 6; }
    else if (cmd === 'c') { i += 6; }
    else if (cmd === 'S' || cmd === 's') { i += 4; }
    else if (cmd === 'Q' || cmd === 'q') { i += 4; }
    else if (cmd === 'A' || cmd === 'a') { i += 7; }
    else if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; track(); }
  }

  return { minX, maxX, minY, maxY };
}

// Keep indices 1-6, 11-12 (skip 0=rect, 7-10=corner frames, 13=near-white ribbon covering full canvas)
const keep = [1,2,3,4,5,6,11,12];
let globalMinX = Infinity, globalMaxX = -Infinity, globalMinY = Infinity, globalMaxY = -Infinity;

keep.forEach(i => {
  const el = elements[i];
  const bbox = pathBbox(el.d);
  const absMinX = bbox.minX + el.tx;
  const absMaxX = bbox.maxX + el.tx;
  const absMinY = bbox.minY + el.ty;
  const absMaxY = bbox.maxY + el.ty;

  console.log('Idx', i, 'fill=' + el.fill, 'tx=' + el.tx, 'ty=' + el.ty,
    '| local:', JSON.stringify(bbox),
    '| abs: minX=' + absMinX.toFixed(1), 'maxX=' + absMaxX.toFixed(1), 'minY=' + absMinY.toFixed(1), 'maxY=' + absMaxY.toFixed(1));

  globalMinX = Math.min(globalMinX, absMinX);
  globalMaxX = Math.max(globalMaxX, absMaxX);
  globalMinY = Math.min(globalMinY, absMinY);
  globalMaxY = Math.max(globalMaxY, absMaxY);
});

console.log('\n=== TIGHT BBOX ===');
console.log('x: [' + globalMinX.toFixed(1) + ', ' + globalMaxX.toFixed(1) + ']');
console.log('y: [' + globalMinY.toFixed(1) + ', ' + globalMaxY.toFixed(1) + ']');
console.log('Width:', (globalMaxX - globalMinX).toFixed(1), 'Height:', (globalMaxY - globalMinY).toFixed(1));
console.log('Original canvas: 1254 x 1254');
console.log('Ratio: ' + ((globalMaxX - globalMinX) / 1254 * 100).toFixed(1) + '%');
