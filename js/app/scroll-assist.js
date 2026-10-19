/* ======================================================================
 * js/app/scroll-assist.js — soft gravity that pulls the scroll position toward the nearest comparison
 * ====================================================================== */

// ---------- scroll assist: soft gravity toward the nearest comparison ----------
// Snap points are the scroll positions where a box sits centered in the window (or top-aligned if it's taller
// than the window), plus the very top and bottom of the page. Each point has a pull zone covering the nearest
// third of the gap to its neighbours; the middle third has no pull. Inside a zone the page is pulled like a
// soft spring whose strength fades smoothly to zero at the zone's edge, so there's no hard snap:
//   force = −GRAVITY · d · (1 − (d/zone)²)²
// Wheel notches are turned into a velocity kick that glides out with friction, so stepped wheels scroll smoothly.
const SNAP_ZONE = 1 / 3;     // share of each gap that pulls toward its nearer box
const GRAVITY = 64;          // spring strength (1/s²); higher pulls harder
const FRICTION = 8;          // velocity decay per second; higher stops sooner
const WHEEL_KICK = 8;        // px/s of velocity per px of wheel movement (≈ one notch glides one notch)
const SNAP_MARGIN = 12;      // px kept above a box that's taller than the window
const snapBtn = document.getElementById('snapBtn');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let snapOn = true;
try { snapOn = localStorage.getItem('rc-snap') !== 'off'; } catch {}
snapBtn.setAttribute('aria-pressed', snapOn);
snapBtn.addEventListener('click', () => {
  snapOn = !snapOn;
  snapBtn.setAttribute('aria-pressed', snapOn);
  try { localStorage.setItem('rc-snap', snapOn ? 'on' : 'off'); } catch {}
  if (!snapOn) stopPhysics();
});

function snapPoints() {
  const vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
  const pts = [];
  document.querySelectorAll('.room, .next-ds').forEach((el) => {      // the next-dataset button counts as a box, or the pull toward the last room would hold it out of reach
    if (!el.offsetParent) return;      // in the hidden tab or hidden pane
    const r = el.getBoundingClientRect(), top = r.top + window.scrollY;
    const y = r.height <= vh - 2 * SNAP_MARGIN ? top - (vh - r.height) / 2 : top - SNAP_MARGIN;
    pts.push(Math.max(0, Math.min(max, y)));
  });
  return [...new Set(pts)].sort((a, b) => a - b).filter((p, i, a) => i === 0 || p - a[i - 1] > 4);
}

// Signed offset from the pulling snap point (0 when outside every zone) and the zone size.
// Above the first box and below the last one there's no neutral gap: the strip up to the page's edge
// always pulls toward that box, so scrolling all the way up or down still settles on it.
function pullAt(y, pts) {
  if (!pts.length) return { d: 0, zone: 1 };
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const first = pts[0], last = pts[pts.length - 1];
  const innerZone = pts.length > 1 ? (pts[1] - pts[0]) * SNAP_ZONE : window.innerHeight * SNAP_ZONE;
  const lastZone = pts.length > 1 ? (last - pts[pts.length - 2]) * SNAP_ZONE : window.innerHeight * SNAP_ZONE;
  if (y <= first) {
    const zone = Math.max(innerZone, (first + 1) * 1.25);          // reaches past the top of the page
    return { d: y - first, zone };
  }
  if (y >= last) {
    const zone = Math.max(lastZone, (max - last + 1) * 1.25);      // reaches past the bottom of the page
    return { d: y - last, zone };
  }
  const i = pts.findIndex((p) => p > y);
  const a = pts[i - 1], b = pts[i];
  const zone = (b - a) * SNAP_ZONE;
  const d = y - a <= b - y ? y - a : y - b;
  return Math.abs(d) < zone ? { d, zone } : { d: 0, zone };
}
function gravityForce(y, pts) {
  const { d, zone } = pullAt(y, pts);
  if (!d) return 0;
  const k = 1 - (d / zone) ** 2;
  return -GRAVITY * d * k * k;
}

let pos = window.scrollY, vel = 0, raf = 0, lastT = 0, lastSet = -1, pointerDown = false, externalUntil = 0;
const active = () => snapOn && !reduceMotion.matches;

function stopPhysics() { cancelAnimationFrame(raf); raf = 0; vel = 0; }
function startPhysics() {
  if (!raf && active()) { lastT = 0; raf = requestAnimationFrame(step); }
}
function step(t) {
  raf = 0;
  if (!active()) return;
  const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
  lastT = t;
  if (pointerDown || performance.now() < externalUntil) {        // someone else is scrolling: just follow
    pos = window.scrollY; vel = 0; raf = requestAnimationFrame(step); return;
  }
  const pts = snapPoints(), max = document.documentElement.scrollHeight - window.innerHeight;
  const force = gravityForce(pos, pts);
  vel += force * dt;
  vel *= Math.exp(-FRICTION * dt);
  pos += vel * dt;
  if (pos < 0) { pos = 0; vel = 0; }
  if (pos > max) { pos = max; vel = 0; }
  lastSet = Math.round(pos);
  if (lastSet !== Math.round(window.scrollY)) window.scrollTo(0, lastSet);
  const { d } = pullAt(pos, pts);
  // At rest: settled on a point, or barely moving where the pull has faded out near a zone's edge
  if (Math.abs(vel) < 3 && (Math.abs(d) < 0.5 || Math.abs(force) < 10)) { vel = 0; return; }
  raf = requestAnimationFrame(step);
}

window.addEventListener('wheel', (e) => {
  if (!active() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1);
  if (!raf) pos = window.scrollY;
  vel += px * WHEEL_KICK;
  startPhysics();
}, { passive: false });

// Scrollbar, keyboard, touch or links: let them move the page, then let gravity settle it gently
window.addEventListener('scroll', () => {
  if (Math.abs(window.scrollY - lastSet) <= 1) return;     // our own movement
  externalUntil = performance.now() + 120;
  pos = window.scrollY; vel = 0;
  startPhysics();
}, { passive: true });
document.addEventListener('pointerdown', () => { pointerDown = true; });
document.addEventListener('pointerup', () => { pointerDown = false; startPhysics(); });
document.addEventListener('pointercancel', () => { pointerDown = false; });
