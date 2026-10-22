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

No drawing or UI code here. Importers return plain data and validation messages.
