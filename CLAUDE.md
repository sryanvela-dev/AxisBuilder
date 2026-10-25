# AxisBuilder – notes for Claude

AxisBuilder (formerly "Scan Layout Generator") is an Excel/VBA workbook that turns
inspection field data and AUT scan coordinates into an AutoLISP (.lsp) file. Loading that file
in DraftSight or AutoCAD draws the AUT coverage layout for a pressure vessel or tank shell.
The owner is an Integrity EPC inspection engineer who uses it in the field.

## End goal
The app is where everything is built, adjusted and exported: the LISP's on-the-fly commands (TEXTRESIZE,
NOZZLEWRAP, OBJECTWRAP, visibility toggles, SECTIONPAGES) become app settings shown live in the preview. The
finished deliverable is a 2D PDF exported straight from the app's own sheets (the drawing and its section sheets),
plus a DXF for anyone who wants to carry on in CAD for more functionality. The .lsp is an optional backup, not
where new features go (updated by the user, 2026-10-23: e.g. section sheets matter in the app and the PDF, and
later the DXF, not in the LISP). LISP stays as the bridge until PDF and DXF are proven. The geometry engine serves
all of these.

## Working rules
Improvements over v5.0 are welcome. When you see a function or behaviour that would work better than v5.0,
propose it. Don't change it silently. List proposals under "Suggested improvements" at the end of your summary:
what, why it's better, and what it changes for the user or the drawing. The author decides. Approved changes go
into the app's output only; compat 'v5.0' stays exact so the golden tests keep proving the port. Record approved
changes in the Change log.

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
- `tools/TightPDF/tightpdf_final.py` – the old PDF-to-JPEG report tool, kept for the record (the app's report images replace it; never commit its .exe).

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
  - `app/src/state/` – app state without React: undo history, session (open job), step status, project file
    open/save, recovery copy and recent jobs (IndexedDB)
  - `app/src/ui/` – screens, 2D/3D views
  - `app/test/` – Vitest tests; `app/test/golden/` holds reference jobs and their v5.0 .lsp outputs for parity tests
  - `app/public/` – PWA icons and favicon (placeholders)
  - `app/docs/` – `settings-review.md`, generated from `app/src/data/settings.ts`; don't edit its tables by hand
- npm scripts (run in `app/`): `dev` (dev server, no service worker), `build` (`tsc -b` + `vite build` to `dist/`),
  `preview` (serves `dist/` with the service worker), `test` (`vitest run`), `typecheck` (`tsc -b`), `lint` (oxlint),
  `docs:settings` (regenerates `docs/settings-review.md`; a test fails when it is out of date), `fixtures:xlsm`
  (rebuilds the made-up test workbooks in `test/fixtures/xlsm/`), `gen:lsp-library` (regenerates
  `src/export/lsp/library.generated.ts` from `src/SLG_Utilities.bas`; a test fails when it is out of date),
  `imagepath:test -- "<folder>"` (writes the CAD image-path test kit; never commit the kit), `fingerprints:check` /
  `fingerprints:write` (compare / save the app .lsp fingerprints, see Drawing step), `wrap:report` (what wraps across
  the seam in each golden job), `sections:report` (each golden job's section plan with section sheets on),
  `gen:font-metrics` (the bundled font's widths; a test fails when out of date), `pdf:report` (PDF size per golden job), `pdf:inspect -- "<file.pdf>"` (what is inside a PDF), `labels:report -- [jobs]` (every nozzle label at 1x and 2x text).
- Unattended runs: `.claude/settings.local.json` (not committed) allows npm test / typecheck / build / lint, the npm
  scripts above, `npx vitest` and git add / commit / status / diff / log. Use single simple commands; helpers go in as
  npm scripts, not temporary scripts.
- TypeScript projects: `tsconfig.app.json` (src, browser only), `tsconfig.test.json` (src + test, adds Node types),
  `tsconfig.node.json` (vite config and scripts).
- Project file: JSON with `schemaVersion` (Zod schema in `app/src/data/schema.ts`). Every setting is defined once in
  `app/src/data/settings.ts`. A format change bumps `CURRENT_SCHEMA_VERSION` and adds a step to `MIGRATIONS`
  in `app/src/data/projectFile.ts`. Format 2 (Phase 3d) adds `jobId` (random, stable per job; format 1 files get
  one when opened). Format 3 (Phase 3f-1) only adds settings (text sizes and colors, line colors); older files open
  with their defaults. Format 4 (Phase 3f-2) adds `noWrap` (shell nozzles, objects, scans) and `acrossSeam` (scans),
  both false by default. Item measurements may be null (not entered yet, e.g. an imported OCR REVIEW
  value); `findMissingData` lists them and export must refuse until they are filled in. A setting with `hidden: true`
  (v5.0-only: hatch pattern/angle, Original Image Folder, Overlay Pixels Per Inch, DraftSight Image Pixels Per Unit,
  Preprocess Rotation) is kept in the file for the v5.0 output but not shown in the app.
- v5.0 import: `importWorkbook` in `app/src/data/xlsmImport.ts` (rules in `app/src/data/README.md`). AUT CSV:
  `importAutCsv` (`autCsvImport.ts`); image folder matching: `matchScanImages` (`imageMatch.ts`).
- App shell (Phase 3b): start screen (new, open, import Excel with its report first, sample job, recent jobs, restore
  unsaved work) and the job screen: top bar (Undo/Redo/Save/Save as/Close), step bar Project -> Field data -> AUT
  scans -> Images -> Drawing -> Review -> Export with done / needs attention / not started from `stepStatuses`
  (`app/src/state/steps.ts`), "Before export" banner, one "Next: ..." button. All state in `AppStoreProvider`
  (`app/src/ui/AppStore.tsx`, read with `useApp()`); every project change goes through `edit()` and can be undone
  (Ctrl+Z / Ctrl+Y; typing in one box is one step). Project file extension `.axb` (JSON; `.json` also opens).
  Edge/Chrome save back to the job's file (File System Access API); the first Save over an opened file and a Save after
  the file changed elsewhere ask first; other browsers download a copy. A recovery copy per tab is kept in IndexedDB
  while there are unsaved changes and offered on the next start. Step pages for AUT scans, Images, Review and Export
  are placeholders for 3d-3f; the old test tools moved under their steps (AUT CSV import on AUT scans, photo folder
  matching on Images). No UI library.
- Project and Field data steps (Phase 3c): settings forms built only from `settings.ts` (`group` and `showWhen` on
  each definition, `SETTING_GROUPS`, `groupFields`, `isFieldShown`; Basic always shown, Advanced behind "Show
  advanced", "Reset to default" per group; a hidden setting keeps its value). Field data tables (`ui/DataTable.tsx`)
  with columns from `data/columns.ts` (`TABLE_COLUMNS`; names from `LIST_META`, ranges from the item schemas).
  Typing goes through `ui/useEditBox.ts`: valid values are stored at once, text that isn't valid is kept as a draft
  in the session (`job.drafts`, not in the project file; it blocks export; the first Ctrl+Z throws drafts away), and
  leaving a box ends its undo step (`endEditGroup`). Parsers in `data/parse.ts` (lengths: 12.5, 12 1/2, 12-1/2,
  10' 6"; clock 3, 3:30, 3.5). Checks in `data/checks.ts` (`checkProject`): errors block export (its `exportRule`
  checks match findMissingData + findDuplicateIds, tested on every golden job), warnings don't. Paste from Excel:
  `data/paste.ts` + `ui/PasteDialog.tsx`. Import report entries are linked to settings and rows by
  `data/reportTargets.ts` when an Excel job is imported.
- AUT scans and Images steps (Phase 3d, `ui/scanSteps.tsx`): CSV import by button or drop (asks before replacing
  scans), scan table = DataTable list 'scans' with read-only width/height (`syncScanImages` keeps photo links in step
  with renamed/deleted scans), scan settings group. Scan checks follow v5.0: reversed start/stop = warning (the drawing
  swaps it while Check data before export is on; "Swap reversed starts and stops" fixes all in one undo step), zero width or
  height = error (the job still saves; the schema no longer refuses it), outside the shell = warning, overlaps per Overlap Detection (OFF
  nothing / WARN warning / BLOCK error). Photo rule (v5.0): a drawn scan needs a photo (error while Check data before
  export is on, warning when off); a switched-off scan, or a scan whose photo is switched off ("Use photo"), needs
  none; "Use scan images" off = no photos. Images step: photo folder and job folder remembered per job in IndexedDB
  (`state/folders.ts`, `ui/useRememberedFolder.ts`; reopening needs one "Allow" click), matching flow
  (`ui/ImageFolderPanel.tsx`), photo table (`ui/PhotoPanel.tsx`, `data/photos.ts`), "Process images"
  (`ui/ProcessPanel.tsx`, `export/images/`: `fitSize` shape-only with size cap, never below v5.0's 40 px/in (min 100 px), Web Worker, `<job folder>Processed_Images`
  + `AXISBUILDER_JOB.txt` marker; never replaces without asking; stops on another job's marker). Writing needs Edge/Chrome.
- Drawing preview (Phase 3e, `app/docs/preview.md`): `app/src/engine/` holds the job layout (`layout.ts`, moved out of
  exportLsp.ts; the exporter uses it), transforms, rulers (read from the generated `PrintVisualRulers`) and
  `buildDrawing` (items in logical coordinates with CAD layer, source row and hover text; ports of the LISP drawing
  functions, run-time placement marked "preview approximation"). `app/src/ui/preview/`: render model, SVG view (pan,
  zoom, fit), panel beside the Project / Field data / AUT scans / Images steps (layer toggles = CAD AB... groups,
  photos, full size, click item -> row, row -> highlight via `selectionContext`, check colors). The photo and job
  folders now live in JobScreen (`foldersContext`), shared by the Images step and the preview.
- Drawing step (Phase 3f-1, `DrawingStep` in `ui/projectSteps.tsx`): every drawing-look setting, in the groups Text
  sizes and colors, Rulers and labels, Nozzle labels, Legend and title block, Head views (links to Field data for heads
  on/off and names), Show or hide, Line colors and transparency; wide preview beside it. Text sizes and colors: one row
  per text layer (`TEXT_TYPES` in settings.ts = v5.0's 14 TEXTRESIZE layers plus X_AXIS_LABEL_TEXT, Y_AXIS_LABEL_TEXT,
  REFERENCE_TEXT, marked `appLayer`; settings `<key>Size` Automatic / Scale /
  Fixed height, `<key>Scale`, `<key>Height`, `<key>Color`), line colors `LINE_LAYERS` (`<key>Color`; NOZZLE_LEADERS and
  HEAD_NOZZLE_LEADERS are app layers). App layers: `APP_LIBRARY_PATCHES` / `patchLibraryLine` change the library lines
  that list layers (ruler labels, AB... toggles, TEXTRESIZE reflow), `TEXTRESIZE_LAYERS` drives the app's TEXTRESIZE;
  `appLayerSetup` writes the app layers after SL_SetupLayers. A legend or title block size other than Automatic scales
  the block (`panelScales`, app SL_Legend / SL_TitleBlock) and `computeRightPanelLayout` makes room. CAD colors use
  `ui/ColorPicker.tsx` (`color: true` on a number setting; screen colors in `engine/aci.ts`). `engine/styles.ts` gives
  the size rules and changed colors; the .lsp (app mode only) writes `SL_TEXT_SIZES` + size-aware SL_Text/SL_TextLeft
  and `(SL_Layer ...)` after `(SL_SetupLayers)`, only for non-default values; the preview applies the same rules.
  Export step shows CAD program and checks. "Find a setting" in the job top bar (`ui/FindSetting.tsx`,
  `data/settingsSearch.ts`): name, description and Excel labels (old ones too); jumps to the step and group, opens
  "Show advanced", highlights the box, and for a setting hidden by another choice points at that choice.
  `test/export/appOutput.test.ts` holds SHA-256 fingerprints of the app .lsp at default settings for every golden job
  and the sample (`npm run fingerprints:check` lists which changed, `npm run fingerprints:write` saves them, only after
  an approved output change).
- Wrapping across the circumference seam (Phase 3f-2, `engine/wrap.ts`): X = 0 and X = circumference are the same line.
  Every shell nozzle, object or scan crossing it is drawn in pieces automatically (`wrapSpan`, `circlePieces`,
  `scanPieces`, `objectPieces`; nothing wraps along Y): rectangles as two pieces with the ID on the larger one
  (`labelPieceIndex`, OBJECTWRAP's rule; both scan pieces hatched), nozzles as arcs (main piece first, label with it).
  `drawnScans(p, v5)`: a reversed scan marked `acrossSeam` runs X start -> X stop + C. Checks (`data/checks.ts`): a value
  typed past the seam -> warning with a one-click fix (`Check.actions`, `applyCheckAction`); reversed X -> "Swap start
  and stop" / "Runs across the seam"; wider than the shell -> warning; overlaps compare the pieces; coverage counts a
  wrapped scan once. Rows that wrap show a note (`engine/wrapNotes.ts`); "Don't wrap" / "Across the seam" are Advanced
  columns (`ColumnSpec.advanced`, "Show advanced columns"). AUT CSV import takes the circumference (scan wholly past it
  moved back, report kind 'wrapped'). Photos: one processed image per piece (`pieceImageName`: SCAN_5_FIT_A.png /
  _B.png, `PhotoJob.crop`, `cropSource` in the worker, each piece its own exact shape and never below v5.0's size); the
  .lsp inserts both. .lsp: SL_WrapPiece, SL_ArcAt, SL_NozzleArcsAt (`writeWrapLibrary`), written only when something
  wraps. NOZZLEWRAP / OBJECTWRAP stay and find nothing to do on what the app drew (no whole circle centered on an edge,
  no rectangle crossing one).
- Section sheets (Phase 3f-2, `engine/sections.ts`, Drawing step group "Section sheets", off by default): `sectionPlan`
  (split by number / readable size / manual ranges, snap to circ welds or gaps between scans, overlap, skip empty,
  numbering, match lines), SECTIONPAGES' sheet geometry (`sheetViewport`, `paperX`; app assumes a 10 x 7.5 in letter
  viewport). Preview: `sectionPlanItems` (layer SECTION_PLAN, group 'sections', chip only while on) and
  `ui/preview/SheetsView.tsx` (Sheets button). .lsp (`export/lsp/sectionSheets.ts`, only while on): SL_APP_SECTIONS +
  c:ABSECTIONSHEETS (no length prompt; template Sheet tab needed; viewport picked only if the sheet has more than one;
  sheets named AB-SEC-nn, horizontal layouts only). SECTIONPAGES stays. What is on each sheet (rulers, references,
  title/legend panel, match lines, overview boxes) is `engine/sheets.ts` (`sheetPages`, paper shapes in inches; the
  PDF export should print these). Vertical sheets run the length up the sheet (app only). `ShowWhen.and` chains
  conditions (section settings show only while sections are on). Past-the-seam values: a note with an optional
  "Write as" button, not a warning (`wrapNote`). Preview divider: `ui/preview/PreviewSplitter.tsx`.
- Review and Export steps (Phase 4a): Review = `reviewList` (`state/steps.ts`, errors then warnings, grouped by step)
  with a Go to per item (`ui/goToIssue.ts`), "Ready to export" when nothing is open. Export (`ui/exportStep.tsx`): job
  folder, the PDF / report images panel (`ui/exportPdf.tsx`), "Make CAD drawing (.lsp)" as the backup (processes
  missing or out-of-date processed images first: `staleJobs` in `export/images/process.ts`; writes
  `<job> - AUT Coverage.lsp` in cp1252 with `lspBytes`, images found relative to the drawing: `relativeImages` option,
  `writeImageFinder` / `SL_AppInsertImage` in `appLibrary.ts`; then shows the CAD steps), CAD program and checks
  settings. Everything refuses while errors exist, asks before replacing (`ui/writeFiles.ts okToReplace`), and ends with
  a summary. File names: `export/files.ts` (`exportBaseName`, `reportImageNames` as TightPDF).
- PDF and report images (Phase 4b, `app/docs/pdf-export.md`): one sheet model per printed sheet
  (`engine/sheetModel.ts`: main sheet = whole drawing fitted to letter, landscape or portrait by its shape; then the
  overview and sections from `engine/sheets.ts`), primitives in paper inches with print color (`aci.ts printRgb`),
  line weight (`styles.ts lineWeights`, per-layer `<key>Weight` settings on the Drawing step's lines table), opacity and
  group. The Sheets view (`ui/preview/SheetsView.tsx`, now always available, main sheet first), the PDF
  (`export/pdf/writePdf.ts`, pdf-lib + fontkit, lazy-loaded) and the report JPEGs (`export/report/reportImages.ts`,
  canvas + jpeg-js 4:4:4, DPI in the JFIF header) all draw it. Bundled font `app/src/assets/fonts/Arimo-Regular.ttf`
  (widths in `engine/fontMetrics.generated.ts`, `npm run gen:font-metrics`; `engine/textMetrics.ts`); the service worker
  precaches .ttf. PDF photos: `export/pdf/photos.ts` (shape rule, capped at "Photo resolution in the PDF" of the largest
  printed size, embedded once); browser photo reading `ui/sheetPhotos.ts`. PDF layers named like the preview toggles.
  `npm run pdf:report` prints the PDF size per golden job (`-- --out <folder>` writes them; never into the repo).
- Overlay images: read `app/docs/overlay-image-scaling.md` before building the image step. Decided with the user:
  keep each photo's own resolution and correct only its shape to the scan's width:height (no fixed 40 px/in), then
  insert exactly as v5.0 does (attach at scan width, same insert points and rotations). Photos are only the scan area
  (no cropping). Must be verified on a real job in DraftSight and AutoCAD, all three orientations, before it replaces
  the v5.0 method.
- Reference jobs for parity tests: `npm run convert:refjobs -- "<jobs folder>"` (`app/scripts/convert-reference-jobs.ts`
  + `fill-v5-workbook.ps1`) converts old job workbooks into copies of the v5.0 workbook via Excel COM (macros forced
  off, signature kept), copying the original cells found by `importWorkbook`, then re-imports and compares. The jobs
  folder is outside the repo and holds real client data: never commit anything from it.
- Golden jobs: `app/test/golden/<JOB>/` (project.json + v5.0.lsp + README + golden.json), made anonymized with
  `npm run golden:make` (`app/scripts/make-golden.ts`; `--xlsm`, `--lsp` and `--set section.key=value` for variants
  generated after changing unsaved workbook settings). golden.json holds those overrides and the allowed renamed labels.
  `app/test/golden/lspSections.ts` splits a .lsp into sections in ExportAxisBuilderLSP order and compares section by
  section; `golden.test.ts` runs every job folder that has a golden.json (32 sections + byte for byte, timestamp from line 2).
  Jobs: REF1, REF1-CCW, REF1-ACAD, REF1-OFF, REF2, REF3, REF4.
- LISP export: `exportLsp` in `app/src/export/lsp/exportLsp.ts` writes the master .lsp exactly as v5.0 (all 32 REF1
  sections and the whole file match in `compat: 'v5.0'` mode; the default app output adds the user-approved changes in
  `APP_CHANGES`). Fixed library generated from the VBA; all 7 golden jobs match (CW, CCW, Vertical,
  AutoCAD); quirks, decisions and what is not yet proven (shell MUT, some "off" switches) are in `app/docs/phase2-notes.md`. Export refuses while missing values or repeated
  names exist; the importer renames repeated names ("N1" -> "N1 (2)") and lists each rename in its report.
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
- 2026-10-22 – Web app Phase 2 (branch feature/lsp-exporter): LISP exporter. `vbaFormat.ts` (LispNum = Format "0.###",
  CStr, Format "0.0"); `scripts/lspLibraryGen.ts` translates the Print-only VBA routines into
  `library.generated.ts` (sync test); `exportLsp.ts` ports ExportAxisBuilderLSP incl. AutoCAD branches and v5.0 quirks.
  REF1 parity: 32/32 sections and byte for byte, allowing only the head nozzle "N1 (2)" label. Repeated names are no
  longer renamed on import: listed, allowed in the file, export blocked (`findDuplicateIds`). Notes in
  `app/docs/phase2-notes.md`. No VBA, workbook or REF folder changes.
- 2026-10-22 – Web app Phase 2 follow-up (feature/lsp-exporter): v5.0 quirks the user asked to change are the app's
  default output; `compat: 'v5.0'` keeps v5.0 exact for the golden test. Changes: coverage/Total Scans after the reversed-scan
  flip; no image for a scan switched off; processed images named after the scan (`processedImageNames`, "SCAN 1" ->
  "SCAN_1_FIT.png"); section pages show reference labels only when the drawing does; SL_OVERLAY_PPI/SCALE no longer
  written; title-block date Oct-22-2026. Kept: Head MUT comment, MUT comment text, CCW panel, tick length 3. REF1 app
  output differs from v5.0 only in jobSettings, images, titleBlock (tested).
- 2026-10-22 – Web app Phase 2 decisions (feature/lsp-exporter): importer renames repeated names again ("N1" -> "N1 (2)")
  and reports each rename (user ruling; export still refuses repeats entered by hand). App header reads "Generated by
  AxisBuilder" (v5.0 mode keeps "Generated from Excel"). Date ruling confirmed (Oct-22-2026). Validation deferred to its
  own step. Image folder still open: suggestion in app/docs/phase2-notes.md (relative path first, one-click CAD fallback,
  desktop wrapper in reserve; test .lsp in DraftSight first).
- 2026-10-22 – Web app Phase 2 golden jobs (feature/lsp-exporter): `make-golden` takes `--xlsm`, `--lsp`, `--set` and writes
  golden.json (overrides, allowed renamed labels that the drawing prints). New golden jobs REF2, REF3, REF4 and REF1 variants
  CCW, ACAD (AutoCAD), OFF (Auto Cardinal labels, head views off), all generated by v5.0 and checked in CAD by the user.
  `golden.test.ts` runs every job: all 7 match v5.0 byte for byte, no exporter changes needed (proves Vertical, CCW,
  AutoCAD, long seams, head MUT). Anonymization checked: no original name, client, inspector or path in app/test/golden.
  Image folder: user answers recorded in app/docs/phase2-notes.md (both CADs, job folder, one click OK, installed
  program acceptable); the CAD test at the Images step decides. No VBA, workbook or REF folder changes.
- 2026-10-22 – Web app Phase 3a (branch feature/image-path-test): CAD image-path test kit generator
  `app/scripts/make-image-path-test.ts` (`npm run imagepath:test`). `IPTEST` tries C1 relative path, C2 DWGPREFIX,
  C3 .lsp folder (findfile), A one getfiled pick, using the exporter's SL_InsertFitImage (DraftSight and AutoCAD
  branches); `IPCHECK` lists saved image paths. Kit generated outside the repo (AxisBuilder Image Path Test); results
  pending from the user's DraftSight/AutoCAD runs. No VBA, workbook or exporter changes.
- 2026-10-22 – Docs: Phase 3a CAD image-path results (user, DraftSight and AutoCAD) in `app/docs/overlay-image-scaling.md`
  "Image paths". Unsaved drawing: relative, DWGPREFIX and findfile fail, one getfiled pick works; drawing saved in the job
  folder first: all work; reopen keeps attached images; moved folder: DraftSight loses them (full paths), AutoCAD keeps
  them (relative). Decision: no full Windows path in the app's .lsp, no installed program; LISP order DWGPREFIX +
  Processed_Images, then findfile, then one getfiled pick for all images; findfile check before every attach; Export
  screen suggests saving the drawing in the job folder first; v5.0 compat keeps full paths. No code changes.
- 2026-10-22 – Web app Phase 3b (branch feature/app-shell): app shell. New `app/src/state/` (history.ts undo/redo with
  grouped typing, session.ts reducer for the open job, steps.ts step status / "before export" list, projectFiles.ts
  .axb open/save with File System Access API + download fallback and ask-before-replace, recovery.ts + storage.ts
  IndexedDB recovery copy per tab (Web Locks tell open tabs apart) and recent jobs). New UI: StartScreen (with Excel
  import report before continuing), JobScreen (top bar, step bar, banner, Next), placeholder step pages, FieldInput,
  Dialog, ErrorBoundary with "Copy error details", made-up sample job (`ui/sampleJob.ts`). `ImportTest.tsx` removed (its
  tools moved under the steps). Vite defines `__APP_VERSION__` for error reports. Tests in `app/test/state/`. No VBA or
  workbook changes.
- 2026-10-23 – Web app Phase 3c (branch feature/project-field-data): Project and Field data steps. `settings.ts` gets
  `group`, `showWhen` and `multiline` per definition plus `SETTING_GROUPS` (Job information, Vessel size and orientation,
  Axis directions, Reference labels, Heads); four descriptions reworded in plain language; settings-review.md shows the
  group. New `data/parse.ts`, `data/columns.ts`, `data/checks.ts`, `data/paste.ts`, `data/reportTargets.ts`. Undo: a
  group now lasts until you leave the box (`endGroup`, no time window); typed-but-invalid values are session drafts.
  `steps.ts` reads `checkProject` and drafts. New UI: SettingsForm, DataTable, PasteDialog, stepParts, projectSteps,
  placeIds, useEditBox, checksContext; `FieldInput.tsx` removed. LIST_META "Label" columns renamed "Show label".
  Sample job shows both heads. Tests for parsing, checks (incl. export-rule parity on all golden jobs), paste, setting
  groups / conditions, report links, undo grouping and drafts. No VBA or workbook changes.
- 2026-10-23 – Web app Phase 3d (branch feature/scans-images): AUT scans and Images steps with image processing in the
  browser. Project file format 2 (`jobId`, migration from 1). Settings: groups 'scans' and 'images', `hidden` flag for
  six v5.0-only settings, new app-only "Largest processed image side" (default 4096 px; numbers from the reference jobs
  in overlay-image-scaling.md). New: `data/photos.ts`, `state/folders.ts`, `export/images/` (fit, marker, process,
  worker), UI scanSteps, PhotoPanel, ProcessPanel, useRememberedFolder, photoFolder; ImageFolderPanel now takes the
  folder from the step. Checks: reversed/outside/overlap scans, missing photos (v5.0 rule). Tests for fit shapes, cap,
  names, marker, folder check, run, migration, overlap modes, photo rule, CSV replace, and that the job ID and size
  setting don't change the .lsp (golden jobs unchanged). Checked in the preview with browser test folders (6 photos
  1915x957 -> 1915x3830, marker, replace question, other-job refusal). No VBA or workbook changes.
- 2026-10-23 – Web app Phase 3d follow-up (user click-through): a scan with no width or height is now a check error
  (blocks export) instead of a file error, so the job always saves (before, typing X start = X stop could store a value
  the file check refused, and Save failed); `setCell` refuses a change for any problem it causes in the row. New
  "Swap reversed starts and stops" button on AUT scans (`swapReversedScans`). "v5.0" removed from what the app shows
  ("the Excel version" where it matters). No VBA or workbook changes.
- 2026-10-23 – Decision (user) for Phase 3f: Make CAD drawing writes the .lsp and processes missing or out-of-date images
  in one go; the Images step keeps its Process images button. Recorded in app/docs/overlay-image-scaling.md. Docs only.
- 2026-10-23 – Web app Phase 3d follow-up (user): processed images are never smaller than v5.0 made them (scan w x 40 by
  h x 40 px, at least 100 px each way): `fitSize` raises a capped or small result to the smallest exact-shape size
  covering that (`excelSize`, `raised` flag; e.g. 280 x 20 in with a 1915 x 957 photo -> 11200 x 800). New numbers for
  the reference jobs in overlay-image-scaling.md (default cap 4096: 3.21 MP average, about 1.44 GB for 150 images vs
  1.08 GB in v5.0); setting description updated. No VBA or workbook changes.
- 2026-10-23 – Working rules section added (propose improvements over v5.0, author decides, compat stays exact).
- 2026-10-23 – Web app Phase 3e (branch feature/preview): live 2D preview. New `app/src/engine/` (layout, transform,
  rulers, drawing) and `app/src/ui/preview/` (renderModel, DrawingView, PreviewPanel, usePhotoThumbs); exportLsp.ts now
  takes its layout numbers from `engine/layout.ts` (all 7 golden jobs byte for byte). Selection and folders contexts;
  rows highlight when selected. Job screen is a flex column with a `.work` area (page + preview). Tests: engine vs
  exported .lsp for every golden job, rulers, transforms, render model, selection mapping. No VBA or workbook changes.
- 2026-10-23 – Approved app changes (feature/preview, user): CCW labels upright (app LISP block `export/lsp/appLibrary.ts`
  redefines SL_LabelRect / SL_LongSeam), nozzle labels placed by the app (`engine/labels.ts`, written as `SL_NozzleAt`;
  same rules as SL_CircleSmart; head labels also move out along their leader until clear), centerline transparency
  (new app-only setting, default 50). App output only: compat 'v5.0' unchanged, all 7 golden jobs byte for byte; the
  app-vs-v5.0 section test now also lists imageHelpers, drawSetup, nozzles, headNozzles. phase2-notes changes 11-14.
- 2026-10-23 – Web app Phase 3f-1 (branch feature/drawing-step): Drawing step between Images and Review, "Find a setting"
  search, text sizes and colors. Settings: new groups (textStyles, rulers, nozzleLabels, legendTitle, headsDrawing,
  showHide, lineStyles on Drawing; export on Export), 67 app-only settings (14 text types x size/scale/height/color, 11
  line-layer colors), six unused v5.0 settings hidden (Show Direction Labels, Arrow Length Mode, Arrow Length, Output
  Command, Legend Enabled, Show Title Block); project file format 3. Exporter (app mode, only when a value is not its
  default): `SL_TEXT_SIZES`, `SL_TextHeight`, size-aware SL_Text / SL_TextLeft, `(SL_Layer ...)` after SL_SetupLayers
  (phase2-notes changes 15-16). New: engine/styles.ts, engine/aci.ts, ui/ColorPicker.tsx, ui/FindSetting.tsx,
  data/settingsSearch.ts; preview draws CAD colors (CSS variable --c) and sized text; nozzle placement uses the sized
  height. Tests: default app .lsp fingerprints unchanged (taken before the change), every text type's size and color in
  the .lsp and the preview, line colors, search by new and old names, every shown setting placed. Step bar now 7 columns.
  New .lsp not yet checked in DraftSight/AutoCAD. No VBA or workbook changes.
- 2026-10-23 – Web app Phase 3f-1 follow-up (feature/drawing-step, approved by the user): the three suggested improvements.
  New layers X_AXIS_LABEL_TEXT, Y_AXIS_LABEL_TEXT, REFERENCE_TEXT, NOZZLE_LEADERS, HEAD_NOZZLE_LEADERS (same colors as
  before; own size/color rows on the Drawing step); library lines patched where written (`APP_LIBRARY_PATCHES`), app
  TEXTRESIZE with 17 layers (menu numbers moved), AB... toggles and the legend reflow know the new layers. A bigger
  legend or title block scales as a whole and the right panel moves the heads and title up (`panelScales`,
  `computeRightPanelLayout` scales, app SL_Legend / SL_TitleBlock written only when a size changes). Reset button per
  text row. Default app .lsp changes only by the layer splits (19 library/drawing lines plus new definitions; checked
  by diff, fingerprints regenerated); compat v5.0 unchanged. phase2-notes changes 17-18. Legend/title text splits left
  out (TEXTRESIZE's legend reflow needs the summary lines on LEGEND_TEXT). Not yet checked in DraftSight/AutoCAD.
- 2026-10-23 – Web app Phase 3f-2 (branch feature/wrap-sections, user request): automatic wrapping across the
  circumference seam and section sheets planned in the app. Wrapping: shell nozzles (arcs), objects and AUT scans
  crossing X = 0 / X = circumference are drawn in pieces in the preview and the .lsp (ID on the larger piece, both
  scan pieces hatched, photos split into _A / _B images); past-the-seam values and reversed X get checks with one-click
  fixes; overlaps across the seam; coverage counts once; CSV import reads scans past the circumference across the seam;
  per-item Don't wrap; project file format 4. Golden jobs whose app .lsp changed: REF2 (shell nozzles N5-N9 at X = 0),
  REF3 and REF4 (MANWAY 437 + 38 on a 458 circumference); fingerprints refreshed for those three only. Section sheets:
  new Drawing step group (off by default), engine/sections.ts plan, preview plan + Sheets view, ABSECTIONSHEETS in the
  .lsp only while on (fingerprints unchanged with sections off). NOZZLEWRAP, OBJECTWRAP and SECTIONPAGES stay as the
  backup. phase2-notes changes 19-20. New npm scripts fingerprints:check / write, wrap:report, sections:report.
  Compat v5.0 unchanged. Not yet checked in DraftSight/AutoCAD.
- 2026-10-23 – Web app Phase 3f-2 click-through follow-up (feature/wrap-sections, user): a value past the seam is fine
  as typed: no warning any more, a green note on the row says where it is drawn, with an optional "Write as" button
  (`wrapNote` returns text + actions). Wrapped nozzle labels: split about in half (center within a quarter radius of the
  edge) always on a leader; a partial split keeps the label inside the larger part when it fits; leaders start on the
  drawn part (REF2's app .lsp changed again: N5-N9 at X = 0 now have leaders; fingerprint refreshed for REF2 only).
  Draggable divider between the step page and the preview (`ui/preview/PreviewSplitter.tsx`, arrow keys too, width
  remembered). Sheets view: white paper with print colors, SECTIONPAGES' rulers, reference labels and title/legend panel
  from new `engine/sheets.ts` (`sheetPages`, paper shapes in inches, for the PDF later); opens full size. Vertical
  section sheets in the app (length up the sheet, circumference across; `sheetViewport` / `sheetScale` / `paperAlong`
  take the orientation); the .lsp writes ABSECTIONSHEETS for horizontal layouts only. Readable size already follows the
  Drawing step's scan label size (test added). End goal updated by the user: full in-app building and export (PDF,
  then DXF); the .lsp is an optional backup.
- 2026-10-23 – Sheets view follow-up (feature/wrap-sections, user): sheets zoom and pan (wheel, drag, +/-, Fit); the
  title/legend panel sits just right of the drawing (past the reference labels) and the two are centred on the sheet
  (app layout in `engine/sheets.ts`; ABSECTIONSHEETS in CAD keeps SECTIONPAGES' panel at 86.5%). A nozzle split in half
  keeps one number on one leader (user ruling, a second label was tried and removed). `wrap:report` shows nozzle label
  placement. No .lsp change (fingerprints unchanged).
- 2026-10-24 – Web app Phase 4a (branch feature/pdf-export): Review step lists everything open (errors first, then
  warnings, grouped by step, Go to each); "Ready to export". Export step: job folder, CAD program setting, "Make CAD
  drawing (.lsp)" as the backup (processes missing or out-of-date images first, writes `<job> - AUT Coverage.lsp`, finds
  images relative to the drawing (app change 21, app output only), shows the CAD steps); asks before replacing; plain
  summary. compat 'v5.0' and the default-settings fingerprints unchanged. No VBA or workbook changes.
- 2026-10-24 – Web app Phase 4b (feature/pdf-export): PDF and report images straight from the app (`app/docs/pdf-export.md`).
  One sheet model (`engine/sheetModel.ts`) for the Sheets view (now with the main sheet), the PDF (pdf-lib 1.17.1 +
  fontkit, bundled Arimo font, vector paths, real text, print colors, line weights per layer, hatch/centerline
  transparency, photos at up to 300 dpi of their printed size, PDF layers named like the CAD groups) and the report
  JPEGs (replace TightPDF: one per sheet, cropped to the printed extents from the model, 300 DPI, quality 95, 4:4:4,
  8 px padding, DPI in the file, TightPDF names). New settings: line weights (Drawing step), PDF photo resolution, PDF
  layers, report image resolution, quality, padding, crop and file name (Export step). Section sheet panels and
  reference labels now measured with the font (a long title ran off the overview sheet). `tools/TightPDF/` keeps
  the old tool's script for the record. Not yet tried: printing on letter paper, Acrobat/Edge layers, real photos.
  No .lsp change (fingerprints unchanged). No VBA or workbook changes.
- 2026-10-24 – Phase 4b click-through follow-up (feature/pdf-export, user): PDF text was missing most letters in Edge
  (pdf-lib's font subset): the whole font is now embedded (+310 KB, test). Sheets view draws the print colors and line
  weights (the drawing view's CSS overrode them). Section sheet rulers: numbers, axis label and arrow stacked by
  measured size with gaps, a number touching the next left out (end kept), panel 0.5 in past the drawing (test: no
  ruler text touches another or a line). PDF layers kept (Acrobat/Reader only; other viewers ignore them). New "What is
  exported" group: Layers to export (As the preview / Scans / Overlays = photos + outlines + labels, no hatch / Both,
  files "... - Scans" / "... - Overlays"; preview chips in `ui/preview/previewPrefs.ts`) and Main sheet (Automatic /
  Landscape / Portrait). Approved suggestions: full size fills the window (Escape closes), "Open the PDF" after making
  it, job screen loaded on its own (`App.tsx` lazy; first chunk 747 -> 389 KB; `Notices` moved to `ui/Notices.tsx`).
  New `npm run pdf:inspect`. No .lsp change (fingerprints unchanged).
- 2026-10-24 – Section sheets follow-up (feature/pdf-export, user click-through): the overview's panel sat on the
  drawing (drawing + rulers + panel wider than the sheet): such a sheet's viewport is now drawn smaller so the panel
  keeps its room; the gap to the panel is a quarter inch on every sheet (user), measured past the reference labels
  (on vertical sheets the last one sticks out half its width); legend keys stacked (AUT above MUT) like the
  drawing's legend. Test: the panel is clear of the drawing and its reference labels on every sheet.
  PDF and line weights in the preview confirmed working by the user. No .lsp change.
- 2026-10-24 – Click-through fixes (feature/pdf-export, user): (1) "Paper size" on the Export step (Letter default,
  11x17 (Tabloid), Legal, A4) for every sheet, the Sheets view, PDF and report images; readable-size sections are
  planned for it (`paperOf`, `sheetArea`; sheetViewport / sheetScale take the area). (2) Labels centred like CAD's MC:
  the preview and Sheets view used the em box ("central"); now the bundled font, capital-height size and an
  alphabetic baseline half the height below the point (`renderModel` `dy`); test on every golden job. (3) Every step
  and closing full size open the page at its top. (4) App change 22: a ruler tick number that crowds the end number is
  left out, the end always kept, in the preview, sheets, PDF, report images and the app .lsp (`SL_RulerNumberFits`,
  patch on all nine ruler functions); compat v5.0 unchanged; fingerprints refreshed (all jobs: library lines; drawing
  loses 300" in REF1 and its variants, 336" in REF2, 456" in REF3 / REF4; sample unchanged). (5) Hatch and centerline
  transparency as a Solid..Faint slider with the number and a live sample (`transparency` on NumberDef). No VBA or
  workbook changes.
- 2026-10-24 – Click-through fixes 6-8 (feature/pdf-export, user): (6) line weight defaults as CAD draws v5.0
  (0.25 mm): vessel 0.35, hatch / legend hatch samples / leaders 0.13, every other layer 0.25 (rulers and centerline
  were 0.18); one-pixel minimum on screen (Sheets view) and in low-DPI report images. Jobs saved earlier keep their
  saved weights until "Reset to default". (7) CAD's exact ACI colors by default in the preview (on white), Sheets view,
  PDF and report images; Drawing step "Colors" = Softer for screens keeps the earlier shades (`printRgb(n, soft)`,
  `SheetModel.soft`, `.preview-canvas.exact-colors`). (8) App change 23, nozzle labels (`engine/labels.ts`): inside
  only when width and height fit; every drawn scan avoided (not only photos); crowded labels try longer leaders,
  then are placed with a Review warning ("Label N4 overlaps scan 12", `crowdedLabels`). No golden job's labels move
  (default and 2x nozzle text, `npm run labels:report`), so no fingerprint changed for 6-8. compat v5.0 unchanged.
- 2026-10-24 – Web app Phase 5a (branch feature/leaders-arrows, user request): leader and arrow styling. Drawing step group
  "Leaders and arrows": leader shape Straight / Elbow (default: angled segment from the nozzle, 2 in horizontal landing, label
  at its end, centred on it) / Curved; arrowhead Closed filled (default) / Open / Dot / None; leader arrowhead size 1.5 in;
  "Arrow head size" renamed Direction arrow size (3 in) and moved into the group. Applies to shell, head and across-the-seam
  nozzle leaders and to the X and Y direction arrows (and the head 12 o'clock arrows). `engine/leaders.ts` (paths worked out as
  the drawing reads, landings horizontal in all orientations; heads; segment / box tests); `engine/labels.ts` keeps label and
  whole leader clear (scans, objects, nozzles, labels, leaders), label alone as a fallback before the Review warning; new
  `poly` shape (open or filled) through the preview, Sheets view, PDF (fill + stroke) and report images. .lsp (app only):
  `SL_NozzleAt` takes parts (polyline, solid triangle as a tapered LWPOLYLINE, dot), `SL_Arrow` uses `SL_ARROW_STYLE`.
  Approved app output change (app change 24, phase2-notes): every app .lsp fingerprint refreshed; at 1x text 18 of 18 outside
  labels moved in REF1 and its variants, 11 of 11 in REF2, 1 of 1 in REF3 / REF4 (inside labels unchanged); none crowded at 1x,
  one new at 2x text in REF1 and its variants. compat v5.0 unchanged. Not yet checked in DraftSight/AutoCAD.
- 2026-10-25 – Web app Phase 5a follow-up (feature/leaders-arrows, user): X and Y direction arrow length, per axis. Drawing step
  "Leaders and arrows": "X / Y direction arrow length" = Automatic (as long as its wording, at least 14 in, as before) or
  Fixed with a length in inches. Preview, Sheets view, PDF and report images use `directionArrowLength` (`engine/leaders.ts`);
  .lsp (app only): `SL_X_ARROW_LEN` / `SL_Y_ARROW_LEN` and `SL_DirectionArrowLength`, patched into the nine ruler functions
  (app change 25, library lines only, so every app fingerprint refreshed; drawings unchanged at Automatic). compat v5.0 unchanged.
- 2026-10-25 – Fix (feature/leaders-arrows, user): "Make CAD drawing" stopped with "REF1\Processed_Images holds the processed images of
  <this job's own name>" when the folder's marker had another job ID but the same job name (the Excel file imported again gives
  a new ID). `checkTargetFolder` now takes the job name: the same name = the same job's folder (the replace question still asks
  about images already there); a different name still stops. Test added.
