// Makes the Phase 3a CAD image-path test kit: can DraftSight and AutoCAD attach the processed scan
// images without a full Windows path in the .lsp?
//
//   node scripts/make-image-path-test.ts "<output folder>"      (npm run imagepath:test -- ...)
//
// Writes into the output folder:
//   image-path-test.lsp   IPTEST tries each path method once, IPCHECK lists the attached images
//   Processed_Images\     TEST_1_FIT.png .. TEST_4_FIT.png (solid colours, big "TEST n" text)
//   INSTRUCTIONS.txt      the four scenarios for DraftSight and AutoCAD, with a results table
//
// The image insertion uses the real exporter's helpers (SL_InsertFitImage, DraftSight and AutoCAD
// branches of WriteOverlayLispFunctions), renamed *_DS / *_ACAD so both live in one file. The kit is
// a test output: don't commit it.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { processedImageNames } from '../src/data/imageMatch.ts'
import { WriteLispHeader, WriteOverlayLispFunctions, type LibraryContext } from '../src/export/lsp/library.generated.ts'

const outArg = process.argv[2]
if (!outArg) {
  console.error('Usage: npm run imagepath:test -- "<output folder>"')
  process.exit(1)
}
const outDir = resolve(outArg)
const imgDir = join(outDir, 'Processed_Images')

// One test image per method. Names follow the app's rule ("TEST 1" -> "TEST_1_FIT.png").
const METHODS = [
  { code: 'C1', scan: 'TEST 1', rgb: [200, 40, 40] },
  { code: 'C2', scan: 'TEST 2', rgb: [30, 140, 60] },
  { code: 'C3', scan: 'TEST 3', rgb: [40, 80, 200] },
  { code: 'A', scan: 'TEST 4', rgb: [220, 120, 20] },
] as const
const names = processedImageNames(METHODS.map((m) => m.scan))
const file = (i: number): string => names.get(METHODS[i].scan)!

// ---------- PNGs ----------

const GLYPHS: Record<string, string[]> = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

/** 480 x 240 px (2:1, same shape as the 24 x 12 test rectangles), white border, centred text lines. */
function makePng(rgb: readonly number[], lines: { text: string; scale: number; top: number }[]): Buffer {
  const W = 480
  const H = 240
  const px = Buffer.alloc(W * H * 3)
  const set = (x: number, y: number, c: readonly number[]): void => {
    const i = (y * W + x) * 3
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
  }
  const white = [255, 255, 255]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, x < 6 || y < 6 || x >= W - 6 || y >= H - 6 ? white : rgb)
  for (const { text, scale, top } of lines) {
    const width = text.length * 6 * scale - scale
    let left = Math.round((W - width) / 2)
    for (const ch of text) {
      const g = GLYPHS[ch]
      if (!g) throw new Error(`No glyph for "${ch}"`)
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++)
          if (g[gy][gx] === '1')
            for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) set(left + gx * scale + dx, top + gy * scale + dy, white)
      left += 6 * scale
    }
  }
  const raw = Buffer.alloc(H * (W * 3 + 1))
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3) // filter byte 0
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- LISP ----------

function libraryLines(acad: boolean, write: (o: LibraryContext) => void): string[] {
  const lines: string[] = []
  write({
    w: (l) => lines.push(l),
    acad,
    hatchTransparency: 50,
    overlayImageFrame: 1,
    rulerOffset: 0,
    ori: 'VERTICAL',
    placement: 'LEFT',
    xAxisLabel: '',
    yAxisLabel: '',
  })
  return lines
}

/** The lines of one (defun NAME ...) from the generated header, up to its closing ")". */
function defun(lines: string[], name: string): string[] {
  const start = lines.findIndex((l) => l.startsWith(`(defun ${name} `))
  const end = lines.indexOf(')', start)
  if (start < 0 || end < 0) throw new Error(`${name} not found in WriteLispHeader output`)
  return lines.slice(start, end + 1)
}

const layerHelpers = (acad: boolean): string[] => {
  const h = libraryLines(acad, WriteLispHeader)
  return [...defun(h, 'SL_Layer'), ...defun(h, 'SL_SetLayer')]
}
if (layerHelpers(false).join('\n') !== layerHelpers(true).join('\n')) throw new Error('SL_Layer/SL_SetLayer differ by platform')

