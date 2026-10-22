# Phase 2 notes: LISP exporter

Status, v5.0 quirks and what changed, decisions to review, and what's needed next.
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

## v5.0 quirks: what changed, what stayed

The exporter has two modes. **By default it writes the app's output**: v5.0 plus the changes below,
which you asked for on 2026-10-22. With `compat: 'v5.0'` it writes exactly what v5.0 wrote, quirks
included. The REF1 golden test runs in that mode to keep proving the port byte for byte. A second test
checks that the app output differs from v5.0 only where these changes apply (for REF1: `jobSettings`,
`images`, `titleBlock`).

| # | v5.0 quirk | Your answer | App output now |
|---|---|---|---|
| 1 | Coverage % and Total Scans were computed before reversed scans were flipped, so a reversed scan wasn't counted | Fix | Computed after the flip: a reversed scan counts |
| 2 | Images were inserted for scans switched off | Fix | A scan switched off gets no image |
| 3 | Processed images were all named `S<number>_FIT_B12.png`; `SCAN1` and `SCAN01` shared a file | Better naming | Named after the scan: `SCAN 1` -> `SCAN_1_FIT.png`, `SCAN01` -> `SCAN01_FIT.png`; unsafe characters become `_`; a clash gets `_2`. The image step must use the same names (`processedImageNames`) |
| 4 | The Head MUT comment line is always written when head views are on | Asked where (see below) | Unchanged |
| 5 | Section pages always showed reference labels, even when the drawing hid them | Make them match | Section pages show labels only when the main drawing does (`SL_SECTION_SHOW_REFS "NO"` otherwise) |
| 6 | `SL_OVERLAY_PPI` and `SL_OVERLAY_SCALE` written but used by no LISP code | Remove | Not written (`SL_HATCH_ANGLE` stays; you deferred it) |
| 7 | The shell MUT comment says "rows 91-110" | Explain (see below) | Unchanged |
| 8 | Horizontal CCW right panel ignores the right-ruler shift | Leave as is | Unchanged |
| 9 | A reference tick length of 0 or less becomes 3 | That is the default | Unchanged |
| 10 | Title-block date printed as the cell showed it (`10/13/26`) | Use the earlier ruling | Printed `Oct-13-2026` (title block and section pages) |

**About 4 and 7: where these lines are.** They are comment lines inside the `.lsp` file, in the
drawing command `c:SCANOVERLAY`. In AutoLISP everything after `;;` is a comment: CAD ignores it, it
draws nothing and appears nowhere in the drawing. You'd only see it by opening the `.lsp` in a text
editor:
```
  ;; Shell MUT points - rows 91-110: A=MUT ID, B=X, C=Y, D=Min. T., E=Notes
  (SL_MUTPoint 10. 10. "M1")
  ...
  ;; Head MUT points - overlay right panel
  (SL_HeadMUT ...)
```
- **4:** the `;; Head MUT points` line is written even when there are no head MUT points, so a
  comment heading sits over an empty list. Harmless.
- **7:** the `;; Shell MUT points - rows 91-110...` line describes where v5.0 kept these points on the
  Shell Features sheet (rows 91-110, columns A-E). The app has no sheet rows, so that part is out of
  date, but it is only a note to whoever reads the file. It could be shortened to
  `;; Shell MUT points` if you like.

## Decisions to review

1. **Title-block date format.** Resolved: the app prints `Oct-22-2026` (your earlier ruling); v5.0
   mode prints v5.0's `m/d/yy` for the golden test.
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
