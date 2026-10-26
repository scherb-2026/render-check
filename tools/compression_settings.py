"""Compression settings for the import: resize, change format, format-specific compression. One section for images, one for videos.

This file only holds the values; the work is done by tools/compress.py. It is used when the import runs with compression switched on:
    tools/get_all.py      COMPRESS_IMAGES = True / COMPRESS_VIDEOS = True      (the switches, one for images and one for videos)
    one script alone      python tools/get_images.py <root> --compress          (same for get_videos.py)
Edit a value and save; the next import re-encodes exactly the files whose settings changed. Your source files are never touched.
Requirements: images need Pillow (python -m pip install pillow); videos need ffmpeg and ffprobe on the PATH (winget install Gyan.FFmpeg).
To use another file, give --compression-file PATH (get_all.py: COMPRESSION_FILE).

Advice (typical sizes, check a few of your own files): 12 pictures are on screen at once, so a picture needs 1280-1600 px on its long side at most.
Original and render should get the same treatment (apply_to "both"), otherwise the Difference mode shows compression noise.
"""

IMAGES = {
    # Which files are processed: "both" | "originals" | "renders". The others are copied unchanged.
    "apply_to": "both",

    # ---- 1. Resize ----
    "resize": {
        "enabled": True,
        "max_width": 1280,	  # pixels; 0 = no limit
        "max_height": 0,          # pixels; 0 = no limit. The aspect ratio is kept; the picture fits inside max_width x max_height.
        "never_enlarge": True,    # True: pictures smaller than the limit stay as they are
        "resample": "lanczos",    # "lanczos" (sharpest) | "bicubic" | "bilinear" | "box" | "nearest"
    },

    # ---- 2. Change format ----
    "format": {
        "convert_to": "webp",     # "keep" (same format as the source) | "jpg" | "png" | "webp" | "avif"
        "flatten_alpha_on": "#ffffff",   # pictures with transparency that become JPG are laid on this colour
    },

    # ---- 3. Compression of the chosen format ----
    "compression": {
        "quality": 50,            # 1-100 for jpg, webp and avif (higher = bigger, better). 90+ if you rely on the Difference mode.
        "jpg_subsampling": "4:2:0",   # "4:2:0" (smallest) | "4:2:2" | "4:4:4" (best for sharp coloured edges)
        "jpg_progressive": True,
        "webp_lossless": True,   # True: lossless WebP, ignores quality; much bigger than lossy, usually smaller than PNG
        "webp_method": 4,         # 0 (fast) - 6 (slowest, a little smaller)
        "avif_speed": 6,          # 0 (slowest, smallest) - 10 (fastest)
        "png_level": 9,           # 0-9, zlib effort; PNG is lossless, so this only changes size and time
    },
}

VIDEOS = {
    # Which files are processed: "both" | "originals" | "renders". The others follow the normal rules (copied if the browser plays them, else converted).
    "apply_to": "both",

    # ---- 1. Resize ----
    "resize": {
        "enabled": True,
        "max_width": 1280,        # pixels; 0 = no limit
        "max_height": 0,          # pixels; 0 = no limit. The aspect ratio is kept; sizes are made even, as H.264 needs.
        "max_fps": 0,             # frames per second limit; 0 = keep the source rate (original and render keep the same frame count)
    },

    # ---- 2. Change format ----
    "format": {
        "convert_to": "mp4",      # "keep" (webm stays webm, everything else becomes mp4) | "mp4" (H.264) | "webm" (VP9)
    },

    # ---- 3. Compression of the chosen format ----
    "compression": {
        "mp4_crf": 24,            # H.264 quality, 0-51, lower = better and bigger. 16 = visually lossless, 23 = ffmpeg's default, 28 = small
        "mp4_preset": "slow",     # ultrafast ... veryslow: slower = smaller file at the same quality
        "webm_crf": 34,           # VP9 quality, 0-63, lower = better and bigger (about 31-36 is a good range)
        "webm_speed": 2,          # VP9 effort, 0 (slowest, best) - 8 (fastest)
        "audio": "drop",          # "drop" (the page is muted) | "keep" (AAC in mp4, Opus in webm)
    },
}
