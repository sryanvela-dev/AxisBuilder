# DXF export, model space (Phase 7a)

"Make DXF" on the Export step writes `<job> - AUT Coverage.dxf` in the job folder: the drawing in model space, for
anyone who wants to carry on in AutoCAD or DraftSight. It opens looking like the drawing the .lsp builds (same place,
size, layers and colors), with the app's own work in it: wrapping across the seam, labels placed and moved by hand,
leaders and arrowheads, MUT areas. Paper-space layouts and section sheets are not in it (Phase 7b); the PDF has them.

## How it is built

- `src/export/dxf/exportDxf.ts` (pure): `exportDxf(project, { hidden, imageSizes })` reads `buildDrawing` (every item in
  logical inches on its CAD layer) and turns each shape into a DXF entity in CAD coordinates. Nothing is ported from the
  LISP: the engine already worked everything out.
- `src/export/dxf/dxfFile.ts` (pure): the DXF writer. Written in the app, no library: the format is plain text pairs,
  and the drawing needs exact control over handles, layers and the image objects; it stays small and needs nothing
  loaded at run time.
- `src/ui/exportDxf.tsx`: the Export step's panel. `src/ui/exportImages.tsx`: bringing the processed images up to date
  (shared with Make CAD drawing) and reading their pixel sizes.

## Placement (as the .lsp)

- Points: SL_tf_x / SL_tf_y. Vertical (x, y); Horizontal CW (y, -x); Horizontal CCW (-y, x). That is
  `engine/transform.ts toVisual`, so CAD coordinates = the drawing as it reads.
- Text and arcs turn by SL_rot (Vertical 0, CW -90, CCW +90). Text rotation is written as whole degrees, as SL_Text's
  `(rtos ... 2 0)`.
