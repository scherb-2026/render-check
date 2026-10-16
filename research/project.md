# Render check: reasoning, pitfalls and working notes

*Archived in `research/`. This folder persists through the versions of the page: keep it when making a new version, add to it, and do not remove or shorten anything unless explicitly asked.*

Companion to `Render check project handover.md`. The handover says **what** the project is and **how** it works. This file says **why** it is built that way, what to watch out for, and what is still open.

## 1. Design decisions

| Decision | Why |
|---|---|
| One self-contained `index.html`, no framework or build | The author edits and runs it locally; nothing to install beyond Python. Superseded in part: the code is now split into `css/` and `js/` files (see below), but there is still no framework or build step. |
| Parse the server's folder listing instead of a manifest | The author wanted "drop files in folders, refresh". An earlier version used a Python script that wrote `rooms/manifest.json`; it was removed as unnecessary complexity. |
| Render detection by keyword, not by position | Only renders need marking; the original keeps its camera/export name. `cg` and `3d` were removed as keywords because they matched real originals (`LUT250-3D`). `synthetic` was added on request. |
| Blender `.001` numbering counts as a render | The author's renders come out of Blender with those suffixes; without this, alphabetical order picked a render as the original. |
| Render tabs labelled 1, 2, 3 | Requested. File name shown beside them for clarity. |
| Load videos as blobs | Python's server lacks Range support; without it seeking is broken. |
| In-page ffmpeg fix command | Most "won't play" cases are HEVC / 10-bit / 4:4:4 from GoPro or ffmpeg exports; the box gives the exact command for that file. |
| No divider line; handle below the image | Requested: a line over the seam hides the very area being compared. |
| Track shorter than the image, scrubber-style | Requested, so the sweep button can sit beside it like a video player. |
| Fade opacity on the bottom slider | Requested; one control per box, and the sweep doubles as an automatic cross-fade. |
| True gamma instead of linear brightness | Requested as "gamma boost"; lifts shadows and faint differences without clipping highlights. |
| Gravity scrolling rather than CSS scroll-snap or a delayed snap | A delayed snap felt fierce; the author asked for distance-based gravity with a smooth curve and a neutral middle third. CSS scroll-snap can't express a neutral zone. |
| Viewer width capped at `80vh × aspect` | Without it, wide short windows stretched images (seen at 2.6:1 for a 1.5:1 image). Fixed during this handover. |
| PowerShell frame script replaced by a `.bat` | The author's machine blocks PowerShell scripts (execution policy). |
| Code split into `css/` and `js/` files, classic scripts in a fixed order | The single `index.html` had grown to 940 lines and the sister project (Distortion viewer) already uses this layout; the same names make fixes portable between the two. Classic scripts keep `file://` working. Rejected: eS modules (blocked on `file://`); keeping one file |
| `research/` folder that persists through versions | Knowledge about why things are the way they are was only in one handover file; the sister project keeps handover and project notes together and never prunes them Rejected: notes inside `README.md` |
| Own EXR decoder, taken from Distortion viewer unchanged | Blender renders are most useful as EXR; browsers cannot read them. The decoder is self-contained, offline, handles Blender's multilayer files and is already tested against the OpenEXR library Rejected: three.js loader (assumes one channel type, no multipart); converting to PNG outside the page |
| EXR painted once into a canvas, 8-bit sRGB | Everything else in the page (clip-path, blend modes, gamma filter, aspect ratio) works on a canvas exactly as on an image, so no box code changed Rejected: a WebGL float pipeline with exposure control (more code; would change the difference mode) |
| Plain linear to sRGB, no tone mapping | A render saved as PNG with the *Standard* view transform looks the same as its EXR, so mixed comparisons agree Rejected: filmic or AgX (would need the same transform on the PNG side) |
| EXR decoded one at a time | A 4K float image is about 130 MB of working memory; several rooms with EXRs would otherwise decode in parallel Rejected: parallel decoding |
| Build-time `rooms/manifest.json` plus listing-first fallback, instead of porting to Nuxt | GitHub Pages cannot list folders. A 40-line Node script solves exactly that; the page stays plain scripts and local use is unchanged (listing first, so no rebuild while editing). Rejected: Nuxt, because it means porting the working video sync, sweep, scroll and EXR code to Vue and ES modules and adds a build chain for one missing file; also a committed manifest (goes stale). |
| Pages deployed by a GitHub Actions workflow that stages only the page files | The manifest is generated during deploy, and tests, research and tools stay out of the site. Rejected: publishing the branch root, which would need a committed manifest and publish everything. |


