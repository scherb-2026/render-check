#!/usr/bin/env python3
"""Get the videos of a pipeline dataset into the page's data/ folder, converting those a browser can't play.

    python tools/get_videos.py <root>                    copy / convert everything, update data/manifest.json
    python tools/get_videos.py <root> --dry-run          only list what would be copied or converted
    python tools/get_videos.py <root> --filter blue      only Pose_sets whose path contains "blue"
    python tools/get_videos.py <root> --preset fast      quicker conversion, bigger files (--crf 20 = smaller files)

Same layout rules as get_images.py (Pose_set search incl. IGNORE_DIRS, renaming of GoPro-named renders to cameras, one box per
camera), for the video files: originals in <Pose_set>/images/ and <Pose_set>/videos/, renders in <Pose_set>/renders/videos/ (synthetic_<camera>.mp4).

Browsers play H.264 (8-bit, 4:2:0) in MP4 and VP8/VP9/AV1 in WebM. GoPro files are often H.265/HEVC, 10-bit or 4:4:4, and renders can be
ProRes. A video that plays is copied as it is; any other is converted to an H.264 MP4 in data/ (audio dropped: the page is muted),
checked (H.264, 8-bit, same length) and only then put in place. Your files in <root> are never changed, moved or deleted.
With --compress (or COMPRESS_VIDEOS in get_all.py) every video is resized, converted and compressed as set in tools/compression_settings.py
instead, and only re-encoded when it or the settings change. A converted file that is newer than its source is not converted again. Needs ffmpeg and ffprobe on the PATH (Windows:
winget install Gyan.FFmpeg); without them use --no-convert to copy the videos unchecked. Standard library only.
"""
import os
import re
import shutil
import subprocess
import sys
import time

import compress
from import_common import (VIDEO_EXT, begin_kind, check_size, fail, finish_manifest, import_pose_set, load_manifest, manifest_files, mb,
                           parse_args, say, start, sync_file)

KIND = "videos"
ONLY_WITH_RENDERS = True   # True: only the cameras that have a render video are imported (an original alone is left out, and not converted either);
                           # False: every original video is imported too. Command line: --only-rendered / --include-unrendered
# Video codecs a browser plays in each container; with a pixel format in PLAYABLE_PIX the file is left as it is.
PLAYABLE_CODECS = {".mp4": {"h264"}, ".m4v": {"h264"}, ".mov": {"h264"}, ".webm": {"vp8", "vp9", "av1"}, ".ogv": {"theora", "vp8"}}
PLAYABLE_PIX = {"yuv420p", "yuvj420p", "yuva420p"}
PROGRESS_KEYS = {"frame", "fps", "bitrate", "total_size", "out_time", "out_time_us", "out_time_ms", "dup_frames", "drop_frames", "speed", "progress"}


def describe(codec, pix):
    """'hevc', 'yuv420p10le' -> 'H.265/HEVC 10-bit'"""
    names = {"h264": "H.264", "hevc": "H.265/HEVC", "prores": "ProRes", "vp9": "VP9", "vp8": "VP8", "av1": "AV1", "mpeg4": "MPEG-4"}
    bits = re.search(r"p(\d+)(?:le|be)?$", pix or "")
    chroma = "4:4:4" if "444" in (pix or "") else "4:2:2" if "422" in (pix or "") else ""
    return " ".join(x for x in (names.get(codec, (codec or "unknown").upper()), bits and bits.group(1) + "-bit", chroma) if x)


def probe(ffprobe, path):
    """(codec, pixel format, duration in seconds) of the first video stream, or None when ffprobe can't read the file."""
    try:
        r = subprocess.run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt:format=duration",
                            "-of", "default=nw=1", str(path)], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    vals = dict(line.split("=", 1) for line in r.stdout.splitlines() if "=" in line)
    if "codec_name" not in vals:
        return None
    try:
        duration = float(vals.get("duration", 0))
    except ValueError:
        duration = 0.0
    return vals["codec_name"], vals.get("pix_fmt", ""), duration


def playable(path, info):
    return info[0] in PLAYABLE_CODECS.get(path.suffix.lower(), ()) and info[1] in PLAYABLE_PIX


def convert(ffmpeg, src, tmp, duration, vargs):
    """Run ffmpeg (vargs = the options after -i) with a progress line. Returns an error text, or None on success."""
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(src)] + vargs + ["-progress", "pipe:1", "-nostats", str(tmp)]
    started, tail, shown, live = time.time(), [], -1, sys.stdout.isatty()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    try:
        for line in proc.stdout:
            line = line.strip()
            m = re.match(r"out_time_(?:us|ms)=(\d+)", line)
            if m:
                if duration > 0:
                    pct = int(min(99, int(m.group(1)) / 1e6 / duration * 100))
                    if live:
                        print(f"\r    {pct:3d}%  {time.time() - started:.0f} s", end="", flush=True)
                    elif pct // 25 != shown // 25:
                        print(f"    {pct}%", flush=True)
                    shown = pct
            elif line.split("=")[0] not in PROGRESS_KEYS and not line.startswith("stream_"):
                tail.append(line)
        proc.wait()
    except KeyboardInterrupt:
        proc.kill()
        proc.wait()
        raise
    finally:
        if live:
            print("\r" + " " * 30 + "\r", end="", flush=True)
    if proc.returncode != 0 or not tmp.exists():
        return f"ffmpeg exited with code {proc.returncode}: {' | '.join(tail[-4:]) or 'no message'}"
    return None


