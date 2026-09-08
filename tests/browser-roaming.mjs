import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];
const snapshot = page => page.evaluate(() => window.__sealBay.snapshot());
const resident = (state, id) => state.beachSeals.find(seal => seal.id === id);
const roster = state => state.beachSeals.map(({ id, variant }) => ({ id, variant }));
const eventFor = (state, type, id, direction) => state.roaming.history.find(event => event.type === type && event.id === id && event.direction === direction);

function assertEligibility(state) {
  assert.deepEqual(state.petting.targets.map(target => target.id).sort(),
    state.beachSeals.filter(seal => seal.habitat === 'beach').map(seal => seal.id).sort(),
    'Only settled beach residents are eligible for petting');
}

function assertInitial(state) {
  assert.equal(state.roaming.enabled, true);
  assert.equal(state.roaming.started, 0);
  assert.equal(state.roaming.activeId, null);
  assert.ok(state.roaming.elapsed < 1, 'Start or restart creates a fresh roaming schedule');
  assert.ok(Math.abs(state.roaming.nextAt - 15) < .05);
  assert.equal(state.beachSeals.length, 5);
  assert.equal(new Set(state.beachSeals.map(seal => seal.id)).size, 5);
  assert.equal(state.beachSeals.filter(seal => seal.habitat === 'beach').length, 4);
  const swimmer = resident(state, 'beach-resident-2');
  assert.equal(swimmer.variant, 'harbor-adult');
  assert.equal(swimmer.habitat, 'water');
  assert.ok(Math.abs(swimmer.x - .3) < 1 && Math.abs(swimmer.z + 11) < 1, 'The harbor adult starts in the nearby water');
  assertEligibility(state);
}

async function waitForEligibility(page) {
  await page.waitForFunction(() => {
    const state = window.__sealBay.snapshot();
    const beach = state.beachSeals.filter(seal => seal.habitat === 'beach').map(seal => seal.id).sort();
    return JSON.stringify(beach) === JSON.stringify(state.petting.targets.map(target => target.id).sort());
  });
}

function assertContinuous(previous, current, id) {
  const before = resident(previous, id), after = resident(current, id);
  const dt = current.roaming.elapsed - previous.roaming.elapsed;
  const distance = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  assert.ok(distance <= Math.max(.2, dt * 3 + .15), `The same seal moves continuously: ${distance.toFixed(3)} world units in ${dt.toFixed(3)} seconds`);
  assert.deepEqual(roster(current), roster(previous), 'Travel preserves all five resident identities and model variants');
  assert.ok(current.beachSeals.filter(seal => seal.habitat === 'travel').length <= 1, 'Only one resident travels at a time');
}

async function pauseTrip(page, mobile) {
  await page.locator('#pause-button')[mobile ? 'tap' : 'click']();
  const frozen = await snapshot(page);
  assert.equal(frozen.paused, true);
  assert.equal(await page.locator('#roaming-label').isVisible(), false, 'Pause hides the traveler label');
  await page.waitForTimeout(700);
  const paused = await snapshot(page);
  assert.deepEqual(paused.roaming, frozen.roaming, 'Pause freezes departure timing and travel progress');
  assert.deepEqual(paused.beachSeals, frozen.beachSeals, 'Pause freezes actual resident poses and positions');
  await page.locator('#resume-button')[mobile ? 'tap' : 'click']();
}

