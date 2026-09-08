import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Observes browser audio through DevTools; all game actions use the real UI.
const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
const audioPath = new URL('audio/', `${baseURL.replace(/\/$/, '')}/`).pathname;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const session = await page.context().newCDPSession(page);
  const contexts = new Map();
  const sources = [];
  const requests = [];
  const responses = [];
  const pageErrors = [];
  const consoleErrors = [];
  session.on('WebAudio.contextCreated', ({ context }) => contexts.set(context.contextId, context));
  session.on('WebAudio.contextChanged', ({ context }) => contexts.set(context.contextId, context));
  session.on('WebAudio.contextWillBeDestroyed', ({ contextId }) => contexts.delete(contextId));
  session.on('WebAudio.audioNodeCreated', ({ node }) => {
    if (node.nodeType === 'AudioBufferSource') sources.push(node);
  });
  await session.send('WebAudio.enable');
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith(audioPath)) requests.push(request.url());
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith(audioPath)) {
      responses.push({ url: response.url(), status: response.status() });
    }
  });
  const snapshot = () => page.evaluate(() => window.__sealBay.snapshot());
  const audioIs = (state) => page.waitForFunction(
    (expected) => window.__sealBay.snapshot().audio === expected, state,
  );
  const contextIs = async (state) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if ([...contexts.values()].some((context) => context.contextState === state)) return;
      await page.waitForTimeout(50);
    }
    assert.fail(`Expected a ${state} Web Audio context: ${JSON.stringify([...contexts.values()])}`);
  };

  await page.goto(baseURL);
  await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
  const intro = await snapshot();
  assert.equal(intro.status, 'intro');
  assert.equal(intro.audio, 'locked');
  assert.equal(contexts.size, 0, 'Intro must not create an audio context');
  assert.equal(requests.length, 0, 'Intro must not fetch call audio before a gesture');
  assert.equal(await page.locator('#fatal').isVisible(), false);

  await page.locator('#start-button').click();
  await audioIs('ready');
  await contextIs('running');
  assert.equal((await snapshot()).status, 'playing');
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');
  assert.equal(contexts.size, 1);
  assert.equal(requests.length, 1);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(sources.length, 0, 'No procedural or animal source starts merely on Start');

  await page.waitForFunction(
    () => window.__sealBay.snapshot().seals.some((seal) => seal.state === 'calling'),
    null, { timeout: 20000 },
  );
  const calling = await snapshot();
  assert.ok(sources.length > 0, 'A natural waiting-to-calling transition creates a recorded-audio source');

  await page.locator('#sound-button').click();
  await audioIs('muted');
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => localStorage.getItem('seal-bay:muted')), 'true');
  await page.waitForTimeout(100);
  const mutedSources = sources.length;
  await page.waitForTimeout(1100);
  assert.equal(sources.length, mutedSources, 'No new audio sources are created while muted');

  await page.keyboard.press('m');
  await audioIs('ready');
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'true');
  await page.locator('#pause-button').click();
  await audioIs('paused');
  await contextIs('suspended');
  const paused = await snapshot();
  const pauseSources = sources.length;
  await page.waitForTimeout(800);
  const stillPaused = await snapshot();
  assert.equal(stillPaused.elapsed, paused.elapsed, 'Pause freezes simulation time');
  assert.deepEqual(stillPaused.seals, paused.seals, 'Pause freezes visitor states and positions');
  assert.equal(sources.length, pauseSources, 'Paused visitors create no audio sources');

  await page.keyboard.press('m');
  await audioIs('paused');
  assert.equal(await page.evaluate(() => localStorage.getItem('seal-bay:muted')), 'true');
  await contextIs('suspended');
  await page.locator('#resume-button').click();
  await audioIs('muted');
  assert.equal((await snapshot()).paused, false, 'Resume respects a mute chosen while paused');
  await page.keyboard.press('m');
  await audioIs('ready');
  await contextIs('running');

  await page.locator('#help-button').click();
  await audioIs('paused');
  await contextIs('suspended');
  await page.keyboard.press('Escape');
  await audioIs('ready');
  assert.equal((await snapshot()).paused, false);

  await page.locator('#pause-button').click();
  await page.locator('#back-home-button').click();
  await page.waitForFunction(() => window.__sealBay.snapshot().status === 'intro');
  await page.locator('#credits-button').click();
  assert.match(await page.locator('#modal-content').innerText(), /烟台东炮台海豹湾/);
  assert.equal(
    await page.locator('#modal-content .credits-link').getAttribute('href'),
    'https://www.bilibili.com/video/BV1cV411X7GW/?t=15',
  );
  await page.locator('#modal-close').click();
  await audioIs('ready');
  await page.locator('#sound-button').click();
  await audioIs('muted');

  const audioRequestsBeforeReload = requests.length;
  await page.reload();
  await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
  await audioIs('muted');
  assert.equal(requests.length, audioRequestsBeforeReload, 'Persisted mute still prevents intro preload');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__sealBay.snapshot().status === 'playing');
  await audioIs('muted');
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false');
  await page.locator('#sound-button').click();
  await audioIs('ready');
  assert.equal(await page.evaluate(() => localStorage.getItem('seal-bay:muted')), 'false');

  assert.deepEqual(pageErrors, [], 'The real game must not throw page errors');
  assert.deepEqual(consoleErrors, [], 'The real game must not emit console errors');
  console.log(JSON.stringify({
    result: 'passed',
    models: intro.loaded,
    firstNaturalCallAt: Number(calling.elapsed.toFixed(2)),
    recordings: responses,
    checks: ['gesture unlock', 'actual call source', 'mute + keyboard shortcut', 'pause + resume',
      'modal pause', 'mute persistence', 'source attribution', 'no page or console errors'],
  }, null, 2));
} finally {
  await browser.close();
}