## 2. Known limitations

- Gravity at `GRAVITY` 64 with `FRICTION` 8 is slightly underdamped: about 8–13 px overshoot before settling.
  `FRICTION` 16 makes it critically damped. A single wheel notch away from an aligned box is pulled back; the
  user needs a few notches to move on (expected from the requested gravity).
- The wheel takeover may feel floaty on trackpads, which send many small deltas.
- The gamma SVG filter is rendered on the CPU in some browsers and can make large videos stutter.
- The vertical gamma slider needs `writing-mode` on range inputs (Chrome/Edge 124+, Firefox, Safari 17.4+).
- Blob loading keeps whole videos in memory.
- Videos of different lengths stop at the shorter one; there's no offset/sync adjustment between clips.
- Per-box settings (mode, gamma, active render) aren't remembered across reloads.
- Static hosts without directory listings (GitHub Pages) can't find the rooms without `rooms/manifest.json` (solved by `tools/build-manifest.mjs`; see the handover).
- The Open folder… fallback doesn't revoke object URLs when a folder is picked again (minor memory leak).
- EXR: B44, B44A, DWAA, DWAB, tiled and deep files are not read (the box says so and names the Blender setting to change: *Codec → ZIP*).
- EXR is decoded on the page's main thread, so a 4K file freezes the page for 1 to 2 s. Moving the decoder into a Web Worker is the fix.
- EXR has no tone mapping, so a Filmic or AgX PNG and an EXR of the same render look different. Compare like with like (Standard view transform).
- Only one layer of a multilayer EXR is shown; there is no layer picker (the box line shows which one was read and how many exist).

## 3. Ideas, none started

- Zoom and pan for pixel-level inspection, applied identically to both layers.
- A time offset per video pair, for footage and renders that don't start on the same frame.
- Remembering per-box settings in `localStorage`.
- TIFF support (EXR is done; TIFF is still reported as unsupported).
- EXR: a layer picker, an exposure slider (the data is thrown away at the 8-bit step today), and decoding in a Web Worker.
- Pull the decoder's `tests/exr/` fixtures from one shared place if both projects keep evolving it.


- Done: an optional `rooms/manifest.json` fallback so the page can be hosted statically (`tools/build-manifest.mjs`).

## 4. Pitfalls

- **EXR looks different from the PNG of the same render.** The page applies the plain linear to sRGB curve. A PNG saved with Filmic, AgX or a look will not match it; save both with *Standard*, or compare EXR with EXR.
- **"Couldn’t read this render" on an EXR** nearly always means the file uses B44 or DWAA compression, or is tiled. Re-save with ZIP.
- **Script order matters.** The files share one global scope. Moving a `const` or `class` below the file that uses it at load time fails with a "before initialization" error; functions used later at run time are fine.
- **Keep names unique across files.** Everything at the top level of a file is global. Local helpers belong inside `createRoom` or an IIFE.
- **Port fixes between the two viewers by file name.** `lib/exr.js`, `media/media.js`, `core/naming.js` and the app files exist in both. Render check's `scroll-assist.js` keeps its own `localStorage` key (`rc-snap`).

## 5. Working notes

- Edit the file the topic belongs to (see the handover, *Code layout*); refresh the browser to see changes. Keep the README in sync.
- Per-box behavior belongs inside `createRoom`. Use its existing helpers: `apply()` re-applies mode, slider
  position and gamma; `setPos(p)` moves the slider; `select(i)` switches renders; `refreshVideos()` rebuilds
  the playing set; `showWarnings()` and `updateLabels()` refresh text.
- Test content can be generated with ffmpeg, for example a 3-second test pattern:

      ffmpeg -f lavfi -i testsrc=size=640x360:rate=30 -t 3 -c:v libvpx-vp9 -b:v 300k footage.webm

  Headless Chromium doesn't decode H.264, so WebM is the safer test format.

## 6. Hosting pitfalls

- **Pages is public on a free account.** Anyone with the link sees every room. Private Pages needs a paid enterprise plan.
- **100 MB per file, about 1 GB per site.** GoPro footage and 4K EXRs can exceed that; `build-manifest.mjs` warns. Git LFS files are not served by Pages.
- **A stale manifest hides new files.** Locally the listing is used first, so this only happens on a static host: re-run the script (the workflow does it on every push).
- **Case matters on Pages.** `Render.PNG` and `render.png` are different files there; keep names consistent.
- **Range requests work on Pages**, so the blob loading of videos is not needed there; it only costs memory.
