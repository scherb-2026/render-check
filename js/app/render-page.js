/* ======================================================================
 * js/app/render-page.js — builds the page from the discovered datasets and rooms (dataset bar, Videos/Images bar, next-dataset button) and shows notices for skipped folders
 * Uses: room/room.js
 * ====================================================================== */

// The page has three levels. A bar on the far left switches between datasets (folders of rooms, plus "Misc" for rooms that sit
// directly in rooms/). Inside a dataset, the second bar splits its comparisons into Videos and Images. A dataset's tab is built
// the first time it is shown (so the media of datasets nobody opened is not loaded or decoded up front) and then kept, only hidden.
// At the bottom of every dataset but the last, a button leads to the next one.
let datasets = [], activeSet = null, activeTab = null;
const dsTabs = $('dsTabs'), nextDs = $('nextDs');

function showDataset(index, kind) {
  const ds = datasets[index];
  if (!ds) return;
  kind = kind || ds.kind || (ds.entries.video.length ? 'video' : 'image');   // each dataset remembers its tab; Videos first, else Images
  if (!ds.entries[kind].length) return;
  activeSet = ds; activeTab = kind; ds.kind = kind; hovered = null;
  if (!ds.panes[kind]) {
    const pane = document.createElement('div');
    pane.className = 'pane'; pane.id = 'pane-' + index + '-' + kind; pane.setAttribute('role', 'tabpanel');
    ds.entries[kind].forEach((e) => pane.appendChild(createRoom(e)));
    roomsEl.appendChild(pane); ds.panes[kind] = pane;
  }
  for (const d of datasets) for (const k of Object.keys(d.panes)) d.panes[k].hidden = !(d === ds && k === kind);
  dsTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', +b.dataset.ds === index));
  sideTabs.querySelectorAll('button').forEach((b) => {
    const n = ds.entries[b.dataset.tab].length;
    b.querySelector('.n').textContent = n; b.disabled = !n;
    b.setAttribute('aria-selected', b.dataset.tab === kind);
    b.setAttribute('aria-controls', 'pane-' + index + '-' + b.dataset.tab);
  });
  const next = datasets[index + 1];
  nextDs.hidden = !next;
  if (next) {
    nextDs.querySelector('.nm').textContent = next.name;
    nextDs.querySelector('.cnt').textContent = next.total + (next.total === 1 ? ' room' : ' rooms');
    nextDs.querySelector('button').setAttribute('aria-label', 'Next dataset: ' + next.name);
  }
  window.scrollTo(0, 0);
}
const showTab = (kind) => showDataset(datasets.indexOf(activeSet), kind);

dsTabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && datasets[+b.dataset.ds] !== activeSet) showDataset(+b.dataset.ds); });
dsTabs.addEventListener('keydown', (e) => {
  const i = datasets.indexOf(activeSet);
  const to = { ArrowUp: i - 1, ArrowLeft: i - 1, ArrowDown: i + 1, ArrowRight: i + 1, Home: 0, End: datasets.length - 1 }[e.key];
  if (to !== undefined && datasets[to]) { e.preventDefault(); showDataset(to); dsTabs.querySelector('[data-ds="' + to + '"]').focus(); }
});
nextDs.addEventListener('click', () => showDataset(datasets.indexOf(activeSet) + 1));

sideTabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.tab !== activeTab) showTab(b.dataset.tab); });
sideTabs.addEventListener('keydown', (e) => {
  const to = { ArrowUp: 'video', ArrowLeft: 'video', Home: 'video', ArrowDown: 'image', ArrowRight: 'image', End: 'image' }[e.key];
  if (to && activeSet && activeSet.entries[to].length) { e.preventDefault(); showTab(to); sideTabs.querySelector('[data-tab="' + to + '"]').focus(); }
});

