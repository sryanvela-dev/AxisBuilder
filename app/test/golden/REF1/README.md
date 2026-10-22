# REF1

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
| Head views | BOTH (MEDIUM) |
| Circ welds / long seams | 2 / 0 |
| Shell nozzles / objects / shell MUT | 20 / 3 / 0 |
| Head nozzles / head MUT | 3 / 0 |
| AUT scans / scan images | 17 / 17 |
| Reference labels | Custom Cardinal, TDC/BDC |
| AUT hatch | on, transparency 50 |

Note: 1 name(s) are used twice in the workbook (v5.0 keeps them; the app renames the second, e.g. "N1 (2)"), so `project.json` and the `.lsp` differ there on purpose.

## What was replaced

Identifying text was replaced with neutral values in both files (only inside LISP strings in the
`.lsp`; geometry, settings, scan names and numbers are unchanged):

- `project.projectName` -> "VESSEL REF1"
- `project.component` -> "VESSEL REF1"
- `project.client` -> "CLIENT A"
- `project.unit` -> "UNIT 1"
- `project.inspector` -> "INSPECTOR A"
- `settings.originalImageFolder` -> `<IMAGE_FOLDER>`
- `settings.processedImageFolder` -> `<PROCESSED_IMAGES>`
- Absolute image paths in the `.lsp` -> `<PROCESSED_IMAGES>/<file>`

No scan photos are included. The `.lsp` keeps v5.0's ANSI encoding and CRLF line endings
(`.gitattributes`: `-text`) and its generation timestamp; the comparison ignores the timestamp.
