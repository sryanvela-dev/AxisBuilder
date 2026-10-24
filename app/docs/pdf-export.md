# PDF and report images (Phase 4b)

The Export step makes the finished deliverables straight from the app, offline:

- **Make PDF**: `<job name> - AUT Coverage.pdf` in the job folder, every page letter size.
- **Export report images**: one JPEG per sheet for the inspection report (replaces the TightPDF tool).
- **Make CAD drawing (.lsp)**: the backup way (Phase 4a), unchanged by this phase.

All three refuse while there are errors (with a link to the Review step), ask before replacing a file, and end
with a summary of what was written where.

## One sheet model

`src/engine/sheetModel.ts` turns the drawing (`engine/drawing.ts`) and the section plan (`engine/sections.ts`,
`engine/sheets.ts`) into one model per printed sheet: lines, rectangles, circles, arcs, text and photos in paper
inches (y up from the sheet's bottom-left corner), each with its CAD layer, print color, line weight, transparency
and group (the CAD visibility groups, plus the sheet itself and the title/legend panel).

Three things draw from that model, so they always agree:

| Output | Code |
|---|---|
| Sheets view of the preview | `src/ui/preview/SheetsView.tsx` (SVG) |
| PDF | `src/export/pdf/writePdf.ts` (pdf-lib) |
| Report images | `src/export/report/reportImages.ts` (canvas, then jpeg-js) |

`drawSteps` joins neighbouring lines of the same style into one path, and `primOps` turns circles and arcs into
the same Bezier curves for all three. Text is measured with the bundled font (`engine/textMetrics.ts`, widths
generated from the font by `npm run gen:font-metrics`). The section sheets use these widths for the panel, the
reference labels and the rulers: each ruler's numbers, axis label and arrow are stacked outward by their measured
sizes with a clear gap, a number that would touch the next is left out (its tick stays; the end of the ruler is
always numbered). The panel sits past the drawing and its reference labels by a gap in step with the drawing's
width (0.25 to 0.5 in); when the drawing, rulers and panel don't fit across the sheet (a long overview), the
drawing is drawn smaller so the panel keeps its room. The legend keys are stacked, AUT above MUT, as in the
drawing's own legend (click-throughs: labels ran into the numbers and arrows, the legend sat on the overview's
drawing).

## Sheets and page layouts

1. **Main sheet** (always): the whole drawing (shell, rulers, references, the right panel with the head views,
   legend and title block) fitted inside half-inch margins and centred. Landscape when the drawing with its panel
   is wider than tall, portrait when it is taller ("Main sheet" under What is exported: Automatic, Landscape or
   Portrait). v5.0's LISP has no printed main layout (ABLAYOUT / ABOVERLAY only switch layers and the user sets up
   the sheet in CAD), so this is the app's own.

   | Orientation | Usual page | Golden jobs |
   |---|---|---|
   | Horizontal CW | landscape | REF1, REF1-ACAD, REF1-OFF, REF2, sample |
   | Horizontal CCW | landscape | REF1-CCW |
   | Vertical | landscape (portrait only for a drawing taller than wide, e.g. a tall tank with a narrow circumference) | REF3, REF4 |

