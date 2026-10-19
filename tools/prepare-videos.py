#!/usr/bin/env python3
"""Prepare the videos in rooms/ for Render check, then start the page.

Browsers only play H.264 (8-bit, 4:2:0) in MP4, and VP8/VP9/AV1 in WebM. GoPro and phone footage is often H.265/HEVC, 10-bit or
4:4:4, and renders can come out as ProRes. This script finds every video in rooms/ that a browser can't play and converts it to a
browser-friendly H.264 MP4 (audio is dropped: the page plays muted). Videos that already play are not touched, so running it
again only does new work.

For each video that gets converted:
  1. the converted file is written next to it (name.mp4; a .mov becomes .mov -> .mp4, the same name otherwise),
  2. checked (H.264, 8-bit, same length as the source),
  3. and only then swapped in: your original is MOVED to video-originals/ (same folder layout as rooms/), never deleted.

Last, it starts the page with `python -m http.server 8080` so you can look at the result straight away.

    python tools/prepare-videos.py                 convert, then serve on http://localhost:8080
    python tools/prepare-videos.py --dry-run       only list what would be converted
    python tools/prepare-videos.py --no-serve      convert and stop (e.g. before committing for GitHub Pages)
    python tools/prepare-videos.py --port 9000     serve on another port

Needs Python 3.8 or newer and ffmpeg + ffprobe on the PATH (Windows: winget install Gyan.FFmpeg). Standard library only.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Keep in step with VIDEO_RE in js/core/config.js
VIDEO_EXT = ('.mp4', '.m4v', '.webm', '.mov', '.ogv')
# Video codecs a browser plays in each container. With a pixel format in PLAYABLE_PIX the file is left alone.
PLAYABLE_CODECS = {'.mp4': {'h264'}, '.m4v': {'h264'}, '.mov': {'h264'}, '.webm': {'vp8', 'vp9', 'av1'}, '.ogv': {'theora', 'vp8'}}
PLAYABLE_PIX = {'yuv420p', 'yuvj420p', 'yuva420p'}
PROGRESS_KEYS = {'frame', 'fps', 'bitrate', 'total_size', 'out_time', 'out_time_us', 'out_time_ms', 'dup_frames', 'drop_frames', 'speed', 'progress'}


def describe(codec, pix):
    """'hevc', 'yuv420p10le' -> 'H.265/HEVC 10-bit'"""
    names = {'h264': 'H.264', 'hevc': 'H.265/HEVC', 'prores': 'ProRes', 'vp9': 'VP9', 'vp8': 'VP8', 'av1': 'AV1', 'mpeg4': 'MPEG-4'}
    bits = re.search(r'p(\d+)(?:le|be)?$', pix or '')
    chroma = '4:4:4' if '444' in (pix or '') else '4:2:2' if '422' in (pix or '') else ''
    return ' '.join(x for x in (names.get(codec, (codec or 'unknown').upper()), bits and bits.group(1) + '-bit', chroma) if x)


def probe(ffprobe, path):
    """(codec, pixel format, duration in seconds) of the first video stream, or None when ffprobe can't read the file."""
    try:
        r = subprocess.run([ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt:format=duration',
                            '-of', 'default=nw=1', path], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    vals = dict(line.split('=', 1) for line in r.stdout.splitlines() if '=' in line)
    if 'codec_name' not in vals:
        return None
    try:
        duration = float(vals.get('duration', 0))
    except ValueError:
        duration = 0.0
    return vals['codec_name'], vals.get('pix_fmt', ''), duration


def playable(path, info):
    codec, pix, _ = info
    return codec in PLAYABLE_CODECS.get(os.path.splitext(path)[1].lower(), ()) and pix in PLAYABLE_PIX


def find_videos(rooms):
    for folder, dirs, files in os.walk(rooms):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for name in sorted(files):
            if name.lower().endswith(VIDEO_EXT) and not name.startswith('.'):
                yield os.path.join(folder, name)


def mb(n):
    return '{:.1f} MB'.format(n / 1048576)


def unique(path):
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    i = 1
    while os.path.exists('{}.{}{}'.format(base, i, ext)):
        i += 1
    return '{}.{}{}'.format(base, i, ext)


def convert(ffmpeg, src, tmp, duration, args):
    """Run ffmpeg, showing progress. Returns an error text, or None on success."""
    cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', src,
           '-map', '0:v:0', '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', str(args.crf), '-preset', args.preset, '-movflags', '+faststart', '-f', 'mp4',
           '-progress', 'pipe:1', '-nostats', tmp]
    started = time.time()
    tail, shown = [], -1
    live = sys.stdout.isatty()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace')
    try:
        for line in proc.stdout:
            line = line.strip()
            m = re.match(r'out_time_(?:us|ms)=(\d+)', line)
            if m:
                if duration > 0:
                    pct = int(min(99, int(m.group(1)) / 1e6 / duration * 100))
                    if live:
                        print('\r    {:3d}%  {:.0f} s'.format(pct, time.time() - started), end='', flush=True)
                    elif pct // 25 != shown // 25:
                        print('    {}%'.format(pct), flush=True)
                    shown = pct
            elif line.split('=')[0] not in PROGRESS_KEYS and not line.startswith('stream_'):
                tail.append(line)                 # anything else is an error message
        proc.wait()
    except KeyboardInterrupt:
        proc.kill()
        proc.wait()
        raise
    finally:
        if live:
            print('\r' + ' ' * 30 + '\r', end='', flush=True)
    if proc.returncode != 0 or not os.path.exists(tmp):
        return 'ffmpeg exited with code {}: {}'.format(proc.returncode, ' | '.join(tail[-4:]) or 'no message')
    return None


