/* ======================================================================
 * js/app/discovery.js — reads data/manifest.json (written by tools/get_images.py and tools/get_videos.py) into the tree dataset > colour > tool > boxes
 * Uses: core/config.js, core/util.js
 * ====================================================================== */

// Manifest (version 3): { datasets: [{ name, label, colors: [{ name, label, tools: [{ name, label, images: [room], videos: [room] }] }] }] }
// room = { name: 'camera02', original: 'path' | null, renders: ['path', …] }; paths are relative to data/ and use '/'.
// A cell with an original and renders is a comparison; with only one of the two it is a preview (see room.js).
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

function makeEntry(room, kind, urlOf) {
  const file = (p) => ({ url: urlOf(p), isVideo: VIDEO_RE.test(p), isExr: /\.exr$/i.test(p), name: p.split('/').pop() });
  const renders = (room.renders || []).map(file);
  const base = { name: room.name, title: room.name.replace(/^camera(\d+)$/i, 'Camera $1'), warning: null, kind };
  if (room.original && renders.length) return { ...base, original: file(room.original), renders, preview: null };
  if (room.original) return { ...base, original: null, renders: [file(room.original)], preview: 'original' };
  return renders.length ? { ...base, original: null, renders, preview: 'render' } : null;
}

// Manifest -> [{ name, label, total, sel, colors: [{ name, label, total, sel, tools: [{ name, label, total, entries: { image, video }, panes, kind }] }] }]
// `sel` remembers which colour / tool was open the last time, so coming back to a dataset or colour restores it.
function buildTree(manifest, urlOf) {
  const sorted = (list) => list.slice().sort((a, b) => collator.compare(a.name, b.name));
  return sorted(manifest.datasets).map((d) => {
    const colors = sorted(d.colors || []).map((c) => {
      const tools = sorted(c.tools || []).map((t) => {
        const entries = { image: [], video: [] };
        (t.images || []).forEach((r) => { const e = makeEntry(r, 'image', urlOf); if (e) entries.image.push(e); });
        (t.videos || []).forEach((r) => { const e = makeEntry(r, 'video', urlOf); if (e) entries.video.push(e); });
        entries.image.sort((a, b) => collator.compare(a.name, b.name));
        entries.video.sort((a, b) => collator.compare(a.name, b.name));
        return { name: t.name, label: t.label || t.name, entries, panes: {}, kind: null, total: entries.image.length + entries.video.length };
      }).filter((t) => t.total);
      return { name: c.name, label: c.label || c.name, tools, sel: 0, total: tools.reduce((n, t) => n + t.total, 0) };
    }).filter((c) => c.tools.length);
    return { name: d.name, label: d.label || d.name, colors, sel: 0, total: colors.reduce((n, c) => n + c.total, 0) };
  }).filter((d) => d.colors.length);
}

function validManifest(m) {
  if (!m || m.version !== 3 || !Array.isArray(m.datasets)) throw new Error('not a version 3 manifest');
  return m;
}

// The usual way: the manifest next to index.html (a local server or GitHub Pages).
async function loadFromServer() {
  const res = await fetch('data/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const manifest = validManifest(await res.json());
  renderAll(buildTree(manifest, (p) => 'data/' + encodePath(p)));
}
