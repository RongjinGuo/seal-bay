export const PETTING_TOOLS = Object.freeze([
  Object.freeze({ id: 'brush', name: '软毛刷' }),
  Object.freeze({ id: 'mitten', name: '摸摸手套' }),
]);

export const PETTING_DURATIONS = Object.freeze({
  firstRequest: 6,
  cooldownMin: 8,
  cooldownMax: 14,
  requesting: 24,
  petting: 1.2,
  happy: 3,
});

export function createPettingState() {
  return {
    phase: 'idle',
    time: 0,
    request: null,
    completed: 0,
    requestsMade: 0,
    cooldown: PETTING_DURATIONS.firstRequest,
    lastResidentId: null,
  };
}

function sample(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function returnToIdle(state, random) {
  state.phase = 'idle';
  state.time = 0;
  state.request = null;
  state.cooldown = PETTING_DURATIONS.cooldownMin
    + sample(random) * (PETTING_DURATIONS.cooldownMax - PETTING_DURATIONS.cooldownMin);
}

function startRequest(state, eligibleIds, random) {
  const alternatives = eligibleIds.filter((id) => id !== state.lastResidentId);
  const candidates = alternatives.length ? alternatives : eligibleIds;
  const index = state.requestsMade === 0 ? 0 : Math.min(candidates.length - 1, Math.floor(sample(random) * candidates.length));
  state.request = {
    residentId: candidates[index],
    toolId: PETTING_TOOLS[state.requestsMade % PETTING_TOOLS.length].id,
  };
  state.phase = 'requesting';
  state.time = 0;
  state.lastResidentId = state.request.residentId;
  state.requestsMade += 1;
}

/** Mutates only simulation state; each transition returns a separate event snapshot. */
export function advancePetting(state, dt, eligibleIds, random = Math.random) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return [];
  const eligible = Array.isArray(eligibleIds) ? [...new Set(eligibleIds)] : [];
  const events = [];

  if (state.request && !eligible.includes(state.request.residentId)) {
    events.push({ type: 'request-cancelled', ...state.request, reason: 'unavailable' });
    returnToIdle(state, random);
    return events;
  }

  let remaining = dt;
  while (remaining > 0) {
    // A hidden beach may become ready, but cannot accumulate skipped requests.
    if (state.phase === 'idle' && eligible.length === 0) {
      state.time = Math.min(state.cooldown, state.time + remaining);
      break;
    }
    const duration = state.phase === 'idle' ? state.cooldown : PETTING_DURATIONS[state.phase];
    const untilTransition = Math.max(0, duration - state.time);
    if (remaining + 1e-10 < untilTransition) {
      state.time += remaining;
      break;
    }
    remaining = Math.max(0, remaining - untilTransition);
    if (remaining < 1e-10) remaining = 0;
    if (state.phase === 'idle') {
      startRequest(state, eligible, random);
      events.push({ type: 'request', ...state.request });
    } else if (state.phase === 'requesting') {
      events.push({ type: 'request-expired', ...state.request });
      returnToIdle(state, random);
    } else if (state.phase === 'petting') {
      state.phase = 'happy';
      state.time = 0;
      state.completed += 1;
      events.push({ type: 'petting-complete', ...state.request });
    } else if (state.phase === 'happy') {
      events.push({ type: 'happiness-ended', ...state.request });
      returnToIdle(state, random);
    }
  }
  return events;
}

export function offerPettingTool(state, residentId, toolId) {
  if (!state || state.phase !== 'requesting' || !state.request) {
    return { accepted: false, reason: 'unavailable' };
  }
  if (residentId !== state.request.residentId) return { accepted: false, reason: 'wrong-resident' };
  if (toolId !== state.request.toolId) return { accepted: false, reason: 'wrong-tool' };
  state.phase = 'petting';
  state.time = 0;
  return { accepted: true };
}
