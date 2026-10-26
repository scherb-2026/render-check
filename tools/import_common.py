"""Shared code of get_images.py and get_videos.py: settings, Pose_set discovery, camera renaming, copying, manifest."""
import ast
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path, PurePosixPath

# ======================================================================================================================
# SETTINGS  (edit here)
# ======================================================================================================================

# The pipeline's launcher. Its IGNORE_DIRS, RENDER_SUBDIR, WORK_SUBDIR and the body/hands file names are read from it (never run).
# None = find it at the dataset root (the folder you give the scripts), else next to this project; or give the full path.
RUN_SCRIPT = None

# Camera renaming. The originals are named by camera (camera02.png ... camera13.png) and are used as they are. The RENDERS are named after the
# GoPro (synthetic_GoPro_CHC1_05_.png); that number becomes the number of the camera:
#   SOURCE_RANGE     first and last GoPro number found in the render file names      (gopro1 ... gopro12)
#   TARGET_RANGE     first and last camera number they are turned into               (camera02 ... camera13)
#   ROTATION_OFFSET  circular shift: with 4, SOURCE_RANGE[0] + 4 (gopro5) becomes TARGET_RANGE[0] (camera02);
#                    the numbers before it wrap around to the end (gopro1 -> camera10, gopro4 -> camera13).
#                    0 = no shift (gopro1 -> camera02).
SOURCE_RANGE = (1, 12)
TARGET_RANGE = (2, 13)
ROTATION_OFFSET = 4
TARGET_NAME = "camera{:02d}"              # name of a camera and of its box; {} = the camera number
ORIGINAL_CAMERA_RE = r"camera[_\- ]?(\d+)"  # how an original names its camera (camera13.png, also camera13_synced.mp4): used as it is, any number
ORIGINAL_GOPRO_RE = r"gopro[_\- ]*(?:chc\d*[_\- ]*)?(\d+)"  # an original named after its GoPro instead (gopro1.mp4, gopro01.mp4, gopro1_synced_cut.mp4, GoPro_CHC1_05.mp4): that number goes through the same rotation as the renders
RENDER_CAMERA_RE = r"camera[_\- ]?(\d+)"  # how a render file (or the folder it is in) names its camera (synthetic_camera02_0001.png): used as it is
RENDER_GOPRO_RE = r"gopro[_\- ]*(?:chc\d*[_\- ]*)?(\d+)"  # a render named after its GoPro (synthetic_GoPro_CHC1_05_.png): that number goes through the rotation

# Where the files are, relative to a Pose_set folder.
# A Pose_set is a folder holding a body file and a hands file: one of these (body, hands) name pairs, as .npy or as .npz (both files with the same
# extension, upper or lower case). The pair named in the pipeline's run script (BODY_NPY / HANDS_NPY) counts too.
POSE_NAME_PAIRS = [("body_3d", "hands_3d"), ("body_poses_3d", "hand_poses_3d"), ("body_poses_3d", "hands_poses_3d")]
POSE_EXTS = [".npy", ".npz"]
POSE_FILE_PAIRS = [(b + e, h + e) for e in POSE_EXTS for b, h in POSE_NAME_PAIRS]
ORIGINAL_DIRS = ["images", "videos"]      # the originals (GoPro images, later GoPro videos)
# The official output locations of the pipeline (research/Pipeline output locations.md), below <Pose_set>/<RENDER_SUBDIR> ("renders"):
#   single images    single_frames/synthetic_<camera>_0000.<ext>                    -> the render images
#   frame sequences  images/synthetic_<camera>/synthetic_<camera>_<NNNN>.<ext>      -> not imported: hundreds of frames per camera. Add "images" to import them.
#   videos           videos/synthetic_<camera>.mp4                                  -> the render videos
# Which folders of renders are read, per kind ("" = the whole renders folder):
RENDER_DIRS = {"images": ["single_frames"], "videos": ["videos"]}
# A single image comes with a .png copy when the scene format isn't PNG (synthetic_camera02_0000.exr + .png): True = import only the .png
PREFER_PNG_COPY = True
# Folders of renders that are not output files (skipped everywhere below):
RENDER_SKIP_DIRS = ["extrinsics", "intrinsics"]
# Timestamped folders of the old, non-direct toolkit output (see cleanup_timed_renders.py in the pipeline): skipped
TIMED_DIR_RES = [r"synthetic_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}", r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_frame_\d+"]

# ======================================================================================================================

SITE = Path(__file__).resolve().parent.parent
DATA_DIR = SITE / "data"
MANIFEST = "manifest.json"
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".exr")      # keep in step with js/core/config.js
VIDEO_EXT = (".mp4", ".m4v", ".webm", ".mov", ".ogv")
FILE_LIMIT = 100 * 1024 * 1024                                                         # GitHub rejects bigger files
SITE_LIMIT = 1024 ** 3                                                                 # a Pages site should stay below about 1 GB
collator_key = lambda s: [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]
mb = lambda n: f"{n / 1048576:.1f} MB"


