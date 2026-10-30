# AUT Report Module: Generic AUT design (for review)

Status: **reviewed by the user 2026-10-28 (answers in section 11); design complete. Phase R1 built on feature/report-r1 (2026-10-29, see "R1 as built" at the end); Phase R2 (the workspace screens) on feature/report-r2 ("R2 as built").** This repo copy is the one to update; the original and the files it names (`Style_Sample/`, `References/`, `claude/LWN_Neck_Schedules.csv`, the spec and decisions docs) are in the design folder outside the repo (they hold client material).
Background: the design folder's `AUT_Report_Module_Spec.md` (original spec) and `AUT_Report_Design_Decisions.md` (decisions; they win over
the spec). Where this design differs from either, it says so.

Target layout: the reference job REF5 report (30 pages, a real client report, kept outside the repo), in the approved IEPC style (`Style_Sample/IEPC_AUT_Report_Style_Sample.pdf`).

---

## 1. What the first build covers

In:
- The Report workspace inside an AxisBuilder job, with the **Generic AUT** template.
- Report data saved in the same .axb file (new project file format 7).
- Scan results from the AUT Solutions `scansheet.csv`, data-page screenshots, manual readings (UTT / MUT scan),
  photos, calibration, custom sheets, uploaded reference pages, generated scope and summary.
- The finished report as one **PDF** (letter; cover portrait, everything else landscape), with clickable contents and
  bookmarks.
- Checks before export, in the same Review style as the drawing side.

Out (later, room left for them):
- XTO Horizontal and API 653 Tank templates (new template definitions + a few page types, section 3).
- Word (.docx) export (the page model is kept export-neutral, section 7).
- Making or copying templates inside the app.
- Head sheet and head scan positioning on the drawing side.
- Long weld neck / barrel neck nominals (charts parked in `claude/LWN_Neck_Schedules.csv`).
- Procedure-band coverage check, DRA (never).

---

## 2. How it fits into AxisBuilder

- **Same job, same file.** A job is still one .axb. The report part is `report` in the file (section 4); a drawing-only
  job has `report: null` and never shows anything about reports.
- **Two workspaces, one top bar.** The job top bar gets a switch **Drawing | Report**. Drawing = today's step bar
  (Project ... Export). Report = its own step bar (section 5). The switch appears once the job has a report, or from a
  "Start a report" button on the Drawing Export step and the start screen's job card.
