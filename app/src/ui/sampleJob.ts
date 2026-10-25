// A made-up sample job for trying the app (Start screen > Open sample job). Not a real vessel,
// client or inspector. It has no photos linked, so the Images step has something to do.

import { CURRENT_SCHEMA_VERSION, projectFileSchema, type Project, type ProjectInput } from '../data/schema.ts'

const SAMPLE: ProjectInput = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  project: {
    projectName: 'Sample V-100',
    drawingTitle: 'AUT COVERAGE MAP',
    component: 'V-100 Sample Drum',
    unit: 'Sample Unit',
    client: 'Sample Client',
    inspector: 'A. Inspector',
    date: '2026-10-22',
    revision: '0',
  },
  vessel: { orientation: 'Horizontal CW', length: 240, height: 188.5 },
  settings: { headViewMode: 'BOTH', head1Label: 'EAST HEAD', head2Label: 'WEST HEAD' },
  circWelds: [
    { id: 'C1', y: 0 },
    { id: 'C2', y: 96 },
    { id: 'C3', y: 240 },
  ],
  longSeams: [{ id: 'L1', x: 47 }],
  shellNozzles: [
    { id: 'N1', diameter: 12, x: 94, y: 30, minT: 0.5 },
    { id: 'N2', diameter: 4, x: 20, y: 150 },
    { id: 'MW', diameter: 24, x: 140, y: 200 },
  ],
  objects: [{ id: 'SADDLE A', x: 120, y: 40, circWidth: 60, length: 8 }],
  shellMut: [
    { id: 'M1', x: 10, y: 10, minT: 0.48 },
    { id: 'M2', x: 180, y: 230, minT: 0.47 },
    // MUT areas (Phase 5c): around nozzle N1 (left unhatched), over a scan edge and weld C2, across the seam.
    { id: 'M4', x: 97, y: 32, minT: 0.46, area: [[84, 18], [110, 18], [110, 44], [84, 44]] },
    { id: 'M5', x: 76, y: 92, minT: 0.45, area: [[62, 80], [86, 80], [90, 104], [62, 104]] },
    { id: 'M6', x: 1, y: 157.5, minT: 0.49, area: [[-6, 150], [8, 150], [8, 165], [-6, 165]] },
  ],
  headNozzles: [
    { head: 'HEAD 1', id: 'N3', diameter: 2, clock: '12', radiusPosition: 'HALF' },
    { head: 'HEAD 2', id: 'N4', diameter: 3, clock: '6', radiusPosition: 'CENTER' },
  ],
  headMut: [
    { head: 'HEAD 1', id: 'M3', clock: '3', radiusPosition: 'OUTER', minT: 0.5 },
    { head: 'HEAD 2', id: 'M7', clock: '4', radiusPosition: 'HALF', minT: 0.44, area: [[0.2, -0.25], [0.7, -0.25], [0.7, 0.35], [0.2, 0.35]] },
  ],
  scans: [
    { id: 'SCAN 1', xStart: 0, xStop: 24, yStart: 0, yStop: 48 },
    { id: 'SCAN 2', xStart: 24, xStop: 48, yStart: 0, yStop: 48 },
    { id: 'SCAN 3', xStart: 48, xStop: 72, yStart: 0, yStop: 48 },
    { id: 'SCAN 4', xStart: 0, xStop: 24, yStart: 48, yStop: 96 },
    { id: 'SCAN 5', xStart: 24, xStop: 48, yStart: 48, yStop: 96 },
    { id: 'SCAN 6', xStart: 48, xStop: 72, yStart: 48, yStop: 96 },
  ],
}

export function sampleProject(): Project {
  return projectFileSchema.parse(SAMPLE)
}
