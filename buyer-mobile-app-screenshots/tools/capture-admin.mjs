import { chromium } from 'playwright';

const OUT = '/tmp/claude-0/-home-user-Claude/5478f9c3-f80d-5c85-98ce-9a5ca25d7e75/scratchpad/web-shots';
const BASE = 'http://localhost:5173';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 200)));

await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('input[type="email"], input[name="email"]').first().fill('sales@dallasbakery.com');
await page.locator('input[type="password"]').first().fill('ScreenshotAdmin!2026');
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(6000);
console.log('after login:', page.url());

await page.screenshot({ path: `${OUT}/w06-admin-applications.png`, fullPage: true });

// Shipping queue with an order expanded.
const queueTab = page.getByRole('button', { name: /shipping|orders/i }).first();
if (await queueTab.count()) { await queueTab.click().catch(() => {}); await page.waitForTimeout(2500); }
const scopeAll = page.getByRole('button', { name: /^all$/i }).first();
if (await scopeAll.count()) { await scopeAll.click().catch(() => {}); await page.waitForTimeout(2500); }
const toggle = page.locator('.admin-row-toggle').first();
if (await toggle.count()) { await toggle.click().catch(() => {}); await page.waitForTimeout(1200); }
await page.screenshot({ path: `${OUT}/w07-admin-orders.png`, fullPage: true });
console.log('body chars:', (await page.locator('body').innerText()).length);

await browser.close();
