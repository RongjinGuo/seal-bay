import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOtterResidents } from '../src/otter-residents.js';
import { beachHeight } from '../src/beach.js';

const variants = ['sea-otter-adult', 'sea-otter-pup', 'river-otter'];
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function fixture({ surfaceHeight = beachHeight, giantEyes = false, available = variants } = {}) {
  const scene = new THREE.Scene();
  const unrelated = new THREE.Object3D();
  unrelated.name = 'Existing bay';
  scene.add(unrelated);
  const models = new Map(available.map(variant => {
    const sea = variant !== 'river-otter';
    const model = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
    body.name = 'Body';
    body.position.y = sea ? 0 : .5;
    body.scale.set(sea ? .55 : .32, sea ? .34 : .3, sea ? 1.05 : .8);
    model.add(body);
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.set(0, sea ? .035 : .87, sea ? -.98 : .9);
    head.rotation.x = sea ? -.82 : -.04;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 8), material));
    model.add(head);
    for (const side of ['L', 'R']) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(giantEyes ? 4 : .028, 8, 6), material);
      eye.name = `Eye_${side}`;
      eye.position.set(side === 'L' ? -.12 : .12, .09, .23);
      eye.scale.set(.8, .7, .55);
      head.add(eye);
      for (const limb of ['Forepaw', 'Hindpaw']) {
        const paw = new THREE.Group();
        paw.name = `${limb}_${side}`;
        const seaForepaw = sea && limb === 'Forepaw';
        paw.position.set((side === 'L' ? -1 : 1) * (seaForepaw ? .36 : .38), seaForepaw ? .15 : sea ? .36 : .07,
          sea ? limb === 'Forepaw' ? -.57 : .91 : limb === 'Forepaw' ? .48 : -.48);
        if (!seaForepaw) paw.rotation.set(.03, -.02, side === 'L' ? .06 : -.06);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), material);
        paw.add(mesh);
        model.add(paw);
      }
    }
    const tail = new THREE.Group();
    tail.name = 'Tail';
    tail.position.set(0, sea ? -.1 : .2, sea ? 1 : -.8);
    if (!sea) {
      const tip = new THREE.Vector3(0, -.16, -1.45);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.035, .12, tip.length(), 8), material);
      mesh.position.copy(tip).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().normalize());
      tail.add(mesh);
    }
    model.add(tail);
    if (sea) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), material);
      shell.name = 'Shell';
      shell.position.set(0, .43, -.08);
      shell.rotation.set(.07, .03, -.05);
      model.add(shell);
    }
    return [variant, model];
  }));
  const residents = createOtterResidents({ scene, models, surfaceHeight });
  return { residents, scene, models, unrelated, surfaceHeight };
}

function transforms(root) {
  const result = [];
  root.traverse(node => result.push([node.name, node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()]));
  return result;
}

function pawClearances(root, surfaceHeight) {
  const vertex = new THREE.Vector3();
  return ['Forepaw_L', 'Forepaw_R', 'Hindpaw_L', 'Hindpaw_R'].map(name => {
    let clearance = Infinity;
    root.getObjectByName(name).traverse(node => {
      if (!node.isMesh) return;
      const vertices = node.geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) {
        vertex.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld);
        clearance = Math.min(clearance, vertex.y - surfaceHeight(vertex.x, vertex.z));
      }
    });
    return clearance;
  });
}

test('three distinct companions use the agreed identities, habitats, and starting layout', () => {
  const { residents, scene } = fixture();
  const otters = residents.snapshot();
  assert.deepEqual(otters.map(({ id, variant, species, habitat, behavior }) => ({ id, variant, species, habitat, behavior })), [
    { id: 'otter-sea-adult', variant: 'sea-otter-adult', species: '海獭', habitat: 'water', behavior: 'floating' },
    { id: 'otter-sea-pup', variant: 'sea-otter-pup', species: '海獭', habitat: 'water', behavior: 'floating' },
    { id: 'otter-river', variant: 'river-otter', species: '水獭', habitat: 'beach', behavior: 'walking' },
  ]);
  assert.deepEqual(otters.map(({ x, z }) => [x, z]), [[-3.6, -11.2], [4.6, -10.8], [4, -15.5]]);
  assert.deepEqual(otters.map(otter => scene.getObjectByName(otter.id).scale.x), [1.5, 1.5, 1.35]);
  assert.deepEqual(otters.map(otter => otter.yaw), [.6, -.5, .15]);
  assert.ok(otters.every(otter => otter.carePhase === null));
  residents.dispose();
});

