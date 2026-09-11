import * as THREE from 'three';

const COMPANIONS = [
  { id: 'otter-sea-adult', variant: 'sea-otter-adult', species: '海獭', habitat: 'water', behavior: 'floating', x: -3.6, z: -11.2, yaw: .6, scale: 1.5, phase: .4 },
  { id: 'otter-sea-pup', variant: 'sea-otter-pup', species: '海獭', habitat: 'water', behavior: 'floating', x: 4.6, z: -10.8, yaw: -.5, scale: 1.5, phase: 3.4 },
  { id: 'otter-river', variant: 'river-otter', species: '水獭', habitat: 'beach', behavior: 'walking', x: 4, z: -15.5, yaw: .15, scale: 1.35, phase: 2.9 },
];
const PAWS = ['Forepaw_L', 'Forepaw_R', 'Hindpaw_L', 'Hindpaw_R'];
const JOINTS = new Set(['Body', 'Head', 'Eye_L', 'Eye_R', ...PAWS, 'Tail', 'Shell']);
const CARE_PHASES = new Set(['requesting', 'petting', 'happy']);
const clamp = value => THREE.MathUtils.clamp(value, 0, 1);
const smooth = value => value * value * value * (value * (value * 6 - 15) + 10);

function meshSupport(root) {
  const support = [];
  root?.traverse(node => {
    if (node.isMesh && node.geometry.getAttribute('position')) support.push({ node, vertices: node.geometry.getAttribute('position') });
  });
  return support;
}

function localCenter(node) {
  node.updateWorldMatrix(true, true);
  const inverse = node.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  for (const mesh of meshSupport(node)) {
    matrix.multiplyMatrices(inverse, mesh.node.matrixWorld);
    for (let index = 0; index < mesh.vertices.count; index++) {
      bounds.expandByPoint(vertex.fromBufferAttribute(mesh.vertices, index).applyMatrix4(matrix));
    }
  }
  return bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
}

function walkAt(time) {
  const cycle = ((time % 48) + 48) % 48;
  const yaw = .08 * Math.sin(cycle / 48 * Math.PI * 2);
  // Short forward and backward steps keep the tail clear of neighboring residents.
  if (cycle < 18) {
    const progress = cycle / 18;
    return { distance: .25 * smooth(progress), yaw, effort: Math.sin(progress * Math.PI) };
  }
  if (cycle < 24) return { distance: .25, yaw, effort: 0 };
  if (cycle < 42) {
    const progress = (cycle - 24) / 18;
    return { distance: .25 * (1 - smooth(progress)), yaw, effort: Math.sin(progress * Math.PI) };
  }
  return { distance: 0, yaw, effort: 0 };
}

