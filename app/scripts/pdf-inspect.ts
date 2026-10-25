// Prints what is inside a PDF (pages, fonts, images, the start of each page's drawing commands), to look into
// a PDF the app made:   npm run pdf:inspect -- "<file.pdf>"
import { readFileSync, writeFileSync } from 'node:fs'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib'

const file = process.argv[2]
if (!file) throw new Error('Give the PDF file.')
const doc = await PDFDocument.load(readFileSync(file))
console.log(`${doc.getPageCount()} pages, ${readFileSync(file).length} bytes`)
for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
  if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
    console.log(`image ${ref}: ${obj.dict.get(PDFName.of('Width'))} x ${obj.dict.get(PDFName.of('Height'))}, ${obj.contents.length} bytes`)
  }
  if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font')) console.log(`font ${ref}: ${obj.get(PDFName.of('Subtype'))} ${obj.get(PDFName.of('BaseFont'))}`)
}
doc.getPages().forEach((page, i) => {
  const c = page.node.Contents()
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r) as PDFStream) : c ? [c] : []
  const text = streams.map((s) => new TextDecoder('latin1').decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n')
  const ops = new Map<string, number>()
  for (const m of text.matchAll(/\b(re|m|l|c|S|Tj|Do|cm|q|Q|gs|BDC|EMC|W|n|w|RG)\b/g)) ops.set(m[1], (ops.get(m[1]) ?? 0) + 1)
  console.log(`page ${i + 1}: ${page.getWidth()} x ${page.getHeight()}, ${text.length} chars, ops ${[...ops].map(([k, v]) => `${k}:${v}`).join(' ')}`)
  if (process.argv[3]) writeFileSync(`${process.argv[3]}-${i + 1}.txt`, text)
  console.log(text.slice(0, 1500))
  console.log('...')
  const tj = text.indexOf('Tj')
  console.log(text.slice(Math.max(0, tj - 600), tj + 400))
})
