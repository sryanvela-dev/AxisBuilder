// Builds made-up v5.0-layout test workbooks for the .xlsm importer tests:
//   test/fixtures/xlsm/v5-current.xlsx  current layout (40 nozzle rows), with bad and REVIEW values
//   test/fixtures/xlsm/v5-pre40.xlsx    older layout (20 nozzle rows, older labels), clean data,
//                                       head clocks stored as Excel time numbers
// All vessel, client and people data is fictional. Run: npm run fixtures:xlsm
//
// Written as .xlsx (no macros); the importer reads .xlsm and .xlsx the same way.
// ExcelJS is used (dev only) because it can write the yellow review fills.

import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

type Value = string | number | boolean | Date | { formula: string; result: number } | null
/** A row of cells starting at column A; null leaves the cell empty. */
type Row = Value[]

const REVIEW_FILL = 'FFFFFF99' // RGB(255,255,153), the OCR importer's review fill
const CHECK_FILL = 'FFFFFF00' // RGB(255,255,0), the v5.0 generation check's highlight

interface SheetSpec {
  name: string
  /** Row number -> cells from column A. */
  rows: Record<number, Row>
  /** Cell address -> ARGB fill. */
  fills?: Record<string, string>
  /** Cell address -> number format. */
  formats?: Record<string, string>
}

function addSheet(wb: ExcelJS.Workbook, spec: SheetSpec) {
  const ws = wb.addWorksheet(spec.name)
  for (const [r, cells] of Object.entries(spec.rows)) {
    cells.forEach((v, i) => {
      if (v !== null) ws.getCell(Number(r), i + 1).value = v
    })
  }
  for (const [addr, argb] of Object.entries(spec.fills ?? {})) {
    ws.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  }
  for (const [addr, fmt] of Object.entries(spec.formats ?? {})) ws.getCell(addr).numFmt = fmt
}

// --- Project Settings: rows as in the v5.0 workbook ------------------------------------------

