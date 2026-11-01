# AUT Report Module: Generic AUT design (for review)

Status: **reviewed by the user 2026-10-28 (answers in section 11); design complete. Phase R1 built on feature/report-r1 (2026-10-29, see "R1 as built" at the end); Phase R2 (the workspace screens) on feature/report-r2 ("R2 as built"); Phase R3 (page model, pages, Pages view, report PDF) on feature/report-r3 ("R3 as built"). Phase R4 (Photos and pages, Summary, Review, Export in full) on feature/report-r4 ("R4 as built"). Photos, markup and crop: section 14 (user, 2026-10-30).** This repo copy is the one to update; the original and the files it names (`Style_Sample/`, `References/`, `claude/LWN_Neck_Schedules.csv`, the spec and decisions docs) are in the design folder outside the repo (they hold client material).
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
| R3 | Page model, page builders for every Generic section, Pages view, PDF writer (fonts, header / footer, contents, bookmarks, table splitting, images, vector drawings); the photo basics of section 14: phone (EXIF) orientation, Photos per page, project file format 8 (crop, rotate, adjust, markup on every picture), crop / rotation / vector marks drawn (no redaction); a minimal photo list on Photos and pages and "Make report PDF" on Export | The REF5 job and the V-100 sample print a full report PDF the user accepts against the style sample |
| R4 | Photos and pages step in full (custom sheets, uploads with the PDF page picker), crop tool, Summary step (scope builder, regenerate), Review checks, Export step | First real job reported from the app by the user |
| R5 | Markup editor (section 14): every tool, label and style, redaction (pixels removed), auto brightness / contrast; window first, then in place | The user marks up photos on a real job and picks the editor host |
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

## 14. Photos: markup, crop, labels (design, 2026-10-30)

Agreed with the user 2026-10-30. Adds to sections 4.5, 4.6, 5 (step 5 "Photos and pages"), 6.5 and 10; where they
differ, this section wins. R3 built the parts marked R3 below (see "R3 as built").

### Phasing (updated 2026-10-30 to fit the existing build plan R3 / R4)
- **R3 – Page model, page builders, Pages view, PDF writer** (as the design's build plan) **plus** the photo basics
  this doc adds: phone (EXIF) orientation, "Photos per page", and **project file format 8** holding `crop`, `rotate`,
  `adjust` and `markup` on every image-like item; the page model and PDF draw crop, rotation and vector marks (no
  redaction yet). A minimal photo list on the Photos and pages step so photo pages can be checked.
- **R4 – Photos and pages step in full** (custom sheets, uploads with the PDF page picker), **crop tool**, Summary step,
  Review checks, Export step (as planned).
- **R5 – Markup editor**: every tool, label and style below, redaction, auto brightness / contrast. Window first, then
  in place (see Editor). Priority (user, 2026-10-31): photos and reference drawings (uploaded pages) need markup most,
  so they are built and tested first; data-page screenshots (calling out areas to focus on) next.

### Core rule: non-destructive
- The original file is never changed. Crop, rotation, adjustments and every mark are **data on the item in the .axb**
  (like MUT areas), so everything stays editable and undoable through the normal `edit()` history.
- Positions are stored **relative to the image (0–1)**, so marks stay put when a photo is re-linked or resized.
- Marks are drawn **as vectors** in the page model, so the PDF, the Pages view and later Word all draw the same
  thing crisply. Exception: redaction (below).

### Where markup applies
One editor for every image-like item: report **photos**, the **cover photo**, **data-page (C-scan) screenshots**,
**uploaded images** and **uploaded PDF pages** (marks laid over the embedded page), and custom-sheet images.

### Editor (where it lives: OPEN, user decides by trying it)
- The user can't tell yet whether he prefers a **full-size editor window** or **editing in place on the page in the
  Pages view**; he wants to try both (user, 2026-10-30).
- So the editor is built as **one component that doesn't care where it is shown** (a "host": takes the item, the
  area to draw in and the zoom; all tools, selection and undo inside). Two hosts:
  - **Full-size window** opened from the item (photo row, screenshot, uploaded page, Pages view). Built first in R5.
  - **In place in the Pages view**: double-click an image on a page to edit it there, the rest of the page dimmed.
    Added once the window works (small extra once the component exists).
