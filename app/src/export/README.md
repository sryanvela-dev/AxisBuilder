# export/

Turns geometry from `engine/` into output files.

- LISP: an AutoLISP `.lsp` for DraftSight and AutoCAD, matching what the v5.0
  workbook generates (checked by the golden tests in `test/golden/`).
- DXF: a drawing file that CAD programs open directly, no LISP needed.
- PDF: a printable layout for reports.

Writers take geometry and settings and return file contents. They don't
compute geometry themselves.
