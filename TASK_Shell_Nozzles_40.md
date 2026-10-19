# Task: double the Shell Features nozzle block from 20 to 40 rows (single contiguous block)

Read CLAUDE.md first and follow its editing rules (src/*.bas is master, cp1252 + CRLF, ASCII only,
Option Explicit, small targeted changes, never touch the .xlsm). When done: list which modules changed,
update the "Sheet layout" section and Change log in CLAUDE.md, and tell the user to do the workbook step
below at the same time as re-importing.

## Decision (user, 2026-10-19)
- The extra nozzle slots are for TYPING into the sheet only. The paper field form, the OCR prompt template and
  OCR nozzle capacity stay at 20 (N1..N20 still go to rows 27-46).
- One contiguous nozzle block of 40 rows: rows 27-66. No second block elsewhere.

## Workbook step (the USER does this in Excel, not Claude)
On Shell Features select rows 46:65 (20 rows), right-click > Insert. Inserting inside the block (above the old
last row) extends the Include / Label Mode dropdowns automatically. Then check borders and shading on the new rows.
Resulting layout:

| Block | Old rows | New rows |
|---|---|---|
| Nozzles / Circles data | 27-46 | 27-66 |
| "Objects" header / column header | 47 / 48 | 67 / 68 |
| Objects data | 49-68 | 69-88 |
| "Shell MUT" header / column header | 69 / 70 | 89 / 90 |
| Shell MUT data | 71-90 | 91-110 |

Circ welds (3-12) and long seams (15-24) do not move. The workbook and the re-imported modules must match, so
do not run OCR import, New Project or Generate between inserting the rows and re-importing the modules.

## Code changes (all hard-coded row numbers; nozzle reading itself is already dynamic, leave it alone)
Objects 49-68 -> 69-88 and Shell MUT 71-90 -> 91-110 everywhere, and nozzle ranges 27-46 -> 27-66 where listed.

SLG_Utilities
- `ExportScanLayoutLSP`: `For r = 49 To 68` (and the comment "rows 49-68") -> 69 To 88; `For r = 71 To 90` (and the
  comment "rows 71-90") -> 91 To 110.
- `ExportAxisBuilderLSP`: the same two loops and comments (around lines 4498-4518).
- Validation: `For r = 49 To 68` (Objects) -> 69 To 88; `For r = 71 To 90` (Shell MUT) -> 91 To 110.
- Nozzle validation and `PrintShellNozzleLispRows` find the section by header and read to the next header, so they
  need no change. Confirm `SectionLastRow` still stops at the "Objects" header.

SLG_OCR_Importer
- `ImportShellMUT`: `rowNum = i + 70` -> `i + 90`. `ImportObjects`: `rowNum = i + 48` -> `i + 68`.
  `MarkMissingStructuredFields`: SHELLMUT `itemNum + 70` -> `+ 90`; OBJECTS `itemNum + 48` -> `+ 68`.
  Leave SHELLNOZZLES `+ 26` and the 20-nozzle template/prompt/summary alone.
- Reset block (around lines 248-262): `A27:H46` -> `A27:H66`, `A49:G68` -> `A69:G88`, `A71:E90` -> `A91:E110`;
  default fills `G27:G46` -> `G27:G66`, `H27:H46` -> `H27:H66`, `F49:F68` -> `F69:F88`.
  (A fresh OCR import resets the whole sheet, so clearing all 40 nozzle rows is intended.)

SLG_NewProject (`ClearShellFeatures`)
- `A27:H46` -> `A27:H66`, `A49:G68` -> `A69:G88`, `A71:E90` -> `A91:E110`.

SLG_Dashboard (`CountShellFeatures`)
- `A27:A46` -> `A27:A66`, `A49:A68` -> `A69:A88`, `A71:A90` -> `A91:A110`.

After editing, grep all of src for any remaining `46`, `49`, `68`, `71`, `90` row references tied to Shell Features
(also strings such as "A49:G68" and "G27:G46") and report any you deliberately left.

## CLAUDE.md
Update the Shell Features layout line (nozzles 27-66, objects 69-88, shell MUT 91-110), and add a Change log entry.
Note that OCR still imports at most 20 nozzles (N1..N20 into rows 27-46).

## Test checklist for the user (after inserting the rows, re-importing, compile, re-sign)
1. Generate a drawing with a nozzle in row 27 and one in row 66: both appear.
2. Objects and Shell MUT entries (now at rows 69 and 91) still draw; validation still flags a bad number in them.
3. Run an OCR import: nozzles land in rows 27-46, objects start at row 69, shell MUT at row 91. Nothing lands in rows 47-66.
4. New Project clears every block, including rows 47-66.
5. Home project summary counts nozzles in the new rows.
6. Include and Label Mode dropdowns work on rows 47-66.
