/* ======================================================================
 * js/core/config.js — file-type patterns, naming words and shared DOM references
 * ====================================================================== */

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif|bmp|exr)$/i;
const VIDEO_RE = /\.(mp4|m4v|webm|mov|ogv)$/i;
const MEDIA_RE = /\.(jpe?g|png|webp|gif|avif|bmp|exr|mp4|m4v|webm|mov|ogv)$/i;
const RENDER_WORDS = ['render', 'synthetic'];
const ORIGINAL_WORDS = ['original', 'orig', 'photo', 'ref', 'real', 'footage'];
const roomsEl = document.getElementById('rooms');
const tpl = document.getElementById('roomTpl');
const sideTabs = document.getElementById('sideTabs');
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
let hovered = null;
