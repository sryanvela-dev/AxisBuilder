// Names of the files the Export step writes into the job folder, all from the job name:
//   "<job> - AUT Coverage.pdf"      the PDF
//   "<job> - AUT Coverage.lsp"      the CAD drawing file (the backup way)
//   "<name>.jpg" / "<name> - Section 1.jpg" the report images, one per sheet, named by the sheet (<name> = the PDF's name)
//   "<job> - <client> - AUT Report.pdf"  the AUT report ("<job> - AUT Report.pdf" with no client)

/** TightPDF's clean_base_name: characters Windows doesn't allow become "_"; no trailing dots or spaces. */
export function cleanFileName(value: string, fallback = 'Job'): string {
  const name = value.trim().replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '')
  return name || fallback
}

/** "<job> - AUT Coverage" (the PDF's and the .lsp's name without the extension). */
export function exportBaseName(jobName: string): string {
  return `${cleanFileName(jobName)} - AUT Coverage`
}

/**
 * The report images named by the sheet they show (user, 2026-10-31): one sheet -> "<name>.jpg"; several ->
 * "<name> - Drawing.jpg", "<name> - Overview.jpg", "<name> - Section 1.jpg", "<name> - Section 2.jpg", ...
 */
export function sheetImageNames(baseName: string, sheets: readonly { kind: 'main' | 'overview' | 'section'; section: { n: number } | null }[]): string[] {
  const base = cleanFileName(baseName, 'Page')
  if (sheets.length === 1) return [`${base}.jpg`]
  return sheets.map((m) => `${base} - ${m.kind === 'main' ? 'Drawing' : m.kind === 'overview' ? 'Overview' : `Section ${m.section?.n ?? ''}`.trim()}.jpg`)
}

/** "<job> - AUT Coverage.dxf" (Make DXF). */
export function dxfFileName(jobName: string): string {
  return `${exportBaseName(jobName)}.dxf`
}

/** "<job> - <client> - AUT Report.pdf" (Make report PDF, design 11.4); without a client "<job> - AUT Report.pdf". */
export function reportPdfName(jobName: string, client = ''): string {
  const c = client.trim() ? cleanFileName(client, '') : ''
  return `${cleanFileName(jobName)}${c ? ` - ${c}` : ''} - AUT Report.pdf`
}
