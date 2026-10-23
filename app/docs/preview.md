# Drawing preview (Phase 3e)

The preview beside the Project, Field data, AUT scans and Images steps shows the drawing as the .lsp
will draw it in CAD, in all three orientations, and updates as you edit.

## How it is built

- `src/engine/layout.ts`: the job layout v5.0's VBA works out before drawing (right panel, head
  positions, clock angles, radius factors, reference labels, title lines, scans as drawn, coverage, the
  images to insert). Moved unchanged out of `exportLsp.ts`; the exporter uses it, and all 7 golden jobs
  still match v5.0 byte for byte.
- `src/engine/rulers.ts`: the ruler calls are read from the same generated code the exporter writes
  (`PrintVisualRulers`), so the preview can't disagree with the .lsp about rulers.
- `src/engine/drawing.ts`: `buildDrawing(project)` gives drawing items in logical coordinates, each with
  its CAD layer, its source row (list + index + ID) and hover text. The shapes are TypeScript ports of the
  LISP drawing functions (SL_LabelRect, SL_HatchRect, SL_CircleSmart, SL_CircWeld, SL_LongSeam, the
  rulers, SL_Legend, SL_TitleBlock, SL_HeadView, SL_HeadNozzle, SL_HeadMUT).
- `src/engine/transform.ts`: the orientation transforms and text rotations (SL_tf_x/y, SL_rot,
  SL_ReadableRot, SL_RulerTextRotX/Y, SL_HeadVector).
- `src/ui/preview/`: the render model (one SVG path per item and layer, texts placed and rotated like
  CAD), the SVG view (drag to pan, wheel/buttons to zoom, Fit), and the panel (layer toggles matching the
  CAD visibility commands, photos, full size, click an item to go to its row, check highlights).

Tests: `test/engine/drawing.test.ts` checks the engine against the exported .lsp of every golden job
(scan and object rectangles, images, nozzles, MUT, welds, head views and nozzles, legend, title block,
rulers, reference ticks), the ruler reading and the transforms; `test/ui/preview.test.ts` checks the
screen mapping, upright texts, transparency and the row/item selection mapping.

## Preview approximations (where it can differ from CAD)

Nozzle labels are not an approximation any more: `engine/labels.ts` places them, and the .lsp writes the same
positions (`SL_NozzleAt`), so they match CAD exactly.

CAD decides some things while it draws. The preview uses the same formulas (marked "preview
approximation" in the code):

- Text sizes fitted to scan and object boxes (SL_FitTextHeight): same formula.
- Text is drawn with a browser font (Arial); CAD uses its own font, so text width differs a little.
- Scan photos are the original photos stretched to the scan (thumbnails), not the processed images.
- Text sizes are the starting ones; TEXTRESIZE in CAD and the legend reflow it does are not shown.
- Section pages, viewports and the layout sheet are not shown.

## App changes made after the preview (2026-10-23, approved)

- Horizontal CCW labels (tall scans and objects, long seams) read upright.
- Nozzle labels (shell and head) are placed by the app and written into the .lsp.
- Head nozzle labels outside move out along their leader until they are clear of other labels, nozzles
  and head MUT text.
- The centerline is drawn with a transparency (setting Centerline transparency, default 50).

All four are in the app's output only; compat 'v5.0' is unchanged (golden tests).

## Planned (not built yet)

The author wants, later: text size and color control in the app, more text on its own CAD layers so each
kind can be sized and colored separately, and better-looking nozzle leaders. A proposal is in the
Phase 3e summary; it will get its own phase.