def say(msg=""):
    print(msg, flush=True)


def fail(msg):
    sys.exit(f"Error: {msg}")


# ---------------------------------------------------------------- the run script's settings

def find_run_script(given, root=None):
    """The launcher file: --run-script / RUN_SCRIPT, else run_dataset_pipeline.py at the dataset root (or up to 3 folders above it,
    for a root started deeper inside the dataset), else a few places near this project."""
    name = "run_dataset_pipeline.py"
    if given or RUN_SCRIPT:
        p = Path(given or RUN_SCRIPT)
        return p if p.is_file() else fail(f"run script not found: {p}")
    if root is not None:
        for base in [root, *list(root.parents)[:3]]:
            if (base / name).is_file():
                return base / name
    for base in (SITE, SITE.parent, SITE.parent.parent):
        for rel in (name, f"pipeline/{name}", f"chc_pipeline/pipeline/{name}"):
            if (base / rel).is_file():
                return base / rel
    return None


def read_run_settings(path):
    """Literal top-level assignments of the launcher (IGNORE_DIRS, RENDER_SUBDIR, ...), read without importing it."""
    found = {}
    if path is None:
        return found
    for node in ast.parse(Path(path).read_text(encoding="utf-8")).body:
        if not isinstance(node, ast.Assign):
            continue
        try:
            value = ast.literal_eval(node.value)
        except (ValueError, SyntaxError):
            continue
        for t in node.targets:
            if isinstance(t, ast.Name):
                found[t.id] = value
            elif isinstance(t, ast.Tuple) and isinstance(value, tuple) and len(t.elts) == len(value):
                found.update({e.id: v for e, v in zip(t.elts, value) if isinstance(e, ast.Name)})
    return found


class Pipeline:
    """What the import needs to know about the pipeline's folder layout."""

    def __init__(self, run_script_arg, root=None):
        self.script = find_run_script(run_script_arg, root)
        s = read_run_settings(self.script)
        self.ignore = [str(n) for n in s.get("IGNORE_DIRS", ["output_3d"])]
        self.render_dir = s.get("RENDER_SUBDIR", "renders")
        self.work_dir = s.get("WORK_SUBDIR", "_pipeline")
        pair = (s.get("BODY_NPY", "body_3d.npy"), s.get("HANDS_NPY", "hands_3d.npy"))
        self.pairs = [pair] + [p for p in POSE_FILE_PAIRS if p != pair]

    def describe_pairs(self):
        """The accepted file pairs, shortened: body_3d + hands_3d, body_poses_3d + hand_poses_3d ... (.npy or .npz)"""
        stems = []
        for b, h in self.pairs:
            t = f"{Path(b).stem} + {Path(h).stem}"
            if t not in stems:
                stems.append(t)
        return "; ".join(stems) + " (.npy or .npz)"

    def describe(self):
        src = self.script or "not found, using defaults"
        say(f"Run script:    {src}")
        say(f"Ignored dirs:  {', '.join(self.ignore) or '(none)'}")

    def find_pose_sets(self, root):
        """Folders under root holding a pair of body and hands files (POSE_FILE_PAIRS); ignored folders are not entered (same rule as the launcher)."""
        ignore = {n.lower() for n in self.ignore}
        found = []
        for cur, dirs, files in os.walk(root):
            dirs[:] = sorted(d for d in dirs if d.lower() not in ignore)
            names = {f.lower() for f in files}                       # Windows file names ignore case, so this does too
            if any(b.lower() in names and h.lower() in names for b, h in self.pairs):
                found.append(Path(cur))
        keep = [p for p in found if self.work_dir not in p.parts and self.render_dir not in p.relative_to(root).parts]
        return sorted(keep, key=lambda p: [collator_key(x) for x in p.parts])


