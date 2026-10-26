"""Compression of the imported images and videos: reads tools/compression_settings.py (or the file given with --compression-file),
checks it, and does the resizing / format change / encoding for get_images.py and get_videos.py. Standard library, plus Pillow for images
and ffmpeg for videos, both only when compression is switched on."""
import copy
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from import_common import fail, mb, say

SETTINGS_FILE = Path(__file__).resolve().parent / "compression_settings.py"
STATE_NAME = ".compression-state.json"
APPLY = ("both", "originals", "renders")
# What each setting may be: (kind, default, ...). Missing settings fall back to the default; wrong ones stop the run with a message.
IMAGE_SPEC = {
    "apply_to": ("choice", "both", APPLY),
    "resize": {"enabled": ("bool", True), "max_width": ("int", 1600, 0, 100000), "max_height": ("int", 0, 0, 100000),
               "never_enlarge": ("bool", True), "resample": ("choice", "lanczos", ("lanczos", "bicubic", "bilinear", "box", "nearest"))},
    "format": {"convert_to": ("choice", "webp", ("keep", "jpg", "png", "webp", "avif")), "flatten_alpha_on": ("color", "#ffffff")},
    "compression": {"quality": ("int", 85, 1, 100), "jpg_subsampling": ("choice", "4:2:0", ("4:2:0", "4:2:2", "4:4:4")),
                    "jpg_progressive": ("bool", True), "webp_lossless": ("bool", False), "webp_method": ("int", 4, 0, 6),
                    "avif_speed": ("int", 6, 0, 10), "png_level": ("int", 9, 0, 9)},
}
VIDEO_SPEC = {
    "apply_to": ("choice", "both", APPLY),
    "resize": {"enabled": ("bool", True), "max_width": ("int", 1280, 0, 100000), "max_height": ("int", 0, 0, 100000), "max_fps": ("num", 0, 0, 1000)},
    "format": {"convert_to": ("choice", "mp4", ("keep", "mp4", "webm"))},
    "compression": {"mp4_crf": ("int", 24, 0, 51),
                    "mp4_preset": ("choice", "slow", ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow")),
                    "webm_crf": ("int", 34, 0, 63), "webm_speed": ("int", 2, 0, 8), "audio": ("choice", "drop", ("drop", "keep"))},
}


# ---------------------------------------------------------------- the settings file

def _check(value, rule, where, errors):
    kind, default = rule[0], rule[1]
    if value is None:
        return default
    ok, shown = True, repr(value)
    if kind == "bool":
        ok = isinstance(value, bool)
    elif kind in ("int", "num"):
        ok = isinstance(value, (int, float)) and not isinstance(value, bool) and (kind == "num" or float(value).is_integer()) and rule[2] <= value <= rule[3]
        if ok:
            value = int(value) if kind == "int" else float(value)
        else:
            shown += f" (must be a number from {rule[2]} to {rule[3]})"
    elif kind == "choice":
        ok = isinstance(value, str) and value in rule[2]
        shown += " (one of: " + ", ".join(rule[2]) + ")"
    elif kind == "color":
        ok = isinstance(value, str) and len(value) == 7 and value[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in value[1:])
        shown += ' (like "#ffffff")'
    if not ok:
        errors.append(f"{where}: {shown}")
        return default
    return value


def _section(raw, spec, name, errors):
    out = {}
    if not isinstance(raw, dict):
        errors.append(f"{name} is missing or is not a section")
        raw = {}
    for key, rule in spec.items():
        if isinstance(rule, dict):
            sub = raw.get(key)
            if sub is not None and not isinstance(sub, dict):
                errors.append(f"{name}.{key} must be a section")
                sub = None
            out[key] = {k: _check((sub or {}).get(k), r, f"{name}.{key}.{k}", errors) for k, r in rule.items()}
            for k in (sub or {}):
                if k not in rule:
                    errors.append(f"{name}.{key}.{k} is not a setting (misspelled?)")
        else:
            out[key] = _check(raw.get(key), rule, f"{name}.{key}", errors)
    for k in raw:
        if k not in spec:
            errors.append(f"{name}.{k} is not a setting (misspelled?)")
    return out


def load_settings(path=None):
    """{'images': {...}, 'videos': {...}} from the settings file, checked."""
    p = Path(path).expanduser() if path else SETTINGS_FILE
    if not p.is_file():
        fail(f"compression settings file not found: {p}")
    spec = importlib.util.spec_from_file_location("compression_settings_user", p)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:                      # the user edits this file, so show what is wrong with it
        fail(f"{p.name} can't be read: {type(e).__name__}: {e}")
    errors = []
    out = {"images": _section(getattr(mod, "IMAGES", None), IMAGE_SPEC, "IMAGES", errors),
           "videos": _section(getattr(mod, "VIDEOS", None), VIDEO_SPEC, "VIDEOS", errors)}
    if errors:
        fail(f"{p.name} has problems:\n  " + "\n  ".join(errors))
    return out


def applies(s, stem):
    """Does the compression apply to this file? (stem: destination path, which has /original/ or /render/ in it.)"""
    return s["apply_to"] == "both" or (s["apply_to"] == "originals") == ("/original/" in stem)


def signature(src, s):
    """Changes when the source file or any compression setting changes."""
    st = src.stat()
    return f"{st.st_size}-{int(st.st_mtime)}-" + hashlib.sha1(json.dumps(s, sort_keys=True).encode()).hexdigest()[:10]


class State:
    """data/.compression-state.json: for every compressed file the signature it was made with, so unchanged files are not encoded again."""
    def __init__(self, data_dir):
        self.data, self.path, self.entries = data_dir, data_dir / STATE_NAME, {}
        try:
            self.entries = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass

    def current(self, rel, sig):
        return self.entries.get(rel) == sig and (self.data / rel).is_file()

    def set(self, rel, sig):
        self.entries[rel] = sig

    def save(self):
        self.entries = {k: v for k, v in self.entries.items() if (self.data / k).is_file()}
        if self.entries or self.path.exists():
            self.path.write_text(json.dumps(self.entries, indent=0, sort_keys=True), encoding="utf-8")


class Totals:
    """Bytes before and after, for the closing line."""
    def __init__(self):
        self.files = self.src = self.dest = 0

    def add(self, src, dest):
        self.files += 1
        self.src += src.stat().st_size
        self.dest += dest.stat().st_size

    def line(self, what):
        if not self.files:
            return ""
        return f"Compression: {self.files} {what}, {mb(self.src)} -> {mb(self.dest)} ({self.dest / max(1, self.src):.0%} of the original size)."


def describe(kind, s):
    r, f, c = s["resize"], s["format"]["convert_to"], s["compression"]
    size = "no resize" if not (r["enabled"] and (r["max_width"] or r["max_height"])) else \
        "max " + " x ".join(x for x in (f"{r['max_width']} px wide" if r["max_width"] else "", f"{r['max_height']} px high" if r["max_height"] else "") if x)
    if kind == "images":
        q = {"jpg": f"quality {c['quality']}", "webp": "lossless" if c["webp_lossless"] else f"quality {c['quality']}", "avif": f"quality {c['quality']}",
             "png": "lossless", "keep": f"quality {c['quality']} where the format has one"}[f]
    else:
        q = {"mp4": f"H.264 crf {c['mp4_crf']}, {c['mp4_preset']}", "webm": f"VP9 crf {c['webm_crf']}, speed {c['webm_speed']}",
             "keep": f"mp4 crf {c['mp4_crf']} / webm crf {c['webm_crf']}"}[f]
    return f"{kind}: {size}, format {f}, {q}, applied to {s['apply_to']}"


# ---------------------------------------------------------------- images (Pillow)

IMAGE_EXT_OUT = {"jpg": ".jpg", "png": ".png", "webp": ".webp", "avif": ".avif"}
KEEP_MAP = {".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".webp": "webp", ".avif": "avif"}


def require_pillow():
    try:
        from PIL import Image, ImageOps            # noqa: F401
    except ImportError:
        fail(f"compressing images needs Pillow. Install it with:   {sys.executable} -m pip install pillow")


def image_format(src, s):
    """Output format of an image: the chosen one; 'keep' = the source's own (BMP, GIF and the like become PNG)."""
    f = s["format"]["convert_to"]
    return KEEP_MAP.get(src.suffix.lower(), "png") if f == "keep" else f


def image_ext(src, s):
    return IMAGE_EXT_OUT[image_format(src, s)]


def encode_image(src, dest, s):
    """Resize / convert / compress `src` into `dest` (written to a temporary file first). Raises on trouble."""
    from PIL import Image, ImageOps
    fmt, r, c = image_format(src, s), s["resize"], s["compression"]
    bg = s["format"]["flatten_alpha_on"]
    resample = {"lanczos": Image.LANCZOS, "bicubic": Image.BICUBIC, "bilinear": Image.BILINEAR, "box": Image.BOX, "nearest": Image.NEAREST}[r["resample"]]
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)             # GoPro files may only be rotated by a flag
        if im.mode in ("I;16", "I;16L", "I;16B", "I", "F"):
            im = im.point(lambda v: v * (1.0 / 256)).convert("L")     # 16-bit pictures become 8-bit
        elif im.mode == "P":
            im = im.convert("RGBA" if "transparency" in im.info else "RGB")
        elif im.mode in ("CMYK", "LAB", "YCbCr", "HSV"):
            im = im.convert("RGB")
        elif im.mode == "LA":
            im = im.convert("RGBA")
        if r["enabled"] and (r["max_width"] or r["max_height"]):
            w, h = im.size
            scale = min(r["max_width"] / w if r["max_width"] else 1e9, r["max_height"] / h if r["max_height"] else 1e9)
            if r["never_enlarge"]:
                scale = min(scale, 1.0)
            if abs(scale - 1) > 1e-6:
                im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), resample)
        if "A" in im.mode and fmt == "jpg":          # JPEG has no transparency: lay the picture on a colour
            flat = Image.new("RGB", im.size, bg)
            flat.paste(im, mask=im.getchannel("A"))
            im = flat
        elif fmt in ("webp", "avif") and im.mode == "L":
            im = im.convert("RGB")
        elif fmt == "jpg" and im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name("." + dest.stem + ".encoding" + dest.suffix)
        try:
            if fmt == "jpg":
                im.save(tmp, format="JPEG", quality=c["quality"], optimize=True, progressive=c["jpg_progressive"],
                        subsampling={"4:4:4": 0, "4:2:2": 1, "4:2:0": 2}[c["jpg_subsampling"]])
            elif fmt == "webp":
                im.save(tmp, format="WEBP", quality=c["quality"], lossless=c["webp_lossless"], method=c["webp_method"])
            elif fmt == "avif":
                im.save(tmp, format="AVIF", quality=c["quality"], speed=c["avif_speed"])
            else:
                im.save(tmp, format="PNG", optimize=True, compress_level=c["png_level"])
            os.replace(tmp, dest)
        finally:
            if tmp.exists():
                tmp.unlink()


