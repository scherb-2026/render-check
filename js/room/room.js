/* ======================================================================
 * js/room/room.js — one comparison box (or a preview box when there is nothing to compare): modes, slider, gamma, sweep, video sync, render tabs; plus the “can’t play this video” panel
 * Uses: core/*, media/media.js
 * ====================================================================== */

let gammaCount = 0;

function createRoom(entry) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const stage = node.querySelector('.stage');
  const blend = node.querySelector('.blend');
  const track = node.querySelector('.track');
  const handle = node.querySelector('.handle');
  const gain = node.querySelector('.gamma');
  // Gamma via an SVG filter (CSS has no gamma filter). Applied after blending, so it also lifts
  // small differences in Difference mode. Works on the sRGB values as shown.
  const gammaId = 'gamma-' + (++gammaCount);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const filt = document.createElementNS(SVGNS, 'filter');
  filt.id = gammaId; filt.setAttribute('color-interpolation-filters', 'sRGB');
  const ct = document.createElementNS(SVGNS, 'feComponentTransfer');
  const gammaFuncs = ['feFuncR', 'feFuncG', 'feFuncB'].map((n) => {
    const f = document.createElementNS(SVGNS, n);
    f.setAttribute('type', 'gamma'); f.setAttribute('amplitude', '1'); f.setAttribute('exponent', '1'); f.setAttribute('offset', '0');
    ct.appendChild(f); return f;
  });
  filt.appendChild(ct); svg.appendChild(filt); node.appendChild(svg);
  const warnEl = node.querySelector('.warn');
  const metaEl = node.querySelector('.meta');
  const tabsEl = node.querySelector('.tabs');
  const tagR = node.querySelector('.tag.r');

  // A preview box has no original: the room only holds renders, or only originals, or a single file, so there is nothing to compare
  // yet. Its files are shown one at a time (numbered tabs when there are several) with gamma, grid and the video controls, but without
  // the slider, the modes and the sweep. Inside, its files are kept in `renders`, and `photo` is null.
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
  let pos = 50, mode = preview ? 'view' : 'slider', photoReady = false;

  node.querySelector('h2').textContent = prettify(entry.name);
  const general = entry.warning ? [entry.warning] : [];
  function showWarnings() {
    const all = general.concat(active.warnings);
    warnEl.hidden = !all.length;
    warnEl.textContent = all.join(' ');
    renders.forEach((r) => { if (r.fix) r.fix.hidden = r !== active; });
  }

  const apply = () => {
    stage.classList.remove('mode-slider', 'mode-fade', 'mode-diff');
    stage.classList.add('mode-' + mode);
    // The bottom slider drives the split in Slider mode and the original's opacity in Fade mode
    node.querySelector('.slider-row').classList.toggle('off', mode === 'diff');
    if (mode === 'diff') stopSweep();
    handle.setAttribute('aria-label', mode === 'fade' ? 'Original opacity' : 'Comparison position');
    if (photo) {
      photo.style.clipPath = mode === 'slider' ? 'inset(0 ' + (100 - pos) + '% 0 0)' : 'none';
      photo.style.opacity = mode === 'fade' ? pos / 100 : 1;
    }
    const g = +gain.value;
    gammaFuncs.forEach((f) => f.setAttribute('exponent', (1 / g).toFixed(4)));
    blend.style.filter = g > 1.001 ? 'url(#' + gammaId + ')' : 'none';
  };
  const setPos = (p) => {
    pos = Math.max(0, Math.min(100, p));
    handle.style.left = pos + '%';
    handle.setAttribute('aria-valuenow', Math.round(pos));
    apply();
  };

  // ----- auto sweep: eases the split from edge to edge and back -----
  const SWEEP_SECONDS = 14;            // one full left → right → left cycle (7 s each way)
  const sweepBtn = node.querySelector('.sweep');
  let sweeping = false, sweepRaf = 0, phase = 0, lastTs = 0, lastSwitch = 0;
  const TWO_PI = 2 * Math.PI;
  function sweepTick(ts) {
    if (!sweeping) return;
    const prev = phase;
    if (lastTs) phase += Math.min(0.1, (ts - lastTs) / 1000) * TWO_PI / SWEEP_SECONDS;
    lastTs = ts;
    // After each full ping-pong, move to the next render. The switch happens when the split is at the
    // right edge (phase = odd multiple of π), where the original covers the whole image, so it's seamless.
    if (renders.length > 1) {
      const crossed = Math.floor((phase - Math.PI) / TWO_PI) > Math.floor((prev - Math.PI) / TWO_PI);
      if (crossed && phase - lastSwitch >= TWO_PI - 0.01) {
        lastSwitch = Math.floor((phase - Math.PI) / TWO_PI) * TWO_PI + Math.PI;   // the exact crossing point
        select((active.i + 1) % renders.length);
      }
    }
    setPos(50 - 50 * Math.cos(phase));
    sweepRaf = requestAnimationFrame(sweepTick);
  }
  function setSweepIcon() {
    sweepBtn.setAttribute('aria-pressed', sweeping);
    sweepBtn.querySelector('.i-play').style.display = sweeping ? 'none' : '';
    sweepBtn.querySelector('.i-pause').style.display = sweeping ? '' : 'none';
  }
  function startSweep() {
    if (sweeping || mode === 'diff' || preview) return;
    phase = Math.acos(Math.max(-1, Math.min(1, 1 - pos / 50)));   // continue from where the slider is
    sweeping = true; lastTs = 0; lastSwitch = phase; setSweepIcon();
    sweepRaf = requestAnimationFrame(sweepTick);
  }
  function stopSweep() {
    if (!sweeping) return;
    sweeping = false; cancelAnimationFrame(sweepRaf); setSweepIcon();
  }
  const toggleSweep = () => (sweeping ? stopSweep() : startSweep());
  sweepBtn.addEventListener('click', toggleSweep);

  node.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    node.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    apply();
  }));
  gain.addEventListener('input', () => { gain.nextElementSibling.textContent = (+gain.value).toFixed(2); apply(); });
  gain.addEventListener('dblclick', () => { gain.value = 1; gain.dispatchEvent(new Event('input')); });

  let dragging = false;
  // The image maps 1:1 to the split; the track maps its own width to 0–100 %, like a video player's scrubber.
  let dragEl = stage;
  const fromEvent = (e) => { const r = dragEl.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
  [stage, track].forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || mode === 'diff' || (el === stage && mode !== 'slider')) return;
      stopSweep();
      dragging = true; dragEl = el; el.setPointerCapture(e.pointerId); setPos(fromEvent(e));
      if (el === track) e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => { if (dragging) setPos(fromEvent(e)); });
    ['pointerup', 'pointercancel'].forEach((t) => el.addEventListener(t, () => { dragging = false; }));
  });
  node.addEventListener('pointerenter', () => { hovered = ctl; });
  node.addEventListener('pointerleave', () => { if (hovered === ctl) hovered = null; stage.classList.remove('solo'); });

  handle.addEventListener('keydown', (e) => {
    const s = e.shiftKey ? 10 : 1;
    const map = { ArrowLeft: pos - s, ArrowDown: pos - s, ArrowRight: pos + s, ArrowUp: pos + s, Home: 0, End: 100 };
    if (e.key in map) { stopSweep(); setPos(map[e.key]); e.preventDefault(); }
  });

  // ----- video sync (original + the active render) -----
  const tp = node.querySelector('.transport');
  const playBtn = tp.querySelector('.play'), seek = tp.querySelector('.seek'), timeEl = tp.querySelector('.time');
  const fpsSel = tp.querySelector('.fps'), speedSel = tp.querySelector('.speed'), loopBtn = tp.querySelector('.loop');
  let playing = false, raf = 0, scrubbing = false, videos = [], master = null;
  // Autoplay: a video plays while its picture is in the middle of the window, unless it was stopped by hand.
  let inBand = false, manualStop = false, autoStarted = false;
  const duration = () => Math.min(...videos.map((v) => v.duration || Infinity));

  function refreshVideos() {
    videos = [photo, active.el].filter((el) => el && isVideoEl(el));
    master = isVideoEl(active.el) ? active.el : (videos[0] || null);
    tp.hidden = !videos.length;
    renders.forEach((r) => { if (r !== active && isVideoEl(r.el)) r.el.pause(); });
  }
  function seekAll(t) {
    const d = duration();
    t = Math.max(0, isFinite(d) ? Math.min(d, t) : t);
    videos.forEach((v) => { v.currentTime = t; });
    updateUI(t);
  }
  function updateUI(t) {
    if (!master) return;
    const d = duration();
    if (t === undefined) t = master.currentTime;
    if (!scrubbing && isFinite(d) && d > 0) seek.value = Math.round(t / d * 1000);
    timeEl.textContent = fmt(t) + ' / ' + fmt(d);
  }
  function setPlayIcon() {
    playBtn.querySelector('.i-play').style.display = playing ? 'none' : '';
    playBtn.querySelector('.i-pause').style.display = playing ? '' : 'none';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  function tick() {
    if (!playing) return;
    const d = duration(), t = master.currentTime;
    if (t >= d - 0.02 || master.ended) {
      if (loopBtn.getAttribute('aria-pressed') === 'true') { seekAll(0); videos.forEach((v) => v.play().catch(() => {})); }
      else { pause(); seekAll(d); return; }
    }
    videos.forEach((v) => { if (v !== master && Math.abs(v.currentTime - t) > 0.08) v.currentTime = t; });
    updateUI(t);
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (!videos.length || playing) return;
    if (master.currentTime >= duration() - 0.02) seekAll(0);
    const t = master.currentTime;
    videos.forEach((v) => { v.currentTime = t; v.playbackRate = +speedSel.value; });
    playing = true; setPlayIcon();
    Promise.all(videos.map((v) => v.play())).catch(() => pause());
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; autoStarted = false; cancelAnimationFrame(raf); setPlayIcon();
    videos.forEach((v) => v.pause());
    if (!master) return;
    const t = master.currentTime;
    videos.forEach((v) => { if (v !== master) v.currentTime = t; });  // land on the same frame
    updateUI(t);
  }
  // Anything the user does to the transport counts as a manual stop (until the box leaves the middle of the window).
  const toggle = () => { if (playing) { manualStop = true; pause(); } else { manualStop = false; play(); } };
  const step = (dir) => { if (!master) return; manualStop = true; pause(); seekAll(master.currentTime + dir / +fpsSel.value); };
  function maybeAutoplay() {
    if (!inBand || manualStop || playing || !videos.length || videos.some((v) => v.readyState < 1)) return;
    play();
    autoStarted = playing;
  }

  playBtn.addEventListener('click', toggle);
  tp.querySelector('.back').addEventListener('click', () => step(-1));
  tp.querySelector('.fwd').addEventListener('click', () => step(1));
  seek.addEventListener('pointerdown', () => { scrubbing = true; });
  seek.addEventListener('input', () => {
    manualStop = true;
    if (playing) pause();
    const d = duration(); if (isFinite(d)) seekAll(seek.value / 1000 * d);
  });
  seek.addEventListener('change', () => { scrubbing = false; });
  speedSel.addEventListener('change', () => videos.forEach((v) => { v.playbackRate = +speedSel.value; }));
  loopBtn.addEventListener('click', () => loopBtn.setAttribute('aria-pressed', loopBtn.getAttribute('aria-pressed') !== 'true'));
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) { if (playing) pause(); stopSweep(); } }).observe(stage);
  // A thin band across the middle of the window: entering it starts a video, leaving it stops one that autoplay started
  // and forgets a manual stop, so scrolling away and back plays it again. A video the user started by hand keeps playing
  // until it is completely out of view (the observer above).
  new IntersectionObserver((list) => {
    inBand = list[list.length - 1].isIntersecting;
    if (inBand) maybeAutoplay();
    else { manualStop = false; if (playing && autoStarted) pause(); }
  }, { rootMargin: '-49% 0px -49% 0px' }).observe(stage);

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
  const fname = document.createElement('span');
  fname.className = 'fname';
  if (renders.length > 1) {
    tabsEl.hidden = false;
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = preview ? 'File' : 'Render';
    tabsEl.append(lbl, ...tabButtons, fname);
  }

  function select(i) {
    const next = renders[i];
    if (!next || next === active) return;
    const wasPlaying = playing, wasAuto = autoStarted;
    const t = master ? master.currentTime : 0;
    if (playing) pause();
    active.el.classList.add('inactive');
    active = next;
    active.el.classList.remove('inactive');
    if (preview && active.ready) setAspect(...dims(active.el));
    refreshVideos();
    if (videos.length) { seekAll(t); if (wasPlaying) { play(); autoStarted = wasAuto; } else maybeAutoplay(); }
    tabButtons.forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
    updateLabels();
    showWarnings();
  }
  const note = (el, what) => { const i = el.exrInfo; return i ? ' · ' + what + ' EXR ' + i.compression + ', ' + i.types.join('+') + (i.layer ? ', layer ' + i.layer : '') + (i.layers.length > 1 ? ' (of ' + i.layers.length + ')' : '') : ''; };
  const PREVIEW_TEXT = { render: 'render only, nothing to compare yet', original: 'original only, nothing to compare yet', file: 'single file, nothing to compare yet' };
  function updateLabels() {
    tagR.textContent = renders.length > 1 ? 'Render ' + (active.i + 1) : 'Render';
    fname.textContent = active.name;
    if (preview) {
      if (!active.ready) { metaEl.textContent = active.el.exrPending ? 'decoding EXR…' : ''; return; }
      const [w, h] = dims(active.el);
      metaEl.textContent = w + '×' + h + ' · ' + (isVideoEl(active.el) ? 'video' : 'image') + ' · ' + PREVIEW_TEXT[entry.preview] +
        (renders.length === 1 ? ' · ' + active.name : '') + note(active.el, entry.preview === 'file' ? 'file' : entry.preview);
      return;
    }
    if (!photoReady || !active.ready) { metaEl.textContent = photo.exrPending || active.el.exrPending ? 'decoding EXR…' : ''; return; }
    const [pw, ph] = dims(photo), [rw, rh] = dims(active.el);
    const kind = (el) => isVideoEl(el) ? 'video' : 'image';
    const vids = [photo, active.el].filter(isVideoEl).length;
    metaEl.textContent = (pw === rw && ph === rh
      ? pw + '×' + ph + (vids ? ' · ' + (vids === 2 ? 'videos' : 'video + image') : '')
      : 'original ' + kind(photo) + ' ' + pw + '×' + ph + ', render ' + kind(active.el) + ' ' + rw + '×' + rh) +
      ' · original: ' + entry.original.name + (renders.length === 1 ? ' · render: ' + active.name : '');
    metaEl.textContent += note(photo, 'original') + note(active.el, 'render');
  }

  // ----- loading and size checks -----
  function setAspect(w, h) {
    if (!w || !h) return;
    stage.style.aspectRatio = w + ' / ' + h;
    node.style.setProperty('--ar', w / h);
  }
  function check(r) {
    if (!photoReady || !r.ready || r.checked) return;
    r.checked = true;
    const [pw, ph] = dims(photo), [rw, rh] = dims(r.el);
    if (Math.abs(pw / ph - rw / rh) / (pw / ph) > 0.005)
      r.warnings.push('Aspect ratios differ, so this render is stretched to fit. Render at the original’s aspect ratio for an accurate comparison.');
    if (isVideoEl(photo) && isVideoEl(r.el) && Math.abs(photo.duration - r.el.duration) > 0.1)
      r.warnings.push('Lengths differ (original ' + fmt(photo.duration) + ', render ' + fmt(r.el.duration) + '); playback stops at the shorter one.');
    if (r === active) { showWarnings(); updateLabels(); updateUI(); }
  }
  if (photo) {
    photo.addEventListener(isVideoEl(photo) ? 'loadedmetadata' : 'load', () => {
      photoReady = true;
      setAspect(...dims(photo));
      renders.forEach(check); updateLabels(); updateUI(); maybeAutoplay();
    }, { once: true });
    photo.addEventListener('error', () => {
      if (!isVideoEl(photo)) { general.push(photo.exrError ? 'Couldn’t read the original (' + entry.original.name + '): ' + photo.exrError + '.' : 'Couldn’t load the original (' + entry.original.name + ').'); showWarnings(); updateLabels(); return; }
      if (photo.getAttribute('src')) tabsEl.before(makeFix('original', entry.original.name));
    });
  }
  renders.forEach((r) => {
    r.el.addEventListener(isVideoEl(r.el) ? 'loadedmetadata' : 'load', () => {
      r.ready = true;
      if (preview ? r === active : !photoReady) setAspect(...dims(r.el));
      check(r);
      if (r === active) { updateLabels(); maybeAutoplay(); }
    }, { once: true });
    r.el.addEventListener('error', () => {
      const what = preview ? 'this file' : 'this render';
      if (!isVideoEl(r.el)) { r.warnings.push(r.el.exrError ? 'Couldn’t read ' + what + ' (' + r.name + '): ' + r.el.exrError + '.' : 'Couldn’t load ' + what + ' (' + r.name + ').'); showWarnings(); updateLabels(); return; }
      if (!r.el.getAttribute('src') || r.fix) return;
      r.fix = makeFix(preview ? 'file' : 'render', r.name);
      tabsEl.before(r.fix);
      showWarnings();
    });
  });

  const ctl = { stage, toggle, step, select, toggleSweep, get hasVideo() { return videos.length > 0; } };
  refreshVideos();
  updateLabels();
  showWarnings();
  setPos(50);
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
    'Run this in the room’s folder to make a browser-friendly copy, then move the old file out of the folder and refresh. ' +
    '(Or run <code>python tools/prepare-videos.py</code> once from the project folder: it does this for every video in <code>rooms/</code> and then starts the page.)</p>' +
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
