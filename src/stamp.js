// Stamp the QR into the designated zone of an existing delivery-note PDF.
// Default zone: bottom-right corner of the first page, 40 mm code with a
// caption box. The stamp is drawn on a white panel so it stays scannable
// on any background.
'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { qrPngBuffer } = require('./qr');

const MM = 72 / 25.4;
const BORDER = rgb(0.11, 0.36, 0.27);
const INK = rgb(0.1, 0.16, 0.13);
const MUTED = rgb(0.4, 0.44, 0.42);

/**
 * options: { pageIndex (default 0), qrMm (default 40), marginMm (default 8) }
 */
async function stampPdf(inputPdfBytes, payload, note, options = {}) {
  const { pageIndex = 0, qrMm = 40, marginMm = 8 } = options;
  const doc = await PDFDocument.load(inputPdfBytes);
  const pages = doc.getPages();
  if (pageIndex < 0 || pageIndex >= pages.length) {
    throw new Error(`page ${pageIndex + 1} does not exist (document has ${pages.length})`);
  }
  const page = pages[pageIndex];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const qrSize = qrMm * MM;
  const pad = 3 * MM;
  const captionW = 26 * MM;
  const boxW = qrSize + captionW + pad * 3;
  const boxH = qrSize + pad * 2 + 5 * MM;
  const x = page.getWidth() - boxW - marginMm * MM;
  const y = marginMm * MM;

  page.drawRectangle({
    x, y, width: boxW, height: boxH,
    color: rgb(1, 1, 1), borderColor: BORDER, borderWidth: 0.9, opacity: 1,
  });

  const png = await doc.embedPng(await qrPngBuffer(payload, 8));
  page.drawImage(png, { x: x + pad, y: y + boxH - pad - qrSize, width: qrSize, height: qrSize });

  const cx = x + pad * 2 + qrSize;
  let cy = y + boxH - pad - 4 * MM;
  page.drawText('DELIVERY DATA', { x: cx, y: cy, size: 7, font: bold, color: BORDER });
  cy -= 3.4 * MM;
  page.drawText('SECURED', { x: cx, y: cy, size: 7, font: bold, color: BORDER });
  cy -= 5 * MM;
  for (const line of ['Scan with any QR app —', 'the complete delivery', 'note is stored in this', 'code as plain text.']) {
    page.drawText(line, { x: cx, y: cy, size: 5.6, font, color: INK });
    cy -= 2.9 * MM;
  }
  cy -= 2 * MM;
  page.drawText(String(note.note || ''), { x: cx, y: cy, size: 5.6, font: bold, color: INK });

  page.drawText('OpenDN v1 · plain text · readable by any scanner or platform', {
    x: x + pad, y: y + pad - 1 * MM, size: 5, font, color: MUTED,
  });

  return doc.save();
}

module.exports = { stampPdf };
