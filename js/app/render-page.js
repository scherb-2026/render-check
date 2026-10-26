/* ======================================================================
 * js/app/render-page.js — builds the page from the tree: the tab rows at the top (dataset, colour, tool, view), the gallery
 * Uses: room/room.js, app/discovery.js
 * ====================================================================== */

// Four levels. Three tab rows at the top choose dataset, then colour, then tool; in the View row under the tool row, a toggle splits the tool's
// pictures into Images and Videos. A tool's gallery (a grid of cells, one per camera) is built the first time it is shown (so nothing of tools
// nobody opens is loaded or decoded) and then kept, only hidden.
let tree = [], cur = null;          // cur = { ds, color, tool, kind } (the nodes, not indexes)
const panes = [];                                 // every built pane: { el, tool, kind }
const dsTabs = $('dsTabs'), colorTabs = $('colorTabs'), toolTabs = $('toolTabs'), topbars = $('topbars');
const KINDS = ['video', 'image'];                 // in order of preference: a tool opens on its videos when it has any, else on its images

// A row of tab buttons. items: [{ label, n, title }] or, for the tool row, [{ label, counts: { image, video }, title }]; arrow keys move the selection and
// keep the focus on the row. opts.minW (px): the row may be split into several equal lines, each button at least that wide (see layoutRow).
const ICON_IMAGE = '<svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>';
const ICON_VIDEO = '<svg class="ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>';
const rowLayouts = new WeakMap();                 // row -> { buttons, minW, sig }
function fillRow(row, items, selected, onPick, opts = {}) {
  row.innerHTML = '';
  const buttons = items.map((it, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.i = i;
    b.setAttribute('aria-selected', i === selected); b.tabIndex = i === selected ? 0 : -1;
    if (it.title) b.title = it.title;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = it.label;
    b.append(lbl);
    if (it.counts) {                              // image count and video count, each with its icon
      [['image', ICON_IMAGE, 'with an image'], ['video', ICON_VIDEO, 'with a video']].forEach(([k, icon, what]) => {
        const c = document.createElement('span'); c.className = 'cnt' + (it.counts[k] ? '' : ' zero');
        c.innerHTML = icon + '<span class="num"></span>'; c.querySelector('.num').textContent = it.counts[k];
        c.title = it.counts[k] + (it.counts[k] === 1 ? ' camera ' : ' cameras ') + what;
        b.append(c);
      });
    } else {
      const n = document.createElement('span'); n.className = 'n'; n.textContent = it.n;
      b.append(n);
    }
    if (!opts.minW) row.appendChild(b);
    return b;
  });
  if (opts.minW) { rowLayouts.set(row, { buttons, minW: opts.minW, sig: '' }); row.classList.add('lines'); layoutRow(row); }
  row.onclick = (e) => { const b = e.target.closest('button'); if (b && +b.dataset.i !== selected) onPick(+b.dataset.i); };
  row.onkeydown = (e) => {
    const to = { ArrowLeft: selected - 1, ArrowUp: selected - 1, ArrowRight: selected + 1, ArrowDown: selected + 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined || to < 0 || to >= items.length) return;
    e.preventDefault(); onPick(to); row.querySelector('[data-i="' + to + '"]').focus();
  };
}
// A row with a minimum button width: when the buttons don't fit on one line at that width, the row becomes two (or more) lines holding
// the same number of buttons (differing by at most one); the buttons of each line share its width. Runs again when the row's width changes.
function layoutRow(row) {
  const st = rowLayouts.get(row), w = row.clientWidth;
  if (!st || !w) return;
  const n = st.buttons.length, lines = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / st.minW))));
  const sizes = Array.from({ length: lines }, (_, i) => Math.floor(n / lines) + (i < n % lines ? 1 : 0));
  const sig = sizes.join(',');
  if (sig === st.sig) return;
  st.sig = sig; row.innerHTML = '';
  let k = 0;
  sizes.forEach((size) => {
    const line = document.createElement('div'); line.className = 'tl';
    line.append(...st.buttons.slice(k, k + size)); k += size; row.append(line);
  });
}
const TOOL_MIN_W = 190;                           // px: 8 letters of the tool name + the image and the video count with their icons + padding
new ResizeObserver(() => layoutRow(toolTabs)).observe(toolTabs);

