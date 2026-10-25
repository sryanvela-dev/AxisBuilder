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

## Wrapping across the seam (Phase 3f-2)

X = 0 and X = circumference are the same line on the vessel. The preview draws every shell nozzle, object and scan
that crosses it in pieces, exactly as the .lsp does (`engine/wrap.ts`): a rectangle as two pieces with the ID on the
larger one (both scan pieces hatched), a nozzle as its arc inside plus the overhanging arc at the other edge (arc
shapes, drawn counter-clockwise in logical axes). A wrapped scan's photo is shown in two parts, each the part of the
photo for its piece (the same split as the processed _A / _B images). Hover text says "across the seam".

## Section sheets (Phase 3f-2)

While "Make section sheets" is on (Drawing step), the preview draws the plan (layer SECTION_PLAN, toggle "Sections"):
each section across the whole circumference with its number, and dashes where the sheet's overlap ends. The Sheets
button opens full size and flips through the sheets as they print (`ui/preview/SheetsView.tsx`): white paper, print
colors (7 prints black), letter landscape, the template viewport area assumed to be 10 x 7.5 in. Everything on a sheet
is `engine/sheets.ts` (`sheetPages`): the viewport placed as SECTIONPAGES does (68% of the width, the information panel
on the right), SECTIONPAGES' paper rulers, reference labels and title/legend panel, "SECTION n OF N", match lines
"MATCH LINE - SEE SECTION n", and on the overview a numbered box per section. Vertical layouts get vertical sheets (the
length up the sheet, the circumference across; app only, CAD builds horizontal sheets). In CAD the real template
viewport sets the scale, so it can differ a little from the preview.

The divider on the preview's left edge (`PreviewSplitter.tsx`) makes the page or the preview wider (drag, or arrow
keys); the width is remembered in the browser.

## Drawing mode: moving labels (Phase 5b)

"Move labels" above the preview turns on drawing mode (a blue frame and a status line say so). Pan and zoom still work:
the wheel zooms; a drag on empty space, a middle-button drag or Space+drag moves the view.

- Hover outlines a label that can be moved: shell and head nozzle labels (including one across the seam), circ weld and
  long seam labels, object IDs and shell MUT labels (2026-10-25). Click selects it and its table row
  (`selectionContext`); Esc clears the selection (before Esc closes full size).
- Weld, seam, object and MUT labels move as text. A moved MUT label gets a leader to its point (the label is the only mark
  of the point); a moved object ID outside its rectangle gets a leader to the nearest edge (inside, none); weld and seam
  labels never get one. Their leaders use the leader shape and leader arrowhead. Dropped off the shell, the label goes
  back to its automatic spot and the status line and Review say so.
- Drag the label anywhere: while you drag, a dashed ghost shows the label and its leader redrawn from the nozzle in the
  current shape and arrowhead. Dropped inside the circle, it becomes an inside label (no leader) only when it fits there
  (the same inside rule as automatic placement); otherwise it stays where it was dropped, with a leader.
- The selected label has a round handle on its leader end: drag it around the circle (it stays on the circle; on a
  nozzle across the seam, on the drawn part).
- Arrow keys nudge the selected label 0.5 in; Shift+arrows 6 in (as the drawing reads). A run of nudges on one label is
  one undo step; every drag is one undo step.
- Reset: right-click the label (Reset position), the Reset position button in the status line, or the "Moved ↺" chip by
  its row number. "Reset all moved labels" is under Leaders and arrows on the Drawing step (asks first).
- Snapping: a dragged label lines up with the centers of other labels (same x or y); Shift = free, Ctrl = keep it level
  or plumb with where it started. The leader end snaps to the circle; Ctrl holds it right, up, left or down. A green
  marker shows the snap.

How it is built:

- Project file format 5: `labelOverrides` (`data/schema.ts`), each `{ list, id, occurrence, label, tip }`, keyed by the
  item's list, ID and occurrence (which of the rows with that ID: nozzle names may repeat), not its row number. `label` =
  the label center as an offset from where it is drawn automatically (`{ dx, dy }`, inches as the drawing reads; for a
  nozzle from its center, so a corrected nozzle X/Y moves the label with it), `'inside'` (nozzles), or null (automatic).
  `tip` = a nozzle leader end as an angle on the circle (degrees as the drawing reads, 0 = right, counter-clockwise) or
  null. `data/overrides.ts` sets and resets them by row (`setOverride(p, list, index, change)`); `syncLabelOverrides` (run
  after every edit in `state/session.ts`) follows the row itself (an edit replaces only the rows it changes): sorted or
  inserted rows, a rename, a delete.
