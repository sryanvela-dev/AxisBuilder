# REF3

Golden reference job for the parity tests: the v5.0 workbook data (`project.json`) and the master
`.lsp` that AxisBuilder v5.0 generated from it (`v5.0.lsp`, tested in CAD by the user).
Made with `npm run golden:make` from a real job, anonymized. Don't edit these files by hand.

## What the job covers

| | |
|---|---|
| Orientation | Vertical |
| Shell | length 168 in, circumference 458 in |
| Shell Features layout (source workbook) | current |
| CAD platform | DraftSight |
| Head views | NONE (SMALL) |
| Circ welds / long seams | 1 / 4 |
| Shell nozzles / objects / shell MUT | 4 / 2 / 0 |
| Head nozzles / head MUT | 0 / 0 |
| AUT scans / scan images | 30 / 30 |
| Reference labels | Custom Cardinal, TDC/BDC |
| AUT hatch | on, transparency 50 |


## What was replaced

Identifying text was replaced with neutral values in both files (only inside LISP strings in the
`.lsp`; geometry, settings, scan names and numbers are unchanged):

- `project.projectName` -> "VESSEL REF3"
- `project.component` -> "VESSEL REF3"
- `project.client` -> "CLIENT A"
- `project.inspector` -> "INSPECTOR A"
- `settings.originalImageFolder` -> `<IMAGE_FOLDER>`
- `settings.processedImageFolder` -> `<PROCESSED_IMAGES>`
- Absolute image paths in the `.lsp` -> `<PROCESSED_IMAGES>/<file>`

No scan photos are included. The `.lsp` keeps v5.0's ANSI encoding and CRLF line endings
(`.gitattributes`: `-text`) and its generation timestamp; the comparison ignores the timestamp.
