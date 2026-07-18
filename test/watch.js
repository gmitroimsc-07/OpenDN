// End-to-end watcher test: three PDFs go into the input folder —
//   1. a Brightmoor note   → parsed by the supplier template, stamped
//   2. an unknown supplier → parsed by the generic fallback, stamped
//   3. a text-free PDF     → fail-open to review/ with a reason file
// The stamped payloads must decode with zxing byte-identical and parse back
// to the fixture's data.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { loadConfig } = require('../src/config');
const { watch } = require('../src/watch');
const { parsePayload } = require('../src/payload');
const { qrPngBuffer } = require('../src/qr');
const { decodePng } = require('./decode');
const { brightmoorPdf, unknownSupplierPdf, noTextPdf } = require('./fixtures');
const { genericParse } = require('../src/template');

(async () => {
  const root = path.join(__dirname, 'out', 'watch');
  fs.rmSync(root, { recursive: true, force: true });
  const input = path.join(root, 'in');
  fs.mkdirSync(input, { recursive: true });
  fs.writeFileSync(path.join(input, 'brightmoor-note.pdf'), await brightmoorPdf());
  fs.writeFileSync(path.join(input, 'unknown-supplier.pdf'), await unknownSupplierPdf());
  const noTextBytes = await noTextPdf();
  fs.writeFileSync(path.join(input, 'scan-no-text.pdf'), noTextBytes);

  const cfg = loadConfig(null, {
    input,
    output: path.join(root, 'out'),
    templates: path.join(__dirname, '..', 'templates'),
  });
  const results = await watch(cfg, { once: true, log: () => {} });

  // 1. template path
  assert.strictEqual(results.processed.length, 2, 'two PDFs stamped');
  const bm = results.processed.find((r) => r.template === 'Brightmoor Trade Supplies');
  assert.ok(bm, 'Brightmoor template selected');
  assert.strictEqual(bm.note.note, 'DN10245876', 'note number extracted');
  assert.strictEqual(bm.note.date, '05/02/2026 05:48', 'date extracted');
  assert.strictEqual(bm.note.deliverTo, 'Stonegate Site 12, 55 Meadow Way, Northbridge NB1 5GH', 'multi-line address joined');
  assert.strictEqual(bm.note.weightKg, '111.55', 'weight extracted');
  assert.deepStrictEqual(
    bm.note.items,
    [
      { code: '5101001', desc: 'Trade Satinwood Paint Light Tint 5L', qty: 3 },
      { code: '5101006', desc: 'Decorators Caulk White 380ml', qty: 12 },
    ],
    'item table extracted'
  );
  console.log('template parse OK (Brightmoor fixture, all fields)');

  // 2. generic fallback path
  const gen = results.processed.find((r) => r.template === 'generic');
  assert.ok(gen, 'generic fallback used for unknown supplier');
  assert.strictEqual(gen.note.note, 'HB-88231', 'generic: note number found');
  assert.strictEqual(gen.note.date, '14/07/2026', 'generic: date found');
  assert.strictEqual(gen.note.items.length, 2, 'generic: both item lines found');
  assert.strictEqual(gen.note.items[0].code, '7734001', 'generic: item code');
  console.log('generic fallback OK (unknown supplier fixture)');

  // 3. outputs on disk: stamped PDFs + payload text (date+time in every
  //    name so prints never collide), originals archived under paired names
  for (const r of results.processed) {
    assert.ok(fs.existsSync(r.outPdf), `stamped PDF exists: ${r.outPdf}`);
    assert.ok(fs.statSync(r.outPdf).size > 10_000, 'stamped PDF has content');
    assert.ok(/-\d{8}-\d{6}\.stamped\.pdf$/.test(r.outPdf), `output name carries date+time: ${r.outPdf}`);
    const payloadFile = r.outPdf.replace(/\.pdf$/, '.payload.txt');
    assert.strictEqual(fs.readFileSync(payloadFile, 'utf8'), r.payload, 'payload .txt matches');
  }
  const archived = fs.readdirSync(cfg.archive).sort();
  assert.strictEqual(archived.length, 2, 'both originals archived');
  assert.ok(/^brightmoor-note-\d{8}-\d{6}\.pdf$/.test(archived[0]), `archive name pairs with output: ${archived[0]}`);
  assert.ok(/^unknown-supplier-\d{8}-\d{6}\.pdf$/.test(archived[1]), `archive name pairs with output: ${archived[1]}`);
  console.log('outputs OK (stamped PDFs, payload .txt, timestamped names, archive/)');

  // 4. payload round-trips and its QR decodes byte-identical (zxing)
  const parsed = parsePayload(bm.payload);
  assert.strictEqual(parsed.note, 'DN10245876', 'payload parses back');
  assert.strictEqual(parsed.items.length, 2, 'payload item count');
  assert.strictEqual(parsed.weightKg, 111.55, 'payload weight');
  const decoded = await decodePng(await qrPngBuffer(bm.payload, 8));
  assert.strictEqual(decoded, bm.payload, 'QR decodes byte-identical');
  console.log('payload round-trip + zxing decode OK');

  // 5. fail-open: no-text PDF is in review/, untouched, with a reason
  assert.strictEqual(results.review.length, 1, 'one PDF sent to review');
  const reviewed = path.join(cfg.review, 'scan-no-text.pdf');
  assert.ok(fs.existsSync(reviewed), 'original in review/');
  assert.deepStrictEqual(
    fs.readFileSync(reviewed),
    noTextBytes,
    'reviewed PDF is byte-identical to the original (never modified)'
  );
  const reason = fs.readFileSync(path.join(cfg.review, 'scan-no-text.reason.txt'), 'utf8');
  assert.ok(reason.includes('no text layer'), 'reason file explains why');
  assert.strictEqual(fs.readdirSync(cfg.input).length, 0, 'input folder is drained');
  console.log('fail-open OK (no-text PDF → review/ + reason, byte-identical)');

  // 6. generic parser: downloadable-template conventions — [bracketed] note
  //    numbers, month-name dates, multi-numeric-column item tables
  const web = genericParse([
    'Anytown Trading Co  Delivery Note',
    'Order Date  July 18, 2026',
    'Delivery Note #  [100]',
    'Item #  Description  Ordered  Delivered  Outstanding',
    '55145  Product 1  12  12  0',
    '55155  Product 2  5  5  0',
  ]);
  assert.strictEqual(web.note, '100', 'bracketed note number captured');
  assert.strictEqual(web.date, 'July 18, 2026', 'month-name date captured');
  assert.strictEqual(web.supplier, 'Anytown Trading Co', 'doc title stripped from letterhead line');
  assert.deepStrictEqual(web.items, [
    { code: '55145', desc: 'Product 1', qty: 12 },
    { code: '55155', desc: 'Product 2', qty: 5 },
  ], 'multi-column table: clean desc, first numeric column is qty');
  console.log('generic parse of web-template conventions OK');

  console.log('\nall watcher tests passed');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