// sets: [{ key, folder, name, entries: [entry, …] }] in display order, as built by collectDatasets
function renderAll(sets, sourceLabel, skipped = [], info = {}) {
  roomsEl.innerHTML = ''; dsTabs.innerHTML = '';
  datasets = []; activeSet = null; activeTab = null; hovered = null;
  sideTabs.hidden = true; dsTabs.hidden = true; nextDs.hidden = true; document.body.classList.remove('has-side');
  skipped.sort((a, b) => collator.compare(a.name, b.name));
  const total = sets.reduce((n, d) => n + d.entries.length, 0);
  if (!total) { showNotice('empty', skipped, info); return; }
  if (skipped.length) roomsEl.appendChild(skippedBox(skipped, false));
  datasets = sets.map((d) => {
    const entries = { video: [], image: [] };
    d.entries.sort((a, b) => collator.compare(a.name, b.name)).forEach((e) => entries[e.kind].push(e));
    return { name: d.name, folder: d.folder, entries, panes: {}, kind: null, total: d.entries.length };
  });
  datasets.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.ds = i; b.setAttribute('aria-selected', 'false');
    b.title = d.name === 'Misc' ? 'Rooms that are not in a dataset folder' : 'rooms/' + d.folder + '/';
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = d.name;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = d.total;
    b.append(lbl, n); dsTabs.appendChild(b);
  });
  dsTabs.hidden = false; sideTabs.hidden = false; document.body.classList.add('has-side');
  showDataset(0);
  document.getElementById('count').textContent =
    total + (total === 1 ? ' room' : ' rooms') + ' in ' + datasets.length + (datasets.length === 1 ? ' dataset' : ' datasets') +
    (sourceLabel ? ' from ' + sourceLabel : '');
}

function skippedBox(skipped, inNotice) {
  const box = document.createElement(inNotice ? 'div' : 'details');
  box.className = inNotice ? 'skipped-list' : 'skipped';
  box.innerHTML = (inNotice ? '<p>Here’s what the page found:</p>'
    : '<summary>' + skipped.length + ' folder' + (skipped.length === 1 ? ' was' : 's were') + ' skipped</summary>') + '<ul></ul>';
  const ul = box.querySelector('ul');
  skipped.forEach((s) => {
    const li = document.createElement('li');
    const code = document.createElement('code'); code.textContent = s.name + '/';
    li.append(code, ' — ' + s.reason);
    ul.appendChild(li);
  });
  return box;
}

function showNotice(kind, skipped = [], info = {}) {
  const tree = 'rooms/\n  kitchen/                (a room on its own: shown under "Misc")\n    original.jpg\n    render_v1.png\n    render_v2.png\n  apartment_a/            (a dataset: a folder of rooms)\n    living-room/\n      original.jpg\n      render.png\n    walkthrough/\n      footage.mp4\n      render.mp4';
  let msg;
  if (kind === 'noserver') {
    msg = '<h2>Couldn’t read the rooms folder</h2><p>Open this page through a local server rather than by double-clicking it. In this folder run <code>python -m http.server</code> and go to <code>http://localhost:8000</code>. Or pick the folder by hand with “Open folder…” above. On a static host such as GitHub Pages there are no folder listings: run <code>node tools/build-manifest.mjs</code> so that <code>rooms/manifest.json</code> exists.</p>';
  } else if (!info.subfolders) {
    msg = '<h2>No room folders found</h2><p>The page found the <code>rooms</code> folder but no subfolders inside it. ' +
      (info.loose && info.loose.length
        ? 'These files sit directly in <code>rooms/</code>: <code>' + escapeHtml(info.loose.slice(0, 6).join(', ')) + (info.loose.length > 6 ? '…' : '') + '</code>. Move each original and its renders into a folder of their own.'
        : 'Make sure <code>rooms</code> sits next to <code>index.html</code> and that you started the server in that same folder.') + '</p>';
  } else {
    msg = '<h2>No rooms found</h2><p>The page found ' + info.subfolders + ' folder' + (info.subfolders === 1 ? '' : 's') +
      ' in <code>rooms/</code>, but none had an image or video this page can show.</p>';
  }
  roomsEl.innerHTML = '<div class="notice">' + msg + '</div>';
  const notice = roomsEl.firstChild;
  if (skipped.length) notice.appendChild(skippedBox(skipped, true));
  const p = document.createElement('p'); p.textContent = 'Expected layout:'; notice.appendChild(p);
  const pre = document.createElement('pre'); pre.textContent = tree; notice.appendChild(pre);
  document.getElementById('count').textContent = '';
}
