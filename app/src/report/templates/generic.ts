// Generic AUT: the first report template (report design section 3), laid out like the reference report REF5 in the
// approved IEPC style. Everything here is data; no code checks for this template's id.
//
// Text block placeholders ({equipment}, {scanCount}, ...) are listed in calc/textFill.ts TEXT_FIELDS.

import type { ReportTemplate } from './types.ts'

export const GENERIC_AUT: ReportTemplate = {
  id: 'generic-aut',
  version: 1,
  name: 'Generic AUT',
  title: ['AUTOMATED ULTRASONIC', 'Corrosion Mapping Examination'],
  coverage: 'drawing',
  jobDefaults: { examinationType: 'Corrosion Mapping Examination' },

  // Report order (design 3, table "Generic AUT sections").
  sections: [
    { id: 'cover', title: 'Cover', pageType: 'cover', optional: false, defaultOn: true, options: { orientation: 'portrait' } },
    { id: 'contents', title: 'Table of Contents', pageType: 'contents', optional: true, defaultOn: true },
    { id: 'scope-summary', title: 'Scope & Summary', pageType: 'scopeSummary', optional: false, defaultOn: true },
    { id: 'calibration', title: 'Calibration', pageType: 'calibration', optional: true, defaultOn: true },
    { id: 'photos', title: 'Photos', pageType: 'photos', optional: true, defaultOn: true, options: { perPage: 'auto' } },
    { id: 'drawings', title: 'Drawings', pageType: 'drawing', optional: true, defaultOn: true },
    { id: 'scan-sheet', title: 'Scan Sheet', pageType: 'table', optional: false, defaultOn: true, options: { table: 'scans' } },
    { id: 'manual-ut', title: 'Manual UT', pageType: 'table', optional: true, defaultOn: 'whenAny', options: { table: 'readings' } },
    { id: 'cscan', title: 'C-Scan Data', pageType: 'cscan', optional: true, defaultOn: true },
    { id: 'custom', title: 'Custom Sheets', pageType: 'custom', optional: true, defaultOn: 'whenAny' },
    { id: 'reference', title: 'Reference Pages', pageType: 'uploaded', optional: true, defaultOn: 'whenAny' },
    { id: 'equipment', title: 'AUT Equipment', pageType: 'fixedText', optional: true, defaultOn: true },
    { id: 'guide', title: 'Guide to Interpretation', pageType: 'fixedText', optional: true, defaultOn: true },
  ],

  coverFields: [
    { source: 'project.client', label: 'Client' },
    { source: 'project.location', label: 'Location' },
    { source: 'project.component', label: 'Equipment ID' },
    { source: 'project.equipmentName', label: 'Equipment' },
    { source: 'report.job.techs', label: 'Examination & Report By' },
    { source: 'project.date', label: 'Date' },
    { source: 'report.job.reviewer', label: 'Report Reviewed By', optional: true },
    { source: 'project.unit', label: 'Unit', optional: true },
    { source: 'report.job.coordinates', label: 'Coordinates', optional: true },
    { source: 'report.job.costCenter', label: 'Cost Center', optional: true },
  ],
  headerFields: [
    { source: 'project.client', label: 'Client' },
    { source: 'project.location', label: 'Location' },
    { source: 'project.component', label: 'Equipment ID' },
    { source: 'project.equipmentName', label: 'Equipment' },
    { source: 'report.job.examinationType', label: 'Examination type' },
    { source: 'vessel.xAxisDirectionText', label: 'X-axis' },
    { source: 'vessel.yAxisDirectionText', label: 'Y-axis' },
    { source: 'calc.nominal', label: "Nominal 'T'" },
    { source: 'project.material', label: 'Material' },
    { source: 'vessel.height', label: 'Circumference' },
    { source: 'vessel.length', label: 'Length' },
  ],
  footerFields: [
    { source: 'project.component', label: 'Equipment ID', place: 'lead' },
    { source: 'project.client', label: 'Client' },
    { source: 'project.location', label: 'Location' },
    { source: 'report.job.jobNumber', label: 'Job', prefix: 'Job ' },
    { source: 'report.job.reportRevision', label: 'Rev', prefix: 'Rev ' },
    { source: 'report.job.examinationType', label: 'Examination', prefix: 'AUT ', place: 'centre' },
  ],

  // Scan sheet (design 6.7): "File Name" and "Scanner location" dropped (user, 2026-10-28).
  scanColumns: [
    { key: 'location', header: 'Location' },
    { key: 'scan', header: 'Scan' },
    { key: 'xStart', header: 'Start', group: 'Circumferential (X)', decimals: 3, unit: 'in', trim: true },
    { key: 'xStop', header: 'Stop', group: 'Circumferential (X)', decimals: 3, unit: 'in', trim: true },
    { key: 'incrX', header: 'Interval', group: 'Circumferential (X)', decimals: 3, unit: 'in' },
    { key: 'yStart', header: 'Start', group: 'Axial (Y)', decimals: 3, unit: 'in', trim: true },
    { key: 'yStop', header: 'Stop', group: 'Axial (Y)', decimals: 3, unit: 'in', trim: true },
    { key: 'incrY', header: 'Interval', group: 'Axial (Y)', decimals: 3, unit: 'in' },
    { key: 'readings', header: 'UT readings', decimals: 0 },
    { key: 'area', header: 'Area (sq in)', decimals: 0 },
    { key: 'minT', header: "Min. 'T'", decimals: 3, unit: 'in' },
    { key: 'avgT', header: "Avg. 'T'", decimals: 3, unit: 'in' },
    { key: 'wallLoss', header: 'Wall loss', decimals: 2, unit: '%' },
    { key: 'nominal', header: "Nom. 'T'", decimals: 3, unit: 'in' },
    { key: 'comment', header: 'Comments / Analysis' },
  ],
  // Manual UT (design 6.8).
  readingColumns: [
    { key: 'name', header: 'Name' },
    { key: 'location', header: 'Location' },
    { key: 'type', header: 'Type' },
    { key: 'minT', header: "Min. 'T'", decimals: 3, unit: 'in' },
    { key: 'avgT', header: "Avg. 'T'", decimals: 3, unit: 'in', optional: true },
    { key: 'maxT', header: "Max. 'T'", decimals: 3, unit: 'in', optional: true },
    { key: 'area', header: 'Area (sq in)', decimals: 1, optional: true },
    { key: 'nominal', header: 'Nominal', decimals: 3, unit: 'in' },
    { key: 'wallLoss', header: 'Wall loss', decimals: 2, unit: '%' },
    { key: 'comment', header: 'Comments / Analysis' },
  ],

  // Comment builder (design 4.3.1) and ladder (design 8).
  ladder: {
    cutoffs: [5, 16, 30],
    severity: [
      { id: 'none', label: 'No significant', words: 'No significant' },
      { id: 'minor', label: 'Minor', words: 'Minor' },
      { id: 'moderate', label: 'Moderate', words: 'Moderate' },
      { id: 'significant', label: 'Significant', words: 'Significant' },
    ],
    colors: ['normal', 'normal', 'amber', 'red'],
    forms: [
      { id: '', label: '(blank)', words: '' },
      { id: 'general', label: 'General', words: 'general' },
      { id: 'localized', label: 'Localized', words: 'localized' },
      { id: 'pitting', label: 'Pitting', words: 'pitting' },
      { id: 'localizedPitting', label: 'Localized with pitting', words: 'localized pitting' },
    ],
    formIsNoun: ['pitting', 'localizedPitting'],
    causes: [
      { id: '', label: '(blank) = wall loss', words: 'wall loss' },
      { id: 'corrosion', label: 'Corrosion', words: 'corrosion' },
      { id: 'erosion', label: 'Erosion', words: 'erosion' },
      { id: 'corrosionErosion', label: 'Corrosion-erosion', words: 'corrosion-erosion' },
    ],
    surfaces: [
      { id: 'ID', label: 'I.D.', words: 'I.D.' },
      { id: 'OD', label: 'O.D.', words: 'O.D.' },
    ],
    midWall: [
      { id: 'none', label: 'None', words: '' },
      { id: 'lamination', label: 'Lamination', words: 'lamination' },
      { id: 'inclusion', label: 'Inclusion', words: 'inclusion' },
      { id: 'hydrogenBlistering', label: 'Hydrogen blistering', words: 'hydrogen blistering' },
      { id: 'midWall', label: 'Mid-wall indication', words: 'indication' },
    ],
  },

  // Scope and summary wording from the reference report (REF5), as on/off blocks.
  textBlocks: [
    { id: 'scope-opening', part: 'scope', label: 'Opening', defaultOn: true,
      text: 'Integrity EPC was asked to perform an Automated Ultrasonic Testing (AUT) {examinationType} on {equipment}.' },
    { id: 'scope-purpose', part: 'scope', label: 'Purpose and area', defaultOn: true, checkDefault: true,
      text: 'The purpose of this examination was to {purpose} in {areaCovered}.' },
    { id: 'scope-equipment', part: 'scope', label: 'Equipment and indexing', defaultOn: true,
      text: 'Integrity EPC utilized a state-of-the-art AUT system interfaced to a 2-Axis scanner and a transducer specifically designed for corrosion mapping. The {transducerMaker} transducer used in this examination was a {transducerSize} diameter, {transducerFrequency} {transducerAngle} {transducerMode} wave. Scanner indexing for the {equipmentKind} was performed at (X) {incrX} x (Y) {incrY} increments.' },
    { id: 'scope-limitations', part: 'scope', label: 'Limitations', defaultOn: false,
      text: '{limitations}' },

    { id: 'summary-counts', part: 'summary', label: 'Scans and coverage', defaultOn: true,
      text: 'A total of {scanCount} AUT scans were performed on {equipment}, consisting of {readings} UT readings on approximately {coveragePercent} ({coverageArea} Sq. In.) of the {equipmentKind} shell.' },
    { id: 'summary-mut', part: 'summary', label: 'MUT areas coverage', defaultOn: true, when: 'mutArea>0',
      text: 'Manual UT areas covered a further {mutCoveragePercent} ({mutCoverageArea} Sq. In.) of the {equipmentKind} shell, for a total of {totalCoveragePercent}.' },
    { id: 'summary-findings-0', part: 'summary', label: 'Findings', defaultOn: true, group: 'findings', when: 'band=0',
      text: 'The AUT examination revealed no significant internal wall loss or damage.' },
    { id: 'summary-findings-1', part: 'summary', label: 'Findings', defaultOn: true, group: 'findings', when: 'band=1',
      text: 'The AUT examination revealed minor internal wall loss.' },
    { id: 'summary-findings-2', part: 'summary', label: 'Findings', defaultOn: true, group: 'findings', when: 'band=2',
      text: 'The AUT examination revealed moderate internal wall loss.' },
    { id: 'summary-findings-3', part: 'summary', label: 'Findings', defaultOn: true, group: 'findings', when: 'band=3',
      text: 'The AUT examination revealed significant internal wall loss.' },
    { id: 'summary-minimum', part: 'summary', label: 'Minimum and average', defaultOn: true,
      text: 'The minimum thickness found with AUT was {minT} on scan {minScan}. This minimum thickness represents a {wallLoss} wall-loss from the nominal thickness of {nominal}. The average thickness from the AUT scans performed was {avgT}.' },
    { id: 'summary-manual', part: 'summary', label: 'Manual readings', defaultOn: true, when: 'manualReadings>0',
      text: 'Manual UT data ({manualReadings} readings) are on the following pages.' },
    { id: 'summary-closing', part: 'summary', label: 'Closing', defaultOn: true,
      text: 'See the following scan sheet, roll-out drawings, and AUT data for further information regarding this examination.' },

    { id: 'calibration-note', part: 'calibration', label: 'Calibration note', defaultOn: true,
      text: 'All calibrations are performed on the AUT calibration standard at ambient temperature.' },
    { id: 'temperature-note', part: 'temperature', label: 'Temperature correction note', defaultOn: true,
      text: 'When performing scans on components at elevated temperatures (above 100 °F), temperature correction calculations are performed: UT thickness x (1.007 - 0.0001 x temperature in °F) = temperature corrected thickness.' },
  ],

  // Integrity EPC's own boilerplate (no client content); pictures bundled with the app (src/assets/report/, cleared by
  // the user 2026-11-01) and the V-100 example job's rollout drawn as vectors.
  fixedPages: [
    {
      sectionId: 'equipment',
      parts: [{
        layout: 'side',
        paragraphs: [
          { heading: 'AUT Scanner Equipment', text: 'Integrity EPC utilizes state-of-the-art computerized robotic technology and advanced ultrasonic testing techniques to provide the oil & gas industry one of the most comprehensive inspection programs in our industry: Automated Ultrasonic Testing (AUT). AUT is a fully automated ultrasonic inspection technique, which utilizes a multi-channel ultrasonic imaging system and encoded robotic scanners. The major advantage of AUT is that it provides detailed inspection data at a high rate of speed with exceptional accuracy and repeatability.' },
          { text: 'AUT is capable of inspecting pressure vessels, piping, storage tanks, and other equipment while in service for potential service related damage. AUT offers a full volumetric inspection providing details on shell material degradation such as erosion, corrosion, hydrogen blisters, hydrogen induced cracking (HIC), and related interlinking cracking.' },
          { text: 'This system can also be utilized in weld inspection for the detection of both service and fabrication related defects implementing the pulse-echo or Time of Flight Diffraction (TOFD) techniques.' },
          { heading: 'Advantages', text: 'In-service examinations at elevated temperatures (up to 500 °F direct scanner contact). High-speed data acquisition, up to 30 inches per second. Minimizes the need for costly internal entry. Detailed information for fitness for service evaluation. Exceptional repeatability, encoded scanning accurate to 0.001". Multi-tasking capabilities utilizing a full array of transducers simultaneously.' },
        ],
        pictures: [
          { slot: 'equipment-scanner', kind: 'asset', file: 'aut-scanner.png', px: { w: 685, h: 546 }, caption: 'AUT scanner' },
          { slot: 'equipment-unit', kind: 'asset', file: 'proscan-xt.png', px: { w: 378, h: 276 }, caption: 'ProScan XT', maxW: 2 },
        ],
      }, {
        layout: 'below',
        paragraphs: [
          { heading: 'Displays', text: "C-scan display represents a top or plan view of the object. 0° mapping data is usually presented in 'Depth' and shearwave in 'Amplitude'. B-scan display represents a side view along the stroke of the object (Y-axis); the colors in this view represent the amplitude of the signals. B-scan (B-prime) display represents an end view along the X-axis index." },
        ],
        pictures: [
          { slot: 'equipment-bscan', kind: 'drawn', diagram: 'scan-views' },
        ],
      }],
    },
    {
      sectionId: 'guide',
      parts: [{
        layout: 'below',
        paragraphs: [
          { heading: 'Example: AUT scan with corrosion present', text: 'C-scan (plan view), B-scan (Y-axis cross sectional view) and A-scan (waveform), with the O.D. and I.D. surfaces marked.' },
          { text: 'Referring to the UT depth color palette, the blue areas in the C-scan image represent the nominal thickness and the green, yellow and red areas represent I.D. wall loss.' },
        ],
        pictures: [
          {
            slot: 'guide-cscan-example', kind: 'asset', file: 'example-cscan.jpg', px: { w: 1532, h: 767 },
            labels: [
              { text: 'C-SCAN (plan view)', box: [0.003, 0.055, 0.941, 0.712], at: [0.055, 0.09] },
              { text: 'COLOR SCALE', box: [0.943, 0.058, 0.999, 0.268], at: [0.999, 0.28], right: true },
              { text: 'A-SCAN', box: [0.001, 0.754, 0.193, 0.949], at: [0.06, 0.775] },
              { text: 'B-SCAN (Y-axis section)', box: [0.195, 0.754, 0.999, 0.949], at: [0.245, 0.775] },
            ],
          },
        ],
      }, {
        layout: 'below',
        paragraphs: [
          { heading: 'Examples of rollouts with scans overlaid', text: 'Vertical tank and horizontal vessel rollouts with the AUT scans overlaid.' },
        ],
        pictures: [
          { slot: 'guide-rollout-horizontal', kind: 'example', job: 'v100', caption: 'Horizontal vessel' },
        ],
      }],
    },
  ],
}
