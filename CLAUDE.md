# AxisBuilder – notes for Claude

AxisBuilder (formerly "Scan Layout Generator") is an Excel/VBA workbook that turns
inspection field data and AUT scan coordinates into an AutoLISP (.lsp) file. Loading that file
in DraftSight or AutoCAD draws the AUT coverage layout for a pressure vessel or tank shell.
The owner is an Integrity EPC inspection engineer who uses it in the field.

## Folder layout
- `src/*.bas` – **master copy of all VBA code** (9 standard modules). Edit only these.
- `AxisBuilder_v5.0_Stable.xlsm` – the signed, working workbook. **Never modify it.** Claude
  cannot safely write VBA into it; the user re-imports changed modules in the VBA editor.
- `AxisBuilder - Sean Vela.cer`, `Read Me.txt` – code-signing certificate and install steps. Don't touch.
- `Scan Layout Generator Field Form.pdf/.xlsx` – the paper field form (also embedded in the
  workbook as 4 hidden sheets). Page 1 = project/vessel/welds/MUT, page 2 = shell sketch
  (ignored by OCR), page 3 = objects and nozzles, page 4 = heads.
- `Head Clock.png` – head clock-position reference graphic.
- `app/` – the new web app (in development). See "Web app (/app)" below.

## Rules for editing src
1. **Encoding: Windows-1252 (cp1252) with CRLF line endings.** The VBA editor imports .bas files
   as cp1252. Saving as UTF-8 garbles every non-ASCII character on import.
   - Don't add non-ASCII characters. For the degree sign use `ChrW(176)` in code.
   - The old C2 B0 ("Â°") bytes in `SLG_Utilities.bas` were replaced with `ChrW(176)` (issue #4).
     The only non-ASCII byte left is a "×" in a comment (~line 4992); leave it alone.
   - After editing, verify the changed files are still cp1252 + CRLF and that only the
     intended lines changed (diff against the previous version).
2. Keep the first line `Attribute VB_Name = "<ModuleName>"` intact. It's required for import.
3. Keep `Option Explicit`. Declare every variable. VBA has no compiler here, so check
   carefully for typos, missing `End If`/`Next`, and wrong Sub/Function names. The user
   compiles in Excel (Debug > Compile).
4. Make small, targeted changes. Don't reformat or reorganize code you weren't asked to touch.
5. When done, tell the user **which modules changed** so they can re-import just those
   (VBA editor: Remove module > File > Import File), then compile and save. On the user's PC
   (where the signing certificate's private key is installed) Office re-signs automatically on save,
   so no manual step is needed; confirm under Tools > Digital Signature if in doubt. Manual
   re-signing is only needed after editing on a PC without that key (the save drops the
   signature there) or when switching certificates.
6. Add a line to the Change log at the bottom of this file for each fix.

## Modules
| Module | Purpose |
|---|---|
| SLG_Utilities | Core generator (~5,900 lines). `ExportAxisBuilderLSP` (Home "Generate CAD Drawing": image preprocessing + master .lsp), `ExportScanLayoutLSP` (older geometry-only layout), validation, right-panel layout math, all emitted LISP, project status dashboard |
| SLG_OCR_Importer | Copy OCR Prompt / Import OCR Data (clipboard via Win32 API, `[SECTION] KEY=a\|b\|c` format, REVIEW cells yellow-filled) |
| SLG_ImportAUT | Import AUT CSV (header-mapped, max 150 scans, skips "cal", blocks duplicates) |
| SLG_ScanImages | Select Scan Image Folder (auto-matches photos by scan number and naming pattern), image linking and validation |
| SLG_Dashboard | Home project summary, CAD platform toggle (DraftSight/AutoCAD) |
| SLG_MessageCenter | Home Message Center listbox (`MC_WriteMessage`, `MC_AppendMessage`) |
| SLG_NewProject | New Project reset |
| SLG_PrintEmbeddedFieldForm | Print Field Form: exports the 4 hidden field-form sheets to one PDF in %TEMP% and opens it (one-sided print reminder) |
| SLG_FieldFormVisibility | Show/hide field-form sheets |

## Workflow (Home sheet)
Print Field Form → fill in the field → Copy OCR Prompt → LLM transcribes the form photos →
Import OCR Data → Import AUT CSV → Select Scan Image Folder → Generate CAD Drawing → in CAD:
APPLOAD the .lsp, type `AXISBUILDER` (menu: layout, TEXTRESIZE, NOZZLEWRAP, OBJECTWRAP,
SECTIONPAGES; layer toggles ABIMAGES, ABSCANS, ABWELDS, ABNOZZLES, ABHEADS, etc.).

## Coordinate model
- Logical X = circumference ("Vessel Height", Project Settings B11). Logical Y = length
  ("Vessel Length", B10). In the LISP: `vesselXLen` = height, `vesselYLen` = length.
- The LISP applies orientation (`SL_tf_x`, `SL_tf_y`, `SL_rot`): Vertical (x, y);
  Horizontal CW (y, −x), rotation −90; Horizontal CCW (−y, x), rotation +90.
  VBA `VisualToLogicalX/Y` is the inverse, used for right-panel placement.
- Right panel (bottom-up: legend → Head 2 → Head 1 → title block) is computed in
  `ComputeRightPanelLayout`.
- `IsAutoCADOutput()` switches emitted LISP: point lists vs "x,y" strings, MVIEW vs VIEWPORT,
  -LAYOUT vs SHEET, -IMAGE + scale/move vs EDITIMAGE.

## Sheet layout (hard-coded rows – OCR importer and generator both depend on these)
- Project Settings: label in col A, value in col B, read by label via `GetSettingValue`.
  OCR writes fixed cells: B5 project name, B9 orientation, B10 length, B11 height,
  B21/B22 axis direction text, B29–B36 reference labels.
  Row 44 is "AUT Hatch Transparency" (0-90, default 50), directly below "AUT Hatch Angle"
  (row 43); the code falls back to 50 if the row is missing (older workbooks).
- Shell Features: circ welds 3–12 (A ID, B Y, C Include, D Label); long seams 15–24
  (A ID, B X, C StartY, D StopY, E Include, F Label); nozzles 27–66, 40 rows (A ID, B Dia, C X, D Y,
  E MinT, F Notes, G Include, H LabelMode; found by header "Nozzles / Circles" in row 25, read up to the
  "Objects" header in row 67); OCR still imports at most 20 nozzles (N1..N20 into rows 27–46);
  objects 69–88 (A ID, B X, C Y, D CircWidth, E Length, F Include, G Notes);
  shell MUT 91–110 (A ID, B X, C Y, D MinT, E Notes).
- Head Features: nozzles 4–23 (Head 1 rows 4–13, Head 2 rows 14–23; A Head, B ID, C Dia,
  D Clock, E Radius, F Custom, G MinT, H Notes, I LabelMode, J Include); "Head MUT" header
  in row 25, data 28–47 (Head 1 rows 28–32, Head 2 rows 33–37; A Head, B ID, C Clock,
  D Radius, E Custom, F MinT, G LabelMode, H Include, I Notes).
- Scan Import: rows 3–152; A Name, B XStart, C XStop, D YStart, E YStop, F W, G H,
  H CX, I CY, J Rot, K TextH (formulas F:K), L Include.
- Scan Images: A Scan, B Image File, C Processed Image, D Include, E Status, F Notes.

## Web app (/app)
Website-first rewrite of AxisBuilder: an installable web app (PWA) that works offline after the first
visit. The Excel/VBA version is tagged `v5.0` and stays untouched; the web app must match its output.
- Stack: Vite + React + TypeScript (strict mode), vite-plugin-pwa (Workbox service worker precaches the
  whole build; `registerType: 'autoUpdate'`, so new versions apply automatically when online), Vitest.
  Planned hosting: Cloudflare Pages (serves `app/dist`).
- Encoding: the cp1252/CRLF rules above apply only to `src/*.bas`. Everything under `/app` is UTF-8.
- Folders:
  - `app/src/data/` – project file schema, importers (.xlsm, AUT CSV, images)
  - `app/src/engine/` – vessel geometry, pure functions, no UI
  - `app/src/export/` – LISP, DXF, PDF output
  - `app/src/ui/` – screens, 2D/3D views
  - `app/test/` – Vitest tests; `app/test/golden/` holds reference jobs and their v5.0 .lsp outputs for parity tests
  - `app/public/` – PWA icons and favicon (placeholders)
  - `app/docs/` – `settings-review.md`, generated from `app/src/data/settings.ts`; don't edit its tables by hand
- npm scripts (run in `app/`): `dev` (dev server, no service worker), `build` (`tsc -b` + `vite build` to `dist/`),
  `preview` (serves `dist/` with the service worker), `test` (`vitest run`), `typecheck` (`tsc -b`), `lint` (oxlint),
  `docs:settings` (regenerates `docs/settings-review.md`; a test fails when it is out of date), `fixtures:xlsm`
  (rebuilds the made-up test workbooks in `test/fixtures/xlsm/`).
- TypeScript projects: `tsconfig.app.json` (src, browser only), `tsconfig.test.json` (src + test, adds Node types),
  `tsconfig.node.json` (vite config and scripts).
- Project file: JSON with `schemaVersion` (Zod schema in `app/src/data/schema.ts`). Every setting is defined once in
  `app/src/data/settings.ts`. A format change bumps `CURRENT_SCHEMA_VERSION` and adds a step to `MIGRATIONS`
  in `app/src/data/projectFile.ts`. Item measurements may be null (not entered yet, e.g. an imported OCR REVIEW
  value); `findMissingData` lists them and export must refuse until they are filled in.
- v5.0 import: `importWorkbook` in `app/src/data/xlsmImport.ts` (rules in `app/src/data/README.md`). AUT CSV:
  `importAutCsv` (`autCsvImport.ts`); image folder matching: `matchScanImages` (`imageMatch.ts`). The placeholder
  page is a temporary test screen: open a .xlsm or AUT CSV, choose an image folder, see the reports, save the
  project file.
- Overlay images: read `app/docs/overlay-image-scaling.md` before building the image step. Decided with the user:
  keep each photo's own resolution and correct only its shape to the scan's width:height (no fixed 40 px/in), then
  insert exactly as v5.0 does (attach at scan width, same insert points and rotations). Photos are only the scan area
  (no cropping). Must be verified on a real job in DraftSight and AutoCAD, all three orientations, before it replaces
  the v5.0 method.
- Reference jobs for parity tests: `npm run convert:refjobs -- "<jobs folder>"` (`app/scripts/convert-reference-jobs.ts`
  + `fill-v5-workbook.ps1`) converts old job workbooks into copies of the v5.0 workbook via Excel COM (macros forced
  off, signature kept), copying the original cells found by `importWorkbook`, then re-imports and compares. The jobs
  folder is outside the repo and holds real client data: never commit anything from it.
- Golden jobs: `app/test/golden/<JOB>/` (project.json + v5.0.lsp + README), made anonymized with `npm run golden:make`
  (`app/scripts/make-golden.ts`). `app/test/golden/lspSections.ts` splits a .lsp into sections in ExportAxisBuilderLSP order
  and compares section by section; `golden.test.ts` has a todo parity test per section, switched on one at a time.
- CI: `.github/workflows/app-ci.yml` runs typecheck, test and build on push and pull request when `app/**` changes.

## Resolved and deferred issues

Status as of 2026-10-19: no open bugs are known. Items below are fixed, closed (won't fix) or deferred by the user.

3. FIXED 2026-10-15 (see Change log). Still open: `SL_HATCH_ANGLE` and "AUT Hatch Pattern" are
   written/stored but unused (SL_HatchRect always draws 45-degree lines). (The AUT legend sample
   is now hidden when "AUT Hatch Enabled" = NO; the MUT sample is always drawn.)
   DEFERRED by the user (2026-10-19): leave the unused angle/pattern settings alone; don't propose wiring them up.
4. FIXED 2026-10-19 (see Change log). Tested by the user.
5. FIXED 2026-10-19 (see Change log). Head clock cells are now Text format, so OCR "3:30" stays text.
6. FIXED 2026-10-19 (see Change log). Tested by the user in DraftSight.
7. FIXED 2026-10-19 (see Change log). Tested by the user.
8. FIXED 2026-10-19 (see Change log). Tested by the user.
9. Coverage % = total scan area / vessel area. Overlaps are double-counted, so it can exceed 100%.
   CLOSED, WON'T FIX (user, 2026-10-19): the user rarely overlaps scans and the figure has always been right on real
   jobs. Coverage stays gross scanned area / shell area (`ComputeCoveragePercent`). Don't propose a union calculation.
10. Minor: (`CleanProjectName` backslash FIXED 2026-10-19, see Change log.) The CSV reader (Line Input) may not
    split LF-only files (WON'T FIX, user 2026-10-19: the AUT CSV always comes from the same source on a
    Windows PC, so CRLF is guaranteed); version strings unified to v5.0 (FIXED 2026-10-19, see Change log);
    the two export routines share a lot of duplicated code.

Deferred feature: SECTIONPAGES (menu option 8) doesn't support Vertical orientation (it shows a pop-up and stops).
DEFERRED by the user (2026-10-19): not needed yet; don't propose it unprompted.

## Change log
- 2026-10-15 – SLG_Utilities: Fix 1, `ExportAxisBuilderLSP` now runs
  `ValidateLayoutGenerationData` before the save dialog and image processing (OCR REVIEW text
  no longer crashes it). Fix 2, reads "Show Rulers" and "Show Head Clock References" (sheet
  labels), with the old names as fallback. Applied by the user.
- 2026-10-15 – SLG_Utilities: Fix #3, `ExportAxisBuilderLSP` now reads "AUT Hatch Enabled",
  "AUT Hatch Scale" (fallback "Hatch Scale") and "AUT Hatch Angle", matching `ExportScanLayoutLSP`.
  New: layer transparency on all hatch layers (AUT_HATCH, LEGEND_AUT_HATCH, LEGEND_MUT_HATCH,
  MANUAL_UT_HATCH, REPORT_LEGEND_AUT, REPORT_LEGEND_MUT) from setting "AUT Hatch Transparency"
  (default 50) via `SL_SetLayerTransparency` (`-LAYER Transparency`, wrapped in vl-catch-all-apply).
  User added row 44 to the workbook, re-imported, re-signed, and tested: works as intended.
- 2026-10-19 – SLG_Utilities: `GetSettingValue` falls back to `FindSettingTrimmed` (ignores leading/trailing
  and non-breaking spaces, case-insensitive) when the exact label isn't found. AUT legend sample (box, hatch,
  "AUT" label) is skipped when SL_HATCH_ENABLED <> YES, in both `SL_Legend` (both orientations) and the
  SECTIONPAGES legend. Section-page legend outlines moved to new non-transparent layers
  REPORT_LEGEND_AUT_BOX (5) / REPORT_LEGEND_MUT_BOX (3); the hatch lines stay on the transparent
  REPORT_LEGEND_AUT/MUT layers. Re-imported, re-signed and tested by the user: works as intended.
- 2026-10-19 – SLG_Utilities: SECTIONPAGES precondition failures (drawing not generated, not on a Sheet tab,
  Vertical orientation) now go through new `SL_SectionPagesStop`, which shows an `alert` pop-up so the
  AXISBUILDER menu redraw can't bury the message. Section sheets still don't support Vertical (open item). Tested: pop-up works.
- 2026-10-19 – SLG_Utilities: Fix #4, all 9 "Â°" (C2 B0) literals replaced with `ChrW(176)`. Input side:
  `ClockPositionDegrees` (2) and `ValidateClockCell` (1) now accept "90°". Output side: NAMEPLATE labels
  "NP + 90°", "180° OPPOSITE", "NP + 270°" built with `ChrW(176)` in the reference-label routine and the
  section-page settings (3 + 3). The .lsp is written ANSI (`Print #`), so CAD gets byte B0. Re-imported and tested by the user: works as intended.
- 2026-10-19 – Workbook: Fix #5, the user set the head clock cells (Head Features) to Text format, so OCR import of
  "3:30" is no longer converted to a time serial. No code change. Closed by the user.
- 2026-10-19 – SLG_ScanImages + SLG_Utilities: Fix #7 and automatic photo matching (TASK_7_Image_Folder_Matching.md).
  One scan-number rule, Public `SLG_Utilities.ScanNumberFromName` (first digit group, CLng, -1 if none), used by
  `DefaultImageName` / `DefaultProcessedName` (SCAN01 -> S1, was S01). `SelectOriginalImageFolder` is now a wrapper
  for `SelectScanImageFolder`; `ResetScanImageNamesToOverlayDefaults` and `ExtractScanNumber` removed. Folder row found
  by exact label ("Original Image Folder", then "Image Folder"), no partial match. `ResolveSourceImagePath`,
  `DefaultImageName` and `DefaultProcessedName` are Public; LINKED in the folder macro, `ValidateCurrentScanImages` and
  `CountActuallyLinkedScanImages` now means `ResolveSourceImagePath` finds the file (normalized-key index removed).
  `SelectScanImageFolder` rewritten: lists .png/.jpg/.jpeg, groups by pattern (S1 -> "S#"), one InputBox if several
  patterns match, per-scan InputBox only for leftovers (0 = skip; no prompt when Image File already points at one of the candidates),
  one Yes/No/Cancel before replacing differing Image File names, writes full filename (S1.png) in B, fills blank C,
  writes the sheet only at the end (Cancel changes nothing). `SetProjectSettingValue` (SLG_Utilities) is now unused.
  Re-imported and tested by the user: works as intended.
- 2026-10-19 – SLG_Utilities: Fix #6, `ExportAxisBuilderLSP` head nozzles now default a blank Radius Position
  (Head Features col E) to CENTER, matching `ExportScanLayoutLSP` (factor 0, was 0.5). Head MUT already did this.
  Re-imported and tested by the user in DraftSight: blank radius lands at the head center.
- 2026-10-19 – SLG_Dashboard: Fix #8, added Public pass-through aliases for the old Home icon macro names:
  `ImportAUT` -> `Import_AUT_CSV`, `SelectImageFolder` -> `SelectScanImageFolder`, `GenerateLayout` ->
  `ExportAxisBuilderLSP`. Shapes unchanged. Don't reuse these three names elsewhere. Re-imported and tested by the user: all three icons work.
- 2026-10-19 – SLG_OCR_Importer: `CleanProjectName` bad-character list had "\\" (VBA has no escapes, so that is two
  backslashes); now "\", so a single backslash in the OCR project name becomes "_". SLG_Utilities: removed the unused
  Private `SetProjectSettingValue` (last caller went away with fix #7). Re-imported by the user; not tested (user's call).
- 2026-10-19 – SLG_Utilities, SLG_ScanImages, SLG_MessageCenter: one version number, v5.0 (matches the workbook name).
  Module headers (Utilities, ScanImages, MessageCenter); layout .lsp header and load message (were v4.7.28); master
  .lsp header (was "v5.1 Stage 1") and its load message now says "AxisBuilder v5.0 master drawing loaded." Inline
  "'v4.x:" history comments and sub-component versions (OCR v1.4, Import AUT v1.6, Message Center v3.1) left as is.
  Re-imported and tested by the user.
- 2026-10-19 – SLG_Utilities, SLG_OCR_Importer, SLG_NewProject, SLG_Dashboard: Shell Features nozzle block doubled to
  40 rows (TASK_Shell_Nozzles_40.md). User inserts rows 46:65 in the workbook; objects move 49–68 -> 69–88 and shell MUT
  71–90 -> 91–110. Changed: both exports' object/MUT loops and comments, validation loops, OCR `ImportShellMUT` /
  `ImportObjects` / `MarkMissingStructuredFields` offsets (+90 / +68), OCR reset ranges and default fills, New Project
  clear ranges, Home `CountShellFeatures`. Left as is on purpose: OCR nozzle offset +26 and the 20-nozzle template,
  prompt; nozzle reading (header-based via `SectionLastRow`). Follow-up (user request): OCR summary now says
  "Shell Nozzles: n of 40" (sheet capacity); `ImportShellNozzles` still reads N1..N20 only.
  Rows inserted, all four modules re-imported (incl. the "of 40" label) and tested by the user: works as intended.
- 2026-10-19 – SLG_PrintEmbeddedFieldForm: `PrintFieldForm` no longer opens Excel's Print Preview. It shows a one-sided
  print reminder, exports the 4 grouped form pages (packet order, existing print areas/page setup) with `ActiveSheet.ExportAsFixedFormat`
  (Sheets has no such method) to
  %TEMP%\AxisBuilder_Field_Form_yyyymmdd_hhnnss.pdf, restores page visibility and Home, then opens the PDF via
  Shell.Application ShellExecute (MsgBox with the path if that fails). Cleanup now restores only pages whose visibility
  was saved. Message Center gets the PDF path (SUCCESS) or the error. Re-imported and tested by the user: works, much better than Print Preview.
- 2026-10-21 – Web app Phase 0 (branch feature/app-scaffold): new `/app` (Vite + React + TypeScript strict, vite-plugin-pwa,
  Vitest), placeholder page, folder READMEs, `.github/workflows/app-ci.yml`, `.gitignore` adds node_modules and dist. No
  VBA or workbook changes. v5.0 tagged on main beforehand.
- 2026-10-22 – Web app Phase 1a (branch feature/data-model): project file data model. Zod added; `app/src/data/`
  `settings.ts` (81 fields from Project Settings + Drawing Information, read from the VBA and a copy of the workbook),
  `schema.ts` (all lists, unique IDs ignoring case; nozzle names unique across shell + heads, MUT IDs likewise),
  `projectFile.ts` (save/open JSON, defaults, plain-language errors, migration hook), `settingsDoc.ts` +
  `app/docs/settings-review.md`; Vitest tests. User decisions: all lengths in inches; defaults ruler spacing 12,
  hatch transparency 50, head labels HEAD 1/2; dropped Text Scale Factor, Show Rulers On Overlay, Overlay Scale
  Method, Coverage Location; unused v5.0 settings kept as "App: planned"; Legend Enabled / Show Title Block to be
  made to work (app control + CAD show/hide command); head clock = hours 1-12, H:MM or decimal, no degrees;
  head custom radius = percent of radius (0-100); Date is a real date printed Oct-22-2026. Photos are linked, not
  copied into the project file. Original Image Folder kept for now: a browser folder picker can't give the full path
  v5.0 writes into the .lsp, so the approach (CAD picks once / desktop wrapper / relative path) is decided at the
  Images step after a DraftSight test.
  No VBA or workbook changes.
- 2026-10-22 – Web app Phase 1b (branch feature/xlsm-import): v5.0 workbook importer. SheetJS 0.20.3 (from
  cdn.sheetjs.com) added; `xlsmImport.ts` reads settings by label, sections by header (current and older 20-nozzle
  layout), head clocks as text, Excel time or degrees, and lists every skipped/changed/invalid/REVIEW/highlighted value
  in an import report. Schema: item measurements, clocks and head radius position may be null (not entered/selected yet; an
  unknown imported radius value is left for the user to select); CUSTOM without a percent
  moved from a file error to `findMissingData`. Fixture builder (`scripts/build-test-workbooks.ts`, ExcelJS dev-only)
  and two made-up test workbooks; test screen on the placeholder page. No VBA or workbook changes.
- 2026-10-22 – Docs: `app/docs/overlay-image-scaling.md` records how v5.0 actually fits scan photos (stretch to the
  scan's shape at 40 px/in, attach at scan width; SL_OVERLAY_SCALE / the 400 px/unit setting are written but unused)
  and the user's decision for the web app (keep source resolution, fix shape only, same insertion). No code changes.
- 2026-10-22 – Web app Phase 1c (branch feature/aut-images): AUT CSV importer (`autCsvImport.ts`, v5.0 Import AUT rules:
  header-mapped columns, "cal" and nameless rows skipped, duplicates / missing columns / bad coordinates stop the import,
  every problem listed with its CSV row; no 150-scan limit) and scan image folder matching (`imageMatch.ts`, v5.0
  SelectScanImageFolder / ScanNumberFromName rules; per scan matched / choose / no match; `applyImageChoices` saves
  the confirmed files into the project). Test screen: Open AUT CSV, and a Scan images step (`ui/ImageFolderPanel.tsx`):
  pick a folder, choose the naming format from a list with example thumbnails, pick a file (or skip) for scans with
  several candidates, confirm replace/keep when a scan already had a different file (as v5.0 asked), then save to
  the project; a folder where nothing fits shows a "wrong folder?" message. No image resizing yet. Made-up sample CSV in `app/test/fixtures/aut/`. App updates: `main.tsx` now
  registers the service worker via `virtual:pwa-register` (immediate), so after an update the page reloads once onto the
  new build instead of showing the old one until the next visit (verified in the preview). No VBA or workbook changes.
- 2026-10-22 – Reference job converter (branch feature/reference-job-convert): `importWorkbook` now finds list columns by
  header text (v4.7 orders shell nozzle and Head Features columns differently; before this, v4.7 jobs were misread
  without warning), reports columns a layout lacks, and returns `sources` (cell of every value) and
  `summary.reorderedSections`; `v5Columns()` exported. New `app/scripts/convert-reference-jobs.ts` + `fill-v5-workbook.ps1`.
  User decisions for the 4 reference jobs: job files used where they are (no original\ folder), images = REFn\screenshots,
  processed images to REFn\v5.0\Processed_Images, scans copied from the old workbook (keeps hand edits) instead of
  re-importing the CSV, missing AUT Hatch Transparency = 50, v4.7 head nozzle "Include Label" NO written as YES, duplicate
  names (e.g. TOL) kept as written. No VBA or workbook changes; AxisBuilder_v5.0_Stable.xlsm only copied.
- 2026-10-22 – Web app Phase 2a (branch feature/golden-harness): golden-file harness. `scripts/make-golden.ts` imports a
  converted job and its v5.0 .lsp and writes `app/test/golden/REF1/` (project.json, v5.0.lsp, README); identifying text
  (project name, component, client, unit, inspector, numbers, service, notes) replaced with neutral values inside LISP
  strings only, image folders replaced with placeholders, everything else byte for byte (19 of 2622 lines changed).
  `lspSections.ts`: 32 sections, split/join exact, normalize line endings / timestamp / image folders, section diff.
  `.gitattributes`: golden .lsp files `-text`. Tests incl. 32 todo parity tests. No VBA, workbook or REF folder changes.
