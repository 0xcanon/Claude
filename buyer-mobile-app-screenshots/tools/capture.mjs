import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = '/tmp/claude-0/-home-user-Claude/5478f9c3-f80d-5c85-98ce-9a5ca25d7e75/scratchpad/shots';
fs.rmSync(BASE, { recursive: true, force: true });
fs.mkdirSync(`${BASE}/phone`, { recursive: true });
fs.mkdirSync(`${BASE}/full`, { recursive: true });

// react-native-web resolves `aspectRatio` against the stretched flex row instead
// of the item's own width, which Yoga does not do on iOS/Android. Correct it so
// the captures match how the app actually lays out on a device.
const RNW_ASPECT_FIX = `[class*="r-aspectRatio"] { height: auto !important; flex-basis: auto !important; flex-shrink: 0 !important; }`;

const screens = [
  ['01-welcome',           'welcome'],
  ['02-apply-step1',       'apply',  { fillStep1: true }],
  ['03-apply-step2',       'apply',  { fillStep1: true, continueToStep2: true }],
  ['04-status-pending',    'status-pending'],
  ['05-status-approved',   'status-approved'],
  ['06-signin-email',      'signin-email'],
  ['07-signin-code',       'signin-code', { typeCode: true }],
  ['08-home',              'home'],
  ['09-catalog',           'catalog'],
  ['10-product-detail',    'product'],
  ['11-cart',              'cart'],
  ['12-orders',            'orders'],
  ['13-locations',         'locations'],
  ['14-account',           'account'],
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function fillApplication(page, { continueToStep2 }) {
  const inputs = page.locator('input');
  const step1 = [
    'Mina Farahani',
    'Saffron Kitchen Group',
    'mina@saffronkitchen.com',
    '(214) 555-0173',
    'saffronkitchen.com',
  ];
  // Business type sits between "BUSINESS NAME" and "BUSINESS EMAIL", so the
  // email/phone/website inputs are indexes 2..4.
  await inputs.nth(0).fill(step1[0]);
  await inputs.nth(1).fill(step1[1]);
  await page.getByText('Restaurant or caterer', { exact: true }).click();
  await inputs.nth(2).fill(step1[2]);
  await inputs.nth(3).fill(step1[3]);
  await inputs.nth(4).fill(step1[4]);
  await page.waitForTimeout(300);
  if (!continueToStep2) return;
  await page.getByText('CONTINUE', { exact: true }).click();
  await page.waitForTimeout(600);
  const a = page.locator('input');
  await a.nth(0).fill('1914 Greenville Ave');
  await a.nth(1).fill('Suite 120');
  await a.nth(2).fill('Dallas');
  await a.nth(3).fill('TX');
  await a.nth(4).fill('75206');
  await page.locator('input[type="checkbox"]').first().click().catch(() => {});
  await page.waitForTimeout(400);
  // agree to terms
  await page.getByText(/I agree to the wholesale terms/).click().catch(() => {});
  await page.waitForTimeout(400);
}

for (const [name, screen, opts = {}] of screens) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));

  await page.goto(`http://localhost:8081/?screen=${screen}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3500);
  await page.addStyleTag({ content: RNW_ASPECT_FIX });
  await page.waitForTimeout(400);

  if (opts.fillStep1) await fillApplication(page, opts);
  if (opts.typeCode) {
    await page.locator('input').first().fill('418320');
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 4) el.scrollTop = 0;
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${BASE}/phone/${name}.png` });

  // Full-length capture: grow the viewport to the screen's own content height
  // so nothing below the fold is lost.
  const contentH = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 4);
    const extra = scrollers.reduce((m, el) => Math.max(m, el.scrollHeight - el.clientHeight), 0);
    return Math.min(4000, 844 + extra);
  });
  if (contentH > 860) {
    await page.setViewportSize({ width: 390, height: Math.ceil(contentH) });
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${BASE}/full/${name}.png` });

  const text = (await page.locator('#root').innerText().catch(() => '')).trim();
  console.log(`${errs.length || text.length < 40 ? 'FAIL' : 'OK  '} ${name.padEnd(20)} h=${contentH} chars=${text.length} ${errs.slice(0,1).join('')}`);
  await ctx.close();
}

await browser.close();