def main():
    ap = argparse.ArgumentParser(description='Make every video in rooms/ playable in a browser, then serve the page.')
    ap.add_argument('--dry-run', action='store_true', help='only list what would be converted; change nothing, start nothing')
    ap.add_argument('--no-serve', action='store_true', help='do not start the page afterwards')
    ap.add_argument('--port', type=int, default=8080, help='port for the page (default 8080)')
    ap.add_argument('--originals', default=os.path.join(ROOT, 'video-originals'), help='where replaced originals are moved (default: video-originals/ in the project)')
    ap.add_argument('--crf', type=int, default=16, help='H.264 quality, lower is better (default 16, visually lossless)')
    ap.add_argument('--preset', default='slow', help='ffmpeg speed/size preset (default slow: the best compression, but slow; use fast or medium for a quick look)')
    args = ap.parse_args()

    rooms = os.path.join(ROOT, 'rooms')
    if not os.path.isdir(rooms):
        sys.exit('No rooms folder found at {}'.format(rooms))
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')

    failed = converted = 0
    if not (ffmpeg and ffprobe):
        print('ffmpeg/ffprobe not found on the PATH, so no videos can be checked or converted.')
        print('Install ffmpeg (Windows: winget install Gyan.FFmpeg), open a new terminal and run this again.\n')
    else:
        videos = list(find_videos(rooms))
        todo, unreadable, fine = [], [], 0
        for p in videos:
            info = probe(ffprobe, p)
            if info is None:
                unreadable.append(p)
            elif playable(p, info):
                fine += 1
            else:
                todo.append((p, info))
        rel = lambda p: os.path.relpath(p, ROOT).replace(os.sep, '/')
        print('{} video{} in rooms/: {} play in a browser already, {} need converting{}.'.format(
            len(videos), '' if len(videos) == 1 else 's', fine, len(todo), ', {} unreadable'.format(len(unreadable)) if unreadable else ''))
        for p in unreadable:
            print('  ! {}: ffprobe can\'t read this file (damaged or not a video); left as it is'.format(rel(p)))
        for p, (codec, pix, _) in todo:
            print('  - {}  ({}, {})'.format(rel(p), describe(codec, pix), mb(os.path.getsize(p))))
        if args.dry_run:
            print('\nDry run: nothing was changed.')
            return

        for folder, dirs, files in os.walk(rooms):                      # leftovers of an interrupted run
            for name in files:
                if name.startswith('.') and name.endswith('.converting.mp4'):
                    os.remove(os.path.join(folder, name))

        for n, (src, (codec, pix, duration)) in enumerate(todo, 1):
            folder, name = os.path.split(src)
            stem = os.path.splitext(name)[0]
            final = os.path.join(folder, stem + '.mp4')
            print('\n[{}/{}] {}  ({} -> H.264 8-bit)'.format(n, len(todo), rel(src), describe(codec, pix)))
            if os.path.exists(final) and os.path.normcase(final) != os.path.normcase(src):
                print('    skipped: {} already exists in this folder. Rename or move one of the two and run again.'.format(os.path.basename(final)))
                failed += 1
                continue
            tmp = os.path.join(folder, '.' + stem + '.converting.mp4')
            started = time.time()
            try:
                err = convert(ffmpeg, src, tmp, duration, args)
                new = None if err else probe(ffprobe, tmp)
                if not err and (new is None or new[0] != 'h264' or new[1] != 'yuv420p'):
                    err = 'the converted file did not check out (' + ('unreadable' if new is None else describe(new[0], new[1])) + ')'
                if not err and duration > 0 and abs(new[2] - duration) > max(0.5, 0.02 * duration):
                    err = 'the converted file has a different length ({:.1f} s instead of {:.1f} s)'.format(new[2], duration)
                if err:
                    print('    FAILED: {}. Your file was not touched.'.format(err))
                    failed += 1
                    continue
                backup = unique(os.path.join(args.originals, os.path.relpath(src, ROOT)))
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                shutil.move(src, backup)
                os.replace(tmp, final)
            except KeyboardInterrupt:
                print('\nStopped. Videos already converted stay converted; run the script again to continue.')
                sys.exit(130)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            converted += 1
            print('    done in {:.0f} s: {}  ({} -> {}); original moved to {}'.format(
                time.time() - started, rel(final), mb(os.path.getsize(backup)), mb(os.path.getsize(final)), rel(backup)))

        if todo:
            print('\nConverted {}{}. Replaced originals are in {} (delete that folder when you no longer need them).'.format(
                converted, ', {} failed or skipped'.format(failed) if failed else '', os.path.relpath(args.originals, ROOT).replace(os.sep, '/') + '/'))

    if args.no_serve:
        return
    print('\nStarting the page at http://localhost:{}/   (stop with Ctrl+C)\n'.format(args.port))
    try:
        subprocess.run([sys.executable, '-m', 'http.server', str(args.port), '--bind', '127.0.0.1'], cwd=ROOT)
    except KeyboardInterrupt:
        print('\nStopped.')


if __name__ == '__main__':
    main()
