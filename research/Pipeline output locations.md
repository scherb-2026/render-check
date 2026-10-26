# Where renders are saved

Valid for the current settings (`TOOLKIT_DIRECT_OUTPUT = True`, `TOOLKIT_WRITE_CAMERA_PARAMS = False`, `RENDER_SUBDIR = "renders"`, `SINGLE_FRAME_AS_STILL = True`) and Camera Dataset Toolkit 1.10.0.

`<P>` = `<root>/<camera folder>/<colour folder>/<Pose_set>`, `<R>` = `<P>/renders`.

| What | Where | Notes |
|---|---|---|
| Single images (pose with 1 frame) | `<R>/single_frames/synthetic_<camera>_0000.<ext>` | one per camera; a `.png` copy sits next to it when the scene format is not PNG; no video |
| Frame sequences (pose with more than 1 frame) | `<R>/images/synthetic_<camera>/synthetic_<camera>_<NNNN>.<ext>` | numbering starts at 0000 (`frame_start = 0`); `<ext>` comes from the .blend render settings / preset |
| Videos | `<R>/videos/synthetic_<camera>.mp4` | only built when the .blend has Auto-render Video on (toolkit default: off); see below |
| Toolkit logs | `<R>/render_run.log`, `<R>/video_run.log`, `<R>/synthetic_render_log.json`; stills: `<R>/single_frames/render_single_frame.log` | |
| Finished marker | `<R>/render_complete.json` | written by the launcher; skips the Pose_set next time |
| Pipeline work files | `<P>/_pipeline/pipeline.log`, `job.json`, `camera_gen_config_used.json`, `frames.json` | full Blender output is in `pipeline.log` |
| Colour-check stills | `<root>/_color_test/<camera folder>__<colour folder>.png` | `--test-render` / `--test-minimal` only |
| Not written | `<R>/extrinsics/`, `<R>/intrinsics/` | `TOOLKIT_WRITE_CAMERA_PARAMS = False` |

## Videos

The launcher does not pass `--auto-video` for sequences (only `--no-auto-video` for stills), so the toolkit uses the Auto-render Video setting stored in the .blend (Scene > Camera Dataset Toolkit). With `RENDER_MODE = "render"` a video is built only when that is on. `--render-mode resume` and `all` build videos in any case. Whether the setting is on in your .blend is not visible from the archive.

## Replacing and cleaning

- A new render first deletes the previous toolkit output in `<R>` (`images/`, `videos/`, the logs above, `single_frames/synthetic_*`); `resume` never deletes.
- Older timestamped folders (`<R>/synthetic_<date>_<time>/`, `<R>/single_frames/<date>_<time>_frame_<N>/`) stay until `scripts/cleanup_timed_renders.py --delete` removes them.
