// The Watcher: PDFs dropped in the input folder come out the other side as
// stamped PDFs — no commands, no manual steps.
//
//   input/  ─▶  extract text  ─▶  template (or generic) parse  ─▶  payload
//                                                                    │
//   archive/  ◀─ original                     stamped PDF + .txt ─▶  output/
//
// Fail-open (design principle #3): any error moves the ORIGINAL, untouched,
// to review/ with a .reason.txt beside it. The watcher never crashes, never
// blocks, never modifies a document it could not parse.
'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { extractText } = require('./extract');
const { loadTemplates, selectTemplate, applyTemplate, genericParse } = require('./template');
const { buildPayload } = require('./payload');
const { stampPdf } = require('./stamp');

/** Process one PDF through the full pipeline. Throws on any failure. */
async function processPdf(file, cfg, templates) {
  const bytes = fs.readFileSync(file);
  const { lines, text } = await extractText(bytes);

  const tpl = selectTemplate(text, templates);
  const note = tpl ? applyTemplate(lines, tpl) : genericParse(lines);
  const payload = buildPayload(note);
  const stamped = await stampPdf(bytes, payload, note, { pageIndex: cfg.page - 1, qrMm: cfg.qrMm });

  // date+time on every output name: each print is unique (the Windows
  // port captures every job as capture.pdf), and archive pairs with output
  let base = path.basename(file, path.extname(file));
  if (cfg.timestampNames) base += `-${timestamp()}`;
  const outPdf = uniquePath(path.join(cfg.output, `${base}${cfg.stampedSuffix}.pdf`));
  fs.writeFileSync(outPdf, stamped);
  if (cfg.writePayload) {
    fs.writeFileSync(outPdf.replace(/\.pdf$/, '.payload.txt'), payload);
  }
  moveFile(file, uniquePath(path.join(cfg.archive, `${base}${path.extname(file)}`)));
  return { outPdf, note, payload, template: tpl ? tpl.name : 'generic' };
}

/** Fail-open: original moves untouched to review/ with the reason beside it. */
function sendToReview(file, cfg, err) {
  const dest = uniquePath(path.join(cfg.review, path.basename(file)));
  moveFile(file, dest);
  fs.writeFileSync(
    dest.replace(/\.pdf$/i, '') + '.reason.txt',
    `${path.basename(file)}\n${new Date().toISOString()}\n\n${err.message}\n`
  );
  return dest;
}

/**
 * Watch cfg.input for new PDFs (or, with once=true, process what is already
 * there and return {processed, review}). Never throws per-file — errors go
 * to review/ and the watcher keeps running.
 */
async function watch(cfg, { once = false, log = console.log } = {}) {
  for (const dir of [cfg.input, cfg.output, cfg.archive, cfg.review]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const templates = loadTemplates(cfg.templates);
  log(`opendn watch — ${templates.length} supplier template(s) from ${cfg.templates}`);
  log(`  input: ${cfg.input}\n  output: ${cfg.output}\n  archive: ${cfg.archive}\n  review: ${cfg.review}`);

  const results = { processed: [], review: [] };
  const handle = async (file) => {
    if (!/\.pdf$/i.test(file)) return;
    try {
      const r = await processPdf(file, cfg, templates);
      results.processed.push(r);
      log(`✓ ${path.basename(file)} → ${path.basename(r.outPdf)} (${r.note.items.length} lines, template: ${r.template})`);
    } catch (err) {
      const dest = sendToReview(file, cfg, err);
      results.review.push({ file, dest, reason: err.message });
      log(`⚠ ${path.basename(file)} → review/ — ${err.message}`);
    }
  };

  if (once) {
    for (const name of fs.readdirSync(cfg.input).sort()) {
      const full = path.join(cfg.input, name);
      if (fs.statSync(full).isFile()) await handle(full);
    }
    log(`done — ${results.processed.length} stamped, ${results.review.length} to review`);
    return results;
  }

  const watcher = chokidar.watch(cfg.input, {
    depth: 0,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
  });
  watcher.on('add', handle);
  watcher.on('error', (err) => log(`⚠ watcher error: ${err.message}`));
  log('watching for PDFs — Ctrl-C to stop');
  return new Promise(() => {}); // runs until interrupted
}

function timestamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function uniquePath(target) {
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, -ext.length);
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function moveFile(from, to) {
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV') throw e; // cross-device: copy then delete
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

module.exports = { watch, processPdf, sendToReview };
