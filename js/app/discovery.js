/* ======================================================================
 * js/app/discovery.js — finds the rooms and groups them into datasets: the server folder listing, rooms/manifest.json, or a folder picked by hand
 * Uses: core/naming.js
 * ====================================================================== */

// An entry is a comparison ({ original, renders }) or, when there is nothing to compare, a preview: `original` is null,
// `renders` holds the files that are there and `preview` says what they are ('render', 'original' or 'file').
function buildEntry(name, files, urlOf) {
  if (!files.length) return null;
  const c = classify(files);
  const m = (f) => ({ url: urlOf(f), isVideo: VIDEO_RE.test(f.name), isExr: /\.exr$/i.test(f.name), name: f.name });
  if (c.preview) {
    const rs = c.files.map(m);
    return { name, warning: null, kind: rs.some((x) => x.isVideo) ? 'video' : 'image', original: null, renders: rs, preview: c.preview };
  }
  const o = m(c.original), rs = c.renders.map(m);
  return { name, warning: c.warning, kind: [o, ...rs].some((x) => x.isVideo) ? 'video' : 'image', original: o, renders: rs, preview: null };
}

// One folder is one comparison. Its tab (Videos or Images) follows from what is in it: a folder of videos goes under Videos, a
// folder of images under Images (a still compared with a video counts as a video). Returns a list so callers can use flat().
function toEntries(name, files, urlOf) {
  files.sort((a, b) => collator.compare(a.name, b.name));
  const e = buildEntry(name, files, urlOf);
  return e ? [e] : [];
}

// ---------- why a folder was skipped ----------
const extOf = (n) => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
function skipReason(files, others, subdirs) {
  const unsupported = others.filter((n) => extOf(n));
  let r = 'no images or videos found';
  if (unsupported.length) {
    const exts = [...new Set(unsupported.map(extOf))].map((e) => '.' + e).join(', ');
    r += '. Found ' + unsupported.slice(0, 4).join(', ') + (unsupported.length > 4 ? '…' : '') +
         ', but this page can’t show ' + exts + ' files. Export images as PNG, JPG or EXR and videos as MP4 or WebM';
  }
  if (!files.length && subdirs && subdirs.length)
    r += '. It contains folders (' + subdirs.slice(0, 3).join(', ') + '); files must sit directly inside each room folder: rooms/<room>/ or rooms/<dataset>/<room>/, no deeper';
  return r + '.';
}

// ---------- source 1: the server's own folder listing ----------
// Works with python -m http.server, VS Code Live Server, npx serve / http-server, nginx/Apache autoindex.
async function listFolder(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const base = new URL(res.url || url, location.href);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const seen = new Set(), out = { dirs: [], files: [], others: [] };
  for (const a of doc.querySelectorAll('a[href]')) {
    let abs;
    try { abs = new URL(a.getAttribute('href'), base); } catch { continue; }
    abs.search = ''; abs.hash = '';
    if (abs.origin !== base.origin || !abs.pathname.startsWith(base.pathname)) continue;
    let rest = decodeURIComponent(abs.pathname.slice(base.pathname.length));
    const isDir = rest.endsWith('/');
    rest = rest.replace(/\/$/, '');
    if (!rest || rest.startsWith('.') || rest.includes('/') || seen.has(rest)) continue;
    seen.add(rest);
    if (MEDIA_RE.test(rest)) out.files.push({ name: rest, url: abs.href });
    else if (isDir || !extOf(rest) || /^\d+$/.test(extOf(rest))) out.dirs.push({ name: rest, url: abs.href.replace(/\/?$/, '/') });   // some servers omit the trailing slash
    else out.others.push(rest);
  }
  return out;
}

