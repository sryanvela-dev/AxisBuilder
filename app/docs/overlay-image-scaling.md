# Overlay image scaling

How scan photos are fitted into their scan rectangles in the drawing: what v5.0 does today, and what
the web app will do instead (decided with the user, 2026-10-22). Read this before building the image
step or the image part of the LISP export.

## v5.0 (the tested baseline)

Source: `src/SLG_Utilities.bas`, `ProcessOverlayImages`, `ResizePngToFit` and the LISP routine
`SL_InsertFitImage` written by `WriteOverlayLispFunctions`.

1. **Stretch to the scan's shape.** Each photo is resized, without keeping its aspect ratio, to
   `scan width x Overlay Pixels Per Inch` by `scan height x Overlay Pixels Per Inch` pixels
   (40 px/in, at least 100 px each way), using Windows WIA, with a hidden PowerShell fallback.
   Example: a 23 x 10 in scan becomes 920 x 400 px. Only the resulting width:height matters for the
   fit; the 40 only sets resolution.
2. **Insert at the scan's width.**
   - DraftSight: `EDITIMAGE Attach img <insert point> <scale = scan width w> <rotation>`. The
     attach scale is the image width in drawing units, so the height lands at the scan height h.
   - AutoCAD: `-IMAGE Attach` at scale 1, measure the bounding box, `SCALE` by `w / measured
     width` (height when rotated), then `MOVE` the lower-left corner to the target point.
3. **Place and rotate for the orientation** (scan lower-left x, y in logical coordinates):

   | Orientation | DraftSight insert point | AutoCAD target | Rotation |
   |---|---|---|---|
   | Vertical | (x, y) | (x, y) | 0 |
   | Horizontal CW | (y, -x) | (y, -(x + w)) | -90 |
   | Horizontal CCW | (-y, x) | (-(y + h), x) | 90 |

4. No preprocess rotation (`Overlay Preprocess Rotation` = NONE is the tested baseline; CAD does
   the rotating). `IMAGEFRAME` follows Show Scan Borders On Overlay.

Not used for placement: `SL_OVERLAY_SCALE` (= "DraftSight Image Pixels Per Unit" 400 / PPI 40 = 10)
and `SL_OVERLAY_PPI` are written to the .lsp but never read. The 400 only sets the PNG's DPI tag in
the PowerShell fallback. "Overlay Scale Method" is a text note (not imported by the app).

## Web app (built in Phase 3d; CAD check still to do)

The photos are only the scan area (no borders, color scales or toolbars), so no cropping is needed.

1. **Keep the photo's own detail.** Never shrink it to a fixed 40 px/in.
2. **Correct only the shape.** Stretch one direction (never shrink the other) so the image's
   width:height equals the scan's w:h exactly. Cap the size (setting "Largest processed image side",
   default 4096 px, see below): above it both directions are scaled down together, so the shape stays
   exact. Resize in the browser (no WIA or PowerShell).
3. **Insert exactly as v5.0 does:** steps 2-4 above unchanged (attach at scan width, same insert
   points, rotations and IMAGEFRAME handling).
4. **Drop "DraftSight Image Pixels Per Unit" from the fit**, since placement never depended on it.

### How it is built (Phase 3d)

- `src/export/images/fit.ts` (`fitSize`): the size rule above. The side not given exactly is rounded
  to the nearest pixel, so |width - height x scan w/h| <= 0.5 px. Tested for 70 photo/scan shapes, with
  and without the cap.
- `fitWorker.ts` (a Web Worker): decodes the photo, draws it stretched onto an OffscreenCanvas
  (smoothing "high") and returns a PNG. `process.ts`: which scans get an image and why the others
  don't, the folder check, the run (progress, cancel, summary).
- Output: `<job folder>Processed_Images<scan>_FIT.png` with the names the app's .lsp uses
  (`processedImageNames`, e.g. "SCAN 1" -> SCAN_1_FIT.png), plus `AXISBUILDER_JOB.txt` (job ID, job
  name, date, image count) so a folder of another job is never written into, and CAD can check it (3f).
- Photos with the shape of their scan already are copied at their own size (as PNG).

### Size cap: the numbers (2026-10-23)