def plain_args(crf, preset):
    """The options of the normal conversion (no compression settings): H.264 8-bit 4:2:0 in MP4, audio dropped."""
    return ["-map", "0:v:0", "-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(crf), "-preset", preset, "-movflags", "+faststart", "-f", "mp4"]


def main():
    def extra(ap):
        ap.add_argument("--no-convert", action="store_true", help="copy the videos as they are, without checking or converting")
        ap.add_argument("--crf", type=int, default=16, help="H.264 quality of the normal conversion, lower is better (default 16, visually lossless)")
        ap.add_argument("--preset", default="slow", help="ffmpeg preset of the normal conversion (default slow: best compression; fast or medium for a quick look)")

    args = parse_args("Copy the videos of a pipeline dataset into data/, converting those a browser can't play, and update the manifest.", extra)
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    root, pipe, sets, data = start(args, "videos")
    m = load_manifest(data)
    old, keys = begin_kind(m, KIND, sets, bool(args.filter))
    only = ONLY_WITH_RENDERS if args.only_rendered is None else args.only_rendered
    say("Only cameras with a render are imported.\n" if only else "Originals without a render are imported too.\n")
    cs = state = None
    totals = compress.Totals()
    if args.compress:
        if args.no_convert:
            fail("--compress and --no-convert contradict each other.")
        cs = compress.load_settings(args.compression_file)["videos"]
        state = compress.State(data)
        say("Compression on: " + compress.describe("videos", cs) + "\n")
    stats = {"copied": 0, "converted": 0, "failed": 0, "current": 0}
    for leftover in data.rglob(".*.converting.*"):
        leftover.unlink()

    def need_ffmpeg():
        if not (ffmpeg and ffprobe):
            fail("found a video, but ffmpeg / ffprobe is not on the PATH, so it can't be checked or converted. Install ffmpeg (Windows: winget "
                 "install Gyan.FFmpeg), open a new terminal and run this again, or add --no-convert to copy the videos unchecked.")

    def encode(src, dest, info, vargs, codec):
        """ffmpeg src -> dest through a temporary file, verified (codec, 8-bit 4:2:0, same length). True when dest is in place."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_name("." + dest.stem + ".converting" + dest.suffix)
        started = time.time()
        try:
            err = convert(ffmpeg, src, tmp, info[2], vargs)
            new = None if err else probe(ffprobe, tmp)
            if not err and (new is None or new[0] != codec or new[1] != "yuv420p"):
                err = "the converted file did not check out (" + ("unreadable" if new is None else describe(new[0], new[1])) + ")"
            if not err and info[2] > 0 and abs(new[2] - info[2]) > max(0.5, 0.02 * info[2]):
                err = f"the converted file has a different length ({new[2]:.1f} s instead of {info[2]:.1f} s)"
            if err:
                say(f"    FAILED: {err}. Skipped; {src.name} was not touched.")
                stats["failed"] += 1
                return False
            os.replace(tmp, dest)
        except KeyboardInterrupt:
            say("\nStopped. Videos already converted stay converted; run the script again to continue.")
            sys.exit(130)
        finally:
            if tmp.exists():
                tmp.unlink()
        stats["converted"] += 1
        say(f"    done in {time.time() - started:.0f} s ({mb(src.stat().st_size)} -> {mb(dest.stat().st_size)})")
        check_size(dest, data)
        return True

    def put(src, stem):
        if cs and compress.applies(cs, stem):
            need_ffmpeg()
            ext = compress.video_ext(src, cs)
            rel, dest = stem + ext, data / (stem + ext)
            sig = compress.signature(src, cs)
            if state.current(rel, sig):
                stats["current"] += 1
                return rel
            info = probe(ffprobe, src)
            if info is None:
                say(f"  ! {src.name}: ffprobe can't read this file (damaged or not a video); skipped")
                stats["failed"] += 1
                return None
            say(f"  compress {src.name}  ({describe(info[0], info[1])}, {mb(src.stat().st_size)}) -> {ext[1:]}")
            if args.dry_run:
                return rel
            if not encode(src, dest, info, compress.video_args(ext, cs), compress.expected_codec(ext)):
                return None
            state.set(rel, sig)
            totals.add(src, dest)
            return rel
        if not (ffmpeg and ffprobe) and not args.no_convert:
            need_ffmpeg()
        info = None if args.no_convert else probe(ffprobe, src)
        if not args.no_convert and info is None:
            say(f"  ! {src.name}: ffprobe can't read this file (damaged or not a video); skipped")
            stats["failed"] += 1
            return None
        if args.no_convert or playable(src, info):
            rel = stem + src.suffix.lower()
            if not args.dry_run and sync_file(src, data / rel):
                stats["copied"] += 1
                check_size(data / rel, data)
            return rel
        rel = stem + ".mp4"
        dest = data / rel
        if dest.exists() and dest.stat().st_size > 0 and dest.stat().st_mtime >= src.stat().st_mtime:
            stats["current"] += 1
            return rel
        say(f"  convert {src.name}  ({describe(info[0], info[1])}, {mb(src.stat().st_size)}) -> H.264 8-bit")
        if args.dry_run:
            return rel
        return rel if encode(src, dest, info, plain_args(args.crf, args.preset), "h264") else None

    for pose in sets:
        import_pose_set(pose, pipe, KIND, VIDEO_EXT, put, m, only)
    say(f"\nvideo import: {stats['converted']} converted, {stats['copied']} copied, {stats['current']} already converted"
        + (f", {stats['failed']} failed or skipped" if stats["failed"] else "") + ".")
    if totals.line("video(s)"):
        say(totals.line("video(s)"))
    finish_manifest(data, m, KIND, old, manifest_files(m, KIND), args.dry_run, keys)
    if state and not args.dry_run:
        state.save()


if __name__ == "__main__":
    main()
