# Settings review

Every per-job value a v5.0 job keeps on the **Project Settings** and **Drawing Information** sheets,
as the web app defines it. Generated from `app/src/data/settings.ts`; do not edit the tables by hand.

To change a level (or anything else), note the change here or tell Claude; the change is made in
`settings.ts` and this file is regenerated with `npm run docs:settings` (run in `app/`).

- **Default**: the value in the v5.0 workbook (New Project keeps these), or blank for values New Project clears.
  Where the VBA uses a different value when the row is missing, the v5.0 notes say so.
- **Step**: the app step the value belongs to (Project, Field data, AUT scans, Images, Export), and its group on that step.
- **Level**: suggested Basic (always shown) or Advanced (behind an "Advanced" switch).
- All lengths are in inches.
- "App: planned" in the v5.0 notes marks settings v5.0 does not use yet that the app will get code for.

## Project information (`project`)

| Key | Excel label | Plain name | Description | Type | Units | Range / choices | Default | Step | Level | v5.0 notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `projectName` | Project Name | Project name | Name of the job; also used to name the job and drawing files. | Text |  | Any text | (blank) | Project: Job information | Basic | OCR import fills it from the Equipment ID. Blank gives the file name "Scan_Layout". |
| `drawingTitle` | Drawing Information: Drawing Title | Drawing title | Main title printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic | Blank prints "AUT COVERAGE MAP". |
| `component` | Drawing Information: Component | Component | Vessel or equipment ID printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic |  |
| `unit` | Drawing Information: Unit | Unit | Unit, area or facility printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic |  |
| `client` | Drawing Information: Client | Client | Client name printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic |  |
| `inspector` | Drawing Information: Inspector | Inspector | Inspector name printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic |  |
| `date` | Drawing Information: Date | Date | Inspection or drawing date printed in the title block as month-day-year (Oct-22-2026). | Date |  | Real date or blank; printed as Oct-22-2026 | (blank) | Project: Job information | Basic | Printed as the cell shows it; no fixed date format. |
| `revision` | Drawing Information: Revision | Revision | Drawing revision printed in the title block. | Text |  | Any text | (blank) | Project: Job information | Basic |  |
| `drawingNotes` | Drawing Information: Notes | Drawing note | Optional short note for the drawing. | Text |  | Any text | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `equipmentType` | Drawing Information: Equipment Type | Equipment type | Kind of equipment inspected. | Choice |  | Vessel / Tank / Pipe / Sphere / Exchanger / Column / Other / (blank) | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `inspectionMethod` | Drawing Information: Inspection Method | Inspection method | Inspection method used on the job. | Choice |  | AUT / PAUT / MUT / AUT + MUT / PAUT + MUT / UT Shearwave / Visual / (blank) | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `procedure` | Drawing Information: Procedure | Procedure | Inspection procedure number. | Text |  | Any text | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `reportNumber` | Drawing Information: Report Number | Report number | Inspection report number. | Text |  | Any text | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `workOrder` | Drawing Information: Work Order | Work order | Work order number for the job. | Text |  | Any text | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `service` | Drawing Information: Service | Service | Process service of the equipment. | Text |  | Any text | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `material` | Drawing Information: Material | Material | Shell material. | Choice |  | Carbon Steel / Stainless Steel / Duplex / Inconel / Chrome-Moly / Aluminum / Other / (blank) | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `inspectionScope` | Drawing Information: Inspection Scope | Inspection scope | Scope of the inspection. | Choice |  | External AUT Mapping / Internal Corrosion Survey / Shell and Head Inspection / Nozzle Inspection / CML Monitoring / (blank) | (blank) | Project: Job information | Advanced | Stored only; not drawn. |
| `inspectionNotes` | Drawing Information: Notes: | Inspection notes | Free-text inspection notes, including vessel notes from the field form. | Text |  | Any text | (blank) | Project: Job information | Basic | OCR import appends the field-form vessel notes here. Stored only; not drawn. |

## Vessel (`vessel`)

