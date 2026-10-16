/* ======================================================================
 * js/app/discovery.js — finds the rooms: the server folder listing, rooms/manifest.json, or a folder picked by hand
 * Uses: core/naming.js
 * ====================================================================== */

function toEntry(name, files, urlOf) {
  files.sort((a, b) => collator.compare(a.name, b.name));
  if (files.length < 2) return null;
  const { original, renders, warning } = classify(files);
  if (!original || !renders.length) return null;
  const m = (f) => ({ url: urlOf(f), isVideo: VIDEO_RE.test(f.name), isExr: /\.exr$/i.test(f.name), name: f.name });
  return { name, warning, original: m(original), renders: renders.map(m) };
}

// ---------- why a folder was skipped ----------
const extOf = (n) => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
function skipReason(files, others, subdirs) {
  const unsupported = others.filter((n) => extOf(n));
  let r;
  if (files.length === 0) r = 'no images or videos found';
  else if (files.length === 1) r = 'only one usable file (' + files[0].name + '), needs an original and at least one render';
  else r = 'couldn’t pick an original and a render';
  if (unsupported.length) {
    const exts = [...new Set(unsupported.map(extOf))].map((e) => '.' + e).join(', ');
    r += '. Found ' + unsupported.slice(0, 4).join(', ') + (unsupported.length > 4 ? '…' : '') +
         ', but this page can’t show ' + exts + ' files. Export images as PNG, JPG or EXR and videos as MP4 or WebM';
  }
  if (!files.length && subdirs && subdirs.length)
    r += '. It contains folders (' + subdirs.slice(0, 3).join(', ') + '); files must sit directly inside each room folder, one level below rooms/';
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
const encodePath = (...parts) => parts.map(encodeURIComponent).join('/');
async function listManifest() {
  const res = await fetch('rooms/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const m = await res.json();
  if (!m || typeof m.rooms !== 'object') throw new Error('not a manifest');
  const dirs = Object.keys(m.rooms).map((name) => ({ name, url: 'rooms/' + encodePath(name) + '/' }));
  const list = (d) => {
    const room = m.rooms[d.name] || { files: [], dirs: [] };
    const out = { dirs: (room.dirs || []).map((name) => ({ name })), files: [], others: [] };
    for (const name of room.files || []) {
      if (MEDIA_RE.test(name)) out.files.push({ name, url: d.url + encodePath(name) });
      else out.others.push(name);
    }
    return out;
  };
  const loose = m.loose || [];
  return { root: { dirs, files: loose.filter((n) => MEDIA_RE.test(n)).map((name) => ({ name })), others: loose.filter((n) => !MEDIA_RE.test(n)) }, list };
}

// The server's own listing wins (it is always current while you edit locally); the manifest is the fallback.
async function loadFromServer() {
  let source = null, listed = null;
  try {
    const root = await listFolder('rooms/');
    listed = { root, list: (d) => listFolder(d.url) };
    if (root.dirs.length) source = listed;
  } catch { /* no listing: static host */ }
  if (!source) source = await listManifest().catch(() => listed);
  if (!source) throw new Error('no rooms source');
  const { root, list } = source;
  const skipped = [];
  const entries = await Promise.all(root.dirs.map(async (d) => {
    try {
      const { files, others, dirs } = await list(d);
      const entry = toEntry(d.name, files, (f) => f.url);
      if (!entry) skipped.push({ name: d.name, reason: skipReason(files, others, dirs.map((x) => x.name)) });
      return entry;
    } catch (err) {
      skipped.push({ name: d.name, reason: 'couldn’t open this folder (' + err.message + ').' });
      return null;
    }
  }));
  const loose = root.files.map((f) => f.name).concat(root.others);
  renderAll(entries.filter(Boolean), '', skipped, { subfolders: root.dirs.length, loose });
}

// ---------- source 2: pick a folder manually ----------
document.getElementById('folderInput').addEventListener('change', (e) => {
  const groups = new Map();
  let rootName = '';
  const loose = [];
  for (const f of e.target.files) {
    const parts = f.webkitRelativePath.split('/');
    rootName = parts[0];
    if (f.name.startsWith('.')) continue;
    if (parts.length < 3) { loose.push(f.name); continue; }
    const sub = parts[parts.length - 2];
    if (!groups.has(sub)) groups.set(sub, { files: [], others: [] });
    (MEDIA_RE.test(f.name) ? groups.get(sub).files : groups.get(sub).others).push(f);
  }
  const entries = [], skipped = [];
  for (const [name, g] of groups) {
    const entry = toEntry(name, g.files, (f) => URL.createObjectURL(f));
    if (entry) entries.push(entry);
    else skipped.push({ name, reason: skipReason(g.files, g.others.map((f) => f.name)) });
  }
  renderAll(entries, rootName ? rootName + '/' : '', skipped, { subfolders: groups.size, loose });
});
