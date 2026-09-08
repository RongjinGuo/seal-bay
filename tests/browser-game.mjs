import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];
function observe(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}
async function ready(page) {
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('intro')).opacity === '1'
    && getComputedStyle(document.getElementById('visitors-panel')).opacity === '1');
}
const snapshot = page => page.evaluate(() => window.__sealBay.snapshot());

// Time actual input events against a monotonic clock, including dispatch latency.
async function swipe(page, { x, y, dx = 0, dy, duration, touch = false }) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  if (touch) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else { await page.mouse.move(x, y); await page.mouse.down(); }
  const start = performance.now();
  while (true) {
    const t = (performance.now() - start) / duration;
    if (touch) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * t, y: y - dy * t }] });
    else await page.mouse.move(x + dx * t, y - dy * t);
    if (t >= 1) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (touch) { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
  else await page.mouse.up();
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  observe(desktop);
  await ready(desktop);
  await desktop.screenshot({ path: 'output/desktop-final.png' });
  assert.equal((await snapshot(desktop)).status, 'intro');
  assert.equal(await desktop.locator('#fatal').isVisible(), false);
  await desktop.locator('#start-button').click();
  await desktop.waitForTimeout(1000);
  await swipe(desktop, { x: 720, y: 760, dy: 160, duration: 435 });
  await desktop.waitForFunction(() => window.__sealBay.snapshot().score === 1);
  let state = await snapshot(desktop);
  assert.equal(state.throws, 1);
  assert.ok(state.seals.some(seal => seal.variant === 'harp-pup' && seal.fed));
  await desktop.screenshot({ path: 'output/desktop-feeding-final.png' });
  checks.push('real mouse swipe feeds the near seal');

  await swipe(desktop, { x: 720, y: 760, dx: 160, dy: 220, duration: 120 });
  await desktop.waitForFunction(() => window.__sealBay.snapshot().score === 2);
  assert.ok((await snapshot(desktop)).seals.some(seal => seal.variant === 'ringed-adult' && seal.fed));
  checks.push('fast diagonal mouse swipe feeds the far-right seal');

  await desktop.mouse.click(850, 765);
  await swipe(desktop, { x: 800, y: 760, dy: -60, duration: 200 });
  assert.equal((await snapshot(desktop)).throws, 2, 'Tap and downward drag must not launch');
  checks.push('tap and downward gesture rejected');

  await desktop.locator('#pause-button').click();
  const frozen = await snapshot(desktop);
  await desktop.waitForTimeout(400);
  assert.deepEqual((await snapshot(desktop)).seals, frozen.seals);
  assert.equal((await snapshot(desktop)).elapsed, frozen.elapsed);
  await desktop.locator('#resume-button').click();
  await desktop.waitForFunction(time => window.__sealBay.snapshot().elapsed > time, frozen.elapsed);
  checks.push('pause freezes and resume continues');

  await desktop.locator('#guide-button').click();
  assert.equal(await desktop.locator('.guide-card').count(), 8);
  assert.match(await desktop.locator('#modal-content').innerText(), /已交朋友/);
  await desktop.screenshot({ path: 'output/guide-final.png' });
  await desktop.locator('#modal-close').click();
  await desktop.locator('#pause-button').click();
  await desktop.locator('#restart-button').click();
  await desktop.waitForFunction(() => window.__sealBay.snapshot().elapsed < 1);
  state = await snapshot(desktop);
  assert.equal(state.score, 0); assert.equal(state.throws, 0);
  checks.push('field guide remembers feeding; restart resets round');

  await desktop.locator('#pause-button').click();
  await desktop.locator('#back-home-button').click();
  await desktop.locator('[data-mode="challenge"]').click();
  await desktop.locator('#start-button').click();
  await desktop.waitForFunction(() => window.__sealBay.snapshot().mode === 'challenge');
  await desktop.clock.install();
  // Advancing the browser clock tests the 120 s boundary without changing game state.
  await desktop.clock.fastForward(121000);
  await desktop.waitForFunction(() => window.__sealBay.snapshot().status === 'results');
  assert.equal(await desktop.locator('.result-grid').count(), 1);
  await desktop.screenshot({ path: 'output/results-final.png' });
  await desktop.locator('#again-button').click();
  assert.equal((await snapshot(desktop)).status, 'playing');
  assert.equal((await snapshot(desktop)).score, 0);
  await desktop.close();
  checks.push('challenge ends at elapsed-time boundary and plays again');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  observe(mobile);
  await ready(mobile);
  await mobile.screenshot({ path: 'output/mobile-final.png' });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.locator('#start-button').tap();
  await mobile.waitForTimeout(1200);
  await swipe(mobile, { x: 195, y: 674, dy: 145, duration: 430, touch: true });
  await mobile.waitForFunction(() => window.__sealBay.snapshot().score === 1);
  assert.equal((await snapshot(mobile)).throws, 1);
  await mobile.screenshot({ path: 'output/mobile-feeding-final.png' });
  await mobile.locator('#guide-button').tap();
  assert.equal(await mobile.locator('.guide-card').count(), 8);
  const modalBounds = await mobile.locator('#modal').boundingBox();
  assert.ok(modalBounds.x >= 0 && modalBounds.x + modalBounds.width <= 390);
  await mobile.locator('#modal-close').tap();
  checks.push('real mobile touch swipe feeds; modal and page fit phone');
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