| Key | Excel label | Plain name | Description | Type | Units | Range / choices | Default | Step | Level | v5.0 notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `orientation` | Vessel Orientation | Orientation | How the shell rollout is turned on the drawing. | Choice |  | Vertical / Horizontal CW / Horizontal CCW | Horizontal CW | Project: Vessel size and orientation | Basic | Also accepts field-form wording such as "Clockwise Horizontal". |
| `length` | Vessel Length | Shell length (Y) | Length of the shell along the vessel axis (the Y direction of the layout). | Number | in | > 0, or blank | (blank) | Project: Vessel size and orientation | Basic | Required to generate. Export falls back to 144 if the row is missing. |
| `height` | Vessel Height | Circumference (X) | Distance around the shell (the X direction of the layout). | Number | in | > 0, or blank | (blank) | Project: Vessel size and orientation | Basic | Required to generate. Export falls back to 151 if the row is missing. |
| `xAxisCardinal` | X Axis Cardinal Direction | X axis compass direction | Compass direction printed after "X AXIS DIRECTION" when no direction text is given. | Choice |  | North / South / East / West / (blank) | South | Project: Axis directions | Basic | Code fallback is blank. |
| `yAxisCardinal` | Y Axis Cardinal Direction | Y axis compass direction | Compass direction printed after "Y AXIS DIRECTION" when no direction text is given. | Choice |  | North / South / East / West / (blank) | East | Project: Axis directions | Basic | Code fallback is blank. |
| `xAxisDirectionText` | X Axis Direction Text (also: X Axis Custom Direction) | X axis direction text | Text printed after "X AXIS DIRECTION" (for example CW LOOKING NORTH); overrides the compass direction. | Text |  | Any text | (blank) | Project: Axis directions | Basic | Filled by OCR import. Printed in upper case. |
| `yAxisDirectionText` | Y Axis Direction Text (also: Y Axis Custom Direction) | Y axis direction text | Text printed after "Y AXIS DIRECTION" (for example TOWARD NORTH); overrides the compass direction. | Text |  | Any text | (blank) | Project: Axis directions | Basic | Filled by OCR import. Printed in upper case. |
| `referenceLabelMode` | Reference Label Mode | Reference label mode | Auto Cardinal uses the chosen label set; Custom Cardinal uses the five custom labels below. | Choice |  | None / Auto Cardinal / Custom Cardinal | Custom Cardinal | Project: Reference labels | Basic | Code fallback is Auto Cardinal. OCR import sets Custom Cardinal. |
| `referenceLabelSet` | Reference Label Set | Reference label set | Predefined labels for Auto Cardinal mode (TDC/BDC for horizontal, NDC/SDC or NamePlate DC for vertical). | Choice |  | TDC/BDC / NDC/SDC / NamePlate DC | TDC/BDC | Project: Reference labels | Basic |  |
| `refLabel0` | Ref 0° Label | 0° reference label | Custom label at 0° around the vessel; blank draws nothing. | Text |  | Any text | (blank) | Project: Reference labels | Basic | VBA reads the five custom labels by position (3 to 7 rows below Reference Label Mode), not by label. |
| `refLabel90` | Ref 90° Label | 90° reference label | Custom label at 90° around the vessel; blank draws nothing. | Text |  | Any text | (blank) | Project: Reference labels | Basic |  |
| `refLabel180` | Ref 180° Label | 180° reference label | Custom label at 180° around the vessel; blank draws nothing. | Text |  | Any text | (blank) | Project: Reference labels | Basic |  |
| `refLabel270` | Ref 270° Label | 270° reference label | Custom label at 270° around the vessel; blank draws nothing. | Text |  | Any text | (blank) | Project: Reference labels | Basic |  |
| `refLabel360` | Ref 360° Label | 360° reference label | Custom label at 360° (back to the start) around the vessel; blank draws nothing. | Text |  | Any text | (blank) | Project: Reference labels | Basic |  |

## Settings (`settings`)

