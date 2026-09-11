import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
const ids = ['otter-sea-adult', 'otter-sea-pup', 'otter-river'];
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];
const snapshot = page => page.evaluate(() => window.__sealBay.snapshot());
const otter = (state, id) => state.otters.find(resident => resident.id === id);
const river = state => otter(state, 'otter-river');
const position = resident => [resident.x, resident.y, resident.z, resident.yaw];
const distance = (first, second) => Math.hypot(second.x - first.x, second.z - first.z);
const toolButton = (page, tool) => page.locator(`[data-petting-tool="${tool}"]`);

async function activate(page, selector, mobile) {
  await page.locator(selector)[mobile ? 'tap' : 'click']({ force: true });
  await page.clock.runFor(64);
}

function assertResidents(state) {
  assert.equal(state.loaded, 8, 'All eight original feeding seals remain ready');
  assert.equal(state.otterLoaded, 3, 'The fully ready bay has loaded all three original otter models');
  assert.deepEqual(state.otters.map(resident => resident.id).sort(), [...ids].sort(), 'Every companion exists exactly once');
  assert.equal(state.beachSeals.length, 5, 'The original beach residents remain intact');
  for (const resident of state.otters) {
    assert.ok(position(resident).every(Number.isFinite));
    for (const name of ['Body', 'Head', 'Eye_L', 'Eye_R', 'Forepaw_L', 'Forepaw_R', 'Hindpaw_L', 'Hindpaw_R', 'Tail']) {
      const joint = resident.joints[name];
      assert.ok(joint, `${resident.id} has its authored ${name} joint`);
      assert.equal(joint.position.length, 3);
      assert.equal(joint.quaternion.length, 4);
      assert.equal(joint.scale.length, 3);
      assert.ok([...joint.position, ...joint.quaternion, ...joint.scale].every(Number.isFinite));
    }
  }
  for (const id of ['otter-sea-adult', 'otter-sea-pup']) {
    const resident = otter(state, id);
    assert.equal(resident.species, '海獭');
    assert.equal(resident.habitat, 'water');
    assert.equal(resident.behavior, 'floating');
    assert.ok(Math.abs(resident.y) < 0.6, 'A sea otter floats close to the water surface');
    assert.ok(resident.z > river(state).z + 2, 'Sea otters occupy water in front of the river otter');
    assert.ok(resident.joints.Shell, 'Both sea otters retain the shells held on their bellies');
  }
  assert.equal(river(state).species, '水獭');
  assert.equal(river(state).habitat, 'beach');
  assert.equal(river(state).behavior, 'walking');
  assert.ok(river(state).y > 0, 'The river otter stands on the raised sand');
  assert.equal(river(state).joints.Shell, undefined, 'The river otter has its own four-paw anatomy');
}

function assertEligibility(state) {
  const expected = [...state.beachSeals.filter(seal => seal.habitat === 'beach').map(seal => seal.id), 'otter-river'].sort();
  assert.deepEqual(state.petting.targets.map(target => target.id).sort(), expected,
    'Only the river otter joins settled beach seals as petting targets');
  const target = state.petting.targets.find(item => item.id === 'otter-river');
  assert.ok(target?.visible, 'The actual river-otter target is visible in this viewport');
  assert.equal(target.variant, 'river-otter');
}

async function fitsViewport(page, locator, label) {
  assert.equal(await locator.isVisible(), true, `${label} is visible`);
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
    && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
  `${label} fits ${width}x${height}: ${JSON.stringify(box)}`);
}

async function inspectGuide(page, mobile, device) {
  await activate(page, '#guide-button', mobile);
  assert.equal(await page.locator('.guide-card').count(), 8, 'The original eight seal cards stay separate');
  assert.equal(await page.locator('.companion-card').count(), 3, 'The three new companions have their own cards');
  const text = await page.locator('#modal-content').innerText();
  for (const name of ['贝贝', '栗子', '豆豆']) assert.ok(text.includes(name), `The guide names ${name}`);
  assert.match(text, /海獭/);
  assert.match(text, /水獭/);
  await page.locator('.companion-card img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  assert.equal(await page.locator('.companion-card img').evaluateAll(images => images.every(image => image.naturalWidth > 0)), true);
  await page.locator('.companion-card').first().scrollIntoViewIfNeeded();
  const cards = await page.locator('.companion-card').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  }));
  assert.ok(cards.every(card => card.width > 0 && card.left >= 0 && card.right <= page.viewportSize().width + 1),
    'Companion cards fit the page width without horizontal clipping');
  await page.screenshot({ path: `output/${device}-otter-guide.png` });
  await activate(page, '#modal-close', mobile);
}

