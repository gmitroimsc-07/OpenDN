#!/usr/bin/env node
// opendn — put your delivery note's data into a QR code anyone can read.
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPayload, parsePayload } = require('../src/payload');
const { qrPngBuffer, qrInfo } = require('../src/qr');
const { labelPdf } = require('../src/label');
const { stampPdf } = require('../src/stamp');

const HELP = `opendn — delivery-note QR toolkit (OpenDN v1, plain text)

Usage:
  opendn generate <note.json> [-o label.pdf] [--qr qr.png] [--payload payload.txt]
      Build the payload from a note JSON file and render an A6 label PDF.

  opendn stamp <note.pdf> <note.json> [-o stamped.pdf] [--page N] [--size MM]
      Stamp the QR into the bottom-right zone of an existing delivery-note PDF.

  opendn parse <payload.txt | ->
      Parse a scanned payload back into JSON (reference parser for platforms).

  opendn watch [<in-dir> <out-dir>] [--templates DIR] [--config FILE]
               [--size MM] [--page N] [--once]
      Watch a folder: every PDF dropped in comes out stamped in the output
      folder (originals → archive/, unparseable → review/ with a reason —
      fail-open, nothing is ever blocked or modified in place). Print or
      export your delivery notes into the input folder and forget about it.
      --once processes the files already there and exits. Folders and
      options can also live in opendn.config.json.

  opendn printer install --input DIR [--name OpenDN]   (sudo, Linux/macOS)
  opendn printer uninstall [--name OpenDN]             (sudo)
  opendn printer status
      Register a real "OpenDN" printer (CUPS): anything printed to it from
      any application lands as a PDF in the input folder for `opendn watch`
      to stamp. Only what you choose to print enters the pipeline; anything
      that isn't a delivery note fails open to review/ as an ordinary PDF.

  opendn example
      Print a template note.json to fill in.

note.json fields:
  note, date, supplier (required) · customer, deliverTo, ref, custRef,
  account, weightKg (optional) · items: [{ code, desc, qty }] (required)`;

function arg(args, flag, fallback) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function readNote(file) {
  let note;
  try { note = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`could not read ${file}: ${e.message}`); }
  return note;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'generate') {
    const out = arg(args, '-o', 'label.pdf');
    const qrOut = arg(args, '--qr', null);
    const payloadOut = arg(args, '--payload', null);
    if (!args[0]) throw new Error('usage: opendn generate <note.json> [-o label.pdf]');
    const note = readNote(args[0]);
    const payload = buildPayload(note);
    fs.writeFileSync(out, await labelPdf(payload, note));
    if (qrOut) fs.writeFileSync(qrOut, await qrPngBuffer(payload, 10));
    if (payloadOut) fs.writeFileSync(payloadOut, payload);
    const info = qrInfo(payload);
    console.log(`${out} written — ${note.items.length} lines, payload ${payload.length} chars, QR v${info.version} EC ${info.ecLevel}`);
    return;
  }

  if (cmd === 'stamp') {
    const out = arg(args, '-o', 'stamped.pdf');
    const pageN = parseInt(arg(args, '--page', '1'), 10);
    const size = parseFloat(arg(args, '--size', '40'));
    if (!args[0] || !args[1]) throw new Error('usage: opendn stamp <note.pdf> <note.json> [-o stamped.pdf]');
    const note = readNote(args[1]);
    const payload = buildPayload(note);
    const stamped = await stampPdf(fs.readFileSync(args[0]), payload, note, { pageIndex: pageN - 1, qrMm: size });
    fs.writeFileSync(out, stamped);
    console.log(`${out} written — QR (${size} mm) stamped on page ${pageN}`);
    return;
  }

  if (cmd === 'watch') {
    const { loadConfig } = require('../src/config');
    const { watch } = require('../src/watch');
    const configFile = arg(args, '--config', null);
    const templates = arg(args, '--templates', null);
    const qrMm = arg(args, '--size', null);
    const page = arg(args, '--page', null);
    const once = args.includes('--once');
    if (once) args.splice(args.indexOf('--once'), 1);
    const cfg = loadConfig(configFile, {
      input: args[0], output: args[1],
      templates: templates || undefined,
      qrMm: qrMm ? parseFloat(qrMm) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    });
    await watch(cfg, { once });
    return;
  }

  if (cmd === 'printer') {
    const printer = require('../src/printer');
    const sub = args.shift();
    const name = arg(args, '--name', 'OpenDN');
    if (sub === 'install') {
      const input = arg(args, '--input', null);
      const r = printer.install({ name, input });
      console.log(`printer "${r.name}" installed — capture folder: ${r.input}`);
      console.log(`print anything to "${r.name}", then run: opendn watch ${r.input} <out-dir>`);
      return;
    }
    if (sub === 'uninstall') {
      const r = printer.uninstall({ name });
      console.log(`printer "${r.name}" removed${r.backendRemoved ? ' (backend removed too)' : ''}`);
      return;
    }
    if (sub === 'status') {
      const s = printer.status({ name });
      console.log(`backend installed: ${s.backendInstalled ? 'yes' : 'no'}`);
      if (s.queues.length === 0) console.log('no OpenDN print queues registered');
      for (const q of s.queues) console.log(`queue "${q.name}" → ${q.input}`);
      return;
    }
    throw new Error('usage: opendn printer <install|uninstall|status>');
  }

  if (cmd === 'parse') {
    if (!args[0]) throw new Error('usage: opendn parse <payload.txt | ->');
    const text = args[0] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args[0], 'utf8');
    console.log(JSON.stringify(parsePayload(text), null, 2));
    return;
  }

  if (cmd === 'example') {
    console.log(JSON.stringify({
      note: 'DN10245876',
      date: '2026-02-05 05:48',
      supplier: 'Brightmoor Trade Supplies Ltd, 12 Foundry Lane, Milton Keynes MK9 1AA, T:01632 960812',
      customer: 'Stonegate Construction Ltd, Unit 4, Harbour Business Park, Riverton RV2 4TQ',
      deliverTo: 'Stonegate Site 12, 55 Meadow Way, Northbridge NB1 5GH, T:07700 900123',
      ref: 'G123/SO45678901',
      custRef: 'OAKFIELD0402-2026',
      account: '456789',
      weightKg: 111.55,
      items: [
        { code: '5101001', desc: 'Trade Satinwood Paint Light Tint 5L S1005-Y10R', qty: 3 },
        { code: '5101006', desc: 'Decorators Caulk White 380ml', qty: 12 },
      ],
    }, null, 2));
    return;
  }

  console.log(HELP);
  process.exitCode = cmd && cmd !== '--help' && cmd !== '-h' ? 1 : 0;
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
