import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBeachResidents } from '../src/beach-residents.js';
import { beachHeight, shorelineZ } from '../src/beach.js';

const variants = ['harbor-pup', 'harbor-adult', 'harp-pup', 'harp-adult', 'grey-juvenile', 'grey-adult', 'ringed-adult', 'weddell-elder'];
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

function fixture({ lowNeck = false, terrainHeight = null, random = () => .5 } = {}) {
  const scene = new THREE.Scene();
  const existing = new THREE.Object3D();
  scene.add(existing);
  const models = new Map(variants.map(variant => {
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial());
    body.name = 'Plump seamless body';
    body.position.set(0, .4, -.2);
    body.scale.set(.68, 1.15, .5);
    model.add(body);
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.set(0, 1.3, .12);
    head.rotation.set(.07, -.03, .02);
    model.add(head);
    if (lowNeck) {
      const neck = new THREE.Mesh(new THREE.SphereGeometry(.35, 12, 8), body.material);
      neck.position.set(0, -.7, .2);
      head.add(neck);
    }
    for (const name of ['Jaw', 'Eye_L', 'Eye_R', 'Flipper_L', 'Flipper_R', 'RearFlipper_L', 'RearFlipper_R']) {
      const joint = new THREE.Group();
      joint.name = name;
      joint.rotation.set(.01, .02, -.03);
      joint.scale.set(.9, .8, .7);
      (name.startsWith('Eye') || name === 'Jaw' ? head : model).add(joint);
    }
    return [variant, model];
  }));
  const surfaceHeight = terrainHeight ?? ((x, z) => .4 + .05 * x + .08 * z + .03 * Math.sin(z * .7));
  const residents = createBeachResidents({ scene, models, surfaceHeight, random });
  return { scene, models, residents, surfaceHeight, existing };
}

function transforms(root) {
  const values = [];
  root.traverse(node => values.push([node.name, node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()]));
  return values;
}

test('the beach has five permanent residents with resting and crawling seals', () => {
  const { residents } = fixture();
  const snapshot = residents.snapshot();
  assert.equal(snapshot.length, 5);
  assert.equal(new Set(snapshot.map(seal => seal.id)).size, 5);
  assert.equal(snapshot.filter(seal => seal.behavior === 'resting').length, 3);
  assert.equal(snapshot.filter(seal => seal.behavior === 'crawling').length, 2);
  assert.ok(snapshot.some(seal => seal.variant === 'harp-pup' && seal.x < 0));
  assert.ok(snapshot.some(seal => seal.variant === 'weddell-elder' && seal.x > 0));
  residents.dispose();
});

test('resting seals remain in place while crawling seals travel inside separate small areas', () => {
  const { residents } = fixture();
  const initial = residents.snapshot();
  const traveled = new Set();
  for (let time = 1; time <= 100; time += 1) {
    residents.update(time);
    const snapshot = residents.snapshot();
    for (const seal of snapshot) {
      const origin = initial.find(value => value.id === seal.id);
      const distance = Math.hypot(seal.x - origin.x, seal.z - origin.z);
      if (seal.behavior === 'resting') near(distance, 0);
      if (distance > .3) traveled.add(seal.id);
      assert.ok(distance <= 1.2);
      assert.ok(seal.x > -17 && seal.x < 17 && seal.z <= -18 && seal.z > -23);
      for (const other of snapshot.filter(value => value.id !== seal.id)) {
        assert.ok(Math.hypot(seal.x - other.x, seal.z - other.z) > 3);
      }
    }
  }
  assert.equal(traveled.size, 2);
  residents.dispose();
});