# ---------------------------------------------------------------- camera renaming

def rename_map():
    """{source number: camera number} from SOURCE_RANGE, TARGET_RANGE and ROTATION_OFFSET."""
    (s0, s1), (t0, t1) = SOURCE_RANGE, TARGET_RANGE
    n = s1 - s0 + 1
    if n < 1 or t1 - t0 + 1 != n:
        fail(f"SOURCE_RANGE {SOURCE_RANGE} and TARGET_RANGE {TARGET_RANGE} must cover the same number of cameras (tools/import_common.py).")
    return {s0 + i: t0 + (i - ROTATION_OFFSET) % n for i in range(n)}


def print_rename_table():
    m = rename_map()
    say("Renaming of files named after the GoPro (e.g. gopro5 -> camera02):  " + "  ".join(f"{a}->{TARGET_NAME.format(b)}" for a, b in m.items()))


def original_camera(name):
    """Camera name of an original, whatever comes before or after the number:
    camera13.png -> camera13 (used as it is, any number); gopro5_synced_cut.mp4 -> camera02 (a GoPro number goes through the rotation, like the
    renders). None when the name has neither (or the GoPro number is outside SOURCE_RANGE)."""
    stem = Path(name).stem
    m = re.search(ORIGINAL_CAMERA_RE, stem, re.I)
    if m:
        return TARGET_NAME.format(int(m.group(1)))
    m = re.search(ORIGINAL_GOPRO_RE, stem, re.I)
    if m and int(m.group(1)) in rename_map():
        return TARGET_NAME.format(rename_map()[int(m.group(1))])
    return None


def render_camera(rel_parts):
    """Camera name of a render, from its file name, else from the folders it is in (synthetic_camera02_0001.png -> camera02,
    synthetic_GoPro_CHC1_05_.png -> camera02 by the rotation)."""
    last = len(rel_parts) - 1
    for i in range(last, -1, -1):
        part = Path(rel_parts[i]).stem if i == last else rel_parts[i]
        m = re.search(RENDER_CAMERA_RE, part, re.I)
        if m:
            return TARGET_NAME.format(int(m.group(1)))
        m = re.search(RENDER_GOPRO_RE, part, re.I)
        if m and int(m.group(1)) in rename_map():
            return TARGET_NAME.format(rename_map()[int(m.group(1))])
    return None


# ---------------------------------------------------------------- finding the files of a Pose_set

def walk_files(base, skip_dirs, exts):
    """Media files below base (sorted), without hidden items and skipped folders."""
    out = []
    if not base.is_dir():
        return out
    timed = [re.compile(p) for p in TIMED_DIR_RES]
    for cur, dirs, files in os.walk(base):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d.lower() not in skip_dirs and not any(t.fullmatch(d) for t in timed))
        out += [Path(cur) / f for f in sorted(files, key=collator_key) if not f.startswith(".") and f.lower().endswith(exts)]
    return out


def skipped_timed_dirs(base):
    timed = [re.compile(p) for p in TIMED_DIR_RES]
    return sorted({d.name for cur, dirs, _ in os.walk(base) for d in (Path(cur) / x for x in dirs) if any(t.fullmatch(d.name) for t in timed)}) if base.is_dir() else []


