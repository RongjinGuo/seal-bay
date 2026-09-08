import * as THREE from 'three';

export const SHORELINE_GLSL = 'float shoreZ(float x) { return -13.6 - .014*x*x + .35*sin(x*.45); }';
export const shorelineZ = x => -13.6 - .014 * x * x + .35 * Math.sin(x * .45);

export function beachHeight(x, z) {
  const inland = shorelineZ(x) - z;
  if (inland < 0) return -.16 + inland * .15;
  const rise = 1 - Math.exp(-inland * .24);
  const dunes = Math.max(0, 1 - Math.exp(-(inland - 4) * .15));
  return -.16 + 1.22 * rise + dunes * (.32 + .17 * Math.sin(x * .43 + z * .16))
    + .025 * Math.sin(x * 1.9 + z * .7) * rise;
}

function randomSequence(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function sandTexture(random) {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = random();
      const ripple = Math.sin(y * .19 + Math.sin(x * .055) * 2) * 2;
      const value = 225 + grain * 23 + ripple - (grain < .04 ? 24 : 0);
      pixels.set([value, value - 2, value - 5, 255], i);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createBeach(scene) {
  const random = randomSequence(9206);
  const group = new THREE.Group();
  group.name = 'SealBeach';
  scene.add(group);
  const columns = 160, rows = 60;
  const positions = [], colors = [], uvs = [], indices = [];
  const wet = new THREE.Color('#b99a70'), dry = new THREE.Color('#e2c28c');
  const color = new THREE.Color();
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const x = -35 + i / columns * 70;
      const z = shorelineZ(x) - j / rows * 25;
      const inland = shorelineZ(x) - z;
      const dryAmount = THREE.MathUtils.smoothstep(inland, .7, 3.1);
      color.copy(wet).lerp(dry, dryAmount);
      color.multiplyScalar(.98 + .025 * Math.sin(x * 1.7 + z));
      positions.push(x, beachHeight(x, z), z);
      colors.push(color.r, color.g, color.b);
      uvs.push(x / 5, z / 5);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const sandMap = sandTexture(random);
  const sand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, map: sandMap, bumpMap: sandMap, bumpScale: .035, roughness: .91,
  }));
  sand.name = 'WarmSand';
  sand.receiveShadow = true;
  group.add(sand);

  // A thin transparent wash follows the same coast equation as the sand and water.
  const foamGeometry = new THREE.PlaneGeometry(70, 3.2, 160, 8).rotateX(-Math.PI / 2);
  const foamPosition = foamGeometry.attributes.position;
  for (let i = 0; i < foamPosition.count; i++) {
    const x = foamPosition.getX(i), offset = foamPosition.getZ(i);
    foamPosition.setXYZ(i, x, .088, shorelineZ(x) + offset + .75);
  }
  const foam = new THREE.Mesh(foamGeometry, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vWorld;
      void main() { vWorld = (modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.); }`,
    fragmentShader: `uniform float uTime; varying vec3 vWorld;
      ${SHORELINE_GLSL}
      void main() {
        float x = vWorld.x;
        float d = vWorld.z - shoreZ(x);
        float wash = .34 + .35 * sin(uTime*.58 + x*.045);
        float edge = wash + .065*sin(x*4.2 + uTime*.6) + .035*sin(x*10.5);
        float lace = .65 + .35*sin(x*22. + sin(x*4.)*3.);
        float front = exp(-pow((d-edge)*12.,2.)) * lace;
        float trailing = exp(-pow((d-edge-.43)*16.,2.)) * .27;
        float alpha = (front*.68 + trailing) * smoothstep(-.15,.12,d);
        gl_FragColor = vec4(vec3(.92,.97,.86), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  foam.name = 'GentleShoreBreak';
  foam.frustumCulled = false;
  group.add(foam);

  const pebbleGeometry = new THREE.IcosahedronGeometry(1, 1);
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, new THREE.MeshStandardMaterial({ roughness: .9 }), 95);
  const transform = new THREE.Object3D();
  const pebbleColors = ['#acaa91', '#c8b598', '#938c76', '#ddd0ac'];
  for (let i = 0; i < 95; i++) {
    const x = (random() - .5) * 49;
    const z = shorelineZ(x) - 1.8 - random() * 12;
    const size = .055 + random() ** 2 * .23;
    transform.position.set(x, beachHeight(x, z) + size * .17, z);
    transform.scale.set(size * 1.25, size * .46, size);
    transform.rotation.set(0, random() * 6.28, 0);
    transform.updateMatrix();
    pebbles.setMatrixAt(i, transform.matrix);
    pebbles.setColorAt(i, new THREE.Color(pebbleColors[i % 4]));
  }
  pebbles.name = 'ScatteredBeachPebbles';
  pebbles.castShadow = pebbles.receiveShadow = true;
  group.add(pebbles);

  const shellGeometry = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const shells = new THREE.InstancedMesh(shellGeometry, new THREE.MeshStandardMaterial({ color: '#fff0d2', roughness: .72, side: THREE.DoubleSide }), 28);
  for (let i = 0; i < 28; i++) {
    const x = (random() - .5) * 33;
    const z = shorelineZ(x) - .9 - random() * 3.7;
    transform.position.set(x, beachHeight(x, z) + .025, z);
    transform.rotation.set(0, random() * 6.28, .1);
    const size = .08 + random() * .06;
    transform.scale.set(size, size * .28, size * .85);
    transform.updateMatrix();
    shells.setMatrixAt(i, transform.matrix);
  }
  shells.name = 'TideLineShells';
  shells.castShadow = true;
  group.add(shells);

  const grassPositions = [], grassColors = [];
  const grassTint = new THREE.Color();
  for (let i = 0; i < 180; i++) {
    const x = (random() - .5) * 48;
    const z = shorelineZ(x) - 9 - random() * 9;
    const y = beachHeight(x, z);
    for (let blade = 0; blade < 4; blade++) {
      const angle = random() * Math.PI * 2;
      const height = .3 + random() * .45;
      const dx = Math.cos(angle) * .09, dz = Math.sin(angle) * .09;
      const lean = .13 + random() * .19;
      grassPositions.push(x - dx, y, z - dz, x + dx, y, z + dz, x + Math.sin(angle) * lean, y + height, z + Math.cos(angle) * lean);
      grassTint.set(blade % 2 ? '#adb078' : '#819967');
      for (let v = 0; v < 3; v++) grassColors.push(grassTint.r, grassTint.g, grassTint.b);
    }
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  grassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3));
  grassGeometry.computeVertexNormals();
  const grass = new THREE.Mesh(grassGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .95 }));
  grass.name = 'DuneGrass';
  group.add(grass);

  const driftwoodMaterial = new THREE.MeshStandardMaterial({ color: '#ae9573', roughness: .94 });
  const log = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, 2.1, 9), driftwoodMaterial);
  log.position.set(7.1, beachHeight(7.1, -23.2) + .17, -23.2);
  log.rotation.set(0, .6, Math.PI / 2);
  log.castShadow = log.receiveShadow = true;
  group.add(log);

  return {
    group,
    heightAt: beachHeight,
    update(time) { foam.material.uniforms.uTime.value = time; },
  };
}
