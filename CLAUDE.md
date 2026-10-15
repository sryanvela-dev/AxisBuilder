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

## Rules for editing src
1. **Encoding: Windows-1252 (cp1252) with CRLF line endings.** The VBA editor imports .bas files
   as cp1252. Saving as UTF-8 garbles every non-ASCII character on import.
   - Don't add non-ASCII characters. For the degree sign use `ChrW(176)` in code.
   - `SLG_Utilities.bas` already contains the bytes C2 B0 (VBA sees the two characters "Â°").
     That is known issue #4. Leave those bytes alone unless you're fixing #4 on purpose.
   - After editing, verify the changed files are still cp1252 + CRLF and that only the
     intended lines changed (diff against the previous version).
2. Keep the first line `Attribute VB_Name = "<ModuleName>"` intact. It's required for import.
3. Keep `Option Explicit`. Declare every variable. VBA has no compiler here, so check
   carefully for typos, missing `End If`/`Next`, and wrong Sub/Function names. The user
   compiles in Excel (Debug > Compile).
4. Make small, targeted changes. Don't reformat or reorganize code you weren't asked to touch.
5. When done, tell the user **which modules changed** so they can re-import just those
   (VBA editor: Remove module > File > Import File), then compile, save, and
   **re-sign** (Tools > Digital Signature). Any code change clears the signature.
6. Add a line to the Change log at the bottom of this file for each fix.

## Modules
| Module | Purpose |
|---|---|
| SLG_Utilities | Core generator (~5,900 lines). `ExportAxisBuilderLSP` (Home "Generate CAD Drawing": image preprocessing + master .lsp), `ExportScanLayoutLSP` (older geometry-only layout), validation, right-panel layout math, all emitted LISP, project status dashboard |
| SLG_OCR_Importer | Copy OCR Prompt / Import OCR Data (clipboard via Win32 API, `[SECTION] KEY=a\|b\|c` format, REVIEW cells yellow-filled) |
| SLG_ImportAUT | Import AUT CSV (header-mapped, max 150 scans, skips "cal", blocks duplicates) |
| SLG_ScanImages | Select Scan Image Folder, image linking and validation |
| SLG_Dashboard | Home project summary, CAD platform toggle (DraftSight/AutoCAD) |
| SLG_MessageCenter | Home Message Center listbox (`MC_WriteMessage`, `MC_AppendMessage`) |
| SLG_NewProject | New Project reset |
| SLG_PrintEmbeddedFieldForm | Print preview of the 4 hidden field-form sheets |
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
  "AUT Hatch Transparency" (0-90, default 50) goes in a new row directly below "AUT Hatch Angle"
  (row 44 once inserted); until the row exists the code uses 50.
- Shell Features: circ welds 3–12 (A ID, B Y, C Include, D Label); long seams 15–24
  (A ID, B X, C StartY, D StopY, E Include, F Label); nozzles 27–46 (A ID, B Dia, C X, D Y,
  E MinT, F Notes, G Include, H LabelMode; found by header "Nozzles / Circles" in row 25);
  objects 49–68 (A ID, B X, C Y, D CircWidth, E Length, F Include, G Notes);
  shell MUT 71–90 (A ID, B X, C Y, D MinT, E Notes).
- Head Features: nozzles 4–23 (Head 1 rows 4–13, Head 2 rows 14–23; A Head, B ID, C Dia,
  D Clock, E Radius, F Custom, G MinT, H Notes, I LabelMode, J Include); "Head MUT" header
  in row 25, data 28–47 (Head 1 rows 28–32, Head 2 rows 33–37; A Head, B ID, C Clock,
  D Radius, E Custom, F MinT, G LabelMode, H Include, I Notes).
- Scan Import: rows 3–152; A Name, B XStart, C XStop, D YStart, E YStop, F W, G H,
  H CX, I CY, J Rot, K TextH (formulas F:K), L Include.
- Scan Images: A Scan, B Image File, C Processed Image, D Include, E Status, F Notes.

## Open issues
3. FIXED 2026-10-15 (see Change log). Still open: `SL_HATCH_ANGLE` and "AUT Hatch Pattern" are
   written/stored but unused (SL_HatchRect always draws 45-degree lines), and the legend AUT/MUT
   hatch samples are drawn even when "AUT Hatch Enabled" = NO.
4. Degree sign stored as "Â°" → degree clock entries are rejected; NAMEPLATE labels print
   "NP + 90Â°". Fix with `ChrW(176)`.
5. OCR import writes clock values like "3:30" into General-format cells; Excel probably
   converts them to a time serial (0.1458) → wrong angle. Needs a test in Excel.
6. Master export doesn't default a blank head-nozzle Radius Position to CENTER (the layout
   export does): factor 0.5 vs 0.
7. Two image-folder macros behave differently (`SelectOriginalImageFolder` resets names to S#;
   `SelectScanImageFolder` keeps custom names). Default names differ ("SCAN01" → S1 vs S01).
   The linker matches normalized names, but the generator needs the exact filename.
8. Home icon graphics call macros that don't exist (ImportAUT, SelectImageFolder, GenerateLayout).
9. Coverage % = total scan area / vessel area. Overlaps are double-counted, so it can exceed 100%.
10. Minor: `CleanProjectName` doesn't strip a single "\"; the CSV reader (Line Input) may not
    split LF-only files; version strings are mixed (v4.7.28 / v5.1 Stage 1 / v5.0);
    the two export routines share a lot of duplicated code.

## Change log
- 2026-10-15 – SLG_Utilities: Fix 1, `ExportAxisBuilderLSP` now runs
  `ValidateLayoutGenerationData` before the save dialog and image processing (OCR REVIEW text
  no longer crashes it). Fix 2, reads "Show Rulers" and "Show Head Clock References" (sheet
  labels), with the old names as fallback. Applied by the user. Head clock reference still
  needs a field test.
- 2026-10-15 – SLG_Utilities: Fix #3, `ExportAxisBuilderLSP` now reads "AUT Hatch Enabled",
  "AUT Hatch Scale" (fallback "Hatch Scale") and "AUT Hatch Angle", matching `ExportScanLayoutLSP`.
  New: layer transparency on all hatch layers (AUT_HATCH, LEGEND_AUT_HATCH, LEGEND_MUT_HATCH,
  MANUAL_UT_HATCH, REPORT_LEGEND_AUT, REPORT_LEGEND_MUT) from setting "AUT Hatch Transparency"
  (default 50) via `SL_SetLayerTransparency` (`-LAYER Transparency`, wrapped in vl-catch-all-apply).
  DraftSight syntax tested by the user by hand; full export not yet field-tested.
