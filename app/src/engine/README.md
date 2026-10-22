# engine/

Vessel geometry and layout math, written as pure functions.

- Input: the project data from `data/`. Output: plain geometry (points, lines,
  rectangles, text positions) in logical vessel coordinates.
- Covers the shell grid, orientation transforms (Vertical, Horizontal CW/CCW),
  scan rectangles, welds, nozzles, objects, heads and clock positions, and the
  right-panel layout.
- No UI, no DOM, no file I/O, no randomness. The same input always gives the
  same output, so this code is easy to unit test and to compare against v5.0.
