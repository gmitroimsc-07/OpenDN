// opendn.config.json — folders, template dir, QR size, filename pattern.
// CLI arguments override file values; file values override defaults.
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  input: 'in',
  output: 'out',
  archive: null,        // default: <output>/archive
  review: null,         // default: <output>/review
  templates: 'templates',
  qrMm: 40,
  page: 1,
  writePayload: true,   // also save <name>.payload.txt next to the stamped PDF
  stampedSuffix: '.stamped',
};

/**
 * Merge defaults ← config file ← overrides, resolving paths against the
 * config file's directory (so a config travels with its folders) or cwd.
 */
function loadConfig(configPath, overrides = {}) {
  let fileValues = {};
  let baseDir = process.cwd();
  const file = configPath || (fs.existsSync('opendn.config.json') ? 'opendn.config.json' : null);
  if (file) {
    if (!fs.existsSync(file)) throw new Error(`config file not found: ${file}`);
    try { fileValues = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`bad config ${file}: ${e.message}`); }
    baseDir = path.dirname(path.resolve(file));
  }

  const unknown = Object.keys(fileValues).filter((k) => !(k in DEFAULTS));
  if (unknown.length > 0) throw new Error(`unknown config option(s): ${unknown.join(', ')}`);

  const cfg = { ...DEFAULTS, ...fileValues, ...prune(overrides) };
  for (const key of ['input', 'output', 'templates']) {
    cfg[key] = path.resolve(baseDir, cfg[key]);
  }
  cfg.archive = path.resolve(baseDir, cfg.archive || path.join(cfg.output, 'archive'));
  cfg.review = path.resolve(baseDir, cfg.review || path.join(cfg.output, 'review'));
  if (!(cfg.qrMm >= 40)) throw new Error('qrMm must be >= 40 (codes must survive damaged paper)');
  return cfg;
}

function prune(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

module.exports = { loadConfig, DEFAULTS };
