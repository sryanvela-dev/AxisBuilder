# REF1-OFF

Golden reference job for the parity tests: the v5.0 workbook data (`project.json`) and the master
`.lsp` that AxisBuilder v5.0 generated from it (`v5.0.lsp`, tested in CAD by the user).
Made with `npm run golden:make` from a real job, anonymized. Don't edit these files by hand.

## What the job covers

| | |
|---|---|
| Orientation | Horizontal CW |
| Shell | length 360 in, circumference 302 in |
| Shell Features layout (source workbook) | current |
| CAD platform | DraftSight |
| Head views | NONE (MEDIUM) |
| Circ welds / long seams | 2 / 0 |
| Shell nozzles / objects / shell MUT | 20 / 3 / 0 |
| Head nozzles / head MUT | 3 / 0 |
| AUT scans / scan images | 17 / 17 |
| Reference labels | Auto Cardinal, TDC/BDC |
| AUT hatch | on, transparency 50 |

## Settings changed for this job

v5.0 generated this .lsp after these settings were changed in the workbook (not saved), so
`project.json` has them too:

- `vessel.referenceLabelMode` = "Auto Cardinal"
- `settings.headViewMode` = "NONE"
## Renamed for export

v5.0 allowed a name to be used twice; the app needs unique names, so the importer renamed these
(and listed them in its import report). The `.lsp` (v5.0) and the app output differ by exactly
these labels, which the parity test allows:

- Head nozzles: "N1" -> "N1 (2)"

## What was replaced

Identifying text was replaced with neutral values in both files (only inside LISP strings in the
`.lsp`; geometry, settings, scan names and numbers are unchanged):

- `project.projectName` -> "VESSEL REF1-OFF"
- `project.component` -> "VESSEL REF1-OFF"
- `project.client` -> "CLIENT A"
- `project.unit` -> "UNIT 1"
- `project.inspector` -> "INSPECTOR A"
- `settings.originalImageFolder` -> `<IMAGE_FOLDER>`
- `settings.processedImageFolder` -> `<PROCESSED_IMAGES>`
- Absolute image paths in the `.lsp` -> `<PROCESSED_IMAGES>/<file>`

No scan photos are included. The `.lsp` keeps v5.0's ANSI encoding and CRLF line endings
(`.gitattributes`: `-text`) and its generation timestamp; the comparison ignores the timestamp.
