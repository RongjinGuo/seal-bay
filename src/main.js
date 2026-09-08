import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld, createFish } from './world.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { createBeachResidents } from './beach-residents.js';
import { createPetting } from './petting.js';
import { createRoamingFeedback } from './roaming-feedback.js';
import { createUI, readStored, storeValue } from './ui.js';
import { computeThrow, trajectoryPoint, createVisitor, advanceVisitor, feedVisitor, findCatch, pickSpawn, STATE_DURATIONS } from './logic.js';

const container = document.getElementById('game');
let world;
try { world = createWorld(container); } catch (error) { fatal('浏览器未能启动三维画面。请使用支持 WebGL 的最新版 Chrome、Edge 或 Safari。'); throw error; }
const { scene, camera, renderer } = world;
const effects = new Effects(scene);
const audio = new GameAudio();
let muted = readStored('muted', false);
audio.setMuted(muted);
const models = new Map();
let beachResidents;
let petting;
let roamingFeedback;
let manifest = [];
let mode = 'relax';
let status = 'intro';
let paused = false;
let elapsed = 0;
let worldTime = 0;
let spawnTime = 0;
let idCounter = 0;
let score = 0;
let throwCount = 0;
let combo = 0;
let bestCombo = 0;
let lastThrowTime = -10;
let gesture = null;
let actors = [];
let projectiles = [];
const origin = new THREE.Vector3(0, 1.65, 8);
const projection = new THREE.Vector3();
const ui = createUI({
  onStart: startGame,
  onHome: goHome,
  onSound: async () => {
    if (!audio.context) muted = false; else muted = !muted;
    audio.setMuted(muted);
    storeValue('muted', muted);
    if (!muted) await audio.unlock();
    ui.sound(!muted && audio.context !== null);
    if (audio.status === 'unavailable') ui.notice('声音暂时没有加载成功，投喂可以继续');
  },
  onModal: (open, kind) => {
    cancelGesture();
    petting?.setPaused(open);
    if (open) roamingFeedback?.hide();
    if (open) { paused = true; audio.setPaused(status !== 'results'); }
    else {
      paused = false;
      audio.setPaused(false);
      if (kind === 'results' && status === 'results') goHome();
    }
  },
});

