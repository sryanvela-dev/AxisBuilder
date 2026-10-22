# REF2

Golden reference job for the parity tests: the v5.0 workbook data (`project.json`) and the master
`.lsp` that AxisBuilder v5.0 generated from it (`v5.0.lsp`, tested in CAD by the user).
Made with `npm run golden:make` from a real job, anonymized. Don't edit these files by hand.

## What the job covers

| | |
|---|---|
| Orientation | Horizontal CW |
| Shell | length 680 in, circumference 339 in |
| Shell Features layout (source workbook) | current |
| CAD platform | DraftSight |
| Head views | BOTH (SMALL) |
| Circ welds / long seams | 6 / 6 |
| Shell nozzles / objects / shell MUT | 10 / 2 / 0 |
| Head nozzles / head MUT | 5 / 6 |
| AUT scans / scan images | 46 / 46 |
| Reference labels | Custom Cardinal, TDC/BDC |
| AUT hatch | on, transparency 50 |

## Renamed for export

v5.0 allowed a name to be used twice; the app needs unique names, so the importer renamed these
(and listed them in its import report). The `.lsp` (v5.0) and the app output differ by exactly
these labels, which the parity test allows:

- Head nozzles: "TOL" -> "TOL (2)"
- Head nozzles: "TOL" -> "TOL (3)"
- Head nozzles: "TOL" -> "TOL (4)"

## What was replaced

Identifying text was replaced with neutral values in both files (only inside LISP strings in the
`.lsp`; geometry, settings, scan names and numbers are unchanged):

- `project.projectName` -> "VESSEL REF2"
- `project.component` -> "VESSEL REF2"
- `project.client` -> "CLIENT A"
- `project.inspector` -> "INSPECTOR A"
- `project.inspectionNotes` -> "NOTE"
- `settings.originalImageFolder` -> `<IMAGE_FOLDER>`
- `settings.processedImageFolder` -> `<PROCESSED_IMAGES>`
- Absolute image paths in the `.lsp` -> `<PROCESSED_IMAGES>/<file>`

No scan photos are included. The `.lsp` keeps v5.0's ANSI encoding and CRLF line endings
(`.gitattributes`: `-text`) and its generation timestamp; the comparison ignores the timestamp.