test('absolute simulation time gives repeatable complete poses and freezes while paused', () => {
  const { residents, scene } = fixture();
  assert.equal(residents.snapshot().length, 5);
  residents.update(9.25);
  const snapshot = residents.snapshot();
  const pose = transforms(scene);
  for (let frame = 0; frame < 10; frame += 1) residents.update(9.25);
  assert.deepEqual(residents.snapshot(), snapshot);
  assert.deepEqual(transforms(scene), pose);
  residents.update(75);
  residents.update(9.25);
  assert.deepEqual(residents.snapshot(), snapshot);
  assert.deepEqual(transforms(scene), pose);
  for (const invalid of [NaN, Infinity, -Infinity]) residents.update(invalid);
  assert.deepEqual(transforms(scene), pose);
  residents.dispose();
});

test('all prone bodies stay supported by the supplied sand surface through their motion', () => {
  const { residents, scene, surfaceHeight } = fixture();
  assert.equal(residents.snapshot().length, 5);
  const vertex = new THREE.Vector3();
  for (const time of [0, 3, 13, 17, 23, 37, 65]) {
    residents.update(time);
    scene.updateMatrixWorld(true);
    for (const seal of residents.snapshot()) {
      const body = scene.getObjectByName(seal.id).getObjectByName('Plump seamless body');
      const positions = body.geometry.getAttribute('position');
      let clearance = Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(body.matrixWorld);
        clearance = Math.min(clearance, vertex.y - surfaceHeight(vertex.x, vertex.z));
      }
      near(clearance, .012);
      assert.ok(seal.bodyPitch > 1.3 && seal.bodyPitch < 1.7);
      assert.ok(seal.headPitch < -1.1 && seal.headPitch > -1.5);
    }
  }
  residents.dispose();
});

test('prone hind flippers trail behind the body instead of pointing into the air', () => {
  const { residents, scene } = fixture();
  for (const time of [0, 7, 19, 32]) {
    residents.update(time);
    for (const seal of residents.snapshot()) {
      const root = scene.getObjectByName(seal.id);
      for (const [name, side] of [['RearFlipper_L', -1], ['RearFlipper_R', 1]]) {
        const fin = root.getObjectByName(name);
        const direction = new THREE.Vector3(side * .4, -.13, -.65).applyQuaternion(fin.quaternion);
        assert.ok(direction.y < -.35, `${name} should trail along the body's rear axis`);
        assert.ok(direction.z > -.08, `${name} should not point above the back`);
      }
    }
  }
  residents.dispose();
});

test('lower neck geometry lifts clear of sloped sand while the torso remains grounded', () => {
  const { residents, scene, surfaceHeight } = fixture({ lowNeck: true });
  const vertex = new THREE.Vector3();
  for (const time of [0, 8, 17, 29]) {
    residents.update(time);
    for (const seal of residents.snapshot()) {
      const head = scene.getObjectByName(seal.id).getObjectByName('Head');
      let clearance = Infinity;
      head.traverse(node => {
        if (!node.isMesh) return;
        const positions = node.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
          clearance = Math.min(clearance, vertex.y - surfaceHeight(vertex.x, vertex.z));
        }
      });
      assert.ok(clearance >= .0119, `neck clearance is ${clearance}`);
    }
  }
  residents.dispose();
});

test('clones animate independently without modifying templates or shared mesh resources', () => {
  const { residents, models, scene } = fixture();
  const baselines = new Map([...models].map(([variant, model]) => [variant, transforms(model)]));
  residents.update(2);
  const firstPose = transforms(scene);
  residents.update(4);
  assert.notDeepEqual(transforms(scene), firstPose);
  for (const seal of residents.snapshot()) {
    const template = models.get(seal.variant);
    const templateBody = template.getObjectByName('Plump seamless body');
    const cloneBody = scene.getObjectByName(seal.id).getObjectByName('Plump seamless body');
    assert.notEqual(templateBody, cloneBody);
    assert.equal(templateBody.geometry, cloneBody.geometry);
    assert.equal(templateBody.material, cloneBody.material);
    assert.equal(templateBody.geometry.boundingBox, null);
    assert.deepEqual(transforms(template), baselines.get(seal.variant));
  }
  residents.dispose();
});

