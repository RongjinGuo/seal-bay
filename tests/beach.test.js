import test from 'node:test';
import assert from 'node:assert/strict';
import { beachHeight, shorelineZ } from '../src/beach.js';
import { pickSpawn } from '../src/logic.js';

test('the beach leaves all reachable feeding positions in open water', () => {
  for (let i = 0; i <= 100; i++) {
    const visitor = pickSpawn([], () => i / 100);
    assert.ok(visitor.z - shorelineZ(visitor.x) > 4);
    assert.ok(beachHeight(visitor.x, visitor.z) < 0);
  }
});

test('sand rises continuously from the water to the resident habitat', () => {
  for (let x = -12; x <= 12; x += 1) {
    const shore = shorelineZ(x);
    assert.ok(beachHeight(x, shore) < 0);
    assert.ok(beachHeight(x, shore - 4) > 0.5);
    for (let d = 0; d < 10; d += .1) {
      assert.ok(Math.abs(beachHeight(x, shore - d) - beachHeight(x, shore - d - .1)) < .08);
    }
  }
});