// ---- gallery size ----
// The cells are 1 px apart and as large as they can be while up to 12 of them fit in the window at once (the part of it between the tab rows and, in the video view, the playback bar), given the
// pictures' aspect ratio. The grid is centred horizontally and vertically in that part of the window (`#rooms` is as high as the part, the pane has
// auto margins). More than 12 cameras scroll, with the cells sized as for 12. On a narrow window the cells keep a minimum width and the gallery scrolls.
const FIT_MAX = 12, FIT_GAP = 1, FIT_MIN_W = 150;
let fitQueued = false;
function fitGallery() {
  const p = panes.find((x) => !x.el.hidden);
  if (!p) return;
  const pane = p.el;
  const cells = pane.children.length, n = Math.min(cells, FIT_MAX);
  const first = pane.querySelector('.room');
  const ar = parseFloat(first && first.style.getPropertyValue('--ar')) || 1.6;
  const availW = roomsEl.clientWidth, availH = window.innerHeight - (topbars.hidden ? 0 : topbars.offsetHeight) - (transport.bar.hidden ? 0 : transport.bar.offsetHeight);
  roomsEl.style.setProperty('--avail-h', availH + 'px');
  const extra = 2;
  let best = 0, cols = 1;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const w = Math.min((availW - FIT_GAP * (c - 1)) / c, ((availH - FIT_GAP * (rows - 1)) / rows - extra) * ar);
    if (w > best) { best = w; cols = c; }
  }
  if (best < FIT_MIN_W) {                         // too small to fit: as many columns as the width allows, then scroll
    cols = Math.max(1, Math.floor((availW + FIT_GAP) / (FIT_MIN_W + FIT_GAP)));
    best = (availW - FIT_GAP * (cols - 1)) / cols;
  }
  pane.style.gridTemplateColumns = 'repeat(' + cols + ', ' + Math.floor(best) + 'px)';
}
function queueFit() { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitGallery(); }); } }
window.addEventListener('resize', queueFit);
new ResizeObserver(queueFit).observe(topbars);
new ResizeObserver(queueFit).observe(transport.bar);

