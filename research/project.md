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
| Videos and Images tabs on a left bar, tabs built on first use | The user asked for the two kinds apart, Videos first. Building a tab only when opened avoids fetching whole videos (they are loaded as blobs) and decoding EXRs for the tab nobody is looking at. Rejected: building everything up front (memory, 4K EXR decodes), and rebuilding a tab on every switch (loses gamma, slider position and render choice). |
| One folder is one comparison; its tab follows from its content | The user keeps video rooms and image rooms in separate folders under `rooms/`, so the tabs just sort folders. An earlier version split a folder holding both a video set and an image set into two comparisons; that misread the request and was removed (it also complicated the one-original-per-folder rule). | Splitting inside a folder | Autoplay by a thin band across the middle of the window | "In the middle of the screen" is a line, not a box: a tall picture is playing exactly while the centre line crosses it, and two neighbouring boxes never play together. Rejected: autoplay whenever any part is visible (several videos at once). |
| A manual stop lasts until the box leaves the middle band | The user's wording: stopped by hand stays stopped, but scrolling away and back plays it again. Rejected: remembering the stop for good (a stopped video could never autoplay again without pressing play). |
| Build-time `rooms/manifest.json` plus listing-first fallback, instead of porting to Nuxt | GitHub Pages cannot list folders. A 40-line Node script solves exactly that; the page stays plain scripts and local use is unchanged (listing first, so no rebuild while editing). Rejected: Nuxt, because it means porting the working video sync, sweep, scroll and EXR code to Vue and ES modules and adds a build chain for one missing file; also a committed manifest (goes stale). |
| Pages deployed by a GitHub Actions workflow that stages only the page files | The manifest is generated during deploy, and tests, research and tools stay out of the site. Rejected: publishing the branch root, which would need a committed manifest and publish everything. |
| Datasets are folders of rooms; loose rooms go to a Misc dataset | The user will add several datasets and wants to swap between them. A folder is a dataset if it holds folders, a room if it holds an original and renders, so existing `rooms/` folders keep working unchanged (they become Misc). Rejected: a naming convention or marker file for datasets (more rules to remember); a dataset field in a config file (breaks "drop folders in, refresh"). |
| Dataset bar is a separate, wider, horizontal-text bar left of the Videos / Images bar | Dataset names are long and there can be many; the old bar's rotated text only suits two short words. Videos / Images stays narrow and sits between the dataset bar and the content, which also reads as the nesting. Rejected: replacing the old bar (the user asked for an *additional* bar), a dropdown (hides how many datasets there are). |
| Datasets don't nest | One level covers the request; deeper folders are reported as skipped with the rule in the message instead of being guessed at. |
| Datasets build lazily and keep their panes | Same reason as the Videos / Images tabs: a dataset nobody opens must not fetch its videos or decode its EXRs, and revisiting must keep slider, gamma and render choices. Cost: memory grows with the datasets visited (see limitations). |
| The next-dataset button is a scroll-assist snap point | Otherwise the gravity zone below the last room, which reaches to the page bottom, pulls back toward that room and the button cannot be reached by wheel. |
| Manifest version 2 adds `children` | A static host can't list `rooms/<dataset>/`, so the manifest carries one more level. `listManifest` accepts version 1 files too. |
| A room with missing originals or renders is a preview box, never skipped | The user wants to look at data before there is anything to compare ("sometimes I just want to preview some data without comparison yet"). Rule: one file, only renders, or only original-named files → a preview box with the normal viewing tools but no slider, modes or sweep. Replaced: skipping single-file folders, and the fallback that made one of several renders the "original" with a warning (it produced a meaningless render-versus-render comparison). Kept: several unmarked files (`a.jpg`, `b.jpg`) are still one original plus renders with a warning, because nothing says what they are. Rejected: a separate "preview" tab or dataset (the room belongs with its siblings), and a fake empty original inside the comparison code (every use of the original would need an exception anyway, and the slider would show nothing). |
| Fixing unplayable videos is a script you run (`tools/prepare-videos.py`), not something the server does | The user's workflow is to test locally and then push to GitHub Pages, so the converted files have to exist in `rooms/` before the push; a converting server would fix only local viewing and nothing online. A script also does the slow work once, up front, with visible progress, instead of leaving a video box empty while a request waits for ffmpeg. It ends by starting `python -m http.server 8080` so the result can be looked at immediately. Rejected (and built, tested, then removed): a replacement for `python -m http.server` that converts on request into a hidden cache, with a progress poll and a "converted from" note in the page. |
| Originals are moved to `video-originals/`, not deleted or kept beside the converted file | The user's footage is the one thing that cannot be regenerated, so nothing is deleted; but leaving both in `rooms/` would make the page see two originals. The folder mirrors `rooms/`, is outside it (so it is not published by the Pages workflow, which copies only `rooms/`) and is in `.gitignore` (so it is not pushed either; originals can be over GitHub's 100 MB limit). |
| A converted video is checked before it replaces anything | ffmpeg can exit 0 with a bad result (wrong format or a cut-short file). The script probes the output for h264 + yuv420p and a length within max(0.5 s, 2 %) of the source, and only then swaps; frame stepping and the sync between original and render depend on the length. |
| Audio is dropped; CRF 16 with preset slow | The page plays muted. CRF 16 and `-preset slow` are what the page's own fix command always used, and the user asked for no quality loss, so the script matches them. The preset changes how well x264 compresses at a given CRF (file size and time), not the quality target; `--preset fast` is there for quick looks. (An early version defaulted to `fast`.) |


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
- `prepare-videos.py` converts HDR (HLG/PQ) 10-bit sources to 8-bit with no tone mapping, so they look flat; it does not change frame rate (default ffmpeg handling), so a variable-frame-rate phone clip becomes constant frame rate; and the originals' audio is gone from the converted files (kept in `video-originals/`).
- Every dataset that has been opened keeps its built boxes, and whole videos (as blobs) stay in memory with them; many video-heavy datasets in one session add up. A reload frees it. Dropping the panes of datasets that were left, or capping them, would fix it at the cost of losing their slider and gamma state.
- Datasets can't be nested. A dataset opens on Videos (Images if it has none) the first time and on its last tab after that; its scroll position is not remembered, switching always goes to the top.
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

