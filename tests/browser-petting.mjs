import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];
const snapshot = page => page.evaluate(() => window.__sealBay.snapshot());
const toolButton = (page, tool) => page.locator(`[data-petting-tool="${tool}"]`);
const lifecycle = ({ targets, ...state }) => state;

async function ready(page, mobile) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
  assert.ok((await snapshot(page)).petting, 'The real game exposes read-only petting state');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#start-button')[mobile ? 'tap' : 'click']();
  assert.equal((await snapshot(page)).petting.phase, 'idle');
  assert.equal((await snapshot(page)).petting.completed, 0);
  assert.equal(await page.locator('#petting-tools').count(), 1);
  assert.equal(await page.locator('[data-petting-tool]').count(), 2);
  assert.equal(await page.locator('#petting-tools').isVisible(), true);
}

async function fitsViewport(page, locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} is visible`);
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
    && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
  `${label} fits ${width}x${height}: ${JSON.stringify(box)}`);
}

async function request(page, first = false) {
  // Requests arise from six active seconds, with later requests using the natural cooldown.
  await page.waitForFunction(() => window.__sealBay.snapshot().petting.phase === 'requesting');
  const state = await snapshot(page);
  const { residentId, toolId } = state.petting.request;
  const target = state.petting.targets.find(item => item.id === residentId);
  assert.ok(target?.visible, 'The requested beach resident is a visible target');
  if (first) {
    assert.ok(state.elapsed >= 5.9, 'The first request waits six active seconds');
    assert.equal(toolId, 'brush');
    assert.equal(target.variant, 'harp-pup', 'The first request belongs to the beach pup');
  }
  const bubble = page.locator('#petting-request');
  assert.equal(await bubble.getAttribute('data-resident-id'), residentId);
  assert.equal(await bubble.getAttribute('data-tool-id'), toolId);
  await fitsViewport(page, bubble, 'Request bubble');
  await fitsViewport(page, page.locator('#petting-tools'), 'Petting toolbar');
  for (const tool of ['brush', 'mitten']) await fitsViewport(page, toolButton(page, tool), `${tool} button`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false,
    'The toolbar does not cause horizontal page overflow');
  return state;
}

async function createPointer(page, touch) {
  const session = touch ? await page.context().newCDPSession(page) : null;
  let down = false;
  return {
    async begin(point) {
      if (touch) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      down = true;
    },
    async move(point) {
      if (touch) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y }] });
      else await page.mouse.move(point.x, point.y);
    },
    async end() {
      if (!down) return;
      if (touch) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      down = false;
    },
    async cancel() {
      assert.ok(touch, 'Native pointer cancellation uses the touch device');
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      down = false;
    },
    async close() {
      try { await this.end(); } finally { if (session) await session.detach(); }
    },
  };
}

async function beginDrag(page, pointer, tool, destination) {
  const box = await toolButton(page, tool).boundingBox();
  assert.ok(box, 'The selected tool has an on-screen button');
  const source = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await pointer.begin(source);
  for (let step = 1; step <= 6; step += 1) {
    await pointer.move({
      x: source.x + (destination.x - source.x) * step / 6,
      y: source.y + (destination.y - source.y) * step / 6,
    });
  }
  await page.waitForFunction(() => Boolean(window.__sealBay.snapshot().petting.dragging));
  assert.equal(await page.locator('#petting-drag').isVisible(), true, 'Dragging shows the real tool ghost');
}

async function drop(page, pointer, tool, destination) {
  await beginDrag(page, pointer, tool, destination);
  const beforeRelease = await snapshot(page);
  await pointer.end();
  await page.waitForFunction(() => !window.__sealBay.snapshot().petting.dragging);
  return beforeRelease;
}

function activeTarget(state) {
  return state.petting.targets.find(item => item.id === state.petting.request.residentId);
}

function unchangedReward(state, before, label) {
  assert.equal(state.petting.phase, 'requesting', label);
  assert.deepEqual(state.petting.request, before.petting.request, `${label}: same request`);
  assert.equal(state.petting.completed, before.petting.completed, `${label}: no completion`);
  assert.equal(state.activeHearts, 0, `${label}: no premature hearts`);
  assert.equal(state.throws, before.throws, `${label}: no accidental fish throw`);
}

async function negativeDrops(page, pointer) {
  const before = await snapshot(page);
  const { toolId, residentId } = before.petting.request;
  const instruction = page.locator('#petting-instruction');
  const defaultHint = await instruction.innerText();
  const requestedToolName = (await toolButton(page, toolId).innerText()).trim();
  await drop(page, pointer, toolId === 'brush' ? 'mitten' : 'brush', activeTarget(before));
  unchangedReward(await snapshot(page), before, 'Wrong tool on the requested seal is rejected');
  assert.notEqual(await instruction.innerText(), defaultHint, 'The toolbar explains the wrong tool');
  assert.ok((await instruction.innerText()).includes(requestedToolName), 'Inline feedback names the tool the seal requested');
  await fitsViewport(page, instruction, 'Wrong-tool feedback');

  const current = await snapshot(page);
  const target = activeTarget(current);
  const other = current.petting.targets.find(item => item.visible && item.id !== residentId
    && Math.hypot((item.x - target.x) / target.rx, (item.y - target.y) / target.ry) > 1.2);
  assert.ok(other, 'There is another distinct visible beach seal for the wrong-target check');
  await drop(page, pointer, toolId, other);
  unchangedReward(await snapshot(page), before, 'Correct tool on another seal is rejected');
  assert.equal(await instruction.innerText(), '拖到有摸摸提示的海豹', 'Inline feedback directs a wrong-resident drop to the requesting seal');
  await fitsViewport(page, instruction, 'Wrong-resident feedback');

  const { width, height } = page.viewportSize();
  const water = { x: width / 2, y: height * .7 };
  assert.ok(current.petting.targets.every(item => !item.visible
    || Math.hypot((water.x - item.x) / item.rx, (water.y - item.y) / item.ry) > 1),
  'The water drop is outside all seal hit regions');
  await drop(page, pointer, toolId, water);
  unchangedReward(await snapshot(page), before, 'Dropping into water is rejected');

  const box = await toolButton(page, toolId).boundingBox();
  await pointer.begin({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await pointer.end();
  await pointer.begin(activeTarget(await snapshot(page)));
  await pointer.end();
  await page.waitForTimeout(150);
  unchangedReward(await snapshot(page), before, 'Clicking a tool and seal without dragging is rejected');
}

async function pauseDuringDrag(page, pointer) {
  const before = await snapshot(page);
  await beginDrag(page, pointer, before.petting.request.toolId, activeTarget(before));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sealBay.snapshot().paused);
  const frozen = await snapshot(page);
  assert.equal(Boolean(frozen.petting.dragging), false, 'Pause cancels the active pointer drag');
  assert.equal(await page.locator('#petting-drag').isVisible(), false, 'Pause removes the tool ghost');
  await pointer.end();
  await page.waitForTimeout(400);
  const stillPaused = await snapshot(page);
  assert.equal(stillPaused.elapsed, frozen.elapsed);
  assert.deepEqual(lifecycle(stillPaused.petting), lifecycle(frozen.petting), 'Pause freezes the petting lifecycle');
  assert.deepEqual(stillPaused.beachSeals, frozen.beachSeals, 'Pause freezes actual beach resident poses');
  await page.locator('#resume-button').click();
  await page.waitForTimeout(250);
  unchangedReward(await snapshot(page), before, 'Releasing a canceled drag never completes after resume');
}

async function successfulDrop(page, pointer, { pauseStroke = false, screenshot } = {}) {
  const before = await snapshot(page);
  const released = await drop(page, pointer, before.petting.request.toolId, activeTarget(before));
  let state = await snapshot(page);
  assert.equal(state.petting.phase, 'petting', 'A matching drop starts the automatic petting stroke');
  assert.equal(state.petting.completed, before.petting.completed, 'Release alone does not award a completion');
  assert.equal(state.activeHearts, 0, 'Hearts wait for the petting stroke to finish');
  await page.waitForTimeout(250);
  state = await snapshot(page);
  assert.equal(state.petting.phase, 'petting');
  assert.equal(state.petting.completed, before.petting.completed);
  if (pauseStroke) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__sealBay.snapshot().paused);
    const frozen = await snapshot(page);
    await page.waitForTimeout(1400);
    state = await snapshot(page);
    assert.equal(state.elapsed, frozen.elapsed);
    assert.deepEqual(lifecycle(state.petting), lifecycle(frozen.petting), 'A paused automatic stroke cannot finish on wall-clock time');
    assert.deepEqual(state.beachSeals, frozen.beachSeals, 'Pause freezes the automatic stroke pose');
    assert.equal(state.activeHearts, 0);
    await page.locator('#resume-button').click();
  }
  await page.waitForFunction(count => {
    const state = window.__sealBay.snapshot();
    return state.petting.phase === 'happy' && state.petting.completed === count && state.activeHearts > 0;
  }, before.petting.completed + 1);
  state = await snapshot(page);
  assert.ok(state.elapsed - released.elapsed >= 1.15, 'Hearts begin only after the 1.2-second active stroke');
  assert.equal(state.throws, before.throws, 'Tool dragging never throws a fish');
  if (screenshot) {
    await page.waitForTimeout(650);
    assert.ok((await snapshot(page)).activeHearts > 0, 'The heart effect remains visible for the capture');
    await page.screenshot({ path: screenshot });
  }
  return state;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const mouse = await createPointer(desktop, false);
  try {
    await ready(desktop, false);
    await request(desktop, true);
    await desktop.screenshot({ path: 'output/desktop-petting-request.png' });
    await negativeDrops(desktop, mouse);
    await pauseDuringDrag(desktop, mouse);
    await successfulDrop(desktop, mouse, { pauseStroke: true });
    checks.push('desktop mouse: natural brush request, wrong tool/seal/water and click rejected, delayed real hearts');
    checks.push('desktop pause: drag cancellation, no late drop, frozen request and automatic stroke, resume');

    await desktop.locator('#pause-button').click();
    await desktop.locator('#restart-button').click();
    const reset = await snapshot(desktop);
    assert.equal(reset.petting.phase, 'idle');
    assert.equal(reset.petting.request, null, 'Restart removes the old active request');
    assert.equal(reset.petting.completed, 0);
    assert.equal(Boolean(reset.petting.dragging), false);
    assert.equal(reset.activeHearts, 0, 'Restart removes previous heart effects');
    assert.equal(await desktop.locator('#petting-request').isVisible(), false);
    assert.equal(await desktop.locator('#petting-drag').isVisible(), false);
    assert.equal(await desktop.locator('#petting-tools').count(), 1, 'Restart cannot duplicate the toolbar');
    assert.equal(await desktop.locator('[data-petting-tool]').count(), 2);
    await desktop.locator('#pause-button').click();
    await desktop.locator('#back-home-button').click();
    assert.equal((await snapshot(desktop)).status, 'intro');
    for (const id of ['#petting-tools', '#petting-request', '#petting-drag']) {
      assert.equal(await desktop.locator(id).isVisible(), false, `Home removes ${id}`);
    }
    checks.push('restart clears request, count, drag and effects without duplicating tools; home hides all petting UI');
  } finally {
    await mouse.close();
    await desktop.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const touch = await createPointer(mobile, true);
  try {
    await ready(mobile, true);
    await request(mobile, true);
    await negativeDrops(mobile, touch);
    const beforeCancel = await snapshot(mobile);
    await beginDrag(mobile, touch, beforeCancel.petting.request.toolId, activeTarget(beforeCancel));
    await touch.cancel();
    await mobile.waitForFunction(() => !window.__sealBay.snapshot().petting.dragging);
    assert.equal(await mobile.locator('#petting-drag').isVisible(), false, 'Touch cancellation removes the ghost');
    unchangedReward(await snapshot(mobile), beforeCancel, 'A canceled native touch cannot complete the request');
    const firstHappy = await successfulDrop(mobile, touch, { screenshot: 'output/mobile-petting-heart.png' });
    await mobile.waitForTimeout(700);
    assert.equal((await snapshot(mobile)).petting.phase, 'happy', 'The happy reaction persists after the hearts appear');
    const second = await request(mobile);
    assert.equal(second.petting.request.toolId, 'mitten', 'The next natural request offers the other tool');
    assert.notEqual(second.petting.request.residentId, firstHappy.petting.request.residentId);
    await successfulDrop(mobile, touch);
    assert.equal((await snapshot(mobile)).petting.completed, 2);
    assert.equal((await snapshot(mobile)).throws, 0);
    checks.push('390x844 real CDP touch: both tools succeed, invalid drags fail, visible requests, hearts and no overflow');
  } finally {
    await touch.close();
    await mobile.close();
  }

  const landscape = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const landscapeMouse = await createPointer(landscape, false);
  try {
    await ready(landscape, false);
    await request(landscape, true);
    await landscape.screenshot({ path: 'output/landscape-petting-request.png' });
    await successfulDrop(landscape, landscapeMouse);
    assert.equal((await snapshot(landscape)).petting.completed, 1);
    checks.push('844x390 landscape mouse: natural request and toolbar fit, matching drop completes with real hearts');
  } finally {
    await landscapeMouse.close();
    await landscape.close();
  }

  const compact = await browser.newPage({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    await ready(compact, true);
    await request(compact, true);
    const bubble = await compact.locator('#petting-request').boundingBox();
    for (const selector of ['.brand', '.header-actions', '#session-stats', '.visitors-panel']) {
      const element = compact.locator(selector);
      if (!await element.isVisible()) continue;
      const box = await element.boundingBox();
      assert.ok(bubble.x + bubble.width <= box.x || box.x + box.width <= bubble.x
        || bubble.y + bubble.height <= box.y || box.y + box.height <= bubble.y,
      `The compact request bubble does not overlap ${selector}`);
    }
    await compact.screenshot({ path: 'output/compact-petting-request.png' });
    checks.push('320x568: natural request, toolbar and tools fit; bubble avoids stats and header controls');
  } finally {
    await compact.close();
  }
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
