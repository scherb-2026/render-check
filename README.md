# Render check

A local web page for checking how closely a 3D reconstruction matches reality. Each room folder becomes one comparison
box: the original photo or footage on the left, your render on the right, with a slider to sweep between them. Images and
videos both work. Rooms can be grouped into datasets, one tab each on the left.

## Quick start

1. Put each view in its own folder inside `rooms/`, or inside a dataset folder in `rooms/` (layout below).
2. Open a terminal in the `render-check` folder and run:

       python -m http.server

3. Open http://localhost:8000. After adding or changing files, just refresh the page.

**With videos, use this instead of steps 2 and 3:** `python tools/prepare-videos.py` first converts any video a browser can't play
(GoPro H.265, 10-bit, ProRes ...), then starts the page on http://localhost:8080. See "Fixing videos automatically" below.

Opening `index.html` by double-clicking it won't work, because browsers don't let a page read folders from
disk. Any local server that shows folder listings works: Python's (above), VS Code Live Server, `npx serve`,
`npx http-server`, or nginx/Apache with directory listings on. If you can't run a server, the
**Open folder…** button at the top lets you pick the `rooms` folder by hand.

## Where to find what

This file is a short guide. The details are in the `research/` folder (see the last section).

| You want to know | Look in |
| --- | --- |
| How to use the page | this file |
| Code layout, load order, data conventions (including datasets), how EXR loading works, how the page works inside, what was verified | `research/Render check project handover.md` |
| Why it is built this way, pitfalls, known limitations, ideas, working notes | `research/project.md` |

## Folder layout

    render-check/
      index.html            markup and the script list
      css/                  base · room · notices · sidebar
      js/
        core/               config · util · naming
        lib/exr.js          OpenEXR decoder
        media/media.js      builds the picture or video for a file; decodes EXR
        room/room.js        one comparison box
        app/                render-page · discovery · scroll-assist · shortcuts · main
                            (discovery groups rooms into datasets; render-page draws the dataset bar and next button)
      rooms/
        01_apartment-a/          a dataset: a folder of rooms
          01_living-room/
            original.jpg
            render.png
          02_kitchen/
            kitchen.jpg
            kitchen.001.exr
            kitchen.002.exr
          03_walkthrough/
            gopro_footage.mp4
            walkthrough_synthetic.mp4
        02_house-b/              another dataset
          ...
        old-test/                a room that is not in a dataset: shown under "Misc"
          original.jpg
          render.png
      tools/
        extract-frame.bat
        prepare-videos.py   converts videos browsers can't play, then starts the page
        build-manifest.mjs  writes rooms/manifest.json for static hosting
      .github/workflows/pages.yml   publishes the page on GitHub Pages
      video-originals/      appears after prepare-videos.py: the originals it replaced (not pushed)
      research/             archived knowledge (handover, project notes)
      tests/exr/            decoder tests
      THIRD_PARTY_NOTICES.md

Put the files directly inside each room folder (not in a further subfolder). A room with an original and at least one render is a
comparison. A room that has only one kind of file is not skipped but shown as a **preview** (see "Previews" below), so you can look at
data before there is anything to compare it with.

**How renders are recognized.** A file is a render if its name contains `render` or `synthetic` (any
capitalization, anywhere in the name), or if it ends in a Blender-style number such as `kitchen.001.png`.
Every other file is the original, so the original needs no special name. The line next to each box's title
shows which file was used as the original, so you can confirm it at a glance. A file whose name contains `original`, `orig`, `photo`,
`ref`, `real` or `footage` is preferred as the original when there are several candidates.

**Order and titles.** Boxes are sorted by folder name, and so are datasets. Start folder names with `01_`, `02_` and so on to
control the order; the number is hidden in the title (`02_kitchen` shows as "Kitchen", `01_apartment-a` as "Apartment a").

**Supported formats.** Images: JPG, PNG, WebP, GIF, AVIF, BMP and EXR. Videos: MP4 (H.264, 8-bit 4:2:0) and WebM.
TIFF and ProRes/HEVC can't be shown by browsers; export as PNG, JPG or EXR, and see "Videos" below.