test('sea otters preserve their native supine posture and float within a small waterline area', () => {
  const { residents, scene } = fixture();
  const initial = residents.snapshot();
  let variedHeight = false;
  for (let time = 0; time <= 96; time += .8) {
    residents.update(time);
    for (const otter of residents.snapshot().filter(item => item.habitat === 'water')) {
      const start = initial.find(item => item.id === otter.id);
      assert.ok(distance(otter, start) < .3);
      assert.ok(otter.y > -.06 && otter.y < .08);
      variedHeight ||= Math.abs(otter.y - start.y) > .02;
      const root = scene.getObjectByName(otter.id);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
      assert.ok(up.y > .99, 'Native belly-up anatomy must not be rotated into a seal pose');
      const head = root.getObjectByName('Head');
      const feet = root.getObjectByName('Hindpaw_L');
      assert.ok(head.position.z < 0 && feet.position.z > 0);
    }
  }
  assert.ok(variedHeight);
  residents.dispose();
});

test('sea grooming lifts a paw toward the cheek while the shell stays close to the belly', () => {
  const { residents, scene } = fixture();
  const initial = residents.snapshot()[0];
  const root = scene.getObjectByName(initial.id);
  const tip = new THREE.Vector3(.155, .275, .38);
  const paw = root.getObjectByName('Forepaw_L');
  const head = root.getObjectByName('Head');
  const initialDistance = paw.localToWorld(tip.clone()).distanceTo(head.getWorldPosition(new THREE.Vector3()));
  let groomed;
  for (let time = 0; time < 30; time += .1) {
    residents.update(time);
    const adult = residents.snapshot()[0];
    assert.deepEqual(adult.joints.Forepaw_L.position, initial.joints.Forepaw_L.position, 'Grooming keeps the shoulder attached to the torso');
    if (adult.grooming > .98) { groomed = adult; break; }
  }
  assert.ok(groomed, 'An occasional grooming cycle must occur');
  assert.ok(paw.localToWorld(tip.clone()).distanceTo(head.getWorldPosition(new THREE.Vector3())) < initialDistance * .7);
  assert.ok(new THREE.Quaternion(...groomed.joints.Forepaw_L.quaternion).angleTo(new THREE.Quaternion(...initial.joints.Forepaw_L.quaternion)) < 1.25,
    'The upper arm remains within its shoulder articulation range');
  assert.ok(new THREE.Vector3(...groomed.joints.Shell.position).distanceTo(new THREE.Vector3(...initial.joints.Shell.position)) < .08);
  assert.notDeepEqual(groomed.joints.Shell.quaternion, initial.joints.Shell.quaternion);
  assert.notDeepEqual(groomed.joints.Forepaw_L.quaternion, initial.joints.Forepaw_L.quaternion);
  residents.dispose();
});

test('the river tail clears uphill sand while the paws keep their original ground support', () => {
  const { residents, scene, surfaceHeight } = fixture();
  const point = new THREE.Vector3();
  for (const time of [0, 3, 7, 16, 20, 27, 36, 44]) {
    residents.update(time);
    const root = scene.getObjectByName('otter-river');
    near(Math.min(...pawClearances(root, surfaceHeight)), .01);
    for (const name of ['Body', 'Tail']) {
      root.getObjectByName(name).traverse(node => {
        if (!node.isMesh) return;
        const vertices = node.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld);
          assert.ok(point.y - surfaceHeight(point.x, point.z) >= .0099, `${name} must stay above the sand`);
        }
      });
    }
  }
  residents.dispose();
});

test('the river otter walks slowly in a bounded beach area with a curious head and moving tail', () => {
  const { residents } = fixture();
  const initial = residents.snapshot().find(item => item.id === 'otter-river');
  let previous = initial;
  let walked = false, turnedHead = false, swayedTail = false;
  for (let step = 1; step <= 600; step++) {
    residents.update(step / 10);
    const otter = residents.snapshot().find(item => item.id === 'otter-river');
    assert.ok(distance(otter, initial) <= .251);
    assert.ok(distance(otter, previous) < .012);
    assert.ok(otter.z <= -15.25 && otter.z >= -15.5);
    assert.ok(Math.abs(otter.yaw - initial.yaw) < .1, 'Small steps keep the long tail in its shoreline patch');
    walked ||= distance(otter, initial) > .15;
    turnedHead ||= JSON.stringify(otter.joints.Head.quaternion) !== JSON.stringify(initial.joints.Head.quaternion);
    swayedTail ||= JSON.stringify(otter.joints.Tail.quaternion) !== JSON.stringify(initial.joints.Tail.quaternion);
    previous = otter;
  }
  assert.ok(walked && turnedHead && swayedTail);
  residents.dispose();
});