export function createOtterResidents({ scene, models, surfaceHeight }) {
  const group = new THREE.Group();
  group.name = 'Otter residents';
  const euler = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const vertex = new THREE.Vector3();
  const companions = COMPANIONS.flatMap(config => {
    const template = models.get(config.variant);
    if (!template) return [];
    const root = new THREE.Group();
    root.name = config.id;
    root.scale.setScalar(config.scale);
    const model = template.clone(true);
    root.add(model);
    group.add(root);
    const joints = new Map();
    model.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
      if (config.habitat === 'water' && (node.name === 'Forepaw_L' || node.name === 'Forepaw_R')) {
        // Embed the fixed shoulder cap in the torso before caching the resting pose.
        node.position.x *= .72;
        node.position.y -= .04 * (config.variant === 'sea-otter-pup' ? .79 : 1);
      }
      if (JOINTS.has(node.name)) joints.set(node.name, {
        node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
      });
    });
    const body = joints.get('Body')?.node ?? model;
    const head = joints.get('Head')?.node ?? body;
    const paws = PAWS.flatMap(name => meshSupport(joints.get(name)?.node));
    return [{
      config, root, joints,
      support: paws.length ? paws : meshSupport(body),
      tailSupport: meshSupport(joints.get('Tail')?.node),
      bodyAnchor: { node: body, center: localCenter(body) },
      headAnchor: { node: head, center: localCenter(head) },
      carePhase: null, careProgress: 0, motionOffset: 0, heldMotionTime: null, grooming: 0,
    }];
  });
  scene.add(group);
  let disposed = false;
  let lastTime = 0;
  let epoch = 0;

  function rotate(companion, name, x = 0, y = 0, z = 0) {
    const joint = companion.joints.get(name);
    if (!joint) return;
    rotation.setFromEuler(euler.set(x, y, z));
    joint.node.quaternion.copy(joint.quaternion).multiply(rotation);
  }

  function lowestClearance(support) {
    let clearance = Infinity;
    for (const { node, vertices } of support) {
      for (let index = 0; index < vertices.count; index++) {
        vertex.fromBufferAttribute(vertices, index).applyMatrix4(node.matrixWorld);
        clearance = Math.min(clearance, vertex.y - surfaceHeight(vertex.x, vertex.z));
      }
    }
    return clearance;
  }

  function ground(companion) {
    companion.root.updateWorldMatrix(true, true);
    const clearance = lowestClearance(companion.support);
    companion.root.position.y = Number.isFinite(clearance) ? .01 - clearance : surfaceHeight(companion.root.position.x, companion.root.position.z);
    const tail = companion.joints.get('Tail');
    if (!tail || !companion.tailSupport.length) return;
    companion.root.updateWorldMatrix(true, true);
    if (lowestClearance(companion.tailSupport) >= .01) return;
    // Lift the tail at its attachment, retaining the paws' existing ground contact.
    const animated = tail.node.quaternion.clone();
    let low = 0, high = .65;
    for (let step = 0; step < 11; step++) {
      const pitch = (low + high) / 2;
      rotation.setFromEuler(euler.set(pitch, 0, 0));
      tail.node.quaternion.copy(animated).multiply(rotation);
      tail.node.updateWorldMatrix(false, true);
      if (lowestClearance(companion.tailSupport) >= .01) high = pitch;
      else low = pitch;
    }
    rotation.setFromEuler(euler.set(high, 0, 0));
    tail.node.quaternion.copy(animated).multiply(rotation);
  }

  function float(companion, time) {
    const { config, root, joints } = companion;
    const wave = time * .23 + config.phase;
    const breath = Math.sin(time * 1.1 + config.phase);
    root.position.set(config.x + .1 * (Math.sin(wave) - Math.sin(config.phase)),
      .015 + .026 * Math.sin(time * .86 + config.phase),
      config.z + .055 * (Math.sin(wave * .8) - Math.sin(config.phase * .8)));
    root.rotation.set(.015 * Math.sin(time * .7 + config.phase),
      config.yaw + .035 * (Math.sin(wave) - Math.sin(config.phase)), .04 * Math.sin(time * .64 + config.phase));
    const body = joints.get('Body');
    if (body) { body.node.scale.x *= 1 + breath * .007; body.node.scale.y *= 1 + breath * .012; }
    rotate(companion, 'Head', .025 * Math.sin(time * .61 + config.phase), .035 * Math.sin(time * .37 + config.phase), .028 * Math.sin(time * .43 + config.phase));
    const cycle = (time + config.phase) % 24;
    const grooming = cycle > 14 && cycle < 18 ? Math.sin((cycle - 14) / 4 * Math.PI) ** 2 : 0;
    companion.grooming = grooming;
    rotate(companion, 'Forepaw_L', breath * .045 - grooming * 1.1, grooming * .12, .065 * Math.sin(time * .65 + config.phase) - grooming * .12);
    rotate(companion, 'Forepaw_R', breath * .04, 0, -.055 * Math.sin(time * .65 + config.phase));
    rotate(companion, 'Hindpaw_L', .028 * Math.sin(time * .72 + config.phase));
    rotate(companion, 'Hindpaw_R', .028 * Math.sin(time * .72 + config.phase + .6));
    rotate(companion, 'Tail', 0, .035 * Math.sin(time * .8 + config.phase));
    const shell = joints.get('Shell');
    if (shell) shell.node.position.y += .014 * Math.sin(time * .65 + config.phase);
    rotate(companion, 'Shell', .022 * Math.sin(time * .65 + config.phase), 0, .025 * Math.sin(time * .53 + config.phase));
  }

  function walk(companion, time, relaxed) {
    const { config, root, joints } = companion;
    const motionTime = companion.heldMotionTime ?? time - companion.motionOffset;
    const motion = walkAt(motionTime);
    root.position.set(config.x + Math.sin(config.yaw) * motion.distance, 0, config.z + Math.cos(config.yaw) * motion.distance);
    root.rotation.set(0, config.yaw + motion.yaw, 0);
    const breath = Math.sin(time * 1.45 + config.phase);
    const body = joints.get('Body');
    if (body) { body.node.scale.x *= 1 + breath * .006; body.node.scale.y *= 1 + breath * .009; }
    const requesting = companion.carePhase === 'requesting' ? 1 : 0;
    const happy = companion.carePhase === 'happy' ? 1 : 0;
    rotate(companion, 'Head', .035 * Math.sin(time * .7 + config.phase) - requesting * .075 - relaxed * .065,
      .085 * Math.sin(time * .38 + config.phase) * (1 - relaxed * .6), relaxed * .065 + .025 * Math.sin(time * .8 + config.phase));
    const effort = motion.effort * (1 - relaxed);
    for (const [index, name] of PAWS.entries()) {
      const paw = joints.get(name);
      const stride = Math.sin(motionTime * 3.1 + config.phase + (index === 1 || index === 2 ? Math.PI : 0));
      rotate(companion, name, stride * .16 * effort);
      if (paw) paw.node.position.y += Math.max(0, stride) * .045 * effort;
    }
    rotate(companion, 'Tail', .025 * Math.sin(time * .7 + config.phase), (.07 + happy * .045) * Math.sin(time * (happy ? 2.4 : .9) + config.phase));
    ground(companion);
  }

  function render(time) {
    for (const companion of companions) {
      for (const joint of companion.joints.values()) {
        joint.node.position.copy(joint.position);
        joint.node.quaternion.copy(joint.quaternion);
        joint.node.scale.copy(joint.scale);
      }
      const relaxed = companion.carePhase === 'happy' ? 1
        : companion.carePhase === 'petting' ? smooth(clamp(companion.careProgress / .2)) : 0;
      if (companion.config.habitat === 'water') float(companion, time);
      else walk(companion, time, relaxed);
      const blinkTime = (time + companion.config.phase * 1.7) % 6.8;
      const blink = blinkTime < .24 ? 1 - .92 * Math.sin(blinkTime / .24 * Math.PI) ** 2 : 1;
      for (const name of ['Eye_L', 'Eye_R']) {
        const eye = companion.joints.get(name);
        if (eye) eye.node.scale.y *= blink * (1 - relaxed * .83);
      }
      companion.root.updateMatrixWorld(true);
    }
  }

  function update(time) {
    if (disposed || !Number.isFinite(time) || time < 0) return;
    if (time < lastTime) {
      if (time < epoch) epoch = 0;
      for (const companion of companions) {
        companion.motionOffset = 0;
        if (companion.heldMotionTime !== null) companion.heldMotionTime = time - epoch;
      }
    }
    lastTime = time;
    render(time - epoch);
  }

  function reset() {
    if (disposed) return;
    epoch = lastTime;
    for (const companion of companions) {
      Object.assign(companion, { carePhase: null, careProgress: 0, motionOffset: 0, heldMotionTime: null, grooming: 0 });
    }
    render(0);
  }

  function setPettingState(state) {
    if (disposed) return;
    const selected = state?.id === 'otter-river' && CARE_PHASES.has(state.phase);
    for (const companion of companions) {
      const phase = selected && companion.config.id === state.id ? state.phase : null;
      const holding = phase === 'petting' || phase === 'happy';
      if (holding && companion.heldMotionTime === null) companion.heldMotionTime = lastTime - epoch - companion.motionOffset;
      if (!holding && companion.heldMotionTime !== null) {
        companion.motionOffset = lastTime - epoch - companion.heldMotionTime;
        companion.heldMotionTime = null;
      }
      companion.carePhase = phase;
      companion.careProgress = phase && Number.isFinite(state.progress) ? clamp(state.progress) : 0;
    }
  }

  render(0);
  return {
    update,
    reset,
    setPettingState,
    interactionTargets() {
      if (disposed) return [];
      group.updateWorldMatrix(true, true);
      return companions.filter(companion => companion.config.habitat === 'beach').map(({ config, root, bodyAnchor, headAnchor }) => ({
        id: config.id, variant: config.variant,
        position: bodyAnchor.node.localToWorld(bodyAnchor.center.clone()),
        headPosition: headAnchor.node.localToWorld(headAnchor.center.clone()),
        radius: 1.12 * Math.max(...root.getWorldScale(new THREE.Vector3()).toArray().map(Math.abs)),
      }));
    },
    snapshot() {
      return disposed ? [] : companions.map(({ config, root, joints, carePhase, grooming }) => ({
        id: config.id, variant: config.variant, species: config.species, habitat: config.habitat, behavior: config.behavior,
        x: root.position.x, y: root.position.y, z: root.position.z, yaw: root.rotation.y, carePhase, grooming,
        joints: Object.fromEntries([...joints].map(([name, { node }]) => [name, {
          position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray(),
        }])),
      }));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      companions.length = 0;
    },
  };
}
