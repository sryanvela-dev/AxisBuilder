# export/

Turns a project into output files.

- LISP (`lsp/`, done in Phase 2): the AutoLISP master `.lsp` for DraftSight and AutoCAD, written
  exactly as the v5.0 workbook writes it (checked by the golden tests in `test/golden/`).
  - `exportLsp.ts`: `exportLsp(project, options)` ports `ExportAxisBuilderLSP` (job settings, the
    drawing command, right-panel layout, reference labels). Refuses with `ExportBlockedError` while
    `exportProblems(project)` lists missing values or repeated names. Default output = v5.0 plus the
    user-approved changes (`APP_CHANGES`); `compat: 'v5.0'` writes exactly what v5.0 wrote.
  - `library.generated.ts`: the fixed LISP function library, translated from the VBA by
    `npm run gen:lsp-library` (`scripts/lspLibraryGen.ts`). Don't edit it by hand.
  - `vbaFormat.ts`: how v5.0 turns numbers into text (`LispNum`, `CStr`, `Format "0.0"`).
  - Decisions and v5.0 quirks: `app/docs/phase2-notes.md`.
- DXF: a drawing file that CAD programs open directly, no LISP needed (later).
- PDF: a printable layout for reports (later).

The LISP exporter computes the little geometry v5.0 computed itself (right-panel positions, head
view size); the vessel geometry engine in `engine/` is for later phases.
