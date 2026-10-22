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

Rules for the .xlsm importer (later phase):
- Head clock positions in degrees ("90°", accepted by v5.0) convert to clock time (90° -> 3:00)
  and are marked for review; the app itself only accepts clock positions 1-12.
- Head "Custom Radius Factor" (0-1) becomes `customRadiusPercent` (factor x 100).
- Dates convert to YYYY-MM-DD.

No drawing or UI code here. Importers return plain data and validation messages.
