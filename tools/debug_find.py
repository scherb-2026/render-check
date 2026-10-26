#!/usr/bin/env python3
"""Shows why the import scripts find (or don't find) Pose_sets under a folder.

    python tools/debug_find.py "C:\\Users\\scherb\\LocalDesktop\\CHC_render\\CHC_video_datasets"

With no argument it uses VIDEO_ROOT from get_all.py. Standard library only. It changes nothing; it prints what it sees:
the folder itself, the settings read from run_dataset_pipeline.py, every folder that holds files that look like pose data,
which of them count as Pose_sets, and for those that do not, the reason.
"""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
LOOKS_LIKE = re.compile(r"(body|hands?|poses?|3d).*\.(npy|npz|json|pkl|csv|h5)$|\.(npy|npz)$", re.I)


def default_root():
    try:
        src = (HERE / "get_all.py").read_text(encoding="utf-8")
        m = re.search(r'^VIDEO_ROOT\s*=\s*r?["\'](.*?)["\']', src, re.M)
        return m.group(1) if m else ""
    except OSError:
        return ""


def main():
    root_arg = sys.argv[1] if len(sys.argv) > 1 else default_root()
    if not root_arg:
        print("Give the folder:  python tools/debug_find.py <root>")
        return 1
    root = Path(root_arg)
    print(f"Python:  {sys.version.split()[0]}  ({sys.executable})")
    print(f"Root:    {root}")
    print(f"  exists: {root.exists()}   is a folder: {root.is_dir()}")
    if not root.is_dir():
        parent = root
        while not parent.exists() and parent != parent.parent:
            parent = parent.parent
        print(f"  the deepest part that exists is: {parent}")
        try:
            print("  its content:", ", ".join(sorted(os.listdir(parent))[:40]) or "(empty)")
        except OSError as e:
            print("  cannot list it:", e)
        return 1
    try:
        top = sorted(os.listdir(root))
    except OSError as e:
        print("  cannot list the root:", e)
        return 1
    print(f"  {len(top)} entries: " + ", ".join(top[:30]) + (" ..." if len(top) > 30 else ""))

    # What the import scripts would use
    ignore, render_dir, work_dir, pairs = ["output_3d"], "renders", "_pipeline", [("body_3d.npy", "hands_3d.npy"), ("body_3d.npz", "hands_3d.npz")]
    try:
        import import_common as ic
        pipe = ic.Pipeline("", root)
        print(f"Run script: {pipe.script or 'NOT FOUND (defaults used)'}")
        ignore, render_dir, work_dir, pairs = pipe.ignore, pipe.render_dir, pipe.work_dir, pipe.pairs
    except SystemExit as e:
        print("Pipeline settings could not be read:", e)
    except Exception as e:
        print("Pipeline settings could not be read:", type(e).__name__, e)
    print(f"  ignored folder names: {ignore}   renders folder: {render_dir!r}   work folder: {work_dir!r}")
    print("  pairs that make a Pose_set: " + "  |  ".join(f"{b} + {h}" for b, h in pairs))
    print("  (a pair needs both files in the same folder; upper or lower case does not matter)")

    # Walk everything
    errors, links, folders, files_seen, hits = [], [], 0, 0, []
    ign = {n.lower() for n in ignore}
    for cur, dirs, files in os.walk(root, onerror=lambda e: errors.append(str(e))):
        folders += 1
        files_seen += len(files)
        for d in dirs:
            if os.path.islink(os.path.join(cur, d)):
                links.append(os.path.join(cur, d))
        skipped = [d for d in dirs if d.lower() in ign]
        if skipped:
            print(f"  [ignored, not entered] {', '.join(os.path.join(cur, d) for d in skipped)}")
        dirs[:] = sorted(d for d in dirs if d.lower() not in ign)
        cand = [f for f in files if LOOKS_LIKE.search(f)]
        if cand:
            hits.append((Path(cur), sorted(files), cand))
    print(f"Walked {folders} folders and {files_seen} files below the root.")
    if errors:
        print("Folders that could not be read:")
        for e in errors[:20]:
            print("  ", e)
    if links:
        print("Links to folders (os.walk does not follow them, so what is behind them is never searched):")
        for l in links[:20]:
            print("  ", l, "->", os.readlink(l))

    print(f"\nFolders with files that look like pose data: {len(hits)}")
    ok = 0
    for folder, files, cand in hits:
        names = {f.lower() for f in files}
        match = [(b, h) for b, h in pairs if b.lower() in names and h.lower() in names]
        rel = folder.relative_to(root)
        why = []
        if not match:
            why.append("no complete pair here")
        if work_dir in folder.parts:
            why.append(f"the path contains the work folder {work_dir!r}")
        if render_dir in rel.parts:
            why.append(f"the path below the root contains {render_dir!r}")
        if match and not why:
            ok += 1
        print(f"  {'OK  ' if match and not why else 'NO  '}{rel or '.'}")
        print(f"        files: {[repr(c) for c in cand][:12]}")
        if match and not why:
            print(f"        counts as a Pose_set (pair {match[0][0]} + {match[0][1]})")
        else:
            print("        does not count: " + "; ".join(why))
            if not match:
                for b, h in pairs:
                    print(f"        needs {b!r} and {h!r}: has {b in files}, {h in files} (exact spelling)")
    print(f"\nResult: {ok} Pose_set(s) found.")
    if not hits:
        print("No file with .npy/.npz or a body/hands/pose name exists below the root. Look at the listing above: is this the right folder?")
        sample = []
        for cur, dirs, files in os.walk(root):
            sample += [os.path.join(cur, f) for f in files]
            if len(sample) >= 15:
                break
        print("First files found:" + ("".join("\n   " + s for s in sample[:15]) or " (none)"))
    return 0


if __name__ == "__main__":
    code = 1
    try:
        code = main()
    except KeyboardInterrupt:
        print("Stopped.")
    if sys.stdin and sys.stdin.isatty():
        try:
            input("\nPress Enter to close this window...")
        except (EOFError, KeyboardInterrupt):
            pass
    sys.exit(code)
