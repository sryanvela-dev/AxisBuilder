# data/

The project file schema and the importers that fill it.

- Project file schema: the typed model of one job (project settings, vessel,
  welds, nozzles, objects, heads, MUT points, scans, images). It is the app's
  version of what the v5.0 workbook stores on its sheets.
- Importers:
  - `.xlsm`: read an existing v5.0 AxisBuilder workbook into the schema.
  - AUT CSV: the same header-mapped scan import as `SLG_ImportAUT`.
  - Images: link scan photos to scans by scan number, as `SLG_ScanImages` does.

No drawing or UI code here. Importers return plain data and validation messages.
