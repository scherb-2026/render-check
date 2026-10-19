/* ======================================================================
 * js/core/naming.js — which file in a room folder is the original and which are renders (or whether there is nothing to compare)
 * Uses: config.js
 * ====================================================================== */

// ---------- classification ----------
const stemOf = (name) => name.replace(/\.[^.]+$/, '');
function hasWord(name, words) {
  const stem = stemOf(name).toLowerCase();
  const tokens = stem.split(/[^a-z0-9]+/);
  return words.some((w) => tokens.includes(w) || stem.startsWith(w));
}
// Blender numbering: name.001.png, name.002.png …
const blenderNumbered = (name) => /\.\d+$/.test(stemOf(name));
const looksLikeRender = (name) => hasWord(name, RENDER_WORDS) || blenderNumbered(name);

// Returns { original, renders, warning } for a comparison, or { preview, files } when there is nothing to compare: a single file,
// only renders, or only files named like originals. A preview is shown as it is (see room.js); `preview` says what the files are:
// 'render', 'original', or 'file' for a single file whose name says neither.
function classify(files) {
  const renders = files.filter((f) => looksLikeRender(f.name));
  const originals = files.filter((f) => !renders.includes(f) && hasWord(f.name, ORIGINAL_WORDS));
  const others = files.filter((f) => !renders.includes(f) && !originals.includes(f));

  if (renders.length === files.length) return { preview: 'render', files };
  if (originals.length === files.length) return { preview: 'original', files };
  if (files.length === 1) return { preview: 'file', files };

  const original = originals[0] || others[0];
  let rs = renders, warning = null;
  if (!rs.length) {
    rs = files.filter((f) => f !== original);
    warning = 'No file is marked as a render, so ' + original.name + ' is used as the original and the rest as renders.';
  } else {
    const ignored = files.filter((f) => f !== original && !rs.includes(f));
    if (ignored.length) warning = 'Ignored ' + ignored.map((f) => f.name).join(', ') + ': only one original is used. Put “render” or “synthetic” in a file name, or give it a .001-style number, to add it as a render.';
  }
  return { original, renders: rs, warning };
}
