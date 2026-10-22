# AxisBuilder web app

Installable, offline-capable web app (PWA) version of AxisBuilder.
Vite + React + TypeScript (strict), vite-plugin-pwa, Vitest.

The Excel/VBA version lives in the repo root (`src/*.bas`, the `.xlsm`) and is
tagged `v5.0`.

## Scripts

Run from this folder:

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (first time) |
| `npm run dev` | Development server with hot reload (no service worker) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the `dist/` build locally (service worker active) |
| `npm test` | Run the Vitest tests once |
| `npm run typecheck` | Type-check only |

## Folders

- `src/data/` project file schema, importers (.xlsm, AUT CSV, images)
- `src/engine/` vessel geometry, pure functions, no UI
- `src/export/` LISP, DXF, PDF output
- `src/ui/` screens, 2D/3D views
- `test/` tests; `test/golden/` holds v5.0 reference jobs for parity tests
