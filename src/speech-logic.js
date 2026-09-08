export const SPEECH_TIMING = Object.freeze({ first: 7, duration: 2.6, minGap: 12, maxGap: 18 });

const LINES = Object.freeze({
  calling: Object.freeze(['我的小鱼呢？', '这里还有小肚子饿啦']),
  eating: Object.freeze(['好香呀！']),
  happy: Object.freeze(['还想再见到你 ♡']),
});

export function createSpeechState() {
  return { elapsed: 0, nextAt: SPEECH_TIMING.first, active: null, spokenIds: [] };
}

function sample(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function choose(values, random) {
  return values[Math.min(values.length - 1, Math.floor(sample(random) * values.length))];
}

/** Advances active simulation time, mutates state only, and returns its current speech or null. */
export function advanceSpeech(state, dt, candidates, random = Math.random) {
  if (!state || !Number.isFinite(dt) || dt <= 0) return state?.active ?? null;
  state.elapsed += dt;
  const live = Array.isArray(candidates) ? candidates.filter((candidate) => candidate?.id != null) : [];
  const liveIds = new Set(live.map((candidate) => candidate.id));

  if (state.active) {
    const speaker = live.find((candidate) => candidate.id === state.active.id);
    state.active.remaining -= dt;
    if (!speaker?.visible || speaker.state !== state.active.kind || state.active.remaining <= 1e-10) {
      state.active = null;
    }
  }
  state.spokenIds = state.spokenIds.filter((id) => liveIds.has(id));
  if (state.active || state.elapsed + 1e-10 < state.nextAt) return state.active;

  const eligible = live.filter((candidate) => candidate.visible
    && Object.hasOwn(LINES, candidate.state) && !state.spokenIds.includes(candidate.id));
  if (eligible.length === 0) return null;

  // Start at the current frame so long steps cannot consume unseen dialogue or create a burst.
  const speaker = choose(eligible, random);
  state.active = {
    id: speaker.id,
    kind: speaker.state,
    text: choose(LINES[speaker.state], random),
    remaining: SPEECH_TIMING.duration,
  };
  state.spokenIds.push(speaker.id);
  const gap = SPEECH_TIMING.minGap + sample(random) * (SPEECH_TIMING.maxGap - SPEECH_TIMING.minGap);
  state.nextAt = state.elapsed + SPEECH_TIMING.duration + gap;
  return state.active;
}
