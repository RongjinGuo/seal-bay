import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBeachResidents } from '../src/beach-residents.js';

const variants = ['harbor-pup', 'harbor-adult', 'harp-pup', 'harp-adult', 'grey-juvenile', 'grey-adult', 'ringed-adult', 'weddell-elder'];
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

function fixture({ lowNeck = false } = {}) {
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
  const surfaceHeight = (x, z) => .4 + .05 * x + .08 * z + .03 * Math.sin(z * .7);
  const residents = createBeachResidents({ scene, models, surfaceHeight });
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
