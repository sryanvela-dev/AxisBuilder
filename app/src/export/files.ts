// Names of the files the Export step writes into the job folder, all from the job name:
//   "<job> - AUT Coverage.pdf"      the PDF
//   "<job> - AUT Coverage.lsp"      the CAD drawing file (the backup way)
//   "<name>.jpg" / "<name>_001.jpg" the report images, as TightPDF names them (<name> = the PDF's name)
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
 * Report image names as TightPDF writes them: one sheet -> "<name>.jpg"; several -> "<name>_001.jpg",
 * "<name>_002.jpg", ... (at least three digits).
 */
export function reportImageNames(baseName: string, count: number): string[] {
  const base = cleanFileName(baseName, 'Page')
  if (count === 1) return [`${base}.jpg`]
  const width = Math.max(3, String(count).length)
  return Array.from({ length: count }, (_, i) => `${base}_${String(i + 1).padStart(width, '0')}.jpg`)
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