- `engine/textLabels.ts`: the weld, seam, object and MUT labels (`textLabelSpecs`: automatic spot, height, rotation,
  leader target; `placeTextLabel`: the move, its leader, the off-shell fallback). `buildDrawing` draws them where placed;
  the .lsp (app only, only for moved ones) writes the weld / seam / object without its label and an `SL_Text` plus
  `SL_LeaderPart`s where it was put.
- `engine/labels.ts`: labels moved by hand are placed first; automatic labels then keep clear of them and their
  leaders. Each `NozzleLabel` says `moved`; a move that no longer makes sense falls back to automatic with `fallback` (off
  the shell; in the shell or more than a head diameter from its head; no longer fits inside). A moved label is checked
  against everything as finally placed (`crowded`), and so is every automatic outside label (its label box: a later
  nozzle or label may land on it). `nozzleLabelNotes` feeds the Review warnings ("Label N2 (moved by
  hand) overlaps scan 3", "Label N2 was moved by hand, but it was off the shell, so it is placed automatically"), both
  with a one-click Reset position; neither blocks export or saving.
- `engine/leaders.ts` `leaderToLabel`: the leader to a label at a given spot (Straight; Elbow with its horizontal landing
  into the near side of the label; Curved), the tip at the given angle or facing the label, held to the drawn arc.
- `engine/labelDrag.ts`: what a drop or a nudge stores (`dropLabel`, `dropPlaced`, `dropTip`, `nudgeLabel`, `NUDGE` /
  `NUDGE_BIG`).
- `buildDrawing` returns `labels` (`PlacedLabel`: every movable label as placed, its box as the drawing reads, its anchor,
  `moved`, and `nozzle` or `text`) for the preview's tool and, later, the DXF. The Sheets view, PDF, report images and
  the .lsp draw what the engine placed, so they all follow the moves. With no moves the output is unchanged (fingerprints).
- `engine/snap.ts`: the shared snap engine (pure). `snapGeometry(drawing)` reads the real lines, rectangles, circles and
  arcs (hatch left out) as the drawing reads; `findSnap` picks endpoint > intersection > center > perpendicular (from where
  the move started) > align > on a line or circle, within a tolerance; Shift = free, Ctrl = ortho.
- UI: `ui/preview/drawingTool.ts` (the tool interface: hover, down, move, up, menu, overlay; `DrawingView` routes the
  pointer to it and keeps pan and zoom), `labelTool.tsx` (the label tool), `SnapMarker.tsx` (one symbol per snap kind),
  `MoveLabels.tsx` (the job side: undo steps, keys, status line, menu). MUT areas (5c) are meant to be another tool.

## Drawing mode: MUT areas (Phase 5c)

"MUT areas" above the preview is the second drawing-mode tool (Move labels is the first; one at a time). A status line
under the layer chips says what to do at each step and keeps one height, so the drawing doesn't jump.

- **Start**: select a MUT row (click its area in the drawing, or a row of the Shell MUT / Head MUT table) and use Draw area
  or Pick inside in the status line, or use the buttons in the table's Area column (they open the preview on that row).
  With no MUT row selected, "New: draw area" / "New: pick inside" make a new MUT row (next free ID) when the shape
  closes: on the shell, or on a head when the first corner (or the picked point) is inside a head circle.
- **Draw area**: click the corners. Click the first corner again, press Enter, right-click or "Close the area" to close
  it (3 corners or more). Backspace takes the last corner away, Esc cancels. The status line shows the cursor's position
  and the last corner (shell: X around and Y along, in inches; head: inches right / left and up / down from the head's
  center), and "Next corner" takes typed values: `12.5, 30`, lengths as in the tables (`12 1/2, 2' 6"`), or `@5, 0` from
  the last corner. On the shell a corner past the left or right edge (X below 0 or past the circumference) wraps round:
  the area is drawn in two pieces at the two edges with one ID, as scans are.