const aimGroup = new THREE.Group();
const aimPoints = new Float32Array(24 * 3);
const aimGeometry = new THREE.BufferGeometry();
aimGeometry.setAttribute('position', new THREE.BufferAttribute(aimPoints, 3));
const aimDots = new THREE.Points(aimGeometry, new THREE.PointsMaterial({ color: '#fff7d8', size: .068, transparent: true, opacity: .8, depthWrite: false }));
aimGroup.add(aimDots);
const targetRing = new THREE.Mesh(new THREE.RingGeometry(.53, .57, 48), new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
targetRing.rotation.x = -Math.PI / 2;
aimGroup.add(targetRing);
aimGroup.visible = false;
scene.add(aimGroup);

function fatal(message) {
  document.getElementById('fatal').hidden = false;
  document.getElementById('fatal-message').textContent = message;
}
function scaleFor(meta) {
  if (meta.id === 'harp-pup') return .88;
  if (meta.id === 'harbor-pup') return .86;
  if (meta.id === 'grey-adult') return 1.17;
  if (meta.id === 'weddell-elder') return 1.13;
  if (meta.id === 'ringed-adult') return .93;
  return 1;
}
function spawn(meta, position, demo = false) {
  const root = new THREE.Group();
  const model = models.get(meta.id).clone(true);
  root.add(model);
  const size = scaleFor(meta) * 1.13;
  root.scale.setScalar(size);
  root.position.set(position.x, -2.5, position.z);
  scene.add(root);
  const visitor = createVisitor({ id: ++idCounter, x: position.x, z: position.z, variant: meta.id, size, patience: mode === 'challenge' ? 8 + Math.random() * 4 : 11 + Math.random() * 6 });
  if (demo) { visitor.state = 'waiting'; visitor.canCatch = true; }
  const label = document.createElement('div');
  label.className = 'seal-label';
  label.innerHTML = '<span class="seal-bubble"></span><span class="patience"><i></i></span>';
  document.getElementById('seal-labels').appendChild(label);
  const nodes = {};
  model.traverse(node => {
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = false; }
    if (['Head', 'Flipper_L', 'Flipper_R', 'Jaw', 'Eye_L', 'Eye_R'].includes(node.name)) nodes[node.name] = { node, rotation: node.rotation.clone(), scale: node.scale.clone(), quaternion: node.quaternion.clone() };
  });
  const footprint = new THREE.Mesh(new THREE.CircleGeometry(.92, 40), new THREE.MeshBasicMaterial({ color: '#255953', transparent: true, opacity: .2, depthWrite: false }));
  footprint.rotation.x = -Math.PI / 2;
  footprint.position.set(visitor.x, .048, visitor.z);
  footprint.scale.set(size, size * .65, 1);
  scene.add(footprint);
  const waterline = new THREE.Mesh(new THREE.RingGeometry(.65, .68, 48), new THREE.MeshBasicMaterial({ color: '#daeddc', transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false }));
  waterline.rotation.x = -Math.PI / 2;
  waterline.position.set(visitor.x, .055, visitor.z);
  scene.add(waterline);
  const mouthFish = createFish();
  mouthFish.visible = false;
  mouthFish.scale.setScalar(.7);
  root.add(mouthFish);
  mouthFish.position.set(0, 1.10, .75);
  const actor = { visitor, root, model, meta, nodes, label, footprint, waterline, phase: Math.random() * Math.PI * 2, demo, lastState: '', mouthFish, secondCallPlayed: false };
  actors.push(actor);
  if (!demo) effects.ripple(position.x, position.z, .7);
  return actor;
}
function removeActor(actor) {
  scene.remove(actor.root, actor.footprint, actor.waterline);
  actor.footprint.geometry.dispose();
  actor.footprint.material.dispose();
  actor.waterline.geometry.dispose();
  actor.waterline.material.dispose();
  disposeFish(actor.mouthFish);
  actor.label.remove();
}
function disposeFish(fish) {
  fish.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
}
function clearGame() {
  cancelGesture();
  petting?.stop();
  beachResidents?.stopRoaming();
  roamingFeedback?.reset();
  actors.forEach(removeActor);
  actors = [];
  projectiles.forEach(item => { scene.remove(item.mesh); disposeFish(item.mesh); });
  projectiles = [];
  effects.clear();
}
function demoBay() {
  clearGame();
  if (!manifest.length) return;
  const positions = world.isPortrait
    ? [{ x: -1.8, z: -4.5 }, { x: 2.1, z: -5.5 }, { x: 3, z: -10.8 }, { x: -2.5, z: -10 }]
    : [{ x: 2.4, z: 2 }, { x: 5.1, z: -2.5 }, { x: -.3, z: -4.3 }, { x: 2.7, z: -9.1 }];
  [2, 0, 7, 6].forEach((index, i) => spawn(manifest[index], positions[i], true));
}
async function startGame(selectedMode = mode) {
  if (!manifest.length || models.size !== manifest.length) return;
  mode = selectedMode;
  clearGame();
  status = 'playing';
  paused = false;
  elapsed = 0; spawnTime = 2.4; score = 0; throwCount = 0; combo = 0; bestCombo = 0; lastThrowTime = -10;
  ui.setPlaying(true, mode);
  ui.stats(0, mode === 'challenge' ? 120 : 0, 0);
  beachResidents?.startRoaming();
  petting?.start();
  audio.setPaused(false);
  const soundReady = audio.unlock();
  ui.sound(!muted);
  const positions = world.isPortrait
    ? [{ x: 0, z: 2.5 }, { x: -2.9, z: -2.2 }, { x: 2.8, z: -6.6 }]
    : [{ x: 0, z: 2.4 }, { x: -4.1, z: -2 }, { x: 4.4, z: -5.4 }];
  [2, 0, 6].forEach((index, i) => { const actor = spawn(manifest[index], positions[i]); actor.visitor.stateTime = i === 0 ? .5 : 0; });
  ui.notice('先试试近处的糯米：向上轻轻一划');
  await soundReady;
  if (audio.status === 'unavailable') ui.notice('海豹叫声加载失败，投喂仍然可以继续');
}
function goHome() {
  status = 'intro'; paused = false;
  ui.setPlaying(false);
  ui.power(0, false);
  audio.setPaused(false);
  demoBay();
}
function finish() {
  status = 'results';
  cancelGesture();
  petting?.stop();
  beachResidents?.stopRoaming();
  roamingFeedback?.reset();
  audio.celebrate();
  ui.results({ score, throws: throwCount, bestCombo });
}
function stateText(actor) {
  const { state } = actor.visitor;
  if (actor.demo) return actor.meta.id === 'harp-pup' ? '今天的小鱼，会是我的嘛？' : actor.meta.name;
  if (state === 'calling') return ['嗷呜～我的鱼呢？', '这里这里！肚子饿啦'][actor.visitor.id % 2];
  if (state === 'angry') return '哼，要生气了！';
  if (state === 'eating') return ['吧唧吧唧，好香！', '咬住！是我的啦'][actor.visitor.id % 2];
  if (state === 'happy') return '还想再见到你 ♡';
  return actor.meta.name;
}
function applyRotation(actor, name, x = 0, y = 0, z = 0) {
  const part = actor.nodes[name];
  if (!part) return;
  part.node.rotation.set(part.rotation.x + x, part.rotation.y + y, part.rotation.z + z, part.rotation.order);
}
function animateActor(actor, dt) {
  const { visitor: v, root, nodes, phase, meta } = actor;
  if (!actor.demo) {
    for (const event of advanceVisitor(v, dt)) {
      if (event === 'call') { audio.call({ age: meta.age, species: meta.species, x: v.x / 7 }); effects.ripple(v.x, v.z, .95); }
      if (event === 'dive') { effects.splash(v.x, v.z, v.fed ? .7 : 1.15); audio.splash(.45); if (!v.fed) combo = 0; }
      if (event === 'surface') effects.ripple(v.x, v.z, .7);
    }
  }
  const t = worldTime;
  let y = Math.sin(t * 1.7 + phase) * .055 - .12;
  let pitch = .025 * Math.sin(t * 1.35 + phase);
  let headTilt = .04 * Math.sin(t * .83 + phase);
  let headNod = -.025;
  let flipper = .075 * Math.sin(t * 1.4 + phase);
  let jaw = 0;
  const p = v.stateTime;
  if (v.state === 'emerging') {
    const progress = Math.min(1, p / STATE_DURATIONS.emerging);
    y -= (1 - progress) ** 2 * 2.55;
    pitch -= Math.sin(progress * Math.PI) * .12;
  } else if (v.state === 'calling') {
    headNod = -.14 + Math.sin(t * 5) * .045;
    // The selected two-second recording has a call pulse about every 220 ms.
    const callTime = p < 2.2 ? p : p - 2.2;
    jaw = callTime < 2 ? (Math.sin(callTime * Math.PI * 2 / .22) * .5 + .5) * .28 : 0;
    flipper = Math.sin(p * 6) * .22;
    y += Math.sin(p * 5) * .045;
    if (p > 2.2 && !actor.secondCallPlayed) {
      actor.secondCallPlayed = true;
      audio.call({ age: meta.age, x: v.x / 7 });
    }
  } else if (v.state === 'angry') {
    headTilt = Math.sin(p * 12) * .1;
    headNod = .12;
    flipper = -.15;
    pitch = .035;
  } else if (v.state === 'eating') {
    headNod = Math.sin(p * 12) * .025;
    jaw = (Math.sin(p * 18) * .5 + .5) * .14;
    y += Math.sin(Math.min(1, p / .35) * Math.PI) * .13;
    flipper = .16;
  } else if (v.state === 'happy') {
    flipper = -.35 + Math.sin(p * 9) * .32;
    headTilt = Math.sin(p * 3) * .13;
    y += .07 + Math.sin(p * 5) * .07;
  } else if (v.state === 'diving') {
    const progress = p / STATE_DURATIONS.diving;
    y -= progress * progress * 3.4;
    pitch = Math.sin(progress * Math.PI / 2) * 1.05;
    flipper = -.1 + progress * .55;
  }
  root.position.set(v.x, y, v.z);
  root.rotation.set(pitch, -Math.atan2(v.x, 14 - v.z) * .6, Math.sin(t * .7 + phase) * .015);
  root.scale.set(v.size * (1 + Math.sin(t * 2 + phase) * .008), v.size, v.size);
  applyRotation(actor, 'Head', headNod, 0, headTilt);
  applyRotation(actor, 'Flipper_L', 0, -.1, flipper);
  applyRotation(actor, 'Flipper_R', 0, .1, -flipper);
  applyRotation(actor, 'Jaw', jaw);
  const blinkCycle = (t + phase * 3) % 5.2;
  let eyeScale = blinkCycle < .13 ? .12 + Math.abs(blinkCycle - .065) / .065 * .88 : 1;
  if (v.state === 'happy') eyeScale = .3;
  if (v.state === 'angry') eyeScale = .62;
  for (const key of ['Eye_L', 'Eye_R']) if (nodes[key]) {
    nodes[key].node.scale.copy(nodes[key].scale);
    nodes[key].node.scale.y *= eyeScale;
  }
  actor.mouthFish.visible = v.state === 'eating' && p < .65;
  if (actor.mouthFish.visible) {
    actor.mouthFish.scale.setScalar(.7 * (1 - p / .75));
    actor.mouthFish.rotation.z = Math.sin(p * 18) * .07;
  }
  actor.footprint.material.opacity = Math.max(0, .18 * (1 + Math.min(0, y) / 2));
  actor.waterline.material.opacity = Math.max(0, .38 * (1 + Math.min(0, y) / 2));
  const ringScale = (.85 + Math.sin(t * 1.7 + phase) * .07) * v.size;
  actor.waterline.scale.set(ringScale, ringScale * .86, 1);
  if (v.state !== actor.lastState) {
    actor.label.className = `seal-label ${v.state}`;
    actor.label.querySelector('.seal-bubble').textContent = stateText(actor);
    actor.lastState = v.state;
    if (v.state === 'happy') {
      effects.hearts(root.position.clone().add(new THREE.Vector3(0, v.size * 1.8, 0)));
      audio.celebrate();
    }
  }
  actor.label.style.opacity = (v.state === 'diving' || v.state === 'gone' || y < -.7) ? '0' : '1';
  const patience = actor.demo || v.fed ? 1 : v.state === 'waiting' ? 1 - p / v.patience : v.state === 'calling' ? .2 * (1 - p / 4) : 0;
  actor.label.querySelector('.patience').style.display = actor.demo || v.fed ? 'none' : '';
  actor.label.querySelector('.patience i').style.width = `${Math.max(0, patience) * 100}%`;
  projection.set(v.x, root.position.y + v.size * 2.12, v.z).project(camera);
  actor.label.style.transform = `translate(${(projection.x * .5 + .5) * innerWidth}px,${(-projection.y * .5 + .5) * innerHeight}px) translate(-50%, -100%)`;
}
function sample(event) { return { x: event.clientX, y: event.clientY, t: event.timeStamp }; }
function previewThrow(result) {
  if (!result) { aimGroup.visible = false; ui.power(0, true); return; }
  aimGroup.visible = true;
  const target = { ...result.end, y: .12 };
  for (let i = 0; i < 24; i++) {
    const point = trajectoryPoint(origin, target, i / 23, 1.5 + result.power * 2.2);
    aimPoints.set([point.x, point.y, point.z], i * 3);
  }
  aimGeometry.attributes.position.needsUpdate = true;
  aimGeometry.computeBoundingSphere();
  targetRing.position.set(target.x, .075, target.z);
  const ready = findCatch(target, actors.map(actor => actor.visitor));
  targetRing.material.color.set(ready ? '#f6bd7c' : '#fff3c8');
  ui.power(result.power, true);
}
function cancelGesture() {
  if (gesture && renderer.domElement.hasPointerCapture(gesture.id)) renderer.domElement.releasePointerCapture(gesture.id);
  gesture = null;
  aimGroup.visible = false;
  if (typeof ui !== 'undefined') ui.power(0, false);
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (status !== 'playing' || paused || event.button !== 0 || gesture || petting?.dragging) return;
  if (petting?.isOverResident(event.clientX, event.clientY)) return;
  if (event.clientY < innerHeight * .4) { ui.notice('从画面下半部开始，朝海豹向上划'); return; }
  event.preventDefault();
  gesture = { id: event.pointerId, samples: [sample(event)] };
  renderer.domElement.setPointerCapture(event.pointerId);
  ui.power(0, true);
  audio.unlock();
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  event.preventDefault();
  gesture.samples.push(sample(event));
  previewThrow(computeThrow(gesture.samples, { width: innerWidth, height: innerHeight }));
});
renderer.domElement.addEventListener('pointerup', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  gesture.samples.push(sample(event));
  const result = computeThrow(gesture.samples, { width: innerWidth, height: innerHeight });
  cancelGesture();
  if (!result) { ui.notice('向上划一下再松手，试着连贯一点'); return; }
  launch(result);
});
renderer.domElement.addEventListener('pointercancel', cancelGesture);
renderer.domElement.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

