# Job files in the web app

How a job finds its photos, screenshots and uploaded pages, for every user, without anyone having to keep files in a set
place (user, 2026-10-31: no rules about where people store their files; a job-folder layout was proposed and turned down,
and so was copying files into one folder, for the space it takes). In the future the app becomes an installed desktop
app, where none of this is a problem (see "Future: the desktop app" at the end); the web fixes here keep the web version
working until then and alongside it.

## Why files go missing in a browser

The job file (.axb) keeps only file names (S1.jpg, cover.jpg). The files stay where the user keeps them. A web app reads a
file only through a *handle* the user gave it by picking the file or its folder, and:

1. Handles are kept by the browser, per browser and per web address, not in the job. Another computer, another browser or
   profile, cleared site data, or the same app at another address (a local test port, a preview site) has none.
2. After a job is reopened, Chrome and Edge ask once more before a remembered folder or file can be read: once per folder
   and once per file picked on its own.
3. Files can be anywhere on the disk, and a folder can be moved or renamed.

## Built (2026-10-31, branch feature/report-r4)

1. **Restore files** (`ui/RestoreFilesBar.tsx`): a bar under the top bar, in the drawing and the report, while anything the
   job uses waits for the browser's OK. One click asks for all of it; any the browser refuses or will not ask about from that
   click stay for the next click. Choosing "Allow on every visit" where Chrome offers it (more often for an installed app)
   should stop the question for good (to be confirmed on the user's PC).
2. **Find files...** (`findFiles` in `state/restore.ts`): when files are not found in this browser (nothing remembered, a
   folder moved, another PC), the bar offers Find files. The user picks any folder; it and its subfolders (6 levels, at most
   5,000 folders; system folders such as AppData and $Recycle.Bin skipped) are searched by name, case ignored. A group read
   from a folder (drawing photos, report photos, screenshots) takes the folder holding most of its files, unless its own
   folder already holds as many; single files (cover photo, calibration screenshot, uploads, report photos found elsewhere)
   are remembered one by one. What is still not found is listed.
3. **Job files** (`ui/JobFilesPanel.tsx`, on the drawing's and the report's Export steps): every group of files the job uses
   (`jobFiles`): scan photos, report photos and pictures, data-page screenshots, cover photo, calibration screenshot,
   uploaded pages, job folder; where each is in this browser, and Found / Waiting for the browser's OK / x of y found, not
   found: names / Not chosen yet. Restore files, Find files..., Choose / Change folder per folder group, Go to where the
   files are chosen. A per-file button is only needed for a file that is really missing.
4. Folders are also remembered by job name and as the last one used (`recallFolderFor`), so a job back under a new id (the
   Excel workbook imported again) finds its folders.

## Planned: working copies kept by the app (step 3 of the web plan)

Goal: in the browser where a job was worked on, its pictures always show, after any reopen or restore, with no question
and no restore, and the report PDF can always be made.

- **What is kept.** When a photo or picture is linked or first read, the app keeps a copy in the browser's private
  storage (Origin Private File System), shrunk to what is shown and printed: drawing photos at the size the preview and the
  drawing PDF / report images need, report pictures at 300 dpi of their largest printed size (as `preparePictures` does),
  uploaded PDFs as they are. Roughly 0.3-1 MB per photo; a 150-scan job with 30 report pictures about 50-180 MB.
- **Keyed by** job id + file name + the original's size and modified time, so a changed original is copied again.
- **Reading order:** the original when it can be read without asking; else the working copy; else missing (Find files).
  The full-size originals are still needed for the processed images that go with the .lsp and DXF (CAD inserts them);
  those ask once, as now.
- **Space.** Chrome and Edge allow a site up to about 60% of the disk; the app asks for persistent storage
  (`navigator.storage.persist()`, usually granted to an installed app) so Chrome does not clear it when the disk runs low.
  The Job files panel shows the space used by this job and all jobs, "Free up space" per job, and copies of jobs not
  opened for a set time (e.g. 90 days) are removed. Private / Incognito windows keep nothing after closing.
- **What it does not fix.** Another browser or PC starts empty (one Find files there). Cleared site data removes the
  copies (the originals are never touched).
- **Tests.** Copy sizes against the printed sizes; reading order (original, copy, missing); a changed original copied
  again; Free up space; the quota and persist calls faked.
- **Open questions for the user:** keep copies for every job or only when turned on per job; how long unused copies are
  kept; whether drawing photos are kept too or only the report's pictures.

## Later

- **Save job with photos** (optional): one bigger job file holding the working copies, for handing a job to a colleague
  or another PC. Only when asked; normal saves stay small.
- **One web address** once hosted: everyone uses the hosted address; test addresses keep their own memory of files.

## Future: the desktop app (user, 2026-10-31)

AxisBuilder becomes an installed Windows program, downloaded from the website, where files are no problem at all.

- **What it is.** The same app (React, the engine, every screen) inside a small desktop shell. Suggested: Tauri, which uses
  the Edge engine already in Windows 11 (installer about 10 MB, estimate); Electron is the alternative (bundles its own
  Chrome, about 100 MB). Only the file layer changes: all reading and writing goes through one interface, with a browser
  version (today's code) and a desktop version (real file paths).
- **What it fixes.** Jobs keep real file paths (as the Excel version did), relative to the .axb where the files are below
  its folder, so photos are there every time a job opens: no permission questions, no Restore files, no per-browser or
  per-address memory. Double-click an .axb to open it; exports, the .lsp, the DXF and Processed_Images are written
  without asking; fully offline.
- **What stays.** Opening a job on another PC where the files sit at other paths: Find files relinks them in one go (the
  same search as the web version). The web version stays for viewing and for PCs where installing is not allowed; the
  Restore files bar, Find files and Job files stay there.
- **Distribution.** "Download AxisBuilder for Windows" on the website; automatic updates from the website.
- **Before building, to settle:** whether installing is allowed on Integrity EPC PCs (IT approval); a code-signing
  certificate from a recognised authority (without one Windows shows "Windows protected your PC"; roughly a few hundred
  dollars a year, estimate; the current .cer signs the Excel macros only); Windows only or Mac too.
- **Build steps.** (1) One file interface in the app, browser version = today (no change for users). (2) The desktop
  version with real paths, relative paths in the job file, Find files on the desktop. (3) Installer, signing, automatic
  updates, the download page. (4) Check on real jobs: open, reopen, move a job folder, another PC.
- **The working copies** (planned above) are web-only; once the desktop app exists they matter only for the web version.