async function createPointer(page, mobile) {
  const session = mobile ? await page.context().newCDPSession(page) : null;
  let down = false;
  return {
    async begin(point) {
      if (mobile) await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
      else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      down = true;
    },
    async move(point) {
      if (mobile) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y }] });
      else await page.mouse.move(point.x, point.y);
    },
    async end() {
      if (!down) return;
      if (mobile) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      down = false;
    },
    async close() {
      try { await this.end(); } finally { if (session) await session.detach(); }
    },
  };
}

async function matchingDrop(page, pointer) {
  const before = await snapshot(page);
  const { residentId, toolId } = before.petting.request;
  const destination = before.petting.targets.find(target => target.id === residentId);
  assert.ok(destination?.visible, 'The requesting animal can receive a real on-screen drop');
  const box = await toolButton(page, toolId).boundingBox();
  assert.ok(box, 'The matching tool has a visible button');
  const source = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await pointer.begin(source);
  for (let step = 1; step <= 6; step += 1) {
    await pointer.move({ x: source.x + (destination.x - source.x) * step / 6, y: source.y + (destination.y - source.y) * step / 6 });
  }
  assert.equal((await snapshot(page)).petting.dragging, true);
  assert.equal(await page.locator('#petting-drag').isVisible(), true, 'The real tool follows the pointer');
  await pointer.end();
  await page.clock.runFor(64);
  const released = await snapshot(page);
  assert.equal(released.petting.phase, 'petting', 'A matching mouse or touch drop starts petting');
  assert.equal(released.petting.completed, before.petting.completed, 'Release itself does not award a heart');
  assert.equal(released.throws, before.throws, 'Dragging a petting tool cannot throw a fish');
  return released;
}

async function nextRequest(page, afterRequests = 0) {
  for (let step = 0; step < 160; step += 1) {
    const state = await snapshot(page);
    assertResidents(state);
    assertEligibility(state);
    if (state.petting.phase === 'requesting' && state.petting.requestsMade > afterRequests) return state;
    await page.clock.runFor(250);
  }
  assert.fail('A natural petting request must arrive within forty active seconds');
}

async function waitForHappy(page, previousCompleted) {
  for (let step = 0; step < 24; step += 1) {
    const state = await snapshot(page);
    if (state.petting.phase === 'happy' && state.petting.completed === previousCompleted + 1) {
      assert.ok(state.activeHearts > 0, 'Completion produces real heart meshes');
      return state;
    }
    await page.clock.runFor(100);
  }
  assert.fail('The automatic stroke must finish and produce its heart reward');
}

async function careForOtter(page, pointer, mobile, device) {
  const request = await snapshot(page);
  assert.equal(request.petting.request.residentId, 'otter-river');
  assert.equal(await page.locator('#petting-request').getAttribute('data-resident-id'), 'otter-river');
  assert.match(await page.locator('#petting-request').innerText(), /豆豆/);
  await fitsViewport(page, page.locator('#petting-request'), 'River-otter request');
  await fitsViewport(page, page.locator('#petting-tools'), 'Petting tools');
  await page.screenshot({ path: `output/${device}-otter-request.png` });
  const released = await matchingDrop(page, pointer);
  assert.equal(river(released).carePhase, 'petting');
  assert.equal(released.activeHearts, 0, 'Otter hearts wait for the completed stroke');
  await page.clock.runFor(250);
  const stroking = await snapshot(page);
  assert.deepEqual([river(stroking).x, river(stroking).z, river(stroking).yaw],
    [river(released).x, river(released).z, river(released).yaw], 'The river otter stops walking during petting');
  await activate(page, '#pause-button', mobile);
  const frozen = await snapshot(page);
  assert.equal(frozen.paused, true);
  await page.clock.runFor(1800);
  const paused = await snapshot(page);
  assert.deepEqual(paused.otters, frozen.otters, 'Pause freezes all three companions and their joints');
  assert.deepEqual(paused.petting, frozen.petting, 'A paused petting stroke cannot finish');
  assert.equal(paused.activeHearts, 0);
  await activate(page, '#resume-button', mobile);
  const happy = await waitForHappy(page, request.petting.completed);
  assert.equal(river(happy).carePhase, 'happy');
  assert.ok(happy.elapsed - released.elapsed >= 1.1, 'The reward waits for the active 1.2-second stroke');
  assert.deepEqual([river(happy).x, river(happy).z, river(happy).yaw],
    [river(released).x, river(released).z, river(released).yaw], 'The happy otter stays in its petting spot');
  assert.notDeepEqual(river(happy).joints.Head, river(released).joints.Head, 'The happy reaction changes the actual head pose');
  assert.equal(happy.throws, request.throws);
  await page.clock.runFor(350);
  assert.ok((await snapshot(page)).activeHearts > 0);
  await page.screenshot({ path: `output/${device}-otter-happy.png` });
  await page.clock.runFor(3000);
  const settled = await snapshot(page);
  assert.equal(river(settled).carePhase, null);
  await page.clock.runFor(4000);
  const resumed = await snapshot(page);
  assert.ok(distance(river(settled), river(resumed)) > 0.01 || Math.abs(river(settled).yaw - river(resumed).yaw) > 0.02,
    'The river otter resumes walking or turning on its shoreline route after happiness');
  assert.equal(resumed.petting.completed, request.petting.completed + 1, 'A completed stroke awards exactly one reward');
  assertResidents(resumed);
  assertEligibility(resumed);
}

