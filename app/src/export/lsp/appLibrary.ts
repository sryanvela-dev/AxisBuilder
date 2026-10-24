// LISP the app's drawing adds to v5.0's library (approved changes, 2026-10-23). Written after the
// library, so these definitions replace v5.0's where the names match. Never written in compat 'v5.0'.
// A few of the library's own lines are changed where they are written (APP_LIBRARY_PATCHES): the layer
// lists that must know the layers the app adds.

/** Text layers TEXTRESIZE offers in the app's drawing, in menu order (v5.0's 14 plus the app's). */
export const TEXTRESIZE_LAYERS: readonly (readonly [string, string])[] = [
  ['Scan IDs', 'SCAN_TEXT'],
  ['Support / Object IDs', 'SUPPORT_TEXT'],
  ['Shell Nozzle IDs', 'SHELL_NOZZLE_TEXT'],
  ['Head Nozzle IDs', 'HEAD_NOZZLE_TEXT'],
  ['Shell MUT IDs', 'SHELL_MUT_TEXT'],
  ['Head MUT IDs', 'HEAD_MUT_TEXT'],
  ['X-Axis ruler numbers', 'X_RULER_TEXT'],
  ['X-Axis direction label', 'X_AXIS_LABEL_TEXT'],
  ['Reference labels', 'REFERENCE_TEXT'],
  ['Y-Axis ruler numbers', 'Y_RULER_TEXT'],
  ['Y-Axis direction label', 'Y_AXIS_LABEL_TEXT'],
  ['Legend / summary', 'LEGEND_TEXT'],
  ['Circ weld labels', 'CIRC_WELD_TEXT'],
  ['Long seam labels', 'LONG_SEAM_TEXT'],
  ['Title block text', 'TITLE_BLOCK_TEXT'],
  ['Head titles', 'HEAD_TITLE_TEXT'],
  ['Head clock text', 'HEAD_CLOCK_TEXT'],
]

/** One change to lines of the generated library: `find` is replaced in every line it matches; count = expected lines. */
export interface LibraryPatch {
  find: RegExp
  replace: string
  count: number
  why: string
}