test('snapshots cannot mutate resident state and disposing preserves shared resources and unrelated scene objects', () => {
  const { residents, models, scene, existing } = fixture();
  let sharedDisposals = 0;
  for (const model of models.values()) {
    const body = model.getObjectByName('Plump seamless body');
    body.geometry.addEventListener('dispose', () => sharedDisposals += 1);
    body.material.addEventListener('dispose', () => sharedDisposals += 1);
  }
  const snapshot = residents.snapshot();
  assert.throws(() => { snapshot[0].x = 1000; }, TypeError);
  assert.throws(() => { snapshot.push({}); }, TypeError);
  residents.dispose();
  residents.dispose();
  residents.update(4);
  assert.deepEqual(residents.snapshot(), []);
  assert.deepEqual(scene.children, [existing]);
  assert.equal(sharedDisposals, 0);
});

test('interaction targets follow current body and head transforms and return independent world points', () => {
  const { residents, scene } = fixture();
  residents.update(13);
  scene.position.set(2, .5, -1);
  scene.rotation.y = .2;
  scene.scale.setScalar(1.1);
  const targets = residents.interactionTargets();
  assert.deepEqual(targets.map(target => target.id), residents.snapshot().map(seal => seal.id));
  for (const target of targets) {
    const root = scene.getObjectByName(target.id);
    const body = root.getObjectByName('Plump seamless body');
    const head = root.getObjectByName('Head');
    assert.equal(target.variant, residents.snapshot().find(seal => seal.id === target.id).variant);
    assert.ok(target.position instanceof THREE.Vector3 && target.headPosition instanceof THREE.Vector3);
    near(target.position.distanceTo(body.getWorldPosition(new THREE.Vector3())), 0);
    near(target.headPosition.distanceTo(head.getWorldPosition(new THREE.Vector3())), 0);
    near(target.radius, root.getWorldScale(new THREE.Vector3()).x * 1.15);
    assert.ok(target.radius > 1);
  }
  const original = targets[0].position.clone();
  targets[0].position.set(999, 999, 999);
  near(residents.interactionTargets()[0].position.distanceTo(original), 0);
  residents.dispose();
  assert.deepEqual(residents.interactionTargets(), []);
});

test('missing models never produce interaction targets or accept a care state', () => {
  const residents = createBeachResidents({ scene: new THREE.Scene(), models: new Map(), surfaceHeight: () => 0 });
  residents.setPettingState({ id: 'beach-resident-1', phase: 'petting', progress: .5 });
  residents.update(3);
  assert.deepEqual(residents.interactionTargets(), []);
  assert.deepEqual(residents.snapshot(), []);
  residents.dispose();
});

test('care changes only the selected resident and clears back to the ordinary resting pose', () => {
  const { residents, scene, models } = fixture();
  residents.update(8);
  const seals = residents.snapshot();
  const selected = seals.find(seal => seal.behavior === 'resting');
  const baseline = new Map(seals.map(seal => [seal.id, transforms(scene.getObjectByName(seal.id))]));
  const templates = new Map([...models].map(([variant, model]) => [variant, transforms(model)]));
  for (const phase of ['requesting', 'petting', 'happy']) {
    residents.setPettingState({ id: selected.id, phase, progress: .5 });
    residents.update(8);
    assert.equal(residents.snapshot().find(seal => seal.id === selected.id).carePhase, phase);
    assert.notDeepEqual(transforms(scene.getObjectByName(selected.id)), baseline.get(selected.id));
    for (const other of seals.filter(seal => seal.id !== selected.id)) {
      assert.deepEqual(transforms(scene.getObjectByName(other.id)), baseline.get(other.id));
      assert.equal(residents.snapshot().find(seal => seal.id === other.id).carePhase, null);
    }
  }
  residents.setPettingState(null);
  residents.update(8);
  for (const seal of seals) assert.deepEqual(transforms(scene.getObjectByName(seal.id)), baseline.get(seal.id));
  for (const [variant, model] of models) {
    assert.deepEqual(transforms(model), templates.get(variant));
    assert.equal(model.getObjectByName('Plump seamless body').geometry.boundingBox, null);
  }
  residents.dispose();
});