async function lifecycleChecks(page, mobile) {
  await activate(page, '#pause-button', mobile);
  await activate(page, '#restart-button', mobile);
  const reset = await snapshot(page);
  assertResidents(reset);
  assertEligibility(reset);
  assert.ok(reset.otters.every(resident => resident.carePhase === null));
  assert.equal(reset.petting.phase, 'idle');
  assert.equal(reset.petting.request, null);
  assert.equal(reset.petting.completed, 0);
  assert.equal(reset.activeHearts, 0);
  await activate(page, '#pause-button', mobile);
  await activate(page, '#back-home-button', mobile);
  const home = await snapshot(page);
  assertResidents(home);
  assert.equal(home.status, 'intro');
  assert.ok(home.otters.every(resident => resident.carePhase === null));
  assert.equal(await page.locator('#petting-request').isVisible(), false);
  await activate(page, '#start-button', mobile);
  assertResidents(await snapshot(page));
  assertEligibility(await snapshot(page));
}

try {
  for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const mobile = device === 'mobile';
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    const pointer = await createPointer(page, mobile);
    const assets = [];
    try {
      page.on('pageerror', error => errors.push(`${device}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${device}: ${message.text()}`); });
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.pathname.includes('/otters/') && url.pathname.endsWith('.glb')) {
          assets.push({ name: url.pathname.split('/').at(-1), status: response.status() });
        }
      });
      await page.clock.install();
      await page.goto(baseURL);
      await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
      const loaded = await snapshot(page);
      assert.equal(loaded.otterLoaded, 3, 'The fully ready bay has loaded all three original otter models');
      assertResidents(loaded);
      assert.deepEqual(assets.map(asset => asset.name).sort(), ['river-otter.glb', 'sea-otter-adult.glb', 'sea-otter-pup.glb']);
      assert.ok(assets.every(asset => asset.status >= 200 && asset.status < 400), 'All three otter assets arrive successfully');
      // Choose the last eligible request while keeping Three.js identifiers distinct after loading.
      await page.evaluate(() => {
        let seed = 20260911;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return 0.9 + 0.099 * (seed / 0x100000000);
        };
      });
      await page.evaluate(() => document.fonts.ready);
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
      await inspectGuide(page, mobile, device);
      await activate(page, '#start-button', mobile);
      const initial = await snapshot(page);
      assertResidents(initial);
      assertEligibility(initial);
      await page.clock.runFor(4000);
      const moving = await snapshot(page);
      assertResidents(moving);
      assert.ok(distance(river(initial), river(moving)) > 0.01, 'The river otter advances along its short shoreline route over four seconds');
      for (const id of ['otter-sea-adult', 'otter-sea-pup']) {
        const before = otter(initial, id), after = otter(moving, id);
        assert.notDeepEqual(position(after), position(before), `${id} floats with its own animated transform`);
        assert.notDeepEqual(after.joints, before.joints, `${id} has animated paws or grooming motion`);
        assert.equal(after.carePhase, null, 'Floating sea otters do not receive river-otter petting');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'The added companions create no horizontal page overflow');
      await page.screenshot({ path: `output/${device}-otters-bay.png` });
      checks.push(`${device}: three original otter assets, eight unchanged seal cards plus three companion cards, visible river target and independent floating/walking motion`);

      const first = await nextRequest(page);
      assert.equal(first.petting.request.residentId, 'beach-resident-1', 'The first request still belongs to the original beach pup');
      assert.equal(first.petting.targets.find(target => target.id === first.petting.request.residentId).variant, 'harp-pup');
      await matchingDrop(page, pointer);
      await waitForHappy(page, first.petting.completed);
      const second = await nextRequest(page, first.petting.requestsMade);
      assert.equal(second.petting.request.residentId, 'otter-river', 'The deterministic later request reaches the appended river otter naturally');
      await careForOtter(page, pointer, mobile, device);
      checks.push(`${device}: natural river-otter request, matching ${mobile ? 'native CDP touch' : 'mouse'} drag, delayed actual hearts, happy head pose, paused companions and resumed shoreline walk`);
      await lifecycleChecks(page, mobile);
      assert.equal(assets.length, 3, 'Restart and home preserve the three loaded companions without fetching duplicates');
      checks.push(`${device}: restart/home clear care and rewards without duplicating companions`);
    } finally {
      await pointer.close();
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
