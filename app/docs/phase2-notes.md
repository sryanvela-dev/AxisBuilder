# Phase 2 notes: LISP exporter

Status, v5.0 quirks and what changed, decisions to review, and what's needed next.
Branch `feature/lsp-exporter` (local commits only; not pushed).

## Result

**All 32 REF1 sections match v5.0, and so does the whole file byte for byte**, apart from the one
allowed label difference (head nozzle `"N1 (2)"`, renamed by the importer, vs `"N1"` in v5.0; see "Decisions").

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
`images`, `titleBlock`, plus `header` for the new header text).

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

Your answers of 2026-10-22 are noted per item.

1. **Title-block date format.** Done: the app prints `Oct-22-2026` (title block and section pages),
   per your ruling. Only `compat: 'v5.0'` (the golden test) prints v5.0's `m/d/yy`.
2. **Repeated names.** Done, as you asked: the importer renames the later one (`N1` -> `N1 (2)`)
   and lists every rename in the import report ("also used by ...; renamed to ..."). Export still
   refuses a repeated name you type in by hand later (`findDuplicateIds`). REF1's README lists its
   one rename; the parity test allows exactly that label difference.
3. **Image folder in the `.lsp`.** Still open; see "Image folder: where we are" below.
4. **Timestamp.** OK as is: the header time is `options.generatedAt`, or the current time.
5. **Header text.** Done: the app writes `;;; Generated by AxisBuilder on ...`; v5.0 mode keeps
   `;;; Generated from Excel on ...`.
6. **Validation.** Later, in its own step. The image step already checks the photos (matching,
   wrong folder, choices). For now the exporter only refuses on missing values and repeated names,
   and flips reversed scans when Enable Validation is on.
7. **Number formatting edge cases.** OK as is.
8. **Yes/No settings.** Left as is; the explanation is below.
9. **Widths.** OK as is.

### Item 8 explained

In v5.0 a Yes/No setting is a text cell. Some VBA lines compare it exactly: "is the cell, in capitals,
equal to YES?" A few of those don't trim spaces first. So if a cell held `YES ` (with a stray
space, easy to type by accident), v5.0 treated it as **NO**, and the drawing left that item out.
Examples are Show Vessel On Overlay, Show Welds On Overlay and Show Legend On Overlay.

The app doesn't store text for these. It stores a real Yes/No (true/false), and the importer reads
`YES `, `Yes`, `Y`, `TRUE` and `1` all as Yes. So the app can't reproduce that v5.0 behavior, and
that's a good thing: a stray space no longer silently hides part of the drawing. The only effect is
that an old workbook with such a stray space would now draw the item where v5.0 left it out.

### Image folder: where we are

What we decided earlier: photos are **linked, not copied**, and **Original Image Folder stays** in
the project for now. The open part is the **full Windows path** of the processed images, which
v5.0 writes into the `.lsp` (`"C:/.../Processed_Images/S1_FIT_B12.png"`). Excel's folder picker
gives that path; a browser's never does (privacy). The choice was left for the Images step, after a
test in DraftSight. The three options were:

- **A. CAD asks once.** The `.lsp` has only file names. When you run `AXISBUILDER`, it looks for
  the images next to the `.lsp`. If it can't find them, it shows the normal Open dialog once and you
  click one processed image.
- **B. Desktop app.** Package the same app as an installed Windows program (Tauri), whose folder
  picker returns full paths like Excel's. Everything works as in v5.0, but the app has to be
  installed instead of opened in a browser.
- **C. Relative paths.** Write `Processed_Images/SCAN_1_FIT.png` (no drive letter) and let CAD
  resolve it from the folder of the saved drawing or the `.lsp`. This works only if DraftSight and
  AutoCAD resolve it that way, which needs a test.

**Suggestion:** build the Images step on **A with C as the first try**. The app writes the `.lsp`
and the `Processed_Images` folder together into one folder you pick (you said that's how you want
to save it). The `.lsp` first tries the relative path (C), and only if CAD can't find the images
does it ask you once to click one (A). No typing paths, no installation.

To make that safe, the first job of the Images step is a **small test `.lsp`** you load in
DraftSight (and AutoCAD if you have it). It tries the relative path and the one-click fallback and
prints which worked. Keep B in reserve if neither works well. The exporter already takes the folder
as an option, so any of the three fits without changing the parity tests.

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