test('petting and happy poses visibly soften the eyes and move the head while repeated frames stay frozen', () => {
  const { residents, scene } = fixture();
  residents.update(4);
  const selected = residents.snapshot()[0];
  const root = scene.getObjectByName(selected.id);
  const openEye = root.getObjectByName('Eye_L').scale.y;
  const ordinaryHead = root.getObjectByName('Head').quaternion.clone();
  for (const phase of ['petting', 'happy']) {
    residents.setPettingState({ id: selected.id, phase, progress: .4 });
    residents.update(4);
    assert.ok(root.getObjectByName('Eye_L').scale.y < openEye * .5);
    assert.ok(root.getObjectByName('Head').quaternion.angleTo(ordinaryHead) > .03);
    const held = transforms(scene);
    for (let frame = 0; frame < 10; frame += 1) {
      residents.setPettingState({ id: selected.id, phase, progress: .4 });
      residents.update(4);
    }
    assert.deepEqual(transforms(scene), held);
  }
  residents.dispose();
});

test('care state validates IDs and phases and only one resident can receive care', () => {
  const { residents } = fixture();
  const [first, second] = residents.snapshot();
  residents.setPettingState({ id: first.id, phase: 'petting', progress: .5 });
  residents.setPettingState({ id: second.id, phase: 'happy', progress: .5 });
  residents.update(0);
  assert.deepEqual(residents.snapshot().filter(seal => seal.carePhase).map(seal => seal.id), [second.id]);
  for (const state of [
    { id: 'unknown', phase: 'petting', progress: .5 },
    { id: first.id, phase: 'unknown', progress: .5 },
    null,
  ]) {
    residents.setPettingState(state);
    residents.update(0);
    assert.ok(residents.snapshot().every(seal => seal.carePhase === null));
  }
  residents.dispose();
  residents.setPettingState({ id: first.id, phase: 'happy', progress: 1 });
  residents.update(10);
  assert.deepEqual(residents.snapshot(), []);
});

test('a crawling resident stays in place during care and resumes without a catch-up jump', () => {
  const { residents, scene } = fixture();
  residents.update(5);
  const crawling = residents.snapshot().find(seal => seal.behavior === 'crawling');
  const root = scene.getObjectByName(crawling.id);
  const yaw = root.rotation.y;
  residents.setPettingState({ id: crawling.id, phase: 'petting', progress: 0 });
  for (const time of [5, 6, 7, 9]) {
    residents.setPettingState({ id: crawling.id, phase: time > 6 ? 'happy' : 'petting', progress: .5 });
    residents.update(time);
    near(root.position.x, crawling.x);
    near(root.position.z, crawling.z);
    near(root.rotation.y, yaw);
  }
  residents.setPettingState(null);
  residents.update(9);
  near(root.position.x, crawling.x);
  near(root.position.z, crawling.z);
  near(root.rotation.y, yaw);
  residents.update(9.016);
  assert.ok(Math.hypot(root.position.x - crawling.x, root.position.z - crawling.z) < .002);
  residents.update(12);
  assert.ok(Math.hypot(root.position.x - crawling.x, root.position.z - crawling.z) > .05);
  residents.update(0);
  const fresh = fixture();
  assert.deepEqual(residents.snapshot(), fresh.residents.snapshot());
  fresh.residents.dispose();
  residents.dispose();
});

