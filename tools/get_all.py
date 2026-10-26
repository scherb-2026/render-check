#!/usr/bin/env python3
"""Runs the whole import: images, then videos, with the Python you start this with.

Edit the paths below, then run it with your Python:    python tools/get_all.py
(Windows: python tools\\get_all.py, or double-click it; the window stays open at the end.)
"""
import subprocess
import sys
import traceback
from pathlib import Path

# ---- edit these ------------------------------------------------------------------------------------------------
IMAGE_ROOT = r"C:\Users\scherb\LocalDesktop\CHC_render\CHC_image_datasets"   # pipeline dataset root for the images (holds chc1_*, chc2_*); "" = skip images
VIDEO_ROOT = r"C:\Users\scherb\LocalDesktop\CHC_render\CHC_video_datasets"   # pipeline dataset root for the videos; "" = skip videos
RUN_SCRIPT = ""                                 # full path of run_dataset_pipeline.py; "" = found at the dataset root (else near this project)
FILTER = ""                                     # only Pose_sets whose path contains this text; "" = all
DRY_RUN = False                                 # True = only list what would be copied
COMPRESS_IMAGES = True 				# True = resize / convert / compress the images as set in tools/compression_settings.py (needs Pillow: python -m pip install pillow)
COMPRESS_VIDEOS = True				# True = the same for the videos (needs ffmpeg); every video is re-encoded once, which takes a while
COMPRESSION_FILE = ""                           # settings file for the two switches above; "" = tools/compression_settings.py
IMAGE_ARGS = []                                 # extra get_images.py options, e.g. ["--include-unrendered"] (default: ONLY_WITH_RENDERS at the top of get_images.py)
VIDEO_ARGS = []                                 # extra get_videos.py options, e.g. ["--preset", "fast"] or ["--no-convert"]
PAUSE_AT_END = True                             # wait for Enter before the window closes, also after an error
# ----------------------------------------------------------------------------------------------------------------

TOOLS = Path(__file__).resolve().parent


def run(script, root, extra=(), compress=False):
    """One import script with this Python; returns its exit code."""
    cmd = [sys.executable, str(TOOLS / script), root]
    if compress:
        cmd += ["--compress"] + (["--compression-file", COMPRESSION_FILE] if COMPRESSION_FILE else [])
    if RUN_SCRIPT:
        cmd += ["--run-script", RUN_SCRIPT]
    if FILTER:
        cmd += ["--filter", FILTER]
    if DRY_RUN:
        cmd += ["--dry-run"]
    return subprocess.call(cmd + list(extra))


def main():
    status = 0
    for title, script, root, extra, comp in (("IMAGES", "get_images.py", IMAGE_ROOT, IMAGE_ARGS, COMPRESS_IMAGES),
                                             ("VIDEOS", "get_videos.py", VIDEO_ROOT, VIDEO_ARGS, COMPRESS_VIDEOS)):
        print(f"\n=================== {title} ===================", flush=True)
        if not root:
            print(f"(skipped: {title.lower()} root is empty)")
        elif run(script, root, extra, comp):
            print(f"{script} failed.")
            status = 1
    print()
    if status:
        print("Finished with errors, see above.")
    else:
        print(f"Done. Look at it:   {Path(sys.executable).name} -m http.server   in the project folder, then open http://localhost:8000")
        print("To publish: commit the data/ folder and push.")
    return status


if __name__ == "__main__":
    code = 1
    try:
        code = main()
    except KeyboardInterrupt:
        print("\nStopped.")
    except Exception:
        traceback.print_exc()
    if PAUSE_AT_END and sys.stdin and sys.stdin.isatty():
        try:
            input(f"\n[exit code {code}] Press Enter to close this window...")
        except (EOFError, KeyboardInterrupt):
            pass
    sys.exit(code)