- **Shared, never copied.** The report reads these straight from the job, so a change on one side shows on the other:
  - Job and vessel fields (client, location, vessel ID, equipment, date, procedure, material, circumference, length,
    axis directions and 0" reference text).
  - Scans: ID and position (X / Y start and stop). The report adds results per scan (section 4.3).
  - Shell and head MUT rows (ID, position, Min T, notes, area). The report adds reading details (section 4.4).
  - Nozzles (for nozzle UTT readings).
  - Coverage (`coveragePercent`, `mutCoverageArea`): the same numbers the drawing prints.
  - The drawing itself: report drawing pages print the app's own sheet models (`engine/sheetModel.ts`), vector, no
    image export step.
- **Kept apart in the code.** New folder `app/src/report/` so report code doesn't tangle with the drawing:
  - `report/schema.ts` – report data (Zod), migrations hook into `data/projectFile.ts`.
  - `report/templates/` – template definitions (`generic.ts`), template types, the template registry.
  - `report/calc/` – wall loss, ladder, comments, totals, temperature correction, nominal pick, number words.
  - `report/pages/` – one builder per page type, all producing the page model.
  - `report/pageModel.ts` – export-neutral pages (boxes, text runs, tables, images, vector sheets) in inches.
  - `report/pdf/` – page model -> PDF (pdf-lib + fontkit, as the drawing PDF).
  - `report/checks.ts` – checks before export.
  - `ui/report/` – the workspace screens.
  Shared helpers (CSV reading, image matching, folders, undo, file save) are reused, not copied.
- **Undo, drafts, recovery, Find a setting**: the report goes through the same `edit()` / undo history, drafts and
  recovery copy as the rest of the job.

---

## 3. Templates (built for custom templates from day one)

A template is **data**: a definition the code reads. Generic AUT is the first one, with no special cases in code.

```ts
interface ReportTemplate {
  id: 'generic-aut'            // later 'xto-hzl', 'api653-tank', client templates
  version: number              // a job remembers the version it was made with
  name: string                 // "Generic AUT"
  title: [string, string]      // cover title lines: "AUTOMATED ULTRASONIC", "Corrosion Mapping Examination"
  sections: SectionDef[]       // in report order
  coverFields: FieldRef[]      // which job fields the cover shows (optional ones off by default)
  headerFields: FieldRef[]     // the standard page header
  footerFields: FieldRef[]
  scanColumns: ColumnRef[]     // scan sheet columns
  readingColumns: ColumnRef[]  // manual readings columns
  ladder: { cutoffs: [5, 16, 30], severity: string[], forms: string[], causes: string[], midWall: string[] }
  textBlocks: TextBlockDef[]   // scope and summary sentences, each with an on/off default
  readingNaming?: NamingRule   // client MUT / CML naming (later)
  fixedPages: FixedPageDef[]   // Equipment, Guide to Interpretation
}

interface SectionDef {
  id: string                   // 'scope-summary', 'calibration', 'photos', ...
  title: string                // shown in the header band and the contents
  pageType: PageTypeId         // which building block draws it
  optional: boolean            // can be turned off per job
  defaultOn: boolean
  options?: object             // page-type settings (e.g. photos per page)
}
```

**Page types** (shared building blocks, any template can use them):
`cover`, `contents`, `scopeSummary`, `calibration`, `photos`, `drawing`, `table` (scan sheet, manual readings; later
CML table, course roll-up), `cscan`, `custom`, `uploaded` (reference images / PDF pages), `fixedText` (Equipment,
Guide to Interpretation).

**Rules**
- One report data model for all templates; a template only chooses what to show and how to word it. Switching
  template keeps all data.
- A job saves `templateId` + `templateVersion`. A newer template version never silently changes an existing job's
  report; the app offers "Update to the new template" with a list of what changes.
- Adding XTO or Tank later = a new definition + any missing page type (CML table, course roll-up) + its text blocks.
  No change to the Generic definition or the data already saved.

**Generic AUT sections** (REF5 order):

| # | Section | Page type | On by default | Notes |
|---|---|---|---|---|
| 1 | Cover | cover | yes | portrait |
| 2 | Table of Contents | contents | yes | generated, clickable |
| 3 | Scope & Summary | scopeSummary | yes | tiles + text, flows onto a 2nd page if long |
| 4 | Calibration | calibration | yes | job / equipment fields + dynamic calibration screenshot |
| 5 | Photos | photos | yes | 2 per page, single photo fills the page |
| 6 | Drawings | drawing | yes | rollout and scan overlay drawings from AxisBuilder |
| 7 | Scan Sheet | table | yes | AUT scans + totals |
| 8 | Manual UT | table | when readings exist | UTT and MUT scan rows |
| 9 | C-Scan Data | cscan | yes | one page per scan |
| 10 | Custom sheets | custom | when any exist | placed where the user puts them (default: after C-scans) |
| 11 | Reference pages | uploaded | when any exist | plant drawing, nameplate, GA ... |
| 12 | AUT Equipment | fixedText | yes | fixed page |
| 13 | Guide to Interpretation | fixedText | yes | fixed page |

---

## 4. Report data in the .axb (project file format 7)

Format 7 adds one key, `report` (null by default; format 6 files open with `report: null`). Everything below lives
under it. Files (screenshots, photos, uploads) are **linked by file name, not copied into the .axb** (as scan photos
are today); the folders are remembered per job in IndexedDB like the photo folder.

### 4.0 Components (decided 2026-10-28)
Every scan result and manual reading belongs to a **component**: a part of the equipment with its own nominal. This
replaces a single shell nominal (vessels and tanks can have shells of different thickness, boots, heads, nozzles;
piping jobs have many lines).
```
components: [{ id, name,                         // "Shell", "Shell course 1", "Boot", "Head 1", "Line 6\"-P-102"
  kind: 'shell' | 'course' | 'head' | 'boot' | 'line' | 'other',
  nominal,                                       // inches; required before export
  material: null | text,                         // blank = the job's material
  size: { circumference?, length?, diameter?, nps? },   // what the kind needs (for coverage and the header)
  yRange: null | [from, to],                     // shell courses / plates on the drawing: Y band in inches
  notes }]
```
- **Generic AUT** creates Shell, Head 1 and Head 2 from the drawing (heads only when they are on), nominals entered
  once. The user can add components: a **boot**, a second shell thickness, an "other". Heads always have their own
  nominal (the REF5 head rows were measured against the shell nominal: -13%).
- **Different shell thickness** (vessel plates or tank courses): components of kind `course` with a Y band; scans are
  assigned by their Y position automatically. A scan crossing two bands gets a warning and the user picks one (per-course
  lows inside one scan are a Tank-template question for later).
- **Boots** (and other parts not on the rollout): their own component with diameter / length and nominal. Their scans
  are assigned by hand. Drawing a boot in AxisBuilder is a future drawing-side item (like the head sheet); until then the
  report uses uploaded drawings or a Custom sheet for it.
- **Piping** (future, section 13): one component per line or spool.
- Tables can be **grouped by component** (subtotal per component) when there is more than one; Generic with only the
  shell prints as today.

### 4.1 Template and job fields
```
report: {
  templateId, templateVersion,
  job: { ... },            // report-only job fields (below)
  calibration: { ... },    // 4.2
  scanResults: [ ... ],    // 4.3
  readings: [ ... ],       // 4.4
  photos: [ ... ], coverPhoto,   // 4.5
  customSheets: [ ... ], uploads: [ ... ],  // 4.6
  text: { ... },           // 4.7
  sections: { ... },       // 4.8
  options: { ... }         // 4.9
}
```
**Job fields: shared vs report-only.** Shared fields stay where they are today (Project step) and the report shows
them; nothing is entered twice. Proposed mapping (**to confirm**, section 11):

| Report field | Comes from |
|---|---|
| Client | project `client` (shared) |
| Location (the facility, e.g. "Example Plant") | **new shared project field `location`** (decided 2026-10-29) |
| Unit (section of the facility, optional) | project `unit` (shared; blank = not printed) |
| Equipment ID (company number / nomenclature, e.g. "V-200") | project `component`, **shown as "Equipment ID"** everywhere (decided 2026-10-29; key unchanged so files still open) |
| Equipment type (vessel, tank, ...) | project `equipmentType` (shared; list can be added to) |
| Equipment name (e.g. "Inlet Separator") | **new shared project field `equipmentName`** (decided 2026-10-29: it can differ from the ID); optional |
| Date | project `date` (shared; printed "October 13, 2026" in the report) |
| Procedure, revision | project `procedure` + new report field `procedureRevision` |
| Material | project `material` (shared) |
| Circumference, length, 0" reference X / Y | vessel fields (shared) |
| Nominal T | the shell component's nominal (4.0); the header shows it, or "See scan sheet" when shells differ |
| Job number, report revision | new report fields (project `reportNumber` / `revision` if they mean the same – confirm) |
| Examination type | new report field, default "Corrosion Mapping Examination" |
| Examiners | new list `techs: [{ name, title }]` (from the saved list, section 4.10) |
| Reviewer | optional `reviewer: { name, title } | null`, off by default |
| Acceptance criteria, surface condition, inspection surface, technique | new report fields with saved-list dropdowns |
| Optional cover fields | coordinates, unit, cost center (off by default) |

### 4.2 Calibration and equipment
Mirrors the REF5 Calibration page:
- Calibration block (name, thickness range, material), reference reflector.
- AUT system: maker, model, S/N.
- Transducers: up to 4 channels, each { maker, mode, single/dual, size, frequency, angle, S/N }; only filled channels
  print (the REF5 page printed "X" in empty rows – dropped).
- Scanner: maker, model, S/N, automated / manual; settings for wheels and arm (orientation, scan speed, horizontal /
  vertical, track yes / no, arm length).
- Dynamic calibration screenshot: one image file.
- Calibration note and temperature note: template text blocks.

### 4.3 Scan results (one per scan, keyed by scan ID)
The scan itself (ID, position, include) stays in the drawing's `scans` list. The report adds, per scan ID:
```
{ scanId, componentId,                                        // 4.0; automatic by Y band, or picked
  location: null | text,                                      // extra wording, e.g. "Bottom"
  incrX, incrY, readings, minT, avgT, nomT, csvComment,       // from scansheet.csv, editable
  severityOverride: null | severity,                          // ladder override, flagged (4.3.1)
  form: null | form, cause: null | cause, surface: 'I.D.' | 'O.D.', midWall: null | indication,
  commentOverride: null | text,                               // free text, flagged
  dataImage: file name | null,                                // full data-page screenshot
  inReport: true }
```
- Kept in step with the scans list the same way `syncScanImages` does today (rename follows, delete removes).
- A scan switched off in the drawing is still listed in the report unless `inReport` is off (the two are separate
  choices; a check asks when they differ).

**4.3.1 Comment builder** (decided by the user 2026-10-28; replaces the workbook phrases and the spec's three selectors).
Each scan and manual reading has:

| Group | Set by | Choices |
|---|---|---|
| Severity | ladder (override allowed, flagged) | No significant / Minor / Moderate / Significant |
| Form | tech | blank / General / Localized / Pitting / Localized with pitting |
| Cause | tech, optional | blank (= "wall loss") / Corrosion / Erosion / Corrosion-erosion |
| Surface | default I.D. | I.D. / O.D. |
| Mid-wall indication | tech, optional | None / Lamination / Inclusion / Hydrogen blistering / Mid-wall indication |

Comment = "**[Severity] [form] [surface] [cause] detected.**" + (when a mid-wall indication is picked) "**Mid-wall
[indication] detected.**" (indication in lower case; "Mid-wall mid-wall indication" written as "Mid-wall indication detected.").
Examples: "No significant I.D. wall loss detected." / "Minor localized I.D. corrosion detected." / "Moderate I.D.
pitting detected." (form Pitting, cause blank -> the form is the noun) / "Significant general I.D. erosion detected.
Mid-wall lamination detected."
- The app never names a cause the tech didn't pick. The wall loss percentage is **not** written in the comment (user).
- Choices and wording live in the template, so a client template can change them.
- Overrides and picks survive a re-import of the CSV; a free-text comment override is still possible (flagged).

### 4.4 Manual readings (UTT / MUT scan)
One table. Two kinds of row:
1. **Linked rows**: every shell and head MUT row in the drawing appears automatically. ID, position, Min T, notes and
   area are the drawing's own values (edit in either place, same value). The report adds the extra columns below,
   keyed by list + ID + occurrence (the same way moved labels are stored, so they follow renames and sorting).
2. **Report rows**: readings that aren't drawn as MUT points, e.g. nozzle readings ("Nozzle 3 – North"). Optionally
   linked to a shell or head nozzle (then its ID and size come from the nozzle).

Columns (Generic):
```
{ name, location, componentId,             // "Nozzle 3", "North"; component = Shell / Head 1 / Boot ...
  type: 'UTT' | 'MUT scan',
  minT, avgT (MUT scan), maxT (MUT scan, optional), area (MUT scan; from the drawn MUT area when linked),
  nominalMode: 'component' | 'pipe' | 'custom',   // component = that component's nominal
  pipeSize (NPS, pipe only), nominal,       // pipe: suggested (4.4.1), custom: typed
  na: null | reason,                       // "U-Bolt Obstruction", "Repad", ...: prints the reason, excluded from math
  severityOverride, form, cause, surface, midWall, commentOverride }   // 4.3.1
```
- Default nominal mode: shell and head MUT rows `component` (their own component's nominal, so a head reading is
  never measured against the shell); nozzle rows `pipe`; anything else `custom`.
- Order: as the user sorts it; default = nozzles, then shell MUT, then head MUT (REF5 order).

**4.4.1 Pipe nominal suggestion** (decided 2026-10-28): standard walls for the NPS from an ASME B36.10M / B36.19M table
in the app (values checked against the standard when built). Pick the heaviest wall W where the thickest reading for
that nozzle (all its rows) is at least 87.5% of W. Show "XS, 0.337 in" with the other walls in a dropdown. Changing it
is an override (flagged, kept). Flag when the thickest reading is more than 15% over the pick.

### 4.5 Photos
`photos: [{ file, caption, alone: false }]`, `coverPhoto: file | null`. Order = list order. Pages are laid out from
the list (section 6.5). `alone: true` forces a photo onto its own page (full size).

### 4.6 Custom sheets and uploaded pages
```
customSheets: [{ id, title, after: sectionId, blocks: Block[] }]
Block = { kind: 'image', file, caption }
      | { kind: 'view', view: 'head1' | 'head2' | 'main' | 'section:n' | { crop: box } }   // AxisBuilder views
      | { kind: 'cscanBoxes', scanId | null, comment, stats }                              // like a C-scan page
      | { kind: 'text', title, body }
      | { kind: 'table', title, rows: string[][] }
```
A custom sheet has a simple layout choice: **1 large / 2 side by side / 2 + side panel / 4 grid**; blocks fill the slots
in order. (No free placement in the first build; it keeps the pages tidy and is easy to template.)
`uploads: [{ file, page: null | number, title, after: sectionId, frame: 'standard' | 'full', rotate: 0 | 90 | 180 | 270 }]`
– images or **pages taken straight from a PDF** (user, 2026-10-28):
- Drop a PDF (or pick it) -> a **page picker** with thumbnails of every page; tick one or several pages; each becomes
  its own report page (one entry per page, all pointing at the same file).
- The page is copied into the report **as the original PDF page** (pdf-lib `embedPage`), not a screenshot: text and
  lines stay sharp and searchable at any zoom, and the file stays small.
- `frame: 'standard'` = scaled to fit under the report's header and footer (default; turns landscape / portrait as
  needed with `rotate`); `'full'` = the page as it is, full size, with only the page number added (for a GA drawing or
  a client form that must look untouched).
- Thumbnails and the Pages view use a PDF renderer bundled for offline use (pdf.js); the export only needs pdf-lib.
- A password-protected or damaged PDF gets a plain message ("This PDF is locked; open it and print to a new PDF
  first"). The PDF is linked like photos (file name in the job folder), so the report re-reads it at export.

### 4.7 Text: scope and summary
```
text: {
  scope: { blocks: { [id]: on/off }, fields: { purpose, areaCovered, limitations }, edited: null | text },
  summary: { edited: null | text, editedAt, generatedAt }
}
```
- Generated text comes from the template's text blocks + the data. The user can edit it; an edit is kept and flagged
  ("edited by hand") and is never replaced unless the user clicks **Regenerate**, which shows the new text next to the
  edited one first.
- Short fields (purpose, area covered, limitations) have saved suggestions (4.10).

### 4.8 Sections and pages
```
sections: { [sectionId]: { on: boolean, order?: number, title?: string } }
```
Turn sections off, rename the header title (e.g. "Overview Photos"), move custom sheets and uploads. Page breaks inside
a section are automatic (section 6); the user controls them only through the content (photos `alone`, custom sheet
layout, which drawings are included).

### 4.9 Options
```
options: {
  ladder: { cutoffs: [5, 16, 30] },           // from the template; a job can change them (flagged)
  tempCorrection: { on: false, tempF: null },
  drawings: { rollout: true, overlay: true, sections: 'as drawing' },
  cscanStats: { temperature: false },         // REF5 set by default: min, avg, wall loss
  numberWords: true                           // "seventeen (17)"
}
```

### 4.10 Saved lists (per computer, not in the .axb)
Tech names and titles, assistants, AUT systems, transducers, scanners, calibration blocks, surface conditions,
reference reflectors, acceptance criteria, scope purposes / areas / limitations. Kept in IndexedDB on that computer
(like recent jobs). Picking from a list copies the values into the job, so the .axb is complete on its own. Add /
edit / delete in a "Saved lists" dialog; **export / import as a file** so a tech can move to a new laptop (approved).
**Every dropdown in the report can be added to** (user, 2026-10-28), e.g. equipment type, examination type, surface
condition: type a new value once and it joins that list on this computer.

---

## 5. The Report workspace (screens and steps)

Step bar, with done / needs attention / not started like the drawing side, one "Next: ..." button, and a **Pages**
preview beside each step (like the drawing preview), showing the report pages that step affects.

| Step | What the user does |
|---|---|
| **1. Setup** | Pick the template (first time only; changeable). Report-only job fields, examiners, reviewer (optional), cover photo, which optional sections are on. Shared fields shown read-only with "Edit on the Project step". |
| **2. Calibration** | Calibration block, AUT system, transducers, scanner and settings (saved-list dropdowns). Dynamic calibration screenshot. Temperature correction on/off and temperature. |
| **3. AUT results** | **Import scansheet.csv** (button or drop). Results table: scan, location, readings, min, avg, nom, wall loss, comment, selectors, override flags. **Screenshots**: pick one or two folders; files grouped by pattern ("Scan #", "S#"); the user confirms which is the data page and which is the overlay (the overlay pattern goes to the drawing's Images step); per-scan matched / choose / missing, like the Images step. |
| **4. Manual UT** | The readings table (4.4): add rows, "Add nozzle readings" (pick the positions: North / East / South / West / Top / Bottom, any mix; the last choice is remembered; one row each, linked to the nozzle; a time-saver, not a generator), paste from Excel, type UTT / MUT scan, nominal mode, N/A reason, selectors. MUT rows from the drawing already listed. |
| **5. Photos and pages** | Photos (pick folder or files, drag to order, caption, "own page"); custom sheets (add, layout, blocks, AxisBuilder view picker); uploaded reference pages; drawings to include (rollout, overlay, section sheets: from the drawing's Sheets). |
| **6. Summary** | Six number tiles (scans, readings, coverage, minimum with scan, wall loss, average). Scope builder (blocks on/off, purpose / area / limitations fields). Generated summary with edit, flag and Regenerate. |
| **7. Review** | Every open check (section 8), errors first, Go to each. |
| **8. Export** | Make the PDF (`<job name> - <client> - AUT Report.pdf` in the job folder, asks before replacing, Open the PDF). Later: Word. |

**scansheet.csv import** (the AUT Solutions export with results):
- Columns read by header (File Name, X-Start, X-Stop, Y-Start, Y-Stop, X-Incr., Y-Incr., Readings, Min. 'T', Ave 'T',
  Nom. 'T', Wall Remain %, Comments); "cal" rows skipped, as the drawing's CSV import.
- **The same file also feeds the drawing.** If the job has no scans, it creates them (positions) exactly as the AUT
  scans step does today, reversed X and across-the-seam rules included. If scans exist, results are matched by scan
  number; positions that differ are listed and the user picks drawing or CSV. So a tech can import once.
- Wall Remain % is read but not trusted: wall loss is recalculated from min and the row's nominal; a mismatch over
  0.1% is listed in the import report.

**Pasting a scan sheet from Excel** (user, 2026-10-28: some techs will copy rows from Excel instead of dropping the CSV,
often without every column):
- Paste dialog (as `data/paste.ts` today) with a column match step: the app guesses each pasted column from its header
  or values; the user fixes any guess. Columns not pasted stay blank, never invented.
- Filled in where it can be worked out exactly: **readings = (|X stop − X start| / X increment + 1) x (|Y stop − Y
  start| / Y increment + 1)** (checked: matches all 17 REF5 scans exactly); increments default to the job's increments
  (Calibration step, used by the scope sentence too) when not pasted; nominal from the scan's component. Filled values
  are marked "calculated".
- Min T and Avg T can't be worked out: blank cells show as missing on the AUT results step and block the PDF (Review
  lists them). They can be typed in or pasted later as a second paste matched by scan number.
- Positions follow the same rules as the CSV (create scans in the drawing if none, else match by scan number).

**Pages view** (Report side's Sheets view): every page in order with page numbers, zoom, previous / next, click a page
to jump to the step that fills it. Rendered from the same page model as the PDF.

---

## 6. Page layouts (Generic AUT)

All pages letter. Cover portrait; every other page landscape. Style as approved (decisions doc, "Output").
Fonts Montserrat (headings) and Roboto (body), bundled and embedded; precached for offline.

**6.0 Standard frame (every page after the cover)**
- Header band (white): logo left; Client / Location / Vessel ID / Equipment / Examination; 0" reference X and Y; Nominal
  T, Material, Circumference, Length; blue rule below. Section title on the band (e.g. "SCAN SHEET").
- Footer: vessel ID, client and location, job number, rev, exam type, "Page X of Y".
- Content area: what is left (about 10.0 x 6.4 in on landscape letter, measured when built).

**6.1 Cover** – as the style sample: logo, job number and rev, title with blue side bar, client / location / vessel ID /
equipment in two columns, cover photo (fit, never stretched), examiners with titles, date, optional reviewer line, foot
strip. No cover photo -> the space closes up (no "CLICK TO INSERT PHOTO").

**6.2 Contents** – section titles with page numbers, each a link; PDF bookmarks for every section and every scan.

**6.3 Scope & Summary** – Scope text, then the six tiles, then Summary text. Red only for minimum and wall loss when
there is loss; deep blue for other figures. Long text flows to a second page with the header repeated.

**6.4 Calibration** – field grid in section boxes (Job / Procedure / Material and surface / Calibration block / AUT
system / Transducers (filled channels only) / Scanner and settings), dynamic calibration screenshot, notes.

**6.5 Photos** – 2 per page side by side, each with its caption. A page with one photo (single photo, odd last one, or
`alone`) shows it large, centred. Photos keep their shape. Section title per page = the section title ("Photos";
renameable), not "Overview Photo" on every page.

**6.6 Drawings** – one page per sheet, from the drawing's sheet models printed into the content area as vectors (fitted,
aspect kept): rollout drawing (main sheet, "As the preview" layers), scan overlay drawing ("Overlays" layers), section
sheets if the drawing has them. Same engine as the drawing PDF, so the report and the drawing PDF always match.

**6.7 Scan Sheet** – Component block (circumference, length, component area, AUT area, AUT coverage %, MUT coverage %,
combined), then the table: Location, Scan, X start / stop / interval, Y start / stop / interval, Readings, Coverage
(sq in), Min T, Avg T, Wall loss %, Nom T, Comment. Header row repeats on every page; totals row at the end (total
readings, total coverage, overall min, overall average, overall wall loss). Only rows that exist; wall loss colored by
the ladder bands (section 8: Moderate amber, Significant red). Columns "File Name" and "Scanner location" are dropped
from Generic (user, 2026-10-28).

**6.8 Manual UT** – same table style: Name, Location, Type, Min T, (Avg T, Max T, Area for MUT scans), Nominal,
Wall loss %, Comment. N/A rows print the reason across the thickness columns. Negative wall loss prints
"No wall loss (x.x% above nominal)". Totals: number of readings, minimum with its name.

**6.9 C-Scan Data** – one page per scan in report: title "Scan 12" + location; data-page screenshot large on the left
(about 2/3 of the width, aspect kept, no cropping); right column: Comments box, Statistics box (minimum, average, wall
loss; temperature and corrected values when turned on). Missing screenshot -> a grey "No screenshot" box and a check
(never a "Click here" placeholder).

**6.10 Custom sheets** – standard frame, sheet title, blocks in the chosen layout (4.6).

**6.11 Uploaded pages** – images fitted under the standard frame with a title; PDF pages copied as vectors, either
fitted under the frame or full size (4.6).

**6.12 Equipment, Guide to Interpretation** – fixed text from the template, re-laid out so nothing is clipped. Their
pictures are template assets bundled with the app. **For now taken from IEPC AUT Report.xlsm** (user, 2026-10-28;
extracted to `References/_xlsm_images/`, not committed until checked for client content). Notes from looking at them:
the AUT Solutions scanner and ProScan unit, the C-scan screenshots and the B-scan / C-scan diagram are fine; the
equipment-type photos (sphere, exchanger, tank, vessel, column) are about 400 px wide with 2004 date stamps and will
print soft; the corrosion-mapping examples and the two rollout examples on the Guide are old drawings (one names a
client tank). Suggested later swap: newer photos, and examples made from the V-100 sample job in
AxisBuilder's own style. Old logo image not used (the brand logo is).

---

## 7. Page model and PDF

- `report/pageModel.ts`: a page = size, orientation, and a list of placed items in inches: text runs (font, size,
  color, wrap width, alignment), rules and boxes, tables (already split into pages), images (file reference + fit box),
  vector sheets (a `SheetModel` + placement), links and bookmarks.
- Layout happens once, in the page builders (text measured with the bundled fonts' metrics, as `engine/textMetrics`
  does for Arimo). The PDF writer only draws. Word export later converts the same model.
- Table splitting: rows fill the content area; header repeats; a row never splits; the totals row stays with at least
  one data row.
- Images: read from the linked folders when exporting, embedded once, downsampled to about 300 dpi of the printed
  size (as drawing PDF photos); data-page screenshots keep their full resolution up to that cap.
- "Page X of Y" and the contents' page numbers come from a two-pass layout (count, then draw).

---

## 8. Calculations (report/calc, all unit-tested)

- **Wall loss %** = (1 − min / nominal) x 100, per row with that row's own nominal. Printed to 2 decimals.
- **Ladder** (template cutoffs, default 5 / 16 / 30) sets the severity: <=5 No significant / >5-16 Minor / >16-30
  Moderate / >30 Significant. Negative wall loss falls in the first band.
- **Comment** built as in 4.3.1.
- **Wall loss colors** follow the same bands (user, 2026-10-28; the workbook's 30 / 49.9 / 50 bands are dropped): No
  significant and Minor = black, Moderate = amber, Significant = red. Same in the scan sheet, manual table, C-scan
  statistics and the summary tiles.
- **Temperature correction** (when on): corrected = UT x (1.007 − 0.0001 x T°F) (the formula printed in the REF5 report),
  applied to min and avg before wall loss, everywhere (C-scan pages, scan sheet, manual table, summary).
- **Totals**: readings = sum of the CSV readings (overlaps flagged, not removed); overall min = lowest min with its
  scan; overall average = average of the scan averages **weighted by readings**; overall wall loss = the worst wall loss
  of any scan (each against its own component's nominal); with more than one component, also per component.
- **Coverage**: AUT area and % = AxisBuilder's gross scan area (issue #9 decision); MUT % = `mutCoverageArea` (shell
  MUT areas, hatched part); combined = the drawing's coverage figure. Component area = circumference x length.
- **Numbers in words** for the summary ("seventeen (17)"), up to a few thousand.
- Summary findings sentence uses the same ladder band as the worst scan, so the summary and the comments never disagree
  (editable, flagged when edited).

Test fixture: the REF5 job, anonymized (as the golden jobs). Expected: 17 scans, 3,171,045 readings, min 0.716 on scan 16,
2.72% wall loss on 0.736, comment "No significant I.D. wall loss detected." for every scan. Average: the weighted average
of the CSV is 0.7336 -> prints **0.734**; REF5 printed 0.733 (the plain average of the 17 scan averages). Decided: weighted (user, 2026-10-28).

---

## 9. Checks before export (Review step)

Errors (block the PDF):
- A component with no nominal; a manual row with no nominal (heads and nozzles never fall back to the shell nominal).
- A scan or reading with no component (more than one component and none picked).
- A scan in the report with no min T or no readings.
- Required cover fields blank (client, vessel ID, date, at least one examiner).
- A section on with nothing to print (e.g. Photos on, no photos) – or the user turns it off.

Warnings (never block):
- A scan crossing two shell-course / plate bands.
- Scan in the report without a data-page screenshot; screenshot files that match no scan, or two files for one scan.
- Scan numbers in the results that aren't in the drawing, or drawing scans with no results.
- Scan switched off in the drawing but in the report (or the reverse).
- Overlapping scans (readings counted twice in the total).
- CSV Wall Remain % disagrees with the recalculated wall loss.
- Comment, wall loss or summary edited by hand (listed so they get a second look).
- Pipe nominal flagged (reading far over the pick); a reading thicker than nominal by more than 15% on any row.
- Template text left at its default where the template says it should be checked (purpose of the examination).

---

## 10. Build plan (Claude Code phases)

| Phase | What | Done when |
|---|---|---|
| R1 | Format 7 + `report/schema.ts` (incl. components), template types + Generic definition, `report/calc` (ladder, wall loss, totals, temp correction, number words, pipe table + nominal pick), scansheet.csv importer, REF5 fixture (anonymized) | Calc and import tests pass on the REF5 fixture; golden and drawing fingerprints unchanged |
| R2 | Report workspace: Drawing / Report switch, step bar, Setup, Calibration, AUT results (incl. screenshot matching), Manual UT, saved lists | A job's report data can be entered, undone, saved and reopened |
| R3 | Page model, page builders for every Generic section, Pages view, PDF writer (fonts, header / footer, contents, bookmarks, table splitting, images, vector drawings) | The REF5 job prints a full report PDF the user accepts against the style sample |
| R4 | Photos and pages step (custom sheets, uploads), Summary step (scope builder, regenerate), Review checks, Export step | First real job reported from the app by the user |
| later | XTO Horizontal, API 653 Tank templates; Word export; template editor | – |

Same rules as the drawing work: feature branch per phase, tests in CI, nothing from client jobs committed (fixtures
anonymized), drawing outputs (`compat: 'v5.0'`, .lsp / DXF fingerprints) unchanged by report work.

---

## 11. Answers from the user's review (2026-10-28)

1. Field mapping: see 4.1 (to confirm in plain words, below).
2. Scan sheet: drop "File Name" and "Scanner location".
3. Equipment / Guide pictures: from the old workbook for now (6.12).
4. Report file name: `<job name> - <client> - AUT Report.pdf`.
5. Overall wall loss with several components: worst scan, each against its own nominal, plus a line per component.
6. Overall average: weighted by readings.
Improvements: all five approved; Excel paste of a partial scan sheet added (section 5), Top / Bottom added to the
nozzle readings button, every report dropdown can be added to (4.10).

Field mapping (user, 2026-10-29): **Location** = the facility (new field); **Unit** = the section of the facility, if
known; the Project step's "Component" becomes **Equipment ID** (the company's number or nomenclature; the equipment
can be a vessel, tank or anything else, set by Equipment type).
Drawing side (**approved by the user 2026-10-29**; app output only, compat v5.0 unchanged; .lsp / DXF / PDF
fingerprints change only by the title block): rename the label "Component" to
"Equipment ID" (Find a setting keeps finding "Component"); add Location to the Project step; the title block prints
Location and Unit (Unit only when filled). Today the title block's Unit line holds whatever was typed there.
Equipment name (user, 2026-10-29): yes, its own field, because it can differ from the ID ("Inlet Separator" vs
"V-200"). Shared project field so the drawing can use it later; the title block is not changed for it now.

## 12. Suggested improvements (all approved 2026-10-28)

- **One CSV import for both sides** (section 5): the results file also places the scans in the drawing, so the AUT
  scans step's import and the report's import become one.
- **"Add nozzle readings" button** on Manual UT: N / E / S / W / Top / Bottom, any mix, linked to the nozzle (approved).
- **Saved lists export / import** so a tech's lists move to a new laptop.
- **Pages view clicks through to the step** that fills the page, so fixing what you see is one click.
- **No placeholder text ever prints** ("CLICK TO INSERT PHOTO", "0" job number, "X" rows): every empty slot either
  closes up or is a Review item.

## 13. Reports without a drawing (future: piping and similar, user question 2026-10-28)

Piping AUT jobs have no AxisBuilder rollout or overlay: many lines or spools, ISOs and photos instead. Not built now,
but the first build must not block it. Proposed (for review):

- **Report-only job.** A job can have a report and no drawing. Start screen: "New report" next to "New job"; the Drawing
  workspace stays hidden until the user adds a drawing. Nothing in the report requires vessel size, orientation or
  drawn scans; drawing-based checks are skipped when there is no drawing.
- **Components** (4.0, now part of the first build): a piping report has one per line or spool (kind `line`: line
  number, NPS, schedule / nominal from the pipe table in 4.4.1).
- **Scans without positions.** In a report-only job the scan list comes from the CSV alone (positions kept as data,
  not drawn); results, screenshots and C-scan pages work the same.
- **Coverage per template.** A template says where coverage comes from: `drawing` (Generic: AxisBuilder's figure),
  `csv` (gross scan area from the CSV, per component, against a component area the user enters, e.g. pipe length x
  circumference), or `none` (not printed).
- **Header per template.** Already in the template (`headerFields`): a piping template shows line number, size,
  nominal, material instead of circumference and length.
- **Drawings = uploads.** ISOs come in as uploaded pages (images or PDF pages, 4.6), photos as today. Later option:
  mark scan locations on an ISO (a simple drawing-mode tool on an uploaded page) – not planned.
- So a **Piping AUT template** would be: cover, contents, scope & summary, calibration, photos, ISOs (uploaded),
  scan sheet grouped by component, manual readings, C-scan pages, equipment, guide. No new page types needed beyond
  grouping the table by component.

Status: report-only jobs, coverage per template and the Piping template stay future work; components are in the first
build (4.0).

---

## R1 as built (2026-10-29, branch feature/report-r1)

Built: project file format 7 (`report`, shared fields `location` and `equipmentName`), `src/report/schema.ts`,
`report.ts`, `sync.ts`, `templates/` (types, registry, `generic.ts`), `calc/`, `scansheetImport.ts`, `checks.ts`
(see `src/report/README.md`). Golden jobs, compat v5.0 and the .lsp / DXF fingerprints unchanged.

Where the build fills in or differs from the design above:
- **Data details.** Scan results also keep `csvNomT`, `csvWallRemain` and `calculated` (which values were worked out).
  Readings point at their drawing row with `link` (shell / head MUT) or `nozzle` (shell / head nozzle), each list + ID +
  occurrence; a linked row's ID, Min 'T', notes and area are the drawing's. The job's scan increments are
  `calibration.increments`. `options.ladder.cutoffs` is null for the template's own. Summary text blocks can be
  switched on and off like the scope's (`text.summary.blocks`). Optional cover fields are `job.coverExtras`.
- **Linked readings appear automatically**: every shell and head MUT row gets its reading row when the report starts
  and when a MUT row is added; a deleted MUT row takes its reading with it; a deleted nozzle leaves its reading, unlinked.
- **Ladder at the printed value**: wall loss is banded at its two printed decimals, so a printed 5.00% is never Minor.
- **Pitting forms** come after the surface, with a picked cause as well: "Moderate I.D. pitting corrosion detected."
- **Shell nominal from the CSV**: a blank shell nominal is filled from the scansheet when every row gives the same
  Nom. 'T' (listed in the import report).
- **CSV rows with no drawing scan** (matched by scan number) are listed and not imported; the report keeps results only
  for scans the job has.
- **Paste column guess**: by header, else in the CSV's column order (no guess from the values yet).
- **Pipe walls**: B36.10M / B36.19M, NPS 1/2-24, every schedule; checked value by value against Wikipedia "Nominal Pipe
  Size" (which reproduces both standards), with the standard's own inch rounding (0.438, not 0.437). Not yet checked
  against a paper copy of the standards. Sch 120 below NPS 4 and XXS above NPS 12 are not in B36.10M and are left out.
- **Not in R1**: renaming "Component" to "Equipment ID" and printing Location and Unit in the title block (the separate
  drawing-side step in section 11); the summary values for the text blocks (R4).

## R2 as built (2026-10-29, branch feature/report-r2)

Built: the Report workspace (Drawing | Report in the top bar, "Start the AUT report" on the drawing's Export step), its
step bar, banner and Next button, the Setup, Calibration, AUT results and Manual UT steps, a first Review, and saved lists.
All behind `REPORT_ENABLED` (`src/featureFlags.ts`: on in dev, tests and Pages previews, off in the production build of
`main`; `VITE_REPORT` overrides; see `docs/hosting.md` 3a). Code: `src/state/reportSteps.ts`, `src/report/edits.ts`,
`src/report/savedLists.ts`, `src/report/readingPaste.ts`, `src/ui/report/`. Golden jobs, compat v5.0 and the .lsp / DXF
fingerprints unchanged; no project file format change.

Where the build fills in or differs from the design above:
- **No Pages view beside the steps yet** (R3); Photos and pages, Summary and Export show "Coming later". Review lists the
  checks R1 has (components, scans, readings) plus values typed but not stored; the full section 9 list is R4.
- **The start screen's job card** has no "Start a report" button yet (the Export step has it).
- **Workspace and report step** are session state like the drawing step: not saved, not undone. A job opens on the drawing.
  Find a setting and every drawing Go to switch back to the drawing. Undoing "Start the AUT report" shows the drawing.
- **Shared fields** are shown read-only on Setup with "Edit on the Project step" (client, location, Equipment ID, equipment
  name and type, unit, date, procedure, material, circumference, length).
- **Components**: the Y band is one box ("0 to 96"); it shows for shell courses (and any component that has one). Removing a
  component that scans or readings picked asks first; they go back to automatic.
- **Sections**: a renamed title equal to the template's (or blank) goes back to the template's. Sections "on when any exist"
  say so until the user switches them.
- **Optional cover fields**: Unit (from the Project step), Coordinates and Cost center (typed on Setup); the reviewer has its
  own switch.
- **Scansheet import**: the import report is shown on the step (not kept in the session). When positions differ, a table asks
  per scan: keep the drawing's (default) or use the file's; then one undo step. The paste dialog shows the same report and
  how many rows match before "Use these rows".
- **Results table** lists every drawing scan, also those taken out of the report (dimmed, so they can be put back). Readings
  left blank show the worked-out number as a placeholder; increments blank show the job's.
- **Screenshots**: matched with the drawing's `ImageFolderPanel` (now given the scans and a save callback). Choosing the
  data-page naming format in that panel is the "data page vs overlay" choice; telling the Images step which format is the
  overlay was left out (suggested improvement).
- **Manual UT**: a linked row's name, area (when drawn) and Min 'T' are the drawing's; Min 'T' typed here is written to the
  drawing MUT row. Changing a row's nominal mode or pipe size clears a wall chosen by hand. Rows can be moved, report rows
  deleted (a linked row is deleted on Field data).
- **Add nozzle readings**: the pipe size comes from the nozzle's diameter when it is an NPS (4 -> NPS 4) or an NPS outside
  diameter (4.5 -> NPS 4); otherwise the user picks it. Positions remembered in this browser (localStorage).
- **Pasted readings** become report rows; a pasted nominal makes the row custom, else it uses its component's nominal.
- **Saved lists**: string lists are suggestions under the box (HTML datalist); a value is added when the box is left. A few
  built-in values are always offered (the template's examination type, N / E / S / W / Top / Bottom, Longitudinal / Shear, the
  two N/A reasons named in 4.4) but never stored. Record lists: "Pick saved..." and "Save to list" beside each record. The
  dialog edits and deletes values and records, exports `AxisBuilder saved lists.json` and imports one (adds, never deletes).
- **Approved after the click-through (user, 2026-10-29)**: a scan with neither Min 'T' nor readings gets one check, "has no
  results yet" (the two separate checks stay when only one is missing); reading checks name the row with its position
  ("N2 North has no nominal."); the Manual UT table fits a laptop screen: Avg / Max 'T' and area share one "MUT scan" column
  (shown only when a row is a MUT scan) and the N/A reason moved into the row's details.
- **Data pages and overlays in one folder (approved, user 2026-10-29)**: when the drawing's photo folder holds the report's
  data-page screenshot files themselves, Match photos on the Images step starts on the other naming format (the data-page
  one is marked "the report's data-page screenshots"; the tech can still pick any). Kept in separate folders, or named
  alike in different folders, nothing changes: the automatic choice as before (`commonPattern`, `startPattern` in
  `data/imageMatch.ts`; `ImageFolderPanel` `otherFormat`).
- **Review fixes (user notes after the merge, 2026-10-29)**:
  - Setup's "From the job" fields are edited right there (the same boxes as the Project step, Advanced ones included).
  - Boxes with a saved list are dropdowns you can type in (arrow, click in the empty box, or Arrow down shows the whole list).
    Built-in values for now: the generic lists of the old IEPC AUT Report workbook (examination types, acceptance criteria,
    surface conditions, inspection surfaces, techniques, examiner titles, calibration blocks, block materials, reference
    reflectors, AUT system maker / model, transducer makers, wave modes, scanner models); its technician names and procedure
    numbers are not in the app. The user adds to them later, then the defaults are locked.
  - Cover photo and dynamic calibration screenshot: "Choose picture..." picks the file itself; the job keeps its name, this
    browser keeps the file (`state/files.ts`, one "Allow" click after reopening). The report photo folder stays for the
    Photos step (R4).
  - Scansheet import swaps starts larger than stops, as the drawing draws them (report kind 'swapped'); in match mode a
    drawing scan stored reversed counts as the same position and is swapped too.
  - "For every scan and manual reading": one form and cause set on every scan result and reading (AUT results and Manual
    UT), one undo step; each row can still be changed on its own (`setPicksForAll`).
