/* ======================================================================
 * js/core/config.js — file-type pattern and shared DOM references
 * ====================================================================== */

const VIDEO_RE = /\.(mp4|m4v|webm|mov|ogv)$/i;
const roomsEl = document.getElementById('rooms');
const tpl = document.getElementById('roomTpl');
const sideTabs = document.getElementById('sideTabs');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let hovered = null;
