// Fixture delivery-note PDFs for the watcher tests — drawn with pdf-lib so
// they carry a real text layer. All data is fictional (Ofcom reserved phone
// ranges), per the project rule.
'use strict';

const { PDFDocument, StandardFonts } = require('pdf-lib');

// Matches templates/brightmoor-trade-supplies.json.
async function brightmoorPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const t = (text, x, y, opts = {}) =>
    page.drawText(text, { x, y, size: opts.size || 9, font: opts.bold ? bold : font });

  t('BRIGHTMOOR TRADE SUPPLIES LTD', 50, 800, { size: 14, bold: true });
  t('12 Foundry Lane, Milton Keynes MK9 1AA — T: 01632 960812', 50, 784);
  t('DELIVERY NOTE  No: DN10245876', 50, 750, { size: 11, bold: true });
  t('Date: 05/02/2026 05:48', 50, 734);
  t('Ref: G123/SO45678901', 50, 720);
  t('Deliver to: Stonegate Site 12', 50, 698);
  t('55 Meadow Way, Northbridge NB1 5GH', 50, 684);

  t('CODE', 50, 650, { bold: true });
  t('DESCRIPTION', 150, 650, { bold: true });
  t('QTY', 480, 650, { bold: true });
  t('5101001', 50, 634);
  t('Trade Satinwood Paint Light Tint 5L', 150, 634);
  t('3', 480, 634);
  t('5101006', 50, 620);
  t('Decorators Caulk White 380ml', 150, 620);
  t('12', 480, 620);

  t('Total weight: 111.55 kg', 50, 590);
  t('GOODS RECEIVED IN GOOD CONDITION', 50, 560, { bold: true });
  return Buffer.from(await doc.save());
}

// Unknown supplier — no template matches; the generic parser must cope.
async function unknownSupplierPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const t = (text, x, y) => page.drawText(text, { x, y, size: 9, font });

  t('Harbourside Building Products Ltd', 50, 800);
  t('Delivery Note No: HB-88231', 50, 770);
  t('Date 14/07/2026', 50, 756);
  t('7734001', 50, 700);
  t('Sharp Sand 25kg Bag', 160, 700);
  t('40', 470, 700);
  t('7734015', 50, 686);
  t('Cement OPC 25kg', 160, 686);
  t('10', 470, 686);
  return Buffer.from(await doc.save());
}

// No text layer at all — must fail-open to review/, never be guessed at.
async function noTextPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 100, y: 400, width: 300, height: 120 });
  return Buffer.from(await doc.save());
}

module.exports = { brightmoorPdf, unknownSupplierPdf, noTextPdf };
