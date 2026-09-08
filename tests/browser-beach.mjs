import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];
try {
  for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const snapshot = () => page.evaluate(() => window.__sealBay.snapshot());
    await page.goto(baseURL);
    await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
    const residents = (await snapshot()).beachSeals;
    assert.ok(residents?.length >= 4, 'The beach has its own resident seals');
    assert.ok(residents.filter(seal => seal.behavior === 'resting').length >= 2);
    assert.ok(residents.filter(seal => seal.behavior === 'crawling').length >= 2);
    await page.locator('#start-button').click();
    await page.waitForTimeout(1800);
    const before = (await snapshot()).beachSeals;
    await page.waitForTimeout(3500);
    const after = (await snapshot()).beachSeals;
    const moved = after.filter((seal, i) => Math.hypot(seal.x - before[i].x, seal.z - before[i].z) > .02);
    assert.ok(moved.length >= 1, 'A crawling seal actually moves across the sand');
    assert.ok(after.every(seal => seal.y > 0 && seal.z < -14), 'Residents remain on the rear beach');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `output/${device}-beach-final.png` });
    await page.locator('#pause-button').click();
    const paused = (await snapshot()).beachSeals;
    await page.waitForTimeout(400);
    assert.deepEqual((await snapshot()).beachSeals, paused, 'Pause freezes all beach residents');
    await page.locator('#resume-button').click();
    await page.waitForTimeout(300);
    await page.locator('#pause-button').click();
    await page.locator('#restart-button').click();
    assert.equal((await snapshot()).beachSeals.length, residents.length, 'Restart does not duplicate residents');
    checks.push(`${device}: beach residents, crawling motion, dry habitat, pause and restart`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