test('care poses keep both the torso and low neck clear of sloped sand', () => {
  const { residents, scene, surfaceHeight } = fixture({ lowNeck: true });
  const vertex = new THREE.Vector3();
  for (const seal of residents.snapshot()) {
    for (const phase of ['requesting', 'petting', 'happy']) {
      residents.setPettingState({ id: seal.id, phase, progress: .6 });
      residents.update(10);
      const root = scene.getObjectByName(seal.id);
      for (const name of ['Plump seamless body', 'Head']) {
        let clearance = Infinity;
        root.getObjectByName(name).traverse(node => {
          if (!node.isMesh) return;
          const vertices = node.geometry.getAttribute('position');
          for (let index = 0; index < vertices.count; index += 1) {
            vertex.fromBufferAttribute(vertices, index).applyMatrix4(node.matrixWorld);
            clearance = Math.min(clearance, vertex.y - surfaceHeight(vertex.x, vertex.z));
          }
        });
        assert.ok(clearance >= .0119, `${seal.variant} ${phase} ${name}: ${clearance}`);
        if (name === 'Plump seamless body') near(clearance, .012);
      }
    }
  }
  residents.dispose();
});

test('roaming starts the same harbor adult in nearshore water and stopping restores the original beach', () => {
  const { residents, scene } = fixture({ terrainHeight: beachHeight });
  const initial = residents.snapshot();
  const roots = initial.map(seal => scene.getObjectByName(seal.id));
  assert.equal(residents.roamingSnapshot().enabled, false);
  assert.ok(initial.every(seal => seal.habitat === 'beach'));
  residents.startRoaming();
  const water = residents.snapshot().filter(seal => seal.habitat === 'water');
  assert.equal(water.length, 1);
  assert.equal(water[0].id, 'beach-resident-2');
  near(water[0].x, .3);
  near(water[0].z, -10.95);
  assert.equal(residents.interactionTargets().length, 4);
  assert.equal(residents.roamingSnapshot().nextAt, 15);
  for (const root of roots) assert.equal(scene.getObjectByName(root.name), root);
  residents.stopRoaming();
  assert.deepEqual(residents.snapshot(), initial);
  assert.equal(residents.interactionTargets().length, 5);
  residents.dispose();
});

test('roaming keeps every identity through both directions and returns shore crossing events', () => {
  const { residents, scene } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const roots = residents.snapshot().map(seal => scene.getObjectByName(seal.id));
  const ids = roots.map(root => root.name);
  residents.startRoaming();
  const first = residents.updateRoaming(15, ids);
  residents.update(15);
  assert.deepEqual(first.map(event => [event.type, event.id, event.direction]), [['depart', 'beach-resident-2', 'to-beach']]);
  assert.equal(residents.snapshot().find(seal => seal.id === 'beach-resident-2').habitat, 'travel');
  const incoming = residents.updateRoaming(12, ids);
  residents.update(27);
  assert.deepEqual(incoming.map(event => event.type), ['shore-cross', 'arrive']);
  assert.ok(residents.snapshot().every(seal => seal.habitat === 'beach'));
  assert.equal(residents.interactionTargets().length, 5);
  const untilNext = residents.roamingSnapshot().nextAt - 27;
  const outgoing = residents.updateRoaming(untilNext, ids);
  residents.update(27 + untilNext);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].direction, 'to-water');
  assert.equal(residents.interactionTargets().length, 4);
  const ending = residents.updateRoaming(12, ids);
  residents.update(39 + untilNext);
  assert.deepEqual(ending.map(event => event.type), ['shore-cross', 'arrive']);
  assert.equal(residents.snapshot().filter(seal => seal.habitat === 'water').length, 1);
  assert.equal(residents.roamingSnapshot().started, 2);
  for (const root of roots) assert.equal(scene.getObjectByName(root.name), root);
  for (const event of [...first, ...incoming, ...outgoing, ...ending]) {
    assert.ok(Number.isFinite(event.at) && Number.isFinite(event.x) && Number.isFinite(event.z));
    if (event.type === 'shore-cross') near(event.z, shorelineZ(event.x), 1e-6);
  }
  residents.dispose();
});

