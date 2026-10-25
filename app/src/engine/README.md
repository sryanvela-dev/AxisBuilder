# engine/

Vessel geometry and layout math, written as pure functions. Used by the LISP exporter and the preview.

- `layout.ts`: the job layout v5.0 works out before drawing (right panel, heads, clock angles,
  reference labels, title lines, scans as drawn, coverage, images). The exporter writes these numbers.
- `transform.ts`: orientation transforms (Vertical, Horizontal CW/CCW) and text rotations.
- `rulers.ts`: the rulers the drawing gets, read from the generated library code.
- `drawing.ts`: the whole drawing as items in logical coordinates (shapes, CAD layer, source row),
  ported from the LISP drawing functions, for the preview. See `docs/preview.md`.
- `mutAreas.ts` (Phase 5c): MUT areas drawn in the preview: pieces across the seam, the hatch with islands, the ID's
  spot, the coverage part, Review problems, the lines the drawing tool snaps to and Pick inside. `polygon.ts`: the plain
  polygon geometry it uses (area, clipping, scanline hatch and area, label spot, enclosed boundary).

No UI, no DOM, no file I/O, no randomness. The same input always gives the same output, so this code is
easy to unit test and to compare against v5.0.
