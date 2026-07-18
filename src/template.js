// Supplier template engine: JSON files in the templates folder map extracted
// PDF text to note fields and item lines — users add suppliers without
// touching code. Format documented in docs/templates.md.
// A conservative generic parser is the fallback when no template matches;
// if it cannot find the required fields it throws (fail-open handles it).
'use strict';

const fs = require('fs');
const path = require('path');

/** Load every *.json template in a directory. Missing dir → empty list. */
function loadTemplates(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const templates = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const full = path.join(dir, file);
    let tpl;
    try { tpl = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch (e) { throw new Error(`bad template ${file}: ${e.message}`); }
    if (!tpl.name || !Array.isArray(tpl.match) || tpl.match.length === 0) {
      throw new Error(`bad template ${file}: needs "name" and non-empty "match" array`);
    }
    if (!tpl.fields || !tpl.items || !tpl.items.pattern) {
      throw new Error(`bad template ${file}: needs "fields" and "items.pattern"`);
    }
    tpl.file = file;
    templates.push(tpl);
  }
  return templates;
}

/** First template whose every match string appears in the text (case-insensitive). */
function selectTemplate(text, templates) {
  const haystack = text.toUpperCase();
  return templates.find((t) => t.match.every((m) => haystack.includes(m.toUpperCase()))) || null;
}

/** Apply a template to extracted lines → note object for buildPayload. */
function applyTemplate(lines, tpl) {
  const note = {};
  for (const [prop, spec] of Object.entries(tpl.fields)) {
    if (spec.value !== undefined) { note[prop] = spec.value; continue; }
    const value = captureField(lines, spec);
    if (value === null) {
      if (!spec.optional) throw new Error(`template "${tpl.name}": field "${prop}" not found (pattern: ${spec.pattern})`);
      continue;
    }
    note[prop] = value;
  }
  note.items = captureItems(lines, tpl.items, tpl.name);
  return note;
}

function captureField(lines, spec) {
  const re = new RegExp(spec.pattern, 'i');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    let value = m[1] !== undefined ? m[1] : m[0];
    // "lines: N" — an address block continues on the next N-1 non-empty lines
    for (let extra = 1; extra < (spec.lines || 1); extra++) {
      const next = (lines[i + extra] || '').trim();
      if (!next) break;
      value += `, ${next}`;
    }
    return value.trim();
  }
  return null;
}

function captureItems(lines, spec, tplName) {
  const begin = spec.begin ? new RegExp(spec.begin, 'i') : null;
  const end = spec.end ? new RegExp(spec.end, 'i') : null;
  const line = new RegExp(spec.pattern);
  const items = [];
  let inTable = !begin;
  for (const raw of lines) {
    if (!inTable) { if (begin.test(raw)) inTable = true; continue; }
    if (end && end.test(raw)) break;
    const m = raw.match(line);
    if (m) items.push({ code: m[1], desc: m[2], qty: parseQty(m[3], tplName) });
  }
  if (items.length === 0) {
    throw new Error(`template "${tplName}": no item lines matched (pattern: ${spec.pattern})`);
  }
  return items;
}

function parseQty(text, source) {
  const qty = parseFloat(text);
  if (Number.isNaN(qty)) throw new Error(`${source}: item quantity "${text}" is not a number`);
  return qty;
}

// ---------------------------------------------------------------------------
// Generic fallback — deliberately conservative. It only accepts a note when
// it finds a note number, a date and at least one item line; anything less
// throws so the fail-open path sends the PDF to review/ instead of guessing.

// the captured reference must contain a digit so plain words never qualify;
// [brackets] around the value (common in downloadable templates) are allowed
const NOTE_RES = [
  /(?:DELIVERY|DESPATCH)\s*NOTE\s*(?:No\.?|Number|#)?\s*:?\s*\[?((?=[A-Z0-9/-]*[0-9])[A-Z0-9][A-Z0-9/-]{2,})\]?/i,
  /\b(DN[0-9]{4,})\b/,
];
const MONTHS = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
const DATE_RE = new RegExp(
  '\\b([0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}(?:\\s+[0-9]{1,2}:[0-9]{2})?' + // 05/02/2026 05:48
  '|[0-9]{4}-[0-9]{2}-[0-9]{2}(?:\\s+[0-9]{2}:[0-9]{2})?' +                    // 2026-02-05
  `|${MONTHS} [0-9]{1,2},? [0-9]{4}` +                                          // July 18, 2026
  `|[0-9]{1,2} ${MONTHS} [0-9]{4})\\b`, 'i');                                   // 18 July 2026
// desc is lazy and the numeric tail is anchored, so multi-column tables
// (Ordered/Delivered/Outstanding) keep the description clean; the FIRST
// numeric column is taken as the quantity
const ITEM_RE = /^(\S{2,})\s{2,}(\S.*?)\s{2,}([0-9]+(?:\.[0-9]+)?)(?:\s{2,}[0-9]+(?:\.[0-9]+)?)*$/;

function genericParse(lines) {
  const text = lines.join('\n');
  const note = {};
  for (const re of NOTE_RES) {
    const m = text.match(re);
    if (m) { note.note = m[1]; break; }
  }
  const date = text.match(DATE_RE);
  if (date) note.date = date[1];
  note.supplier = (lines.find((l) => l.trim().length >= 3) || '')
    .replace(/\s*(?:Delivery|Despatch)\s*Note\s*$/i, '')  // letterhead lines often end with the doc title
    .trim();

  // the longest run of consecutive item-shaped lines is taken as the table
  let best = [];
  let run = [];
  for (const raw of [...lines, '']) {
    const m = raw.match(ITEM_RE);
    if (m && !/^(CODE|ITEM|PRODUCT)\b/i.test(raw)) {
      run.push({ code: m[1], desc: m[2], qty: parseFloat(m[3]) });
    } else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  note.items = best;

  const missing = ['note', 'date', 'supplier'].filter((f) => !note[f]);
  if (note.items.length === 0) missing.push('items');
  if (missing.length > 0) {
    throw new Error(`no supplier template matched and generic parsing could not find: ${missing.join(', ')}`);
  }
  return note;
}

module.exports = { loadTemplates, selectTemplate, applyTemplate, genericParse };
