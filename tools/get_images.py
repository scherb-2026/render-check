#!/usr/bin/env python3
"""Get the images of a pipeline dataset into the page's data/ folder.

    python tools/get_images.py <root>                    copy everything, rewrite data/manifest.json
    python tools/get_images.py <root> --dry-run          only list what would be copied
    python tools/get_images.py <root> --filter blue      only Pose_sets whose path contains "blue"

<root> is the dataset root of the pipeline (the folder holding chc1_*, chc2_*); a deeper folder works too. Pose_sets are found
exactly as the pipeline's launcher finds them, including its IGNORE_DIRS. Per Pose_set (<camera folder>/<*_gloves>/<Pose_set>):

  originals   <Pose_set>/images/*          named by camera (camera02.png ... camera13.png), used as they are
  renders     <Pose_set>/renders/single_frames/   the stills (synthetic_<camera>_0000.<ext>, or named after the GoPro: synthetic_GoPro_CHC1_05_.png -> camera02;
                                                  a .png copy is preferred); frame sequences
                                                  in renders/images/ are not imported unless RENDER_DIRS says so (tools/import_common.py)

With ONLY_WITH_RENDERS = True (top of this script) a camera without a render is left out, original included.
Original and render with the same camera form one box. With --compress (or COMPRESS_IMAGES in get_all.py) the pictures are resized, converted
and compressed as set in tools/compression_settings.py (needs Pillow); without it they are copied unchanged. The GoPro -> camera renaming of the renders is set at the top of tools/import_common.py (SOURCE_RANGE,
TARGET_RANGE, ROTATION_OFFSET). Files already copied are not copied again; files that no longer exist in <root> are removed from
data/. Videos are handled by get_videos.py, which writes to the same manifest. Standard library only (Pillow when compressing).
"""
import compress
from import_common import (IMAGE_EXT, begin_kind, check_size, finish_manifest, import_pose_set, load_manifest, manifest_files, parse_args,
                           say, start, sync_file)

KIND = "images"
ONLY_WITH_RENDERS = True   # True: only the cameras that have a render are imported (an original alone is left out, which saves most of the space);
                           # False: every original is imported too. Command line: --only-rendered / --include-unrendered


def main():
    args = parse_args("Copy the images of a pipeline dataset into data/ and update the manifest.")
    root, pipe, sets, data = start(args, "images")
    m = load_manifest(data)
    old, keys = begin_kind(m, KIND, sets, bool(args.filter))
    only = ONLY_WITH_RENDERS if args.only_rendered is None else args.only_rendered
    say("Only cameras with a render are imported.\n" if only else "Originals without a render are imported too.\n")
    copied = []
    cs = state = None
    totals = compress.Totals()
    if args.compress:
        cs = compress.load_settings(args.compression_file)["images"]
        compress.require_pillow()
        state = compress.State(data)
        say("Compression on: " + compress.describe("images", cs) + "\n")

    def put(src, stem):
        if cs and src.suffix.lower() != ".exr" and compress.applies(cs, stem):      # EXR files are decoded by the page itself and are copied as they are
            rel = stem + compress.image_ext(src, cs)
            if args.dry_run:
                return rel
            sig = compress.signature(src, cs)
            if state.current(rel, sig):
                return rel
            try:
                compress.encode_image(src, data / rel, cs)
            except Exception as e:                  # a file Pillow can't read is copied unchanged rather than lost
                say(f"  ! {src.name}: can't compress ({type(e).__name__}: {e}); copied unchanged")
                rel = stem + src.suffix.lower()
                if sync_file(src, data / rel):
                    copied.append(rel)
                return rel
            state.set(rel, sig)
            copied.append(rel)
            totals.add(src, data / rel)
            check_size(data / rel, data)
            return rel
        rel = stem + src.suffix.lower()
        if not args.dry_run and sync_file(src, data / rel):
            copied.append(rel)
            check_size(data / rel, data)
        return rel

    for pose in sets:
        import_pose_set(pose, pipe, KIND, IMAGE_EXT, put, m, only)
    if not args.dry_run:
        say(f"\nimage import: {len(copied)} file(s) " + ("compressed or copied" if cs else "copied") + ("" if copied else " (everything was up to date)") + ".")
        if totals.line("picture(s)"):
            say(totals.line("picture(s)"))
    finish_manifest(data, m, KIND, old, manifest_files(m, KIND), args.dry_run, keys)
    if state and not args.dry_run:
        state.save()


if __name__ == "__main__":
    main()
