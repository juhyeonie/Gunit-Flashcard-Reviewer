/**
 * A real, if minimal, PDF: catalog, page tree, one content stream per page and
 * a standard font. Written out by hand so the tests read a genuine file rather
 * than a stand-in for one — PDF.js is the part being trusted here.
 */
export const pdfWith = (contents) => {
  const count = contents.length
  const pageId = (i) => 3 + i * 2
  const streamId = (i) => 4 + i * 2
  const fontId = 3 + count * 2

  const objs = []
  objs[1] = '<</Type/Catalog/Pages 2 0 R>>'
  objs[2] = `<</Type/Pages/Kids[${contents
    .map((_, i) => `${pageId(i)} 0 R`)
    .join(' ')}]/Count ${count}>>`
  contents.forEach((stream, i) => {
    objs[pageId(i)] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents ${streamId(i)} 0 R` +
      `/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`
    objs[streamId(i)] = `<</Length ${stream.length}>>stream\n${stream}\nendstream`
  })
  objs[fontId] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'

  let out = '%PDF-1.4\n'
  for (let i = 1; i < objs.length; i++) out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  out += `trailer\n<</Size ${objs.length}/Root 1 0 R>>\n%%EOF\n`
  return new TextEncoder().encode(out).buffer
}

/** One line of text, drawn at a fixed position. */
export const written = (...lines) =>
  `BT /F1 14 Tf 20 250 Td ${lines.map((l) => `(${l}) Tj 0 -20 Td`).join(' ')} ET`

/** A page with ink on it but no text at all — what a scan looks like. */
export const drawn = '0 0 0 rg 20 20 260 260 re f'
