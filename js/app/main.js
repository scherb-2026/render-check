/* ======================================================================
 * js/app/main.js — starts the app (must be the last script)
 * Uses: app/discovery.js, app/render-page.js
 * ====================================================================== */

loadFromServer().catch(() => showNotice('noserver'));
