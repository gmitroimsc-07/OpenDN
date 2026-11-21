// Files that ship with OpenDN: supplier templates, the CUPS backend and PPD.
// Run from source, they are read from the repository. In the single-file
// executable (scripts/build.js) they are embedded at build time, because
// the build machine's paths do not exist on the user's computer.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EMBEDDED = globalThis.__OPENDN_EMBEDDED__ || null;

/** True inside the single-file executable. */
function packaged() {
  return EMBEDDED !== null;
}

/** Text of a shipped file, by repository-relative path ('printer/opendn.ppd'). */
function readAsset(rel) {
  if (EMBEDDED) {
    if (!Object.prototype.hasOwnProperty.call(EMBEDDED, rel)) throw new Error(`file not embedded in this build: ${rel}`);
    return EMBEDDED[rel];
  }
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Repository-relative paths of the shipped files in one folder, sorted. */
function listAssets(dir) {
  if (EMBEDDED) return Object.keys(EMBEDDED).filter((k) => k.startsWith(`${dir}/`)).sort();
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).sort().map((f) => `${dir}/${f}`);
}

/** Copy shipped files of one folder into dest, never overwriting the user's files. */
function copyAssets(dir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const written = [];
  for (const rel of listAssets(dir)) {
    const target = path.join(dest, path.basename(rel));
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, readAsset(rel));
    written.push(target);
  }
  return written;
}

/** Command that runs this same OpenDN: [exe] when packaged, [node, bin/opendn.js] from source. */
function selfCommand(exePath = process.execPath) {
  return packaged() ? [exePath] : [process.execPath, path.join(ROOT, 'bin', 'opendn.js')];
}

module.exports = { packaged, readAsset, listAssets, copyAssets, selfCommand };