test('actual paw geometry stays above sloped sand and at least one paw supports the river otter', () => {
  const { residents, scene, surfaceHeight } = fixture();
  for (const time of [0, 3, 7, 16, 20, 27, 36, 44, 58]) {
    residents.update(time);
    const root = scene.getObjectByName('otter-river');
    const clearances = pawClearances(root, surfaceHeight);
    assert.ok(clearances.every(value => value >= .0099), `paw clearance: ${clearances}`);
    near(Math.min(...clearances), .01);
  }
  residents.dispose();
});

test('eye size and blink geometry cannot change the terrain grounding height', () => {
  const normal = fixture();
  const hugeEyes = fixture({ giantEyes: true });
  for (const time of [0, 4, 6, 11, 19, 37]) {
    normal.residents.update(time);
    hugeEyes.residents.update(time);
    near(normal.residents.snapshot()[2].y, hugeEyes.residents.snapshot()[2].y);
  }
  normal.residents.dispose();
  hugeEyes.residents.dispose();
});

test('absolute time is repeatable and all animation freezes on repeated or invalid time', () => {
  const { residents, scene } = fixture();
  residents.update(9.25);
  const before = transforms(scene);
  const snapshot = residents.snapshot();
  for (let i = 0; i < 12; i++) residents.update(9.25);
  for (const invalid of [NaN, Infinity, -Infinity, -1]) residents.update(invalid);
  assert.deepEqual(transforms(scene), before);
  assert.deepEqual(residents.snapshot(), snapshot);
  residents.update(75);
  residents.update(9.25);
  assert.deepEqual(transforms(scene), before);
  residents.dispose();
});

test('only the river otter supplies independent world-space petting anchors', () => {
  const { residents, scene } = fixture();
  residents.update(6);
  scene.position.set(2, .5, -1);
  scene.rotation.y = .2;
  scene.scale.setScalar(1.1);
  const targets = residents.interactionTargets();
  assert.equal(targets.length, 1);
  const target = targets[0];
  assert.equal(target.id, 'otter-river');
  assert.equal(target.variant, 'river-otter');
  const root = scene.getObjectByName('otter-river');
  near(target.position.distanceTo(root.getObjectByName('Body').getWorldPosition(new THREE.Vector3())), 0);
  near(target.headPosition.distanceTo(root.getObjectByName('Head').getWorldPosition(new THREE.Vector3())), 0);
  assert.ok(target.radius > 1);
  const position = target.position.clone();
  target.position.set(999, 999, 999);
  target.headPosition.set(999, 999, 999);
  near(residents.interactionTargets()[0].position.distanceTo(position), 0);
  residents.dispose();
});

test('sea otters and invalid IDs cannot receive petting poses', () => {
  const { residents, scene } = fixture();
  residents.update(8);
  const baseline = transforms(scene);
  for (const state of [
    { id: 'otter-sea-adult', phase: 'happy', progress: 1 },
    { id: 'otter-sea-pup', phase: 'petting', progress: .5 },
    { id: 'missing', phase: 'requesting', progress: 0 },
    { id: 'otter-river', phase: 'invalid', progress: .5 },
  ]) {
    residents.setPettingState(state);
    residents.update(8);
    assert.ok(residents.snapshot().every(item => item.carePhase === null));
    assert.deepEqual(transforms(scene), baseline);
  }
  residents.dispose();
});

test('petting and happiness stop river walking then resume from the held place without a catch-up jump', () => {
  const { residents } = fixture();
  residents.update(7);
  const before = residents.snapshot()[2];
  residents.setPettingState({ id: 'otter-river', phase: 'petting', progress: .4 });
  for (const time of [7, 8, 10, 12]) {
    residents.setPettingState({ id: 'otter-river', phase: time > 8 ? 'happy' : 'petting', progress: .5 });
    residents.update(time);
    const current = residents.snapshot()[2];
    near(distance(current, before), 0);
    near(current.yaw, before.yaw);
    assert.ok(current.joints.Eye_L.scale[1] < before.joints.Eye_L.scale[1] * .4);
  }
  residents.setPettingState(null);
  residents.update(12);
  near(distance(residents.snapshot()[2], before), 0);
  near(residents.snapshot()[2].yaw, before.yaw);
  residents.update(12.016);
  assert.ok(distance(residents.snapshot()[2], before) < .002);
  residents.update(16);
  assert.ok(distance(residents.snapshot()[2], before) > .04);
  residents.dispose();
});