def collect(pose_dir, pipe, exts, kind):
    """Plan for one Pose_set: {camera name: {'original': source Path or None, 'renders': [(source Path, relative path)]}} and warnings."""
    cams, warnings = {}, []
    for d in ORIGINAL_DIRS:
        for f in walk_files(pose_dir / d, set(), exts):
            cam = original_camera(f.name)
            if cam is None:
                warnings.append(f"original {d}/{f.name}: no camera<number> or gopro<number> (within SOURCE_RANGE) in the name, skipped")
                continue
            slot = cams.setdefault(cam, {"original": None, "renders": []})
            if slot["original"] is None:
                slot["original"] = f
            else:
                warnings.append(f"original {d}/{f.name}: {cam} already has {slot['original'].name}, skipped")
    rdir = pose_dir / pipe.render_dir
    seen = set()
    for sub in RENDER_DIRS.get(kind, [""]):
        base = rdir / sub if sub else rdir
        if sub and not base.is_dir():
            if kind == "images" and not (rdir / "images").is_dir():   # no stills and no sequences either. (A missing videos/ is normal: the toolkit builds videos only when asked to.)
                warnings.append(f"{pipe.render_dir}/{sub} not found: no render {kind} (RENDER_DIRS in tools/import_common.py)")
            continue
        files = walk_files(base, {n.lower() for n in RENDER_SKIP_DIRS}, exts)
        if kind == "images" and PREFER_PNG_COPY:
            has_png = {(f.parent, f.stem.lower()) for f in files if f.suffix.lower() == ".png"}
            files = [f for f in files if f.suffix.lower() == ".png" or (f.parent, f.stem.lower()) not in has_png]
        for f in files:
            if f in seen:
                continue
            seen.add(f)
            rel = f.relative_to(rdir)
            cam = render_camera(rel.parts)
            if cam is None:
                cam = f.stem
                warnings.append(f"render {rel.as_posix()}: no camera number in the name, shown as '{cam}'")
            cams.setdefault(cam, {"original": None, "renders": []})["renders"].append((f, rel.as_posix()))
    seq = rdir / "images"
    if kind == "images" and "images" not in RENDER_DIRS["images"] and seq.is_dir():
        n = sum(1 for d in seq.iterdir() if d.is_dir() and not d.name.startswith("."))
        if n:
            warnings.append(f"{n} frame sequence folder(s) in {pipe.render_dir}/images not imported (add \"images\" to RENDER_DIRS to import them)")
    old = skipped_timed_dirs(rdir)
    if old:
        warnings.append(f"{len(old)} timestamped render folder(s) skipped ({old[0]}, ...): run cleanup_timed_renders.py or render with direct output")
    return cams, warnings


def labels(pose_dir):
    """(dataset, colour, tool) folder names of a Pose_set: camera folder / gloves folder / Pose_set."""
    return pose_dir.parent.parent.name, pose_dir.parent.name, pose_dir.name


# ---------------------------------------------------------------- copying

