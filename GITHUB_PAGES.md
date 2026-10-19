# Putting Render check on GitHub Pages

This gets the page online at `https://<your-name>.github.io/<repository>/`. It takes about ten minutes, and after that every push updates the site.

## Before you start

- **A free GitHub Pages site is public.** Anyone with the link can see every photo, video and render in `rooms/`. Private sites need a paid GitHub plan. If the footage is sensitive, do not publish it this way.
- **Size limits.** GitHub refuses single files over 100 MB, and a Pages site should stay under about 1 GB. Compress large videos and 4K EXRs first (the README shows the ffmpeg command for videos). Git LFS files are not served by Pages.
- **You need** a GitHub account and either [Git](https://git-scm.com/downloads) or [GitHub Desktop](https://desktop.github.com/).

## 1. Create the repository

1. On github.com choose **New repository**.
2. Name it, for example `render-check`. Keep it **Public**. Leave "Add a README" and the other options off, so it starts empty.
3. Click **Create repository** and keep the page open.

## 2. Put the project in it

Unzip `render-check.zip`. The folder must contain `index.html`, `css`, `js`, `rooms` and the hidden `.github` folder. The workflow lives in `.github`, so make sure it came along.

**With Git** (open a terminal in the unzipped `render-check` folder; replace the address with the one GitHub shows you):

    git init -b main
    git add .
    git commit -m "Render check"
    git remote add origin https://github.com/<your-name>/<repository>.git
    git push -u origin main

**With GitHub Desktop:** File → Add local repository → choose the folder (let it create the repository if asked), commit all files, then **Publish repository** and untick "Keep this code private".

Do not drag the folder into the browser upload on github.com: it limits uploads to 25 MB per file and may skip the hidden `.github` folder.

## 3. Turn on Pages

1. In the repository open **Settings → Pages**.
2. Under **Build and deployment → Source** choose **GitHub Actions**.

That is all. There is nothing to pick for the branch or folder.

## 4. Watch the first deploy

1. Open the **Actions** tab. The run "Deploy to GitHub Pages" starts by itself after the push. If it doesn't, open it and press **Run workflow**.
2. Wait for the green tick (about a minute). The step "Write the room manifest" lists every room it found.
3. Open `https://<your-name>.github.io/<repository>/`. The link is also shown at the end of the run and under Settings → Pages.

## Adding or changing rooms later

Put the new folder in `rooms/` (a room, or a dataset folder holding rooms; see the README for the layout and naming). If it has videos, first run `python tools/prepare-videos.py` on your computer and look at the result in the page it starts (this converts what browsers can't play and keeps your originals in `video-originals/`, which is never pushed). Then commit and push. The workflow rebuilds the room list by itself, so you never edit or commit `manifest.json`. A room can take a minute to appear, and you may need a hard refresh (Ctrl+F5) because browsers keep old files.

With GitHub Desktop: commit, then **Push origin**. With Git:

    git add .
    git commit -m "Add kitchen"
    git push

## If something goes wrong

| What you see | Likely cause and fix |
| --- | --- |
| The Actions tab is empty, or no run starts | The `.github` folder wasn't pushed (hidden folders are easy to lose when zipping or uploading). Check that `.github/workflows/pages.yml` is in the repository on github.com. |
| The run fails at "Configure Pages" or "Deploy" | Settings → Pages → Source is not set to **GitHub Actions** (step 3). Set it and re-run the workflow. |
| The push is rejected for a large file | A file is over 100 MB. Compress it, remove it from the commit (`git rm --cached <file>`, then commit again) and push. |
| Page says "Couldn’t read the rooms folder" | The deploy didn't finish, or you opened the repository page instead of the Pages address. Check the Actions run, and open the `github.io` link. |
| "No comparisons found" or "folders were skipped" | The page lists each skipped folder with the reason: usually a folder with no image or video that the page can show (for example only TIFF files), or files nested one folder too deep. |
| A new room doesn't show up | Wait for the run to finish, then hard refresh. |
| An EXR says it can't be read | It uses B44 or DWAA compression or is tiled. Save it from Blender with Codec → ZIP. |
| A video won't play | It is probably H.265 or 10-bit. The box shows the ffmpeg command that fixes it. |
| Files work locally but not online | Pages treats `Render.PNG` and `render.png` as different files. Keep the capitalisation the same everywhere. |

## Taking it down

Settings → Pages has no off switch with the Actions source; instead make the repository private (paid plans) or delete the repository. Deleting the files in a later commit does not remove them from the history, so for something sensitive delete the repository.