const overlay = (acad: boolean, suffix: string): string[] =>
  libraryLines(acad, WriteOverlayLispFunctions).map((l) => l.replace(/\bSL_InsertFitImage\b/g, `SL_InsertFitImage${suffix}`).replace(/\bSL_OverlayLL\b/g, `SL_OverlayLL${suffix}`))

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
const lsp = [
  ';;; AxisBuilder image path test (Phase 3a)',
  `;;; Generated by app/scripts/make-image-path-test.ts on ${stamp}.`,
  ';;; Load with APPLOAD (DraftSight: APPLOAD or LOADAPPLICATION), then type IPTEST.',
  ';;; IPTEST attaches one image per path method and prints which worked. IPCHECK lists the images',
  ';;; in the drawing with their saved path and whether CAD finds the file.',
  ';;; Test only: it adds 4 images, a few lines and texts to the current drawing.',
  '',
  ';; Where was this file loaded from? Looked up once, while it loads (method C3).',
  '(setq IPT_LOAD_FILE (findfile "image-path-test.lsp"))',
  '',
  ';; ---- Helpers copied from the real exporter (library.generated.ts, WriteLispHeader) ----',
  ...layerHelpers(false),
  '',
  ';; ---- DraftSight branch of WriteOverlayLispFunctions (renamed *_DS) ----',
  ...overlay(false, '_DS'),
  ';; ---- AutoCAD branch of WriteOverlayLispFunctions (renamed *_ACAD) ----',
  ...overlay(true, '_ACAD'),
  '(setq SL_ORIENTATION "Vertical")',
  '',
  ...String.raw`;; ---- Test code ----

(defun IPT_Safe (fn args / r)
  ;; Runs (fn args...) and returns nil instead of stopping on an error.
  (setq r (vl-catch-all-apply fn args))
  (if (vl-catch-all-error-p r) nil r)
)

(defun IPT_Str (v) (if (= (type v) 'STR) v "?"))

(defun IPT_Slash (s / i c r)
  (setq r "" i 1)
  (while (<= i (strlen s))
    (setq c (substr s i 1))
    (setq r (strcat r (if (= c "\\") "/" c)))
    (setq i (1+ i))
  )
  r
)

(defun IPT_Folder (path / i p)
  ;; Folder part of a file path with a trailing /, or nil.
  (if (= (type path) 'STR)
    (progn
      (setq path (IPT_Slash path) i (strlen path))
      (while (and (> i 0) (not p))
        (if (= (substr path i 1) "/") (setq p i))
        (setq i (1- i))
      )
      (if p (substr path 1 p))
    )
  )
)

(defun IPT_BaseName (path / f)
  ;; File name without folder and .png, which is the image name CAD gives the attachment.
  (setq path (IPT_Slash path) f (IPT_Folder path))
  (if f (setq path (substr path (1+ (strlen f)))))
  (if (and (> (strlen path) 4) (= (strcase (substr path (- (strlen path) 3))) ".PNG"))
    (setq path (substr path 1 (- (strlen path) 4)))
  )
  path
)

(defun IPT_DefExists (name / d)
  (setq d (dictsearch (namedobjdict) "ACAD_IMAGE_DICT"))
  (if d (dictsearch (cdr (assoc -1 d)) name))
)

(defun IPT_ImageInfo (ent / ed dd)
  ;; (saved path, loaded flag) of an IMAGE entity, or nil.
  (setq ed (entget ent))
  (if (and ed (= (cdr (assoc 0 ed)) "IMAGE") (cdr (assoc 340 ed)))
    (progn
      (setq dd (entget (cdr (assoc 340 ed))))
      (list (cdr (assoc 1 dd)) (cdr (assoc 280 dd)))
    )
  )
)

(defun IPT_CancelCmd (/ n act)
  ;; If a failed attach left a command waiting for input, cancel it.
  (setq n 0)
  (while (and (< n 5) (setq act (getvar "CMDACTIVE")) (> (logand act 3) 0))
    (command)
    (setq n (1+ n))
  )
)

(defun IPT_Line (x1 y1 x2 y2)
  (entmake (list '(0 . "LINE") '(8 . "IPT_MARKS") (list 10 x1 y1 0.0) (list 11 x2 y2 0.0)))
)

(defun IPT_Text (x y h s)
  (entmake (list '(0 . "TEXT") '(8 . "IPT_MARKS") (list 10 x y 0.0) (cons 40 h) (cons 1 s)))
)

(defun IPT_Box (x y w h)
  (IPT_Line x y (+ x w) y)
  (IPT_Line (+ x w) y (+ x w) (+ y h))
  (IPT_Line (+ x w) (+ y h) x (+ y h))
  (IPT_Line x (+ y h) x y)
)

(defun IPT_Short (s) (if (> (strlen s) 70) (strcat (substr s 1 67) "...") s))

(defun IPT_Try (code desc img x / y w h sentinel res after info status)
  ;; Attaches img into a 24 x 12 box at (x, 0) with the exporter's helper and records the result.
  (setq y 0.0 w 24.0 h 12.0)
  (IPT_Safe 'IPT_Box (list x y w h))
  (IPT_Safe 'IPT_Text (list x (+ y h 1.0) 1.5 (strcat code ": " desc)))
  (princ (strcat "\n\n[" code "] " desc))
  (princ (strcat "\n     Path given to CAD: " (if img img "(none)")))
  (cond
    ((not img) (setq status "FAILED - no path could be built"))
    ((IPT_Safe 'IPT_DefExists (list (IPT_BaseName img)))
      (setq status "SKIPPED - this image is already in the drawing (use a new drawing)")
    )
    (T
      ;; A point is drawn first so a failed AutoCAD attach can only scale/move this point.
      (entmake (list '(0 . "POINT") '(8 . "IPT_MARKS") (list 10 x y 0.0)))
      (setq sentinel (entlast))
      (setq res (vl-catch-all-apply (if (= IPT_PLATFORM "AUTOCAD") 'SL_InsertFitImage_ACAD 'SL_InsertFitImage_DS) (list x y w h img)))
      (IPT_CancelCmd)
      (setq after (entlast))
      (if (and after (not (equal after sentinel))) (setq info (IPT_Safe 'IPT_ImageInfo (list after))))
      (if (and sentinel (entget sentinel)) (entdel sentinel))
      (setq status
        (cond
          ((not info)
            (strcat "FAILED - no image was attached"
                    (if (vl-catch-all-error-p res) (strcat " (" (vl-catch-all-error-message res) ")") "")))
          ((= (cadr info) 0) (strcat "FAILED - attached, but CAD cannot find the file. Saved path: " (IPT_Str (car info))))
          ((vl-catch-all-error-p res) (strcat "PARTLY - attached, but fitting failed: " (vl-catch-all-error-message res)))
          (T (strcat "OK - saved path: " (IPT_Str (car info))))
        )
      )
    )
  )
  (princ (strcat "\n     Result: " status))
  (IPT_Safe 'IPT_Text (list x (- y 2.5) 1.2 (IPT_Short status)))
  (setq IPT_RESULTS (append IPT_RESULTS (list (strcat code " (" desc "): " status))))
)

(defun IPT_AskPlatform (/ prog guess k)
  (setq prog (IPT_Safe 'getvar (list "PROGRAM")))
  (setq guess (if (and (= (type prog) 'STR) (wcmatch (strcase prog) "*ACAD*")) "AutoCAD" "DraftSight"))
  (initget "DraftSight AutoCAD")
  (setq k (getkword (strcat "\nWhich CAD program is this? [DraftSight/AutoCAD] <" guess ">: ")))
  (strcase (if k k guess))
)

(defun c:IPTEST (/ oldOsmode prefix src img3 picked img4 summary)
  (setq IPT_RESULTS nil)
  (setq IPT_PLATFORM (IPT_AskPlatform))
  (setq oldOsmode (getvar "OSMODE"))
  (setvar "OSMODE" 0)
  (SL_Layer "SCAN_IMAGES" 7)
  (SL_Layer "IPT_MARKS" 3)
  (setvar "IMAGEFRAME" 1)
  (setq prefix (getvar "DWGPREFIX"))
  (princ "\n\n=== AxisBuilder image path test ===")
  (princ (strcat "\nCAD program: " IPT_PLATFORM))
  (princ (strcat "\nDrawing saved: " (if (= (getvar "DWGTITLED") 1) "yes" "no (new drawing)")))
  (princ (strcat "\nDrawing folder (DWGPREFIX): " (IPT_Str prefix)))
  (princ (strcat "\n.lsp found while loading: " (if IPT_LOAD_FILE IPT_LOAD_FILE "not found")))

  (IPT_Try "C1" "relative path" "Processed_Images/${file(0)}" 0.0)

  (IPT_Try "C2" "drawing folder (DWGPREFIX)"
    (if (= (type prefix) 'STR) (strcat (IPT_Slash prefix) "Processed_Images/${file(1)}"))
    30.0)

  (setq src (cond (IPT_LOAD_FILE) ((findfile "image-path-test.lsp"))))
  (if src
    (progn
      (princ (strcat "\n\nC3: .lsp found at " src))
      (setq img3 (strcat (IPT_Folder src) "Processed_Images/${file(2)}"))
    )
    (progn
      (princ "\n\nC3: .lsp not found; searching for the image itself instead.")
      (setq img3 (findfile "Processed_Images/${file(2)}"))
    )
  )
  (IPT_Try "C3" "folder of the .lsp (findfile)" img3 60.0)

  (princ "\n\n[A] A file dialog opens now: pick ANY image in the kit's Processed_Images folder (Cancel skips A).")
  (setq picked (IPT_Safe 'getfiled (list "AxisBuilder test: pick any image in Processed_Images" (IPT_Str prefix) "png" 0)))
  (if (= (type picked) 'STR)
    (progn
      (princ (strcat "\nPicked: " picked))
      (setq img4 (strcat (IPT_Folder picked) "${file(3)}"))
    )
  )
  (IPT_Try "A" (if img4 "picked once (getfiled)" "picked once (getfiled) - cancelled") img4 90.0)

  (setvar "OSMODE" oldOsmode)
  (IPT_Safe 'command (list "ZOOM" "E"))
  (setq summary (strcat "AxisBuilder image path test - " IPT_PLATFORM "\n"))
  (foreach r IPT_RESULTS (setq summary (strcat summary "\n" r)))
  (princ "\n\n=== Summary ===")
  (foreach r IPT_RESULTS (princ (strcat "\n" r)))
  (princ "\n\nWrite the results into INSTRUCTIONS.txt. IPCHECK lists the images again.")
  (alert summary)
  (princ)
)

(defun c:IPCHECK (/ ss i ent info path found)
  (princ "\n\n=== Images in this drawing ===")
  (princ (strcat "\nDrawing folder (DWGPREFIX): " (IPT_Str (getvar "DWGPREFIX"))))
  (setq ss (IPT_Safe 'ssget (list "X" '((0 . "IMAGE")))))
  (if (not ss)
    (princ "\nNo images found.")
    (progn
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i) info (IPT_Safe 'IPT_ImageInfo (list ent)))
        (setq path (if info (IPT_Str (car info)) "?"))
        (setq found (if (/= path "?") (findfile path)))
        (princ (strcat "\n" (IPT_BaseName path) ": saved path " path
                       "\n     loaded: " (cond ((not info) "?") ((= (cadr info) 1) "yes") ((= (cadr info) 0) "NO") (T "?"))
                       ", findfile: " (if found found "not found")))
        (setq i (1+ i))
      )
    )
  )
  (princ)
)

(princ "\nAxisBuilder image path test loaded. Type IPTEST to run it; IPCHECK lists the images.")
(princ)`.split('\n'),
  '',
]

