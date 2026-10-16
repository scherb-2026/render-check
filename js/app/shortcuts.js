/* ======================================================================
 * js/app/shortcuts.js — grid button and keyboard shortcuts for the box under the pointer
 * Uses: room/room.js
 * ====================================================================== */

document.getElementById('gridBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on);
  document.body.classList.toggle('show-grid', on);
});

// Keyboard shortcuts act on the box under the pointer
document.addEventListener('keydown', (e) => {
  if (!hovered || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); hovered.stage.classList.toggle('solo'); }
  else if (hovered.hasVideo && e.key.toLowerCase() === 'k') { e.preventDefault(); hovered.toggle(); }
  else if (hovered.hasVideo && e.key === ',') { e.preventDefault(); hovered.step(-1); }
  else if (hovered.hasVideo && e.key === '.') { e.preventDefault(); hovered.step(1); }
  else if (/^[1-9]$/.test(e.key)) { hovered.select(+e.key - 1); }
  else if (e.key.toLowerCase() === 's') { e.preventDefault(); hovered.toggleSweep(); }
});
