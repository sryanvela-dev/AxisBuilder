# data/

The project file schema and the importers that fill it.

- Project file schema: the typed model of one job (project settings, vessel,
  welds, nozzles, objects, heads, MUT points, scans, images). It is the app's
  version of what the v5.0 workbook stores on its sheets.
- Importers:
  - `.xlsm`: read an existing v5.0 AxisBuilder workbook into the schema.
  - AUT CSV: the same header-mapped scan import as `SLG_ImportAUT`.
  - Images: link scan photos to scans by scan number, as `SLG_ScanImages` does.

Files:
- `settings.ts`: every Project Settings / Drawing Information value, defined once (key, v5.0 Excel
  label, plain name, description, type, units, range, default, app step, level).
- `schema.ts`: the Zod project file schema (lists, IDs, coordinates) built on those tables.
- `projectFile.ts`: `saveProject` / `openProject` (JSON, `schemaVersion`, defaults, plain-language
  errors) and the `MIGRATIONS` table for upgrading older files.
- `settingsDoc.ts`: renders `app/docs/settings-review.md` (`npm run docs:settings`).
- `xlsmImport.ts`: `importWorkbook(bytes)` reads a v5.0 .xlsm/.xlsx (SheetJS) into a project plus an
  import report and summary.
- `autCsvImport.ts`: `importAutCsv(bytes)` reads the AUT ScanSheet CSV (v5.0 Import AUT rules) into scans plus
  a row-numbered report; `replaceScans` puts them in a project (clears image links, like v5.0).
- `imageMatch.ts`: `matchScanImages(scans, fileNames)` matches a folder's photos to scans (v5.0
  SelectScanImageFolder / ScanNumberFromName rules); `applyImageChoices` saves the confirmed file per scan into
  the project's scan image links. No image processing.

.xlsm importer rules:
- Project Settings / Drawing Information by label (also older labels), ignoring case and extra or
  non-breaking spaces; the five custom reference labels by position below Reference Label Mode.
- Shell / Head Features sections found by header text, so the current and the older 20-nozzle layout
  both import. Scan Import inputs only (A-E, L); formula columns F-K ignored.
- Include columns: YES/Y/TRUE/1 = yes, NO/N/FALSE/0 = no, blank = yes (v5.0's "not NO"). Weld Label
  columns: blank = no (v5.0's "= YES").
- Head clocks: text kept; Excel time numbers (older workbooks) and degrees ("90°" -> 3, marked for
  review) are converted. Custom Radius Factor (0-1) becomes `customRadiusPercent` (x 100).
- Dates convert to YYYY-MM-DD. Repeated IDs are renamed "N1 (2)". Rows with data but no ID, rows with an
  unreadable ID or head, and Scan Images rows for unknown scans are not imported.
- Every skipped, changed, invalid, REVIEW or yellow-highlighted value is listed in the report. Bad values
  are left blank (null) or at their default; `findMissingData` lists what must be filled in before export.
- Test workbooks: `npm run fixtures:xlsm` rebuilds `test/fixtures/xlsm/` (fictional data).

AUT CSV rules (v5.0 Import AUT): columns by header (File Name / Scan Name / File, X-Start, X-Stop, Y-Start,
Y-Stop; case, spaces and - _ . ' " ignored); names trimmed, spaces collapsed, upper case; "cal" and nameless rows
skipped and listed. A missing column, short row, blank or non-numeric coordinate, or duplicate name (ignoring
case) stops the import with nothing imported; every problem is listed. No 150-scan limit. A scan with start = stop
keeps its row with the stop value blank (listed).

Image matching rules (v5.0): scan number = first digit group; .png/.jpg/.jpeg only; pattern = base name with that
digit group as "#"; `patterns` lists every format in the folder with scan and file counts, the one covering most
scans is used (`needsPatternChoice` when several do; the caller can pass `pattern`), and `nothingFits` flags a folder
where no file fits any scan (probably the wrong folder). Per scan: one file in the chosen pattern = matched; otherwise all files with that number are
candidates (`choose`), unless the scan's current image file is one of them (kept). Current image files resolve
like `ResolveSourceImagePath` (exact name, else .png, .jpg, .jpeg). `replacesExisting` marks matches that differ
from the current file (v5.0 asked before replacing). Top-level files only.

No drawing or UI code here. Importers return plain data and validation messages.
