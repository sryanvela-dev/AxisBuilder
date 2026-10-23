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
- Text sizes and layer colors are the ones set on the Drawing step (same rules as the .lsp, see below);
  TEXTRESIZE in CAD and the legend reflow it does are not shown.
- Section pages, viewports and the layout sheet are not shown.

## App changes made after the preview (2026-10-23, approved)

- Horizontal CCW labels (tall scans and objects, long seams) read upright.
- Nozzle labels (shell and head) are placed by the app and written into the .lsp.
- Head nozzle labels outside move out along their leader until they are clear of other labels, nozzles
  and head MUT text.
- The centerline is drawn with a transparency (setting Centerline transparency, default 50).

All four are in the app's output only; compat 'v5.0' is unchanged (golden tests).

## Text sizes and colors (Phase 3f-1)

The Drawing step sets, per text layer (the 14 layers TEXTRESIZE knows), a size (Automatic, Scale or Fixed
height) and a CAD color, and a color for the main line layers. `engine/styles.ts` turns the settings into
rules per layer; only settings that differ from their defaults give a rule, so a job at its defaults draws
exactly as before (`test/export/appOutput.test.ts`, fingerprints of the app .lsp).

- Sizes: the .lsp writes `SL_TEXT_SIZES` and `SL_TextHeight` and redefines `SL_Text` / `SL_TextLeft` (every
  text in the drawing goes through them) to pass the height through `SL_TextHeight`. Scale multiplies the
  automatic height; Fixed height sets the layer's main text to the height and scales the rest of that layer
  in proportion (the LEGEND heading stays bigger than the legend lines); layers whose height
  varies (scan, object and nozzle labels) get the height for every text. The preview applies the same rule
  to every text shape (`buildDrawing` -> `sizedHeight`). Nozzle label placement uses the sized height.
- Colors: `(SL_Layer "LAYER" n)` lines right after `(SL_SetupLayers)` for changed layers only. The preview
  draws each shape with its CAD color (`engine/aci.ts`; 1-7 use the theme's readable versions, 7 is black
  or white). Check highlights still win.
- Layers the app adds (approved follow-up): X_AXIS_LABEL_TEXT and Y_AXIS_LABEL_TEXT (ruler axis direction
  labels), REFERENCE_TEXT (reference labels), NOZZLE_LEADERS and HEAD_NOZZLE_LEADERS, in the colors those texts and
  lines had. Each text layer has its own row on the Drawing step. In the .lsp, `APP_LIBRARY_PATCHES` changes the
  library lines that must know them (the 9 ruler label lines, the AB... toggles, TEXTRESIZE's legend reflow, which
  moves the head leaders with the heads); TEXTRESIZE is redefined from `TEXTRESIZE_LAYERS` (17 text layers).
- TEXTRESIZE still works on every text layer; its menu numbers moved (Legend 12, Title block 15, All 18).
- A bigger legend or title block (size not Automatic) makes room: the whole legend scales from the panel's
  bottom-left corner (boxes, hatch and text, as TEXTRESIZE does in CAD), the title block lines spread with the
  text, and `computeRightPanelLayout` moves the head views and title block up. Same numbers in the preview and the
  .lsp (scales rounded as the .lsp writes them).
- Not done: a bigger head title or head nozzle text is not given more room; the legend and title splits (heading
  vs lines) were left out because TEXTRESIZE's legend reflow in CAD finds the summary lines on LEGEND_TEXT.

## Planned (not built yet)

Better-looking nozzle leaders (they now have their own layers).