async function trackTrip(page, { mobile, clocked = false, pause = false }) {
  let previous = await snapshot(page);
  const id = previous.roaming.activeId;
  const first = resident(previous, id);
  const direction = first.travelDirection;
  const destination = direction === 'to-beach' ? 'beach' : 'water';
  assert.ok(['to-beach', 'to-water'].includes(direction));
  assert.equal(first.habitat, 'travel');
  assert.equal(await page.locator('#roaming-label').isVisible(), true, 'The moving resident has an actual on-screen label');
  assertEligibility(previous);
  let paused = false, movingSamples = 0;
  const samples = [first];
  const captureAt = direction === 'to-beach' ? [.22, .65] : [.4];
  const captured = new Set();
  for (let step = 0; step < 32; step += 1) {
    if (clocked) await page.clock.runFor(500);
    else await page.waitForTimeout(500);
    const current = await snapshot(page);
    const seal = resident(current, id);
    assertContinuous(previous, current, id);
    samples.push(seal);
    if (seal.habitat !== 'travel') {
      assert.equal(seal.habitat, destination);
      assert.equal(current.roaming.activeId, null);
      if (!clocked) await waitForEligibility(page);
      else await page.clock.runFor(32);
      const arrived = await snapshot(page);
      assertEligibility(arrived);
      assert.equal(await page.locator('#roaming-label').isVisible(), false, 'Arrival clears the moving label');
      const departure = eventFor(arrived, 'depart', id, direction);
      const crossing = eventFor(arrived, 'shore-cross', id, direction);
      const arrival = eventFor(arrived, 'arrive', id, direction);
      assert.ok(departure && crossing && arrival, 'The trip records departure, crossing the shoreline and arrival');
      assert.ok(crossing.at > departure.at && crossing.at < arrival.at);
      assert.ok(Math.abs(arrival.at - departure.at - 12) < .15, 'The journey lasts twelve active seconds');
      assert.ok(movingSamples >= 8, 'Several real intermediate positions were observed');
      assert.ok(Math.abs(seal.z - first.z) > 4, 'The resident crosses the actual world-space shoreline');
      assert.ok(direction === 'to-beach' ? seal.z < first.z : seal.z > first.z, 'The resident moves toward its declared habitat');
      return { id, direction, arrived, samples };
    }
    assert.equal(seal.travelDirection, direction);
    assert.ok(seal.travelProgress >= resident(previous, id).travelProgress);
    assert.ok(seal.travelProgress >= 0 && seal.travelProgress <= 1);
    assertEligibility(current);
    for (const progress of captureAt) {
      if (seal.travelProgress < progress || captured.has(progress)) continue;
      captured.add(progress);
      const device = mobile ? 'mobile' : 'desktop';
      const journey = direction === 'to-beach' ? 'incoming' : 'outgoing';
      await page.screenshot({ path: `output/${device}-roaming-${journey}-${Math.round(progress * 100)}.png` });
    }
    if (Math.hypot(seal.x - resident(previous, id).x, seal.z - resident(previous, id).z) > .005) movingSamples += 1;
    if (pause && !paused && seal.travelProgress > .2) {
      await pauseTrip(page, mobile);
      paused = true;
    }
    previous = await snapshot(page);
  }
  assert.fail('The resident must arrive within the twelve-second journey');
}

async function laterTrip(page, firstTrip) {
  const firstDeparture = eventFor(firstTrip.arrived, 'depart', firstTrip.id, 'to-beach');
  const interval = firstTrip.arrived.roaming.nextAt - firstDeparture.at;
  assert.ok(interval >= 42 && interval <= 58, 'The next departure is separated by a long natural interval');
  // runFor executes every animation frame; it advances time without rewriting game state.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 50);
  let state = await snapshot(page);
  for (let step = 0; step < 120 && state.roaming.started === 1; step += 1) {
    const previous = state;
    await page.clock.runFor(500);
    state = await snapshot(page);
    if (state.roaming.activeId) assertContinuous(previous, state, state.roaming.activeId);
  }
  assert.equal(state.roaming.started, 2, 'The scheduler naturally begins a second trip');
  assert.ok(state.roaming.activeId);
  assert.equal(resident(state, state.roaming.activeId).travelDirection, 'to-water');
  const departure = eventFor(state, 'depart', state.roaming.activeId, 'to-water');
  assert.ok(departure.at - firstDeparture.at >= 42 && departure.at - firstDeparture.at <= 58);
  assertEligibility(state);
  const trip = await trackTrip(page, { mobile: false, clocked: true });
  const swimmer = resident(trip.arrived, trip.id);
  assert.ok(swimmer.z > -14, 'The departing resident settles in the water');
  assert.equal(trip.arrived.petting.targets.some(target => target.id === trip.id), false);
  await page.clock.runFor(1200);
  const settled = await snapshot(page);
  assert.equal(resident(settled, trip.id).habitat, 'water', 'The seal remains in the water after the trip');
  assert.equal(settled.roaming.started, 2, 'Trips do not immediately repeat');
  await page.screenshot({ path: 'output/desktop-roaming-water.png' });
  await page.clock.resume();
}

