import * as THREE from 'three';
import { shorelineZ } from './beach.js';
import { ROAMING_TIMING, createRoamingSchedule, advanceRoamingSchedule } from './roaming-logic.js';

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
const CARE_PHASES = new Set(['requesting', 'petting', 'happy']);
const unit = value => THREE.MathUtils.clamp(value, 0, 1);
const turnToward = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

function beachPlacement(config, time) {
  const motion = config.behavior === 'crawling' ? crawlAt(time, config.phase) : { distance: 0, yaw: 0, effort: 0 };
  return { x: config.x + Math.sin(config.yaw) * motion.distance, z: config.z + Math.cos(config.yaw) * motion.distance, yaw: config.yaw + motion.yaw, effort: motion.effort, motionTime: time, swimming: 0 };
}

function waterPlacement(config, time) {
  const wave = time * .25;
  return { x: config.x + .24 * Math.sin(wave), z: -10.95 + .12 * (Math.sin(wave + .6) - Math.sin(.6)), yaw: config.yaw + .14 * Math.sin(wave), effort: 0, motionTime: time, swimming: 1 };
}

function travelPlacement(trip, progress) {
  const amount = smooth(unit((progress - .14) / .72));
  const settling = smooth(unit((progress - .86) / .14));
  const x = THREE.MathUtils.lerp(trip.from.x, trip.to.x, amount);
  const z = THREE.MathUtils.lerp(trip.from.z, trip.to.z, amount);
  const heading = Math.atan2(trip.to.x - trip.from.x, trip.to.z - trip.from.z);
  const departureTurn = turnToward(trip.from.yaw, heading, smooth(unit(progress / .14)));
  const yaw = turnToward(departureTurn, trip.to.yaw, settling);
  const swimming = smooth(unit((z - shorelineZ(x) + 1) / 2.3));
  const effort = THREE.MathUtils.lerp(trip.from.effort, .68 * (1 - swimming), smooth(unit(progress / .14)));
  // Match the destination gait during the final turn without rewinding multiple stride cycles.
  const landingPhase = turnToward((trip.from.motionTime + .86 * ROAMING_TIMING.travel) * 2.15, trip.to.motionTime * 2.15, 1);
  const motionTime = THREE.MathUtils.lerp((trip.from.motionTime + progress * ROAMING_TIMING.travel) * 2.15, landingPhase, settling) / 2.15;
  return { x, z, yaw, effort: THREE.MathUtils.lerp(effort, trip.to.effort, settling), motionTime, swimming };
}

function roamingPlacement(resident) {
  if (resident.trip) return travelPlacement(resident.trip, resident.travelProgress);
  return resident.habitat === 'water' ? waterPlacement(resident.config, resident.waterTime) : beachPlacement(resident.config, resident.beachTime);
}

function shorelineCrossing(trip) {
  let low = 0, high = 1;
  for (let step = 0; step < 32; step += 1) {
    const middle = (low + high) / 2;
    const position = travelPlacement(trip, middle);
    if ((position.z > shorelineZ(position.x)) === trip.startedInWater) low = middle;
    else high = middle;
  }
  const progress = (low + high) / 2;
  return { progress, ...travelPlacement(trip, progress) };
}

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

