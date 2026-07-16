// End-to-end smoke test: build payload → render label + stamped PDF →
// rasterise → decode the QR with zxing → compare byte-for-byte.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildPayload, parsePayload } = require('../src/payload');
const { qrPngBuffer } = require('../src/qr');
const { labelPdf } = require('../src/label');
const { stampPdf } = require('../src/stamp');

const note = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'note.json'), 'utf8'));

async function decodePng(buffer) {
  const { PNG } = require('pngjs');
  const { prepareZXingModule, readBarcodes } = require('zxing-wasm/reader');
  const entry = require.resolve('zxing-wasm/reader');
  const wasmPath = [
    path.resolve(path.dirname(entry), 'zxing_reader.wasm'),
    path.resolve(path.dirname(entry), '..', '..', 'reader', 'zxing_reader.wasm'),
  ].find(fs.existsSync);
  if (!wasmPath) throw new Error('zxing_reader.wasm not found next to zxing-wasm/reader');
  prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(wasmPath) }, fireImmediately: true });
  const png = PNG.sync.read(buffer);
  const res = await readBarcodes(
    { data: new Uint8ClampedArray(png.data.buffer, 0, png.width * png.height * 4), width: png.width, height: png.height },
    { formats: ['QRCode'] }
  );
  return res[0]?.text;
}

(async () => {
  // 1. payload round-trip
  const payload = buildPayload(note);
  const parsed = parsePayload(payload);
  assert.strictEqual(parsed.note, note.note, 'note number round-trips');
  assert.strictEqual(parsed.items.length, note.items.length, 'item count round-trips');
  assert.strictEqual(parsed.items[0].code, note.items[0].code, 'item code round-trips');
  console.log(`payload round-trip OK (${payload.length} chars, ${parsed.items.length} items)`);

  // 2. QR PNG decodes byte-identical
  const decoded = await decodePng(await qrPngBuffer(payload, 8));
  assert.strictEqual(decoded, payload, 'QR decodes byte-identical to payload');
  console.log('QR decode OK (zxing, byte-identical)');

  // 3. outputs render
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const label = await labelPdf(payload, note);
  fs.writeFileSync(path.join(out, 'label.pdf'), label);
  assert.ok(label.length > 10_000, 'label PDF has content');

  const { PDFDocument } = require('pdf-lib');
  const base = await PDFDocument.create();
  base.addPage([595, 842]);
  const stamped = await stampPdf(await base.save(), payload, note);
  fs.writeFileSync(path.join(out, 'stamped.pdf'), stamped);
  assert.ok(stamped.length > 10_000, 'stamped PDF has content');
  console.log('label.pdf + stamped.pdf rendered OK (test/out/)');

  console.log('\nall smoke tests passed');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
