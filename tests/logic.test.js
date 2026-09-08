import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_DURATIONS,
  advanceVisitor,
  computeThrow,
  createVisitor,
  feedVisitor,
  findCatch,
  pickSpawn,
  trajectoryPoint,
} from '../src/logic.js';

const viewport = { width: 1000, height: 1000 };
const swipe = (duration, dx = 0) => [
  { x: 500, y: 850, t: 0 },
  { x: 500 + dx, y: 550, t: duration },
];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('faster upward swipes travel farther with bounded power and range', () => {
  const slow = computeThrow(swipe(1200), viewport);
  const fast = computeThrow(swipe(160), viewport);
  assert.ok(fast.power > slow.power);
  assert.ok(fast.distance > slow.distance);
  assert.ok(slow.distance >= 4 && fast.distance <= 16);
  near(fast.end.z, 8 - fast.distance);
  assert.ok(fast.duration > 0 && fast.duration < 2);
});

test('gesture speed is normalized to the viewport height', () => {
  const first = computeThrow(swipe(250, 100), viewport);
  const half = computeThrow(swipe(250, 100).map((s) => ({ x: s.x / 2, y: s.y / 2, t: s.t })), { width: 500, height: 500 });
  near(first.power, half.power);
  near(first.distance, half.distance);
  near(first.direction, half.direction);
});

test('horizontal screen ratio controls left and right aim across aspect ratios', () => {
  const right = computeThrow(swipe(250, 150), viewport);
  const left = computeThrow(swipe(250, -150), viewport);
  const narrow = computeThrow(swipe(250, 150).map((s) => ({ ...s, x: s.x / 2 })), { width: 500, height: 1000 });
  near(right.direction, -left.direction);
  near(right.direction, narrow.direction);
  assert.ok(right.end.x > 0 && left.end.x < 0);
  assert.ok(Math.abs(right.end.x) <= 7);
});

test('holding before a fast flick does not reduce the throw strength', () => {
  const immediate = computeThrow([
    { x: 500, y: 850, t: 0 },
    { x: 500, y: 850, t: 40 },
    { x: 500, y: 550, t: 140 },
  ], viewport);
  const held = computeThrow([
    { x: 500, y: 850, t: 0 },
    { x: 500, y: 850, t: 1040 },
    { x: 500, y: 550, t: 1140 },
  ], viewport);
  near(immediate.power, held.power);
});

test('holding still at release cancels a flick instead of retaining stale velocity', () => {
  assert.equal(computeThrow([
    ...swipe(100),
    { x: 500, y: 550, t: 400 },
  ], viewport), null);
});

test('downward endings cannot throw even after an upward drag', () => {
  assert.equal(computeThrow([
    { x: 500, y: 850, t: 0 },
    { x: 500, y: 400, t: 200 },
    { x: 500, y: 520, t: 400 },
  ], viewport), null);
});

test('taps, short gestures, downward swipes and upper-area starts are rejected', () => {
  const gestures = [
    [{ x: 500, y: 800, t: 0 }],
    [{ x: 500, y: 800, t: 0 }, { x: 500, y: 790, t: 80 }],
    [{ x: 500, y: 500, t: 0 }, { x: 500, y: 800, t: 100 }],
    [{ x: 500, y: 200, t: 0 }, { x: 500, y: 0, t: 100 }],
  ];
  for (const samples of gestures) assert.equal(computeThrow(samples, viewport), null);
});

test('invalid and canceled gesture data cannot enter the simulation', () => {
  assert.equal(computeThrow(swipe(0), viewport), null);
  assert.equal(computeThrow(swipe(-100), viewport), null);
  assert.equal(computeThrow(swipe(100), { width: 0, height: 1000 }), null);
  assert.equal(computeThrow(swipe(100), { width: 1000, height: Infinity }), null);
  assert.equal(computeThrow(swipe(100), { ...viewport, cancelled: true }), null);
  assert.equal(computeThrow(swipe(100).map((s) => ({ ...s, canceled: true })), viewport), null);
  assert.equal(computeThrow([{ x: NaN, y: 850, t: 0 }, swipe(100)[1]], viewport), null);
});

test('parabolic flights reach their endpoints and arc above linear interpolation', () => {
  const origin = { x: 0, y: 1.4, z: 8 };
  const target = { x: 3, y: 0, z: -5 };
  assert.deepEqual(trajectoryPoint(origin, target, 0, 4), origin);
  assert.deepEqual(trajectoryPoint(origin, target, 1, 4), target);
  const midpoint = trajectoryPoint(origin, target, 0.5, 4);
  near(midpoint.y, 4.7);
  near(midpoint.x, 1.5);
  assert.deepEqual(trajectoryPoint(origin, target, 2, 4), target);
});

test('visitor transitions occur once at exact thresholds', () => {
  const visitor = createVisitor({ id: 'one', x: 2, z: -4, variant: 'harbor', patience: 3 });
  assert.equal(visitor.state, 'emerging');
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.emerging), ['surface']);
  assert.equal(visitor.state, 'waiting');
  assert.deepEqual(advanceVisitor(visitor, 3), ['call']);
  assert.equal(visitor.state, 'calling');
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.calling), ['angry']);
  assert.equal(visitor.state, 'angry');
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.angry), ['dive']);
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.diving), ['depart']);
  assert.equal(visitor.state, 'gone');
  assert.deepEqual(advanceVisitor(visitor, 1000), []);
});

