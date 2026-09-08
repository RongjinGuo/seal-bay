export const STATE_DURATIONS = Object.freeze({
  emerging: 0.9,
  catchableEmergence: 0.35,
  waiting: 10,
  calling: 4,
  angry: 1.2,
  eating: 2,
  happy: 1.3,
  diving: 1.5,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const canceled = (value) => value?.canceled || value?.cancelled;

/** Screen samples use milliseconds. Returned duration is flight time in seconds. */
export function computeThrow(samples, viewport) {
  if (!Array.isArray(samples) || samples.length < 2 || !viewport || canceled(viewport)) return null;
  const { width, height } = viewport;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (samples.some((sample, i) => !sample || canceled(sample)
    || ![sample.x, sample.y, sample.t].every(Number.isFinite)
    || (i > 0 && sample.t < samples[i - 1].t))) return null;

  const first = samples[0];
  const last = samples.at(-1);
  const elapsed = last.t - first.t;
  const upward = (first.y - last.y) / height;
  if (elapsed <= 0 || first.y < height * 0.4 || first.y > height
    || first.x < 0 || first.x > width || upward < 0.045) return null;

  // Interpolate at the velocity window boundary so a held start does not weaken a flick,
  // while holding still before release correctly removes its launch velocity.
  const cutoff = Math.max(first.t, last.t - 140);
  let recentY = first.y;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (current.t >= cutoff && current.t > previous.t) {
      const fraction = clamp((cutoff - previous.t) / (current.t - previous.t), 0, 1);
      recentY = previous.y + (current.y - previous.y) * fraction;
      break;
    }
  }
  const velocity = (recentY - last.y) / height / ((last.t - cutoff) / 1000);
  if (!Number.isFinite(velocity) || velocity <= 0.08) return null;

  const power = clamp((velocity - 0.08) / 2.3, 0, 1);
  const distance = 4 + power * 12;
  const direction = clamp(((last.x - first.x) / width) / (upward * 0.9), -1, 1);
  return {
    power,
    direction,
    distance,
    duration: 0.8 + power * 0.7,
    gestureDurationMs: elapsed,
    // The fish starts at z=8. Range 4..16 lands at z=4..-8 in the bay.
    end: { x: clamp(direction * distance * 0.65, -7, 7), z: 8 - distance },
  };
}

export function trajectoryPoint(origin, target, progress, height = 4) {
  const t = clamp(finite(progress, 0), 0, 1);
  const arc = Math.max(0, finite(height, 4));
  const start = { x: finite(origin?.x, 0), y: finite(origin?.y, 0), z: finite(origin?.z, 0) };
  const end = { x: finite(target?.x, 0), y: finite(target?.y, 0), z: finite(target?.z, 0) };
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t + 4 * arc * t * (1 - t),
    z: start.z + (end.z - start.z) * t,
  };
}

function isCatchable(visitor) {
  if (!visitor || visitor.fed) return false;
  return ['waiting', 'calling', 'angry'].includes(visitor.state)
    || (visitor.state === 'emerging' && visitor.stateTime >= STATE_DURATIONS.catchableEmergence);
}

export function findCatch(target, seals) {
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z) || !Array.isArray(seals)) return null;
  let closest = null;
  let closestDistance = Infinity;
  for (const seal of seals) {
    if (!isCatchable(seal) || !Number.isFinite(seal.x) || !Number.isFinite(seal.z)) continue;
    const radius = 1.25 * clamp(finite(seal.size, 1), 0.65, 1.65);
    const distance = Math.hypot(target.x - seal.x, target.z - seal.z);
    if (distance <= radius && distance < closestDistance) {
      closest = seal;
      closestDistance = distance;
    }
  }
  return closest;
}

export function createVisitor({ id, x, z, variant = 'harbor', patience = STATE_DURATIONS.waiting, size = 1 } = {}) {
  return {
    id,
    x: finite(x, 0),
    z: finite(z, 0),
    variant,
    size: clamp(finite(size, 1), 0.65, 1.65),
    patience: Math.max(0, finite(patience, STATE_DURATIONS.waiting)),
    state: 'emerging',
    stateTime: 0,
    age: 0,
    fed: false,
    canCatch: false,
  };
}

const NEXT_STATE = Object.freeze({
  emerging: ['waiting', 'surface'],
  waiting: ['calling', 'call'],
  calling: ['angry', 'angry'],
  angry: ['diving', 'dive'],
  eating: ['happy', null],
  happy: ['diving', 'dive'],
  diving: ['gone', 'depart'],
});

/** Mutates a visitor. Do not call while paused. Each event is emitted once per transition. */
export function advanceVisitor(visitor, dt) {
  if (!visitor || !Number.isFinite(dt) || dt <= 0 || !NEXT_STATE[visitor.state]) return [];
  const events = [];
  let remaining = dt;
  for (let transitions = 0; transitions < 8; transitions++) {
    const transition = NEXT_STATE[visitor.state];
    if (!transition) break;
    const duration = visitor.state === 'waiting' ? visitor.patience : STATE_DURATIONS[visitor.state];
    const timeToNext = Math.max(0, duration - visitor.stateTime);
    if (remaining + 1e-10 < timeToNext) {
      visitor.stateTime += remaining;
      visitor.age += remaining;
      break;
    }
    visitor.age += timeToNext;
    remaining = Math.max(0, remaining - timeToNext);
    visitor.state = transition[0];
    visitor.stateTime = 0;
    if (transition[1]) events.push(transition[1]);
    if (remaining <= 0 && !(visitor.state === 'waiting' && visitor.patience === 0)) break;
  }
  visitor.canCatch = isCatchable(visitor);
  return events;
}

export function feedVisitor(visitor) {
  if (!isCatchable(visitor)) return false;
  visitor.fed = true;
  visitor.canCatch = false;
  visitor.state = 'eating';
  visitor.stateTime = 0;
  return true;
}

/** Optional partial bounds narrow the bay. Returns null when no clear reachable spot exists. */
export function pickSpawn(existing = [], rng = Math.random, bounds = {}) {
  const minX = clamp(finite(bounds.minX, -6), -6, 6);
  const maxX = clamp(finite(bounds.maxX, 6), -6, 6);
  const minZ = clamp(finite(bounds.minZ, -8), -8, 3);
  const maxZ = clamp(finite(bounds.maxZ, 3), -8, 3);
  if (minX > maxX || minZ > maxZ) return null;
  const occupied = existing.filter((visitor) => visitor && visitor.state !== 'gone'
    && Number.isFinite(visitor.x) && Number.isFinite(visitor.z));
  // Lateral throw range narrows near the pier; keep every visitor's center reachable.
  const clear = (point) => Math.abs(point.x) <= 0.65 * (8 - point.z) - 0.15
    && occupied.every((visitor) => Math.hypot(point.x - visitor.x, point.z - visitor.z) >= 2.6 - 1e-9);
  const sample = () => clamp(finite(rng(), 0.5), 0, 1);
  for (let attempt = 0; attempt < 48; attempt++) {
    const point = { x: minX + sample() * (maxX - minX), z: minZ + sample() * (maxZ - minZ) };
    if (clear(point)) return point;
  }
  // A deterministic fallback prevents a repetitive RNG from hiding available spaces.
  const columns = Math.max(1, Math.ceil((maxX - minX) / 1.3));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / 1.3));
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const point = { x: minX + column / columns * (maxX - minX), z: minZ + row / rows * (maxZ - minZ) };
      if (clear(point)) return point;
    }
  }
  return null;
}