// ---------- source 1b: rooms/manifest.json ----------
// Static hosts (GitHub Pages) have no folder listings. tools/build-manifest.mjs writes rooms/manifest.json instead,
// and this turns it into the same shape listFolder() returns, so everything after it is shared.
// Each folder of rooms/ is { files, dirs, children }: `children` holds the file list of each of its subfolders, which is what
// lets a dataset folder (rooms/<dataset>/<room>/) be read without any folder listing.
const encodePath = (...parts) => parts.map(encodeURIComponent).join('/');
async function listManifest() {
  const res = await fetch('rooms/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const m = await res.json();
  if (!m || typeof m.rooms !== 'object') throw new Error('not a manifest');
  const dirOf = (parentUrl, name, node) => ({ name, url: parentUrl + encodePath(name) + '/', node });
  const dirs = Object.keys(m.rooms).map((name) => dirOf('rooms/', name, m.rooms[name]));
  const list = async (d) => {
    const node = d.node || { files: [], dirs: [] }, kids = node.children || {};
    const out = { dirs: (node.dirs || []).map((name) => dirOf(d.url, name, kids[name])), files: [], others: [] };
    for (const name of node.files || []) {
      if (MEDIA_RE.test(name)) out.files.push({ name, url: d.url + encodePath(name) });
      else out.others.push(name);
    }
    return out;
  };
  const loose = m.loose || [];
  return { root: { dirs, files: loose.filter((n) => MEDIA_RE.test(n)).map((name) => ({ name })), others: loose.filter((n) => !MEDIA_RE.test(n)) }, list, urlOf: (f) => f.url };
}

// ---------- datasets ----------
// rooms/ holds two kinds of folder. A folder with media files directly inside it is a room (one file, or only originals or only
// renders, is shown as a preview), and rooms that sit straight in rooms/ are grouped into the "Misc" dataset. A folder that holds
// room folders instead is a dataset, one tab on the left. A folder with subfolders is a room only if its own files make a full
// comparison; a lone stray file next to the room folders of a dataset does not turn the dataset into a room.
const MISC = 'misc';
async function collectDatasets({ root, list, urlOf }) {
  const skipped = [], sets = new Map();     // lower-case folder name -> { key, folder, entries }
  const add = (folder, entries) => {
    const key = folder.toLowerCase();
    if (!sets.has(key)) sets.set(key, { key, folder, entries: [] });
    sets.get(key).entries.push(...entries);
  };
  const dirNames = (r) => r.dirs.map((x) => x.name);
  await Promise.all(root.dirs.map(async (top) => {
    let first;
    try { first = await list(top); }
    catch (err) { skipped.push({ name: top.name, reason: 'couldn’t open this folder (' + err.message + ').' }); return; }
    const asRoom = first.files.length ? toEntries(top.name, first.files, urlOf) : [];
    if (asRoom.length && (!first.dirs.length || !asRoom[0].preview)) { add(MISC, asRoom); return; }
    if (!first.dirs.length) { skipped.push({ name: top.name, reason: skipReason(first.files, first.others, []) }); return; }
    const found = await Promise.all(first.dirs.map(async (sub) => {
      const label = top.name + '/' + sub.name;
      try {
        const r = await list(sub);
        const made = toEntries(sub.name, r.files, urlOf);
        if (!made.length) skipped.push({ name: label, reason: skipReason(r.files, r.others, dirNames(r)) });
        return made;
      } catch (err) {
        skipped.push({ name: label, reason: 'couldn’t open this folder (' + err.message + ').' });
        return [];
      }
    }));
    const entries = found.flat();
    if (entries.length) add(top.name, entries);
  }));
  // Datasets in folder-name order (01_ prefixes work), Misc always last. Misc is also where a real folder called "misc" ends up.
  const out = [...sets.values()].sort((a, b) => (a.key === MISC) - (b.key === MISC) || collator.compare(a.folder, b.folder));
  out.forEach((d) => { d.name = d.key === MISC ? 'Misc' : prettify(d.folder); });
  return { datasets: out, skipped };
}

// The server's own listing wins (it is always current while you edit locally); the manifest is the fallback.
async function loadFromServer() {
  let source = null, listed = null;
  try {
    const root = await listFolder('rooms/');
    listed = { root, list: (d) => listFolder(d.url), urlOf: (f) => f.url };
    if (root.dirs.length) source = listed;
  } catch { /* no listing: static host */ }
  if (!source) source = await listManifest().catch(() => listed);
  if (!source) throw new Error('no rooms source');
  const { datasets, skipped } = await collectDatasets(source);
  const { root } = source;
  const loose = root.files.map((f) => f.name).concat(root.others);
  renderAll(datasets, '', skipped, { subfolders: root.dirs.length, loose });
}

// ---------- source 2: pick a folder manually ----------
// The picked files carry their relative paths. They are put back into a tree of folders and handed to collectDatasets in
// the same shape the server listing has, so datasets, Misc and skip reasons work exactly as with a server.
document.getElementById('folderInput').addEventListener('change', async (e) => {
  const mkNode = () => ({ dirs: new Map(), files: [], others: [] });
  const tree = mkNode();
  let rootName = '';
  const loose = [];
  for (const f of e.target.files) {
    const parts = f.webkitRelativePath.split('/');
    rootName = parts[0];
    if (parts.slice(1).some((p) => p.startsWith('.'))) continue;
    if (parts.length < 3) { loose.push(f.name); continue; }
    let node = tree;
    for (const dir of parts.slice(1, -1)) {
      if (!node.dirs.has(dir)) node.dirs.set(dir, mkNode());
      node = node.dirs.get(dir);
    }
    (MEDIA_RE.test(f.name) ? node.files : node.others).push(f);
  }
  const dirsOf = (node) => [...node.dirs].map(([name, n]) => ({ name, node: n }));
  const source = {
    root: { dirs: dirsOf(tree), files: [], others: [] },
    list: async (d) => ({ dirs: dirsOf(d.node), files: d.node.files, others: d.node.others.map((f) => f.name) }),
    urlOf: (f) => URL.createObjectURL(f),
  };
  const { datasets, skipped } = await collectDatasets(source);
  renderAll(datasets, rootName ? rootName + '/' : '', skipped, { subfolders: tree.dirs.size, loose });
});