function projectSettings(layout: 'current' | 'pre40'): SheetSpec {
  const old = layout === 'pre40'
  const rows: Record<number, Row> = {
    1: ['AxisBuilder v5.0 - Project Settings'],
    3: ['PROJECT'],
    4: ['Setting', 'Value', 'Notes'],
    5: ['Project Name', old ? 'TEST-T-200' : 'TEST-V-101'],
    6: ['Output Command', 'SCANLAYOUT'],
    7: ['VESSEL / ORIENTATION'],
    8: ['Setting', 'Value', 'Notes'],
    9: ['Vessel Orientation', old ? 'Clockwise Horizontal' : 'HORIZONTAL CW'],
    10: ['Vessel Length', old ? 300 : 'REVIEW: smudged'],
    11: ['Vessel Height', old ? '251.3' : 188.5],
    12: ['AXIS / RULER'],
    13: ['Setting', 'Value', 'Notes'],
    14: ['Ruler Placement', 'Bottom + Left'],
    15: ['Ruler Spacing', old ? 10 : 20],
    16: ['Ruler Offset', 2],
    17: [old ? 'Show Ruler' : 'Show Rulers', 'YES'],
    18: ['Show Direction Labels', 'YES'],
    19: ['X Axis Cardinal Direction', 'North'],
    20: ['Y Axis Cardinal Direction', 'east'],
    21: [old ? 'X Axis Custom Direction' : 'X Axis Direction Text', 'CW LOOKING NORTH'],
    22: ['Y Axis Direction Text', null],
    23: ['Arrow Length Mode', 'Text Based'],
    24: ['Arrow Length', 28],
    25: ['Arrow Head Size', 3],
    26: ['VESSEL / REFERENCE INDICATORS'],
    27: ['Setting', 'Value', 'Notes'],
    28: ['Show Vessel Reference Labels', 'Yes'],
    29: ['Reference Label Mode', 'Custom Cardinal'],
    30: ['Reference Label Set', old ? 'NDC / SDC' : 'TDC/BDC'],
    31: ['Reference Label Tick Length', 2],
    32: ['Ref 0\u00b0 Label', old ? 'NDC' : 'T.D.C.'],
    33: ['Ref 90\u00b0 Label', null],
    34: ['Ref 180\u00b0 Label', old ? 'SDC' : 'B.D.C.'],
    35: ['Ref 270\u00b0 Label', null],
    36: ['Ref 360\u00b0 Label', old ? 'NDC' : 'T.D.C.'],
    37: ['SCAN LABELS / HATCH'],
    38: ['Setting', 'Value', 'Notes'],
    39: ['Text Scale Factor', 1],
    40: ['AUT Hatch Enabled', 'YES'],
    41: ['AUT Hatch Pattern', 'ANSI31'],
    42: [old ? 'Hatch Scale' : 'AUT Hatch Scale', 2.5],
    43: ['AUT Hatch Angle', 45],
    // The older workbook has no transparency row (added 2026-10-15). The label keeps v5.0's trailing space.
    44: old ? [null] : ['AUT Hatch Transparency ', 95],
    45: ['NOZZLE LABELS'],
    46: ['Setting', 'Value', 'Notes'],
    47: ['Smart Nozzle Labels', 'YES'],
    48: ['Minimum Nozzle Inside Label Diameter', 6],
    49: ['Nozzle Leader Length', 4],
    50: ['WELDS / REFERENCES'],
    51: ['Setting', 'Value', 'Notes'],
    52: ['Show Weld Labels', 'YES'],
    53: ['Show Centerline', 'YES'],
    54: ['LEGEND / TITLE BLOCK'],
    55: ['Setting', 'Value', 'Notes'],
    56: ['Legend Enabled', 'YES'],
    57: ['Show Title Block', 'NO'],
    58: ['Validation'],
    59: ['Setting', 'Value', 'Notes'],
    60: ['Enable Validation', 'YES'],
    61: ['Overlap Detection', 'WARN'],
    62: ['Show Validation Summary', 'YES'],
    63: ['HEAD VIEWS'],
    64: ['Setting', 'Value', 'Notes'],
    65: ['Head View Mode', 'BOTH'],
    66: ['Head View Size', 'MEDIUM'],
    67: ['Show Head Nozzles', 'YES'],
    68: ['Head 1 Label', 'NORTH HEAD'],
    69: ['Head 2 Label', 'SOUTH HEAD'],
    70: ['Head Nozzle Leader Length', 8],
    71: ['Show Head Centerlines', 'NO'],
    72: [old ? 'Show Head Clock Reference' : 'Show Head Clock References', 'YES'],
    74: ['OVERLAY DRAWING / IMAGE PREPROCESSING'],
    75: ['Setting', 'Value', 'Notes'],
    76: ['Generate Overlay Drawing', 'YES'],
    77: [old ? 'Image Folder' : 'Original Image Folder', 'C:\\Fictional\\Jobs\\Scans'],
    78: ['Processed Image Folder', 'Processed_Images'],
    79: ['Overlay Pixels Per Inch', 40],
    80: ['DraftSight Image Pixels Per Unit', 400],
    81: ['Overlay Preprocess Rotation', 'NONE'],
    82: ['Show Vessel On Overlay', 'YES'],
    83: ['Show Welds On Overlay', 'YES'],
    84: ['Show Supports On Overlay', 'YES'],
    85: ['Show Nozzles On Overlay', 'YES'],
    86: ['Show Rulers On Overlay', 'YES'],
    87: ['Show Legend On Overlay', 'YES'],
    88: ['Show Title Block On Overlay', 'YES'],
    89: ['Show Scan Borders On Overlay', old ? 'NO' : 'Maybe'],
    90: ['Overlay Scale Method', 'SCAN DIMENSIONS x PPI + FIXED PNG DPI'],
    91: ['CAD Platform', old ? 'DraftSight' : 'AutoCAD'],
  }
  if (!old) rows[93] = ['Fake Extra Setting', 'abc']
  return { name: 'Project Settings', rows, fills: old ? {} : { B10: REVIEW_FILL } }
}

function drawingInformation(layout: 'current' | 'pre40'): SheetSpec {
  const old = layout === 'pre40'
  return {
    name: 'Drawing Information',
    rows: {
      1: ['Drawing Information / Title Block'],
      3: ['Field', 'Value', 'Notes'],
      4: ['Drawing Title', 'AUT COVERAGE MAP'],
      5: ['Component', old ? 'TEST-T-200' : 'TEST-V-101'],
      6: ['Unit', 'Demo Unit 7'],
      7: ['Client', 'Example Energy Co'],
      8: ['Inspector', 'J. Sample'],
      9: ['Date', old ? '3/14/2026' : new Date(Date.UTC(2026, 2, 14))],
      10: ['Revision', 1],
      11: ['Notes', null],
      13: ['Inspection Information'],
      15: ['Field', 'Value'],
      16: ['Equipment Type', old ? 'Tank' : 'Vessel'],
      17: ['Inspection Method', 'AUT + MUT'],
      18: ['Procedure', 'PROC-000'],
      19: ['Report Number', 'R-0001'],
      20: ['Work Order', 'WO-0001'],
      21: ['Service', 'Water'],
      22: ['Material', old ? 'Carbon Steel' : 'Unobtainium'],
      23: ['Inspection Scope', 'External AUT Mapping'],
      24: ['Notes:', old ? 'Nominal Thickness: 0.500' : 'Nozzle N4 REVIEW: partly illegible'],
    },
    formats: old ? {} : { B9: 'm/d/yy' },
  }
}

