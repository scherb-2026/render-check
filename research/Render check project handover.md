# Render check: project handover

*Archived in `research/`. This folder persists through the versions of the page: keep it when making a new version, add to it, and do not remove or shorten anything unless explicitly asked.*

This document is for whoever works on the project next. `README.md` is the user guide. This file says **what** the project is and **how** it works (code layout, data conventions, the page's mechanics, what was verified). `project.md` next to it says **why** it is built that way (design decisions, pitfalls, known limitations, ideas).

## Purpose

A tool for a 3D room-reconstruction project. The author renders a reconstructed room and needs to check, view
by view, how accurately the render matches the real photo or GoPro footage. The page shows one comparison box
per folder, with a slider, fade and difference modes, synced video playback and several renders per view.
It runs locally; it is not meant to be hosted.


## Pipeline version: data/ + manifest, tab rows at the top (current; supersedes the `rooms/` sections below)

*The sections "Datasets", "Code layout", "Data conventions", "How the page works" (discovery parts) and "prepare-videos.py" further down describe the earlier `rooms/` version. They are kept for history; where they disagree with this section, this section is right.*

**Source of the data.** The page shows the output of the CHC render pipeline (`chc_pipeline`: `run_dataset_pipeline.py` etc.). Pipeline layout: `<root>/<camera folder chc1_*|chc2_*>/<Blue|Brown|White_gloves>/<Pose_set>/`, a Pose_set being a folder with `body_3d.npy` + `hands_3d.npy`, holding `renders/` (toolkit output, direct output, stills in `renders/single_frames/`) and, per the user, an `images/` folder with the GoPro originals.

| Pipeline level | Page |
| --- | --- |
| camera folder | dataset tab (row 1) |
| gloves folder | colour tab (row 2, label from `pretty_color`) |
| Pose_set folder | tool tab (row 3) |
| `images/`, `videos/` + `renders/single_frames/` (images) and `renders/videos/` (videos) of a Pose_set | boxes, one per camera; Images / Videos toggle at the right of row 3 |

**Import scripts** (`tools/`, Python, standard library): `get_images.py` and `get_videos.py`, sharing `import_common.py`. `tools/get_all.py` (plain Python; ships with the user's own roots, `IMAGE_ROOT` = `VIDEO_ROOT` = `C:\Users\scherb\LocalDesktop\CHC_image_render`, which also holds the launcher; keep the user's uploaded copy of its settings block when updating the file; settings at the top: `IMAGE_ROOT`, `VIDEO_ROOT`, `RUN_SCRIPT`, `FILTER`, `DRY_RUN`, `VIDEO_ARGS`, `PAUSE_AT_END`) runs both scripts in turn as subprocesses of `sys.executable`, i.e. with whichever Python started it (an earlier bash version, `get_all.sh`, was replaced because it had to guess the interpreter and needed LF line endings on Windows); each script takes its own root, an empty root skips that kind, the exit code is non-zero if either failed, and a `finally`-style pause waits for Enter on every exit path (done, error, Ctrl+C) when stdin is a terminal. `get_videos.py` checks for ffmpeg lazily, when it first meets a video, so a root without videos finishes cleanly without ffmpeg.
- `import_common.py` holds the **SETTINGS** block: `RUN_SCRIPT`, `SOURCE_RANGE`, `TARGET_RANGE`, `ROTATION_OFFSET`, `TARGET_NAME`, `ORIGINAL_CAMERA_RE`, `RENDER_CAMERA_RE`, `RENDER_GOPRO_RE`, `ORIGINAL_DIRS`, `RENDER_SKIP_DIRS`, `TIMED_DIR_RES`. The renaming is `target = TARGET_RANGE[0] + (n - SOURCE_RANGE[0] - ROTATION_OFFSET) % count` (gopro5 -> camera02, gopro1 -> camera10 with the shipped values, `ROTATION_OFFSET = 4`; the user first said gopro4 and then corrected it to gopro5); `rename_map()` validates the ranges, `print_rename_table()` prints the table on every run. The user's real data: the ORIGINALS are always named `camera<number>` (`camera02.png` ... `camera13.png`) and are used as they are (`original_camera()`, any number, no rotation); only the RENDERS are named after the GoPro (`synthetic_GoPro_CHC1_05_.png`) and `render_camera()` runs that number (`RENDER_GOPRO_RE`, `SOURCE_RANGE` only) through the rotation; a render with `camera<number>` is used as it is. (History: the rotation was first applied to the originals, which wrongly skipped `camera13.png` and turned `camera02.png` into camera11; a camera-named pass-through was added, removed, restored, and finally the originals' rotation was dropped altogether on the user's statement above.)
- `Pipeline` reads `IGNORE_DIRS`, `RENDER_SUBDIR`, `WORK_SUBDIR`, `BODY_NPY`, `HANDS_NPY` from `run_dataset_pipeline.py` with `ast` (never imports it: it needs numpy/torch). `find_pose_sets` reproduces the launcher's rule. Script search order (`find_run_script(given, root)`): `--run-script` / `RUN_SCRIPT`; then `run_dataset_pipeline.py` directly in the dataset root given to the script or up to 3 folders above it (the user keeps the launcher and `blender_stage.py` at the root of the dataset folder; `blender_stage.py` is not read); then `run_dataset_pipeline.py`, `pipeline/`, `chc_pipeline/pipeline/` in the project, its parent and grandparent; else defaults (`output_3d`) with a printed notice. Images and videos can have different roots, each finds its own launcher.
- `collect()` builds per Pose_set `{camera: {original, renders}}`: originals from `images/` and `videos/` (`camera<number>` in the name), renders from the folders of `renders/` named in `RENDER_DIRS` per kind, following the official output locations in `research/Pipeline output locations.md` (images: `single_frames/synthetic_<camera>_0000.<ext>`; videos: `videos/synthetic_<camera>.mp4`; frame sequences `images/synthetic_<camera>/…_<NNNN>.<ext>` are NOT imported by default and a notice counts the skipped sequence folders; add `images` to `RENDER_DIRS["images"]` to import them as numbered tabs), recursively, minus `RENDER_SKIP_DIRS` and timestamped folders. With `PREFER_PNG_COPY` (default) a `.png` next to a same-named non-PNG still replaces it (the toolkit writes that copy when the scene format isn't PNG). A missing `single_frames/` warns only when there is no `images/` either, a missing `videos/` is silent (normal); the originals are always imported. Camera from `RENDER_CAMERA_RE` in the file name, else the folders; none -> the file stem, with a warning. Extension decides the script: `IMAGE_EXT` -> get_images, `VIDEO_EXT` -> get_videos. A second original for the same camera is skipped with a warning.
- Destination: `data/<dataset>/<colour>/<tool>/<images|videos>/original/<camera><ext>` and `.../render/<path below renders/>` (extension lower-cased). `sync_file` copies when size or mtime differ. `get_videos.py` probes with ffprobe, copies a playable video, otherwise converts to H.264 8-bit MP4 into `data/` (temp file `.<name>.converting.mp4`, verified for h264 + yuv420p and length within max 0.5 s / 2 %), and never touches the sources (the old `prepare-videos.py` moved the originals; that script is gone). A converted file newer than its source is kept.
- `data/manifest.json` is shared. Each script owns its kind (`images` or `videos` lists of each tool): it empties that kind (for all tools, or only the Pose_sets it processes with `--filter`), refills it, deletes the files the previous manifest listed for that kind and the new one does not, then **sweeps** (`sweep()` in `import_common.py`): every file under `data/*/*/*/<kind>/` that the new manifest does not list is deleted (all tools, or only the `--filter` Pose_sets; nothing in a dry run), which also clears orphans of a lost manifest, crashed runs and vanished tools; removes empty folders, writes the manifest. Version 3 format: `{ version: 3, generated, datasets: [{ name, label, colors: [{ name, label, tools: [{ name, label, images: [room], videos: [room] }] }] }] }`, `room = { name: "camera02", original: "<path>" | null, renders: ["<path>", ...] }`, all paths relative to `data/` with `/`. Tools without boxes, colours without tools and datasets without colours are pruned.
- Warnings: files over 100 MB and a `data/` over about 1 GB (GitHub limits).

**Page code.** `js/core/naming.js` is gone (the manifest says which file is original and which are renders; there is no name guessing). `js/app/discovery.js`: `loadFromServer()` fetches `data/manifest.json`; the folder picker (`#folderInput`, pick the `data` folder) finds `manifest.json` among the picked files and resolves each path against them; `buildTree(manifest, urlOf)` returns `[{ name, label, total, sel, colors: [{ ..., sel, tools: [{ name, label, total, entries: { image, video }, panes, kind }] }] }]`; `makeEntry` turns a room into the entry `room.js` always took (`original`/`renders`/`preview`, plus `title` "Camera 02"). `js/app/render-page.js`: `showTool(ds, color, tool, kind)` is the one function that changes the view (builds the pane `pane-<ds>-<colour>-<tool>-<kind>` once, hides all others, refills the three rows and the Images / Videos toggle, sets the next button, scrolls to the top); `showColor` and `showDataset` pick the remembered child (`sel`). `fillRow` builds a row of tab buttons with arrow-key handling. The next button goes along `leaves` (flattened tools in dataset > colour > tool order) and is still a snap point of `scroll-assist.js`.

**Layout (redesigned later).** `index.html`: white page (`--bg #fff`, no dark theme), full-width `#topbars` (sticky except on windows up to 640 px high or wide): rows `Dataset`, `Colour`, `Tool` (`.row`, label column `.rowlbl`, buttons without borders, flex 1 so they fill the row, centred text, a half-height `::before` line between neighbours, rows separated by `border-top`), a `View` row (`.row.view`) under the tool row with `#sideTabs` (Images / Videos) and `#modeTabs` (Slider / Fade / Difference, shared by the whole gallery), the two groups 40 px apart, and a `Compare` row `#cmpRow` (sweep button `#sweepBtn`, track `#cmpTrack` + handle, gamma `#gammaIn`). `css/topbar.css` styles all of it; `css/room.css` the gallery: `.pane` is a CSS grid (`--cols`, default `repeat(auto-fill, minmax(min(100%, 420px), 1fr))`, set by the `#colsSel` menu in `shortcuts.js`) and a cell is `.room` with `.stage` (picture), `.cam` (camera label, inside the picture, top left), `.tabs` (render tabs, inside, top right), `.warn`, `.transport` (video cells only). No path/file-name label (render tabs keep the name as a tooltip), no per-cell bar, slider, sweep or gamma. **`js/room/gallery.js`** holds the shared state `gallery = { mode, pos, gamma, sweeping, rooms }`; each cell registers `{ node, apply(), nextRender() }` in `gallery.rooms`; `gallery.refresh()` applies the state to the cells of the open pane only (`render-page.js` calls it after switching panes, so hidden panes catch up). A drag on any `.stage` (slider mode) or on `#cmpTrack` calls `gallery.setPos`. The gamma filter is one SVG `#gamma-filter` in `index.html`. `shortcuts.js`: `S` toggles the sweep anywhere; Space, 1-9, K, `,` `.` act on the hovered cell. `scroll-assist.js` (gravity scrolling) was deleted: it makes no sense with a grid. Images are the default tab; a tool without images opens on Videos.

**Flush, centred gallery; no next button (latest).** Cells: no border, no radius, no padding, `gap: 1px`; `.wrap` has no padding; the bar has no margin. `fitGallery()` again maximises the cell width for up to 12 cells (px columns, `FIT_GAP = 1`), with `availH = innerHeight − topbars height`; `#rooms` is `display:flex; min-height: var(--avail-h)` and `.pane` has `margin:auto`, so the grid is centred on both axes in the area below the bar (equal side and top/bottom space, no page scroll for 12 cells). Row labels show name + number (`.rowlbl .nm` / `.num`). The View row's two `.extras` groups are `flex:1` and their buttons stretch. The next-tool button (`#nextDs`, `leaves`) was removed.

**Simplified page.** Removed on request: the header (title, count, Columns menu, Grid lines, Open folder), the hint paragraph, the whole Compare row (track, handle, sweep, gamma, captions), the gamma SVG filter, the `.grid` overlay, the folder picker in `discovery.js` and the `nomanifest` notice, the Sweep / S key. Kept and changed: `gallery.js` now only holds `mode` and `pos`; every picture is dragged to move the split (also in Fade mode, where it sets the original's opacity); left/right arrows nudge it while a cell is hovered. `fitGallery()` always runs Auto (no `setColumns`). The row labels (`#statDs`, `#statColor`, `#statTool`, `#statView`) now show statistics, set in `showTool()`: datasets, colours of the open dataset, tools of the open colour, cameras in the open view (the title attribute has the words). The gravity scrolling was already gone.

**Fit 12 and import options (later).** `fitGallery()` (`render-page.js`) sizes the pane for `Auto`: up to `FIT_MAX = 12` cells, columns chosen to maximise the cell width given the first cell's `--ar`, the free height `innerHeight − pane top − gap` and the width of `#rooms`; video panes reserve `VIDEO_EXTRA` px per cell for the transport; below `FIT_MIN_W` it falls back to width-based columns and scrolls. It runs on pane switch, resize, `#topbars` resize (ResizeObserver) and whenever a cell learns its aspect ratio (`setAspect` → `queueFit`). `setColumns()` handles the Columns menu (a number = `--cols` on `:root`). Importers: `ONLY_WITH_RENDERS` (a constant at the top of `get_images.py` and of `get_videos.py`, CLI `--only-rendered` / `--include-unrendered`, `IMAGE_ARGS` in `get_all.py`) makes `import_pose_set(..., only_rendered)` skip cameras whose render list is empty; the sweep deletes the files of previously imported unrendered originals. Image compression is only advised (README, "Keeping the data small"); the scripts copy files unchanged.

**Compression (later).** `tools/compression_settings.py` (plain Python dicts `IMAGES` / `VIDEOS`, each `apply_to`, `resize`, `format`, `compression`) is read and validated by `tools/compress.py` (`load_settings`: defaults for missing keys, errors for wrong values or unknown keys, loaded with importlib so the user can add comments freely). Switches: `COMPRESS_IMAGES` / `COMPRESS_VIDEOS` / `COMPRESSION_FILE` in `get_all.py` -> `--compress` / `--compression-file` on the getters (`parse_args`); the getters alone default to no compression. Images: Pillow (`encode_image`: exif_transpose, 16-bit -> 8-bit, resize with `never_enlarge`, alpha flattened for JPG, temp file then `os.replace`); an unreadable picture is copied unchanged with a warning; EXR is copied. Videos: ffmpeg through the shared `convert()`/`encode()` in `get_videos.py` (`video_args`: scale with `force_original_aspect_ratio=decrease:force_divisible_by=2`, `-fpsmax`, libx264 or libvpx-vp9, audio dropped or kept), verified by ffprobe (codec h264/vp9, yuv420p, length within max 0.5 s / 2 %). Re-encoding is skipped when `data/.compression-state.json` holds the same signature (`signature()`: source size, mtime and a hash of the section's settings) and the file exists; `State.save()` prunes entries of deleted files. The destination extension changes with the format, so a format change makes the sweep delete the old files. Tested with fake data: jpg / webp / avif / png / keep, rerun = nothing encoded, a changed quality = all re-encoded, bad settings = message, mp4 (160 px wide, h264 yuv420p) and webm (vp9, 5 fps). Not tested on real GoPro / render files.

**One playback bar for the video view (later).** The per-cell `.transport` is gone. `index.html` has one `#transport` (play, previous / next frame, `.seek` range with 10000 steps, `.time`, `.speed` select, `.loop` icon toggle) after `#rooms`, `position: sticky; bottom: 0`, hidden except in a video pane. There is no fps select. `js/room/transport.js` (loaded before `room.js`) is the `transport` object: it asks each shown cell (`gallery.shown`) for `videos` (its original and active render, errored ones left out), plays/pauses/seeks all of them, keeps one master (the first loaded video) and, in a `requestAnimationFrame` loop, pulls any video that drifts more than 0.1 s back and starts one that finished loading late. Duration = the shortest loaded video; loop and end use it. Frame stepping goes to the middle of the neighbouring frame using `fps`, measured with `requestVideoFrameCallback` on the master (smallest positive media-time step of the first 12 frames shown, 30 until measured). Playback is at the video's native rate, which the display caps at its refresh rate (no setting). Autoplay: once every video of the pane has `readyState >= 1` and the user has not stopped playback (`manualStop`); `transport.paneChanged()` (called by `showTool`) pauses everything, seeks to 0 and tries again; `transport.cellChanged()` (a render tab switch) puts the new video at the master's time and starts it if playing; `transport.update()` runs on every video's `loadedmetadata` / `error`. Scrubbing pauses and resumes on release when it was playing. `fitGallery()` subtracts the bar's height from `availH` (ResizeObserver on the bar) and no longer reserves anything per cell. `shortcuts.js`: K, `,`, `.` act on the bar whenever it is visible (also with the seek bar focused); Space and 1-9 still act on the hovered cell. The IntersectionObserver autoplay band is removed. Verified with Playwright on 12 generated VP8 camera pairs (10, 25, 30 fps; one 3 s, the others 4 s): 24 videos play, spread between them stays below 0.1 s, pause lands on one frame (spread 0), frame step is one frame, seek bar click seeks all, K resumes, 2x speed applies to all, loop wraps at the shortest video and stops at its end with loop off, switching to Images pauses everything and the bar hides, grid and bar do not overlap and the page does not scroll at 1440 x 900; layout looked at 1440, 1920 and 390 px wide. Not tested: real H.264 / GoPro files, Firefox, Safari.

**Deployment.** `data/` (copied files + manifest) is committed; `.github/workflows/pages.yml` copies `index.html css js data` and fails with a message when `data/manifest.json` is missing; `tools/build-manifest.mjs` and Node in the workflow are gone. `data/.gitkeep` keeps the folder in a fresh repository.

### What was verified (pipeline version)

Test data: a synthetic pipeline root (two camera folders, three colour folders, four Pose_sets, GoPro originals as `gopro<N>.jpg` in two Pose_sets and `GoPro_<NN>.JPG` in the others, renders `single_frames/synthetic_camera02..13.png`, `extrinsics/`, a timestamped old render folder, `_pipeline/`, an `output_3d/` folder holding the `.npy` pair and an image, a `_color_test/` folder), the real `run_dataset_pipeline.py` as `--run-script`, headless Chromium (Playwright) at 1280 x 900 and 390 x 800. *(Originals in this test were GoPro-numbered; in the user's real data they are `camera<number>`, and the renders are the GoPro-named ones.)*

| Area | What was checked | Result |
| --- | --- | --- |
| Official locations | fake root laid out per the table: stills with `.exr`/`.jpg` + `.png` copies, a png-only still, logs, old timestamped folders in `single_frames/` and `renders/`, a frame-sequence pose, `videos/synthetic_camera02.mp4`, a stray video in `renders/` | one box per camera with only the `.png` (copies dropped, logs and timed folders ignored); the sequence pose gets a skipped-sequences notice and no "not found" warning; only `renders/videos/` is copied for videos (stray video ignored); with `images` added to `RENDER_DIRS` the 3 frames become 3 tabs |
| Render folder | decoy renders in `renders/images/` next to `renders/single_frames/`; a Pose_set without `single_frames/` | only `single_frames` is copied for images (decoys ignored); the missing folder gives a warning and the 11 originals still import; videos still read the whole `renders/` |
| Run script search | none anywhere; launcher at the dataset root with a changed `IGNORE_DIRS`; root started inside a colour folder; explicit `--run-script`; the root's `.py` files | defaults with notice; found at the root and its list read; found in a parent; explicit wins; the root's scripts are not treated as data |
| Pose_set search | `output_3d`, `_pipeline`, `renders`, `_color_test` | 4 Pose_sets found, the ignored folder's files never imported; IGNORE_DIRS printed from the run script |
| Renaming | table, odd names, out-of-range, mismatched ranges, offset 0 | gopro5 -> camera02, gopro1 -> camera10, gopro12 -> camera09; `GoPro_07.JPG` -> camera04; `IMG_0012` -> camera09; names without a number or with 13 skipped; mismatch stops with a message; offset 0 gives 1 -> 2 | *(Tested while the rotation still applied to GoPro-numbered originals; it now applies to GoPro-named renders only, checked with `synthetic_GoPro_CHC1_05_.png` -> camera02, originals `camera02.png`/`camera13.png` as they are.)*
| Sweep | planted orphan files in images/ and videos/ folders (one tool, one vanished tool, a filtered scope), manifest deleted, dry run | a filtered run only clears its own Pose_sets; a full images run clears image orphans of every tool and leaves video orphans; the videos run then clears those; orphans removed even with no manifest; a dry run deletes nothing |
| get_images | first run, re-run, `--filter`, deleted source, `--dry-run` | 96 files copied, re-run copies 0; a filtered run leaves other Pose_sets in `data/`; a full run removes the deleted original's copy and the camera becomes a render-only preview; the dry run writes nothing |
| get_videos | HEVC 10-bit `.mp4`/`.mov` original, H.264 and VP9 4:2:0 WebM, VP9 4:4:4 | HEVC and 4:4:4 converted to H.264 8-bit MP4 and verified, playable files copied unchanged; sources untouched; re-run converts nothing; the images in the shared manifest survive a video run and the other way round |
| Page | counts, tab switching, remembered colour per dataset, disabled Videos toggle for tools without videos, next button across a colour boundary, sticky rows after scrolling, arrow keys on a row | all as expected; three rows in the requested order; no script errors |
| Videos in the page | WebM original + render per camera | boxes paired by camera, transport shown, autoplay on the centred box |
| Folder picker | picking `data`, picking a wrong folder, manifest blocked | page loads 50 boxes from the picked files; a wrong folder gives "No manifest in that folder"; a blocked manifest gives the data / server notice |
| Phone width | 390 px | rows wrap, toggle wraps under the tools, no horizontal scroll |

**Not verified:** the user's real pipeline output (actual toolkit file names inside `renders/images/`, `renders/videos/`, and the real name of the GoPro files; originals are found by `camera<number>`, renders by `camera<number>` or `GoPro…<number>`; adjust `ORIGINAL_CAMERA_RE` / `RENDER_CAMERA_RE` / `RENDER_GOPRO_RE` if they differ), whether the originals really live in `<Pose_set>/images/`, multi-frame renders (several files per camera become numbered tabs), playback of H.264 files (the sandbox Chromium has no H.264 decoder; ffprobe and an ffmpeg decode were used), Windows paths and UNC shares for the import scripts, the GitHub Actions run itself, a data folder of several GB.

## Datasets (added after the Videos / Images tabs)

`rooms/` now holds **datasets**: a dataset is a folder of room folders (`rooms/<dataset>/<room>/files`). Rooms that sit directly in `rooms/` are grouped into a dataset called **Misc**, always last. The page has three levels: a dataset bar (far left, `#dsTabs`, `.dsbar`), the Videos / Images bar inside the dataset (`#sideTabs`, now offset by `--ds-w`), and the boxes. Details are under *Data conventions* below; the reasoning is in `project.md` §1 and §8.

## Code layout

Run it as described in the README. The page reads the folder listing of `rooms/`; **Open folder…** covers `file://`.

```
render-check/
  index.html              markup only: header, box template, script list
  README.md               user guide
  THIRD_PARTY_NOTICES.md  licences for the PIZ decoder code adapted from three.js
  css/                    base · room · notices · sidebar
  js/
    core/                 config · util · naming
    lib/exr.js            OpenEXR decoder (self-contained, also loads in Node)
    media/media.js        builds the img / video / canvas for a file; decodes EXR
    room/room.js          one comparison box: modes, slider, gamma, sweep, video, tabs; makeFix
    app/                  render-page · discovery · shortcuts · main
    room/gallery.js       shared mode / split / sweep / gamma of all cells
  rooms/                  the user's comparisons: room folders and dataset folders of rooms (small examples included, all safe to delete)
  tools/extract-frame.bat frame extraction with ffmpeg
  tools/build-manifest.mjs writes rooms/manifest.json (static hosting; Node, no packages)
  tools/prepare-videos.py  converts videos browsers can't play to H.264 MP4 in rooms/, then runs python -m http.server 8080
  .github/workflows/pages.yml  deploys to GitHub Pages: stages the site, runs build-manifest, publishes
  research/               this handover and project.md
  tests/exr/              decoder tests: `python3 tests/exr/gen.py`, then `node tests/exr/test.js` (needs `pip install OpenEXR numpy`)
```

**Load order** (classic `<script>` files sharing one global scope, so the page also works from `file://`): `core/config, core/util, core/naming, lib/exr, media/media, room/room, app/render-page, app/discovery, app/scroll-assist, app/shortcuts, app/main`.

- A file may use anything defined by the files above it at load time. Functions are only hoisted within their own file, so code that runs at load must not call a later file.
- `app/main.js` starts everything (`loadFromServer()`), so it must stay last.
- To add a feature, add a file under the folder that fits and a `<script>` line at the right place in `index.html`.
- Per-box behaviour belongs inside `createRoom` in `room/room.js`; there is no global per-room state.

This layout was taken from the sister project *Distortion viewer* (same page, plus lens distortion and hand matching). The split keeps the same folder names and load order logic, so a file with the same name does the same job in both. Render check has no `distortion/` or `hand-match/` folders and no `core/state.js`, because it has no shared state beyond `hovered` (in `config.js`).

## Data conventions

One folder per room under `rooms/` (or under a dataset folder inside `rooms/`), holding one original and one or more renders, or just some files to preview (see *Previews* below). Files sit directly inside the folder.

- **Which file is the original.** A file is a render if its name contains the word `render` or `synthetic`, or ends in a Blender number such as `name.001.png` (`js/core/naming.js`). The original is a file named with `original`, `orig`, `photo`, `ref`, `real` or `footage`, else the first remaining file. If every file looks like a render, or none does, the code picks one and shows a warning.
- **Datasets.** `collectDatasets({ root, list, urlOf })` in `discovery.js` turns any of the three sources (server listing, manifest, picked folder) into `{ datasets, skipped }`. For each folder `top` in `rooms/` it lists the folder and decides: media files directly inside (`toEntries`, which now returns an entry for any folder with at least one media file) → a room, added to the `misc` dataset, unless the folder also has subfolders and its own files are only a preview (then it is a dataset and the stray files are ignored); no media files and no subfolders → skipped with `skipReason` ("no images or videos found"); otherwise → a dataset, and each of its subfolders is listed and built as a room (skips are named `dataset/room`). So a folder with media files of its own is a room, and one that only holds folders (or has subfolders and only a preview's worth of files) is a dataset. Datasets are keyed by lower-cased folder name; a real folder called `misc` merges with the loose rooms. Order: natural folder-name order, `misc` last; the label is `prettify(folder)` (`Misc` for misc). Datasets cannot nest: a room folder inside a room folder is reported as skipped ("no deeper"). Sources share one shape, `{ root: {dirs, files, others}, list(dir), urlOf(file) }`; a `dir` is `{ name, url? , node? }`, where `url` is used by the server listing and `node` by the manifest and the picked folder (a tree built from `webkitRelativePath`). `renderAll(sets, sourceLabel, skipped, info)` in `render-page.js` gets the list: each dataset becomes `{ name, folder, entries: {video:[], image:[]}, panes: {}, kind, total }`.
- **Showing a dataset.** `showDataset(index, kind)` builds the `.pane` for that dataset and kind the first time (`id="pane-<index>-<kind>"`), hides every other pane of every dataset, fills the Videos / Images counts for this dataset, remembers the kind in `ds.kind` (a dataset opens on its last kind, else Videos, else Images), fills the next-dataset button, clears `hovered`, and scrolls to the top. `showTab(kind)` is the old name, now a thin wrapper for the current dataset. Panes of datasets already visited stay in the DOM (hidden), so box state survives switching.
- **Next-dataset button.** `#nextDs` (below `#rooms`, outside the panes) shows `Next dataset / <name> / <n comparisons>` and is hidden on the last dataset. It is also a **snap point** of `scroll-assist.js` (`snapPoints` selects `.room, .next-ds`). Without that, the gravity zone below the last room reached to the bottom of the page and pulled the scroll back, holding the button out of reach.
- **Videos and Images tabs.** Every comparison entry has `kind`: `video` if its original or any render is a video, else `image` (`buildEntry` in `discovery.js`). One folder is one entry, so the user keeps video rooms and image rooms in separate folders under `rooms/` and each lands in its tab. (`toEntries` returns a list only so callers can `flat()` it.) `renderAll` (`render-page.js`) sorts entries into `tabEntries.video` and `tabEntries.image`, fills the counts in the `#sideTabs` bar, and calls `showTab`. `showTab(kind)` builds that tab's `.pane` the first time (so the other tab's media is not fetched or decoded up front), hides the other pane (`hidden`), clears `hovered`, and scrolls to the top. The page opens on `video`, or `image` when there are no videos. A pane is a `display:grid` container, so the layout inside is the same as before the tabs existed. Code that walks `.room` elements must skip hidden ones (`snapPoints` checks `offsetParent`).
- **Autoplay** (`room.js`, next to the video sync). Two IntersectionObservers watch the `.stage`: the old one pauses and stops the sweep when the picture is completely out of view; the new one uses `rootMargin: '-49% 0px -49% 0px'`, a 2 % band across the middle of the window, and sets `inBand`. Entering the band calls `maybeAutoplay()`: it plays if `inBand`, not `manualStop`, not already playing and every video has metadata (`readyState >= 1`); it is also called when the media finish loading and after a render switch. `autoStarted` marks a play that autoplay began. Leaving the band clears `manualStop` and pauses only if `autoStarted`. `manualStop` is set by the play/pause button and **K** (when pausing), frame stepping and scrubbing; starting by hand clears it. Hidden tabs (`display:none`) report "not intersecting", so their videos pause and re-arm by themselves.
- **Several renders.** They become numbered tabs in file-name order; keys 1-9 switch them while hovering. Videos stay in sync and keep the current time on a switch.
- **Order and titles.** Boxes are sorted by folder name with natural numeric order. A leading `01_` sets the order and is hidden in the title.
- **File types.** Images: JPEG, PNG, WebP, GIF, AVIF, BMP, EXR. Videos: MP4, M4V, WebM, MOV, OGV. Videos are muted and play in the browser's codecs, so ProRes does not work.
- **EXR.** Decoded by the page's own decoder (`js/lib/exr.js`), one file at a time (4K: 1 to 2 s), painted once into a `<canvas>` that then acts like an image everywhere (aspect ratio, slider clipping, fade, difference, gamma filter), and shown with the plain linear to sRGB transform (alpha un-premultiplied, no tone mapping). The box line names the codec, channel types and layer read (`render EXR ZIP, half`). Supported: scanline files, half, float and uint channels in any mix, compression none, RLE, ZIPS, ZIP, PXR24 and PIZ, single-part and multipart files (Blender's multilayer EXR, which picks `R,G,B`, else `Combined`, else the first RGB layer, or a grey `Y` layer), and a data window smaller than the display window (crop render). Not supported, with a clear message in the box: B44, B44A, DWAA, DWAB, tiled and deep files. Other unsupported formats (TIFF, HEVC/ProRes) still go to the skipped-folder list.

### Rooms on static hosts: `rooms/manifest.json`

Static hosts (GitHub Pages) return 404 for a folder URL, so `listFolder` cannot work there. `tools/build-manifest.mjs [siteRoot]` scans `rooms/`
and writes `rooms/manifest.json`:

```json
{ "version": 1, "generated": "…", "loose": [],
  "rooms": { "02_kitchen": { "files": ["kitchen.jpg", "kitchen.001.exr"], "dirs": [] } } }
```

Version 2 (with datasets) adds `children` to any folder that has subfolders, so a dataset folder can be read without listing it:

```json
{ "version": 2, "generated": "…", "loose": [],
  "rooms": { "01_apartment_a": { "files": [], "dirs": ["living-room"],
               "children": { "living-room": { "files": ["original.jpg", "render.png"], "dirs": [] } } },
             "old-test": { "files": ["original.jpg", "render.png"], "dirs": [] } } }
```

`listManifest()` accepts both versions (a missing `children` just means no subfolders are known).

It lists every non-hidden file; the page decides what is media with `MEDIA_RE`, so the script holds no copy of the file-type rules. In `discovery.js`,
`loadFromServer` tries the server listing first (always current while editing locally) and uses `listManifest()` when the listing fails or has no
folders; both return the same shape (`root` plus a `list(dir)` function), so classification, skip reasons and notices are shared. Manifest URLs are built
with `encodeURIComponent` per path part (a folder named `04 Odd #name` works). If neither source exists, the usual "Couldn’t read the rooms folder"
notice appears, now mentioning the manifest script. The script also warns about files over 100 MB and a `rooms/` folder over about 1 GB.

The workflow `.github/workflows/pages.yml` copies `index.html`, `css`, `js` and `rooms` into `_site/`, runs `node tools/build-manifest.mjs _site` there and
publishes `_site`, so `manifest.json` is never committed (it is in `.gitignore`) and tests, research and tools are not published.

### How EXR loading is wired

1. `config.js`: `IMAGE_RE` and `MEDIA_RE` include `exr`, so the folder listing keeps EXR files as media.
2. `discovery.js`: `toEntry` adds `isExr` to every file record, next to `isVideo`.
3. `media.js`: `makeMedia(src, isVideo, cls, label, isExr)` returns a `<canvas>` for EXR. It fetches the file, queues the decode (`decodeExr`: one file at a time, to keep memory low), writes the pixels with `putImageData`, sets `el.exrInfo`, clears `el.exrPending` and fires a normal `load` event. On failure it sets `el.exrError` (the decoder's message) and fires `error`.
4. `util.js`: `dims(el)` reads `width`/`height` for a canvas, so aspect checks and labels work unchanged.
5. `room.js`: the existing `load` and `error` listeners are reused. `updateLabels` shows `decoding EXR…` while pending and appends the codec note afterwards; the error handlers show `Couldn’t read this render (file): <decoder message>.` for EXR instead of the generic text.

A new media type follows the same recipe: a `*_RE` entry in `config.js`, a flag in `toEntry`, a branch in `makeMedia` that returns an element firing `load`/`error`, and a case in `dims`.

## How the page works

The code is split into files that share one global scope (see *Code layout*). The sections below follow the original single-file layout; each names the file it now lives in. In reading order:

1. **CSS**: theme tokens on `:root` (light by default, dark via `prefers-color-scheme`). The neutral grey is
   deliberate: it echoes a photographic grey card so the surroundings don't bias color judgement.
2. **Templates**: `#roomTpl` is cloned once per comparison box.
3. **Classification**: `classify(files)` decides which file is the original and which are renders.
4. **`createRoom(entry)`**: builds one box and owns all of its state (mode, slider position, gamma, active
   render, video sync, sweep). Everything per-box lives in this closure; there is no global per-room state.
5. **Notices**: `renderAll`, `skippedBox`, `showNotice`, `makeFix` (the "can't play this video" panel).
6. **Sources**: `listFolder` / `loadFromServer` (server folder listings) and the **Open folder…** fallback.
7. **Scroll assist**: the gravity scrolling physics.
8. **Global keys and toggles**: Grid lines, Columns, keyboard shortcuts.

### Finding the rooms

Browsers can't list folders, and a static page can't either, so the page asks the server for the folder URL
(`rooms/`) and parses the HTML directory listing the server returns. `listFolder(url)`:

- resolves every link against the final response URL (after redirects) with a trailing slash forced on;
- keeps only direct children; treats a link as a folder if it ends in `/`, has no extension, or has a purely
  numeric extension (`kitchen.001`), because some servers (VS Code Live Server / serve-index) omit the slash;
- returns `{ dirs, files (media), others (non-media files) }`.

`loadFromServer` lists `rooms/`, then each subfolder, builds entries with `toEntry`, and collects a reason
for every skipped folder (`skipReason`). If nothing is usable, the notice lists each folder and its reason.

The **Open folder…** fallback uses `<input webkitdirectory>` and groups files by their immediate parent folder,
then goes through the same `toEntry`/`skipReason` path with object URLs.

### Classification rules (`classify`)

- A file is a **render** if its name contains the token `render` or `synthetic` (`RENDER_WORDS`), or its stem
  ends in a Blender-style number (`name.001`).
- Among the remaining files, one whose name contains `original`, `orig`, `photo`, `ref`, `real` or `footage`
  (`ORIGINAL_WORDS`) is preferred as the original; otherwise the first remaining file (natural sort) is used.
- Fallbacks, each with a visible warning on the box: no file marked as a render (first file is the original,
  the rest are renders); more than one non-render file (extras are ignored and named).
- **Previews (nothing to compare).** `classify` first checks for rooms that cannot be a comparison and returns `{ preview, files }` instead:
  every file looks like a render → `'render'`; every file is named like an original → `'original'`; a single file → its own kind, or `'file'`
  when its name says neither. (Before previews, a single file made the folder skip, and "every file looks like a render" made one of them
  the original with a warning. See `project.md` §1.)

Entries look like `{ name, warning, kind, original: {url, isVideo, isExr, name}, renders: [{url, isVideo, isExr, name}, …], preview: null }`.
A **preview entry** has `original: null`, `renders` = the files that exist (named for historical reasons) and `preview: 'render' | 'original' | 'file'`.
In `createRoom` (`room.js`) `preview = !!entry.preview` makes `photo` null and `mode` `'view'`, adds class `preview` to the box (CSS hides `.seg`,
`.slider-row` and the tags and restores the bottom padding), blocks the sweep, labels the tabs "File", follows the aspect ratio of the selected
file (`select` and the load listener call `setAspect`), and writes `updateLabels` meta such as `render only, nothing to compare yet`.
Gamma, grid, EXR, tabs, the video transport and autoplay are the normal code paths, with `photo` filtered out of the video list.

### Layering inside a box

    .viewer                      width capped so the image is never taller than 80vh
      .view-row
        .stage                   aspect-ratio = original's pixel size; pointer target for slider drags
          .blend                 isolation: isolate; gamma SVG filter applied here
            video/img.render     one element per render; inactive ones have class "inactive" (display: none)
            video/img.photo      the original, always on top
          .grid, .tag.l, .tag.r
        .gamma-col               vertical gamma slider
      .slider-row                sweep button + .track with .handle

- **Slider mode**: `photo.style.clipPath = inset(0 (100 - pos)% 0 0)`. Clipping the top layer is cheaper and
  more exact than resizing elements, and works the same for images and videos.
- **Fade mode**: `photo.style.opacity = pos / 100`. The same `pos` drives both modes, by request.
- **Difference mode**: `mix-blend-mode: difference` on the photo inside the isolated `.blend`.
- **Gamma**: an SVG `feComponentTransfer` filter (type `gamma`, exponent `1/γ`, `color-interpolation-filters="sRGB"`)
  applied to `.blend`, so it acts after blending and also amplifies small differences. CSS has no gamma filter,
  hence SVG. It's removed entirely at γ = 1 for performance.
- Media use `object-fit: fill` inside a box whose aspect ratio comes from the original. If a render has a
  different aspect ratio it is stretched, and the box warns about it (threshold 0.5 %).

### Slider and track

Dragging on the image maps 1:1 to the split. The bottom track is deliberately shorter than the image (the
sweep button sits to its left, like a video player), so it maps its own width to 0–100 % instead. Pointer
mapping uses whichever element started the drag (`dragEl`).

### Video sync

Only the original and the **active** render play; other render videos are paused. The active render is the
master clock (or the original if the render is an image). A `requestAnimationFrame` loop corrects the follower
when it drifts more than 0.08 s; on pause, the follower is set to the master's exact time so both show the
same frame. Frame stepping uses a frame length measured from the shown frames (see "One playback bar for the video view"); this older section describes the per-cell player that the bar replaced, so master/follower now refers to the first loaded video and the rest.
Looping and the end of playback use the shorter duration. Switching renders keeps the current time and
resumes playback if it was playing.

Videos from the server are fetched as blobs and played from object URLs, because `python -m http.server` does
not support HTTP Range requests and browsers then can't seek (seeking snaps to 0). This costs memory for large
files but makes scrubbing and frame steps exact.

### Sweep

`pos = 50 − 50·cos(phase)` gives an eased back-and-forth that lingers at the edges; `SWEEP_SECONDS` (14, now in `js/room/gallery.js`) is one
full cycle. Starting resumes from the current position (`phase = acos(1 − pos/50)`). With several renders,
the next render is selected each time the phase crosses an odd multiple of π (`pos = 100`, original fully
covering the frame, so the swap is invisible), but only after a full 2π since the last switch. `lastSwitch` is
stored as the exact crossing point, not the frame's phase; storing the frame's phase skipped every other cycle.

### Scroll assist (removed)

The gravity scrolling (`js/app/scroll-assist.js`, `Snap scroll` button) was removed with the gallery redesign; its design is described in `research/project.md` (the rows about gravity scrolling), the code is in the earlier packages.


## Datasets: what was verified

| Area | What was checked | Result |
| --- | --- | --- |
| Grouping | `rooms/` with three dataset folders (image-only, video-only, mixed incl. an EXR room), the three loose example rooms, a dataset with one single-file room and an empty folder; python's server, 1400 × 900 | tabs `Apartment a 3, House b 2, Villa Tall 5, Misc 3` in that order; 13 comparisons; two folders skipped with reasons `04_broken/one-file/` and `05_nothing/`; no script errors |
| Inside a dataset | Videos / Images bar per dataset | counts and disabled state follow the dataset (an image-only dataset opens on Images with Videos disabled); a dataset remembers its tab; arrow keys, Home and End move through the dataset bar |
| Next button | Villa Tall (five tall video rooms), real mouse wheel with Snap scroll on, 60 notches | scroll reached the bottom with the button fully in view; click opened Misc at the top; button hidden on Misc |
| Static host | `node tools/build-manifest.mjs` on a copy, served by a server that returns 404 for folders | identical tabs, counts, skips and next button as with the listing |
| Open folder… | `setInputFiles` with the `rooms` folder on the same data | same four datasets and the same skip list |
| Edge cases | a real `Misc` folder next to loose rooms; a room nested two levels below a dataset; no usable rooms at all | merged into Misc (4); reported as skipped with the "no deeper" hint; notice with the new expected layout, bars hidden |
| Video | videos of a dataset after switching | the left dataset's videos pause; only the visible room's play |
| Unchanged projects | the original zip's `rooms/` (three loose rooms) | one `Misc` tab with 3, no next button |

**Not tested:** real Windows browsers, Firefox and Safari, dozens of datasets with many large videos (memory), a phone with the 92 px dataset bar beyond a screenshot at 420 px.

## Previews: what was verified

| Area | What was checked | Result |
| --- | --- | --- |
| Cases | one dataset with: only a render, only an original, a single unmarked file, two renders (`render.001/.002`), two `original_*` files, a lone video, a lone EXR, two renders with different aspect ratios; plus a full comparison and an EXR comparison for contrast; python's server, 1400 × 900 | all shown, none skipped; preview boxes have no slider, mode buttons or tags, normal boxes unchanged; meta lines read `render only, nothing to compare yet · render.png` etc., the EXR one adds `render EXR ZIP, half`; multi-file previews get tabs labelled File |
| Aspect | two files, 400 × 600 and 1200 × 800 | stage aspect follows the selected tab (`400 / 600`, then `1200 / 800`) |
| Keys | S, Space and 1 on a preview box | no errors, no sweep, tab 1 selected |
| Video | a lone video | plays by itself in the middle of the window, transport visible |
| Folder rules | a dataset with a stray `thumbnail.png` next to its rooms; a full comparison folder that also has an empty subfolder | dataset keeps its room and ignores the file; the other is a room under Misc |
| Sources | static server with manifest (version 2), and Open folder… | same 16 rooms, same three datasets |
| Regression | the earlier dataset test data | the one-file room is now a dataset with one preview; next-dataset button still reachable by wheel; no script errors |

**Not tested:** audio-less or very long lone videos beyond the example, many lone files at once (every preview loads its file when its dataset tab is built).

## prepare-videos.py: what it does and what was verified

`tools/prepare-videos.py` is a **local pre-test / pre-push step** (not part of the page, not run by the Pages workflow). It walks `rooms/`, probes each video with ffprobe and leaves it alone when a browser plays it (`PLAYABLE_CODECS` per container, `PLAYABLE_PIX`: H.264 in MP4/M4V/MOV, VP8/VP9/AV1 in WebM, Theora/VP8 in OGV, all 8-bit 4:2:0). Otherwise it runs ffmpeg (`-map 0:v:0 -an`, even-size scale, libx264 yuv420p, CRF 16, preset slow, faststart), writes a hidden temp file `.<name>.converting.mp4` beside the source, verifies it (ffprobe says h264 + yuv420p, length within max 0.5 s or 2 %), then moves the original to `video-originals/<path relative to the project>` and renames the temp file to `<name>.mp4`. Anything that fails verification leaves the original untouched. Leftover temp files from an interrupted run are deleted at the start of a real run (not a dry run). The last step is `python -m http.server <port> --bind 127.0.0.1` from the project root (`--no-serve` skips it, `--dry-run` changes nothing).

| Area | What was checked | Result |
| --- | --- | --- |
| Detection | 14 videos: HEVC 10-bit, H.264 4:4:4 (two), ProRes 4:2:2 10-bit, PNG-in-MOV, plain H.264 MP4, VP9 WebM, two undecodable files | dry run listed exactly the 7 convertible ones with codec and size, 2 as unreadable; playable files not listed |
| Conversion | real run | all outputs h264 yuv420p, zero decode errors over a full ffmpeg decode, `moov` before `mdat` (faststart); a 641 × 361 RGB source came out 640 × 360 |
| Safety | originals, playable files, undecodable files | backups byte-identical to the originals in the same layout under `video-originals/`; playable and undecodable files untouched (checksums); a `.mov` whose `.mp4` name was taken was skipped with a message and left alone |
| Idempotence | second run | nothing to convert except the skipped clash |
| Dry run | leftover temp file present | survives (a bug where it was deleted was found and fixed) |
| Serving | script left running | `python -m http.server` on 127.0.0.1:8090, the page and `rooms/` listing served, the page found the converted rooms, Ctrl+C stops it cleanly |
| No ffmpeg | PATH without ffmpeg | clear message, still starts the page |

**Not verified:** playback of the converted files in a real browser (headless Chromium here has no H.264 decoder; correctness was checked with ffprobe and a full ffmpeg decode), Windows (the `.bat` wrapper and `winget` hint), videos in the tens of gigabytes, 10-bit HDR sources (converted to 8-bit without tone mapping, so HLG/PQ footage will look flat).

## Current state

Everything above is implemented and was tested in headless Chromium (Playwright) with synthetic images and
WebM videos, at several window sizes, under Python's server and a server that mimics VS Code Live Server's
listings. Tested: classification cases (including the author's real file names), multi-render tabs, keyboard
shortcuts, video sync/seek/frame-step/loop and render switching during playback, the sweep and its render
cycling timing, gravity scrolling with stepped wheel input and at both page borders, gamma, and aspect ratios.

**Not tested**: real Windows browsers (the author's setup), Firefox and Safari, trackpads and touch screens
with the wheel takeover, real GoPro/HEVC files, and very large videos.


**EXR loading** (added when the code was split into files): the decoder and its test suite were taken over unchanged from Distortion viewer.

| Area | What was checked | Result |
| --- | --- | --- |
| Decoder | `tests/exr/` against reference files from the OpenEXR library: half, float and mixed channels; NONE, RLE, ZIPS, ZIP, PIZ, PXR24; layers; grey; B44 and DWAA | 18 of 18 as expected (supported modes exact, lossy PXR24 within 1.5e-5, B44 and DWAA refused with a message) |
| In the page | `rooms/example-exr/` (960 × 640 half-float ZIP render against a PNG original shifted by 6 px), headless Chromium, 1400 × 900 | box line reads `960×640 · … · render EXR ZIP, half`; canvas 960 × 640; Difference mode shows only the 6 px edge ring, so the linear to sRGB transform matches an sRGB PNG; no script errors |
| Static hosting | page served by a static server that returns 404 for folders (like GitHub Pages), room folder named `04 Odd #name`; with the manifest, then without | with: 4 boxes including the odd name and the EXR room, no errors; without: the notice with the manifest hint. The local `python -m http.server` path was re-run and is unchanged. The Actions workflow itself was not run (no GitHub access here) |
| Tabs and autoplay | 1400 × 900 window, rooms: two image folders, a video folder and a second video folder added for the test; video tab selected on load, counts, autoplay, manual stop, scroll away and back, switching tabs | tabs `video 2 (selected)`, `image 3`; first video playing on load, second not; manual stop held; second room plays when centred, first stopped; first plays again when scrolled back; Images tab shows 3 boxes and no video plays; returning to Videos resumes the first; no script errors |
| Split into files | all three example rooms load; page script error count | three boxes, none skipped; the only console error is the Google Font request, which the sandbox blocks |

**Not tested for EXR:** real Blender files from the user's pipeline, 4K timings in this project, Firefox and Safari.