function launch(result) {
  if (elapsed - lastThrowTime < .22 || status !== 'playing' || paused) return;
  lastThrowTime = elapsed;
  throwCount++;
  const fish = createFish();
  fish.scale.setScalar(1.2);
  fish.position.copy(origin);
  scene.add(fish);
  const candidate = findCatch(result.end, actors.map(actor => actor.visitor));
  projectiles.push({ mesh: fish, target: { ...result.end, y: .12 }, age: 0, duration: result.duration, height: 1.5 + result.power * 2.2, candidateId: candidate?.id });
  audio.throwFish();
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const fish = projectiles[i];
    fish.age += dt;
    const progress = Math.min(1, fish.age / fish.duration);
    const candidate = actors.find(actor => actor.visitor.id === fish.candidateId && actor.visitor.canCatch);
    const target = candidate ? { x: candidate.visitor.x, y: candidate.root.position.y + candidate.visitor.size * 1.1, z: candidate.visitor.z + .55 } : fish.target;
    const point = trajectoryPoint(origin, target, progress, fish.height);
    fish.mesh.position.set(point.x, point.y, point.z);
    fish.mesh.rotation.set(progress * 3, Math.PI * .5, progress * Math.PI * 3);
    if (candidate) {
      applyRotation(candidate, 'Head', -.1 * Math.sin(progress * Math.PI), 0, Math.sin(progress * 3) * .03);
      if (progress > .68) applyRotation(candidate, 'Jaw', .34 * (progress - .68) / .32);
    }
    if (progress < 1) continue;
    const caught = findCatch(fish.target, actors.map(actor => actor.visitor));
    if (caught && feedVisitor(caught)) {
      score++; combo++; bestCombo = Math.max(combo, bestCombo);
      ui.meet(caught.variant);
      audio.eat();
      effects.ripple(caught.x, caught.z, .75);
      const actor = actors.find(item => item.visitor === caught);
      if (score === 1) ui.notice(`喂到${actor.meta.name}啦！再试试远处的小家伙`);
    } else {
      combo = 0;
      effects.splash(fish.target.x, fish.target.z, .8);
      audio.splash(.65);
      if (throwCount < 5 || throwCount % 7 === 0) ui.notice('差一点点：近处慢慢划，远处快快划');
    }
    scene.remove(fish.mesh);
    disposeFish(fish.mesh);
    projectiles.splice(i, 1);
  }
}
window.addEventListener('resize', () => { cancelGesture(); petting?.cancelDrag(); const previous = world.isPortrait; world.resize(); if (status === 'intro' && previous !== world.isPortrait) demoBay(); });
window.addEventListener('keydown', event => {
  if (event.code === 'KeyM' && !event.repeat) { document.getElementById('sound-button').click(); return; }
  if ((event.code === 'Space' || event.code === 'Escape') && status === 'playing' && !ui.modalOpen && !event.repeat) {
    event.preventDefault(); ui.pause();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && status === 'playing' && !ui.modalOpen) ui.pause(); });