- **Snaps** (`areaGeometry` + the shape drawn so far, through `findSnap`): endpoint (scan and object corners, the shell's
  corners, its own corners), intersection (a weld crossing a seam, a line crossing a nozzle), center (nozzles),
  perpendicular (from the last corner to a line), on a line or circle. Shift = no snap; Ctrl = level or plumb with the last
  corner. Lines are the real ones (welds whole, not their dashes): the shell's edges, circ welds, long seams, scan outlines,
  objects, nozzle circles and other MUT areas; on a head, the head circle, its centerlines, head nozzles and other areas on
  that head.
- **Pick inside**: one click inside a space closed all round by those lines (like CAD's hatch pick point / BOUNDARY); the
  app finds the smallest closed outline around the point (`pickInside`, `polygon.ts enclosingBoundary`: lines split where
  they cross, loose ends trimmed, the face around the point walked). Something wholly inside (a nozzle, an object) is not
  part of the outline; it is left unhatched as an island. Not closed: the status line says so and offers "Draw area
  instead".
- **Editing**: the selected row's area shows its corners and a + on each edge. Drag a corner (snaps as above, the area's
  own outline left out); drag or click a + to add a corner there; click a corner and press Delete (or Backspace, or
  right-click > Remove corner) to remove it (an area keeps 3); Delete with no corner selected, the status line's "Delete
  area", right-click > Delete area or the ✕ in the Area column delete the area (the row stays, a MUT point again). "Draw
  again" replaces it. Every action is one undo step (Ctrl+Z / Ctrl+Y). The ID label moves with Move labels like the other
  labels (a `shellMut` / `headMut` label override).

How it is built:

- Project file format 6: `area` on shell MUT and head MUT rows (`data/schema.ts`): the corners in order, or null. Shell:
  logical inches (X may run past the seam). Head: head radii from the head's center as the head view reads (u toward
  3 o'clock, v toward 12), so an area stays on its head when the right panel moves or the head view changes size. Being on
  the row, an area goes with its row through sorting, renames and deletes. Fewer than 3 corners, a crossing outline, a part
  off the shell or outside the head: a Review warning (`mutAreaProblems`), never a refusal to save or export.
- `data/mutAreaEdits.ts`: `setArea` (a blank shell X / Y gets the area's center; a head MUT with no clock gets the
  center's clock and Custom radius %), `deleteArea`, `moveCorner`, `insertCorner`, `removeCorner`, `addMutWithArea`.
- `engine/mutAreas.ts` (pure, cached per project version): `mutAreaLayouts(p)` gives each drawn area its outline pieces
  (logical; shell: clipped to the shell and wrapped like scans), the ID's spot (the centroid when the label fits there,
  else the most open spot where it fits, else beside the area with a leader into it; a move by hand applies), the hatch
  lines (45 degrees, the scan hatch spacing, `polygon.ts hatchLines`) with islands left empty: scans, objects, nozzle
  circles, nozzle labels and the area's own label; and `coverageArea`. The drawing draws a shell MUT row with an area
  instead of its point marker (head MUT likewise), on MANUAL_UT_HATCH (its color, transparency and line weight; outline
  and hatch both, in the "MUT areas" layer group) with the ID on SHELL_MUT_TEXT / HEAD_MUT_TEXT at their size.
  Setting "Show Min T under the MUT ID" (Drawing step, Show or hide; off by default) adds a second line.
- Coverage: `coveragePercent(p, counted, mutCoverageArea(p))`: the hatched part of each shell area (the area on the shell
  minus scans, objects and nozzles inside it; labels don't count against it) is added to the scanned area; scan-to-scan
  overlaps stay gross as before; head areas never count; compat v5.0 passes nothing, so its figure is unchanged.
- The preview, Sheets view, PDF, report images and the .lsp (app change 28) all read the same layouts; the DXF (7a) will
  too.
- UI: `ui/preview/MutAreas.tsx` (the tool, status line, menu), `ui/preview/areaDraw.ts` (pure: adding and removing corners,
  closing, the snaps, typed points and their frames), `ui/areaToolContext.ts` (which tool the preview has and what the
  MUT areas tool is doing, owned by the job screen so the table can start it), `ui/AreaCell.tsx` (the Area column: the
  area's size in sq in, plus sq ft from 1 sq ft up; head areas "about", measured on a flat circle of the shell's diameter).

## Planned (not built yet)

Not movable (on purpose): scan IDs (centred in their scan), reference labels and the title / legend panel (the section
sheets lay them out).
