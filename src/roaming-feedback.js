import './roaming.css';
import * as THREE from 'three';
import { shorelineZ } from './beach.js';

export function createRoamingFeedback({ residents, camera, manifest, effects, audio }) {
  const names = new Map(manifest.map(seal => [seal.id, seal.name]));
  const point = new THREE.Vector3();
  const label = document.createElement('div');
  label.id = 'roaming-label';
  label.className = 'seal-label roaming-label';
  label.hidden = true;
  label.innerHTML = '<span class="seal-bubble"></span>';
  document.getElementById('seal-labels').append(label);
  let wakeTime = 0;
  let previousTrip = '';

  function project(seal, height = 1.5) {
    point.set(seal.x, Math.max(0, seal.y) + height, seal.z).project(camera);
    return { x: (point.x * .5 + .5) * innerWidth, y: (.5 - point.y * .5) * innerHeight, depth: point.z };
  }

  return {
    visibleIds() {
      return residents.snapshot().filter(seal => {
        const p = project(seal);
        return p.depth > -1 && p.depth < 1 && p.x > 32 && p.x < innerWidth - 32
          && p.y > 55 && p.y < innerHeight - 120;
      }).map(seal => seal.id);
    },
    events(events) {
      for (const event of events) {
        if (event.type === 'shore-cross') {
          effects.splash(event.x, event.z, .35);
          audio.splash(.18);
        } else if (event.type === 'depart' && event.direction === 'to-beach') {
          effects.ripple(event.x, event.z, .6);
        }
      }
    },
    update(dt, playing) {
      const seals = residents.snapshot();
      const traveler = playing && seals.find(seal => seal.habitat === 'travel');
      label.hidden = !traveler;
      if (traveler) {
        const trip = `${traveler.id}:${traveler.travelDirection}`;
        if (trip !== previousTrip) {
          label.querySelector('.seal-bubble').textContent = `${names.get(traveler.variant)} · ${traveler.travelDirection === 'to-beach' ? '上岸晒太阳' : '去水里游游'}`;
          previousTrip = trip;
        }
        label.dataset.residentId = traveler.id;
        label.dataset.direction = traveler.travelDirection;
        const p = project(traveler);
        label.hidden = p.depth < -1 || p.depth > 1 || p.x < 0 || p.x > innerWidth;
        const x = Math.max(72, Math.min(innerWidth - 72, p.x));
        const halfWidth = label.offsetWidth / 2;
        const height = label.offsetHeight;
        const blocked = ['.brand', '.header-actions', '#session-stats', '.visitors-panel'].flatMap(selector => {
          const element = document.querySelector(selector);
          if (!element?.getClientRects().length) return [];
          const box = element.getBoundingClientRect();
          return x + halfWidth > box.left - 5 && x - halfWidth < box.right + 5
            && p.y > box.top - 5 && p.y - height < box.bottom + 5 ? [box] : [];
        });
        const below = p.y - height < 8 || blocked.length > 0;
        const y = below ? Math.max(project(traveler, .15).y + 12, ...blocked.map(box => box.bottom + 8)) : p.y;
        label.classList.toggle('below-seal', below);
        label.style.transform = `translate(${x}px,${y}px) translate(-50%, ${below ? '0' : '-100%'})`;
      }
      if (!playing) return;
      wakeTime += dt;
      if (wakeTime >= .85) {
        wakeTime %= .85;
        for (const seal of seals) {
          if (seal.habitat !== 'beach' && seal.z > shorelineZ(seal.x) + .25) effects.ripple(seal.x, seal.z, .43);
        }
      }
    },
    hide() { label.hidden = true; },
    reset() { label.hidden = true; wakeTime = 0; previousTrip = ''; },
    dispose() { label.remove(); },
  };
}