test('requesting keeps the river walk active and care does not alter sea companions', () => {
  const { residents, scene } = fixture();
  residents.update(5);
  const before = residents.snapshot()[2];
  const seaBefore = ['otter-sea-adult', 'otter-sea-pup'].map(id => transforms(scene.getObjectByName(id)));
  residents.setPettingState({ id: 'otter-river', phase: 'requesting', progress: .2 });
  residents.update(5);
  assert.deepEqual(['otter-sea-adult', 'otter-sea-pup'].map(id => transforms(scene.getObjectByName(id))), seaBefore);
  residents.update(9);
  assert.ok(distance(residents.snapshot()[2], before) > .04);
  residents.dispose();
});

test('reset clears care and restarts the path against the current absolute clock', () => {
  const { residents } = fixture();
  const initial = residents.snapshot();
  residents.update(41);
  residents.setPettingState({ id: 'otter-river', phase: 'happy', progress: .8 });
  residents.update(43);
  residents.reset();
  assert.deepEqual(residents.snapshot(), initial);
  residents.update(43);
  assert.deepEqual(residents.snapshot(), initial);
  residents.update(44);
  const fresh = fixture();
  fresh.residents.update(1);
  assert.deepEqual(residents.snapshot(), fresh.residents.snapshot());
  fresh.residents.dispose();
  residents.dispose();
});

test('snapshot joint arrays are serializable copies that cannot mutate animation state', () => {
  const { residents } = fixture();
  residents.update(12);
  const original = residents.snapshot();
  const snapshot = residents.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  snapshot[2].x = 999;
  snapshot[2].joints.Head.position[0] = 999;
  snapshot[0].joints.Eye_L.scale[1] = 999;
  snapshot.push({ id: 'fake' });
  assert.deepEqual(residents.snapshot(), original);
  residents.dispose();
});

test('clones preserve authored transforms, geometry, materials, and unrelated scene resources', () => {
  const { residents, models, scene, unrelated } = fixture();
  const baselines = new Map([...models].map(([id, model]) => [id, transforms(model)]));
  let disposals = 0;
  for (const model of models.values()) {
    const body = model.getObjectByName('Body');
    body.geometry.addEventListener('dispose', () => disposals++);
    body.material.addEventListener('dispose', () => disposals++);
  }
  residents.update(16);
  residents.setPettingState({ id: 'otter-river', phase: 'petting', progress: .6 });
  residents.update(18);
  for (const otter of residents.snapshot()) {
    const template = models.get(otter.variant);
    const clone = scene.getObjectByName(otter.id).getObjectByName('Body');
    const original = template.getObjectByName('Body');
    assert.notEqual(clone, original);
    assert.equal(clone.geometry, original.geometry);
    assert.equal(clone.material, original.material);
    assert.equal(original.geometry.boundingBox, null);
    assert.deepEqual(transforms(template), baselines.get(otter.variant));
  }
  residents.dispose();
  residents.dispose();
  residents.update(20);
  residents.reset();
  residents.setPettingState({ id: 'otter-river', phase: 'happy', progress: 1 });
  assert.deepEqual(residents.snapshot(), []);
  assert.deepEqual(residents.interactionTargets(), []);
  assert.deepEqual(scene.children, [unrelated]);
  assert.equal(disposals, 0);
});

test('missing models produce only available companions and no phantom river target', () => {
  const empty = fixture({ available: [] });
  empty.residents.update(10);
  empty.residents.reset();
  assert.deepEqual(empty.residents.snapshot(), []);
  assert.deepEqual(empty.residents.interactionTargets(), []);
  empty.residents.dispose();
  const seaOnly = fixture({ available: ['sea-otter-adult'] });
  assert.equal(seaOnly.residents.snapshot().length, 1);
  assert.deepEqual(seaOnly.residents.interactionTargets(), []);
  seaOnly.residents.dispose();
});
