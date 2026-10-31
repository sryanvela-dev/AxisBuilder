// The Report workspace's steps in order (kept apart from session.ts so report code without the browser can name them).
export const REPORT_STEP_IDS = ['setup', 'calibration', 'results', 'manual', 'pages', 'summary', 'reportReview', 'reportExport'] as const
export type ReportStepId = (typeof REPORT_STEP_IDS)[number]