test('large timesteps carry overflow through all lifecycle stages', () => {
  const visitor = createVisitor({ id: 'one', x: 0, z: 0, patience: 2 });
  assert.deepEqual(advanceVisitor(visitor, 50), ['surface', 'call', 'angry', 'dive', 'depart']);
  assert.equal(visitor.state, 'gone');
});

test('visitors remain unchanged while the simulation is paused', () => {
  const visitor = createVisitor({ id: 'one', x: 0, z: 0 });
  const frozen = structuredClone(visitor);
  for (const elapsed of [0, -1, NaN, Infinity]) assert.deepEqual(advanceVisitor(visitor, elapsed), []);
  assert.deepEqual(visitor, frozen);
});

test('partly emerged visitors become catchable only at the surface threshold', () => {
  const visitor = createVisitor({ id: 'one', x: 0, z: 0 });
  assert.equal(feedVisitor(visitor), false);
  assert.equal(findCatch({ x: 0, z: 0 }, [visitor]), null);
  advanceVisitor(visitor, STATE_DURATIONS.catchableEmergence);
  assert.equal(findCatch({ x: 0, z: 0 }, [visitor]), visitor);
  assert.equal(feedVisitor(visitor), true);
});

test('feeding replaces the timeout path and cannot happen twice', () => {
  const visitor = createVisitor({ id: 'one', x: 0, z: 0, patience: 1 });
  advanceVisitor(visitor, 1);
  assert.equal(feedVisitor(visitor), true);
  assert.equal(visitor.state, 'eating');
  assert.equal(feedVisitor(visitor), false);
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.eating), []);
  assert.equal(visitor.state, 'happy');
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.happy), ['dive']);
  assert.deepEqual(advanceVisitor(visitor, STATE_DURATIONS.diving), ['depart']);
  assert.equal(visitor.fed, true);
});

test('waiting, calling and angry visitors can eat, but departing visitors cannot', () => {
  for (const state of ['waiting', 'calling', 'angry', 'diving', 'gone']) {
    const visitor = { ...createVisitor({ id: state, x: 0, z: 0 }), state };
    assert.equal(feedVisitor(visitor), ['waiting', 'calling', 'angry'].includes(state));
  }
});

test('catches pick the closest eligible visitor and account for body size', () => {
  const make = (id, x, size = 1, state = 'waiting') => ({ ...createVisitor({ id, x, z: 0, size }), state });
  const diving = make('diving', 0, 1, 'diving');
  const close = make('close', 0.4);
  const farther = make('farther', 0.9);
  assert.equal(findCatch({ x: 0, z: 0 }, [diving, farther, close]), close);
  assert.equal(findCatch({ x: 1.7, z: 0 }, [make('small', 0, 0.7)]), null);
  const large = make('large', 0, 1.5);
  assert.equal(findCatch({ x: 1.7, z: 0 }, [large]), large);
  assert.equal(findCatch({ x: Infinity, z: 0 }, [large]), null);
  feedVisitor(close);
  assert.equal(findCatch({ x: 0, z: 0 }, [close]), null);
});

test('spawn positions stay in the bay and separated even with a repetitive RNG', () => {
  const visitors = [];
  for (let i = 0; i < 10; i++) {
    const point = pickSpawn(visitors, () => 0.5);
    assert.ok(point);
    assert.ok(point.x >= -6 && point.x <= 6 && point.z >= -8 && point.z <= 3);
    for (const existing of visitors) assert.ok(Math.hypot(point.x - existing.x, point.z - existing.z) >= 2.6 - 1e-9);
    visitors.push(point);
  }
});

test('a saturated bay does not produce an overlapping spawn', () => {
  const occupied = [];
  for (let x = -6; x <= 6; x += 1) {
    for (let z = -8; z <= 3; z += 1) occupied.push({ x, z });
  }
  assert.equal(pickSpawn(occupied, () => 0.5), null);
});

test('near-side spawns remain inside the reachable throw range', () => {
  let calls = 0;
  const point = pickSpawn([], () => calls++ % 2 === 0 ? 0.983333333333 : 0.963636363636);
  assert.ok(point);
  assert.ok(Math.abs(point.x) <= 0.65 * (8 - point.z) - 0.15);
});

test('portrait spawn bounds retain the full near-to-far range', () => {
  const bounds = { minX: -3.6, maxX: 3.6 };
  const farLeft = pickSpawn([], () => 0, bounds);
  assert.deepEqual(farLeft, { x: -3.6, z: -8 });
  let calls = 0;
  const nearCenter = pickSpawn([], () => calls++ % 2 === 0 ? 0.5 : 1, bounds);
  assert.deepEqual(nearCenter, { x: 0, z: 3 });
});

test('fallback spawns respect custom bounds and minimum separation', () => {
  const occupied = [{ x: 0, z: -2.5 }];
  const bounds = { minX: -2, maxX: 2, minZ: -8, maxZ: 3 };
  const point = pickSpawn(occupied, () => 0.5, bounds);
  assert.ok(point);
  assert.ok(point.x >= -2 && point.x <= 2);
  assert.ok(point.z >= -8 && point.z <= 3);
  assert.ok(Math.hypot(point.x, point.z + 2.5) >= 2.6 - 1e-9);
  assert.equal(pickSpawn([{ x: 0, z: 0 }], () => 0.5, { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 }), null);
});