// --- Shell Features ----------------------------------------------------------------------------

function shellFeatures(layout: 'current' | 'pre40'): SheetSpec {
  const old = layout === 'pre40'
  const nozzleRows = old ? 20 : 40
  const objTitle = 27 + nozzleRows // 67 current, 47 older
  const mutTitle = objTitle + 22 // 89 current, 69 older
  const rows: Record<number, Row> = {
    1: ['Circumfrential Welds'],
    2: ['Weld ID', 'Y Position', 'Include', 'Label', null, null, null, null, 'Suggested Use'],
    13: ['Long Seam Welds'],
    14: ['Seam ID', 'X Position', 'Start Y', 'Stop Y', 'Include', 'Label', null, null, 'Suggested Use'],
    25: ['Nozzles / Circles'],
    26: ['Nozzle Name', 'Diameter', 'X', 'Y', 'Min. T.', 'Notes', 'Include', 'Label Mode', 'Suggested Use'],
    [objTitle]: ['Objects'],
    [objTitle + 1]: ['Object ID', 'X Position', 'Y Position', 'Circ. Width', 'Length', 'Include', 'Notes'],
    [mutTitle]: ['Shell MUT'],
    [mutTitle + 1]: ['MUT ID', 'X Position', 'Y Position', 'Min. T.', 'Notes'],
  }
  const fills: Record<string, string> = {}
  // Empty rows pre-filled by the OCR import (Include NO, Label Mode AUTO) must be ignored.
  for (let r = 27; r < 27 + nozzleRows; r++) rows[r] = [null, null, null, null, null, null, 'NO', 'AUTO']
  rows[3] = ['CW1', 60, 'YES', 'YES', null, null, null, null, 'AUTO Label Mode: note text']
  rows[4] = ['CW2', 120, null, 'NO']
  rows[15] = ['LS1', 30, null, 60, 'YES', 'YES']
  rows[27] = ['N1', 12.75, 94, 120, 'TOL', null, 'YES', 'AUTO']
  rows[28] = ['N2', 6.625, 40, 200, 0.28, 'Manway', 'YES', 'INSIDE']
  rows[29] = ['N3', 4, 10, 10, 0.25, null, 'NO', 'OUTSIDE']
  rows[objTitle + 2] = ['SADDLE 1', 140, 30, 40, 12, 'YES', 'Support']
  rows[mutTitle + 2] = ['M1', 10, 10, 0.512, null]
  rows[mutTitle + 3] = ['M2', 15, 12, null, 'Near weld']
  if (!old) {
    rows[5] = ['CW3', 'REVIEW', 'YES', 'YES']
    fills.B5 = REVIEW_FILL
    rows[16] = ['LS2', 'abc', 10, 20, 'Y', 'TRUE']
    rows[30] = [null, 6, 1, 1, null, null, 'NO', 'AUTO'] // data but no ID
    rows[31] = ['N4', 'REVIEW: unclear', 50, 60, null, null, 'YES', 'SIDEWAYS']
    fills.B31 = REVIEW_FILL
    rows[32] = ['N5', 8, 70, 80, 0.3, null, 'YES', 'AUTO']
    fills.D32 = CHECK_FILL // highlighted but valid: value kept, listed
    rows[objTitle + 3] = ['SADDLE 2', 140, 200, 40, 12, 'MAYBE', null]
    rows[mutTitle + 4] = ['M3', 20, 20, 'TOL', null]
  }
  return { name: 'Shell Features', rows, fills }
}

// --- Head Features -----------------------------------------------------------------------------