async function lifecycleChecks(page, mobile, initialRoster) {
  await page.locator('#pause-button')[mobile ? 'tap' : 'click']();
  await page.locator('#restart-button')[mobile ? 'tap' : 'click']();
  await waitForEligibility(page);
  const restarted = await snapshot(page);
  assertInitial(restarted);
  assert.deepEqual(roster(restarted), initialRoster, 'Restart preserves one instance of every resident');
  assert.equal(restarted.roaming.history.length, 0, 'Restart clears old trip events');
  assert.equal(await page.locator('#roaming-label').isVisible(), false);
  await page.locator('#pause-button')[mobile ? 'tap' : 'click']();
  await page.locator('#back-home-button')[mobile ? 'tap' : 'click']();
  const home = await snapshot(page);
  assert.equal(home.status, 'intro');
  assert.equal(home.roaming.enabled, false);
  assert.equal(home.roaming.activeId, null);
  assert.equal(home.beachSeals.some(seal => seal.habitat === 'travel'), false);
  assert.equal(await page.locator('#roaming-label').isVisible(), false);
  await page.waitForTimeout(400);
  assert.deepEqual((await snapshot(page)).roaming, home.roaming, 'The home screen cannot keep the travel schedule running');
  await page.locator('#start-button')[mobile ? 'tap' : 'click']();
  await waitForEligibility(page);
  assertInitial(await snapshot(page));
}

try {
  for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const mobile = device === 'mobile';
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    try {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.clock.install();
      await page.goto(baseURL);
      await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
      assert.ok((await snapshot(page)).roaming, 'The real game exposes a read-only roaming snapshot');
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#start-button')[mobile ? 'tap' : 'click']();
      await waitForEligibility(page);
      const initial = await snapshot(page);
      assertInitial(initial);
      await page.waitForFunction(() => window.__sealBay.snapshot().roaming.activeId !== null);
      await waitForEligibility(page);
      const departing = await snapshot(page);
      assert.equal(departing.roaming.started, 1);
      assert.equal(departing.roaming.activeId, 'beach-resident-2');
      assert.ok(Math.abs(departing.roaming.lastDepartureAt - 15) < .15, 'The first trip starts at fifteen active seconds');
      assert.equal(resident(departing, departing.roaming.activeId).travelDirection, 'to-beach');
      const startingSwimmer = resident(initial, departing.roaming.activeId);
      const leavingSwimmer = resident(departing, departing.roaming.activeId);
      assert.ok(Math.hypot(leavingSwimmer.x - startingSwimmer.x, leavingSwimmer.z - startingSwimmer.z) < .5,
        'Starting the first trip cannot teleport the swimmer out of its water position');
      const trip = await trackTrip(page, { mobile, pause: true });
      assert.equal(resident(trip.arrived, trip.id).habitat, 'beach');
      assert.ok(trip.arrived.petting.targets.some(target => target.id === trip.id), 'The arriving adult becomes available for petting');
      await page.screenshot({ path: `output/${device}-roaming-arrival.png` });
      checks.push(`${device}: natural first departure, continuous twelve-second shoreline crossing, stable identity, pause/resume and petting eligibility`);
      if (!mobile) {
        await laterTrip(page, trip);
        checks.push('desktop: later reverse trip, 42-58 second departure spacing and settled water habitat');
      }
      await lifecycleChecks(page, mobile, roster(initial));
      checks.push(`${device}: restart and home clean up travel, history and label without duplicating residents`);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
