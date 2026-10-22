# test/golden/

Reference jobs for parity tests against the Excel/VBA version (git tag `v5.0`).

Each job has its own folder (for example `REF1/`) with:

- `project.json`: the job's input, imported from its v5.0 workbook,
- `v5.0.lsp`: the master `.lsp` that AxisBuilder v5.0 generated from that input (tested in CAD),
- `README.md`: what the job covers and which identifying fields were replaced.

Jobs come from real work and are anonymized with `npm run golden:make -- "<REF v5.0 folder>" REF1`
(`app/scripts/make-golden.ts`): client, site and people names become neutral values in both files,
and absolute image folders become `<PROCESSED_IMAGES>` / `<IMAGE_FOLDER>`. Never commit anything else
from the reference job folders (photos, workbooks, reports).

The `.lsp` files are kept byte for byte (ANSI, CRLF; `.gitattributes`: `-text`).

## Comparison harness (`lspSections.ts`)

- `splitLsp` cuts a v5.0 master `.lsp` into named sections in the order `ExportAxisBuilderLSP` writes
  them (header, function library blocks, job settings, each part of the drawing command, menus).
  `joinLsp` puts them back together exactly.
- `normalizeLsp` removes only what may legitimately differ: line endings, the generation timestamp
  and absolute image folders.
- `compareLsp` compares two files section by section; `formatDiffs` prints the first difference in
  each section that differs.

`golden.test.ts` has one parity test per section, marked `todo` until the exporter writes it. To
switch a section on, set `exportLsp` to the exporter and add the section name to `ENABLED`.
