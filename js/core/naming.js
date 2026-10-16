/* ======================================================================
 * js/core/naming.js — which file in a room folder is the original and which are renders
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

function classify(files) {
  let renders = files.filter((f) => looksLikeRender(f.name));
  const originals = files.filter((f) => !renders.includes(f) && hasWord(f.name, ORIGINAL_WORDS));
  const others = files.filter((f) => !renders.includes(f) && !originals.includes(f));
  let original = originals[0] || others[0], warning = null;

  if (!original) {
    // Every file looks like a render: use one without a .001 number as the original, if there is one.
    original = renders.find((f) => !blenderNumbered(f.name)) || renders[0];
    renders = renders.filter((f) => f !== original);
    warning = 'Every file looks like a render, so ' + original.name + ' is used as the original. Name the original e.g. original.jpg if that’s wrong.';
  } else if (!renders.length) {
    renders = files.filter((f) => f !== original);
    if (renders.length) warning = 'No file is marked as a render, so ' + original.name + ' is used as the original and the rest as renders.';
  } else {
    const ignored = files.filter((f) => f !== original && !renders.includes(f));
    if (ignored.length) warning = 'Ignored ' + ignored.map((f) => f.name).join(', ') + ': only one original is used. Put “render” or “synthetic” in a file name, or give it a .001-style number, to add it as a render.';
  }
  return { original, renders, warning };
}