- The user tries both on a real job and picks; the other one may stay as an option or be removed. Optional: a quick
  clickable mock-up of both before R5, to decide earlier.
- Reuses the drawing-mode tool interface (`ui/preview/drawingTool.ts`) and snap engine (`engine/snap.ts`): Shift =
  free / angle lock, arrows nudge, Esc cancels, right-click menu, one undo step per change, `ColorPicker`.
- Select, move, resize, rotate, delete, duplicate, bring forward / send back, lock.

### Tools
- **Rectangle and ellipse**: outline, filled, or **highlighted** (see-through fill + solid edge = "highlighted square").
- **Highlighter**, two modes:
  - Freehand (follows the pointer).
  - **Straight**: click-drag a straight stroke **in any direction**; Shift locks to 0 / 45 / 90°.
  - Widths: presets Fine / Medium / Wide / Extra wide plus a slider; last width remembered; flat (marker) or round ends.
- **Pen** (freehand), **line**, **arrow**.
- **Colors**: short preset palette + custom color. Default meanings: **red = finding, yellow = highlight, green =
  acceptable, blue = note.** Line width presets. Last color / width remembered.
- **Crop** (R4): handles, keeps the photo's shape unless freed, plus **90° rotate** (rotate already in R3); crop only
  changes what prints, always reversible.
- **Redaction**: black or blurred box over nameplates, serial numbers, faces. Unlike every other mark, the exported
  PDF must **remove the pixels** (re-encode that image with the area blanked), not lay a box on top that Acrobat
  could lift off. Must be tested.
- **Auto brightness / contrast**: one click for dim field photos, stored as a setting on the item.
- **Copy markup to other photos** (repeated callouts).

### Labels (make them look professional)
1. **Callout styles**: rounded box, square box, pill, or plain text with a halo; optional leader with arrow / dot / no
   end; the leader re-attaches to the nearest edge when the label moves.
2. **Readable on any photo**: thin contrasting outline / halo and a slightly see-through box background.
3. **Numbered badges**: circles 1, 2, 3 on the photo with a matching key printed under it ("1 – Pitting at 6 o'clock").
4. **Live data labels**: linked to a scan or MUT row, filled in automatically (e.g. "S12 · Min 0.312 in · 18% WL");
   follow renames and result changes (same follow-the-row mechanism as moved labels / `syncReport`).
5. **Print-true sizing**: text size in points at print size, not pixels, so labels match across photos whatever their
   resolution or crop.
6. **Saved label styles**, kept per computer like saved lists, e.g. "Finding" (red box, white bold, arrow), "Note"
   (blue), "Reading" (yellow badge); one click to apply.
7. **Consistent type**: the report's bundled fonts, bold for headings, regular for the rest; optional subtle underline
   and drop shadow.
8. **Tidy placement**: labels snap to each other's edges and line up; nudge with arrow keys.

### Portrait and landscape photos
- Every photo keeps its own shape (already in the design); portrait prints tall, landscape wide.
- **Phone orientation (EXIF)**: phones often save a portrait photo as a sideways image plus a "rotate" tag. Browsers
  follow the tag; pdf-lib does not. R3 must apply the EXIF orientation in the PDF, the Pages view and thumbnails, so
  a photo never prints sideways. The 90° rotate is the manual override on top.
- **Photos per page** (per photo section): **Automatic** (default), 1, 2 or 4 (2 x 2 grid). Automatic: two portraits
  side by side; a lone photo of either shape fills the page; mixed shapes laid out so nothing is squashed. "Own page"
  per photo stays.

