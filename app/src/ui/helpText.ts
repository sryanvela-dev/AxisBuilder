// The words of the in-app quick guide (HelpGuide.tsx). Plain language; part of the build, so it works offline.

import type { StepId } from '../state/session.ts'

/** One short paragraph per step, in step order (test: every step has one). */
export const GUIDE_STEPS: Record<StepId, string> = {
  project:
    'Job information for the title block (project, component, client, inspector, date) and the shell: its length, ' +
    'circumference, orientation, axis directions, reference labels and which heads are drawn.',
  fieldData:
    'What the field form says: circ welds, long seams, shell and head nozzles, objects such as saddles and pads, and ' +
    'MUT readings (an object\'s X and Y are its corner nearest 0, 0, not its center). Type into the tables or paste ' +
    'rows from Excel. A value that is missing or not valid is marked, and ' +
    'the export waits until it is fixed.',
  scans:
    'Import the AUT CSV (the button, or drop the file on the page). Scans with start and stop the wrong way round, ' +
    'overlaps and scans outside the shell are listed with one-click fixes where there is one.',
  images:
    'Pick the folder with the scan photos; each photo is matched to its scan by number. Process images fits each photo ' +
    'to its scan\'s shape for the CAD drawing and the DXF (the PDF reads the photos straight from the folder).',
  drawing:
    'How the drawing looks: text sizes and colors, rulers, nozzle labels, leaders and arrows, legend and title block, ' +
    'head views, line colors and weights, and section sheets. The preview beside the page shows every change at once. ' +
    'In the preview, Move labels lets you drag labels and leader ends, and MUT areas lets you draw an area for a MUT reading.',
  review:
    'Everything still open, grouped by step. "Fix" items stop the export; "Check" items are only worth a look. ' +
    'Go to takes you to the field or row.',
  export:
    'Make the files, into the job folder you pick. The app asks before it replaces a file.',
}

/** What each export file is for. */
export const GUIDE_FILES: { name: string; text: string }[] = [
  { name: 'PDF and report images (JPEG)', text: 'The deliverable for the report: the drawing on its sheet, plus the overview and section sheets when they are on.' },
  { name: 'DXF', text: 'For anyone who carries on in CAD (AutoCAD, DraftSight). Keep it next to its Processed_Images folder.' },
  { name: 'CAD drawing (.lsp)', text: 'The backup: in DraftSight or AutoCAD, APPLOAD the file and type AXISBUILDER.' },
  { name: 'Job file (.axb)', text: 'Save keeps the job itself, to open and change later. A recovery copy is kept in this browser while changes are unsaved.' },
]

/** Keys: [keys, what they do], by where they work. */
export const GUIDE_KEYS: { where: string; keys: [string, string][] }[] = [
  {
    where: 'Anywhere in a job',
    keys: [
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
      ['Ctrl+S / Ctrl+Shift+S', 'Save / save as a new file'],
      ['Esc', 'Close a box or the full-size preview, clear the selection'],
    ],
  },
  {
    where: 'Preview',
    keys: [
      ['Mouse wheel', 'Zoom'],
      ['Drag empty space, middle button or Space+drag', 'Pan'],
    ],
  },
  {
    where: 'Move labels',
    keys: [
      ['Drag', 'Move a label or its leader end'],
      ['Arrow keys / Shift+arrows', 'Nudge 0.5 in / 6 in'],
      ['Shift while dragging', 'No snapping'],
      ['Ctrl while dragging', 'Keep it level or plumb'],
      ['Right-click', 'Reset the label to where the app puts it'],
    ],
  },
  {
    where: 'MUT areas',
    keys: [
      ['Click', 'Add a corner'],
      ['Click the first corner, Enter or right-click', 'Close the area'],
      ['Backspace / Esc', 'Take the last corner away / cancel'],
      ['O', 'Straight on or off (corners level or plumb)'],
      ['Shift / Ctrl', 'No snapping / level or plumb for one corner'],
      ['Delete', 'Remove the selected corner'],
      ['Type 12.5, 30 or @5, 0', 'A corner at X, Y or that far from the last one'],
    ],
  },
]

/** The theme switch, one line. */
export const GUIDE_THEME =
  'Theme (start screen, top right): Auto follows the Windows light or dark setting; Light or Dark keeps that one in this browser.'