function headFeatures(layout: 'current' | 'pre40'): SheetSpec {
  const old = layout === 'pre40'
  const hdr = ['Head', 'Nozzle', 'Nozzle Diameter', 'Clock Position', 'Radius Position', 'Custom Radius Factor',
    'Min. T.', 'Notes', 'Label Mode', 'Include Label']
  const mutHdr = ['Head', 'MUT ID', 'Clock Position', 'Radius Position', 'Custom Radius Factor', 'Min. T.',
    'Label Mode', 'Include Label', 'Notes']
  const rows: Record<number, Row> = {
    1: ['Head Nozzles'],
    2: ['Use clock position plus radius position.'],
    3: hdr,
    25: ['Head MUT'],
    27: mutHdr,
  }
  const fills: Record<string, string> = {}
  const formats: Record<string, string> = {}
  if (old) {
    // Older workbooks turned typed clock text into Excel times (3:30 AM, 12:00 PM).
    rows[4] = ['HEAD 1', 'N10', 4.5, 3.5 / 24, 'HALF', null, 0.3, null, 'AUTO', 'YES']
    rows[5] = ['H2', 'N11', 2, 9, 'T', null, null, null, null, null]
    rows[28] = ['HEAD 2', 'HM1', 0.5, 'OUTER', null, 0.4, 'AUTO', 'YES', null]
    formats.D4 = 'h:mm'
    formats.C28 = 'h:mm'
  } else {
    rows[4] = ['HEAD 1', 'N10', 4.5, '3:30', 'HALF', null, 0.3, null, 'AUTO', 'YES']
    rows[5] = ['HEAD 2', 'N11', 2, '90\u00b0', 'X', 0.6, 'TOL', null, 'AUTO', 'YES']
    rows[6] = ['HEAD 1', 'n3', 2, 12, null, null, null, null, null, null] // same name as shell N3
    rows[7] = ['HEAD 1', 'N12', 3, 'REVIEW', 'CENTER', null, null, null, 'AUTO', 'YES']
    fills.D7 = REVIEW_FILL
    rows[8] = ['HEAD 3', 'N13', 3, '6', null, null, null, null, null, null]
    rows[28] = ['HEAD 1', 'HM1', '6', 'OUTER', null, 0.4, 'AUTO', 'YES', null]
    rows[29] = ['HEAD 2', 'M1', '10.5', 'SIDE', null, null, 'AUTO', 'YES', null] // same ID as shell M1
    rows[30] = ['HEAD 2', 'HM2', '13:00', 'CUSTOM', 1.5, null, 'AUTO', 'NO', null]
  }
  return { name: 'Head Features', rows, fills, formats }
}

// --- Scan Import / Scan Images -------------------------------------------------------------------

function scanImport(layout: 'current' | 'pre40'): SheetSpec {
  const rows: Record<number, Row> = {
    1: ['Scan Import'],
    2: ['Scan Name', 'X Start', 'X Stop', 'Y Start', 'Y Stop', 'Width', 'Height', 'Center X', 'Center Y',
      'Long Side Rotation', 'Text Height', 'Include'],
  }
  const scans: [string, number, number, number, number, string | null][] =
    layout === 'pre40'
      ? [['SCAN1', 0, 40, 0, 30, 'YES'], ['SCAN2', 40, 80, 0, 30, 'YES']]
      : [
          ['SCAN1', 0, 30, 0, 24, 'YES'],
          ['SCAN2', 60, 30, 24, 48, 'NO'], // reversed X is allowed
          ['SCAN3', 10, 10, 0, 5, 'YES'], // no width
          ['scan1', 90, 120, 0, 24, null], // duplicate name
        ]
  scans.forEach(([name, xs, xe, ys, ye, inc], i) => {
    const r = 3 + i
    // Formula columns F-K, as in v5.0 (the importer ignores them).
    rows[r] = [name, xs, xe, ys, ye, { formula: `C${r}-B${r}`, result: xe - xs }, { formula: `E${r}-D${r}`, result: ye - ys },
      null, null, null, null, inc]
  })
  rows[3 + scans.length] = [null, null, null, null, null, { formula: 'IFERROR(C9-B9,"")', result: 0 }]
  return { name: 'Scan Import', rows }
}

function scanImages(layout: 'current' | 'pre40'): SheetSpec {
  const rows: Record<number, Row> = {
    1: ['Scan Images'],
    2: ['Scan Name', 'Image File', 'Processed Image', 'Include', 'Status', 'Notes'],
  }
  if (layout === 'pre40') {
    rows[3] = ['SCAN1', 'S1.png', null, 'YES', 'LINKED', 'The Image File column controls which image is attached to each scan.']
    rows[4] = ['SCAN2', 'S2.jpg', 'S2_FIT.png', 'NO']
  } else {
    rows[3] = ['SCAN1', 'S1.png', null, 'YES', 'LINKED', 'The Image File column controls which image is attached to each scan.']
    rows[4] = ['SCAN2', null, null, 'NO']
    rows[5] = ['SCAN9', 'S9.png', null, 'YES', null, 'retake photo']
  }
  return { name: 'Scan Images', rows }
}

async function build(layout: 'current' | 'pre40', file: string) {
  const wb = new ExcelJS.Workbook()
  addSheet(wb, { name: 'Home', rows: { 1: ['AxisBuilder (test workbook, fictional data)'] } })
  addSheet(wb, projectSettings(layout))
  addSheet(wb, drawingInformation(layout))
  addSheet(wb, scanImport(layout))
  addSheet(wb, scanImages(layout))
  addSheet(wb, shellFeatures(layout))
  addSheet(wb, headFeatures(layout))
  const target = new URL(`../test/fixtures/xlsm/${file}`, import.meta.url)
  await wb.xlsx.writeFile(fileURLToPath(target))
  console.log(`Wrote test/fixtures/xlsm/${file}`)
}

await build('current', 'v5-current.xlsx')
await build('pre40', 'v5-pre40.xlsx')