def sync_file(src, dest):
    """Copy src to dest unless an identical copy (same size and time) is there. Returns True when copied."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    s = src.stat()
    if dest.exists():
        d = dest.stat()
        if d.st_size == s.st_size and abs(d.st_mtime - s.st_mtime) < 2:
            return False
    shutil.copy2(src, dest)
    return True


# ---------------------------------------------------------------- manifest

def load_manifest(data_dir):
    p = data_dir / MANIFEST
    if p.is_file():
        try:
            m = json.loads(p.read_text(encoding="utf-8"))
            if m.get("version") == 3 and isinstance(m.get("datasets"), list):
                return m
        except (OSError, ValueError):
            pass
    return {"version": 3, "datasets": []}


def pretty_color(name):
    return re.sub(r"[_-]+", " ", name).strip().capitalize()


def tool_node(m, ds, color, tool):
    """The manifest entry of (dataset, colour, tool), created when missing."""
    d = next((x for x in m["datasets"] if x["name"] == ds), None)
    if d is None:
        d = {"name": ds, "label": ds, "colors": []}
        m["datasets"].append(d)
    c = next((x for x in d["colors"] if x["name"] == color), None)
    if c is None:
        c = {"name": color, "label": pretty_color(color), "tools": []}
        d["colors"].append(c)
    t = next((x for x in c["tools"] if x["name"] == tool), None)
    if t is None:
        t = {"name": tool, "label": tool, "images": [], "videos": []}
        c["tools"].append(t)
    return t


def all_tools(m):
    return [(d["name"], c["name"], t["name"], t) for d in m["datasets"] for c in d["colors"] for t in c["tools"]]


def manifest_files(m, kind, keys=None):
    """Every file path listed for `kind` (images / videos), optionally only for the given (dataset, colour, tool) keys."""
    out = set()
    for ds, color, tool, t in all_tools(m):
        if keys is None or (ds, color, tool) in keys:
            for room in t[kind]:
                out.update(([room["original"]] if room.get("original") else []) + room.get("renders", []))
    return out


def begin_kind(m, kind, sets, filtered):
    """Empty the `kind` lists that this run rebuilds (all tools, or only those of `sets` with --filter); returns the files they listed."""
    keys = {labels(p) for p in sets} if filtered else None
    old = manifest_files(m, kind, keys)
    for ds, color, tool, t in all_tools(m):
        if keys is None or (ds, color, tool) in keys:
            t[kind] = []
    return old, keys


def sweep(data_dir, kind, keep, keys):
    """Delete every file in the `kind` folders of data/ that the manifest does not list (all tools, or only `keys` with --filter)."""
    removed = 0
    for kdir in sorted(data_dir.glob(f"*/*/*/{kind}")):
        if not kdir.is_dir() or (keys is not None and (kdir.parent.parent.parent.name, kdir.parent.parent.name, kdir.parent.name) not in keys):
            continue
        for f in kdir.rglob("*"):
            if f.is_file() and f.relative_to(data_dir).as_posix() not in keep:
                f.unlink()
                removed += 1
    return removed


def finish_manifest(data_dir, m, kind, old_files, new_files, dry_run, keys=None):
    """Prune empty tools / colours / datasets, sort, delete files the manifest no longer lists, write it."""
    for d in m["datasets"]:
        for c in d["colors"]:
            c["tools"] = sorted((t for t in c["tools"] if t["images"] or t["videos"]), key=lambda t: collator_key(t["name"]))
        d["colors"] = sorted((c for c in d["colors"] if c["tools"]), key=lambda c: collator_key(c["name"]))
    m["datasets"] = sorted((d for d in m["datasets"] if d["colors"]), key=lambda d: collator_key(d["name"]))
    m["generated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    stale = sorted(old_files - new_files)
    if dry_run:
        say(f"\nDry run: nothing written. {len(stale)} stale {kind} file(s) would be removed.")
        return
    for rel in stale:
        p = data_dir / rel
        if p.is_file():
            p.unlink()
    stray = sweep(data_dir, kind, new_files, keys)
    for cur, dirs, files in os.walk(data_dir, topdown=False):
        if cur != str(data_dir) and not dirs and not files:
            os.rmdir(cur)
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / MANIFEST).write_text(json.dumps(m, indent=1) + "\n", encoding="utf-8")
    n_rooms = sum(len(t[kind]) for *_, t in all_tools(m))
    total = sum(f.stat().st_size for f in data_dir.rglob("*") if f.is_file())
    say(f"\nWrote {data_dir / MANIFEST}: {n_rooms} {kind} box(es) in {len(all_tools(m))} tool tab(s), {mb(total)} in data/ in total"
        + (f", {len(stale) + stray} stale file(s) removed." if stale or stray else "."))
    if total > SITE_LIMIT:
        say(f"! data/ is {mb(total)}: GitHub Pages sites should stay below about 1 GB.")


def check_size(dest, data_dir):
    if dest.exists() and dest.stat().st_size > FILE_LIMIT:
        say(f"  ! {dest.relative_to(data_dir).as_posix()} is {mb(dest.stat().st_size)}: GitHub rejects files over 100 MB.")


def import_pose_set(pose, pipe, kind, exts, put, m, only_rendered=False):
    """Put every original and render of one Pose_set into the manifest. `put(src, stem)` copies / converts one file and returns its
    path relative to the data folder (stem = destination path without extension), or None when it failed.
    only_rendered: leave out the originals of cameras that have no render (they are not copied; they are the bulk of the data)."""
    ds, color, tool = labels(pose)
    cams, warnings = collect(pose, pipe, exts, kind)
    base = f"{ds}/{color}/{tool}/{kind}"
    rooms, n_orig, n_rend, n_skip = [], 0, 0, 0
    for cam in sorted(cams, key=collator_key):
        slot = cams[cam]
        if only_rendered and not slot["renders"]:
            n_skip += 1
            continue
        orig = put(slot["original"], f"{base}/original/{cam}") if slot["original"] else None
        rends = [r for r in (put(src, f"{base}/render/{PurePosixPath(rel).with_suffix('')}") for src, rel in slot["renders"]) if r]
        if orig or rends:
            rooms.append({"name": cam, "original": orig, "renders": rends})
            n_orig += bool(orig)
            n_rend += len(rends)
    if rooms:
        tool_node(m, ds, color, tool)[kind] = rooms
    say(f"{ds}/{color}/{tool}: {len(rooms)} box(es), {n_orig} original(s), {n_rend} render(s)"
        + ("" if rooms else f"  (no {kind} found)"))
    if n_skip:
        say(f"  {n_skip} original(s) without a render left out ({cam_list(cams, True)})")
    for w in warnings:
        say(f"  ! {w}")
    return rooms


def cam_list(cams, no_render_only=False):
    """'camera02, camera03' of the cameras without a render (or all)."""
    return ", ".join(c for c in sorted(cams, key=collator_key) if not (no_render_only and cams[c]["renders"]))


def parse_args(description, extra=None):
    import argparse
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("root", help="dataset root: the folder holding the camera folders (chc1_*, chc2_*); a deeper folder works too")
    ap.add_argument("--filter", help="only Pose_sets whose path contains TEXT (the others stay in the data folder untouched)")
    ap.add_argument("--data", default=str(DATA_DIR), help="output folder (default: data/ in this project)")
    ap.add_argument("--run-script", help="path of run_dataset_pipeline.py (default: RUN_SCRIPT, else found at the dataset root, else near this project)")
    ap.add_argument("--dry-run", action="store_true", help="list what would be copied; write nothing")
    ap.add_argument("--compress", action="store_true", help="resize / convert / compress as set in tools/compression_settings.py (images need Pillow, videos ffmpeg)")
    ap.add_argument("--compression-file", help="settings file for --compress (default: tools/compression_settings.py)")
    ap.add_argument("--only-rendered", dest="only_rendered", action="store_true", default=None, help="leave out originals that have no render (overrides ONLY_WITH_RENDERS in the script)")
    ap.add_argument("--include-unrendered", dest="only_rendered", action="store_false", help="also import originals that have no render (overrides ONLY_WITH_RENDERS in the script)")
    if extra:
        extra(ap)
    return ap.parse_args()


def start(args, what):
    """Common start of both scripts: pipeline settings, pose sets and the output folder."""
    root = Path(args.root).resolve()
    if not root.is_dir():
        fail(f"{root} is not a folder.")
    pipe = Pipeline(args.run_script, root)
    say(f"Importing {what} from {root}")
    pipe.describe()
    print_rename_table()
    sets = pipe.find_pose_sets(root)
    if args.filter:
        sets = [p for p in sets if args.filter.lower() in p.relative_to(root).as_posix().lower()]
    if not sets:
        fail(f"no Pose_sets (folders with a body and a hands file: {pipe.describe_pairs()}) found under {root}" + (f" matching '{args.filter}'" if args.filter else "") + ".")
    say(f"{len(sets)} Pose_set(s)\n")
    return root, pipe, sets, Path(args.data).resolve()
