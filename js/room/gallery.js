/* ======================================================================
 * js/room/gallery.js — what all pictures of the gallery share: the comparison mode (buttons in the View row) and the split position
 * Uses: core/config.js. Every cell (room.js) registers itself in `gallery.rooms`; dragging any picture moves the split of all of them.
 * ====================================================================== */

const gallery = {
  mode: 'slider',          // slider | fade | diff, for every cell with an original and a render
  pos: 50,                 // 0–100: the split (Slider) or the original's opacity (Fade); set by dragging a picture
  rooms: new Set(),        // { node, apply() } of every cell built so far
};

(() => {
  const modeButtons = document.querySelectorAll('#modeTabs button');
  const shown = (c) => !!c.node.parentElement && !c.node.parentElement.hidden;     // only cells of the open pane are kept up to date

  gallery.shown = shown;
  gallery.refresh = () => gallery.rooms.forEach((c) => { if (shown(c)) c.apply(); });
  gallery.reset = () => gallery.rooms.clear();
  gallery.setPos = (p) => { gallery.pos = Math.max(0, Math.min(100, p)); gallery.refresh(); };
  gallery.setMode = (m) => {
    gallery.mode = m;
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
    gallery.refresh();
  };
  modeButtons.forEach((b) => b.addEventListener('click', () => gallery.setMode(b.dataset.mode)));
})();
