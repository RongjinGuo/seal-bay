import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEECH_TIMING,
  advanceSpeech,
  createSpeechState,
} from '../src/speech-logic.js';

const seal = (id, state = 'calling', visible = true) => ({ id, state, visible, name: '团团' });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const startSpeech = (candidates = [seal('first'), seal('second')], random = () => 0) => {
  const state = createSpeechState();
  advanceSpeech(state, 7, candidates, random);
  return state;
};

test('the timing configuration is immutable and a new visit starts in silence', () => {
  assert.deepEqual(SPEECH_TIMING, { first: 7, duration: 2.6, minGap: 12, maxGap: 18 });
  assert.ok(Object.isFrozen(SPEECH_TIMING));
  const state = createSpeechState();
  assert.equal(state.active, null);
  assert.equal(state.elapsed, 0);
  assert.equal(state.nextAt, 7);
  assert.deepEqual([...state.spokenIds], []);
});

test('one visible caller speaks after seven active seconds and stays briefly', () => {
  const state = createSpeechState();
  const candidates = [seal('first')];
  assert.equal(advanceSpeech(state, 6.9, candidates, () => 0), null);
  const active = advanceSpeech(state, 0.1, candidates, () => 0);
  assert.strictEqual(active, state.active);
  assert.deepEqual(active, { id: 'first', kind: 'calling', text: '我的小鱼呢？', remaining: 2.6 });
  assert.strictEqual(advanceSpeech(state, 2.5, candidates), active);
  near(active.remaining, 0.1);
  assert.equal(advanceSpeech(state, 0.1, candidates), null);
});

test('simultaneous calls produce at most one speech and cannot interrupt it', () => {
  const candidates = [seal('first'), seal('second'), seal('third')];
  const state = startSpeech(candidates, () => 0);
  assert.equal(state.active.id, 'first');
  assert.deepEqual([...state.spokenIds], ['first']);
  advanceSpeech(state, 1, candidates, () => 1);
  assert.equal(state.active.id, 'first');
  assert.deepEqual([...state.spokenIds], ['first']);
});

test('an ended speech leaves twelve to eighteen quiet seconds before the next visitor speaks', () => {
  for (const [sample, gap] of [[0, 12], [0.5, 15], [1, 18]]) {
    const candidates = [seal('first'), seal('second')];
    const state = startSpeech(candidates, () => sample);
    const firstId = state.active.id;
    near(state.nextAt - state.elapsed, 2.6 + gap);
    assert.equal(advanceSpeech(state, 2.6, candidates), null);
    near(state.nextAt - state.elapsed, gap);
    assert.equal(advanceSpeech(state, gap - 0.01, candidates), null);
    assert.notEqual(advanceSpeech(state, 0.01, candidates, () => sample).id, firstId);
  }
});

test('a visitor speaks only once even when moving through calling, eating and happy states', () => {
  const state = startSpeech([seal('first')]);
  for (const kind of ['eating', 'happy', 'calling']) {
    assert.equal(advanceSpeech(state, 100, [seal('first', kind)], () => 0), null);
    assert.deepEqual([...state.spokenIds], ['first']);
  }
});

test('only visible calling, eating and happy visitors can speak', () => {
  const candidates = [
    seal('hidden', 'calling', false),
    seal('entering', 'entering'),
    seal('fed', 'fed'),
    seal('leaving', 'leaving'),
    seal('silent', 'idle'),
  ];
  const state = createSpeechState();
  assert.equal(advanceSpeech(state, 1000, candidates), null);
  assert.equal(state.spokenIds.length, 0);
  const active = advanceSpeech(state, 0.1, [...candidates, seal('eating', 'eating')], () => 0);
  assert.equal(active.id, 'eating');
  assert.equal(active.text, '好香呀！');
  assert.equal(active.remaining, 2.6);
});

