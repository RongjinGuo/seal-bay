import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBeach, SHORELINE_GLSL } from './beach.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...options });
}
function mesh(geometry, mat, parent, position, scale) {
  const object = new THREE.Mesh(geometry, mat);
  if (position) object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function cylinderBetween(a, b, radius, mat, parent) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const object = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), mat, parent);
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(v3(0, 1, 0), direction.normalize());
  return object;
}
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createFish() {
  const group = new THREE.Group();
  const silver = material('#b9d6ce', { metalness: 0.35, roughness: 0.32 });
  const blue = material('#639e9c', { metalness: 0.18, roughness: 0.43 });
  mesh(new THREE.SphereGeometry(1, 18, 12), silver, group, [0, 0, 0], [0.39, 0.12, 0.14]);
  const back = mesh(new THREE.SphereGeometry(1, 16, 10), blue, group, [0, .055, -.012], [.34, .075, .12]);
  back.rotation.x = -.2;
  for (const side of [-1, 1]) {
    const fin = mesh(new THREE.ConeGeometry(.15, .3, 3), blue, group, [-.4, side * .07, 0], [1, 1, .45]);
    fin.rotation.z = side * -1.02;
  }
  mesh(new THREE.SphereGeometry(.025, 8, 8), material('#193d40', { roughness: .12 }), group, [.25, .025, .115]);
  mesh(new THREE.SphereGeometry(.012, 6, 6), material('#fffcec'), group, [.253, .035, .132]);
  const fin = mesh(new THREE.ConeGeometry(.095, .16, 3), blue, group, [-.05, .16, 0], [1, 1, .5]);
  fin.rotation.z = .3;
  return group;
}

