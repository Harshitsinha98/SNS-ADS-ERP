// Renders the launch banners from launch-banner.html to PNGs.
// Setup:  npm i playwright && npx playwright install chromium
// Run:    node render.mjs
import { chromium } from 'playwright';
import path from 'path';

const file = 'file://' + path.resolve('launch-banner.html');

const shots = [
  { sel: '.hero',   w: 1200, h: 630,  out: 'banner-hero-1200x630.png' },
  { sel: '.cover',  w: 1584, h: 396,  out: 'banner-cover-1584x396.png' },
  { sel: '.square', w: 1080, h: 1080, out: 'banner-square-1080x1080.png' },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(file, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

for (const s of shots) {
  const el = await page.$(s.sel);
  await el.screenshot({ path: s.out });
  console.log('wrote', s.out);
}

await browser.close();
