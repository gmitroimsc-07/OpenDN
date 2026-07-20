// OpenDN v1 payload — build and parse the plain-text delivery-note format.
// Spec: ../docs/payload-spec.md
'use strict';

const FORMAT_LINE = 'OpenDN v1';

// Practical single-QR ceiling at error-correction level Q. Version 40 at Q
// holds 1,663 bytes, but codes that dense scan poorly at label sizes.
const MAX_PAYLOAD_CHARS = 1400;

const HEADER_KEYS = [
  ['note', 'NOTE'],
  ['date', 'DATE'],
  ['supplier', 'SUPPLIER'],
  ['customer', 'CUSTOMER'],
  ['deliverTo', 'DELIVER-TO'],
  ['ref', 'REF'],
  ['custRef', 'CUST-REF'],
  ['account', 'ACCOUNT'],
];

function clean(value) {
  return String(value).replace(/[\r\n|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function has(value) {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Build a OpenDN v1 payload string from a note object.
 * Required: note, date, supplier, items (array of {code, desc, qty}).
 * Optional: customer, deliverTo, ref, custRef, account, weightKg.
 */
function buildPayload(note) {
  for (const field of ['note', 'date', 'supplier']) {
    if (!note[field]) throw new Error(`missing required field "${field}"`);
  }
  if (!Array.isArray(note.items) || note.items.length === 0) {
    throw new Error('missing required field "items" (non-empty array)');
  }

  const lines = [FORMAT_LINE];
  for (const [prop, key] of HEADER_KEYS) {
    if (note[prop] !== undefined && note[prop] !== null && note[prop] !== '') {
      lines.push(`${key}: ${clean(note[prop])}`);
    }
  }
  lines.push(`ITEMS: ${note.items.length}`);
  for (const it of note.items) {
    if (!it.code || !it.desc || it.qty === undefined) {
      throw new Error('each item needs code, desc and qty');
    }
    if (has(it.kgCO2e) && !has(it.kg)) {
      throw new Error(`item ${it.code}: kgCO2e requires kg (grammar: qty [| kg [| kgCO2e]])`);
    }
    let line = `${clean(it.code)} | ${clean(it.desc)} | ${clean(it.qty)}`;
    if (has(it.kg)) line += ` | ${clean(it.kg)}`;
    if (has(it.kgCO2e)) line += ` | ${clean(it.kgCO2e)}`;
    lines.push(line);
  }
  if (has(note.weightKg)) lines.push(`WEIGHT-KG: ${clean(note.weightKg)}`);
  if (has(note.co2eKg)) lines.push(`CO2E-KG: ${clean(note.co2eKg)}`);

  const payload = lines.join('\n');
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error(
      `payload is ${payload.length} chars (max ${MAX_PAYLOAD_CHARS} for one scannable QR). ` +
      'Shorten item descriptions or split the note across two codes.'
    );
  }
  return payload;
}

/**
 * Parse a OpenDN v1 payload string back into a note object.
 * This is the reference parser for receiving platforms.
 */
function parsePayload(text) {
  const lines = String(text).replace(/\r/g, '').trim().split('\n');
  if (lines[0].trim() !== FORMAT_LINE) {
    throw new Error(`not a OpenDN v1 payload (first line must be "${FORMAT_LINE}")`);
  }

  const note = { format: FORMAT_LINE, items: [] };
  const keyToProp = Object.fromEntries(HEADER_KEYS.map(([p, k]) => [k, p]));
  let declaredItems = null;

  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    const kv = line.match(/^([A-Z0-9-]+):\s*(.*)$/);
    if (kv && kv[1] === 'ITEMS') { declaredItems = parseInt(kv[2], 10); continue; }
    if (kv && kv[1] === 'WEIGHT-KG') { note.weightKg = parseFloat(kv[2]); continue; }
    if (kv && kv[1] === 'CO2E-KG') { note.co2eKg = parseFloat(kv[2]); continue; }
    if (kv && keyToProp[kv[1]]) { note[keyToProp[kv[1]]] = kv[2]; continue; }
    // unknown KEY: lines are ignored (future versions may add keys) — but a
    // pipe means it's really an item line whose code contains a colon
    if (kv && !line.includes('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length >= 3 && parts.length <= 5) {
      const item = { code: parts[0], desc: parts[1], qty: parseFloat(parts[2]) };
      if (parts.length >= 4) item.kg = parseFloat(parts[3]);
      if (parts.length === 5) item.kgCO2e = parseFloat(parts[4]);
      note.items.push(item);
      continue;
    }
    throw new Error(`unrecognised line: "${line}"`);
  }

  if (declaredItems !== null && declaredItems !== note.items.length) {
    throw new Error(`ITEMS declares ${declaredItems} lines but ${note.items.length} found — payload may be truncated`);
  }
  return note;
}

module.exports = { buildPayload, parsePayload, FORMAT_LINE, MAX_PAYLOAD_CHARS };
