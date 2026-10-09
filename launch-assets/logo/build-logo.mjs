// Builds the CodeSkate logo set as pure-vector SVGs (text converted to paths,
// so no font dependency) and renders PNGs from them.
// Setup: npm i opentype.js playwright && npx playwright install chromium
//        + Montserrat-ExtraBold.ttf / Montserrat-Medium.ttf next to this file
// Run:   node build-logo.mjs <output-dir>
import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';
import { chromium } from 'playwright';

const OUT = process.argv[2] || './out';
fs.mkdirSync(OUT, { recursive: true });

const loadFont = (f) => {
  const b = fs.readFileSync(f);
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const bold = loadFont('Montserrat-ExtraBold.ttf');
const medium = loadFont('Montserrat-Medium.ttf');

const C = {
  bg: '#0B0807',
  ink: '#1A1410',
  o1: '#FFB52E', o2: '#FF7A12', o3: '#F04E00',
  w1: '#FFFFFF', w2: '#EFE6DD',
};

/* ── Text helpers ─────────────────────────────────────────── */
const adv = (font, t, size) => font.getAdvanceWidth(t, size);
// Own serializer: opentype.js's toPathData() emits "NaN" for some coordinates.
const n = (v) => {
  if (!Number.isFinite(v)) throw new Error('non-finite coordinate in glyph path');
  return (Math.round(v * 100) / 100).toString();
};
function toD(p) {
  return p.commands.map((c) => {
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`;
      case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      case 'Z': return 'Z';
      default: throw new Error('unknown path command ' + c.type);
    }
  }).join('');
}
const textPath = (font, t, x, y, size) => toD(font.getPath(t, x, y, size));

function trackedPath(font, t, x, y, size, tracking) {
  let d = '', cx = x;
  for (const ch of t) {
    d += toD(font.getPath(ch, cx, y, size));
    cx += adv(font, ch, size) + tracking;
  }
  return d;
}
const trackedWidth = (font, t, size, tracking) =>
  [...t].reduce((w, ch) => w + adv(font, ch, size) + tracking, 0) - tracking;

/* ── The mark: two interlocking links forming an "S" ──────────
   Local coords, centred on 0,0, then rotated. Arms are parallel so the
   links interlock without crossing strokes. */
const SW = 28;
const ORANGE_D = 'M 12 -60 H -40 A 40 40 0 0 0 -40 20 H 62';
const WHITE_D = 'M -62 -20 H 40 A 40 40 0 0 1 40 60 H -12';

function defs(id, { light = false } = {}) {
  const white = light
    ? `<linearGradient id="${id}-w" x1="-80" y1="-60" x2="80" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3A2E25"/><stop offset="1" stop-color="${C.ink}"/></linearGradient>`
    : `<linearGradient id="${id}-w" x1="-80" y1="-60" x2="80" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.w1}"/><stop offset="1" stop-color="${C.w2}"/></linearGradient>`;
  return `
    <linearGradient id="${id}-o" x1="-90" y1="-70" x2="70" y2="40" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.o1}"/><stop offset=".55" stop-color="${C.o2}"/><stop offset="1" stop-color="${C.o3}"/>
    </linearGradient>
    ${white}
    <linearGradient id="${id}-t" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FF8A1F"/><stop offset="1" stop-color="${C.o3}"/>
    </linearGradient>`;
}

function mark(id, cx, cy, scale) {
  return `<g transform="translate(${cx} ${cy}) scale(${scale}) rotate(-28)">
    <path d="${ORANGE_D}" fill="none" stroke="url(#${id}-o)" stroke-width="${SW}"/>
    <path d="${WHITE_D}" fill="none" stroke="url(#${id}-w)" stroke-width="${SW}"/>
  </g>`;
}

function wordmark(id, x, y, size, codeColor) {
  const wCode = adv(bold, 'Code', size);
  return {
    svg: `<path d="${textPath(bold, 'Code', x, y, size)}" fill="${codeColor}"/>
          <path d="${textPath(bold, 'Skate', x + wCode, y, size)}" fill="url(#${id}-t)"/>`,
    width: wCode + adv(bold, 'Skate', size),
  };
}

const TAGLINE = 'TURNING IDEAS INTO PRODUCTS';
const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;

const files = {};

/* 1. Badge — recreation of the original circular glowing logo */
{
  const id = 'b', S = 1024, cx = 512;
  const wmSize = 132;
  const wmW = adv(bold, 'Code', wmSize) + adv(bold, 'Skate', wmSize);
  const wm = wordmark(id, cx - wmW / 2, 690, wmSize, '#FFFFFF');
  const tgSize = 34, tgTrack = 5;
  const tgW = trackedWidth(medium, TAGLINE, tgSize, tgTrack);
  files['codeskate-logo-badge.svg'] = svgDoc(S, S, `
    <defs>${defs(id)}
      <radialGradient id="b-bg" cx=".5" cy=".42" r=".6">
        <stop offset="0" stop-color="#1E140E"/><stop offset="1" stop-color="${C.bg}"/>
      </radialGradient>
      <filter id="b-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="20"/>
      </filter>
      <filter id="b-markglow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="22"/>
      </filter>
    </defs>
    <rect width="${S}" height="${S}" fill="${C.bg}"/>
    <circle cx="${cx}" cy="${cx}" r="468" fill="url(#b-bg)"/>
    <circle cx="${cx}" cy="${cx}" r="468" fill="none" stroke="${C.o2}" stroke-width="26" filter="url(#b-glow)"/>
    <circle cx="${cx}" cy="${cx}" r="468" fill="none" stroke="#FFC27A" stroke-width="5"/>
    <g opacity=".35" filter="url(#b-markglow)">${mark(id, cx, 395, 2.05)}</g>
    ${mark(id, cx, 395, 2.05)}
    ${wm.svg}
    <path d="${trackedPath(medium, TAGLINE, cx - tgW / 2, 772, tgSize, tgTrack)}" fill="#E8E2DC"/>`);
}

/* 2 & 3. Horizontal lockups (dark + light backgrounds), transparent */
for (const variant of ['dark', 'light']) {
  const id = 'h' + variant[0];
  const light = variant === 'light';
  const H = 220, markCx = 110, x0 = 230;
  const wm = wordmark(id, x0, 122, 104, light ? C.ink : '#FFFFFF');
  const tgSize = 21.5, tgTrack = 3.4;
  const tgW = trackedWidth(medium, TAGLINE, tgSize, tgTrack);
  const W = Math.ceil(x0 + Math.max(wm.width, tgW) + 20);
  files[`codeskate-logo-horizontal-${variant}.svg`] = svgDoc(W, H, `
    <defs>${defs(id, { light })}</defs>
    ${mark(id, markCx, H / 2, 1.0)}
    ${wm.svg}
    <path d="${trackedPath(medium, TAGLINE, x0 + 4, 166, tgSize, tgTrack)}" fill="${light ? '#6B5D50' : '#CFC6BE'}"/>`);
}

/* 4. Stacked (mark above wordmark), transparent, dark-bg */
{
  const id = 's', W = 760, cx = W / 2;
  const wmSize = 110;
  const wmW = adv(bold, 'Code', wmSize) + adv(bold, 'Skate', wmSize);
  const wm = wordmark(id, cx - wmW / 2, 430, wmSize, '#FFFFFF');
  const tgSize = 26, tgTrack = 4;
  const tgW = trackedWidth(medium, TAGLINE, tgSize, tgTrack);
  files['codeskate-logo-stacked-dark.svg'] = svgDoc(W, 520, `
    <defs>${defs(id)}</defs>
    ${mark(id, cx, 175, 1.75)}
    ${wm.svg}
    <path d="${trackedPath(medium, TAGLINE, cx - tgW / 2, 492, tgSize, tgTrack)}" fill="#CFC6BE"/>`);
}

/* 5. Mark only — transparent, for dark and light backgrounds */
files['codeskate-mark-dark.svg'] = svgDoc(240, 240, `<defs>${defs('md')}</defs>${mark('md', 120, 120, 1.15)}`);
files['codeskate-mark-light.svg'] = svgDoc(240, 240, `<defs>${defs('ml', { light: true })}</defs>${mark('ml', 120, 120, 1.15)}`);

/* 6. App icon — mark on a dark rounded tile (favicon / app store / social avatar) */
files['codeskate-app-icon.svg'] = svgDoc(512, 512, `
  <defs>${defs('ai')}
    <radialGradient id="ai-bg" cx=".5" cy=".35" r=".75">
      <stop offset="0" stop-color="#2A1A10"/><stop offset="1" stop-color="${C.bg}"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#ai-bg)"/>
  ${mark('ai', 256, 256, 2.25)}`);

for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), svg);

/* ── PNG renders ─────────────────────────────────────────── */
const renders = [
  ['codeskate-logo-badge.svg', 'codeskate-logo-badge-1024.png', 1],
  ['codeskate-logo-badge.svg', 'codeskate-logo-badge-512.png', 0.5],
  ['codeskate-logo-horizontal-dark.svg', 'codeskate-logo-horizontal-dark.png', 2],
  ['codeskate-logo-horizontal-light.svg', 'codeskate-logo-horizontal-light.png', 2],
  ['codeskate-logo-stacked-dark.svg', 'codeskate-logo-stacked-dark.png', 2],
  ['codeskate-mark-dark.svg', 'codeskate-mark-dark-512.png', 512 / 240],
  ['codeskate-mark-light.svg', 'codeskate-mark-light-512.png', 512 / 240],
  ['codeskate-app-icon.svg', 'codeskate-app-icon-512.png', 1],
  ['codeskate-app-icon.svg', 'codeskate-app-icon-192.png', 192 / 512],
  ['codeskate-app-icon.svg', 'codeskate-app-icon-48.png', 48 / 512],
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const [src, out, scale] of renders) {
  const svg = files[src];
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const W = Math.round(w * scale), H = Math.round(h * scale);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const sized = svg.replace(/width="\d+" height="\d+"/, `width="${W}" height="${H}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: path.join(OUT, out), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  await page.close();
  console.log('png', out, `${W}x${H}`);
}
await browser.close();