### Data (format 8, R3; Claude Code to finalize)
On each image-like item: `crop` (box in 0–1, null = whole image), `rotate` (0/90/180/270, on top of EXIF), `adjust`
(auto levels on/off, later more), `markup` (list of marks: kind, geometry in 0–1, style {stroke, fill, opacity, width,
ends}, text, link to scan / MUT row by list + ID + occurrence, z-order, locked). Label styles and the last-used tool
settings live in this browser's storage, not the .axb. The data doesn't depend on where the editor is shown.

### Checks (Review)
- Redaction present → reminder that the PDF blanks those pixels.
- Live data label whose row was deleted → warning with "Go to".
- Markup outside the crop → note (it is hidden, not deleted).

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
  - Saved lists (user, 2026-10-30): nothing joins a list silently any more; a typed value not in the list gets a "+ Save ... to
    the list" line in the dropdown, and values saved on this computer have a × to take them off (built-in ones don't). The
    Setup procedure (the project field) is a saved-list dropdown too.

## R3 as built (2026-10-31, branch feature/report-r3)

Built: the page model (`src/report/pageModel.ts`), one page builder per page type (`src/report/pages/`), the report PDF
writer (`src/report/pdf/writeReportPdf.ts`), the Pages view and the pages panel beside each report step
(`src/ui/report/PagesView.tsx`, `PageSvg.tsx`), the photo list on Photos and pages (`PhotosStep.tsx`) and "Make report PDF"
on Export (`ExportStep.tsx`); project file format 8; the brand fonts and logo. All behind `REPORT_ENABLED`. Golden jobs,
compat v5.0 and the .lsp / DXF fingerprints unchanged.

- **Fonts and logo.** Montserrat 600 / 700 and Roboto 400 / 500 / 700, static TrueType files from the Google Fonts CSS API
  (fonts.gstatic.com), OFL texts beside them (`src/assets/fonts/README.md`); measured from `src/report/fontMetrics.generated.ts`
  (`npm run gen:font-metrics` writes both metric files); embedded whole, ligatures off (each letter its own glyph, so the text is
  exactly as measured and copies cleanly). The brand logo (`src/assets/brand/integrity-epc-logo.png`, 900 x 243 px) prints at
  1.5 in in the header (600 dpi) and 2.2 in on the cover (409 dpi): not soft. All precached for offline use.
