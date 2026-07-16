// Shared test helper: decode a QR PNG buffer with zxing — the same engine
// real scanner apps use.
'use strict';

const fs = require('fs');
const path = require('path');

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

module.exports = { decodePng };
