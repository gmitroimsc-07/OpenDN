// QR generation for OpenDN payloads.
'use strict';

const QRCode = require('qrcode');

// Error-correction level Q (25% redundancy) — the payload must survive a
// damaged document; that is the point of the system.
const QR_OPTIONS = { errorCorrectionLevel: 'Q', margin: 4 };

async function qrPngBuffer(payload, scale = 8) {
  return QRCode.toBuffer(payload, { ...QR_OPTIONS, scale, type: 'png' });
}

function qrInfo(payload) {
  const code = QRCode.create(payload, { errorCorrectionLevel: 'Q' });
  return { version: code.version, modules: code.modules.size, ecLevel: 'Q' };
}

module.exports = { qrPngBuffer, qrInfo };
