// PDF text-layer extraction — exact digital text only, no OCR (design
// principle: unparseable input is flagged, never guessed).
// Rebuilds lines from positioned text items; horizontal gaps wider than
// GAP_PT become a double space so table columns stay separable with /\s{2,}/.
'use strict';

// pdf.js probes DOMMatrix/Path2D for rendering, which we never do; stub
// them so requiring the module doesn't warn about the missing `canvas` pkg.
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = class DOMMatrix {};
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D {};

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const LINE_TOLERANCE_PT = 2.5; // items within this vertical distance share a line
const GAP_PT = 6;              // wider horizontal gap → column break (double space)

/**
 * Extract the text layer of a PDF as an array of lines per page.
 * Returns { pages: string[][], lines: string[], text: string }.
 * Throws if the document has no extractable text (e.g. a scanned image).
 */
async function extractText(pdfBytes) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes), useSystemFonts: true, verbosity: 0,
  }).promise;
  const pages = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const items = (await page.getTextContent()).items
        .filter((i) => i.str && i.str.trim() !== '')
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
      items.sort((a, b) => (Math.abs(a.y - b.y) > LINE_TOLERANCE_PT ? b.y - a.y : a.x - b.x));
      const rows = [];
      let row = null;
      let rowY = null;
      for (const it of items) {
        if (rowY === null || Math.abs(it.y - rowY) > LINE_TOLERANCE_PT) {
          row = [];
          rows.push(row);
          rowY = it.y;
        }
        row.push(it);
      }
      pages.push(rows.map(joinRow));
    }
  } finally {
    await doc.destroy();
  }
  const lines = pages.flat();
  if (lines.length === 0) {
    throw new Error('no text layer found (scanned image?) — OpenDN does not OCR');
  }
  return { pages, lines, text: lines.join('\n') };
}

function joinRow(items) {
  let out = '';
  let prevEnd = null;
  for (const it of items) {
    if (prevEnd !== null) {
      const gap = it.x - prevEnd;
      if (gap > GAP_PT) out += '  ';
      else if (gap > 0.5 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' ';
    }
    out += it.str;
    prevEnd = it.x + it.w;
  }
  return out.replace(/\s+$/, '');
}

module.exports = { extractText };
