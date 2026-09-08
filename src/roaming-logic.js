export const ROAMING_TIMING = Object.freeze({
  first: 15,
  intervalMin: 42,
  intervalMax: 58,
  minStay: 30,
  travel: 12,
});

export function createRoamingSchedule() {
  return {
    elapsed: 0,
    nextAt: ROAMING_TIMING.first,
    nextDirection: 'to-beach',
    started: 0,
    lastResidentId: null,
    lastDepartureAt: null,
  };
}

function sample(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/** A due trip waits until it is possible; each call can start at most one traveler. */
export function advanceRoamingSchedule(state, dt, candidates = [], random = Math.random) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return [];
  state.elapsed += dt;
  if (state.elapsed + 1e-10 < state.nextAt || candidates.some(candidate => candidate.habitat === 'travel')) return [];

  const direction = state.nextDirection;
  const habitat = direction === 'to-beach' ? 'water' : 'beach';
  const firstIncoming = state.started === 0 && direction === 'to-beach';
  const eligible = candidates.filter(candidate => candidate.habitat === habitat && candidate.visible && !candidate.busy
    && (firstIncoming || candidate.settledFor >= ROAMING_TIMING.minStay));
  if (eligible.length === 0) return [];

  const alternatives = eligible.filter(candidate => candidate.id !== state.lastResidentId);
  const pool = alternatives.length ? alternatives : eligible;
  const selected = pool[Math.min(pool.length - 1, Math.floor(sample(random) * pool.length))];
  const at = state.elapsed;
  state.started += 1;
  state.lastResidentId = selected.id;
  state.lastDepartureAt = at;
  state.nextDirection = direction === 'to-beach' ? 'to-water' : 'to-beach';
  state.nextAt = at + ROAMING_TIMING.intervalMin
    + sample(random) * (ROAMING_TIMING.intervalMax - ROAMING_TIMING.intervalMin);
  return [{ type: 'depart', id: selected.id, direction, at }];
}