test('travel paths and height are continuous across departure, shoreline, arrival, and resumed crawling', () => {
  const { residents } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const ids = residents.snapshot().map(seal => seal.id);
  residents.startRoaming();
  let previous = residents.snapshot();
  const events = [];
  for (let frame = 1; frame <= 750; frame += 1) {
    const time = frame / 10;
    events.push(...residents.updateRoaming(.1, ids));
    residents.update(time);
    const current = residents.snapshot();
    assert.equal(current.filter(seal => seal.habitat === 'travel').length <= 1, true);
    for (const seal of current) {
      const before = previous.find(value => value.id === seal.id);
      assert.ok(Math.hypot(seal.x - before.x, seal.z - before.z) < .25, `${seal.id} horizontal jump at ${time}`);
      assert.ok(Math.abs(seal.y - before.y) < .14, `${seal.id} height jump at ${time}: ${seal.y - before.y}`);
    }
    previous = current;
  }
  assert.equal(events.filter(event => event.type === 'arrive').length, 2);
  residents.dispose();
});

test('hidden and busy residents cannot start a trip and water or traveling seals cannot receive care', () => {
  const { residents } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const ids = residents.snapshot().map(seal => seal.id);
  residents.startRoaming();
  assert.deepEqual(residents.updateRoaming(20, [ids[0]]), []);
  assert.equal(residents.roamingSnapshot().started, 0);
  residents.setPettingState({ id: ids[1], phase: 'petting', progress: .5 });
  assert.ok(residents.snapshot().every(seal => seal.carePhase === null));
  residents.updateRoaming(.1, ids);
  residents.setPettingState({ id: ids[1], phase: 'requesting', progress: 0 });
  assert.ok(residents.snapshot().every(seal => seal.carePhase === null));
  residents.updateRoaming(12, ids);
  residents.setPettingState({ id: ids[0], phase: 'requesting', progress: 0 });
  const next = residents.roamingSnapshot().nextAt;
  assert.deepEqual(residents.updateRoaming(next - residents.roamingSnapshot().elapsed + 1, [ids[0]]), []);
  assert.equal(residents.roamingSnapshot().started, 1);
  residents.setPettingState(null);
  const departed = residents.updateRoaming(.1, [ids[0]]);
  assert.equal(departed[0].id, ids[0]);
  assert.equal(departed[0].direction, 'to-water');
  residents.dispose();
});

test('roaming pause freezes its full state and restart clears care, travel, clocks, and history', () => {
  const { residents, scene } = fixture({ terrainHeight: beachHeight });
  const ids = residents.snapshot().map(seal => seal.id);
  residents.startRoaming();
  residents.updateRoaming(18, ids);
  residents.update(18);
  const snapshot = residents.snapshot();
  const roaming = residents.roamingSnapshot();
  const pose = transforms(scene);
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.deepEqual(residents.updateRoaming(dt, ids), []);
    residents.update(18);
    assert.deepEqual(residents.snapshot(), snapshot);
    assert.deepEqual(residents.roamingSnapshot(), roaming);
    assert.deepEqual(transforms(scene), pose);
  }
  assert.throws(() => { roaming.history.push({}); }, TypeError);
  residents.setPettingState({ id: ids[0], phase: 'happy', progress: .5 });
  residents.startRoaming();
  assert.ok(residents.snapshot().every(seal => seal.carePhase === null && seal.travelDirection === null));
  assert.equal(residents.roamingSnapshot().elapsed, 0);
  assert.deepEqual(residents.roamingSnapshot().history, []);
  const restarted = residents.snapshot();
  const fresh = fixture({ terrainHeight: beachHeight });
  fresh.residents.startRoaming();
  assert.deepEqual(restarted, fresh.residents.snapshot());
  fresh.residents.dispose();
  residents.dispose();
  assert.deepEqual(residents.updateRoaming(20, ids), []);
});