function supportCenter(anchor, support) {
  anchor.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  const inverse = anchor.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  for (const { node, vertices } of support) {
    matrix.multiplyMatrices(inverse, node.matrixWorld);
    for (let index = 0; index < vertices.count; index += 1) {
      bounds.expandByPoint(vertex.fromBufferAttribute(vertices, index).applyMatrix4(matrix));
    }
  }
  return bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
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

export function createBeachResidents({ scene, models, surfaceHeight, random = Math.random }) {
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
    const support = bodies.length ? bodies : meshes;
    const body = model.getObjectByName('Body');
    const head = joints.get('Head');
    return [{
      config, root, pose, joints, support, headPitch: -1.38,
      bodyAnchor: { node: body ?? model, center: body ? new THREE.Vector3() : supportCenter(model, support) },
      headAnchor: head ? { node: head.node, center: supportCenter(head.node, head.support) } : null,
      carePhase: null, careProgress: 0, motionOffset: 0, heldMotionTime: null,
      habitat: 'beach', settledFor: 0, beachTime: 0, waterTime: 0, trip: null, travelProgress: 0,
    }];
  });
  scene.add(group);
  let disposed = false;
  let lastTime = 0;
  let roamingEnabled = false;
  let roaming = createRoamingSchedule();
  let roamingHistory = [];

  function resetRoaming(enabled) {
    if (disposed) return;
    roamingEnabled = enabled;
    roaming = createRoamingSchedule();
    roamingHistory = [];
    for (const resident of residents) {
      Object.assign(resident, { carePhase: null, careProgress: 0, motionOffset: 0, heldMotionTime: null, habitat: 'beach', settledFor: 0, beachTime: 0, waterTime: 0, trip: null, travelProgress: 0 });
    }
    if (enabled) {
      const swimmer = residents.find(resident => resident.root.name === 'beach-resident-2') ?? residents[0];
      if (swimmer) swimmer.habitat = 'water';
    }
    update(0);
  }

  function updateRoaming(dt, visibleIds = []) {
    if (disposed || !roamingEnabled || !Number.isFinite(dt) || dt <= 0) return [];
    const events = [];
    const now = roaming.elapsed + dt;
    const emit = (type, resident, trip, at, position) => events.push({ type, id: resident.root.name, direction: trip.direction, at, x: position.x, z: position.z });
    for (const resident of residents) {
      if (!resident.trip) {
        resident.settledFor += dt;
        if (resident.habitat === 'water') resident.waterTime += dt;
        else if (resident.heldMotionTime === null) resident.beachTime += dt;
        continue;
      }
      const trip = resident.trip;
      resident.travelProgress = unit((now - trip.at) / ROAMING_TIMING.travel);
      if (!trip.crossed && resident.travelProgress >= trip.crossing.progress) {
        trip.crossed = true;
        emit('shore-cross', resident, trip, trip.at + trip.crossing.progress * ROAMING_TIMING.travel, trip.crossing);
      }
      if (resident.travelProgress < 1 - 1e-9) continue;
      const arrivedAt = trip.at + ROAMING_TIMING.travel;
      const remainder = Math.max(0, now - arrivedAt);
      resident.habitat = trip.direction === 'to-beach' ? 'beach' : 'water';
      resident.settledFor = remainder;
      resident.beachTime = resident.habitat === 'beach' ? remainder : 0;
      resident.waterTime = resident.habitat === 'water' ? remainder : 0;
      resident.trip = null;
      resident.travelProgress = 0;
      emit('arrive', resident, trip, arrivedAt, trip.to);
    }
    const visible = new Set(visibleIds);
    const candidates = residents.map(resident => ({ id: resident.root.name, habitat: resident.habitat, busy: resident.carePhase !== null, visible: visible.has(resident.root.name), settledFor: resident.settledFor }));
    // Admit one departure after advancing existing trips; long frames never replay missed journeys.
    for (const event of advanceRoamingSchedule(roaming, dt, candidates, random)) {
      const resident = residents.find(value => value.root.name === event.id);
      const from = roamingPlacement(resident);
      const to = event.direction === 'to-beach' ? beachPlacement(resident.config, 0) : waterPlacement(resident.config, 0);
      resident.trip = { direction: event.direction, at: event.at, from, to, startedInWater: from.z > shorelineZ(from.x), crossed: false };
      resident.trip.crossing = shorelineCrossing(resident.trip);
      resident.habitat = 'travel';
      resident.travelProgress = 0;
      emit('depart', resident, resident.trip, event.at, from);
    }
    roamingHistory = [...roamingHistory, ...events].slice(-8);
    return events;
  }

  function setPettingState(state) {
    if (disposed) return;
    const selected = CARE_PHASES.has(state?.phase) ? residents.find(resident => resident.root.name === state.id && resident.habitat === 'beach') : null;
    for (const resident of residents) {
      const phase = resident === selected ? state.phase : null;
      const holding = phase === 'petting' || phase === 'happy';
      // Pause the path clock, so a crawler resumes where it was touched instead of catching up.
      if (holding && resident.heldMotionTime === null) resident.heldMotionTime = lastTime - resident.motionOffset;
      if (!holding && resident.heldMotionTime !== null) {
        resident.motionOffset = lastTime - resident.heldMotionTime;
        resident.heldMotionTime = null;
      }
      resident.carePhase = phase;
      resident.careProgress = resident === selected && Number.isFinite(state.progress) ? THREE.MathUtils.clamp(state.progress, 0, 1) : 0;
    }
  }

  function update(time) {
    if (disposed || !Number.isFinite(time)) return;
    if (time < lastTime) {
      for (const resident of residents) {
        resident.motionOffset = 0;
        if (resident.heldMotionTime !== null) resident.heldMotionTime = time;
      }
    }
    lastTime = time;
    for (const resident of residents) {
      const { config, root, pose, joints, support } = resident;
      for (const joint of joints.values()) joint.node.position.copy(joint.position);
      const crawling = config.behavior === 'crawling';
      const motionTime = roamingEnabled ? resident.beachTime : resident.heldMotionTime ?? time - resident.motionOffset;
      const motion = crawling ? crawlAt(motionTime, config.phase) : { distance: 0, yaw: 0, effort: 0 };
      const placement = roamingEnabled ? roamingPlacement(resident) : null;
      const swimming = placement?.swimming ?? 0;
      const requesting = resident.carePhase === 'requesting' ? 1 : 0;
      const petting = resident.carePhase === 'petting' ? smooth(Math.min(1, resident.careProgress / .18)) : 0;
      const happy = resident.carePhase === 'happy' ? 1 : 0;
      const relaxed = Math.max(petting, happy);
      const rub = Math.sin(resident.careProgress * Math.PI * 6) * petting;
      const wiggle = Math.sin(time * 3.8 + config.phase) * happy;
      const breath = Math.sin(time * 1.45 + config.phase);
      const stride = (placement?.motionTime ?? motionTime) * 2.15 + config.phase;
      const effort = (placement?.effort ?? motion.effort) * (1 - relaxed * .9);
      const pull = Math.sin(stride) * effort;
      const x = placement?.x ?? config.x + Math.sin(config.yaw) * motion.distance;
      const z = placement?.z ?? config.z + Math.cos(config.yaw) * motion.distance;
      root.position.set(x, 0, z);
      root.rotation.y = placement?.yaw ?? config.yaw + motion.yaw;
      // Local +Y is the seal's long axis; this pitch lays it along the beach, with a small shoulder lift.
      pose.rotation.set(1.48 + pull * .025 - requesting * .015 - relaxed * .018, config.roll + breath * .008 + petting * .035 + happy * .04 + wiggle * .018, 0);
      pose.rotation.x = THREE.MathUtils.lerp(pose.rotation.x, 1.52 + Math.sin(time * 1.3 + config.phase) * .014, swimming);
      pose.rotation.y *= 1 - swimming;
      pose.scale.set(1 + breath * (.009 + relaxed * .005), 1 + pull * .018, 1 + breath * (.018 + relaxed * .009));
      resident.headPitch = -1.38 + Math.sin(time * .63 + config.phase) * .035 - pull * .025 - requesting * .065 - petting * .045 - happy * .07 + rub * .02;
      resident.headPitch = THREE.MathUtils.lerp(resident.headPitch, -1.24 + Math.sin(time * 1.1 + config.phase) * .025, swimming);
      rotateJoint(joints, 'Head', resident.headPitch, Math.sin(time * .31 + config.phase) * .12 * (1 - relaxed * .65) + rub * .045, -config.roll * .18 + relaxed * .04 + wiggle * .022);
      rotateJoint(joints, 'Jaw', (.006 + Math.max(0, breath) * .008) * (1 - relaxed * .8));
      rotateJoint(joints, 'Flipper_L', -.48 + pull * .16 + relaxed * .08 + wiggle * .045, -.17 - Math.max(0, config.roll) * 1.6, -.24 + Math.cos(stride) * effort * .18 + relaxed * .045);
      rotateJoint(joints, 'Flipper_R', -.48 - pull * .16 + relaxed * .08 - wiggle * .045, .17 + Math.max(0, -config.roll) * 1.6, .24 + Math.cos(stride) * effort * .18 - relaxed * .045);
      const swimKick = swimming * Math.sin(time * 2.4 + config.phase) * .08;
      rotateJoint(joints, 'RearFlipper_L', -1.9 + swimming * .12 + swimKick, -.13 + Math.sin(stride + .7) * (.018 + effort * .09), -.06);
      rotateJoint(joints, 'RearFlipper_R', -1.9 + swimming * .12 - swimKick, .13 + Math.sin(stride - .7) * (.018 + effort * .09), .06);
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
          eye.node.scale.y *= blink * (crawling ? 1 : .72) * (1 - petting * .87 - happy * .8);
        }
      }
      root.updateMatrixWorld(true);
      const clearance = lowestClearance(support, surfaceHeight);
      root.position.y = Number.isFinite(clearance) ? -clearance + .012 : surfaceHeight(x, z) + .6;
      if (swimming > 0) {
        const floatingY = -lowestClearance(support, () => -.7 + Math.sin(time * 1.4 + config.phase) * .025);
        root.position.y += Math.max(0, floatingY - root.position.y) * swimming;
      }
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
    setPettingState,
    startRoaming() { resetRoaming(true); },
    stopRoaming() { resetRoaming(false); },
    updateRoaming,
    roamingSnapshot() {
      return Object.freeze({ enabled: roamingEnabled && !disposed, elapsed: roaming.elapsed, nextAt: roaming.nextAt, started: roaming.started, activeId: residents.find(resident => resident.trip)?.root.name ?? null, lastDepartureAt: roaming.lastDepartureAt, history: Object.freeze(roamingHistory.map(event => Object.freeze({ ...event }))) });
    },
    interactionTargets() {
      if (disposed) return [];
      group.updateWorldMatrix(true, true);
      return residents.filter(resident => resident.habitat === 'beach').map(({ config, root, bodyAnchor, headAnchor }) => {
        const position = bodyAnchor.node.localToWorld(bodyAnchor.center.clone());
        const headPosition = headAnchor ? headAnchor.node.localToWorld(headAnchor.center.clone()) : position.clone();
        const scale = root.getWorldScale(new THREE.Vector3());
        return { id: root.name, variant: config.variant, position, headPosition, radius: 1.15 * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) };
      });
    },
    snapshot() {
      return Object.freeze(disposed ? [] : residents.map(({ config, root, pose, headPitch, carePhase, habitat, trip, travelProgress, settledFor }) => Object.freeze({
        id: root.name,
        variant: config.variant,
        behavior: config.behavior,
        x: root.position.x,
        y: root.position.y,
        z: root.position.z,
        bodyPitch: pose.rotation.x,
        headPitch,
        carePhase,
        habitat,
        travelDirection: trip?.direction ?? null,
        travelProgress,
        settledFor,
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