Pixel sizes read from the photos of the four reference jobs (222 photos; nothing copied): all are
screen captures 1341-1915 px wide and 442-958 px high (about 2:1). Their 111 scans with a photo have
width:height from 0.79 to 14.1, so shape-only scaling stretches a lot: uncapped, the long side would
be 3445 px for half of them, 6500 px for 90 % and up to 10834 px.

| Cap (long side) | Scans scaled down | Average image | 150 images in memory (RGB) |
|---|---|---|---|
| none | 0 of 111 | 3.71 MP | about 1.7 GB |
| 5000 | 28 | 2.99 MP | about 1.35 GB |
| **4096 (default)** | 50 | 2.65 MP | about 1.2 GB |
| 3000 | 68 | 1.99 MP | about 0.9 GB |
| 2048 | 80 | 1.33 MP | about 0.6 GB |
| v5.0 (40 px/in) | - | 2.39 MP | about 1.1 GB |

4096 keeps the photo's full detail in both directions for 55 % of the scans and gives about the same
total load as v5.0's 40 px/in, which already works in CAD on these jobs. If DraftSight or AutoCAD feel
slow on a big job, 3000 is lighter than v5.0. The setting is on the Images step (Advanced).

### When images are processed (decided by the user, 2026-10-23)

- The Images step keeps its **Process images** button (make and check them early).
- In Phase 3f, **Make CAD drawing** writes the .lsp and, in the same go, processes every image that is missing
  or out of date (photo or scan size changed since it was made) into the same job folder. Images that are up to
  date are left as they are. The same safety rules apply (marker file, ask before replacing, stop on another job).

## Verification before it replaces the v5.0 way

- Automatic test: every processed image has exactly its scan's width:height (to the pixel). Done:
  `app/test/export/images.test.ts`.
- A real job generated by v5.0 and by the app, opened in DraftSight and in AutoCAD, in all three
  orientations: every photo must sit exactly in its scan rectangle, and look the same or sharper
  when zoomed in. The user confirms before the v5.0 method is retired.

## Image paths

Where the `.lsp` finds the processed images. v5.0 writes each image's full Windows path
(`"C:/.../Processed_Images/S1_FIT_B12.png"`). A browser can't know that path, so the app must not need it.

### CAD test (Phase 3a, 2026-10-22)

Kit from `npm run imagepath:test` (`app/scripts/make-image-path-test.ts`), run by the user in DraftSight
and AutoCAD. Methods: C1 relative path `Processed_Images/...`, C2 drawing folder (`DWGPREFIX`) +
`Processed_Images/...`, C3 folder of the `.lsp` found with `findfile`, A one `getfiled` pick in
Processed_Images, then the other images built from that folder.

| Scenario | DraftSight | AutoCAD |
|---|---|---|
| New, unsaved drawing | C1, C2, C3 fail; A works. The failed relative attach also showed an "images not found" dialog | C1, C2, C3 fail; A works |
| Drawing saved in the job folder first | C1, C2, C3, A all work | C1, C2, C3, A all work |
| Save, close, reopen | Every attached image stays | Every attached image stays |
| Folder copied elsewhere, original renamed | All images lost: it stores full paths (like v5.0 today) | All images kept: it stores `.\Processed_Images\...` relative paths |

### Decision (user, 2026-10-22)

- **No full Windows path in the app's `.lsp`, and no installed program needed.** The web app is enough.
- The generated LISP finds the image folder in this order:
  1. the drawing folder (`DWGPREFIX`) + `Processed_Images`, if the drawing is saved and the files are there;
  2. `findfile`;
  3. one `getfiled` pick of any image in Processed_Images; every image is then taken from that folder.
- Always check the file exists (`findfile`) before attaching, so CAD never shows a "not found" dialog.
- The Export screen's CAD steps suggest saving the new drawing into the job folder before running
  `AXISBUILDER`, so step 1 works without a click.
- `compat: 'v5.0'` mode keeps v5.0's full paths unchanged (golden tests).
- Known limit: DraftSight still stores full paths in the saved drawing, so a DraftSight drawing whose job
  folder is moved loses its images (same as v5.0 today). AutoCAD drawings keep them.