- **Format 8.** `crop`, `rotate`, `adjust` and `markup` on every picture: directly on photos, custom-sheet pictures and uploads
  (an upload's existing `rotate` keeps its meaning); beside the file name for the cover photo (`coverPhotoEdits`), data-page
  screenshots (`dataImageEdits`) and the calibration screenshot (`dynamicImageEdits`). Crop and mark positions are fractions of
  the picture after its EXIF orientation and before `rotate`, so a quarter turn turns them with the picture (what prints is the
  design's "EXIF, then rotate, then crop"). Marks: rect, ellipse, highlight (freehand or straight), pen, line, arrow, label
  (rounded / square / pill / plain, optional leader with arrow / dot / none), badge (number + key text), redaction; style in
  points at print size. Mark links (scans, shell / head MUT rows) follow renames in `syncReport`; a deleted row leaves the link
  as it was (Review in R4 / R5). Photos per page: `options.photosPerPage[sectionId]` ('auto' | 1 | 2 | 4), else the template's
  option. `report/imageItems.ts` lists every picture with its edits.
- **Page model.** Inches, y down: text runs, lines, boxes (rounded), vector paths, pictures (file reference, box, upright size,
  EXIF orientation, turn, crop, marks), drawing sheets (a `SheetModel`, the region of it and the box it fills), uploaded PDF
  pages, links; the document has bookmarks and contents entries. Marks become vector items in `report/marks.ts`, drawn by both
  writers over the picture and clipped to it.
- **Standard frame (6.0), measured.** Header band down to the blue rule at 1.32 in, section title at 1.66 in, footer rule at
  8.06 in; **content area 10.0 x 6.08 in** (x 0.5 to 10.5, y 1.86 to 7.94). The header splits the template's header fields:
  before the axis texts = the field list, the axis texts = "0" Reference", after them = the Nominal / Material / Circumference /
  Length pairs. Footer fields got `place` ('lead' / 'centre') and `prefix` ("Job ", "Rev ", "AUT ") in the template; blank ones
  are left out.
- **Builders.** Cover, contents (two passes: counted, then numbered; each line a link), scope & summary (two boxes; tiles and
  coloured figures; a sentence missing a value is left out and listed; long text flows on), calibration (boxes in two columns,
  blank rows left out, transducers one row per filled channel; screenshot and the template's notes on the right), photos,
  drawings, tables, C-scans, custom sheets (all four layouts, every block kind; head views print "View not available" for now, a
  crop box is a part of the main sheet), uploads (pictures and PDF pages, standard or full frame), fixed text. Custom sheets and
  uploads print in their own section unless `after` names another section that is on.
- **Photos.** Automatic: two photos share a page side by side at equal heights (mixed shapes never squashed) when each keeps at
  least 35% of the area it would have alone (two portraits always do; two very wide photos don't); a lone photo fills the page;
  "own page" always alone. 1 / 2 / 4 per page as chosen (4 = 2 x 2 cells).
- **Tables.** Columns from the template with `group` (two-row header: Circumferential (X) / Axial (Y)), `unit` and `trim`;
  widths from the content, the comment column takes the rest and wraps; header repeated, rows never split, the totals row keeps a
  data row. Several components: subtotals per component. X start / stop as scanned for a scan across the seam, else the smaller
  first.
- **PDF.** pdf-lib + fontkit, lazy-loaded; each picture embedded once (by file + crop) at up to 300 dpi of its largest printed
  size (browser: turned upright and cut on a canvas; the logo always as it is); EXIF, turn and crop by the placement matrix and a
  clip in the content stream (never left to the viewer); drawing sheets through the drawing PDF's own `drawSheetModel`
  (extracted from `export/pdf/writePdf.ts`; the drawing PDF is unchanged); uploads by `embedPdf`; contents links; bookmarks for
  every section with every scan under C-Scan Data (closed); title, author (the examiners), subject. `npm run report:pdf -- --out
  "<folder>"` writes the sample's report (or a saved job's with `--job`), outside the repo.
- **Pages view.** SVG from the same model: brand fonts by @font-face, pictures as upright thumbnails, drawing sheets through the
  Sheets view's own `Step`. Pages panel beside every report step (the pages that step fills; all of them on Review and Export),
  with the divider; "All pages" opens the full view (zoom, pan, previous / next, PageUp / PageDown, Fit, Escape); a click on a
  page (or "Go to ...") goes to the step that fills it. Uploaded PDF pages show a box in the Pages view (pdf.js comes with the
  uploads screen).
- **Photos and pages step (R3 minimum).** Report photo folder ("Add photos from the folder": tick some or add all) or "Choose
  photo files..." (Edge / Chrome; each file remembered per job like the cover photo, slot `photo:<name>`); thumbnail with EXIF
  applied, caption, own page, turn left / right, arrows and drag handle (one undo step), remove; Photos per page. Crop, markup,
  custom sheets, uploads and the drawings choice say "Coming later".
- **Export step (R3 minimum).** "Make report PDF" writes `<job> - AUT Report.pdf` (the R3 brief's name; section 11's
  `<job> - <client> - AUT Report.pdf` was not used), asking before replacing, then "Open the PDF"; blocked while Review has
  errors. Remembered files that need an "Allow" click are asked for first.
- **Where it differs from the design.**
  - Rollout drawing = the "Scans" set (hatch, no photos), not "As the preview": with the preview's photos on, the rollout and the
    overlay pages came out the same. The other layer groups still follow the preview.
  - Summary tiles: minimum and wall loss in their ladder colour (section 8: amber / red, deep blue for the normal bands), not
    always red as in the style sample (the sample is older than the band decision).
  - Template column headers reworded to the style sample ("UT readings", "Area (sq in)", "Min. 'T'", "Wall loss", "Comments /
    Analysis"); template version not raised (no job has printed with version 1 yet).
  - A blank equipment type reads "equipment" in the scope and summary sentences.
  - Fixed pages: the old workbook's pictures are not in the repo; each prints a marked placeholder box ("Picture to come: ...").
    The template names equipment-scanner, equipment-unit, equipment-cscan, equipment-bscan (AUT Equipment) and
    guide-cscan-example, guide-rollout-vertical, guide-rollout-horizontal (Guide to Interpretation).
  - Redaction marks are not drawn; Review lists each picture that has one ("redaction comes in a later version").

## R4 as built (2026-10-31, branch feature/report-r4)

Built: the Summary step, the Review checks of section 9 and 14 in full, the Photos and pages step in full (crop tool, custom sheets,
uploaded pages with the PDF page picker, drawings to include) and the Export step. Code: `src/report/summary.ts`, `checks.ts`,
`crop.ts`, `pagesEdits.ts`, `pdfInfo.ts`; `src/ui/report/SummaryStep.tsx`, `PictureWindow.tsx`, `CustomSheets.tsx`, `Uploads.tsx`,
`pdfPages.ts`, `placeOptions.ts`. New dependency pdfjs-dist (thumbnails and the Pages view only; lazy-loaded, worker precached). No
project file format change; golden jobs, compat v5.0 and the .lsp / DXF fingerprints unchanged; the drawing engine is untouched.

Where the build fills in or differs from the design above:
- **Checks.** Severities error / warning / **note** (a redaction waiting for R5, marks outside the crop): notes are listed on Review and
  the step's list but don't make a step need attention. A section that is on with nothing to print: Photos, Custom Sheets, Reference
  Pages, Manual UT, C-Scan Data, Scan Sheet (no scans; not optional, so only Go to) and Drawings (none chosen or none drawable); the
  optional ones get "Turn the section off". Also checked (beyond section 9): temperature correction on without a temperature (error),
  ladder bands changed for the job, a custom sheet with nothing on it, a custom sheet view the drawing doesn't have (section sheet n,
  a head not drawn), a C-scan box on a scan no longer drawn, a pipe wall chosen by hand, severity / comment set by hand on readings too.
  "A reading thicker than nominal by more than 15%": scans by Min 'T', readings by their thickest value (not repeated when the pipe
  pick is already flagged).
- **Not checks** (and why): screenshot files that match no scan or two files for one scan are shown by the screenshot matching panel
  (the folder's contents are not in the job, so Review can't list them); scan numbers in the results that aren't in the drawing can't
  happen (results follow the drawing's scans, R1). "Template text left at its default": the purpose has no default text, so its
  sentence is left out and listed, with "the template asks for it" in the fix.
- **Summary.** A sentence missing a value is a warning listed on the Summary step whatever step holds the value (`listOn`); Go to
  goes to the value (Calibration for the transducer). Text typed equal to the generated text (or blank) is not an edit. Editing the
  scope or summary turns off nothing: the sentence switches keep changing the generated text, which Regenerate then shows beside the
  edited one (Keep mine / Use new). The step counts as started once there are scan results or edited text. Numbers in words is a
  switch on the step (design 4.9).
- **Crop tool.** In the full-size picture window (`PictureWindow`, built for R5's markup editor to reuse). The box is drawn on the
  picture as it prints (upright, turned); 4:3 and 3:2 lie the way the picture lies (3:4 on a portrait). Reset = whole picture, not
  turned. Arrow keys nudge the box (Shift: more). Offered on photos, the cover photo, the calibration and data-page screenshots, custom
  sheet pictures and uploaded pictures; **not on uploaded PDF pages** (the page model can't cut an embedded page; their turn and frame
  are there, marks come with R5).
- **Custom sheets.** "Prints": in its own section (Custom Sheets) or after any other section that is on. A picture block's file comes
  from the report photo folder or is picked as a file (remembered like photos). A **head view** is that head alone (its outline, title,
  nozzles and MUT readings) as a sheet model of its own, fitted to its slot, so nothing next to it on the main sheet shows. "A part of
  the main drawing" is a box dragged on the main sheet as it prints (paper inches; at least 0.2 in each way). C-scan box statistics and
  small tables are typed one row per line, cells split by | (or tabs pasted from Excel).
- **Uploaded pages.** Pictures and PDFs, dropped or picked (Edge / Chrome: the file is remembered per job, slot `upload:<name>`, and
  read again at export; also found in the report photo folder). A one-page PDF is added straight away; a longer one opens the page
  picker. Page sizes come from pdf-lib, the thumbnails and the Pages view from pdf.js, both **without the page's own /Rotate** (pdf-lib
  copies pages unturned), so the screen matches the PDF; the upload's turn fixes a sideways page. "Full" frame is offered for PDF pages
  only. Locked PDFs are told apart by pdf-lib's error message (its error class doesn't survive `instanceof`).
- **Drawings to include.** Rollout, scan overlay (off and greyed when the drawing uses no photos) and section sheets "As the drawing" /
  Off, as 4.9. Each part of the step has its section's "in the report" switch.
- **Export.** `<job> - <client> - AUT Report.pdf` (`export/files.ts reportPdfName`; no client: `<job> - AUT Report.pdf`). The summary
  lists pages, size, pictures that could not be read, uploaded PDFs that could not be used and the document's notes, or "Nothing was
  left out". Word export still later.

## R5 as built (2026-10-31, branch feature/report-r5)

Built: the markup editor of section 14 for every report picture (photos, the cover photo, the calibration and data-page screenshots,
custom-sheet pictures, uploaded pictures and uploaded PDF pages), with both hosts, every tool and label, redaction that removes the pixels,
auto brightness / contrast and copy markup. Behind `MARKUP_ENABLED` (same rule as `REPORT_ENABLED`, `VITE_MARKUP` overrides; marks already in
a file print either way). Project file format 10. Golden jobs, compat v5.0 and the .lsp / DXF fingerprints unchanged; the drawing engine is
untouched.

- **One editor, two hosts.** `useMarkupEditor` holds the tool, selection, drags and keys and knows nothing about where it is shown; it takes
  the picture's place, the frame its marks are drawn in and the zoom. Host A is the full-size picture window ("Mark up…" next to every Crop
  button, on PDF pages, and from the Pages view's bar); crop is a mode of the same window. Host B: double-click a picture in the Pages view;
  the page is dimmed, the toolbar floats at the top and the selection / picture settings at the bottom; Esc, a click on the dimmed page or
  Done leaves. A single click on a picture in the Pages view no longer jumps to its step (so the double-click can land); elsewhere it does.
- **Full screen (user, 2026-11-01).** The markup window fills the screen. Zoom: Fit (the whole picture as large as the screen allows,
  the percentage of print size shown), Actual size (1 in on paper = 96 CSS pixels, i.e. true size when the screen's scaling is at its
  recommended setting; scroll to move around) or 200%; the choice is kept per browser (`axisbuilder:markupZoom`).
- **Drawing sheets (user, 2026-11-01).** The drawings the report prints (rollout, scan overlay, overview and section sheets, and drawing
  views on custom sheets) take marks too: double-click one in the Pages view, or "Mark up the … drawing" in its bar. Stored per sheet in
  `report.drawingMarkup` (keys 'rollout', 'overlay', '<scans|overlays>:overview' / ':<n>', 'sheet:<id>:<block>'; part of format 10, not yet
  released), in fractions of the printed sheet region, drawn by the same mark code over the sheet in the Pages view and the PDF. No
  redaction, crop or auto levels on a drawing (vectors); a redaction there is left out and Review warns. A sheet's marks stay with its key,
  so if a section plan changes, section n's marks stay on section n.
- **One host (user, 2026-11-01).** The small in-place editor (host B) is gone: a double-click on a picture or drawing in the Pages view opens
  the full-screen window. Its top line holds only the tool's settings (undo / redo and Done at the right), so the colours always start in the
  same place; the picture's name sits in the bottom line with its print size ("The rollout drawing · prints 8.54 in wide on p. 5", cut short
  with its full text on hover); the tools rail has two columns (no scrolling); both lines have a fixed height. A new mark stays selected (to
  adjust, restyle or type) until Enter, Esc or a click elsewhere; while it is selected, a drawing tool moves / resizes it instead of starting
  another, and a click off it only lets go. Enter in a label's text box finishes the text and lets go (Shift+Enter: a new line). Box style
  "Highlighted, no outline" (see-through fill, no edge); new labels are rounded with no outline (the outline setting's default is off; an
  outline kept in the browser before this is dropped once, `axisbuilder:markup` version 2).
- **Side panel (user, 2026-11-01; undone the same day, see the next bullet).** The settings left the top line for a side panel on the left that scrolls up and down only: Done and
  undo / redo, the tools (three columns, Crop and Redact last), the selected mark (what it is, duplicate / forward / back / lock / delete as
  icons, its text box or live data link, "Enter or a click elsewhere when you are done"), then the settings, each with a caption (Colour,
  Line width or Leader and edge width, Box style, Highlighter width, Arrow head, Text with size / bold / font / text colour, Box with shape /
  Filled or Clear, outline only / see-through / leader end, Contrast outline, Redaction, Saved styles). With one mark selected they show
  its own look. "Copy markup to…" is now "Copy these marks to other pictures…" with a tooltip saying what it does. Labels gained a leader
  and edge width, a text colour (Auto or any) and the clear box; the contrast outline goes round the leader's arrowhead too.
- **Back to the top line (user, 2026-11-01).** The side panel was not wanted: the tools are a one-column rail on the left again (Redact
  last), the colour palette and the settings sit in the top line (compact: widths and the label box as dropdowns, "Filled / Filled,
  see-through / Clear, outline only" in place of the opacity slider, "Auto text" plus a text colour picker, Styles… and a save icon), and
  the selection with its text box in the bottom line. The label options above stay.
- **Portrait frame header (user, 2026-11-01).** An upright reference page's header is as short as the landscape one (the chips in two
  narrow columns beside the field list), so the sheet starts at 1.86 in and gets about 8.6 in of height.
- **Print-true.** The editor draws in page inches of the picture as it prints (its slot: `findPrinted`; a picture that doesn't print yet is
  shown 6.5 in wide), so text in points looks as big as it will on paper. The marks are drawn by the page's own code (`report/marks.ts`), so the
  editor, the Pages view and the PDF are the same drawing. The editor shows the picture turned and cropped as it prints; marks outside the
  crop are hidden (Review notes them).
- **Undo.** Every finished change is one undo step (a drag is stored when the pointer goes up; a run of arrow-key nudges on the same marks is
  one step until the selection changes). Changes are stored at once: the window has Done, no Cancel.
- **Keys.** Tool letters (V select, R box, E ellipse, H highlighter, G straight highlight, P pen, L line, A arrow, T label, B badge, X redact,
  C crop in the window), Del, Ctrl+D, Ctrl+A, ] / [ (Shift: front / back), Ctrl+L, arrows (Shift: 0.2 in), Esc (cancels the drag, closes the
  menu, clears the selection, then the tool, then leaves). **Shift** squares boxes, holds lines and the straight highlighter to 0 / 45 / 90
  degrees, keeps a box's shape while resizing, turns in 15 degree steps, and frees a move from snapping; **Alt** frees a drawn point from
  snapping (Shift was already taken while drawing).
- **Snapping.** Moved marks line up with the picture's edges and centre and with every other mark's edges and centre (each axis on its own,
  pink guides); new points snap to the picture's corners, edge middles and centre and to other marks' corners and centres, else line up with
  them. The editor has its own snapping in view inches (`snapMove`, `snapPoint`) rather than `engine/snap.ts`, whose lines-and-circles model
  fits the drawing, not boxes moving as a whole.
- **Turn.** Boxes and ellipses turn (handle above the box); lines, arrows and strokes turn by their ends; labels, badges and redactions don't.
  The angle is in the picture's own pixels, so it turns with a quarter turn of the picture.
- **Colours.** Presets red (finding), yellow (highlight), green (acceptable), blue (note), black, white, plus the browser's colour picker
  (the app's `ColorPicker` is for CAD colour numbers). One last colour for every tool (kept per browser), so the highlighter takes the colour
  you last used; pick yellow for a classic highlight.
- **Labels.** Text in Roboto 500 (700 bold) or Montserrat 600 / 700, multi-line (Ctrl+Enter finishes typing); padding and corner radius from
  the text size; the box is see-through by the "Box" slider (default 90%); "Outline" = a thin near-black or white edge (whichever contrasts
  with the box) and a halo round plain text and under leaders. The leader leaves the box at the point on its outline nearest the leader's end,
  so it re-attaches when the label moves. A label drag places it with a leader (the drag starts at what it points at).
- **Badges.** Numbered in placing order, renumbered after a delete; the key prints under the picture (a small badge in the badge's colour,
  then its text; two columns once it is 4.5 in wide with 4 or more lines); only badges with key text are in the key. Page builders fit the
  picture into what is left of its slot (`fitWithKey`), so it shrinks, never squashes. An uploaded PDF page at full size gets no key.
- **Live data labels.** Linked to a scan or a shell / head MUT row; template fields {scan} / {id}, {minT}, {avgT}, {maxT}, {wallLoss},
  {nominal}, {component}, {readings}; a missing value prints "–", an unknown field stays as typed. The filled text is stored on the mark
  after every edit (`refreshLiveLabels` in `syncReport`) and filled again when the pages are built, so a deleted row prints the last text and
  Review warns (Go to opens the editor on that picture).
- **Redaction.** Black boxes set the pixels to black; blurred boxes become a coarse mosaic (at least 4 blocks across the short side, at most
  24 along the long one, so it looks the same at any resolution) smoothed into a blur. The PDF embeds the changed pixels only (browser canvas;
  the Node path decodes, turns, crops, changes and encodes with jpeg-js), so the original area is not in the file; tested by decoding the
  embedded image and searching the PDF for the original's bytes. The Pages view shows a processed thumbnail made with the same code (solid
  stand-ins until it is ready); the editor shows black boxes as they are and blurred ones as a live blur of the picture. Not offered on PDF
  pages (the page is copied as it is; the editor says so); one already there is left out and Review warns. A picture used in two places is
  redacted only where it carries the box.
- **Auto brightness / contrast.** `adjust.autoLevels`: each channel stretched from its 0.5th to 99.5th percentile, measured on the printed
  part (the crop), on screen and in the PDF; "Hold: before" shows the picture without it. Not offered for PDF pages.
- **Saved label styles.** A record list `labelStyles` in the saved lists (in the saved-lists file); built-in Finding (red box, white bold,
  arrow), Note (blue) and Reading (yellow badge) are offered first and never stored. "Apply a style…" restyles the selected labels / badges, or
  sets the look of the next one placed; "Save style…" names the selected one's look. In the Saved lists dialog a style can be renamed or
  deleted (its look is changed by saving it again).
- **Review.** The R4 note "redaction comes in a later version" is gone; a redacted picture gets a note that the PDF removes those pixels.
- **Not built / left for later.** Drop shadow and underline on labels (section 14 "optional"); turning labels and redactions; marks drawn
  on a cropped-away part (the editor shows only what prints); per-tool colours.