export const APP_LIBRARY_PATCHES: readonly LibraryPatch[] = [
  {
    find: / 2\.5 (\(SL_RulerTextRot[XY]\)) label layer\)$/,
    replace: ' 2.5 $1 label (SL_AxisLabelLayer layer))',
    count: 9,
    why: 'The axis direction label of each ruler goes on its own layer.',
  },
  {
    find: /^( {10}\(setq upperSS \(SL_SelectionByLayers \(list "HEADS") /,
    replace: '$1 "HEAD_NOZZLE_LEADERS" ',
    count: 1,
    why: 'TEXTRESIZE moves the head nozzle leaders up with the head views.',
  },
  {
    find: /^(\(defun c:ABNOZZLES \(\) \(SL_ToggleLayerGroup "Shell nozzles" '\("NOZZLES") /,
    replace: '$1 "NOZZLE_LEADERS" ',
    count: 1,
    why: 'ABNOZZLES shows and hides the shell nozzle leaders too.',
  },
  {
    find: /^(\(defun c:ABRULERS \(\) \(SL_ToggleLayerGroup "Rulers and references" '\("X_AXIS") /,
    replace: '$1 "X_AXIS_LABEL_TEXT" "Y_AXIS_LABEL_TEXT" "REFERENCE_TEXT" ',
    count: 1,
    why: 'ABRULERS shows and hides the axis direction labels and reference labels too.',
  },
  {
    find: /^(\(defun c:ABHEADS \(\) \(SL_ToggleLayerGroup "Head views" '\("HEADS") /,
    replace: '$1 "HEAD_NOZZLE_LEADERS" ',
    count: 1,
    why: 'ABHEADS shows and hides the head nozzle leaders too.',
  },
]

/** A library line as the app's drawing writes it (APP_LIBRARY_PATCHES applied). */
export function patchLibraryLine(line: string): string {
  const patch = APP_LIBRARY_PATCHES.find((p) => p.find.test(line))
  return patch ? line.replace(patch.find, patch.replace) : line
}

export function writeAppLibrary(w: (line: string) => void): void {
  w(';;; ---- AxisBuilder app changes (not in v5.0) ----')
  w(';; Labels read the right way up in Horizontal CCW too (v5.0 drew tall scan and object labels,')
  w(';; and long seam labels, upside down there).')
  w('(defun SL_LabelRot (w h)')
  w('  (if (> h w) (if (= SL_ORIENTATION "Horizontal CCW") -90 90) 0)')
  w(')')
  w('')
  w('(defun SL_LabelRect (x y w h txt outlineLayer hatchLayer / cx cy rot th)')
  w('  (setq cx (+ x (/ w 2.0)))')
  w('  (setq cy (+ y (/ h 2.0)))')
  w('  (setq rot (SL_LabelRot w h))')
  w('  (setq th (SL_FitTextHeight w h txt))')
  w('  (SL_Rect x y w h outlineLayer)')
  w('  (if (and (/= hatchLayer "") (= SL_HATCH_ENABLED "YES"))')
  w('    (SL_HatchRect x y w h hatchLayer)')
  w('  )')
  w('  (SL_Text cx cy th rot txt outlineLayer)')
  w(')')
  w('')
  w('(defun SL_LongSeam (loc start stop vesselYLen label / y1 y2 labelY)')
  w('  (setq y1 (if (< start 0.0) 0.0 start))')
  w('  (setq y2 (if (< stop 0.0) vesselYLen stop))')
  w('  (setq labelY (+ y1 6.0))')
  w('  (if (> labelY (- y2 2.0)) (setq labelY (+ y1 (/ (- y2 y1) 2.0))))')
  w('  (SL_DashLine loc y1 loc y2 4.0 2.5 "LONG_SEAMS")')
  w('  (if (/= label "") (SL_Text loc labelY 2.0 (if (= SL_ORIENTATION "Horizontal CCW") -90 90) label "LONG_SEAMS"))')
  w(')')
  w('')
  w(';; A nozzle with its label where the app placed it (same rules as SL_CircleSmart / SL_HeadNozzle,')
  w(';; so the preview and the drawing match). leader = (list x1 y1 x2 y2) or nil for a label inside.')
  w(';; Leaders have their own layers (NOZZLE_LEADERS, HEAD_NOZZLE_LEADERS).')
  w('(defun SL_NozzleAt (x y r txt th tx ty leader layer textLayer)')
  w('  (SL_SetLayer layer)')
  w('  (command "CIRCLE" (SL_pt (SL_tf_x x y) (SL_tf_y x y)) (rtos r 2 3))')
  w('  (if leader (SL_Line (nth 0 leader) (nth 1 leader) (nth 2 leader) (nth 3 leader) (SL_LeaderLayer layer)))')
  w('  (if (/= txt "") (SL_Text tx ty th (SL_ReadableRot) txt textLayer))')
  w(')')
  w('')
  w('(defun SL_LeaderLayer (layer)')
  w('  (cond ((= layer "NOZZLES") "NOZZLE_LEADERS") ((= layer "HEADS") "HEAD_NOZZLE_LEADERS") (T layer))')
  w(')')
  w('')
  w(';; Ruler axis direction labels have their own layers (the numbers stay on X_RULER_TEXT / Y_RULER_TEXT).')
  w('(defun SL_AxisLabelLayer (layer)')
  w('  (cond ((= layer "X_AXIS") "X_AXIS_LABEL_TEXT") ((= layer "Y_AXIS") "Y_AXIS_LABEL_TEXT") (T layer))')
  w(')')
  w('')
  writeTextResize(w)
  w(';; Transparency for other layers, with the same safe -LAYER call as the hatch layers.')
  w('(defun SL_SetLayerTransparencyTo (layers value / keep)')
  w('  (setq keep SL_HATCH_TRANSPARENCY)')
  w('  (setq SL_HATCH_TRANSPARENCY value)')
  w('  (SL_SetLayerTransparency layers)')
  w('  (setq SL_HATCH_TRANSPARENCY keep)')
  w(')')
  w('')
}

/**
 * Text sizes from the Drawing step (only written when one is not Automatic). SL_Text and SL_TextLeft are
 * v5.0's, with the height passed through SL_TextHeight; every text in the drawing goes through them.
 * entries: (layer "SCALE" factor) or (layer "HEIGHT" height base-or-nil).
 */
export function writeTextSizes(w: (line: string) => void, entries: string[]): void {
  w(';; Text sizes chosen in the app (Drawing step). TEXTRESIZE still works on the same layers.')
  w(`(setq SL_TEXT_SIZES (list ${entries.join(' ')}))`)
  w('(defun SL_TextHeight (layer h / e)')
  w('  (setq e (assoc layer SL_TEXT_SIZES))')
  w('  (cond')
  w('    ((not e) h)')
  w('    ((= (nth 1 e) "SCALE") (* h (nth 2 e)))')
  w('    ((nth 3 e) (* h (/ (nth 2 e) (nth 3 e))))')
  w('    (T (nth 2 e))')
  w('  )')
  w(')')
  w('')
  for (const [name, just, note] of [['SL_Text', 'MC', ''], ['SL_TextLeft', 'ML', '  ;; Middle-left justification for title blocks and notes.']] as const) {
    w(`(defun ${name} (x y h rot txt layer / textLayer)`)
    if (note) w(note)
    w('  (setq textLayer (SL_TextLayer layer))')
    w('  (SL_SetLayer textLayer)')
    w(`  (command "-TEXT" "J" "${just}"`)
    w('    (SL_pt (SL_tf_x x y) (SL_tf_y x y))')
    w('    (rtos (SL_TextHeight textLayer h) 2 3)')
    w('    (rtos (SL_rot rot) 2 0)')
    w('    txt')
    w('  )')
    w(')')
    w('')
  }
}

/**
 * A bigger (or smaller) legend: v5.0's SL_Legend with every distance times SL_LEGEND_SCALE, so the whole
 * legend scales from the right panel's bottom-left corner (the text itself is sized by SL_TextHeight).
 * Written only when the legend text size is not Automatic; engine/layout.ts makes room above it.
 */
export function writeScaledLegend(w: (line: string) => void, scale: string): void {
  const d = (n: string) => `(* ${n} s)`
  const at = (dx: string, dy: string) => `${dx === '0' ? 'x' : `(${dx.startsWith('-') ? '-' : '+'} x ${d(dx.replace('-', ''))})`} ${dy === '0' ? 'y' : `(${dy.startsWith('-') ? '-' : '+'} y ${d(dy.replace('-', ''))})`}`
  w(';; The legend at the size chosen in the app (Drawing step): all of it scales, as TEXTRESIZE does in CAD.')
  w(`(setq SL_LEGEND_SCALE ${scale})`)
  w('(defun SL_Legend (x y / boxW boxH lr orient covTxt covLoc totalTxt orientTxt overlayTxt s)')
  w('  (setq s SL_LEGEND_SCALE)')
  w(`  (setq boxW ${d('12.0')})`)
  w(`  (setq boxH ${d('7.0')})`)
  w('  (setq lr (SL_ReadableRot))')
  w('  (setq orient (strcase SL_ORIENTATION))')
  w('  (setq covTxt SL_COVERAGE_TEXT)')
  w('  (setq covLoc (strcase SL_COVERAGE_LOCATION))')
  w('  (setq totalTxt SL_LEGEND_TOTAL_SCANS_TEXT)')
  w('  (setq orientTxt SL_LEGEND_ORIENTATION_TEXT)')
  w('  (setq overlayTxt SL_LEGEND_OVERLAY_TEXT)')
  w('  (if (= orient "VERTICAL")')
  w('    (progn')
  w(`      (SL_Text ${at('6.0', '25.0')} 2.3 lr "LEGEND" "LEGEND")`)
  w('      (if (= SL_HATCH_ENABLED "YES")')
  w('        (progn')
  w(`          (SL_Rect ${at('0', '8.0')} boxH boxW "LEGEND_SAMPLE")`)
  w(`          (SL_HatchRect ${at('0', '8.0')} boxH boxW "LEGEND_AUT_HATCH")`)
  w(`          (SL_Text ${at('3.5', '5.0')} 2.0 lr "AUT" "LEGEND")`)
  w('        )')
  w('      )')
  w(`      (SL_Rect ${at('8.0', '8.0')} boxH boxW "LEGEND_SAMPLE")`)
  w(`      (SL_HatchRect ${at('8.0', '8.0')} boxH boxW "LEGEND_MUT_HATCH")`)
  w(`      (SL_Text ${at('11.5', '5.0')} 2.0 lr "MUT" "LEGEND")`)
  w('    )')
  w('    (progn')
  w('      (if (= orient "HORIZONTAL CCW")')
  w(`        (SL_Text ${at('19.0', '9.0')} 2.3 lr "LEGEND" "LEGEND")`)
  w(`        (SL_Text ${at('-5.0', '6.0')} 2.3 lr "LEGEND" "LEGEND")`)
  w('      )')
  w('      (SL_Rect x y boxW boxH "LEGEND_SAMPLE")')
  w('      (SL_HatchRect x y boxW boxH "LEGEND_MUT_HATCH")')
  w(`      (SL_Text ${at('15.0', '3.5')} 2.0 lr "MUT" "LEGEND")`)
  w('      (if (= SL_HATCH_ENABLED "YES")')
  w('        (progn')
  w(`          (SL_Rect ${at('0', '8.0')} boxW boxH "LEGEND_SAMPLE")`)
  w(`          (SL_HatchRect ${at('0', '8.0')} boxW boxH "LEGEND_AUT_HATCH")`)
  w(`          (SL_Text ${at('15.0', '11.5')} 2.0 lr "AUT" "LEGEND")`)
  w('        )')
  w('      )')
  w('    )')
  w('  )')
  const stack = (dx: string[], dy: string[]) => {
    w(`      (SL_TextLeft ${at(dx[0], dy[0])} 2.0 lr totalTxt "LEGEND")`)
    w(`      (if (and (> (strlen covTxt) 0) (= covLoc "LEGEND")) (SL_TextLeft ${at(dx[1], dy[1])} 2.0 lr covTxt "LEGEND"))`)
    w(`      (SL_TextLeft ${at(dx[2], dy[2])} 2.0 lr orientTxt "LEGEND")`)
    w(`      (SL_TextLeft ${at(dx[3], dy[3])} 2.0 lr overlayTxt "LEGEND")`)
  }
  const down = ['-1.5', '-4.6', '-7.7', '-10.8']
  w('  (cond')
  w('    ((= orient "VERTICAL")')
  stack(['0', '0', '0', '0'], down)
  w('    )')
  w('    ((= orient "HORIZONTAL CW")')
  stack(['21.5', '24.6', '27.7', '30.8'], ['0', '0', '0', '0'])
  w('    )')
  w('    ((= orient "HORIZONTAL CCW")')
  stack(['-6.5', '-9.6', '-12.7', '-15.8'], ['15.0', '15.0', '15.0', '15.0'])
  w('    )')
  w('    (T')
  stack(['0', '0', '0', '0'], down)
  w('    )')
  w('  )')
  w(')')
  w('')
}

/** A bigger (or smaller) title block: v5.0's SL_TitleBlock with the line spacing times SL_TITLE_SCALE. */
export function writeScaledTitleBlock(w: (line: string) => void, scale: string): void {
  w(';; The title block at the size chosen in the app (Drawing step): the lines spread with the text.')
  w(`(setq SL_TITLE_SCALE ${scale})`)
  w('(defun SL_TitleBlock (x y title component unit client inspector dte rev / lr lineH orient lines i tx ty)')
  w('  (setq lr (SL_ReadableRot))')
  w('  (setq lineH (* 3.4 SL_TITLE_SCALE))')
  w('  (setq orient (strcase SL_ORIENTATION))')
  w('  (setq lines (list title component unit client inspector dte rev))')
  w('  (setq i 0)')
  w('  (foreach txt lines')
  w('    (if (/= txt "")')
  w('      (progn')
  w('        (cond')
  w('          ((= orient "HORIZONTAL CW") (setq tx (+ x (* i lineH))) (setq ty y))')
  w('          ((= orient "HORIZONTAL CCW") (setq tx (- x (* i lineH))) (setq ty y))')
  w('          (T (setq tx x) (setq ty (- y (* i lineH))))')
  w('        )')
  w('        (SL_TextLeft tx ty (if (= i 0) 2.4 1.8) lr txt "TITLE_BLOCK")')
  w('      )')
  w('    )')
  w('    (setq i (+ i 1))')
  w('  )')
  w(')')
  w('')
}

/**
 * TEXTRESIZE with the app's text layers: v5.0's command and menu, driven by TEXTRESIZE_LAYERS (one entry
 * per text layer, including the ones the app adds). The legend and title block reflow exactly as in v5.0.
 */
function writeTextResize(w: (line: string) => void): void {
  const n = TEXTRESIZE_LAYERS.length
  const legend = TEXTRESIZE_LAYERS.findIndex(([, l]) => l === 'LEGEND_TEXT') + 1
  const title = TEXTRESIZE_LAYERS.findIndex(([, l]) => l === 'TITLE_BLOCK_TEXT') + 1
  const all = n + 1
  const pick = n + 2
  const nl = '\\n'
  w(';; TEXTRESIZE knows the text layers the app adds (axis direction labels, reference labels).')
  w(`(setq SL_TEXT_MENU (list ${TEXTRESIZE_LAYERS.map(([label, layer]) => `(list "${label}" "${layer}")`).join(' ')}))`)
  w('(defun SL_TextSizeMenu ( / i)')
  w(`  (princ "${nl}========================================")`)
  w(`  (princ "${nl}         SCAN GENERATOR TEXT RESIZE")`)
  w(`  (princ "${nl}========================================")`)
  w(`  (princ "${nl}Current heights are shown in brackets.")`)
  w('  (setq i 1)')
  w('  (foreach item SL_TEXT_MENU')
  w('    (SL_MenuLine i (substr (strcat (car item) "............................") 1 28) (cadr item))')
  w('    (setq i (+ i 1))')
  w('  )')
  w(`  (princ "${nl} ${all}  All generated text")`)
  w(`  (princ "${nl} ${pick}  Select individual text objects")`)
  w(`  (princ "${nl}  0  Exit")`)
  w(')')
  w('')
  w('(defun c:TEXTRESIZE ( / choice newH oldLegendH ss count item done)')
  w('  (setq done nil)')
  w('  (while (not done)')
  w('    (SL_TextSizeMenu)')
  w('    (initget 4)')
  w(`    (setq choice (getint "${nl}Enter option number <0>: "))`)
  w('    (if (null choice) (setq choice 0))')
  w('    (cond')
  w('      ((= choice 0)')
  w('        (setq done T)')
  w(`        (princ "${nl}TEXTRESIZE finished.")`)
  w('      )')
  w(`      ((and (>= choice 1) (<= choice ${pick}))`)
  w('        (initget 7)')
  w(`        (setq newH (getreal "${nl}Enter new text height: "))`)
  w(`        (setq oldLegendH (if (or (= choice ${legend}) (= choice ${all})) (SL_FirstTextHeight "LEGEND_TEXT") nil))`)
  w('        (if newH')
  w('          (progn')
  w('            (cond')
  w(`              ((<= choice ${n})`)
  w('                (setq count (SL_ResizeTextLayer (cadr (nth (- choice 1) SL_TEXT_MENU)) newH))')
  w('              )')
  w(`              ((= choice ${all})`)
  w('                (setq count 0)')
  w('                (foreach item SL_TEXT_MENU (setq count (+ count (SL_ResizeTextLayer (cadr item) newH))))')
  w('              )')
  w(`              ((= choice ${pick})`)
  w(`                (princ "${nl}Select TEXT or MTEXT objects: ")`)
  w('                (setq ss (ssget (list (cons 0 "TEXT,MTEXT"))))')
  w('                (setq count (if ss (sslength ss) 0))')
  w('                (SL_SetTextHeightInSelection ss newH)')
  w('              )')
  w('            )')
  w('            ;; Rebuild the right panel from the fixed legend bottom anchor (as in v5.0).')
  w(`            (if (or (= choice ${legend}) (= choice ${all})) (SL_ReflowRightPanelForLegend oldLegendH newH))`)
  w(`            (if (or (= choice ${title}) (= choice ${all})) (SL_ReflowTextStack "TITLE_BLOCK_TEXT" newH 1.75 nil))`)
  w('            (command "_.REGEN")')
  w(`            (princ (strcat "${nl}Updated " (itoa count) " text object(s) to height " (rtos newH 2 3) "."))`)
  w(`            (princ "${nl}Choose another category, or enter 0 to exit.")`)
  w('          )')
  w('        )')
  w('      )')
  w(`      (T (princ "${nl}Invalid option. Enter a number from 0 through ${pick}."))`)
  w('    )')
  w('  )')
  w('  (princ)')
  w(')')
  w('')
}

/**
 * Scan images without a full Windows path (change 21, decided after the Phase 3a CAD test): each image is
 * looked for in <drawing folder>/<folder>, then on CAD's search path; failing both, the user picks any image
 * in the folder once and the rest come from there. Only string functions, as the Phase 3a test kit (tested in
 * DraftSight and AutoCAD). Written by the Export step's "Make CAD drawing".
 */
export function writeImageFinder(w: (line: string) => void, folder: string): void {
  const f = folder.replace(/"/g, '')
  w(';; Scan images are found next to the saved drawing (save the drawing in the job folder first), or picked once.')
  w('(setq SL_APP_IMAGE_DIR nil SL_APP_IMAGE_ASKED nil)')
  w('(defun SL_AppSlash (s / i c r)')
  w('  (setq r "" i 1)')
  w('  (while (<= i (strlen s))')
  w('    (setq c (substr s i 1))')
  w('    (setq r (strcat r (if (= c "\\\\") "/" c)))')
  w('    (setq i (1+ i))')
  w('  )')
  w('  r')
  w(')')
  w('(defun SL_AppFolderOf (path / i p)')
  w('  (setq path (SL_AppSlash path) i (strlen path))')
  w('  (while (and (> i 0) (not p))')
  w('    (if (= (substr path i 1) "/") (setq p i))')
  w('    (setq i (1- i))')
  w('  )')
  w('  (if p (substr path 1 p) "")')
  w(')')
  w('(defun SL_AppImage (name / prefix p picked)')
  w('  (setq prefix (getvar "DWGPREFIX"))')
  w('  (cond')
  w('    ((and SL_APP_IMAGE_DIR (setq p (findfile (strcat SL_APP_IMAGE_DIR name)))) p)')
  w(`    ((and (= (type prefix) 'STR) (setq p (findfile (strcat (SL_AppSlash prefix) "${f}/" name))))`)
  w('      (setq SL_APP_IMAGE_DIR (SL_AppFolderOf p))')
  w('      p')
  w('    )')
  w(`    ((setq p (findfile (strcat "${f}/" name))) (setq SL_APP_IMAGE_DIR (SL_AppFolderOf p)) p)`)
  w('    ((not SL_APP_IMAGE_ASKED)')
  w('      (setq SL_APP_IMAGE_ASKED T)')
  w(`      (princ "\\nThe scan images are not next to this drawing. Pick any image in the job's ${f} folder.")`)
  w(`      (setq picked (getfiled "AxisBuilder: pick any image in ${f}" (if (= (type prefix) 'STR) prefix "") "png" 0))`)
  w("      (if (= (type picked) 'STR)")
  w('        (progn (setq SL_APP_IMAGE_DIR (SL_AppFolderOf picked)) (findfile (strcat SL_APP_IMAGE_DIR name)))')
  w('      )')
  w('    )')
  w('    (T nil)')
  w('  )')
  w(')')
  w('(defun SL_AppInsertImage (x y w h name / img)')
  w('  (setq img (SL_AppImage name))')
  w('  (if img (SL_InsertFitImage x y w h img) (princ (strcat "\\nScan image not found: " name)))')
  w(')')
  w('')
}

/**
 * Items across the circumference seam (change 19): the unlabelled piece of a scan or object, and a nozzle
 * drawn as its arcs (one inside each edge). Written only when something wraps. NOZZLEWRAP only splits whole
 * circles centered on an edge and OBJECTWRAP only rectangles that cross an edge, so neither changes what
 * the app drew; both stay for drawings changed by hand.
 */
export function writeWrapLibrary(w: (line: string) => void): void {
  w(';; Items across the circumference seam (X = 0 and X = circumference are the same line), drawn in pieces by the app.')
  w('(defun SL_WrapPiece (x y w h outlineLayer hatchLayer)')
  w('  (SL_Rect x y w h outlineLayer)')
  w('  (if (and (/= hatchLayer "") (= SL_HATCH_ENABLED "YES"))')
  w('    (SL_HatchRect x y w h hatchLayer)')
  w('  )')
  w(')')
  w('')
  w(';; Arc from a0 to a1 degrees (counter-clockwise, logical axes), turned with the drawing.')
  w('(defun SL_ArcAt (cx cy r a0 a1 layer / c)')
  w('  (setq c (list (SL_tf_x cx cy) (SL_tf_y cx cy) 0.0))')
  w('  (entmakex (list (cons 0 "ARC") (cons 8 layer) (cons 10 c) (cons 40 r)')
  w('    (cons 50 (* pi (/ (SL_rot a0) 180.0))) (cons 51 (* pi (/ (SL_rot a1) 180.0)))))')
  w(')')
  w('')
  w(';; A nozzle across the seam: pieces = list of (cx cy r a0 a1) arcs or (cx cy r) whole circles; label as SL_NozzleAt.')
  w('(defun SL_NozzleArcsAt (pieces txt th tx ty leader layer textLayer)')
  w('  (SL_SetLayer layer)')
  w('  (foreach pc pieces')
  w('    (if (= (length pc) 5)')
  w('      (SL_ArcAt (nth 0 pc) (nth 1 pc) (nth 2 pc) (nth 3 pc) (nth 4 pc) layer)')
  w('      (command "CIRCLE" (SL_pt (SL_tf_x (nth 0 pc) (nth 1 pc)) (SL_tf_y (nth 0 pc) (nth 1 pc))) (rtos (nth 2 pc) 2 3))')
  w('    )')
  w('  )')
  w('  (if leader (SL_Line (nth 0 leader) (nth 1 leader) (nth 2 leader) (nth 3 leader) (SL_LeaderLayer layer)))')
  w('  (if (/= txt "") (SL_Text tx ty th (SL_ReadableRot) txt textLayer))')
  w(')')
  w('')
}
