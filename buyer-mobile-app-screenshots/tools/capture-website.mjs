import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/claude-0/-home-user-Claude/5478f9c3-f80d-5c85-98ce-9a5ca25d7e75/scratchpad/web-shots';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const session = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-user-Claude/5478f9c3-f80d-5c85-98ce-9a5ca25d7e75/scratchpad/session.json', 'utf8'));
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function shoot(name, { path: urlPath, signedIn = false, viewport = { width: 1440, height: 960 }, action }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));

  if (signedIn) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => localStorage.setItem('db-wholesale-session', JSON.stringify(s)), session);
  }
  await page.goto(`${BASE}${urlPath}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);
  if (action) await action(page);
  await page.waitForTimeout(1200);

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText().catch(() => '')).trim();
  console.log(`${errs.length ? 'WARN' : 'OK  '} ${name.padEnd(24)} chars=${text.length} ${errs.slice(0,1).join('')}`);
  await ctx.close();
}

await shoot('w01-home', { path: '/' });
await shoot('w02-order-signin', { path: '/order' });
await shoot('w03-catalog', {
  path: '/order', signedIn: true,
  action: async (page) => {
    // Put a few cases in the cart so the summary is populated.
    const plus = page.getByRole('button', { name: /One more case of Barbari/ });
    await plus.click(); await plus.click();
    await page.getByRole('button', { name: /One more case of Natural/ }).click();
    await page.waitForTimeout(500);
  },
});
await shoot('w04-my-orders', {
  path: '/order', signedIn: true,
  action: async (page) => {
    await page.locator('.buyer-orders').scrollIntoViewIfNeeded().catch(() => {});
    for (const d of await page.locator('.buyer-order-items').all()) {
      await d.evaluate((el) => el.setAttribute('open', 'open'));
    }
    await page.waitForTimeout(400);
  },
});
await shoot('w05-apply', { path: '/apply' });

await browser.close();