let previousTime = performance.now();
let hudTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const activeDt = paused ? 0 : (now - previousTime) / 1000;
  const realDt = Math.min(activeDt, .08);
  previousTime = now;
  const dt = paused ? 0 : realDt;
  worldTime += dt;
  if (!paused && status === 'playing' && beachResidents) {
    roamingFeedback.events(beachResidents.updateRoaming(activeDt, roamingFeedback.visibleIds()));
  }
  petting?.update(dt);
  if (!paused) {
    world.update(worldTime);
    beachResidents?.update(worldTime);
    roamingFeedback?.update(dt, status === 'playing');
    if (status === 'playing') {
      elapsed += activeDt;
      spawnTime -= activeDt;
      const maxActors = world.isPortrait ? 4 : 5;
      if (spawnTime <= 0 && actors.length < maxActors) {
        const bounds = world.isPortrait ? { minX: -3.6, maxX: 3.6 } : {};
        const position = pickSpawn(actors.map(actor => actor.visitor), Math.random, bounds);
        if (position) {
          const available = manifest.filter(meta => !actors.some(actor => actor.meta.id === meta.id));
          spawn(available[Math.floor(Math.random() * available.length)], position);
        }
        spawnTime = mode === 'challenge' ? 2.2 : 3.2;
      }
    }
    actors.forEach(actor => animateActor(actor, activeDt));
    if (status === 'playing') updateProjectiles(activeDt);
    for (let i = actors.length - 1; i >= 0; i--) if (actors[i].visitor.state === 'gone') { removeActor(actors[i]); actors.splice(i, 1); }
    effects.update(dt, camera);
    if (status === 'playing') {
      hudTick += dt;
      if (hudTick > .1) { ui.stats(score, mode === 'challenge' ? 120 - elapsed : elapsed, combo); hudTick = 0; }
      if (mode === 'challenge' && elapsed >= 120) { ui.stats(score, 0, combo); finish(); }
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

async function load() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}models/manifest.json`);
    if (!response.ok) throw new Error(`Model manifest: ${response.status}`);
    const data = await response.json();
    manifest = data.seals.map(meta => ({ ...meta, portrait: `${import.meta.env.BASE_URL}${meta.portrait.replace(/^\//, '')}` }));
    const loader = new GLTFLoader();
    let loaded = 0;
    await Promise.all(manifest.map(async meta => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${meta.file.replace(/^\//, '')}`);
      models.set(meta.id, gltf.scene);
      ui.progress(++loaded, manifest.length);
    }));
    ui.setModels(manifest);
    beachResidents = createBeachResidents({ scene, models, surfaceHeight: world.beach.heightAt });
    beachResidents.update(worldTime);
    roamingFeedback = createRoamingFeedback({ residents: beachResidents, camera, manifest, effects, audio });
    petting = createPetting({
      residents: beachResidents, camera, container, manifest,
      onBeginDrag: cancelGesture,
      onUnlock: () => audio.unlock(),
      onComplete: ({ position }) => {
        effects.hearts(position.add(new THREE.Vector3(0, .3, 0)), 2.4);
        audio.celebrate();
      },
    });
    demoBay();
    ui.ready();
  } catch (error) {
    console.error(error);
    fatal('海豹模型没能完整加载。请检查本地游戏服务是否仍在运行，然后重新打开。');
  }
}
load();

// A read-only snapshot supports browser verification without bypassing real input.
window.__sealBay = Object.freeze({
  snapshot: () => ({ status, paused, mode, elapsed, score, throws: throwCount, combo, bestCombo, loaded: models.size, audio: audio.status, projectiles: projectiles.length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, beachSeals: beachResidents?.snapshot() || [], roaming: beachResidents?.roamingSnapshot() || null, petting: petting?.snapshot() || null, activeHearts: effects.items.filter(item => item.type === 'heart' && item.mesh.visible).length, seals: actors.map(({ visitor, meta, root }) => ({ id: visitor.id, variant: meta.id, name: meta.name, state: visitor.state, stateTime: visitor.stateTime, x: visitor.x, z: visitor.z, size: visitor.size, fed: visitor.fed, visibleY: root.position.y })) }),
});
