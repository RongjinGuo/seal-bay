import * as THREE from 'three';

const white = new THREE.Color('#deefe0');
const coral = new THREE.Color('#ed957e');
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.dropGeometry = new THREE.SphereGeometry(1, 7, 5);
    this.ringGeometry = new THREE.RingGeometry(.91, 1, 48);
    const heart = new THREE.Shape();
    heart.moveTo(0, .25);
    heart.bezierCurveTo(-.5, .7, -.85, .18, 0, -.45);
    heart.bezierCurveTo(.85, .18, .5, .7, 0, .25);
    this.heartGeometry = new THREE.ShapeGeometry(heart, 12);
  }
  ripple(x, z, strength = 1) {
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.set(x, .055 + i * .006, z);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.items.push({ type: 'ring', mesh: ring, age: -i * .17, life: 1.9, strength });
    }
  }
  splash(x, z, strength = 1) {
    this.ripple(x, z, strength);
    for (let i = 0; i < 10 + strength * 8; i++) {
      const drop = new THREE.Mesh(this.dropGeometry, new THREE.MeshBasicMaterial({ color: white, transparent: true, opacity: .65, depthWrite: false }));
      const angle = Math.random() * Math.PI * 2;
      const speed = .4 + Math.random() * 1.6 * strength;
      const size = .027 + Math.random() * .045;
      drop.scale.set(size, size * 1.7, size);
      drop.position.set(x + Math.cos(angle) * .15, .07, z + Math.sin(angle) * .15);
      this.scene.add(drop);
      this.items.push({ type: 'drop', mesh: drop, age: 0, life: .65 + Math.random() * .3, velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.7 + Math.random() * 2.4, Math.sin(angle) * speed) });
    }
  }
  hearts(position) {
    for (let i = 0; i < 4; i++) {
      const heart = new THREE.Mesh(this.heartGeometry, new THREE.MeshBasicMaterial({ color: coral, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      heart.position.copy(position);
      heart.position.x += (Math.random() - .5) * .8;
      heart.position.y += .35 + Math.random() * .5;
      heart.scale.setScalar(.27 + Math.random() * .12);
      this.scene.add(heart);
      this.items.push({ type: 'heart', mesh: heart, age: -i * .14, life: 1.9, phase: i * 2 });
    }
  }
  update(dt, camera) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.age += dt;
      item.mesh.visible = item.age >= 0;
      if (item.age < 0) continue;
      const p = item.age / item.life;
      if (p >= 1) {
        this.scene.remove(item.mesh);
        item.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (item.type === 'ring') {
        item.mesh.scale.setScalar((.3 + p * 2.3) * item.strength);
        item.mesh.material.opacity = (1 - p) * .38;
      } else if (item.type === 'drop') {
        item.velocity.y -= 8 * dt;
        item.mesh.position.addScaledVector(item.velocity, dt);
        item.mesh.material.opacity = (1 - p) * .65;
        if (item.mesh.position.y < 0) item.mesh.visible = false;
      } else {
        item.mesh.position.y += dt * .8;
        item.mesh.position.x += Math.sin(item.age * 3 + item.phase) * dt * .12;
        item.mesh.quaternion.copy(camera.quaternion);
        item.mesh.material.opacity = Math.sin(p * Math.PI) * .85;
      }
    }
  }
  clear() {
    for (const item of this.items) { this.scene.remove(item.mesh); item.mesh.material.dispose(); }
    this.items = [];
  }
}