function showTool(ds, color, tool, kind) {
  kind = kind && tool.entries[kind].length ? kind : tool.kind && tool.entries[tool.kind].length ? tool.kind : KINDS.find((k) => tool.entries[k].length);
  cur = { ds, color, tool, kind }; hovered = null;
  ds.sel = ds.colors.indexOf(color); color.sel = color.tools.indexOf(tool); tool.kind = kind;
  const index = tree.indexOf(ds);
  if (!tool.panes[kind]) {
    const pane = document.createElement('div');
    pane.className = 'pane'; pane.setAttribute('role', 'tabpanel');
    pane.id = 'pane-' + [index, ds.sel, color.sel, kind].join('-');
    tool.entries[kind].forEach((e) => pane.appendChild(createRoom(e)));
    roomsEl.appendChild(pane); tool.panes[kind] = pane; panes.push({ el: pane, tool, kind });
  }
  panes.forEach((p) => { p.el.hidden = !(p.tool === tool && p.kind === kind); });
  gallery.refresh();                      // the cells of the pane that was hidden catch up with the shared mode and split
  transport.paneChanged();                // video pane: the playback bar appears and everything starts from the beginning; otherwise it hides
  fitGallery();

  // The left end of each row shows its name and a statistic: how many datasets / colours of this dataset / tools of this colour / cameras of this view
  const stat = (id, n, one, many) => { const el = $(id); el.querySelector('.num').textContent = n; el.title = n + ' ' + (n === 1 ? one : many); };
  stat('statDs', tree.length, 'dataset', 'datasets');
  stat('statColor', ds.colors.length, 'colour', 'colours');
  stat('statTool', color.tools.length, 'tool', 'tools');
  stat('statView', tool.entries[kind].length, kind === 'video' ? 'camera with a video' : 'camera with an image', kind === 'video' ? 'cameras with videos' : 'cameras with images');
  fillRow(dsTabs, tree.map((d) => ({ label: d.label, n: d.total, title: d.name })), index, (i) => showDataset(tree[i]));
  fillRow(colorTabs, ds.colors.map((c) => ({ label: c.label, n: c.total, title: c.name })), ds.sel, (i) => showColor(ds, ds.colors[i]));
  fillRow(toolTabs, color.tools.map((t) => ({ label: t.label, counts: { image: t.entries.image.length, video: t.entries.video.length }, title: t.name })), color.sel, (i) => showTool(ds, color, color.tools[i]), { minW: TOOL_MIN_W });
  sideTabs.querySelectorAll('button').forEach((b) => {
    const n = tool.entries[b.dataset.tab].length;
    b.querySelector('.n').textContent = n; b.disabled = !n;
    b.setAttribute('aria-selected', b.dataset.tab === kind);
    b.setAttribute('aria-controls', tool.panes[b.dataset.tab] ? tool.panes[b.dataset.tab].id : '');
  });

  window.scrollTo(0, 0);
}
function showColor(ds, color) { showTool(ds, color, color.tools[Math.min(color.sel, color.tools.length - 1)]); }
function showDataset(ds) { showColor(ds, ds.colors[Math.min(ds.sel, ds.colors.length - 1)]); }

sideTabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && cur && b.dataset.tab !== cur.kind) showTool(cur.ds, cur.color, cur.tool, b.dataset.tab); });
sideTabs.addEventListener('keydown', (e) => {
  const to = { ArrowUp: 'video', ArrowLeft: 'video', Home: 'video', ArrowDown: 'image', ArrowRight: 'image', End: 'image' }[e.key];
  if (to && cur && cur.tool.entries[to].length) { e.preventDefault(); showTool(cur.ds, cur.color, cur.tool, to); sideTabs.querySelector('[data-tab="' + to + '"]').focus(); }
});

function renderAll(sets) {
  roomsEl.innerHTML = ''; panes.length = 0; hovered = null; cur = null; gallery.reset(); transport.paneChanged();
  topbars.hidden = true; roomsEl.style.removeProperty('--avail-h');
  tree = sets;
  const total = tree.reduce((n, d) => n + d.total, 0);
  if (!total) { showNotice('empty'); return; }
  topbars.hidden = false;
  showDataset(tree[0]);
}

function showNotice(kind) {
  const layout = 'data/\n  manifest.json\n  <dataset>/<colour>/<tool>/images/original/camera02.jpg\n  <dataset>/<colour>/<tool>/images/render/…/synthetic_camera02.png';
  const msg = {
    noserver: '<h2>Couldn’t read data/manifest.json</h2><p>Either the page was opened without a server, or the data folder hasn’t been filled yet. ' +
      'Fill it with <code>python tools/get_images.py &lt;root&gt;</code> (and <code>tools/get_videos.py</code>), where <code>&lt;root&gt;</code> is the pipeline’s dataset folder. ' +
      'Then, in this folder, run <code>python -m http.server</code> and open <code>http://localhost:8000</code>.</p>',
    empty: '<h2>Nothing to show</h2><p><code>data/manifest.json</code> lists no images or videos. Run <code>tools/get_images.py</code> or <code>tools/get_videos.py</code> on the pipeline’s dataset folder.</p>',
  }[kind];
  roomsEl.innerHTML = '<div class="notice">' + msg + '<p>Expected layout:</p><pre></pre></div>';
  roomsEl.querySelector('pre').textContent = layout;
  topbars.hidden = true; roomsEl.style.removeProperty('--avail-h');
}
