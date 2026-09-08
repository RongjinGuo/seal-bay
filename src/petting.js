import './petting.css';
import * as THREE from 'three';
import { PETTING_TOOLS, PETTING_DURATIONS, createPettingState, advancePetting, offerPettingTool } from './petting-logic.js';

const artwork = {
  brush: '<g transform="rotate(-28 32 32)"><path d="M28 34h8v22a4 4 0 0 1-8 0Z" fill="#c69a6c" stroke="#6c7260" stroke-width="1.4"/><rect x="15" y="10" width="34" height="29" rx="13" fill="#9fb9a4" stroke="#577769" stroke-width="1.5"/><rect x="19" y="14" width="26" height="20" rx="9" fill="#eee4c8"/><path d="M23 18v12m6-14v15m6-15v15m6-13v12" stroke="#bfac83" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="53" r="1.5" fill="#947553"/></g>',
  mitten: '<path d="M21 45c-8-7-12-14-8-18 3-3 6 0 9 4V14c0-9 6-11 10-7 5-3 10 0 10 6 6 1 8 6 8 14 0 9-2 15-7 21l-2 10H23Z" fill="#f2dfbf" stroke="#9b9377" stroke-width="1.5" stroke-linejoin="round"/><path d="M28 15v17m7-18v18m7-12v13" stroke="#d6c29f" stroke-width="1.8" stroke-linecap="round"/><path d="M22 46h21l-2 12H24Z" fill="#a2b8a2" stroke="#708d79" stroke-width="1.3"/><path d="M27 49v6m5-6v6m5-6v6" stroke="#d2dec8" stroke-width="1.6"/><path d="M30 37c-4-4-7 2 2 7 9-5 6-11 2-7l-2 2Z" fill="#d59178"/>',
};
const art = id => `<svg class="petting-tool-art" viewBox="0 0 64 64" aria-hidden="true">${artwork[id]}</svg>`;
const toolFor = id => PETTING_TOOLS.find(tool => tool.id === id);

