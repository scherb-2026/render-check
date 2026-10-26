/* ======================================================================
 * js/app/shortcuts.js — keyboard shortcuts: K and , . for the playback bar; the other keys act on the cell under the pointer
 * Uses: room/room.js, room/gallery.js, room/transport.js
 * ====================================================================== */

document.addEventListener('keydown', (e) => {
  const t = e.target;
  // Not while typing in a field or choosing from a menu; the seek bar (a range input) is no field: its arrow keys stay its own, the video keys still work
  if (/TEXTAREA|SELECT/.test(t.tagName) || (t.tagName === 'INPUT' && t.type !== 'range') || e.ctrlKey || e.metaKey || e.altKey) return;
  // Left / right nudge the split of the whole gallery (not while a tab row has the focus: there the arrows change the tab)
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && hovered && t.tagName !== 'INPUT' && !t.closest('[role="tablist"]') && gallery.mode !== 'diff') {
    e.preventDefault(); gallery.setPos(gallery.pos + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1)); return;
  }
  // The video keys work anywhere on the page while the video view is open: they act on the playback bar, i.e. on every video at once
  if (transport.active) {
    if (e.key.toLowerCase() === 'k') { e.preventDefault(); transport.toggle(); return; }
    if (e.key === ',') { e.preventDefault(); transport.step(-1); return; }
    if (e.key === '.') { e.preventDefault(); transport.step(1); return; }
  }
  if (!hovered) return;
  if (e.code === 'Space') { e.preventDefault(); hovered.stage.classList.toggle('solo'); }
  else if (/^[1-9]$/.test(e.key)) { hovered.select(+e.key - 1); }
});
