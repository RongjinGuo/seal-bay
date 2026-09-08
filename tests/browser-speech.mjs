import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseURL = process.env.SEAL_BAY_URL || 'http://localhost:5173';
const lines = {
  calling: ['我的小鱼呢？', '这里还有小肚子饿啦'],
  eating: ['好香呀！'],
  happy: ['还想再见到你 ♡'],
};
await mkdir('output', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
const checks = [];

// Read the rendered labels and simulation in one browser task so animation cannot race assertions.
const observe = page => page.evaluate(() => {
  const visible = element => Boolean(element?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
  return {
    state: window.__sealBay.snapshot(),
    labels: [...document.querySelectorAll('[data-visitor-id]')].map(label => ({
      id: Number(label.dataset.visitorId),
      bubbleVisible: visible(label.querySelector('.seal-bubble')),
      bubbleText: label.querySelector('.seal-bubble')?.textContent,
      nameVisible: visible(label.querySelector('.seal-name')),
      nameText: label.querySelector('.seal-name')?.textContent,
    })),
    pettingVisible: visible(document.querySelector('#petting-request')),
    toolsVisible: visible(document.querySelector('#petting-tools')),
    roamingVisible: visible(document.querySelector('#roaming-label')),
    roamingText: document.querySelector('#roaming-label')?.textContent,
  };
});

async function activate(page, selector, mobile) {
  // The clock is stopped between samples; force skips animation-frame stability waiting only.
  await page.locator(selector)[mobile ? 'tap' : 'click']({ force: true });
  await page.clock.runFor(64);
}

function assertReset(sample, status) {
  const { speech } = sample.state;
  assert.equal(sample.state.status, status);
  assert.equal(speech.active, null);
  assert.deepEqual(speech.spokenIds, []);
  assert.equal(speech.nextAt, 7);
  assert.ok(speech.elapsed < 0.25, 'A fresh schedule starts near zero active seconds');
  assert.equal(sample.labels.filter(label => label.bubbleVisible).length, 0);
}

function audit(sample, observed) {
  const { state, labels } = sample;
  const { speech } = state;
  const bubbles = labels.filter(label => label.bubbleVisible);
  assert.ok(bubbles.length <= 1, 'At most one water visitor has a dialogue bubble');
  assert.equal(bubbles.length, speech.active ? 1 : 0, 'Rendered dialogue matches the active speech');
  assert.ok(Math.abs(speech.elapsed - state.elapsed) < 0.05, 'Speech uses active game time');
  assert.equal(new Set(speech.spokenIds).size, speech.spokenIds.length);
  assert.ok(speech.spokenIds.every(id => state.seals.some(seal => seal.id === id)), 'Departed visitors leave no retained speech history');

  if (speech.active) {
    const active = speech.active;
    const seal = state.seals.find(candidate => candidate.id === active.id);
    assert.ok(seal, 'The speaker exists in the real feeding bay');
    assert.equal(seal.state, active.kind, 'The line matches the current visitor state');
    assert.ok(lines[active.kind]?.includes(active.text), 'The line is one of the short state-specific phrases');
    assert.equal(bubbles[0].id, active.id);
    assert.equal(bubbles[0].bubbleText, active.text);
    assert.ok(active.remaining > 0 && active.remaining <= 2.6);
    assert.ok(speech.spokenIds.includes(active.id));
    if (observed.current?.id !== active.id) {
      assert.ok(!observed.seen.has(active.id), 'Each visitor speaks once during its lifetime');
      const startedAt = speech.elapsed - (2.6 - active.remaining);
      assert.ok(startedAt >= 7 - 0.02, 'The opening seven seconds stay quiet');
      const gap = speech.nextAt - startedAt - 2.6;
      assert.ok(gap >= 12 - 0.02 && gap <= 18 + 0.02, 'The next scheduled start includes a twelve-to-eighteen-second quiet gap');
      const previous = observed.started.at(-1);
      if (previous) assert.ok(startedAt - previous.startedAt - 2.6 >= 12 - 0.02,
        'Actual consecutive speeches leave at least twelve quiet seconds');
      observed.current = { id: active.id, kind: active.kind, startedAt };
      observed.started.push(observed.current);
      observed.seen.add(active.id);
    }
  } else if (observed.current) {
    const previous = observed.current;
    const seal = state.seals.find(candidate => candidate.id === previous.id);
    if (seal?.state === previous.kind) {
      const duration = speech.elapsed - previous.startedAt;
      assert.ok(duration >= 2.6 - 0.02 && duration <= 2.6 + 0.3,
        `An uninterrupted bubble lasts 2.6 seconds, observed ${duration.toFixed(3)}`);
      observed.fullDuration = true;
    }
    observed.current = null;
  }

  if (state.petting.phase === 'requesting') {
    const target = state.petting.targets.find(item => item.id === state.petting.request.residentId);
    if (target?.visible) {
      assert.ok(sample.pettingVisible, 'The separate petting request remains visible');
      assert.ok(sample.toolsVisible, 'Petting tools remain available');
      observed.petting = true;
    }
  }
  if (state.roaming.activeId) {
    assert.ok(sample.roamingVisible, 'A traveling resident keeps its separate route label');
    assert.match(sample.roamingText, /上岸晒太阳|去水里游游/);
    observed.roaming = true;
  }
}

async function pauseSpeech(page, mobile) {
  await activate(page, '#pause-button', mobile);
  const frozen = await observe(page);
  assert.equal(frozen.state.paused, true);
  assert.ok(frozen.state.speech.active, 'Pause is exercised during a real speech');
  await page.clock.runFor(6000);
  const paused = await observe(page);
  assert.deepEqual(paused.state.speech, frozen.state.speech, 'Pause freezes the complete dialogue state');
  assert.deepEqual(paused.state.seals, frozen.state.seals, 'Pause also freezes the actual speakers');
  await activate(page, '#resume-button', mobile);
  const resumed = await observe(page);
  assert.equal(resumed.state.paused, false);
  assert.equal(resumed.state.speech.active?.id, frozen.state.speech.active.id);
  assert.ok(resumed.state.speech.active.remaining >= frozen.state.speech.active.remaining - 0.1,
    'Resuming cannot consume the six paused seconds or replace the speaker');
}

async function lifecycleChecks(page, mobile) {
  await activate(page, '#pause-button', mobile);
  await activate(page, '#restart-button', mobile);
  assertReset(await observe(page), 'playing');
  await page.clock.runFor(2000);
  assert.equal((await observe(page)).state.speech.active, null, 'Restart restores the opening quiet period');
  await activate(page, '#pause-button', mobile);
  await activate(page, '#back-home-button', mobile);
  const home = await observe(page);
  assertReset(home, 'intro');
  assert.ok(home.labels.some(label => label.nameVisible), 'Home retains the residents\' name tags');
  await page.clock.runFor(5000);
  const idle = await observe(page);
  assert.deepEqual(idle.state.speech, home.state.speech, 'The home screen cannot advance dialogue');
  assert.equal(idle.labels.filter(label => label.bubbleVisible).length, 0);
  await activate(page, '#start-button', mobile);
  assertReset(await observe(page), 'playing');
}

try {
  for (const [device, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const mobile = device === 'mobile';
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    try {
      page.on('pageerror', error => errors.push(`${device}: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`${device}: ${message.text()}`); });
      await page.clock.install();
      await page.goto(baseURL);
      await page.waitForFunction(() => window.__sealBay?.snapshot().loaded === 8);
      await page.evaluate(() => document.fonts.ready);
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 50);
      const intro = await observe(page);
      assertReset(intro, 'intro');
      assert.ok(intro.labels.some(label => label.nameVisible), 'Intro keeps useful name tags');
      await activate(page, '#start-button', mobile);
      const initial = await observe(page);
      assertReset(initial, 'playing');
      await page.clock.runFor(1000);
      const arrived = await observe(page);
      const namedIds = arrived.labels.filter(label => label.nameVisible).map(label => label.id);
      assert.ok(namedIds.length > 0, 'New arrivals briefly show their names');
      for (const label of arrived.labels.filter(label => label.nameVisible)) {
        assert.equal(label.nameText, arrived.state.seals.find(seal => seal.id === label.id).name);
      }
      await page.clock.runFor(4000);
      const quiet = await observe(page);
      assert.ok(quiet.labels.filter(label => namedIds.includes(label.id)).every(label => !label.nameVisible),
        'Arrival names clear after their brief introduction');
      assert.equal(quiet.state.speech.active, null);
      await page.screenshot({ path: `output/${device}-speech-quiet.png` });

      const observed = { current: null, started: [], seen: new Set(), fullDuration: false, petting: false, roaming: false };
      let paused = false;
      for (let step = 0; step < 260; step += 1) {
        await page.clock.runFor(250);
        const sample = await observe(page);
        audit(sample, observed);
        if (!paused && sample.state.speech.active) {
          await page.screenshot({ path: `output/${device}-speech-active.png` });
          await pauseSpeech(page, mobile);
          paused = true;
        }
        if (observed.started.length >= 2 && observed.fullDuration && observed.petting && observed.roaming) break;
      }
      assert.ok(observed.started.length >= 2, 'Natural visitor activity produces occasional dialogue instead of complete silence');
      assert.ok(observed.fullDuration, 'A real uninterrupted speech was observed through its full duration');
      assert.ok(paused, 'The active-speech pause/resume path ran');
      assert.ok(observed.petting && observed.roaming, 'Both other interactions retain their visible cues');
      checks.push(`${device}: occasional real dialogue, one bubble, matching visitor/text, 2.6-second duration and at least twelve quiet seconds`);
      checks.push(`${device}: temporary arrival names, preserved petting/roaming cues and frozen dialogue during pause`);
      await lifecycleChecks(page, mobile);
      checks.push(`${device}: restart/home clear the old schedule and preserve intro name tags`);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'No page or console errors');
  console.log(JSON.stringify({ result: 'passed', checks, errors }, null, 2));
} finally {
  await browser.close();
}
