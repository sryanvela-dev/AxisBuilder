# report/

The AUT report module (design: `app/docs/report-design.md`). Kept apart from the drawing code; it reads the drawing's
data (job fields, scans, MUT rows, nozzles, coverage) and never copies it.

Phase R1 (data, templates, calculations, import; no screens or PDF yet):
- `schema.ts`: the report data under the project file's `report` key (format 7): components, report-only job fields,
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
- `checks.ts`: checks on the report data (not shown in the app until R4).

Later phases add `pageModel.ts`, `pages/`, `pdf/` (R3) and the screens in `ui/report/` (R2).