# ---------------------------------------------------------------- videos (ffmpeg)

def video_ext(src, s):
    f = s["format"]["convert_to"]
    return ".webm" if f == "webm" or (f == "keep" and src.suffix.lower() == ".webm") else ".mp4"


def video_args(ext, s):
    """ffmpeg options (after -i) for the chosen format, resize and compression."""
    r, c = s["resize"], s["compression"]
    mw, mh = (r["max_width"], r["max_height"]) if r["enabled"] else (0, 0)
    if mw or mh:
        vf = f"scale=w='min(iw,{mw or 100000})':h='min(ih,{mh or 100000})':force_original_aspect_ratio=decrease:force_divisible_by=2"
    else:
        vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    args = ["-map", "0:v:0", "-vf", vf]
    if r["enabled"] and r["max_fps"]:
        args += ["-fpsmax", f"{r['max_fps']:g}"]
    if c["audio"] == "keep":
        args += ["-map", "0:a:0?", "-c:a", "libopus" if ext == ".webm" else "aac", "-b:a", "64k" if ext == ".webm" else "96k"]
    else:
        args += ["-an"]
    if ext == ".webm":
        args += ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", str(c["webm_crf"]), "-cpu-used", str(c["webm_speed"]), "-row-mt", "1", "-pix_fmt", "yuv420p", "-f", "webm"]
    else:
        args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(c["mp4_crf"]), "-preset", c["mp4_preset"], "-movflags", "+faststart", "-f", "mp4"]
    return args


def expected_codec(ext):
    return "vp9" if ext == ".webm" else "h264"