| Key | Excel label | Plain name | Description | Type | Units | Range / choices | Default | Step | Level | v5.0 notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `outputCommand` | Output Command | CAD command name | CAD command name for the exported .lsp. | Text |  | Any text | SCANLAYOUT | Export | Advanced | Not read by the VBA; the command is always AXISBUILDER. App: planned feature (to be designed). |
| `rulerPlacement` | Ruler Placement | Ruler position | Where the rulers sit around the vessel as seen on the drawing. | Choice |  | None / Top / Bottom / Left / Right / Top + Left / Bottom + Left / Top + Right / Bottom + Right | Bottom + Left | Export | Basic |  |
| `rulerSpacing` | Ruler Spacing | Ruler tick spacing | Distance between ruler ticks. | Number | in | > 0 | 12 | Export | Basic | The v5.0 workbook has 20; the code fallback is 12. |
| `rulerOffset` | Ruler Offset | Ruler gap | Gap between the vessel outline and the rulers. | Number | in | ≥ 0 | 2 | Export | Advanced |  |
| `showRulers` | Show Rulers (also: Show Ruler) | Show rulers | Draw the X and Y rulers with their axis direction labels. | Yes/No |  | Yes / No | Yes | Export | Basic |  |
| `showDirectionLabels` | Show Direction Labels | Show direction labels | Show the axis direction labels. | Yes/No |  | Yes / No | Yes | Export | Advanced | Read by the older layout export but never used. App: planned feature (to be designed). |
| `arrowLengthMode` | Arrow Length Mode | Direction arrow length mode | Whether direction arrows size to their text or use a fixed length. | Choice |  | Text Based / Fixed | Text Based | Export | Advanced | Not read by the VBA. App: planned feature (to be designed). |
| `arrowLength` | Arrow Length | Fixed arrow length | Direction arrow length when the arrow length mode is Fixed. | Number | in | > 0 | 28 | Export | Advanced | Not read by the VBA. App: planned feature (to be designed). |
| `arrowHeadSize` | Arrow Head Size | Arrow head size | Size of direction arrow heads. | Number | in | > 0 | 3 | Export | Advanced |  |
| `showVesselReferenceLabels` | Show Vessel Reference Labels | Show reference labels | Draw the start, stop and centerline reference labels around the vessel. | Yes/No |  | Yes / No | Yes | Export | Basic | Code fallback is NO. |
| `referenceLabelTickLength` | Reference Label Tick Length | Reference tick length | Length of the tick mark drawn at each reference label. | Number | in | > 0 | 2 | Export | Advanced | Code fallback is 3; zero or less is replaced by 3. |
| `autHatchEnabled` | AUT Hatch Enabled | Hatch AUT scans | Fill scanned areas with hatch lines and show the AUT sample in the legend. | Yes/No |  | Yes / No | Yes | AUT scans: Scan drawing and checks | Basic |  |
| `autHatchPattern` | AUT Hatch Pattern | Hatch pattern name | Hatch pattern name (informational only). | Text |  | Any text | ANSI31 | AUT scans | Advanced | Not read by the VBA; the drawing always uses its own 45-degree line hatch. App: planned feature (to be designed). |
| `autHatchScale` | AUT Hatch Scale (also: Hatch Scale) | Hatch line spacing | Spacing between hatch lines; larger is wider. | Number | in | > 0 | 2.5 | AUT scans: Scan drawing and checks | Advanced |  |
| `autHatchAngle` | AUT Hatch Angle | Hatch angle | Hatch line angle, reserved for future use. | Number | degrees | Any number | 45 | AUT scans | Advanced | Written to the .lsp but not used; hatch is always 45 degrees. App: planned feature (to be designed). |
| `autHatchTransparency` | AUT Hatch Transparency | Hatch transparency | Transparency of all hatch layers, 0 = solid, 90 = most transparent. | Whole number | % | 0 to 90 | 50 | AUT scans: Scan drawing and checks | Basic | The v5.0 workbook has 70; the code fallback and sheet note say 50. The sheet label has a trailing space. |
| `smartNozzleLabels` | Smart Nozzle Labels | Smart nozzle labels | Place AUTO nozzle labels so they avoid scans and objects. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `minNozzleInsideLabelDiameter` | Minimum Nozzle Inside Label Diameter | Smallest nozzle labeled inside | AUTO nozzle labels go outside the circle, with a leader, below this diameter. | Number | in | ≥ 0 | 6 | Export | Advanced | Code fallback is 8. |
| `nozzleLeaderLength` | Nozzle Leader Length | Nozzle leader length | Leader line length for shell nozzle labels placed outside. | Number | in | > 0 | 4 | Export | Advanced | Code fallback is 6. |
| `showWeldLabels` | Show Weld Labels | Show weld labels | Master switch for circ weld and long seam labels. | Yes/No |  | Yes / No | Yes | Export | Basic |  |
| `showCenterline` | Show Centerline | Show vessel centerline | Draw the long-dash vessel centerline. | Yes/No |  | Yes / No | Yes | Export | Basic |  |
| `centerlineTransparency` | Centerline Transparency (not on sheet) | Centerline transparency | Transparency of the vessel centerline, 0 = solid, 90 = most transparent. | Whole number | % | 0 to 90 | 50 | Export | Advanced | App only (user, 2026-10-23). v5.0 draws the centerline solid. |
| `legendEnabled` | Legend Enabled | Legend (older layout) | Draw the legend in the older geometry-only layout export. | Yes/No |  | Yes / No | Yes | Export | Advanced | Older layout export only; the master drawing uses Show Legend On Overlay. App: planned, controlled in the app and shown/hidden by a CAD command. |
| `showTitleBlock` | Show Title Block | Title block (older layout) | Draw the title block in the older geometry-only layout export. | Yes/No |  | Yes / No | Yes | Export | Advanced | Older layout export only; the master drawing uses Show Title Block On Overlay. Code fallback is NO. App: planned, controlled in the app and shown/hidden by a CAD command. |
| `enableValidation` | Enable Validation | Check data before export | Run scan, image and overlap checks before generating the drawing. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `overlapDetection` | Overlap Detection | Scan overlap check | OFF ignores overlapping scans, WARN asks before continuing, BLOCK stops the export. | Choice |  | OFF / WARN / BLOCK | WARN | AUT scans: Scan drawing and checks | Advanced |  |
| `showValidationSummary` | Show Validation Summary | Show check summary | Show a summary of the checks after generating. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `headViewMode` | Head View Mode | Head views | Which head views to draw beside the shell layout. Head nozzles and head MUT are only drawn on a head that is shown. | Choice |  | NONE / HEAD 1 / HEAD 2 / BOTH | NONE | Field data: Heads | Basic |  |
| `headViewSize` | Head View Size | Head view size | Size of the head views (24%, 30% or 38% of the circumference, at least 24 in). | Choice |  | SMALL / MEDIUM / LARGE | SMALL | Export | Advanced |  |
| `showHeadNozzles` | Show Head Nozzles | Show head nozzles | Draw nozzles on the head views. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `head1Label` | Head 1 Label | Head 1 name | Title printed on the Head 1 view (for example NORTH HEAD). | Text |  | Any text | HEAD 1 | Field data: Heads | Basic | The v5.0 workbook has EAST HEAD. Printed in upper case. |
| `head2Label` | Head 2 Label | Head 2 name | Title printed on the Head 2 view (for example SOUTH HEAD). | Text |  | Any text | HEAD 2 | Field data: Heads | Basic | The v5.0 workbook has WEST HEAD. Printed in upper case. |
| `headNozzleLeaderLength` | Head Nozzle Leader Length | Head nozzle leader length | Leader line length for head nozzle labels placed outside. | Number | in | > 0 | 8 | Export | Advanced |  |
| `showHeadCenterlines` | Show Head Centerlines | Show head centerlines | Draw crosshair centerlines on the head views. | Yes/No |  | Yes / No | No | Export | Advanced |  |
| `showHeadClockReferences` | Show Head Clock References (also: Show Head Clock Reference) | Show head 12 o'clock marker | Draw the 12 o'clock reference arrow and text on the head views. | Yes/No |  | Yes / No | No | Export | Advanced |  |
| `generateOverlayDrawing` | Generate Overlay Drawing | Use scan images | Include scan photos in the drawing. | Yes/No |  | Yes / No | Yes | Images: Scan images | Advanced | Only used by the Home status check (NO skips the image check); the master export always processes images. |
| `originalImageFolder` | Original Image Folder (also: Image Folder) | Scan image folder | Folder that holds the scan photos. | Text |  | Any text | (blank) | Images | Basic | Windows path; blank uses the workbook folder. |
| `processedImageFolder` | Processed Image Folder | Processed image folder | Subfolder (or full path) for the stretched, drawing-ready copies of the scan photos. | Text |  | Any text | Processed_Images | Images: Scan images | Advanced |  |
| `overlayPixelsPerInch` | Overlay Pixels Per Inch | Processed image resolution | Resolution of the processed scan images. | Number | px/in | > 0 | 40 | Images | Advanced | Sheet says do not change from 40. |
| `draftSightImagePixelsPerUnit` | DraftSight Image Pixels Per Unit | CAD image calibration | Inserted image pixels per drawing unit; image scale = this value / image resolution. | Number | px/in | > 0 | 400 | Images | Advanced | Sheet says do not change from 400. Used for AutoCAD output too. |
| `overlayPreprocessRotation` | Overlay Preprocess Rotation | Image rotation override | Rotation applied to scan photos during processing; NONE is the tested baseline. | Choice |  | NONE / AUTO / CW90 / CCW90 | NONE | Images | Advanced | Code fallback is AUTO. Sheet says do not change from NONE. |
| `maxImageSide` | Largest Processed Image Side (not on sheet) | Largest processed image side | Longest side of a processed scan image. A larger one is scaled down (the shape stays exactly that of the scan) so the drawing stays quick to open, but never below the size the Excel version made (40 px per inch of scan). | Whole number | px | 500 to 10000 | 4096 | Images: Scan images | Advanced | App only. v5.0 sized every image at 40 px per inch of scan; the app never goes below that. |
| `showVesselOnOverlay` | Show Vessel On Overlay | Draw vessel outline | Draw the vessel outline and centerline in the drawing. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `showWeldsOnOverlay` | Show Welds On Overlay | Draw welds | Draw circ welds and long seams in the drawing. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `showSupportsOnOverlay` | Show Supports On Overlay | Draw objects | Draw supports and other objects in the drawing. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `showNozzlesOnOverlay` | Show Nozzles On Overlay | Draw shell nozzles | Draw shell nozzles in the drawing. | Yes/No |  | Yes / No | Yes | Export | Advanced |  |
| `showLegendOnOverlay` | Show Legend On Overlay | Draw legend | Draw the legend in the drawing. | Yes/No |  | Yes / No | Yes | Export | Basic |  |
| `showTitleBlockOnOverlay` | Show Title Block On Overlay | Draw title block | Draw the title block in the drawing. | Yes/No |  | Yes / No | Yes | Export | Basic |  |
| `showScanBordersOnOverlay` | Show Scan Borders On Overlay | Show image frames | Show frames around the scan images (sets CAD IMAGEFRAME). | Yes/No |  | Yes / No | Yes | Images: Scan images | Advanced | Code fallback is NO, and the sheet note says default NO. |
| `cadPlatform` | CAD Platform | CAD program | CAD program the .lsp is written for. | Choice |  | DraftSight / AutoCAD | DraftSight | Export | Basic | Set by the Home toggle. Anything other than AutoCAD means DraftSight. |
| `showCoveragePercentage` | Show Coverage Percentage (not on sheet) | Show coverage % | Print the scan coverage percentage in the legend. | Yes/No |  | Yes / No | Yes | Export | Basic | Not on the sheet, so v5.0 always uses the fallback YES. |
