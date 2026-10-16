/* ======================================================================
 * js/media/media.js — creates the <img>/<video>/<canvas> for a file; EXR files are decoded into a canvas
 * Uses: lib/exr.js
 * ====================================================================== */

// EXR files can't be shown by the browser: they are decoded here (one at a time, to keep memory low) and painted once
// into a canvas, which then behaves like an image everywhere else (distortion, masks, hand matching).
let exrQueue = Promise.resolve();
const decodeExr = (buf) => { const job = exrQueue.then(() => EXR.decode(buf)); exrQueue = job.catch(() => {}); return job; };

function makeMedia(src, isVideo, cls, label, isExr) {
  let el;
  if (isExr) {
    el = document.createElement('canvas');
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', label);
    el.exrPending = true;
    el.className = 'media ' + cls;
    fetch(src).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then((buf) => decodeExr(buf))
      .then((res) => {
        el.width = res.width; el.height = res.height;
        el.getContext('2d').putImageData(new ImageData(res.data, res.width, res.height), 0, 0);
        el.exrInfo = res.info; el.exrPending = false;
        el.dispatchEvent(new Event('load'));
      })
      .catch((err) => { el.exrError = err.message.replace(/[.\s]+$/, ''); el.exrPending = false; el.dispatchEvent(new Event('error')); });
    return el;
  }
  if (isVideo) {
    el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto';
    el.setAttribute('playsinline', '');
  } else {
    el = document.createElement('img');
    el.decoding = 'async'; el.alt = label;
  }
  el.className = 'media ' + cls;
  if (isVideo && !src.startsWith('blob:')) {
    // python -m http.server can't serve partial ranges, which breaks seeking.
    // Loading the whole file into memory first makes scrubbing and frame steps exact.
    fetch(src).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((blob) => { el.src = URL.createObjectURL(blob); })
      .catch(() => { el.src = src; });
  } else {
    el.src = src;
  }
  return el;
}