2. **Overview and section sheets** (when "Make section sheets" is on): exactly the Sheets view's pages
   (SECTIONPAGES' layout from `engine/sheets.ts`), landscape, the drawing clipped to each viewport.

## The PDF

- **Library: pdf-lib 1.17.1** (with @pdf-lib/fontkit 1.1.1). Pure JavaScript, runs in the browser with no server
  and no internet, and gives low-level access to the content stream: vector paths with any line width, ExtGState
  opacity, embedded TrueType fonts (with a ToUnicode map, so the text can be searched and copied), JPEG
  images placed with a transform, and optional content (PDF layers) written by hand (`BDC /OC ... EMC` and
  `/OCProperties`). It is loaded only when you click Make PDF (its own 1.1 MB chunk, precached for offline use).
  jsPDF was the other candidate: its optional-content support is limited and fonts have to be converted first;
  PDFKit needs Node streams bundled into the browser.
- **Font: Arimo Regular** (Apache 2.0, `src/assets/fonts/`), embedded whole (about 310 KB per PDF). The first version
  embedded only the letters used (pdf-lib's subset), and in Edge most letters were missing; the whole font avoids
  that and a test checks it is all there. It has the same character widths
  as Arial, which the preview and the label sizing already measure with, so labels fit the same way in the PDF.
  Its plain sans-serif look is close to the TrueType prints from DraftSight/AutoCAD. Bundled with the app, so it
  works offline (the service worker now precaches .ttf files).
- **Colors**: CAD color numbers with print colors (`aci.ts printRgb`): 7 prints black on white paper, the named
  colors a shade darker than the screen colors so thin lines stay readable.
- **Line weights**: per layer, set on the Drawing step (Lines: colors, weights and transparency). Defaults (mm):
  vessel 0.35; scan outlines, objects, nozzles, welds, seams, heads 0.25; centerline and rulers 0.18; hatch and
  leaders 0.13; everything else (legend, title block, crosshairs, paper rulers) 0.18.
- **Transparency**: hatch layers at the AUT hatch transparency, the centerline at the centerline transparency.
- **Photos**: from the original photos in the photo folder, cut at the seam for scans wrapped across it (both
  pieces), stretched in one direction to the scan's exact shape (as the processed images), then scaled down to
  the PDF photo resolution (default 300 dpi) of the largest size it prints at on any sheet; never more pixels than
  the photo has (`export/pdf/photos.ts printPhotoSize`). Each photo is embedded once (JPEG, quality 0.9) and placed
  on every sheet that shows it. A photo that can't be read is left out and named in the summary.
- **PDF layers** (setting "PDF layers", on by default): named like the preview's toggles: Scans, Hatch, Photos,
  Welds, Nozzles, Objects, Rulers, Heads, Legend and title. All on when the PDF opens; Adobe Acrobat and Reader can
  switch them off in their Layers panel. Edge, Chrome and most other viewers ignore them and show everything, so they
  change nothing for those readers. The sheet's own frame, titles and match lines are on no layer.
- **What is exported** (Export step): "Layers to export" = As the preview (what is ticked on the preview's layer
  chips, `ui/preview/previewPrefs.ts`), Scans (no photos), Overlays (photos with the scan outlines and labels, no
  hatch), or Both scans and overlays (two PDFs and two sets of report images in one click, `... - Scans` and
  `... - Overlays`). The other chips (welds, nozzles, rulers, ...) follow the preview in every set
  (`export/exportSets.ts`). After the PDF is made, "Open the PDF" shows it in a browser tab.

### PDF sizes

Made-up photos of the reference jobs' size (1915 x 957 px, photo-like content), 300 dpi, whole font,
`npm run pdf:report` (`npm run pdf:inspect -- "<file.pdf>"` lists what is inside a PDF: pages, fonts, photo sizes,
drawing commands):

| Job | Sections off | Sections on |
|---|---|---|
| REF1 (CW, 17 photos) | 1 page, 0.49 MB | 4 pages, 0.58 MB |
| REF1-ACAD | 1 page, 0.49 MB | 4 pages, 0.58 MB |
| REF1-CCW | 1 page, 0.49 MB | 4 pages, 0.58 MB |
| REF1-OFF | 1 page, 0.56 MB | 4 pages, 0.58 MB |
| REF2 (CW, 46 photos) | 1 page, 0.73 MB | 5 pages, 1.52 MB |
| REF3 (Vertical, 30 photos) | 1 page, 0.66 MB | 3 pages, 0.69 MB |
| REF4 (Vertical, 18 photos) | 1 page, 0.45 MB | 3 pages, 0.47 MB |
| sample (6 photos) | 1 page, 0.42 MB | 3 pages, 0.44 MB |

The tests fail a golden job's PDF above 5 MB. Real photos can compress differently; the size is in the summary.

## Report images

One JPEG per sheet (main, overview, each section), drawn from the sheet model on a canvas at the report DPI and
cropped to the sheet's printed extents worked out from the model (text measured with the bundled font), plus the
padding on every side: width = ceil(extent width x DPI) + 2 x padding, the same for the height. TightPDF instead
rendered the PDF and cropped to the pixels darker than 248; the result is the same frame without depending on
the pixels.

- Defaults as TightPDF: 300 DPI, quality 95, no chroma subsampling (jpeg-js always writes 4:4:4), 8 px padding,
  the DPI written into the JFIF header. All adjustable on the Export step.
- "Crop to": Everything printed, or Drawing only (leaves out the title block, the legend and the head views).
- Names as TightPDF: `<name>.jpg` for one sheet, `<name>_001.jpg`, `_002`, ... for several; `<name>` defaults to
  the PDF's name ("File name" under Report images on the Export step changes it). Written to the job folder after asking
  about any already there.
- Photos are drawn from the original photos (each sheet's photos are read, drawn and let go before the next).

## Tests

`test/export/pdf.test.ts` (every golden job and the sample job, sections off and on): page count and letter sizes,
one real text per text of the model (and every character in the font's ToUnicode map), photos embedded once at
the expected pixel sizes, PDF layers, the size limit, layers off, lower photo resolution, report image count,
pixel sizes, what each draws (texts, paths, photos, drawing only), where photo corners land (CW, CCW, Vertical),
JPEG sampling, DPI and quality tables, file names, the Sheets view drawing the same texts and paths as the model,
and the font metrics being up to date. `test/export/sheetExtents.test.ts`: everything printed stays on the paper
(main sheet inside its margins). The .lsp fingerprints and compat v5.0 output are unchanged.

## Not proven yet

- Printing on letter paper, and the text in Edge now that the whole font is embedded (click-through list).
- Real photos: sizes and look with the user's photo folders.
- The report images were checked in the browser on the sample job only.