**EXR (Blender renders).** The page decodes EXR itself and shows it with the plain linear → sRGB transform (no tone mapping), one
file at a time; a 4K file takes 1 to 2 seconds and the box line reads "decoding EXR…" meanwhile. Once decoded, an EXR behaves like
any image (slider, fade, difference, gamma, sweep). The box line names the codec and layer that was read. Blender's multilayer EXR is
supported (it shows the `Combined` pass). B44, DWAA/DWAB, tiled and deep files are not read: save with **ZIP** (Blender: Codec → ZIP).
A PNG saved with Filmic or AgX will not look like the EXR of the same render; use *Standard* for both.

## Hosting on GitHub Pages

Static hosts don't list folders, so the page can't find the rooms by itself there. `tools/build-manifest.mjs` writes
`rooms/manifest.json` (every folder in `rooms/`, the room folders inside any dataset folder, and the files in each), and the page
reads that when the server gives no listing. Locally
nothing changes: the server's listing is tried first, so new files show up on refresh without rebuilding anything.

1. Push the project to a GitHub repository whose default branch is `main`.
2. In the repository, open Settings → Pages and set the source to **GitHub Actions**.
3. Every push to `main` now runs `.github/workflows/pages.yml`, which copies `index.html`, `css`, `js` and `rooms` into a clean
   folder, writes the manifest there and deploys it. Your repository never needs to contain `manifest.json`.

To try it by hand, or for any other static host (Netlify, S3, an nginx without autoindex): run `node tools/build-manifest.mjs`
(Node 18 or newer, no packages) after changing `rooms/` and upload the folder with `rooms/manifest.json` included. The script
warns about files over 100 MB (GitHub refuses them) and a `rooms/` folder over about 1 GB.

Things to know before sharing: a Pages site on a free account is **public**, so anyone with the link can see the footage and
renders; Git LFS files are not served by Pages; EXR and video files are large, so compress them first.

A step-by-step guide, including troubleshooting, is in `GITHUB_PAGES.md`.

## Datasets

A bar on the far left has one tab per dataset, each with the number of rooms in it. To add a dataset, create a folder in
`rooms/` and put the usual room folders inside it (`rooms/apartment-a/living-room/original.jpg`, and so on). The Videos and Images
split (next section) then applies inside each dataset.

- **How a folder in `rooms/` is read.** If it has images or videos directly inside it, it is a room. If it holds folders instead,
  it is a dataset. If it has both, it is a room only when its own files make a full comparison (an original and a render); a lone
  stray file or only-renders next to the room folders of a dataset is ignored and the folder stays a dataset.
- **Misc.** Rooms that sit directly in `rooms/`, with no dataset folder around them, are collected in a dataset called **Misc**, always
  the last tab. A dataset folder that you name `misc` is merged into it.
- **Next dataset.** Scroll to the bottom of a dataset and a button leads to the next one in the bar; the last dataset has none. The scroll
  pull (Snap scroll) treats the button like a box, so you can reach it.
- **Only one level.** Datasets can't be nested: `rooms/<dataset>/<room>/files`. A room folder inside a room folder is listed under
  "folders were skipped".
- **Loading.** A dataset's boxes are built the first time you open it, then kept, so slider positions and settings survive switching
  datasets. Videos are held in memory, so a long session across many video-heavy datasets uses more memory (reload to release it).
- Switching datasets pauses the videos of the one you leave. Each dataset remembers whether you were on Videos or Images.

## Videos and Images tabs

Inside a dataset, a narrow bar beside the dataset bar switches between two tabs: **Videos** (selected when the page opens) and **Images**, each with the number of
comparisons in it. The folders in `rooms/` are sorted by what they contain: a folder of videos is under Videos, a folder of images
under Images, so just keep video rooms and image rooms in separate folders. (A folder counts as a video if its original or any render
is a video, so a still compared with a video is under Videos.) If a dataset has no videos at all, it opens on Images. A tab is
built the first time you open it, so the other tab's files aren't loaded until then.

**Autoplay.** A video starts by itself when its picture is in the middle of the window (the thin band across the centre) and stops
when it leaves that band. If you stop it yourself (the play button, **K**, frame step, scrubbing) it stays stopped for as long as it is
in the middle; scroll away and back and it plays again. A video you start by hand keeps playing until it is out of view. Videos are
muted, which is what lets browsers autoplay them. Switching tabs pauses the videos of the tab you leave.

## Previews: rooms without a comparison

A room is never skipped just because it lacks an original or a render. The page shows what is there, in a **preview** box:

- one file (an image or a video, named anything): shown on its own;
- only renders (every file looks like a render, e.g. `render.001.png`, `render.002.png`): shown with numbered tabs (**File** 1, 2, 3…);
- only originals (every file is named like an original, e.g. `original_a.jpg`, `original_b.jpg`): shown the same way.

