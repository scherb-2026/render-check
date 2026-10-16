/* ======================================================================
 * js/core/util.js — small helpers used everywhere (names, time, media size, escaping)
 * ====================================================================== */

const prettify = (name) => name.replace(/[_-]+/g, ' ').replace(/^\d+\s+/, '').replace(/^./, (c) => c.toUpperCase());
const fmt = (t) => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
};

const dims = (el) => el.tagName === 'VIDEO' ? [el.videoWidth, el.videoHeight] : el.tagName === 'CANVAS' ? [el.width, el.height] : [el.naturalWidth, el.naturalHeight];

const isVideoEl = (el) => el.tagName === 'VIDEO';

const escapeHtml = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

const $ = (id) => document.getElementById(id);
