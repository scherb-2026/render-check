/* ======================================================================
 * js/room/transport.js — the one playback bar at the bottom of the window: it plays, pauses and seeks every video of the open pane together
 * Uses: core/*, room/gallery.js. Each cell (room.js) offers `videos` (its original and active render) and `pauseVideos()`.
 * ====================================================================== */

// There is no frame-rate setting: every video plays at its own frame rate, and the display shows at most as many frames per second as the screen
// refreshes, so playback runs at the smaller of the two. Frame stepping needs the frame length; browsers don't state it, so it is measured from the
// first frames that are shown (requestVideoFrameCallback) and is 30 fps until then.
const transport = (() => {
  const bar = $('transport');
  const playBtn = bar.querySelector('.play'), seek = bar.querySelector('.seek'), timeEl = bar.querySelector('.time');
  const speedSel = bar.querySelector('.speed'), loopBtn = bar.querySelector('.loop');
  let playing = false, raf = 0, scrubbing = false, resumeAfterScrub = false, master = null, fps = 30;
  let manualStop = false;                 // the user stopped playback (or it reached the end): autoplay leaves the pane alone

  const cells = () => [...gallery.rooms].filter(gallery.shown).filter((c) => c.hasVideo);
  const videos = () => cells().flatMap((c) => c.videos);
  const ready = (v) => v.readyState >= 1;
  const rate = () => +speedSel.value;
  const loops = () => loopBtn.getAttribute('aria-pressed') === 'true';
  // The shortest video decides where everything ends (and loops).
  function duration() {
    const d = videos().filter(ready).map((v) => v.duration).filter(isFinite);
    return d.length ? Math.min(...d) : 0;
  }
  function pickMaster(vs) {
    if (!master || !vs.includes(master) || !ready(master)) master = vs.find(ready) || null;
    return master;
  }

  function updateUI(t) {
    const d = duration();
    if (t === undefined) t = master ? master.currentTime : 0;
    if (!scrubbing && d > 0) seek.value = Math.round(Math.min(1, t / d) * +seek.max);
    seek.style.setProperty('--fill', (+seek.value / +seek.max * 100) + '%');
    timeEl.textContent = fmt(t) + ' / ' + fmt(d);
  }
  function setPlayIcon() {
    playBtn.querySelector('.i-play').style.display = playing ? 'none' : '';
    playBtn.querySelector('.i-pause').style.display = playing ? '' : 'none';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  function seekAll(t) {
    const d = duration();
    t = Math.max(0, d > 0 ? Math.min(d - 0.001, t) : t);
    videos().forEach((v) => { if (ready(v)) v.currentTime = t; });
    updateUI(t);
  }
  function probeFps(v) {                  // measure the frame length of v from the frames that get shown
    if (!v || !v.requestVideoFrameCallback) return;
    let last = -1, best = Infinity, n = 0;
    const cb = (now, meta) => {
      if (last >= 0) { const dt = meta.mediaTime - last; if (dt > 0.001 && dt < best) best = dt; }
      last = meta.mediaTime;
      if (best < Infinity) fps = Math.min(240, Math.max(5, 1 / best));
      if (++n < 12 && !v.paused) v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }

  function startVideo(v, t) {
    v.currentTime = t; v.playbackRate = rate();
    v.play().catch(() => {});
  }
  function tick() {
    if (!playing) return;
    const vs = videos().filter(ready);
    if (pickMaster(vs)) {
      const d = duration(), t = master.currentTime;
      if (t >= d - 0.02 || master.ended) {
        if (loops()) { seekAll(0); vs.forEach((v) => startVideo(v, 0)); }
        else { manualStop = true; pause(); seekAll(d); return; }
      } else {
        vs.forEach((v) => {
          if (v === master) return;
          if (v.paused) startVideo(v, t);                              // a video that finished loading while the others play joins in
          else if (Math.abs(v.currentTime - t) > 0.1) v.currentTime = t;   // and one that drifted is pulled back
        });
        updateUI(t);
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    const vs = videos().filter(ready);
    if (!vs.length || playing) return;
    pickMaster(vs);
    if (master.currentTime >= duration() - 0.02) seekAll(0);
    const t = master.currentTime;
    playing = true; setPlayIcon();
    vs.forEach((v) => startVideo(v, t));
    probeFps(master);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; cancelAnimationFrame(raf); setPlayIcon();
    const vs = videos();
    vs.forEach((v) => v.pause());
    const m = pickMaster(vs.filter(ready));
    if (m) { const t = m.currentTime; vs.forEach((v) => { if (ready(v) && v !== m) v.currentTime = t; }); updateUI(t); }   // all land on the same frame
  }
  const toggle = () => { if (playing) { manualStop = true; pause(); } else { manualStop = false; play(); } };
  const step = (dir) => {
    manualStop = true; pause();
    if (!master) return;
    seekAll((Math.floor(master.currentTime * fps + 1e-3) + dir + 0.5) / fps);     // the middle of the neighbouring frame
  };

  // Plays by itself once every video of the pane is loaded, unless it was stopped by hand.
  function maybeAutoplay() {
    const vs = videos();
    if (manualStop || playing || !vs.length || !vs.every(ready)) return;
    play();
  }
  // Called when a video has loaded or failed: the bar's time, and (the first time) the start of playback.
  function update() {
    const has = cells().length > 0;
    bar.hidden = !has;
    if (!has) return;
    pickMaster(videos().filter(ready));
    updateUI();
    maybeAutoplay();
    queueFit();
  }
  // Called when another pane is shown: everything stops and starts again from the beginning.
  function paneChanged() {
    gallery.rooms.forEach((c) => { if (c.hasVideo) c.pauseVideos(); });
    playing = false; manualStop = false; master = null; cancelAnimationFrame(raf); setPlayIcon();
    update();
    if (!bar.hidden) { seekAll(0); maybeAutoplay(); }
  }
  // Called when a cell switched to another render: the new video follows the others.
  function cellChanged() {
    if (bar.hidden) return;
    const t = master ? master.currentTime : 0;
    videos().filter(ready).forEach((v) => { v.currentTime = t; v.playbackRate = rate(); if (playing && v.paused) v.play().catch(() => {}); });
    update();
  }

  playBtn.addEventListener('click', toggle);
  bar.querySelector('.back').addEventListener('click', () => step(-1));
  bar.querySelector('.fwd').addEventListener('click', () => step(1));
  seek.addEventListener('pointerdown', () => { scrubbing = true; resumeAfterScrub = playing; if (playing) pause(); });
  seek.addEventListener('input', () => { const d = duration(); if (d > 0) seekAll(seek.value / +seek.max * d); });
  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (resumeAfterScrub) play(); else manualStop = true;
  };
  seek.addEventListener('pointerup', endScrub);
  seek.addEventListener('pointercancel', endScrub);
  seek.addEventListener('change', endScrub);
  seek.addEventListener('keydown', (e) => { if (/^(Arrow|Home$|End$|Page)/.test(e.key)) { manualStop = true; if (playing) pause(); } });     // keys on the focused bar
  speedSel.addEventListener('change', () => videos().forEach((v) => { v.playbackRate = rate(); }));
  loopBtn.addEventListener('click', () => loopBtn.setAttribute('aria-pressed', !loops()));

  return { update, paneChanged, cellChanged, toggle, step, get active() { return !bar.hidden; }, bar };
})();