## 7. Tabs and autoplay pitfalls

- **Autoplay needs muted video.** Browsers block unmuted autoplay without a click. Videos are muted by design here; do not add sound without changing the autoplay rule.
- **Hidden tab, zero-size rooms.** A hidden pane has no layout, so anything measuring `.room` rectangles (the scroll snap points) must skip rooms without `offsetParent`.
- **`hovered` goes stale on a tab switch** (the pointer never "leaves" a box that is hidden under it), so `showTab` clears it; otherwise the keys would drive a hidden video.
- **A play before the video has loaded fails.** Videos arrive as blobs after a fetch, so autoplay waits for `readyState >= 1` and is retried from the load handlers.
- **Name clashes across the shared scope.** `toEntries` once used a local called `list` next to the manifest source's `list()` function, which gave "Cannot access 'list' before initialization" and an empty page; name locals distinctively in `discovery.js`.

## 8. Datasets pitfalls

- **Room or dataset?** The page decides from content: media files directly inside a folder → room, except when the folder also has subfolders and its own files are only a preview (no original-and-render pair): then it is a dataset and the stray files are ignored. A dataset folder that holds a stray original *and* a render therefore becomes a room and its subfolders are ignored; a room folder with a stray subfolder stays a room only if it is a full comparison, otherwise it becomes a dataset and its own files vanish. Keep stray files out of dataset folders, and stray folders out of room folders.
- **A dataset needs at least one valid room** to get a tab; an empty or fully skipped dataset only shows up in the skipped list, as `dataset/room/`.
- **Misc is a key, not just a label.** Datasets are keyed by lower-cased folder name and `misc` is reserved for loose rooms, so a folder named `Misc` merges with them instead of making a second tab.
- **Pane ids contain the dataset index** (`pane-<index>-<kind>`), so they are only stable within one page load; `aria-controls` of the Videos / Images buttons is rewritten on every `showDataset`.
- **Gravity and the end of a dataset.** Anything placed after the last box must be a snap point (`.next-ds` is), or the pull back to the last box will hold it out of reach. If another element is added there, add it to the `snapPoints` selector.
- **Names in `discovery.js` are globals** (`MISC`, `collectDatasets`); the usual rule about unique top-level names applies, and `collectDatasets` keeps its helpers local on purpose.

## 9. Preview pitfalls

- **`renders` holds originals in a preview entry.** The files of a preview live in `entry.renders` (so tabs, keys 1-9, autoplay and the loading handlers need no second code path), `entry.original` is null and `photo` is null in `createRoom`. Any new code that touches `photo` or `entry.original` needs a guard.
- **Preview aspect ratio** follows the selected file (render boxes use the original's). The stage keeps one aspect ratio at a time, so a box of mixed shapes resizes when you switch tabs.
- **Kind of a folder** (Videos or Images) is "video if any file is a video", unchanged, so a lone video is under Videos.
- **No comparison means no checks.** Aspect and length warnings only exist for comparisons.
- **Names decide the label, not the content.** A lone `kitchen.jpg` is a "single file"; `render.png` alone is a "render only"; a folder of unmarked files is still read as original plus renders (warning).

## 10. Video preparation pitfalls

- **Run it before testing and before pushing.** Videos that are not prepared still show the per-file ffmpeg command in the box, but nothing converts by itself, and GitHub Pages cannot do it either.
- **`video-originals/` must stay out of git.** It is in `.gitignore`; if that line is lost, the next push uploads every original (and may fail on the 100 MB limit).
- **Names change only for `.mov` and the like.** `render.mov` becomes `render.mp4`; the page classifies by the name without extension, so nothing else changes. If `render.mp4` already exists the video is skipped and reported.
- **The check list is `VIDEO_EXT` in the script and `VIDEO_RE` in `js/core/config.js`.** Keep them in step when adding a video type.
- **Do not stop a conversion by killing the process.** An interrupted run leaves only a hidden `.<name>.converting.mp4` (deleted by the next real run); Ctrl+C is handled and also cleans up. The original is not moved until the converted file has been verified.
- **The finishing `http.server` step blocks.** The script only returns when you press Ctrl+C there; use `--no-serve` in anything scripted.
- **No `.bat` wrapper for `prepare-videos.py`, on purpose.** The author's project lives on a network share (`\\int.balgrist.ch\...`). `cmd.exe` cannot use a UNC path as its working directory ("UNC paths are not supported. Defaulting to Windows directory"), so a `cd`-ing `.bat` ran Python against `C:\Windows\tools\...` and failed. `python tools\prepare-videos.py` works from PowerShell on a UNC path because Python and ffmpeg accept UNC paths and the script builds every path from `__file__` (it never changes directory; the final `http.server` is started with `cwd=` the project, which CreateProcess accepts). `tools/extract-frame.bat` has no `cd`, so it is not affected, but any new `.bat` must not `cd` or `pushd` blindly. Not tested on a UNC path here (Linux sandbox).
