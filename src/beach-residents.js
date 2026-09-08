import * as THREE from 'three';

const RESIDENTS = [
  { variant: 'harp-pup', behavior: 'resting', x: -4, z: -18, yaw: -.48, scale: 1.48, roll: -.26, phase: .7 },
  { variant: 'harbor-adult', behavior: 'crawling', x: .3, z: -18.6, yaw: .82, scale: 1.42, roll: 0, phase: 3.2 },
  { variant: 'weddell-elder', behavior: 'resting', x: 4.3, z: -19.5, yaw: .6, scale: 1.38, roll: .18, phase: 2.4 },
  { variant: 'grey-adult', behavior: 'crawling', x: -9, z: -21, yaw: -1.02, scale: 1.32, roll: 0, phase: 10.1 },
  { variant: 'ringed-adult', behavior: 'resting', x: 9, z: -20, yaw: -.88, scale: 1.45, roll: .6, phase: 4.6 },
];
const JOINTS = new Set(['Head', 'Jaw', 'Eye_L', 'Eye_R', 'Flipper_L', 'Flipper_R', 'RearFlipper_L', 'RearFlipper_R']);
const smooth = value => value * value * value * (value * (value * 6 - 15) + 10);
const turn = new THREE.Euler();
const rotation = new THREE.Quaternion();
const inverseParent = new THREE.Matrix4();
const CONTACT_JOINTS = ['Head', 'Flipper_L', 'Flipper_R', 'RearFlipper_L', 'RearFlipper_R'];

function crawlAt(time, phase) {
  const cycle = ((time * .85 + phase) % 40 + 40) % 40;
  if (cycle < 14) return { distance: -.52 + 1.04 * smooth(cycle / 14), yaw: 0, effort: Math.sin(cycle / 14 * Math.PI) };
  if (cycle < 20) return { distance: .52, yaw: Math.PI * smooth((cycle - 14) / 6), effort: 0 };
  if (cycle < 34) return { distance: .52 - 1.04 * smooth((cycle - 20) / 14), yaw: Math.PI, effort: Math.sin((cycle - 20) / 14 * Math.PI) };
  return { distance: -.52, yaw: Math.PI + Math.PI * smooth((cycle - 34) / 6), effort: 0 };
}

function rotateJoint(joints, name, x = 0, y = 0, z = 0) {
  const joint = joints.get(name);
  if (!joint) return;
  rotation.setFromEuler(turn.set(x, y, z));
  joint.node.quaternion.copy(joint.quaternion).multiply(rotation);
}

function meshSupport(model) {
  const meshes = [];
  model.traverse(node => {
    if (node.isMesh && node.geometry.getAttribute('position')) meshes.push(node);
  });
  return meshes.map(node => ({ node, vertices: node.geometry.getAttribute('position') }));
}

function lowestClearance(support, surfaceHeight) {
  let lowest = Infinity;
  // Read the belly vertices directly: creating shared geometry bounding boxes would mutate the templates.
  for (const { node, vertices } of support) {
    const m = node.matrixWorld.elements;
    for (let index = 0; index < vertices.count; index += 1) {
      const x = vertices.getX(index), y = vertices.getY(index), z = vertices.getZ(index);
      const worldX = m[0] * x + m[4] * y + m[8] * z + m[12];
      const worldY = m[1] * x + m[5] * y + m[9] * z + m[13];
      const worldZ = m[2] * x + m[6] * y + m[10] * z + m[14];
      lowest = Math.min(lowest, worldY - surfaceHeight(worldX, worldZ));
    }
  }
  return lowest;
}

