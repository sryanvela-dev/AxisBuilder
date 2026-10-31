# report/

The AUT report module (design: `app/docs/report-design.md`). Kept apart from the drawing code; it reads the drawing's
data (job fields, scans, MUT rows, nozzles, coverage) and never copies it.

Phase R1 (data, templates, calculations, import; no screens or PDF yet):
- `schema.ts`: the report data under the project file's `report` key (format 7; picture edits in format 8): components, report-only job fields,
  calibration, scan results, manual readings, photos, custom sheets, uploads, text, sections, options.
- `report.ts`: starting a report (`createReport`), which component a scan or reading belongs to, linked MUT rows.
- `sync.ts`: `syncReport`, run after every edit (state/session.ts): results and readings follow renamed, sorted and
  deleted drawing rows.
- `templates/`: template types, the registry and `generic.ts` (Generic AUT). A template is data; no code checks its id.
- `calc/`: pure functions: wall loss, ladder and comment builder (`ladder.ts`), temperature correction, readings from
  increments, numbers in words (`numbers.ts`), scan / reading rows, totals and coverage (`results.ts`), the pipe wall
  table and nominal pick (`pipeWalls.ts`), text block filling (`textFill.ts`).
- `scansheetImport.ts`: the AUT Solutions scansheet.csv and pasted scan sheets (positions through the drawing's AUT
  CSV import).
- `checks.ts`: checks on the report (design 9 and 14, full since R4): errors block the PDF, warnings and notes don't.
- `summary.ts`: the Summary step's tiles, generated and edited scope / summary text, sentences left out (R4).
- `crop.ts`: the crop tool's geometry; `pagesEdits.ts`: picture edits by place, custom sheets, uploads; `pdfInfo.ts`: uploaded PDF
  page sizes, locked / damaged (R4).

Phase R2 (the Report workspace screens, in `ui/report/`):
- `edits.ts`: every report change the screens make, as a pure function of the project (one undo step each).
- `savedLists.ts`: saved lists per computer (browser storage, never in the .axb), with file export / import.
- `readingPaste.ts`: manual readings pasted from Excel (column match, report rows only).

Phase R3 (pages and the PDF):
- `fonts.ts` + `fontMetrics.generated.ts`: the brand fonts' widths, text wrapping and fitting.
- `imageInfo.ts`: size and EXIF orientation of a JPEG or PNG; `imageItems.ts`: every picture with its edits (format 8).
- `pageModel.ts`: the export-neutral pages (inches, y down) and the picture geometry (EXIF, turn, crop).
- `marks.ts`: picture marks as vector items.
- `pages/`: `buildReport` and one builder per page type (`layout.ts` holds the style and the standard frame).
- `pdf/writeReportPdf.ts`: the page model as a PDF (pdf-lib).