test('nearshore swimming stays separate from the feeding bay and preserves shared resources', () => {
  const { residents, models } = fixture({ terrainHeight: beachHeight });
  const baselines = new Map([...models].map(([variant, model]) => [variant, transforms(model)]));
  residents.startRoaming();
  for (let time = 1; time <= 150; time += 1) {
    residents.updateRoaming(1, []);
    residents.update(time);
    const water = residents.snapshot().find(seal => seal.habitat === 'water');
    assert.ok(water.z <= -10 && water.z >= shorelineZ(water.x) + 2);
    assert.ok(Math.abs(water.x - .3) < .3);
  }
  for (const [variant, model] of models) {
    assert.deepEqual(transforms(model), baselines.get(variant));
    assert.equal(model.getObjectByName('Plump seamless body').geometry.boundingBox, null);
  }
  residents.dispose();
});

test('a long roaming update starts at most one journey with zero progress instead of replaying missed trips', () => {
  const { residents } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const ids = residents.snapshot().map(seal => seal.id);
  residents.startRoaming();
  for (let frame = 1; frame <= 3; frame += 1) {
    const events = residents.updateRoaming(100, ids);
    residents.update(frame * .08);
    assert.equal(events.filter(event => event.type === 'depart').length, 1);
    assert.equal(residents.roamingSnapshot().started, frame);
    const traveler = residents.snapshot().find(seal => seal.habitat === 'travel');
    near(traveler.travelProgress, 0);
    assert.equal(residents.roamingSnapshot().lastDepartureAt, frame * 100);
  }
  residents.dispose();
});

test('roaming belly geometry remains supported throughout the slope crossing', () => {
  const { residents, scene } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const ids = residents.snapshot().map(seal => seal.id);
  const vertex = new THREE.Vector3();
  residents.startRoaming();
  residents.updateRoaming(15, ids);
  for (let frame = 0; frame <= 48; frame += 1) {
    if (frame) residents.updateRoaming(.25, ids);
    residents.update(15 + frame * .25);
    const seal = residents.snapshot().find(value => value.id === 'beach-resident-2');
    const body = scene.getObjectByName(seal.id).getObjectByName('Plump seamless body');
    const positions = body.geometry.getAttribute('position');
    let clearance = Infinity;
    for (let index = 0; index < positions.count; index += 1) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(body.matrixWorld);
      clearance = Math.min(clearance, vertex.y - beachHeight(vertex.x, vertex.z));
    }
    assert.ok(clearance >= .0119, `torso penetrates slope by ${clearance}`);
    if (seal.z < shorelineZ(seal.x) - 1) near(clearance, .012);
  }
  residents.dispose();
});

test('the final travel pose joins both habitats without a body or flipper rotation pop', () => {
  const { residents, scene } = fixture({ terrainHeight: beachHeight, random: () => 0 });
  const ids = residents.snapshot().map(seal => seal.id);
  residents.startRoaming();
  residents.updateRoaming(15, ids);
  for (const direction of ['to-beach', 'to-water']) {
    if (direction === 'to-water') residents.updateRoaming(residents.roamingSnapshot().nextAt - residents.roamingSnapshot().elapsed, ids);
    const id = residents.roamingSnapshot().activeId;
    const root = scene.getObjectByName(id);
    residents.updateRoaming(12 - 1e-6, ids);
    residents.update(30);
    const rotations = new Map();
    root.traverse(node => rotations.set(node.uuid, node.quaternion.clone()));
    const before = root.position.clone();
    residents.updateRoaming(1e-6, ids);
    residents.update(30);
    assert.ok(root.position.distanceTo(before) < 1e-5, `${direction} position at arrival`);
    root.traverse(node => assert.ok(node.quaternion.angleTo(rotations.get(node.uuid)) < 1e-5, `${direction} ${node.name} rotates on arrival`));
  }
  residents.dispose();
});
