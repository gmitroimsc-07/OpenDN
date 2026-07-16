// Render an A6 label PDF: the QR plus a human-readable summary.
// Print it and attach it to the physical delivery note.
'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { qrPngBuffer, qrInfo } = require('./qr');

const MM = 72 / 25.4; // PDF points per millimetre
const INK = rgb(0.1, 0.16, 0.13);
const MUTED = rgb(0.4, 0.44, 0.42);

async function labelPdf(payload, note) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([105 * MM, 148 * MM]); // A6 portrait
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { height, width } = page.getSize();

  page.drawText('DELIVERY DATA SECURED', {
    x: 10 * MM, y: height - 14 * MM, size: 11, font: bold, color: INK,
  });
  page.drawText('Scan with any QR app — the complete delivery note is in this code.', {
    x: 10 * MM, y: height - 19 * MM, size: 7, font, color: MUTED,
  });

  const qrSize = 72 * MM;
  const png = await doc.embedPng(await qrPngBuffer(payload, 8));
  page.drawImage(png, {
    x: (width - qrSize) / 2, y: height - 24 * MM - qrSize, width: qrSize, height: qrSize,
  });

  const summary = [
    `${note.note}  ·  ${note.date}`,
    `From: ${note.supplier}`,
    note.deliverTo ? `To: ${note.deliverTo}` : null,
    `${note.items.length} lines${note.weightKg ? `  ·  ${note.weightKg} kg` : ''}`,
  ].filter(Boolean);

  let y = height - 30 * MM - qrSize;
  for (const line of summary) {
    page.drawText(line.length > 78 ? line.slice(0, 75) + '…' : line, {
      x: 10 * MM, y, size: 7.5, font, color: INK,
    });
    y -= 4 * MM;
  }

  const info = qrInfo(payload);
  page.drawText(
    `OpenDN v1 · plain text · ${payload.length} chars · QR v${info.version} EC ${info.ecLevel}`,
    { x: 10 * MM, y: 8 * MM, size: 6, font, color: MUTED }
  );

  return doc.save();
}

module.exports = { labelPdf };