export function createWorld(container) {
  const random = rng(724);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cee7df');
  scene.fog = new THREE.FogExp2('#cee7df', .008);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 180);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, .04).texture;
  scene.environmentIntensity = .38;
  environment.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#f6f2d9', '#6c9991', 1.15));
  const sun = new THREE.DirectionalLight('#fff1d2', 2.2);
  sun.position.set(-11, 21, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 22, bottom: -18, near: 1, far: 65 });
  sun.shadow.normalBias = .03;
  sun.shadow.bias = -.0002;
  sun.target.position.set(0, 0, -3);
  scene.add(sun, sun.target);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 170, 170).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCamera: { value: camera.position }, uLight: { value: sun.position.clone().normalize() } },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 p = position;
        float a = p.x * .73 + p.z * .47 + uTime * .72;
        float b = p.z * 1.37 - p.x * .19 - uTime * .86;
        p.y += sin(a) * .047 + sin(b) * .027;
        vNormal = normalize(vec3(-cos(a)*.034+cos(b)*.005,1.,-cos(a)*.022-cos(b)*.037));
        vWorld = (modelMatrix * vec4(p,1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld,1.);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCamera;
      uniform vec3 uLight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${SHORELINE_GLSL}
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main() {
        vec2 uv=vWorld.xz;
        float n=noise(uv*.22+uTime*.025);
        vec3 shallow=vec3(.09,.40,.34), deep=vec3(.038,.24,.235);
        vec3 color=mix(deep,shallow,clamp(.68+n*.5+vWorld.z*.01,0.,1.));
        float shoreDistance = uv.y - shoreZ(uv.x);
        float shallows = 1. - smoothstep(.0, 5.5, shoreDistance);
        color=mix(color,vec3(.28,.49,.36),shallows*.54);
        vec3 viewDir=normalize(uCamera-vWorld);
        float fresnel=pow(1.-max(dot(viewDir,vNormal),0.),3.);
        color=mix(color,vec3(.51,.74,.65),fresnel*.58);
        float wave=sin(uv.y*2.6+sin(uv.x*.8+uTime*.35)*1.5-uTime*.7);
        float stripe=smoothstep(.93,.997,wave)*smoothstep(.35,.8,noise(uv*.62+uTime*.02));
        color+=vec3(.08,.13,.105)*stripe*.5;
        float spec=pow(max(dot(reflect(-uLight,vNormal),viewDir),0.),140.);
        color+=vec3(1.,.93,.68)*spec*.5;
        float dist=length(uCamera-vWorld);
        color=mix(color,vec3(.60,.77,.68),1.-exp(-dist*dist*.000065));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  water.name = 'BayWater';
  scene.add(water);
  const beach = createBeach(scene);

  const sand = material('#d4c4a0');
  const stoneColors = ['#b6b7a0', '#babaaa', '#c4bda6', '#a2ada0', '#d4cbb6'];
  function rock(x, y, z, sx, sy, sz, color, detail = 2) {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + .075 * Math.sin(p.getX(i) * 11 + p.getY(i) * 7 + p.getZ(i) * 5);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const object = mesh(geo, material(color || stoneColors[Math.floor(random() * stoneColors.length)]), scene, [x, y, z], [sx, sy, sz]);
    object.rotation.y = random() * Math.PI;
    return object;
  }
  // Islands frame the open feeding lanes while the far coast fades into sea mist.
  for (let i = 0; i < 13; i++) {
    const x = -48 + i * 8;
    rock(x, -.5, -49 - random() * 10, 9 + random() * 5, 2 + random() * 4, 5 + random() * 5, ['#94afa0', '#a3b9a5', '#8da999'][i % 3], 3);
  }
  rock(-27, -.5, -20, 9.2, 2.2, 9.5, '#ccc4a8', 3);
  rock(-27.5, .25, -24, 8.5, 2.4, 8, '#9aaa7b', 3);
  for (let i = 0; i < 13; i++) {
    const z = -16 + i * 1.8;
    rock(-19 - random() * 6, .25 + random() * .55, z, 1.8 + random() * 1.6, .8 + random(), 1.4 + random() * 1.5);
  }
  rock(24, -.3, -21, 7.3, 1.2, 6, '#d3c8aa', 3);
  rock(25, .5, -25, 6.5, 2.5, 6, '#8eaa7e', 3);
  for (let i = 0; i < 8; i++) rock(16 + random() * 6, random() * .7, -9.5 - random() * 13, 1.3 + random() * 2, .8 + random() * 1.3, 1.4 + random());
  const lighthouse = new THREE.Group();
  lighthouse.position.set(-14.1, 1.1, -26.8);
  lighthouse.scale.setScalar(.8);
  const white = material('#f4efd9'), coral = material('#d08e70'), dark = material('#57756d');
  mesh(new THREE.CylinderGeometry(1.1, 1.45, .5, 32), sand, lighthouse, [0, .1, 0]);
  mesh(new THREE.CylinderGeometry(.6, .95, 5.5, 32), white, lighthouse, [0, 2.95, 0]);
  mesh(new THREE.CylinderGeometry(.726, .777, .78, 32), coral, lighthouse, [0, 3.1, 0]);
  mesh(new THREE.CylinderGeometry(.91, .91, .18, 32), dark, lighthouse, [0, 5.73, 0]);
  mesh(new THREE.CylinderGeometry(.57, .57, 1, 12), material('#b4c7ad', { metalness: .3, roughness: .15 }), lighthouse, [0, 6.3, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    cylinderBetween(v3(Math.cos(a) * .64, 5.8, Math.sin(a) * .64), v3(Math.cos(a) * .64, 6.86, Math.sin(a) * .64), .045, dark, lighthouse);
  }
  mesh(new THREE.ConeGeometry(.97, .85, 24), coral, lighthouse, [0, 7.18, 0]);
  mesh(new THREE.SphereGeometry(.11, 10, 8), dark, lighthouse, [0, 7.65, 0]);
  mesh(new THREE.BoxGeometry(.36, .66, .12), dark, lighthouse, [0, 1.02, .83]);
  mesh(new THREE.BoxGeometry(.22, .48, .11), dark, lighthouse, [0, 4.72, .62]);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    cylinderBetween(v3(Math.cos(a) * .87, 5.8, Math.sin(a) * .87), v3(Math.cos(a) * .87, 6.2, Math.sin(a) * .87), .025, dark, lighthouse);
  }
  const rail = mesh(new THREE.TorusGeometry(.87, .027, 6, 32), dark, lighthouse, [0, 6.2, 0]);
  rail.rotation.x = Math.PI / 2;
  scene.add(lighthouse);

  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#edf0dc', transparent: true, opacity: .62, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    cloud.position.set(-55 + i * 19, 15 + random() * 5, -66 - random() * 10);
    for (let j = 0; j < 4; j++) mesh(new THREE.SphereGeometry(1, 20, 12), cloudMaterial, cloud, [(j - 1.5) * 2.6, Math.sin(j) * .5, 0], [3.6, .55 + random() * .4, 1]);
    scene.add(cloud);
  }
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const bird = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: '#6b8e83', transparent: true, opacity: .7 });
    for (const side of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(v3(0, 0, 0), v3(side * .35, .20, .04), v3(side * .65, .03, .12));
      bird.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(8)), lineMat));
    }
    bird.position.set(3 + i * 2.1, 8 + i * .43, -29 - i * 2);
    scene.add(bird);
    birds.push(bird);
  }

  const pier = new THREE.Group();
  const woodColors = ['#bb9168', '#c19a73', '#b58b64', '#c6a17b'];
  for (let i = 0; i < 19; i++) {
    const z = 6.55 + i * .54;
    mesh(new THREE.BoxGeometry(8, .22, .5), material(woodColors[i % 4]), pier, [0, .56, z]);
    for (const x of [-3.45, 3.45]) {
      mesh(new THREE.CylinderGeometry(.025, .025, .008, 8), dark, pier, [x, .676, z]);
    }
    // A few thin, irregular grain lines make the timber read at a distance.
    const points = [];
    for (let k = 0; k < 5; k++) points.push(v3(-3.85 + k * 1.92, .674, z + Math.sin(k * 2 + i) * .045));
    pier.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#947552', transparent: true, opacity: .17 })));
  }
  const postWood = material('#a6825c');
  for (const x of [-3.92, 3.92]) {
    for (const z of [7.05, 11.8]) {
      mesh(new THREE.CylinderGeometry(.19, .23, 2.3, 12), postWood, pier, [x, .35, z]);
      mesh(new THREE.CylinderGeometry(.245, .22, .12, 12), material('#d1b288'), pier, [x, 1.55, z]);
      const ropeMat = material('#d2c29f');
      for (let h = 0; h < 3; h++) {
        const rope = mesh(new THREE.TorusGeometry(.22, .042, 6, 16), ropeMat, pier, [x, 1.24 - h * .07, z]);
        rope.rotation.x = Math.PI / 2;
      }
    }
  }
  scene.add(pier);

  const bucket = new THREE.Group();
  bucket.position.set(.7, .72, 8.35);
  bucket.rotation.y = -.13;
  const bucketMat = material('#9eb9ab', { metalness: .16, roughness: .5, side: THREE.DoubleSide });
  const rimMat = material('#d5d9c7', { metalness: .42, roughness: .3 });
  mesh(new THREE.CylinderGeometry(.91, .67, 1.12, 48, 1, true), bucketMat, bucket, [0, .58, 0]);
  mesh(new THREE.CylinderGeometry(.68, .68, .08, 48), bucketMat, bucket, [0, .06, 0]);
  mesh(new THREE.CylinderGeometry(.80, .80, .03, 40), material('#758f86', { roughness: .2 }), bucket, [0, .86, 0]);
  for (const [radius, height] of [[.91, 1.13], [.7, .08], [.79, .52]]) {
    const ring = mesh(new THREE.TorusGeometry(radius, .038, 8, 48), rimMat, bucket, [0, height, 0]);
    ring.rotation.x = Math.PI / 2;
  }
  const handleCurve = new THREE.CatmullRomCurve3([v3(-.88, .88, 0), v3(-1.12, 1.65, .04), v3(0, 2.05, .05), v3(1.12, 1.65, .04), v3(.88, .88, 0)]);
  mesh(new THREE.TubeGeometry(handleCurve, 32, .032, 7, false), rimMat, bucket);
  cylinderBetween(v3(-.23, 2.03, .05), v3(.23, 2.03, .05), .066, postWood, bucket);
  for (let i = 0; i < 8; i++) {
    const fish = createFish();
    fish.position.set((random() - .5) * 1.05, 1.02 + random() * .22, (random() - .5) * .9);
    fish.rotation.set(random() * .5, random() * Math.PI, (random() - .5) * .9);
    bucket.add(fish);
  }
  const badge = mesh(new THREE.CircleGeometry(.23, 32), material('#f0edda'), bucket, [0, .61, .813]);
  const tinyFish = createFish();
  tinyFish.position.set(0, .61, .845);
  tinyFish.scale.setScalar(.4);
  bucket.add(tinyFish);
  scene.add(bucket);

  // A spare fish and a folded towel ground the feeding area in the scene.
  const spare = createFish();
  spare.position.set(-.95, .84, 8.15);
  spare.rotation.set(.2, .4, .05);
  spare.scale.setScalar(1.2);
  scene.add(spare);
  const towel = mesh(new THREE.BoxGeometry(1.65, .07, 1), material('#e6d9b9'), scene, [-1.35, .73, 8.55]);
  towel.rotation.y = -.23;

  const ambientRipples = [];
  for (let i = 0; i < 16; i++) {
    const ring = mesh(new THREE.RingGeometry(.95, 1, 56), new THREE.MeshBasicMaterial({ color: '#d4e7cc', transparent: true, opacity: .17, side: THREE.DoubleSide, depthWrite: false }), scene, [(random() - .5) * 28, .025, -20 + random() * 25]);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(1.5 + random() * 2, .35 + random() * .25, 1);
    ring.castShadow = ring.receiveShadow = false;
    ambientRipples.push({ ring, phase: random() * 10 });
  }

  let isPortrait = false;
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    isPortrait = width / height < .95;
    camera.aspect = width / height;
    if (isPortrait) {
      camera.fov = 48;
      camera.position.set(0, 11.8, 22.8);
      camera.lookAt(0, -.7, -2.5);
    } else {
      camera.fov = width / height > 2 ? 40 : 43;
      camera.position.set(0, 8.6, 17.2);
      camera.lookAt(0, .2, -3.5);
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  resize();
  function update(time) {
    water.material.uniforms.uTime.value = time;
    beach.update(time);
    birds.forEach((bird, i) => {
      bird.position.x += Math.sin(time * .12 + i) * .002;
      bird.position.y = 8 + i * .43 + Math.sin(time * .7 + i) * .15;
      bird.children.forEach((wing, j) => { wing.rotation.z = Math.sin(time * 2.3 + i) * .13 * (j ? 1 : -1); });
    });
    ambientRipples.forEach(({ ring, phase }) => { ring.material.opacity = .075 + Math.sin(time * .7 + phase) * .05; });
  }
  return { renderer, scene, camera, water, beach, bucket, resize, update, get isPortrait() { return isPortrait; } };
}