// ---------- INSTRUCTIONS.txt ----------

const table = (cad: string): string[] => [
  `${cad}  (version: ______________ )`,
  '',
  '                              C1 relative  C2 drawing   C3 .lsp     A pick once',
  '                              (TEST 1)     folder (2)   folder (3)  (TEST 4)',
  '  S1 new unsaved drawing      ______       ______       ______      ______',
  '  S2 drawing saved first      ______       ______       ______      ______',
  '  S3 reopen S1 drawing        ______       ______       ______      ______',
  '  S3 reopen S2 drawing        ______       ______       ______      ______',
  '  S4 moved copy, reopen S2    ______       ______       ______      ______',
  '',
  '  S1/S2: write OK / FAILED / PARTLY from the IPTEST summary.',
  '  S3/S4: write SHOWN or MISSING (a frame with no picture, or a "file not found" box, is MISSING).',
  '  Notes (anything odd, prompts, dialogs, paste IPCHECK lines if something is missing):',
  '',
  '',
  '',
]

const instructions = [
  'AxisBuilder image path test (Phase 3a)',
  '======================================',
  `Generated ${stamp}.`,
  '',
  'Question: can DraftSight and AutoCAD attach the scan images WITHOUT a full Windows',
  'path (C:\\...) in the .lsp? The web app cannot know that full path, so this decides',
  'how the app writes image paths.',
  '',
  'What is in this folder',
  '  image-path-test.lsp   the test (commands IPTEST and IPCHECK)',
  `  Processed_Images\\     ${METHODS.map((_, i) => file(i)).join(', ')}`,
  '  INSTRUCTIONS.txt      this file; fill in the tables at the bottom',
  '',
  'IPTEST attaches one image per method, each in its own box (left to right):',
  `  C1  relative path: "Processed_Images/${file(0)}" (red, TEST 1)`,
  `  C2  drawing folder (DWGPREFIX) + "Processed_Images/${file(1)}" (green, TEST 2)`,
  `  C3  folder the .lsp was loaded from (findfile) + "Processed_Images/${file(2)}" (blue, TEST 3)`,
  '  A   one click: a file dialog asks you to pick ANY image in Processed_Images; the test',
  `      then builds "${file(3)}" from that folder (orange, TEST 4)`,
  'It prints each result in the command line, writes it under each box and shows a',
  'summary pop-up at the end. It uses the same image insertion code as the real .lsp.',
  'IPCHECK lists every image in the drawing, the path CAD saved for it, whether it is',
  'loaded and whether CAD can find the file. It changes nothing.',
  '',
  'Before you start',
  '  - Close the CAD program completely before Scenario 1 and before Scenario 2, so an',
  '    earlier file dialog cannot change the folder CAD looks in.',
  '  - AutoCAD may warn that the .lsp is from an untrusted location: choose "Load Once".',
  '  - Loading: APPLOAD (DraftSight: APPLOAD or LOADAPPLICATION), browse to this folder,',
  '    load image-path-test.lsp, close the dialog.',
  '  - Do the scenarios in order, first in DraftSight, then the same in AutoCAD.',
  '    Use ipt1-draftsight.dwg / ipt2-draftsight.dwg and ipt1-autocad.dwg / ipt2-autocad.dwg.',
  '',
  'Scenario 1: new, unsaved drawing',
  '  1. Start CAD, start a NEW drawing. Do not save it yet.',
  '  2. APPLOAD image-path-test.lsp from this folder.',
  '  3. Type IPTEST. Confirm the CAD program (Enter accepts the suggestion).',
  '  4. When the file dialog opens (method A), go to this folder\\Processed_Images and',
  '     pick any image (e.g. TEST_1_FIT.png).',
  '  5. Read the summary pop-up; write row S1 in the table.',
  '  6. Save As into THIS folder as ipt1-<cad>.dwg (e.g. ipt1-draftsight.dwg). Close CAD.',
  '',
  'Scenario 2: drawing saved in this folder first',
  '  1. Start CAD, start a NEW drawing, and right away Save As into THIS folder as',
  '     ipt2-<cad>.dwg.',
  '  2. APPLOAD image-path-test.lsp, type IPTEST, pick any image when asked.',
  '  3. Write row S2. Save. Close CAD.',
  '',
  'Scenario 3: reopen',
  '  1. Start CAD and open ipt1-<cad>.dwg. Which images are still shown? Write row',
  '     "S3 reopen S1 drawing". If one is missing, APPLOAD the .lsp, type IPCHECK and',
  '     copy its lines into the notes.',
  '  2. Same for ipt2-<cad>.dwg (row "S3 reopen S2 drawing"). Close CAD.',
  '',
  'Scenario 4: folder copied somewhere else',
  '  1. Copy this whole folder somewhere else, e.g. Desktop\\IPT copy.',
  '  2. Rename THIS (original) folder, e.g. add "_off" at the end, so a full path saved',
  '     in the drawing can no longer find the original images. (Rename it back afterwards.)',
  '  3. Open ipt2-<cad>.dwg from the COPY. Which images are shown? Write row S4',
  '     (IPCHECK as above if one is missing).',
  '  4. Close CAD and rename the original folder back.',
  '',
  'When done, send the filled-in tables back. Delete the .dwg files if you want to repeat',
  'a run: the test skips an image that is already in a drawing.',
  '',
  'Results',
  '=======',
  '',
  ...table('DraftSight'),
  ...table('AutoCAD'),
]

// ---------- write ----------

const ascii = (s: string, what: string): string => {
  if (/[^\t\n\r -~]/.test(s)) throw new Error(`${what} has a non-ASCII character`)
  return s.replace(/\r?\n/g, '\r\n')
}
mkdirSync(imgDir, { recursive: true })
writeFileSync(join(outDir, 'image-path-test.lsp'), ascii(lsp.join('\n'), 'image-path-test.lsp'), 'latin1')
writeFileSync(join(outDir, 'INSTRUCTIONS.txt'), ascii(instructions.join('\n') + '\n', 'INSTRUCTIONS.txt'), 'latin1')
METHODS.forEach((m, i) => {
  const png = makePng(m.rgb, [
    { text: m.scan, scale: 10, top: 55 },
    { text: m.code, scale: 5, top: 150 },
  ])
  writeFileSync(join(imgDir, file(i)), png)
})
console.log(`Image path test kit written to ${outDir}`)
console.log(`  image-path-test.lsp, INSTRUCTIONS.txt, Processed_Images\\ (${METHODS.length} images)`)