A preview box has gamma, the grid, EXR decoding, and for videos the play, frame-step and scrub controls and autoplay. It has no
slider, no Slider/Fade/Difference buttons and no sweep, and its line under the title says what it holds ("render only, nothing to compare
yet"). Add the missing original or render to the same folder later and the next refresh turns it into a normal comparison. Several files
with different shapes are fine: the box follows the shape of the file you select. A folder with no image or video at all is still listed
under "folders were skipped".

Note that a folder with several files none of which is named like an original or a render (for example `a.jpg` and `b.jpg`) is still read
as one original plus renders, with a warning, as before.

## Using a comparison box

**Modes** (top right of each box):

- **Slider**: the original on the left, the render on the right. Drag across the image to place the split
  exactly under your pointer, or use the slider bar underneath, which works like a video player's scrubber.
- **Fade**: the original laid over the render. The same bottom slider sets the original's opacity
  (left = render only, right = original only). Slider and Fade share one position.
- **Difference**: matching areas go black and mismatches glow. Good for spotting camera or geometry drift.

**Gamma** (vertical slider to the right of each image): drag up to lift dark tones without clipping
highlights. In Difference mode it makes faint differences visible. Bottom is 1.00 (off); double-click to
reset. On very large videos, high gamma can make playback stutter.

**Sweep** (round ▶ button left of the slider bar): moves the slider slowly from edge to edge and back,
7 seconds each way (cross-fades in Fade mode). With several renders, it moves to the next render after each
full back-and-forth, switching while the original covers the frame so the change is invisible. Stop it with
the button, the **S** key, or by grabbing the slider.

**Several renders per room**: numbered tabs (1, 2, 3…) appear above the image, in file-name order, with the
current file name beside them.

**Grid** (top of page): a 10 × 10 guide over every image, for checking lines and vanishing points.

**Warnings**: a box tells you if the original and a render have different aspect ratios (the render would be
stretched, so match the resolution), or if two videos have different lengths.

## Keyboard (while the pointer is over a box)

| Key | Action |
|---|---|
| Space | Show the render alone while toggled; press again to return |
| S | Start or stop the sweep |
| 1 to 9 | Switch to render 1 to 9 |
| K | Play or pause videos |
| , and . | Step one video frame back or forward |
| ← → (slider handle focused) | Nudge the slider; hold Shift for bigger steps, Home/End for the edges |

## Videos

Put an original and one or more rendered videos in a folder. They play in sync under one set of controls:
play/pause, frame step (pick the frame rate so one step is exactly one frame), scrubbing, speed (¼× to 2×)
and loop. Videos are muted. You can also compare a still photo against a rendered video, or the reverse.

Each video is loaded fully into memory before it plays, because Python's simple server can't serve parts of
a file and seeking would otherwise jump back to the start. Very large files take a moment to appear.

### Fixing videos automatically: `tools/prepare-videos.py`

Run this on your own computer after adding videos and before testing or pushing:

    python tools/prepare-videos.py            (Windows: python tools\prepare-videos.py)

It looks at every video in `rooms/`, converts the ones a browser can't play (H.265/HEVC, 10-bit, 4:4:4/4:2:2, ProRes ...) to an
H.264 MP4, and **then starts the page** with `python -m http.server 8080` (open http://localhost:8080), so you can look at the result
straight away. Stop it with Ctrl+C.

- Videos that already play are left alone, so running it again only does new work. A `.mov` becomes `.mp4` (same name otherwise); the
  page doesn't care about the extension.
- Each converted file is checked (H.264, 8-bit, same length) before it replaces anything. Your original is **moved**, not deleted, to
  `video-originals/` in the project folder, in the same folder layout as `rooms/`. That folder is in `.gitignore`, so it is never pushed.
  Delete it when you no longer need the originals.
- Audio is dropped (the page plays muted). It encodes with CRF 16 and the `slow` preset, the same settings as the ffmpeg command
  the page shows: visually lossless, with the best compression x264 offers, so it takes longer per video than a quick convert. For a
  fast check use `--preset fast`; for smaller files at some cost in quality use `--crf 20`.
- If `name.mp4` already exists next to a `name.mov` that needs converting, that video is skipped with a message; rename one of them.
- Options: `--dry-run` lists what would be converted and changes nothing; `--no-serve` converts and stops; `--port 9000` serves on another
  port. It needs ffmpeg and ffprobe on the PATH (Windows: `winget install Gyan.FFmpeg`); without them it says so and just starts the page.
- It only binds to this computer (`127.0.0.1`). To let others see the page, run `python -m http.server` yourself.
- It is a Python script on purpose, not a `.bat`: it works from a network folder (`\\server\share\...`), which `cmd.exe` and so every
  `.bat` file refuses as a working directory. Run it from PowerShell or any terminal with `python tools\prepare-videos.py`.
- The page itself is unchanged: this is a step you run, not something the server does. For GitHub Pages, run it before you commit, so the
  converted files are what gets pushed (they are also much smaller than the originals, which helps with the 100 MB limit).

**If a video still says it can't be played**, the script wasn't run on it, or the file is damaged. The box shows the exact ffmpeg
command for that one file, with a Copy button:

    ffmpeg -i "input.mp4" -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -an -movflags +faststart "input_web.mp4"

Then move the old file out of the folder and refresh.

## Snap scroll

Scrolling has a soft pull toward each box, so stepped mouse wheels land neatly on a comparison. Each box has
a resting point where it sits centered in the window (or top-aligned if it's taller than the window).
Between two boxes, the nearest third on each side pulls toward that box and the middle third has no pull;
above the first box and below the last, the whole strip to the page edge pulls. The pull is a soft spring
that fades smoothly to nothing at the edge of its zone, and wheel notches become a smooth glide.

Turn it off with **Snap scroll** at the top of the page (your browser remembers the choice). It's also off
when your system is set to reduce motion. To tune it, change these constants at the top of
`js/app/scroll-assist.js`:

| Constant | Default | Effect |
|---|---|---|
| `GRAVITY` | 64 | Pull strength. Lower is softer. |
| `FRICTION` | 8 | How fast motion dies out. 16 removes the slight overshoot at `GRAVITY` 64. |
| `WHEEL_KICK` | 8 | How far one wheel notch travels. |
| `SNAP_ZONE` | 1/3 | Share of each gap that pulls. |

The sweep tempo is `SWEEP_SECONDS` in `js/room/room.js` (14 = 7 s each way).

## Extracting a frame from a video

`tools/extract-frame.bat` saves a single video frame as PNG next to the video, named after it:

    tools\extract-frame.bat path\to\gopro5_clip.mp4 130
    tools\extract-frame.bat path\to\gopro5_clip.mp4 10 130 250

This writes `gopro5_clip_frame130.png` (numbers padded to 3 digits). Frame numbers count from 0, so frame 130
in Blender's 1-based numbering is `129` here. Requires ffmpeg on your PATH. If ffmpeg reports an error about
`-fps_mode`, your ffmpeg is older than 5.1; replace it in the script with `-vsync 0`.

## Troubleshooting

- **"Couldn't read the rooms folder"**: the page was opened without a server, or the server was started in
  a different folder. Start it inside `render-check`.
- **"No comparisons found" or "folders were skipped"**: the page lists every skipped folder with the reason
  (no image or video inside, unsupported formats such as TIFF, files nested one level too deep). Rooms inside datasets are listed as
  `dataset/room/`.
- **A dataset doesn't show up as a tab**: none of the room folders inside it had an image or video (see the skipped list), or
  the folder is itself a room because it has a full comparison (original and render) directly inside it.
- **The wrong file is used as the original**: check the file names against "How renders are recognized"
  above; the box title line shows the file that was picked.
- **Hosting online**: static hosts such as GitHub Pages don't list folders. See "Hosting on GitHub Pages" above: the page then
  needs `rooms/manifest.json`.
- **An EXR says "Couldn’t read this render"**: the message names the reason. Most often the file uses B44 or DWAA compression or is
  tiled; re-save it with ZIP.

## Research folder

Additional knowledge about this project is archived in `research/`: the project handover (how it works, code layout, data conventions,
what was verified) and `project.md` (reasoning, pitfalls, known limitations, ideas, working notes). It is meant to **persist through
the versions of the page**: carry the folder over into every new version and keep adding to it, and do not remove or shorten anything
in it unless that is explicitly asked for. Read both files before changing the page, and keep this README to short summaries that point there.

## Tests

The EXR decoder has its own tests: `pip install OpenEXR numpy`, then `python3 tests/exr/gen.py` and `node tests/exr/test.js`.
