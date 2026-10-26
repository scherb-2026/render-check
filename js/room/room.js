/* ======================================================================
 * js/room/room.js — one cell of the gallery (or a preview cell when there is nothing to compare): picture with camera label, drag to compare, render tabs; plus the “can’t play this video” panel
 * Uses: core/*, media/media.js, room/gallery.js (mode and split are shared by all cells), room/transport.js (playback of all videos)
 * ====================================================================== */

function createRoom(entry) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const stage = node.querySelector('.stage');
  const blend = node.querySelector('.blend');
  const warnEl = node.querySelector('.warn');
  const tabsEl = node.querySelector('.tabs');

  // A preview cell has no original: it only holds renders, or only originals, or a single file, so there is nothing to compare yet.
  // Its files are shown one at a time (numbered tabs when there are several), with the video controls, but the
  // slider and the mode do not touch it. Inside, its files are kept in `renders`, and `photo` is null.
  const preview = !!entry.preview;
  const photo = preview ? null : makeMedia(entry.original.url, entry.original.isVideo, 'photo', 'Original', entry.original.isExr);
  const renders = entry.renders.map((r, i) => ({
    ...r, i, ready: false, checked: false, warnings: [], fix: null,
    el: makeMedia(r.url, r.isVideo, 'render inactive', preview ? 'Preview ' + (i + 1) : '3D render ' + (i + 1), r.isExr),
  }));
  renders.forEach((r) => blend.append(r.el));
  if (photo) blend.append(photo);
  node.classList.toggle('preview', preview);
  let active = renders[0];
  active.el.classList.remove('inactive');
  let photoReady = false;

  node.querySelector('.cam').textContent = entry.title || prettify(entry.name);
  const general = entry.warning ? [entry.warning] : [];
  function showWarnings() {
    const all = general.concat(active.warnings);
    warnEl.hidden = !all.length;
    warnEl.textContent = all.join(' ');
    renders.forEach((r) => { if (r.fix) r.fix.hidden = r !== active; });
  }

  // Everything the cells share (mode, split) comes from `gallery` (room/gallery.js).
  const apply = () => {
    const mode = preview ? 'view' : gallery.mode;
    stage.classList.remove('mode-slider', 'mode-fade', 'mode-diff', 'mode-view');
    stage.classList.add('mode-' + mode);
    if (photo) {
      photo.style.clipPath = mode === 'slider' ? 'inset(0 ' + (100 - gallery.pos) + '% 0 0)' : 'none';
      photo.style.opacity = mode === 'fade' ? gallery.pos / 100 : 1;
    }
  };

  // Dragging a picture moves the split of the whole gallery (in Fade mode: the original's opacity). The render tabs sit inside the picture and are left alone.
  let dragging = false;
  const fromEvent = (e) => { const r = stage.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || preview || gallery.mode === 'diff' || e.target.closest('.tabs')) return;
    dragging = true; stage.setPointerCapture(e.pointerId); gallery.setPos(fromEvent(e));
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) gallery.setPos(fromEvent(e)); });
  ['pointerup', 'pointercancel'].forEach((t) => stage.addEventListener(t, () => { dragging = false; }));
  node.addEventListener('pointerenter', () => { hovered = ctl; });
  node.addEventListener('pointerleave', () => { if (hovered === ctl) hovered = null; stage.classList.remove('solo'); });

  // ----- video (original + the active render) -----
  // The cell only knows which of its videos take part in playback; playing, pausing and seeking is done for all cells at once by the
  // bar at the bottom of the window (room/transport.js), which asks each cell for `videos`.
  let videos = [];
  const videoEls = [photo, ...renders.map((r) => r.el)].filter((el) => el && isVideoEl(el));
  function refreshVideos() {
    videos = [photo, active.el].filter((el) => el && isVideoEl(el));
    renders.forEach((r) => { if (r !== active && isVideoEl(r.el)) r.el.pause(); });
  }
  videoEls.forEach((el) => ['loadedmetadata', 'error'].forEach((t) => el.addEventListener(t, () => transport.update())));

  // ----- render tabs -----
  const tabButtons = renders.map((r) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = r.i + 1; b.title = r.name;
    b.setAttribute('aria-selected', r === active);
    b.tabIndex = r === active ? 0 : -1;
    b.addEventListener('click', () => select(r.i));
    b.addEventListener('keydown', (e) => {
      const n = renders.length;
      const to = { ArrowRight: (r.i + 1) % n, ArrowLeft: (r.i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); select(to); tabButtons[to].focus(); }
    });
    return b;
  });
  if (renders.length > 1) { tabsEl.hidden = false; tabsEl.append(...tabButtons); }

  function select(i) {
    const next = renders[i];
    if (!next || next === active) return;
    active.el.classList.add('inactive');
    active = next;
    active.el.classList.remove('inactive');
    if (preview && active.ready) setAspect(...dims(active.el));
    refreshVideos();
    transport.cellChanged();             // the new render joins the playback at the current time
    tabButtons.forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
    showWarnings();
  }
  // ----- loading and size checks -----
  function setAspect(w, h) {
    if (!w || !h) return;
    stage.style.aspectRatio = w + ' / ' + h;
    node.style.setProperty('--ar', w / h);
    queueFit();                          // the gallery's cell size depends on the pictures' aspect ratio (render-page.js)
  }
  function check(r) {
    if (!photoReady || !r.ready || r.checked) return;
    r.checked = true;
    const [pw, ph] = dims(photo), [rw, rh] = dims(r.el);
    if (Math.abs(pw / ph - rw / rh) / (pw / ph) > 0.005)
      r.warnings.push('Aspect ratios differ, so this render is stretched to fit. Render at the original’s aspect ratio for an accurate comparison.');
    if (isVideoEl(photo) && isVideoEl(r.el) && Math.abs(photo.duration - r.el.duration) > 0.1)
      r.warnings.push('Lengths differ (original ' + fmt(photo.duration) + ', render ' + fmt(r.el.duration) + '); playback stops at the shorter one.');
    if (r === active) showWarnings();
  }
  if (photo) {
    photo.addEventListener(isVideoEl(photo) ? 'loadedmetadata' : 'load', () => {
      photoReady = true;
      setAspect(...dims(photo));
      renders.forEach(check);
    }, { once: true });
    photo.addEventListener('error', () => {
      if (!isVideoEl(photo)) { general.push(photo.exrError ? 'Couldn’t read the original (' + entry.original.name + '): ' + photo.exrError + '.' : 'Couldn’t load the original (' + entry.original.name + ').'); showWarnings(); return; }
      if (photo.getAttribute('src')) warnEl.before(makeFix('original', entry.original.name));
    });
  }
  renders.forEach((r) => {
    r.el.addEventListener(isVideoEl(r.el) ? 'loadedmetadata' : 'load', () => {
      r.ready = true;
      if (preview ? r === active : !photoReady) setAspect(...dims(r.el));
      check(r);
    }, { once: true });
    r.el.addEventListener('error', () => {
      const what = preview ? 'this file' : 'this render';
      if (!isVideoEl(r.el)) { r.warnings.push(r.el.exrError ? 'Couldn’t read ' + what + ' (' + r.name + '): ' + r.el.exrError + '.' : 'Couldn’t load ' + what + ' (' + r.name + ').'); showWarnings(); return; }
      if (!r.el.getAttribute('src') || r.fix) return;
      r.fix = makeFix(preview ? 'file' : 'render', r.name);
      warnEl.before(r.fix);
      showWarnings();
    });
  });

  const ctl = {
    node, stage, apply, select,
    get hasVideo() { return videoEls.length > 0; },
    get videos() { return videos.filter((v) => !v.error); },       // the playable videos taking part in playback (original + active render)
    pauseVideos() { videoEls.forEach((v) => v.pause()); },
  };
  gallery.rooms.add(ctl);
  refreshVideos();
  showWarnings();
  apply();
  return node;
}

function makeFix(which, file) {
  const base = file.replace(/\.[^.]+$/, '');
  const cmd = 'ffmpeg -i "' + file + '" -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -an -movflags +faststart "' + base + '_web.mp4"';
  const box = document.createElement('div');
  box.className = 'fix';
  box.innerHTML =
    '<p><strong>The ' + which + ' video (' + escapeHtml(file) + ') can’t be played by this browser.</strong> ' +
    'The file loaded, but the page uses the browser’s built-in video player, and it can’t decode how this video is encoded. ' +
    'Usually that means H.265/HEVC, 10-bit, or a 4:4:4/4:2:2 color format, which desktop players like VLC handle but browsers don’t. ' +
    'Run this on the source file to make a browser-friendly copy. ' +
    '(Or run <code>python tools/get_videos.py &lt;root&gt;</code> again: it converts every video that browsers can’t play while it copies them into <code>data/</code>.)</p>' +
    '<div class="cmd"><pre></pre><button type="button">Copy</button></div>';
  box.querySelector('pre').textContent = cmd;
  const btn = box.querySelector('button');
  btn.addEventListener('click', () => {
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(cmd).then(done, () => selectText(box.querySelector('pre')));
    else selectText(box.querySelector('pre'));
  });
  return box;
}
