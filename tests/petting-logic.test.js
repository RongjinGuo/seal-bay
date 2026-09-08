import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PETTING_DURATIONS,
  PETTING_TOOLS,
  advancePetting,
  createPettingState,
  offerPettingTool,
} from '../src/petting-logic.js';

const residents = ['pebble', 'mango', 'cloud'];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const request = () => {
  const state = createPettingState();
  advancePetting(state, PETTING_DURATIONS.firstRequest, residents, () => 0);
  return state;
};

test('the two petting tools and durations are immutable shared configuration', () => {
  assert.deepEqual(PETTING_TOOLS, [
    { id: 'brush', name: '软毛刷' },
    { id: 'mitten', name: '摸摸手套' },
  ]);
  assert.ok(Object.isFrozen(PETTING_TOOLS));
  assert.ok(PETTING_TOOLS.every(Object.isFrozen));
  assert.ok(Object.isFrozen(PETTING_DURATIONS));
});

test('a fresh state waits exactly six seconds before the first visible resident asks for a brush', () => {
  const state = createPettingState();
  assert.equal(state.phase, 'idle');
  assert.equal(state.request, null);
  assert.equal(state.completed, 0);
  assert.equal(state.requestsMade, 0);
  assert.deepEqual(advancePetting(state, 5.9, residents, () => 1), []);
  assert.equal(state.phase, 'idle');
  assert.deepEqual(advancePetting(state, 0.1, residents, () => 1), [
    { type: 'request', residentId: 'pebble', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'requesting');
  assert.equal(state.time, 0);
  assert.deepEqual(state.request, { residentId: 'pebble', toolId: 'brush' });
  assert.equal(state.requestsMade, 1);
});

test('wrong tools and other residents cannot replace or fulfill the active request', () => {
  const state = request();
  const snapshot = structuredClone(state);
  assert.deepEqual(offerPettingTool(state, 'pebble', 'mitten'), { accepted: false, reason: 'wrong-tool' });
  assert.deepEqual(offerPettingTool(state, 'pebble', 'fish'), { accepted: false, reason: 'wrong-tool' });
  assert.deepEqual(offerPettingTool(state, 'mango', 'brush'), { accepted: false, reason: 'wrong-resident' });
  assert.deepEqual(state, snapshot);
});

test('only a matching drop starts petting and repeated drops cannot restart its progress', () => {
  const state = request();
  advancePetting(state, 4, residents);
  assert.deepEqual(offerPettingTool(state, 'pebble', 'brush'), { accepted: true });
  assert.equal(state.phase, 'petting');
  assert.equal(state.time, 0);
  assert.equal(state.completed, 0);
  advancePetting(state, 0.4, residents);
  const snapshot = structuredClone(state);
  assert.deepEqual(offerPettingTool(state, 'pebble', 'brush'), { accepted: false, reason: 'unavailable' });
  assert.deepEqual(state, snapshot);
});

test('the heart reward occurs once at the petting threshold and happiness lasts three seconds', () => {
  const state = request();
  offerPettingTool(state, 'pebble', 'brush');
  assert.deepEqual(advancePetting(state, 1.1, residents), []);
  assert.equal(state.completed, 0);
  assert.deepEqual(advancePetting(state, 0.1, residents), [
    { type: 'petting-complete', residentId: 'pebble', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'happy');
  assert.equal(state.time, 0);
  assert.equal(state.completed, 1);
  assert.deepEqual(advancePetting(state, 2.9, residents), []);
  assert.deepEqual(advancePetting(state, 0.1, residents, () => 0), [
    { type: 'happiness-ended', residentId: 'pebble', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.request, null);
  assert.equal(state.completed, 1);
  assert.equal(state.cooldown, 8);
});

test('a neglected request expires after 24 seconds without awarding or losing anything', () => {
  const state = request();
  assert.deepEqual(advancePetting(state, 23.9, residents), []);
  assert.deepEqual(advancePetting(state, 0.1, residents, () => 1), [
    { type: 'request-expired', residentId: 'pebble', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'idle');
  assert.equal(state.request, null);
  assert.equal(state.completed, 0);
  assert.equal(state.cooldown, 14);
  assert.deepEqual(offerPettingTool(state, 'pebble', 'brush'), { accepted: false, reason: 'unavailable' });
});

test('later requests alternate tools and choose another resident when one is available', () => {
  const state = request();
  const pairs = [state.request];
  for (let cycle = 0; cycle < 3; cycle++) {
    const { residentId, toolId } = state.request;
    assert.equal(offerPettingTool(state, residentId, toolId).accepted, true);
    advancePetting(state, PETTING_DURATIONS.petting + PETTING_DURATIONS.happy, residents, () => 0);
    advancePetting(state, state.cooldown, residents, () => 0);
    pairs.push(state.request);
  }
  assert.deepEqual(pairs, [
    { residentId: 'pebble', toolId: 'brush' },
    { residentId: 'mango', toolId: 'mitten' },
    { residentId: 'pebble', toolId: 'brush' },
    { residentId: 'mango', toolId: 'mitten' },
  ]);
  assert.equal(state.completed, 3);
  assert.equal(state.requestsMade, 4);
});

test('a single visible resident can keep requesting both tools', () => {
  const state = createPettingState();
  advancePetting(state, 6, ['pebble']);
  advancePetting(state, 24, ['pebble'], () => 0);
  advancePetting(state, 8, ['pebble'], () => 1);
  assert.deepEqual(state.request, { residentId: 'pebble', toolId: 'mitten' });
});

test('later random selection uses all eligible alternatives and keeps cooldown bounded', () => {
  const state = request();
  advancePetting(state, 24, residents, () => 0.5);
  assert.equal(state.cooldown, 11);
  advancePetting(state, 11, residents, () => 1);
  assert.deepEqual(state.request, { residentId: 'cloud', toolId: 'mitten' });
});

test('large timesteps carry overflow through completion and happiness without double counting', () => {
  const state = request();
  offerPettingTool(state, 'pebble', 'brush');
  assert.deepEqual(advancePetting(state, 5.2, residents, () => 0), [
    { type: 'petting-complete', residentId: 'pebble', toolId: 'brush' },
    { type: 'happiness-ended', residentId: 'pebble', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'idle');
  near(state.time, 1);
  assert.equal(state.completed, 1);
  const later = advancePetting(state, 1000, residents, () => 0);
  assert.ok(later.some((event) => event.type === 'request'));
  assert.equal(later.filter((event) => event.type === 'petting-complete').length, 0);
  assert.equal(state.completed, 1);
});

test('one long update and partitioned updates have the same lifecycle and event counts', () => {
  const whole = request();
  const steps = structuredClone(whole);
  offerPettingTool(whole, 'pebble', 'brush');
  offerPettingTool(steps, 'pebble', 'brush');
  const wholeEvents = advancePetting(whole, 100, residents, () => 0.5);
  const stepEvents = Array.from({ length: 1000 }, () => advancePetting(steps, 0.1, residents, () => 0.5)).flat();
  assert.deepEqual(stepEvents, wholeEvents);
  near(steps.time, whole.time);
  assert.deepEqual({ ...steps, time: 0 }, { ...whole, time: 0 });
});

test('paused and invalid timesteps preserve every phase including its active target', () => {
  for (const phase of ['idle', 'requesting', 'petting', 'happy']) {
    const state = phase === 'idle' ? createPettingState() : request();
    if (phase === 'petting' || phase === 'happy') offerPettingTool(state, 'pebble', 'brush');
    if (phase === 'happy') advancePetting(state, 1.2, residents);
    const snapshot = structuredClone(state);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(advancePetting(state, dt, []), []);
      assert.deepEqual(state, snapshot);
    }
  }
});

test('an empty beach waits without building a backlog or creating an invisible request', () => {
  const state = createPettingState();
  assert.deepEqual(advancePetting(state, 1000, []), []);
  assert.equal(state.phase, 'idle');
  assert.equal(state.request, null);
  assert.equal(state.requestsMade, 0);
  assert.deepEqual(advancePetting(state, 0.1, ['cloud']), [
    { type: 'request', residentId: 'cloud', toolId: 'brush' },
  ]);
  assert.equal(state.phase, 'requesting');
  near(state.time, 0.1);
});

test('losing a requesting or petting target cancels safely with no false completion', () => {
  for (const phase of ['requesting', 'petting']) {
    const state = request();
    if (phase === 'petting') offerPettingTool(state, 'pebble', 'brush');
    assert.deepEqual(advancePetting(state, 100, ['mango'], () => 0), [
      { type: 'request-cancelled', residentId: 'pebble', toolId: 'brush', reason: 'unavailable' },
    ]);
    assert.equal(state.phase, 'idle');
    assert.equal(state.time, 0);
    assert.equal(state.request, null);
    assert.equal(state.completed, 0);
    assert.deepEqual(offerPettingTool(state, 'pebble', 'brush'), { accepted: false, reason: 'unavailable' });
  }
});

test('a completed reward survives a happy target leaving the visible beach', () => {
  const state = request();
  offerPettingTool(state, 'pebble', 'brush');
  advancePetting(state, 1.2, residents);
  const events = advancePetting(state, 0.1, [], () => 0);
  assert.equal(events[0].type, 'request-cancelled');
  assert.equal(state.phase, 'idle');
  assert.equal(state.completed, 1);
});

test('resetting creates an independent serializable state with a fresh first request', () => {
  const previous = request();
  offerPettingTool(previous, 'pebble', 'brush');
  advancePetting(previous, 1.2, residents);
  const state = createPettingState();
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.completed, 0);
  assert.equal(state.requestsMade, 0);
  assert.equal(state.cooldown, 6);
  assert.equal(previous.completed, 1);
  assert.deepEqual(offerPettingTool(state, 'pebble', 'brush'), { accepted: false, reason: 'unavailable' });
});
