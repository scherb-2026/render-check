# Render check

A web page for checking how closely a 3D render matches reality. It reads the output of the CHC render pipeline: for every
camera, the original GoPro image (or video) on the left, the pipeline's render on the right, with a split you drag across the picture. The
page is organised in three rows of tabs at the top: **dataset**, then **glove colour**, then **tool**, and under the tool row a View row with a toggle
between **Images** and **Videos**.

## Quick start

1. Copy the pipeline output into the page's `data/` folder (once per change of the output; both scripts only copy what changed):

       python tools/get_images.py  <root>
       python tools/get_videos.py  <root>

   Or edit the paths at the top of `tools/get_all.py` once and run it with your Python: `python tools/get_all.py` (Windows: `python tools\get_all.py`, or
   double-click it). It runs both imports with the Python you started it with, with a separate root for images and for videos, and skips a kind whose
   root is empty. The window stays open at the end (also after an error) until you press Enter; set `PAUSE_AT_END = False` to turn that off. Each
   script has its own `<root>`, so images and videos can come from different folders (the folder names camera / gloves / Pose_set must match for them to
   share a tab). Python 3.8+ is needed; ffmpeg only for videos, Pillow only when you compress images.
   `COMPRESS_IMAGES` and `COMPRESS_VIDEOS` at the top of `get_all.py` switch the compression on (see "Compressing the images and videos").

   `<root>` is the pipeline's dataset root, the folder that holds `chc1_*`, `chc2_*` (a deeper folder works too). The scripts find the
   Pose_sets the way the pipeline does and skip the folders in its `IGNORE_DIRS` (details below).
2. In this folder run `python -m http.server`, open http://localhost:8000.