export function createBeachResidents({ scene, models, surfaceHeight }) {
  const group = new THREE.Group();
  group.name = 'Beach residents';
  const residents = RESIDENTS.flatMap((config, index) => {
    const template = models.get(config.variant);
    if (!template) return [];
    const root = new THREE.Group();
    root.name = `beach-resident-${index + 1}`;
    root.scale.setScalar(config.scale);
    const pose = new THREE.Group();
    const model = template.clone(true);
    const joints = new Map();
    model.traverse(node => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
      if (JOINTS.has(node.name)) joints.set(node.name, { node, quaternion: node.quaternion.clone(), scale: node.scale.clone(), position: node.position.clone(), support: meshSupport(node) });
    });
    pose.add(model);
    root.add(pose);
    group.add(root);
    const meshes = meshSupport(model);
    const bodies = meshes.filter(({ node }) => /body|torso/i.test(node.name));
    return [{ config, root, pose, joints, support: bodies.length ? bodies : meshes, headPitch: -1.38 }];
  });
  scene.add(group);
  let disposed = false;

  function update(time) {
    if (disposed || !Number.isFinite(time)) return;
    for (const resident of residents) {
      const { config, root, pose, joints, support } = resident;
      for (const joint of joints.values()) joint.node.position.copy(joint.position);
      const crawling = config.behavior === 'crawling';
      const motion = crawling ? crawlAt(time, config.phase) : { distance: 0, yaw: 0, effort: 0 };
      const breath = Math.sin(time * 1.45 + config.phase);
      const stride = time * 2.15 + config.phase;
      const pull = Math.sin(stride) * motion.effort;
      const x = config.x + Math.sin(config.yaw) * motion.distance;
      const z = config.z + Math.cos(config.yaw) * motion.distance;
      root.position.set(x, 0, z);
      root.rotation.y = config.yaw + motion.yaw;
      // Local +Y is the seal's long axis; this pitch lays it along the beach, with a small shoulder lift.
      pose.rotation.set(1.48 + pull * .025, config.roll + breath * .008, 0);
      pose.scale.set(1 + breath * .009, 1 + pull * .018, 1 + breath * .018);
      resident.headPitch = -1.38 + Math.sin(time * .63 + config.phase) * .035 - pull * .025;
      rotateJoint(joints, 'Head', resident.headPitch, Math.sin(time * .31 + config.phase) * .12, -config.roll * .18);
      rotateJoint(joints, 'Jaw', .006 + Math.max(0, breath) * .008);
      rotateJoint(joints, 'Flipper_L', -.48 + pull * .16, -.17 - Math.max(0, config.roll) * 1.6, -.24 + Math.cos(stride) * motion.effort * .18);
      rotateJoint(joints, 'Flipper_R', -.48 - pull * .16, .17 + Math.max(0, -config.roll) * 1.6, .24 + Math.cos(stride) * motion.effort * .18);
      rotateJoint(joints, 'RearFlipper_L', -1.9, -.13 + Math.sin(stride + .7) * (.018 + motion.effort * .09), -.06);
      rotateJoint(joints, 'RearFlipper_R', -1.9, .13 + Math.sin(stride - .7) * (.018 + motion.effort * .09), .06);
      for (const name of ['RearFlipper_L', 'RearFlipper_R']) {
        const fin = joints.get(name);
        if (fin) {
          fin.node.position.copy(fin.position);
          fin.node.position.y -= .18;
          fin.node.position.z += .55;
        }
      }
      const blinkTime = ((time + config.phase * 1.7) % 6.3 + 6.3) % 6.3;
      const blink = blinkTime < .22 ? 1 - .91 * Math.sin(blinkTime / .22 * Math.PI) ** 2 : 1;
      for (const name of ['Eye_L', 'Eye_R']) {
        const eye = joints.get(name);
        if (eye) {
          eye.node.scale.copy(eye.scale);
          eye.node.scale.y *= blink * (crawling ? 1 : .72);
        }
      }
      root.updateMatrixWorld(true);
      const clearance = lowestClearance(support, surfaceHeight);
      root.position.y = Number.isFinite(clearance) ? -clearance + .012 : surfaceHeight(x, z) + .6;
      root.updateMatrixWorld(true);
      for (const name of CONTACT_JOINTS) {
        const joint = joints.get(name);
        if (!joint || !joint.support.length) continue;
        const lift = .012 - lowestClearance(joint.support, surfaceHeight);
        if (lift <= 0) continue;
        // Move only the low joint, keeping the belly in contact instead of floating the entire seal.
        const m = inverseParent.copy(joint.node.parent.matrixWorld).invert().elements;
        joint.node.position.x += m[4] * lift;
        joint.node.position.y += m[5] * lift;
        joint.node.position.z += m[6] * lift;
        joint.node.updateMatrixWorld(true);
      }
    }
  }

  update(0);
  return {
    update,
    snapshot() {
      return Object.freeze(disposed ? [] : residents.map(({ config, root, pose, headPitch }) => Object.freeze({
        id: root.name,
        variant: config.variant,
        behavior: config.behavior,
        x: root.position.x,
        y: root.position.y,
        z: root.position.z,
        bodyPitch: pose.rotation.x,
        headPitch,
      })));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      residents.length = 0;
    },
  };
}
