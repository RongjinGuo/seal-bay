const paths = {
  'sound-on': '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  'sound-off': '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2.8-1.7 1.1-1.7 2.7m0 3h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6m-3 0v3m6 1 2-2"/>',
  'arrow-right': '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  gesture: '<path d="M10 17V7a2 2 0 0 1 4 0v6l1-1a2 2 0 0 1 3 1l1 4c.5 3-1 5-4 5h-3c-2 0-3-1-4-3l-3-4a1.7 1.7 0 0 1 2-2l3 2M5 8V2m-3 3 3-3 3 3"/>',
  fish: '<path d="M17 12c-4-7-10-7-15 0 5 7 11 7 15 0Zm0 0 5-5v10l-5-5Z"/><circle cx="6.5" cy="11" r=".6" fill="currentColor"/><path d="m10 7-1-3 5 3m-4 10 1 3 3-4"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
};
export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.help}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
}
