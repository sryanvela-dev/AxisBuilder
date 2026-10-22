# Phase 2 notes: LISP exporter

Status, v5.0 quirks ported as they are, decisions to review, and what's needed next.
Branch `feature/lsp-exporter` (local commits only; not pushed).

## Result

**All 32 REF1 sections match v5.0, and so does the whole file byte for byte**, apart from the one
allowed label difference (head nozzle `"N1 (2)"` in the app vs `"N1"` in v5.0; see "Decisions").

| Group | Sections | REF1 |
|---|---|---|
| Header | header, platform | pass |
| Fixed library | libCore, libText, nozzleWrap, objectWrap, sectionViewports, sectionPages, menuLauncher, drawingHelpers, imageHelpers | pass |
| Job | jobSettings | pass |
| Drawing | drawSetup, vessel, scans, images, objects, nozzles, shellMut, welds, rulers, referenceLabels, headViews, headNozzles, headMut, legend, titleBlock, drawFinish | pass (headNozzles with the allowed label) |
| Commands | visibility, layerGroups, launcher, footer | pass |

How it was built:
- The fixed library (about 2,400 VBA `Print` lines) is **translated from `src/SLG_Utilities.bas`**
  by `scripts/lspLibraryGen.ts` into `src/export/lsp/library.generated.ts`, not retyped. The
  translator understands only `Print`, `If IsAutoCADOutput()`, `Select Case` and a few expression
  forms, and stops on anything else. A test fails if the generated file no longer matches the VBA.
  The same translator produces the ruler routine and the command tail.
- The job-dependent parts are hand-ported in `src/export/lsp/exportLsp.ts`, one block per VBA
  routine.
- All sections matched on the first full run, so they were switched on together. The brief asked for
  one commit per section; the work landed in three commits instead: number formatter, generated
  library, exporter + parity tests.

### What REF1 proves, and what it doesn't

REF1 is Horizontal CW, DraftSight, Bottom + Left rulers, both head views (Medium), Custom Cardinal
reference labels, 2 circ welds, 20 shell nozzles, 3 objects, 3 head nozzles, 17 scans with images,
Enable Validation on.

**Not proven yet**: these are ported from the VBA and have unit tests, but no real v5.0 output to
compare with:
- **AutoCAD output** (all `IsAutoCADOutput()` branches)
- **Vertical** and **Horizontal CCW** (rulers, reference labels, right-panel positions)
- long seams, shell MUT points, head MUT points
- Auto Cardinal / NDC / NamePlate label sets, other ruler placements
- the "off" switches: vessel, welds, supports, nozzles, rulers, legend, title block, reference labels,
  head nozzles, scan borders, coverage %, validation

## v5.0 quirks ported as they are

These are copied exactly, even where they look like bugs in v5.0.

1. **Coverage % and "Total Scans" leave out reversed scans.** They are computed before validation
   flips a scan entered with start > stop, so that scan has a negative width and isn't counted. It is
   still drawn (after the flip).
2. **Images are inserted for scans switched off.** Scan Images is rebuilt from Scan Import before
   generating; a scan with Include = NO still gets an image row with Include = YES unless its old image
   row said NO, so its photo is inserted while its outline isn't.
3. **The processed image name is always `S<number>_FIT_B12.png`.** The rebuild overwrites the
   Processed Image column. Two scans with the same number, such as `SCAN1` and `SCAN01`, would
   share one file name.
4. **The Head MUT comment line is always written when head views are on**, even with no head MUT
   rows (v5.0's workbook always has the Head MUT section).
5. **Section pages always show reference labels.** With Reference Label Mode = None, the main
   drawing hides them, but the section-page settings still list the label set.
6. **Values written but not used**: `SL_OVERLAY_SCALE`, `SL_OVERLAY_PPI`, `SL_HATCH_ANGLE`.
   Already known; the hatch angle is deferred by you.
7. **The shell MUT comment says "rows 91-110"** even though the app has no rows.
8. **Horizontal CCW**: the right-side panel ignores the right-ruler shift that Vertical and CW get
   (v5.0's own comment says CCW was left unchanged on purpose).
9. **A blank reference label tick length**, or one of 0 or less, becomes 3 (VBA `Val`).
10. **The date is printed as the cell displays it** (`m/d/yy`, e.g. `10/13/26`). See Decisions.

## Decisions to review

1. **Title-block date format.** v5.0 prints the date the way its workbook cell shows it, which is
   `m/d/yy`. Phase 1a decided the app shows dates as `Oct-22-2026`. For parity the exporter prints
   `m/d/yy`. Changing it later means updating the golden files on purpose.
2. **Repeated names.** The importer no longer renames: it lists repeats, the file may hold them, and
   export refuses until they're renamed. REF1's `project.json` renames the head nozzle `N1` to
   `N1 (2)` explicitly (listed in `test/golden/REF1/README.md`), and the parity test allows exactly
   that label difference, once.
3. **Image folder in the `.lsp`.** A browser can't know the Windows path of the photos. The exporter
   takes `processedImageFolder` (and `workbookFolder`, used when Original Image Folder is blank) as
   options. Without them it follows v5.0's rule using the settings. The parity test passes
   `<PROCESSED_IMAGES>`. How the real app supplies the folder is still the open Images-step question.
4. **Timestamp.** The `;;; Generated from Excel on` line uses `options.generatedAt`, or the current
   time. The comparison ignores it, but the byte-for-byte test passes the golden's own timestamp.
5. **The text still says "Generated from Excel"**, even though the app writes it, because the text
   must match v5.0. Worth changing once parity is no longer the goal.
6. **Validation is not ported, except the scan flip.** v5.0 stops on a missing image folder or
   files, scan overlaps with Overlap Detection = BLOCK, and similar checks. The exporter only refuses
   on missing values and repeated names. The other checks belong to the Images step and a later
   validation step.
7. **Number formatting is unconfirmed in edge cases.** `LispNum` assumes VBA `Format` works on the
   15-significant-digit decimal value and rounds half away from zero, and keeps a minus sign on a
   negative value that rounds to zero (`-0.`). VBA can't be run here to confirm this. REF1 doesn't
   hit these edge cases.
8. **Yes/No settings.** v5.0 compares some values without trimming (a cell holding `" YES"` counts
   as NO). The app stores real Yes/No values, so it can't reproduce that.
9. **Widths** are computed as stop minus start in JavaScript; v5.0 took them from Excel formulas
   (`=C-B`). These agree for normal values, as REF1 shows.

## What's needed from you

1. **Generate and check v5.0 `.lsp` files for REF2, REF3 and REF4** (already converted, in
   `REFn\v5.0\`), then I'll turn them into golden jobs with `npm run golden:make`. REF3 and REF4 are
   **Vertical** with long seams; REF2 has **head MUT** points.
2. **A Horizontal CCW job** (any real job, or REF1 with Orientation changed to Horizontal CCW),
   generated by v5.0 and checked in CAD.
3. **An AutoCAD job**: any REF job with CAD Platform set to AutoCAD on Home, generated by v5.0 and
   opened in AutoCAD.
4. If possible, **one job with options turned off** (for example legend or title block hidden,
   validation off, Auto Cardinal labels) to cover the "off" branches.

Each new golden job runs through the same 32-section test; any branch that differs shows up with
its first differing line.
