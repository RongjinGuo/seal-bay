import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAMING_TIMING, createRoamingSchedule, advanceRoamingSchedule } from '../src/roaming-logic.js';

const candidate = (id, habitat, overrides = {}) => ({ id, habitat, busy: false, visible: true, settledFor: 60, ...overrides });
const water = candidate('water-seal', 'water', { settledFor: 0 });
const beach = candidate('beach-seal', 'beach');
const firstDeparture = () => {
  const state = createRoamingSchedule();
  advanceRoamingSchedule(state, 15, [water, beach], () => 0);
  return state;
};

test('timing is immutable and a fresh schedule is independent and serializable', () => {
  assert.deepEqual(ROAMING_TIMING, { first: 15, intervalMin: 42, intervalMax: 58, minStay: 30, travel: 12 });
  assert.ok(Object.isFrozen(ROAMING_TIMING));
  const first = createRoamingSchedule();
  assert.deepEqual(first, {
    elapsed: 0, nextAt: 15, nextDirection: 'to-beach', started: 0,
    lastResidentId: null, lastDepartureAt: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  const second = createRoamingSchedule();
  advanceRoamingSchedule(first, 5, [water]);
  assert.equal(second.elapsed, 0);
});

test('the first water resident departs at fifteen active seconds and may bypass its initial dwell', () => {
  const state = createRoamingSchedule();
  assert.deepEqual(advanceRoamingSchedule(state, 14.9, [beach, water], () => 0), []);
  assert.equal(state.started, 0);
  assert.deepEqual(advanceRoamingSchedule(state, 0.1, [beach, water], () => 0), [
    { type: 'depart', id: 'water-seal', direction: 'to-beach', at: 15 },
  ]);
  assert.equal(state.started, 1);
  assert.equal(state.nextAt, 57);
  assert.equal(state.nextDirection, 'to-water');
  assert.equal(state.lastResidentId, 'water-seal');
  assert.equal(state.lastDepartureAt, 15);
});

test('the next departure waits for its interval and alternates to the correct habitat', () => {
  const state = firstDeparture();
  assert.deepEqual(advanceRoamingSchedule(state, 41, [water, beach], () => 0), []);
  assert.deepEqual(advanceRoamingSchedule(state, 1, [water, beach], () => 0), [
    { type: 'depart', id: 'beach-seal', direction: 'to-water', at: 57 },
  ]);
  assert.equal(state.started, 2);
  assert.equal(state.nextDirection, 'to-beach');
  assert.deepEqual(advanceRoamingSchedule(state, 42, [candidate('another', 'water'), beach], () => 0), [
    { type: 'depart', id: 'another', direction: 'to-beach', at: 99 },
  ]);
});

test('long gaps produce one departure and schedule from the actual departure time without catch-up', () => {
  const state = createRoamingSchedule();
  assert.deepEqual(advanceRoamingSchedule(state, 1000, [water, beach], () => 0), [
    { type: 'depart', id: 'water-seal', direction: 'to-beach', at: 1000 },
  ]);
  assert.equal(state.nextAt, 1042);
  assert.equal(state.started, 1);
  assert.deepEqual(advanceRoamingSchedule(state, 0.1, [water, beach], () => 0), []);
  assert.equal(state.started, 1);
});

test('a busy first resident keeps its pending incoming trip until it becomes free', () => {
  const state = createRoamingSchedule();
  assert.deepEqual(advanceRoamingSchedule(state, 80, [{ ...water, busy: true }, beach], () => 0), []);
  assert.equal(state.nextAt, 15);
  assert.equal(state.nextDirection, 'to-beach');
  assert.equal(state.started, 0);
  assert.equal(state.lastDepartureAt, null);
  assert.deepEqual(advanceRoamingSchedule(state, 1, [water, beach], () => 0), [
    { type: 'depart', id: 'water-seal', direction: 'to-beach', at: 81 },
  ]);
  assert.equal(state.nextAt, 123);
});

test('empty, hidden, or wrong-habitat candidates keep the first request due', () => {
  for (const candidates of [[], [{ ...water, visible: false }], [beach]]) {
    const state = createRoamingSchedule();
    assert.deepEqual(advanceRoamingSchedule(state, 20, candidates, () => 0), []);
    assert.equal(state.nextAt, 15);
    assert.equal(state.started, 0);
    assert.equal(state.nextDirection, 'to-beach');
    assert.deepEqual(advanceRoamingSchedule(state, 1, [water], () => 0), [
      { type: 'depart', id: 'water-seal', direction: 'to-beach', at: 21 },
    ]);
  }
});

test('an existing traveler blocks departure even when it is hidden or busy', () => {
  const state = createRoamingSchedule();
  const traveler = candidate('traveler', 'travel', { visible: false, busy: true });
  assert.deepEqual(advanceRoamingSchedule(state, 100, [water, beach, traveler], () => 0), []);
  assert.equal(state.started, 0);
  assert.equal(state.nextAt, 15);
  assert.deepEqual(advanceRoamingSchedule(state, 1, [water, beach], () => 0), [
    { type: 'depart', id: 'water-seal', direction: 'to-beach', at: 101 },
  ]);
});

test('later beach and water departures require thirty settled seconds', () => {
  const state = firstDeparture();
  assert.deepEqual(advanceRoamingSchedule(state, 42, [candidate('young-beach', 'beach', { settledFor: 29.9 })], () => 0), []);
  assert.equal(state.nextAt, 57);
  assert.deepEqual(advanceRoamingSchedule(state, 0.1, [candidate('young-beach', 'beach', { settledFor: 30 })], () => 0), [
    { type: 'depart', id: 'young-beach', direction: 'to-water', at: 57.1 },
  ]);
  assert.deepEqual(advanceRoamingSchedule(state, 42, [water], () => 0), []);
  assert.equal(state.nextDirection, 'to-beach');
  assert.equal(state.started, 2);
  const events = advanceRoamingSchedule(state, 0.1, [{ ...water, settledFor: 30 }], () => 0);
  assert.equal(events[0].id, 'water-seal');
  assert.equal(events[0].direction, 'to-beach');
  assert.equal(state.started, 3);
});

test('busy and hidden residents are excluded from later departures', () => {
  const state = firstDeparture();
  const candidates = [
    candidate('busy', 'beach', { busy: true }),
    candidate('hidden', 'beach', { visible: false }),
    candidate('newcomer', 'beach', { settledFor: 10 }),
    beach,
  ];
  assert.deepEqual(advanceRoamingSchedule(state, 42, candidates, () => 0), [
    { type: 'depart', id: 'beach-seal', direction: 'to-water', at: 57 },
  ]);
});

test('later trips prefer another resident but can reuse the last when it is the only eligible seal', () => {
  const state = firstDeparture();
  const previous = candidate('water-seal', 'beach');
  assert.deepEqual(advanceRoamingSchedule(state, 42, [previous, beach], () => 0), [
    { type: 'depart', id: 'beach-seal', direction: 'to-water', at: 57 },
  ]);
  assert.deepEqual(advanceRoamingSchedule(state, 42, [candidate('beach-seal', 'water')], () => 0), [
    { type: 'depart', id: 'beach-seal', direction: 'to-beach', at: 99 },
  ]);
});

test('random selection includes both ends and intervals stay between forty-two and fifty-eight seconds', () => {
  for (const [randomValue, expectedId, interval] of [[-1, 'first', 42], [0, 'first', 42], [1, 'last', 58], [2, 'last', 58], [NaN, 'middle', 50], [Infinity, 'middle', 50]]) {
    const state = createRoamingSchedule();
    const candidates = ['first', 'middle', 'last'].map(id => candidate(id, 'water'));
    const events = advanceRoamingSchedule(state, 15, candidates, () => randomValue);
    assert.equal(events[0].id, expectedId);
    assert.equal(state.nextAt, 15 + interval);
  }
});

test('zero, negative, and nonfinite timesteps preserve the schedule even when a departure is due', () => {
  for (const due of [false, true]) {
    const state = createRoamingSchedule();
    if (due) advanceRoamingSchedule(state, 20, []);
    const frozen = structuredClone(state);
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(advanceRoamingSchedule(state, dt, [water, beach], () => 0), []);
      assert.deepEqual(state, frozen);
    }
  }
});

test('scheduling never mutates candidate habitat, busy state, or dwell time', () => {
  const candidates = [water, beach].map(item => Object.freeze({ ...item }));
  const before = structuredClone(candidates);
  advanceRoamingSchedule(createRoamingSchedule(), 15, candidates, () => 0);
  assert.deepEqual(candidates, before);
});