export function createPetting({ residents, camera, container, manifest, onBeginDrag, onComplete, onUnlock }) {
  let state = createPettingState();
  let enabled = false, paused = false, drag = null;
  let targets = [];
  let displayedMessage = '';
  let toolNotice = '', toolNoticeTime = 0;
  const names = new Map(manifest.map(seal => [seal.id, seal.name]));
  const overlay = document.createElement('div');
  overlay.className = 'petting-layer';
  overlay.innerHTML = `<aside id="petting-tools" class="petting-tools" aria-label="抚摸工具" hidden>
    <div class="petting-tray-title">摸摸小站 <span aria-hidden="true">♡</span></div>
    <div class="petting-tool-row">${PETTING_TOOLS.map(tool => `<button type="button" class="petting-tool" data-petting-tool="${tool.id}" aria-label="拖动${tool.name}" aria-describedby="petting-instruction" disabled>${art(tool.id)}<span>${tool.name}</span></button>`).join('')}</div>
    <p id="petting-instruction">等小家伙想被摸摸</p>
  </aside>
  <div id="petting-target" class="petting-target" aria-hidden="true" hidden></div>
  <div id="petting-request" class="petting-request" role="status" aria-live="polite" hidden></div>
  <div id="petting-drag" class="petting-drag" aria-hidden="true" hidden></div>`;
  document.body.append(overlay);
  const tray = overlay.querySelector('#petting-tools');
  const instruction = overlay.querySelector('#petting-instruction');
  const bubble = overlay.querySelector('#petting-request');
  const ring = overlay.querySelector('#petting-target');
  const ghost = overlay.querySelector('#petting-drag');
  const buttons = [...overlay.querySelectorAll('[data-petting-tool]')];
  function setGhostTool(toolId) {
    if (ghost.dataset.toolId === toolId) return;
    ghost.innerHTML = art(toolId);
    ghost.dataset.toolId = toolId;
  }
  const project = point => {
    const p = point.clone().project(camera);
    const rect = container.getBoundingClientRect();
    return { x: rect.left + (p.x * .5 + .5) * rect.width, y: rect.top + (.5 - p.y * .5) * rect.height, depth: p.z };
  };
  function projectTargets() {
    targets = residents.interactionTargets().map(target => {
      const center = project(target.position);
      const edge = project(target.position.clone().add(new THREE.Vector3(target.radius, 0, 0)));
      const rx = Math.max(innerWidth < 761 ? 33 : 30, Math.min(76, Math.abs(edge.x - center.x) + 7));
      const ry = Math.max(25, rx * .7);
      const margin = Math.max(34, rx * .7);
      const visible = center.depth > -1 && center.depth < 1 && center.x > margin && center.x < innerWidth - margin
        && center.y > (innerHeight < 500 ? 70 : 120) && center.y < innerHeight - 180;
      return { ...target, x: center.x, y: center.y, head: project(target.headPosition), rx, ry, visible };
    });
  }
  function hitTarget(x, y) {
    let closest = null, distance = Infinity;
    for (const target of targets) {
      if (!target.visible) continue;
      const d = ((x - target.x) / target.rx) ** 2 + ((y - target.y) / target.ry) ** 2;
      if (d <= 1 && d < distance) { distance = d; closest = target; }
    }
    return closest;
  }
  function cancelDrag() {
    const previous = drag;
    drag = null;
    ghost.hidden = true;
    ring.hidden = true;
    document.body.classList.remove('petting-dragging');
    buttons.forEach(button => button.classList.remove('drag-source'));
    if (previous?.button.hasPointerCapture(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
  }
  function startDrag(event) {
    if (!enabled || paused || drag || state.phase !== 'requesting' || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    onBeginDrag?.();
    onUnlock?.();
    const button = event.currentTarget;
    drag = { pointerId: event.pointerId, toolId: button.dataset.pettingTool, button, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, distance: 0 };
    button.setPointerCapture(event.pointerId);
    button.classList.add('drag-source');
    setGhostTool(drag.toolId);
    ghost.className = 'petting-drag';
    document.body.classList.add('petting-dragging');
    render();
  }
  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.x = event.clientX; drag.y = event.clientY;
    drag.distance = Math.max(drag.distance, Math.hypot(drag.x - drag.startX, drag.y - drag.startY));
    render();
  }
  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const held = drag;
    projectTargets();
    const target = hitTarget(event.clientX, event.clientY);
    cancelDrag();
    if (!enabled || paused || held.distance < 10) return;
    const result = offerPettingTool(state, target?.id, held.toolId);
    if (!result.accepted) {
      if (state.request && result.reason !== 'unavailable') {
        toolNotice = result.reason === 'wrong-tool' ? `换成${toolFor(state.request.toolId).name}试试` : '拖到有摸摸提示的海豹';
        toolNoticeTime = 2.4;
      }
    } else {
      toolNotice = '';
      toolNoticeTime = 0;
    }
    updatePose();
    render();
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', startDrag);
    button.addEventListener('pointermove', moveDrag);
    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', cancelDrag);
    button.addEventListener('lostpointercapture', () => { if (drag?.button === button) cancelDrag(); });
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('dragstart', event => event.preventDefault());
  }
  function updatePose() {
    residents.setPettingState(enabled && state.request ? {
      id: state.request.residentId, phase: state.phase,
      progress: Math.min(1, state.time / (PETTING_DURATIONS[state.phase] || 1)),
    } : null);
  }
  function render() {
    const active = enabled && !paused;
    tray.hidden = !active;
    const request = state.request;
    const target = request && targets.find(item => item.id === request.residentId);
    bubble.hidden = !active || !target?.visible || state.phase === 'happy';
    for (const button of buttons) {
      button.disabled = !active || state.phase !== 'requesting';
      button.classList.toggle('requested', active && state.phase === 'requesting' && button.dataset.pettingTool === request?.toolId);
    }
    const hint = toolNotice || (state.phase === 'requesting' ? '拖到有提示的小海豹身上' : state.phase === 'petting' ? '正在轻轻摸摸…' : state.phase === 'happy' ? '收获一颗小小的心' : '等小家伙想被摸摸');
    if (instruction.textContent !== hint) instruction.textContent = hint;
    if (!active) { ghost.hidden = true; ring.hidden = true; return; }
    if (target?.visible) {
      const key = `${state.phase}:${request.residentId}:${request.toolId}`;
      if (key !== displayedMessage) {
        displayedMessage = key;
        bubble.replaceChildren();
        const icon = document.createElement('span');
        icon.className = 'petting-request-icon';
        icon.innerHTML = state.phase === 'happy' ? '<span class="petting-bubble-heart">♡</span>' : art(request.toolId);
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        const description = document.createElement('small');
        title.textContent = state.phase === 'requesting' ? `${names.get(target.variant)}想被摸摸` : state.phase === 'petting' ? '轻轻摸一摸…' : '好舒服呀！';
        description.textContent = state.phase === 'requesting' ? `想要${toolFor(request.toolId).name}` : state.phase === 'petting' ? '小脑袋蹭蹭你' : '送你一颗小心心';
        copy.append(title, description); bubble.append(icon, copy);
      }
      bubble.dataset.residentId = request.residentId;
      bubble.dataset.toolId = request.toolId;
      bubble.dataset.phase = state.phase;
      const bubbleX = Math.max(82, Math.min(innerWidth - 82, target.x));
      const above = target.y - target.ry - 8;
      const bubbleHeight = bubble.offsetHeight;
      const bubbleHalfWidth = bubble.offsetWidth / 2;
      // Keep the invitation clear of the header when the beach is near the top edge.
      const blockedAbove = ['.brand', '.header-actions', '#session-stats', '.visitors-panel'].some(selector => {
        const element = document.querySelector(selector);
        if (!element || !element.getClientRects().length) return false;
        const box = element.getBoundingClientRect();
        return bubbleX + bubbleHalfWidth > box.left - 5 && bubbleX - bubbleHalfWidth < box.right + 5
          && above > box.top - 5 && above - bubbleHeight < box.bottom + 5;
      });
      const below = above - bubbleHeight < 8 || blockedAbove;
      bubble.classList.toggle('below-seal', below);
      bubble.style.left = `${bubbleX}px`;
      bubble.style.top = `${below ? target.y + target.ry + 8 : above}px`;
    }
    ring.hidden = !drag || !target?.visible;
    if (!ring.hidden) {
      ring.style.left = `${target.x}px`; ring.style.top = `${target.y}px`;
      ring.style.width = `${target.rx * 2}px`; ring.style.height = `${target.ry * 2}px`;
      const hovered = hitTarget(drag.x, drag.y);
      ring.classList.toggle('matched', hovered?.id === request.residentId && drag.toolId === request.toolId);
      ring.classList.toggle('wrong-tool', hovered?.id === request.residentId && drag.toolId !== request.toolId);
    }
    if (drag) {
      ghost.hidden = false;
      ghost.style.left = `${drag.x}px`; ghost.style.top = `${drag.y - 12}px`;
    } else if (state.phase === 'petting' && target?.visible) {
      ghost.hidden = false;
      ghost.className = 'petting-drag stroking';
      setGhostTool(request.toolId);
      const stroke = Math.sin(state.time / PETTING_DURATIONS.petting * Math.PI * 5);
      ghost.style.left = `${target.head.x + stroke * 13}px`;
      ghost.style.top = `${target.head.y - 10}px`;
      ghost.style.setProperty('--stroke-angle', `${stroke * 12 - 18}deg`);
    } else ghost.hidden = true;
  }
  function reset() {
    cancelDrag();
    state = createPettingState();
    displayedMessage = '';
    toolNotice = '';
    toolNoticeTime = 0;
    residents.setPettingState(null);
  }
  projectTargets();
  render();
  return {
    start() { reset(); enabled = true; paused = false; render(); },
    stop() { reset(); enabled = false; paused = false; render(); },
    setPaused(value) { paused = Boolean(value); if (paused) cancelDrag(); render(); },
    cancelDrag,
    isOverResident(x, y) { return Boolean(hitTarget(x, y)); },
    get dragging() { return drag !== null; },
    update(dt) {
      projectTargets();
      if (enabled && !paused) {
        toolNoticeTime = Math.max(0, toolNoticeTime - dt);
        if (toolNoticeTime === 0) toolNotice = '';
        for (const event of advancePetting(state, dt, targets.filter(target => target.visible).map(target => target.id))) {
          if (event.type === 'petting-complete') {
            const target = targets.find(item => item.id === event.residentId);
            if (target) onComplete?.({ ...event, variant: target.variant, name: names.get(target.variant), position: target.headPosition.clone() });
          }
        }
        if (state.phase !== 'requesting') toolNotice = '';
      }
      if (drag && state.phase !== 'requesting') cancelDrag();
      updatePose();
      render();
    },
    snapshot() {
      return {
        phase: state.phase, time: state.time, request: state.request ? { ...state.request } : null,
        completed: state.completed, requestsMade: state.requestsMade, dragging: drag !== null,
        targets: targets.map(({ id, variant, x, y, rx, ry, visible }) => ({ id, variant, x, y, rx, ry, visible })),
      };
    },
    dispose() { reset(); overlay.remove(); },
  };
}