test('happy visitors use a short happy line', () => {
  const state = startSpeech([seal('happy', 'happy')]);
  assert.equal(state.active.kind, 'happy');
  assert.equal(state.active.text, '还想再见到你 ♡');
});

test('a speaker disappearing, becoming hidden or changing state clears its speech immediately', () => {
  for (const replacement of [[], [seal('first', 'calling', false)], [seal('first', 'eating')], [seal('first', 'leaving')]]) {
    const state = startSpeech();
    assert.equal(advanceSpeech(state, 0.1, [...replacement, seal('second')], () => 0), null);
    near(state.nextAt - state.elapsed, 14.5);
    assert.equal(advanceSpeech(state, 14.49, [...replacement, seal('second')], () => 0), null);
    assert.equal(advanceSpeech(state, 0.01, [...replacement, seal('second')], () => 0).id, 'second');
  }
});

test('paused and invalid time steps freeze speech, cooldown and visitor history', () => {
  for (const state of [createSpeechState(), startSpeech()]) {
    const snapshot = structuredClone(state);
    const active = state.active;
    for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined]) {
      assert.strictEqual(advanceSpeech(state, dt, [], () => { throw new Error('Pause must not sample randomness'); }), active);
      assert.deepEqual(state, snapshot);
    }
  }
});

test('a restarted visit has independent timers and visitor history', () => {
  const previous = startSpeech();
  const restarted = createSpeechState();
  assert.notStrictEqual(restarted.spokenIds, previous.spokenIds);
  assert.deepEqual(JSON.parse(JSON.stringify(restarted)), restarted);
  assert.equal(advanceSpeech(restarted, 6.9, [seal('first')]), null);
  assert.equal(advanceSpeech(restarted, 0.1, [seal('first')], () => 0).id, 'first');
  assert.equal(previous.active.remaining, 2.6);
});

test('large steps start only one fresh speech without consuming phantom visits', () => {
  const candidates = Array.from({ length: 20 }, (_, index) => seal(index));
  const state = createSpeechState();
  advanceSpeech(state, 1000, candidates, () => 0);
  assert.equal(state.active.id, 0);
  assert.equal(state.active.remaining, 2.6);
  assert.deepEqual([...state.spokenIds], [0]);
  advanceSpeech(state, 1000, candidates, () => 0);
  assert.equal(state.active.id, 1);
  assert.equal(state.active.remaining, 2.6);
  assert.deepEqual([...state.spokenIds], [0, 1]);
  near(state.nextAt - state.elapsed, 14.6);
});

test('an empty scene accumulates no dialogue backlog', () => {
  const state = createSpeechState();
  assert.equal(advanceSpeech(state, 1000, []), null);
  assert.ok(state.nextAt <= state.elapsed);
  assert.equal(state.spokenIds.length, 0);
  advanceSpeech(state, 0.01, [seal('new')], () => 0);
  assert.equal(state.active.id, 'new');
  assert.equal(state.active.remaining, 2.6);
});

test('visitor history keeps live speakers and releases departed visits', () => {
  const state = startSpeech([seal('first')]);
  advanceSpeech(state, 0.1, [seal('first')]);
  assert.ok(state.spokenIds.includes(state.active.id));
  advanceSpeech(state, 0.1, []);
  assert.equal(state.active, null);
  assert.equal(state.spokenIds.length, 0);
  advanceSpeech(state, 100, [seal('first')], () => 0);
  assert.equal(state.active.id, 'first');
});

test('candidate records are never mutated and random endpoints select existing candidates', () => {
  const candidates = Object.freeze([Object.freeze(seal('first')), Object.freeze(seal('second'))]);
  const state = startSpeech(candidates, () => 1);
  assert.equal(state.active.id, 'second');
  assert.equal(state.active.text, '这里还有小肚子饿啦');
  advanceSpeech(state, 1, candidates);
  assert.deepEqual(candidates, [seal('first'), seal('second')]);
});
