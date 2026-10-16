/* ======================================================================
 * js/app/render-page.js — builds the page from the discovered rooms and shows notices for skipped folders
 * Uses: room/room.js
 * ====================================================================== */

function renderAll(entries, sourceLabel, skipped = [], info = {}) {
  roomsEl.innerHTML = '';
  skipped.sort((a, b) => collator.compare(a.name, b.name));
  if (!entries.length) { showNotice('empty', skipped, info); return; }
  if (skipped.length) roomsEl.appendChild(skippedBox(skipped, false));
  entries.sort((a, b) => collator.compare(a.name, b.name)).forEach((e) => roomsEl.appendChild(createRoom(e)));
  document.getElementById('count').textContent =
    entries.length + (entries.length === 1 ? ' comparison' : ' comparisons') + (sourceLabel ? ' from ' + sourceLabel : '');
}

function skippedBox(skipped, inNotice) {
  const box = document.createElement(inNotice ? 'div' : 'details');
  box.className = inNotice ? 'skipped-list' : 'skipped';
  box.innerHTML = (inNotice ? '<p>Here’s what the page found:</p>'
    : '<summary>' + skipped.length + ' folder' + (skipped.length === 1 ? ' was' : 's were') + ' skipped</summary>') + '<ul></ul>';
  const ul = box.querySelector('ul');
  skipped.forEach((s) => {
    const li = document.createElement('li');
    const code = document.createElement('code'); code.textContent = s.name + '/';
    li.append(code, ' — ' + s.reason);
    ul.appendChild(li);
  });
  return box;
}

function showNotice(kind, skipped = [], info = {}) {
  const tree = 'rooms/\n  kitchen/\n    original.jpg\n    render_v1.png\n    render_v2.png\n  walkthrough/\n    footage.mp4\n    render.mp4';
  let msg;
  if (kind === 'noserver') {
    msg = '<h2>Couldn’t read the rooms folder</h2><p>Open this page through a local server rather than by double-clicking it. In this folder run <code>python -m http.server</code> and go to <code>http://localhost:8000</code>. Or pick the folder by hand with “Open folder…” above. On a static host such as GitHub Pages there are no folder listings: run <code>node tools/build-manifest.mjs</code> so that <code>rooms/manifest.json</code> exists.</p>';
  } else if (!info.subfolders) {
    msg = '<h2>No room folders found</h2><p>The page found the <code>rooms</code> folder but no subfolders inside it. ' +
      (info.loose && info.loose.length
        ? 'These files sit directly in <code>rooms/</code>: <code>' + escapeHtml(info.loose.slice(0, 6).join(', ')) + (info.loose.length > 6 ? '…' : '') + '</code>. Move each original and its renders into a folder of their own.'
        : 'Make sure <code>rooms</code> sits next to <code>index.html</code> and that you started the server in that same folder.') + '</p>';
  } else {
    msg = '<h2>No comparisons found</h2><p>The page found ' + info.subfolders + ' folder' + (info.subfolders === 1 ? '' : 's') +
      ' in <code>rooms/</code>, but none had a usable original and render.</p>';
  }
  roomsEl.innerHTML = '<div class="notice">' + msg + '</div>';
  const notice = roomsEl.firstChild;
  if (skipped.length) notice.appendChild(skippedBox(skipped, true));
  const p = document.createElement('p'); p.textContent = 'Expected layout:'; notice.appendChild(p);
  const pre = document.createElement('pre'); pre.textContent = tree; notice.appendChild(pre);
  document.getElementById('count').textContent = '';
}