Opening `index.html` by double-clicking it won't work, because browsers don't let a page read files from disk. Any local server works
(Python's, VS Code Live Server, `npx serve`).

## Where to find what

This file is a short guide. The details are in the `research/` folder (see the last section).

| You want to know | Look in |
| --- | --- |
| How to use the page and the import scripts | this file |
| Code layout, load order, data conventions, manifest format, how EXR loading works, how the page works inside, what was verified | `research/Render check project handover.md` |
| Why it is built this way, pitfalls, known limitations, ideas, working notes | `research/project.md` |

## Folder layout

    render-check/
      index.html            markup and the script list
      css/                  base · room · notices · topbar
      js/
        core/               config · util
        lib/exr.js          OpenEXR decoder
        media/media.js      builds the picture or video for a file; decodes EXR
        room/gallery.js     what all cells share: mode and split position
        room/transport.js   the one playback bar of the video view (plays, pauses and seeks all videos together)
        room/room.js        one cell of the gallery (comparison or preview)
        app/                render-page · discovery · shortcuts · main
                            (discovery reads data/manifest.json; render-page draws the tab rows and the gallery)
      data/                 filled by the import scripts: manifest.json and the copied files (committed, published)
      tools/
        get_images.py       copies the images of the pipeline output into data/, renames the renders to cameras
        get_videos.py       the same for videos, converting those browsers can't play
        debug_find.py       shows why no Pose_sets are found under a folder
        get_all.py          runs both; edit the paths and the compression switches at its top
        compression_settings.py  the values for resizing, format change and compression (a section for images, one for videos)
        compress.py         does the compression (used by both importers when it is switched on)
        import_common.py    shared by both: SETTINGS (camera renaming), Pose_set search, manifest
        extract-frame.bat
      .github/workflows/pages.yml   publishes the page on GitHub Pages
      research/             archived knowledge (handover, project notes)
      tests/exr/            decoder tests
      THIRD_PARTY_NOTICES.md

## What the import reads

Per Pose_set (`<root>/<camera folder>/<*_gloves folder>/<Pose_set>/`, the folder with `body_3d.npy` and `hands_3d.npy`, or the same as `.npz`, or `body_poses_3d` and `hand_poses_3d`):

| Pipeline folder | Becomes |
| --- | --- |
| camera folder (`chc1_ORX-Hands-A`) | a **dataset** tab |
| gloves folder (`Blue_gloves`) | a **colour** tab (shown as "Blue gloves") |
| Pose_set folder | a **tool** tab |
| `<Pose_set>/images/` (and `videos/`) | the originals, named by camera (`camera02.png` ... `camera13.png`) |
| `<Pose_set>/renders/single_frames/` | the render images: `synthetic_<camera>_0000.<ext>`, one per camera (a `.png` copy next to a non-PNG file is preferred) |
| `<Pose_set>/renders/videos/` | the render videos: `synthetic_<camera>.mp4` (the toolkit only builds them when Auto-render Video is on) |
| `<Pose_set>/renders/images/synthetic_<camera>/` | frame sequences (poses with more than one frame): **not imported** by default, see below |

An original and a render of the same camera form one cell of the gallery ("Camera 02"). A camera with only one of the two is shown as a preview (below).

- **Which folders are searched.** Exactly as the pipeline's launcher does it: a Pose_set is a folder holding a body and a hands file (`body_3d` + `hands_3d`, or `body_poses_3d` + `hand_poses_3d`, each as `.npy` or `.npz`; the names are `POSE_NAME_PAIRS` in `tools/import_common.py`);
  folders named in the launcher's `IGNORE_DIRS` (default `output_3d`) are not entered; `_pipeline` and `renders` folders are not Pose_sets.
  The scripts read `IGNORE_DIRS`, `RENDER_SUBDIR`, `WORK_SUBDIR` and the `.npy` names from `run_dataset_pipeline.py` without running it. They
  look for it **at the dataset root** you give them (`<root>/run_dataset_pipeline.py`, and up to three folders above it, so starting from a deeper folder
  works); failing that next to this project (`pipeline/`, `chc_pipeline/pipeline/`). `--run-script PATH` or `RUN_SCRIPT` (in `get_all.py` or
  `tools/import_common.py`) overrides the search. Without a launcher the defaults are used, and the script says so. Every run prints the launcher it used.
  (`blender_stage.py` next to it is not needed.)
- **Which render folders are read** is the setting `RENDER_DIRS` in `tools/import_common.py`, following the pipeline's official output locations
  (`research/Pipeline output locations.md`): `{"images": ["single_frames"], "videos": ["videos"]}` (`""` = the whole `renders/` folder). Stray media
  elsewhere in `renders/` is not imported. A Pose_set with neither `single_frames/` nor `images/` still gets its originals, with a warning.
- **PNG copies.** The toolkit writes a `.png` copy next to a still when the scene format is not PNG (`synthetic_camera02_0000.exr` + `.png`). With
  `PREFER_PNG_COPY = True` (default) only the `.png` is imported (smaller, no EXR decoding); set it to `False` to import both as numbered tabs.
- **Frame sequences** (`renders/images/synthetic_<camera>/synthetic_<camera>_<NNNN>.<ext>`, poses with more than one frame) are not imported: that is
  hundreds of files per camera, which suits neither numbered tabs nor GitHub's size limits. The script says how many sequence folders it skipped. To
  import them anyway add `"images"` to `RENDER_DIRS["images"]`; each frame then becomes a numbered tab of the camera's cell.
- **Skipped in `renders/`:** `extrinsics/`, `intrinsics/`, and timestamped folders of old non-direct renders (the script says how many;
  `cleanup_timed_renders.py` of the pipeline removes them).
- **Render camera.** A render belongs to the camera named in its file name or folder (`camera02` in `synthetic_camera02_0001.png`;
  pattern `RENDER_CAMERA_RE`). Several files of one camera become numbered tabs 1, 2, 3 in its cell. A render named after its GoPro (`synthetic_GoPro_CHC1_05_.png`, pattern `RENDER_GOPRO_RE`) is renamed by the rotation described below (05 -> camera02).
- **What is copied where.** `data/<dataset>/<colour>/<tool>/<images|videos>/original/camera02.jpg` and `.../render/<path below renders/>`.
  A file that is already there with the same size and time is not copied again. After copying, the script **sweeps**: everything in the
  `images/` folders of `data/` (for `get_images.py`; `videos/` for `get_videos.py`) that the new manifest does not list is deleted, including
  files of Pose_sets that are gone and stray files from an interrupted run, even without a manifest. So after an unfiltered run `data/` mirrors
  `<root>` for that kind, and nothing needs clearing by hand; don't put your own files in those folders. The other kind is never touched by the
  other script, `--filter` only sweeps the Pose_sets it processed, and `--dry-run` deletes nothing. Your pipeline folders are only read.
- **Options (both scripts):** `--dry-run` lists without writing, `--filter TEXT` only Pose_sets whose path contains TEXT (the rest of `data/`
  stays as it is), `--data DIR` writes somewhere else, `--run-script PATH`.

### Renaming the GoPro renders

An original is named either by camera (`camera02.png` ... `camera13.png`, also `camera13_synced.mp4`; pattern `ORIGINAL_CAMERA_RE`), used as it is with any camera number, or after its GoPro (`gopro5.mp4`, `gopro05.mp4`, `gopro5_synced_cut.mp4`, `GoPro_CHC1_05.mp4`; pattern `ORIGINAL_GOPRO_RE`), which goes through the same rotation as the renders (gopro5 -> camera02). Anything before or after the number is ignored. Renders named after their GoPro (`synthetic_GoPro_CHC1_05_.png`, numbers 1 to 12) are renamed the same way; names that already say `camera<number>` are never changed. The rotation is set in one place,
the SETTINGS block at the top of `tools/import_common.py`:

    SOURCE_RANGE = (1, 12)      # GoPro numbers found in the render file names (gopro1 ... gopro12)
    TARGET_RANGE = (2, 13)      # camera numbers they become (camera02 ... camera13)
    ROTATION_OFFSET = 4         # circular shift: gopro5 -> camera02; the earlier ones wrap round (gopro1 -> camera10)

With these values: gopro1→camera10, gopro2→camera11, gopro3→camera12, gopro4→camera13, gopro5→camera02, gopro6→camera03 … gopro12→camera09. Every run prints
the table it uses, so check it against a pair you know. Use `ROTATION_OFFSET = 0` for no shift (gopro1→camera02). The ranges must cover
the same number of cameras. The GoPro number is read after the word `GoPro` in the render's name (`GoPro5`, `GoPro_05`, `GoPro_CHC1_05_`; pattern `RENDER_GOPRO_RE`); a GoPro number outside the range is listed and the render shows under its file name. `TARGET_NAME`
sets the name format.

### Images: `tools/get_images.py`

    python tools/get_images.py <root>              copy the images and rewrite data/manifest.json
    python tools/get_images.py <root> --dry-run

### Videos: `tools/get_videos.py`

    python tools/get_videos.py <root>
    python tools/get_videos.py <root> --dry-run --filter blue
    python tools/get_videos.py <root> --preset fast      quicker, bigger files (--crf 20: smaller files)

Same search, renaming and layout as for images, for the video files. Browsers play H.264 (8-bit, 4:2:0) in MP4 and VP8/VP9/AV1 in WebM; GoPro
files are often H.265/HEVC, 10-bit or 4:4:4, and renders can be ProRes. A video that plays is copied as it is. Any other is converted to an H.264
MP4 in `data/` (audio dropped: the page is muted; CRF 16, preset `slow`: visually lossless, best compression, slow), checked (H.264, 8-bit,
same length within 2 %) and only then put in place. A Pose_set without videos is just reported ("no videos found"); ffmpeg is only needed once a video is found. Your files in `<root>` are never changed or moved. A converted video newer than its source
is not converted again; an interrupted run just continues next time. It needs ffmpeg and ffprobe on the PATH (Windows:
`winget install Gyan.FFmpeg`); `--no-convert` copies the videos unchecked without them. Run it from PowerShell or any terminal:
`python tools\get_videos.py D:\path\to\root`.

## Keeping the data small

**Only cameras with a render.** `ONLY_WITH_RENDERS = True` at the top of `tools/get_images.py` (and, separately, of `tools/get_videos.py`) leaves out the
originals of cameras that have no render: they are not copied (and videos are not converted), and files imported earlier are removed from `data/` by
the next run. Set it to `False` to import every original too. On the command line `--only-rendered` / `--include-unrendered` overrides it for one run;
`tools/get_all.py` has `IMAGE_ARGS` and `VIDEO_ARGS` for that. Cameras that have only a render are still imported (as previews).

**Compression of the images.** Without compression the importer copies files as they are, so the size of `data/` is the size of your originals and renders. The next section shows how to switch the compression on. The suggestions
(sizes are typical values for a 1600 px wide picture, not measurements of your files; check a few of yours first):

| Scheme | Typical size per picture | Notes |
| --- | --- | --- |
| Full-size GoPro JPEG / render PNG as they are | 3–10 MB | far too big: 1,500 pictures are several GB |
| Resize to 1600 px wide, JPEG quality 88–90 (mozjpeg, 4:2:0, progressive) | 250–400 KB | works everywhere, simple |
| Resize to 1600 px wide, **WebP quality 85** | 150–280 KB | about 30 % smaller than JPEG; every current browser; **recommended** |
| Resize to 1600 px wide, AVIF quality 60–70 | 100–180 KB | smallest, but slow to encode and it smooths fine detail |
| Renders (flat colours, sharp edges): lossless WebP or near-lossless | 0.5–1.5 MB | only if every pixel of the render matters; otherwise the lossy WebP above |

How to choose: (1) **Resize first.** With 12 pictures per screen a cell is only 230–420 px wide, and even 2 columns need about 900 px, so 1280–1600 px on the
long side is enough; halving the width quarters the size. (2) **Treat original and render the same** (same size, same format and quality), otherwise the
Difference mode shows codec noise instead of the render's errors, and the Difference mode is the most sensitive to it. Use quality 90 or higher if you rely on Difference. (3) Keep the
full-size files in the pipeline output; `data/` is only the viewing copy. (4) Rough budget: 90 Pose_sets × (8 originals + 8 renders) = 1,440 pictures,
so the 1 GB limit leaves about 700 KB per picture, and less once videos are added; at about 250 KB (WebP, 1600 px) that is roughly 350 MB.
(5) Also: import in steps with `--filter` and look at the size line each script prints; keep `data/` out of the main branch history if you re-import often
(every changed picture stays in git history), for example by publishing it from a separate branch that is force-pushed; Pages serves files, not Git LFS.

## Compressing the images and videos

Two switches in `tools/get_all.py` (one for images, one for videos) turn the compression on; both are `False` as shipped:

    COMPRESS_IMAGES = True      # needs Pillow:  python -m pip install pillow
    COMPRESS_VIDEOS = True      # needs ffmpeg and ffprobe on the PATH
    COMPRESSION_FILE = ""       # "" = tools/compression_settings.py

One script alone: `python tools/get_images.py <root> --compress` (the same for `get_videos.py`; `--compression-file PATH` picks another settings file).

The values are in **`tools/compression_settings.py`**, a section `IMAGES` and a section `VIDEOS`, each with the same three parts and a comment on every line:

| Part | Images | Videos |
| --- | --- | --- |
| **resize** | `max_width`, `max_height` (0 = no limit), `never_enlarge`, `resample` | `max_width`, `max_height`, `max_fps` |
| **format** | `convert_to`: `keep` / `jpg` / `png` / `webp` / `avif`; `flatten_alpha_on` | `convert_to`: `keep` / `mp4` (H.264) / `webm` (VP9) |
| **compression** | `quality` (1-100), `jpg_subsampling`, `jpg_progressive`, `webp_lossless`, `webp_method`, `avif_speed`, `png_level` | `mp4_crf`, `mp4_preset`, `webm_crf`, `webm_speed`, `audio` (`drop` / `keep`) |

`apply_to` (`both`, `originals` or `renders`) says which files are processed; the shipped default is `both`, which is what you want for the Difference mode.
Shipped values: images 1600 px wide, WebP quality 85; videos 1280 px wide, H.264 crf 24, preset slow, audio dropped.

How it behaves: your source files are never touched; the compressed copies go to `data/` with the new extension (`camera02.webp`). A picture or video is only
encoded again when the source or one of its settings has changed (the record is `data/.compression-state.json`), so after changing one number only the files it
affects are redone, and a run with nothing new is instant. A wrong or misspelled setting stops the run with the list of problems before anything is written. Each run
ends with a line such as `Compression: 144 picture(s), 410 MB -> 38 MB (9% of the original size)`. EXR files are copied as they are (the page decodes them itself); a
picture Pillow can't read is copied unchanged with a warning; 16-bit pictures become 8-bit; EXIF rotation is applied and metadata is dropped. With compression on, every
video is encoded (also those a browser could play), which takes minutes per video at preset `slow`; use `mp4_preset: "fast"` for a first look. Switching compression off
again gives the plain copy back on the next run (the compressed files are replaced).

## Hosting on GitHub Pages

`data/` (the copied files and `manifest.json`) is part of the repository, and `.github/workflows/pages.yml` publishes `index.html`, `css`,
`js` and `data` on every push to `main`. The workflow stops with a message when `data/manifest.json` is missing.

1. Run the import scripts and look at the result locally.
2. Push the project to a GitHub repository whose default branch is `main`; in Settings → Pages set the source to **GitHub Actions**.
3. After a new import: commit `data/` and push.

Things to know: a free Pages site is **public**, so anyone with the link can see the images and videos; GitHub refuses files over 100 MB and a
Pages site should stay under about 1 GB (the scripts warn, and the converted videos are far smaller than GoPro originals); Git LFS files are not served
by Pages. A step-by-step guide is in `GITHUB_PAGES.md`.

## The page layout

The bar at the top uses the whole window width. Its rows are separated by a line, the buttons have no borders of their own, fill their row, centre their
text and are separated from their neighbours by a short vertical line. The left end of each row shows its name and a number, in two aligned columns (the numbers are right-aligned in a column of their own): the number of datasets, of colours in the open dataset, of tools in the open
colour, and of cameras in the open view (hover it for the words). The background is plain white. There is no title, header or help text, and no file or folder picker.

- **Dataset**, **Colour**, **Tool**: three rows, each button with the number of cameras under it. The bar stays at the top of the window
  while you scroll (not on short or narrow windows). Choosing a dataset opens the colour and tool you used last in it; the arrow keys move along a row.
- **Tool row**: each tool button shows its name and, behind an image icon and a video icon, how many cameras have an image and how many have a video (0 is dimmed). A button is at least 190 px wide (`TOOL_MIN_W` in `js/app/render-page.js`: room for 8 letters of the name and both counts; longer names are cut with …). When the tools don't fit on one line at that width, the row splits into two or more lines with the same number of buttons (at most one apart); the buttons of each line share its width.
- **Videos / Images** and **Slider / Fade / Difference**: in the **View** row under the tool row; both groups and their buttons stretch to fill the row, with a clear gap and a full-height line between the groups. The first splits the tool's cameras into images and videos
  (a tool opens on Videos when it has any, else on Images; it remembers the choice you make; a kind with nothing in it is greyed out). The second sets
  the comparison mode of the whole gallery.
- **Gallery**: every camera of the open tool is a cell of one grid, with its camera name inside the picture at the top left. The cells have square corners, no border and no margin to their parent, and are 1 px apart. They are as large as they can be while up to 12
  cameras are on screen at once (the columns are chosen where the cells come out largest), and the grid is centred horizontally and vertically in the part of the
  window between the tab rows and (in the video view) the playback bar. More than 12 scroll; on a narrow window the cells keep a minimum width and the gallery scrolls. The pictures show no file names or paths.
- **Loading.** A tool's gallery is built the first time you open it, then kept, so settings survive switching. Videos are held
  in memory, so a long session across many video-heavy tools uses more memory (reload to release it). Switching pauses the videos you leave.

**Autoplay.** In the video view all videos start together, from the beginning, as soon as every one of them has loaded. If you stop them yourself (the play button,
**K**, frame step, scrubbing) they stay stopped until you press play or open another tool. Switching the tool or going to Images stops them; coming back
starts them again. Videos are muted, which is what lets browsers autoplay them.

## Previews: cameras without a comparison

A camera is never dropped because it lacks an original or a render. The page shows what is there, in a **preview** cell: only renders (several
files get numbered tabs), or only the original. A preview cell has EXR decoding, and for videos it plays with the others under
the playback bar. The slider and the mode do not change it. Once the
missing file is imported, the next import turns it into a normal comparison.

## Using the gallery

**Slider** (the default): the original on the left, the render on the right, in every cell at once. Drag across any picture to place the split exactly
under your pointer; all cells follow. (There is no separate slider, brightness control, sweep or grid overlay.)

**Fade**: the original laid over the render. Dragging a picture sets the original's opacity (left = render only, right = original only); Slider and Fade share one position.

**Difference**: matching areas go black and mismatches glow. Good for spotting camera or geometry drift.

**Several renders per camera**: small numbered tabs (1, 2, 3…) at the top right inside the picture, in file-name order.

**Warnings**: a cell tells you if the original and a render have different aspect ratios (the render would be
stretched, so match the resolution), or if two videos have different lengths.

## Keyboard (the keys act on the cell under the pointer)

| Key | Action |
|---|---|
| Space | Show the render alone while toggled; press again to return |
| 1 to 9 | Switch to render 1 to 9 |
| K | Play or pause all videos (works anywhere on the page in the video view) |
| , and . | Step all videos one frame back or forward |
| ← → | Nudge the split of the whole gallery; hold Shift for bigger steps |

## Videos in the page

In the video view there is **one playback bar at the bottom of the window** for the whole gallery: every video (each camera's original and its active render) plays in
sync, and the bar's play/pause, frame steps, the large seek bar and the time apply to all of them. The speed menu (¼× to 2×, shown as e.g. 1×) and **Loop** (the arrows icon) sit in the same row,
to the right of the seek bar. There is no frame-rate setting: each video plays at its own frame rate, which the display caps at the screen's refresh rate, so
playback runs at the smaller of the two. For frame steps the page measures the video's frame length from the first frames shown (30 fps until then). The shortest
video decides where playback ends and loops; a camera whose lengths differ gets a warning in its cell. Switching a camera's render tab keeps the time and
the play state. Videos are muted. You can also compare a still against a video, or the reverse. Each video is loaded fully into memory before
it plays, because Python's simple server can't serve parts of a file and seeking would otherwise jump back to the start. Very large files take a moment. Twelve
cameras with two videos each is 24 videos decoding at once, so use the compression settings to keep the files small on a slow computer.

If a video still says it can't be played, it was not converted (use `tools/get_videos.py`) or the file is damaged. The cell shows the exact ffmpeg command
for that file, with a Copy button.

## Extracting a frame from a video

`tools/extract-frame.bat` saves a single video frame as PNG next to the video, named after it:

    tools\extract-frame.bat path\to\gopro5_clip.mp4 130
    tools\extract-frame.bat path\to\gopro5_clip.mp4 10 130 250

This writes `gopro5_clip_frame130.png` (numbers padded to 3 digits). Frame numbers count from 0, so frame 130
in Blender's 1-based numbering is `129` here. Requires ffmpeg on your PATH. If ffmpeg reports an error about
`-fps_mode`, your ffmpeg is older than 5.1; replace it in the script with `-vsync 0`.

## Troubleshooting

- **"Couldn't read data/manifest.json"**: the page was opened without a server, the server was started in a different folder, or `data/` has not been filled.
  Run the import scripts, then start the server inside this folder.
- **"No Pose_sets found"** (import script): run `python tools/debug_find.py <root>` (no argument = `VIDEO_ROOT` of `get_all.py`): it lists what is in the folder, the files that look like pose data and, for each folder, why it does or doesn't count. Otherwise: `<root>` must contain folders that hold a body and a hands file (`body_3d` + `hands_3d` or `body_poses_3d` + `hand_poses_3d`, `.npy` or `.npz`). Check that the folder is not one of the
  launcher's `IGNORE_DIRS`, and that the run script found was the right one (the script prints the path and the ignored folders).
- **An original is skipped ("no camera<number> or gopro<number> ... in the name")**: its name needs `camera<number>` or `gopro<number>` (the latter within `SOURCE_RANGE`, 1 to 12); see the renaming section.
- **A render shows as its own file name instead of "Camera NN"**: its name or folder has neither `camera<number>` nor `GoPro…<number>` (1-12); adjust `RENDER_CAMERA_RE` / `RENDER_GOPRO_RE`.
- **Cells pair the wrong images**: compare the printed renaming table with a pair you know, and change `ROTATION_OFFSET`.
- **A tool or colour is missing**: it has no images in `renders/single_frames/` or `images/` and no videos in `renders/videos/` (timestamped folders and `extrinsics/` do not count); run with `--dry-run`.
- **Hosting online**: see "Hosting on GitHub Pages" above; `GITHUB_PAGES.md` has the details.
- **An EXR says "Couldn’t read this render"**: the message names the reason. Most often the file uses B44 or DWAA compression or is tiled; re-save it with ZIP.

## Research folder

Additional knowledge about this project is archived in `research/`: the project handover (how it works, code layout, data conventions,
what was verified) and `project.md` (reasoning, pitfalls, known limitations, ideas, working notes). It is meant to **persist through
the versions of the page**: carry the folder over into every new version and keep adding to it, and do not remove or shorten anything
in it unless that is explicitly asked for. Read both files before changing the page, and keep this README to short summaries that point there.

## Tests

The EXR decoder has its own tests: `pip install OpenEXR numpy`, then `python3 tests/exr/gen.py` and `node tests/exr/test.js`.
