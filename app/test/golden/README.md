# test/golden/

Reference jobs for parity tests against the Excel/VBA version (git tag `v5.0`).

Each job will get its own folder with:

- the job's input data (the v5.0 workbook data or an export of it, the AUT CSV,
  and any settings needed to reproduce the run), and
- the `.lsp` file that AxisBuilder v5.0 generated from that input.

The tests run the same input through the app and compare its LISP output with
the v5.0 `.lsp`. A difference means the app has drifted from v5.0, unless the
change was intended and the reference file is updated on purpose.

Use cleaned or sample jobs only. Don't commit client-confidential data.