- The right panel (heads, legend, title block) is the engine's `computeRightPanelLayout`, the .lsp's layout.
- Text heights are final (the Drawing step's size rules, as SL_TextHeight applies them in the .lsp).

## The file

ASCII DXF R2000 (AC1015), ANSI_1252, CRLF. Sections: HEADER (`$INSUNITS` 1 = inches, `$MEASUREMENT` 0, `$EXTMIN` /
`$EXTMAX` around everything, `$LWDISPLAY` 1, `$HANDSEED`), CLASSES (the image objects), TABLES (VPORT `*Active` framing
the drawing, LTYPE, LAYER, STYLE, VIEW, UCS, APPID `ACAD` and `AcCmTransparency`, DIMSTYLE, BLOCK_RECORD), BLOCKS
(`*Model_Space`, `*Paper_Space`), ENTITIES (all in model space, BYLAYER), OBJECTS (root dictionary with ACAD_GROUP,
ACAD_IMAGE_DICT, ACAD_IMAGE_VARS, ACAD_LAYOUT; the Model and Layout1 layouts; RASTERVARIABLES; one IMAGEDEF per image
file; one IMAGEDEF_REACTOR per image). Every object has a unique handle and its owner.

| Drawing shape | DXF |
|---|---|
| line (welds and the centerline in dashes, hatch lines) | LINE |
| rectangle (scans, objects, the vessel, legend samples) | closed LWPOLYLINE (RECTANGLE in the .lsp) |
| circle / arc (nozzles, heads; nozzles across the seam) | CIRCLE / ARC (counter-clockwise, turned by SL_rot) |
| open polyline (leaders), closed outline (MUT areas) | LWPOLYLINE |
| closed arrowhead | SOLID (as DraftSight's direction arrowheads in the .lsp) |
| dot arrowhead | a filled donut: closed two-arc LWPOLYLINE as wide as half the dot (what DONUT draws) |
| text | TEXT, style Standard, MC or ML (justification point 11 set; the baseline start 10 worked out) |
| scan photo (one per piece across the seam) | IMAGE + IMAGEDEF |

Hatches stay plain lines, as the app and the .lsp draw them.

## Layers

`"0"`, then SL_SetupLayers in its order (and SL_SetupViewportLayers: SLG_VIEWPORTS not printed, REPORT_VIEWPORT), the
app's layers (`appLayerSetup`: X_AXIS_LABEL_TEXT, Y_AXIS_LABEL_TEXT, REFERENCE_TEXT, NOZZLE_LEADERS, HEAD_NOZZLE_LEADERS;
MANUAL_UT only for a job with a MUT area, as the .lsp), then any other layer an entity is on. Each gets:

- its color: the .lsp's, with the Drawing step's changes;
- its line weight: the Drawing step's (`lineWeights`), rounded to the nearest standard CAD weight (code 370);
- its transparency: the hatch layers (AUT_HATCH, LEGEND_AUT_HATCH, LEGEND_MUT_HATCH, MANUAL_UT_HATCH) at the hatch
  transparency, CENTERLINE at the centerline transparency (xdata `AcCmTransparency`, as AutoCAD stores layer
  transparency);
- off (negative color) when its group is switched off in the preview, so nothing is lost.

A test checks the list against the library's own SL_SetupLayers.

## Text style

One style, "Standard", font Arial (`arial.ttf`). The .lsp writes text in the drawing's current style, which in a new
AutoCAD or DraftSight drawing is Standard with Arial; the app measures text with Arimo, which has Arial's widths. A
drawing started from another template (an SHX font as Standard) shows the .lsp's text in that font instead.

## Images

- The same processed images as the .lsp (`<job folder>\Processed_Images`, one per piece for a scan across the seam),
  the same insert point (the scan's start corner), size (the scan or piece) and turn. Make DXF processes missing or
  out-of-date ones first, as Make CAD drawing does, then reads each image's pixel size from its PNG header; the IMAGE's
  u and v vectors make one pixel the scan's width / pixel width across and height / pixel height up. An image that
  isn't there yet is still linked (CAD shows it once it is), sized at v5.0's 40 px per inch, and the summary says so.
- Paths: relative to the DXF, `.\Processed_Images\SCAN_1_FIT.png`. The browser can't know full Windows paths, and
  Phase 3a showed AutoCAD keeps relative paths when a folder moves while DraftSight loses full ones. The image-path test
  kit (`npm run dxfpath:test -- "<folder>"`) checks the other forms in both programs.
- "Use scan images" off: no images (the .lsp would try to attach images that were never made).
- IMAGEFRAME: the RASTERVARIABLES frame follows "Show image frames".

## What differs from the .lsp drawing

- Text font: Arial (above); the .lsp uses whatever the drawing's Standard style is.
- Line weights are set on the layers (the .lsp leaves CAD's defaults); `$LWDISPLAY` is on, so they show.
- Nothing else is placed at run time any more: label positions, leaders, fitted text sizes, wrapped pieces, MUT areas
  and the panel are all the engine's, which the .lsp writes too. TEXTRESIZE, NOZZLEWRAP, OBJECTWRAP, SECTIONPAGES and
  the AB... toggles are .lsp commands; the DXF has layers instead.
- Layouts: one empty Layout1 (CAD's default); the .lsp's sheets (ABLAYOUT, section sheets) are Phase 7b.

## Tests and scripts

- `test/export/dxf.test.ts` with a small reader (`test/export/dxfRead.ts`): for every golden job and the sample, the
  file parses, has every section and object, unique handles, every layer used is defined, every entity is in model
  space, and the entities per layer match `buildDrawing`; the vessel outline, a scan, the nozzles (the centers the .lsp
  writes) and a head nozzle are where SL_tf puts them in all three orientations; AutoCAD and DraftSight get the same
  file; arcs, wrapped scan images (size, path, one IMAGEDEF each, reactors), moved labels, MUT areas, arrowheads,
  layers and the text style.
- `npm run dxf:check` / `dxf:write`: fingerprints (`test/export/dxfOutput.sha256.json`), checked by the test.
- `npm run dxf:report -- --out "<folder>"`: the DXF of every golden job and the sample, each with made-up images, for
  a CAD check (the folder must be outside the repo).
- `npm run dxfpath:test -- "<folder>"`: the image-path test kit (README inside).
