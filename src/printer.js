// The OpenDN virtual printer (Milestone 2, CUPS — Linux/macOS): registers a
// print queue whose backend drops every job, rendered to PDF by CUPS, into
// the watch folder. Print anything to "OpenDN" from any application and
// `opendn watch` stamps it; non-delivery-notes fail-open to review/ as
// ordinary PDFs. The Windows port (XPS port monitor) is still on the roadmap.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BACKEND_DIR = '/usr/lib/cups/backend';
const BACKEND_PATH = path.join(BACKEND_DIR, 'opendn');
const BACKEND_SRC = path.join(__dirname, '..', 'printer', 'opendn-backend');
const PPD_SRC = path.join(__dirname, '..', 'printer', 'opendn.ppd');

function requireRoot(action) {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    throw new Error(`${action} registers a CUPS backend — run it with sudo:\n  sudo opendn printer ${action} ...`);
  }
}

function checkCups() {
  if (!fs.existsSync(BACKEND_DIR)) {
    throw new Error(`${BACKEND_DIR} not found — is CUPS installed? (Linux/macOS only; Windows port is on the roadmap)`);
  }
}

/**
 * Install the virtual printer: backend (0700 root:root, so CUPS runs it as
 * root and it can write into the user's folder) + queue via lpadmin.
 */
function install({ name = 'OpenDN', input }) {
  requireRoot('install');
  checkCups();
  if (!input) throw new Error('an input folder is required: opendn printer install --input <dir>');
  input = path.resolve(input);
  if (/[\s%#?]/.test(input)) {
    throw new Error(`input folder path may not contain spaces or %#? (it becomes a device URI): ${input}`);
  }

  fs.mkdirSync(input, { recursive: true });
  // under sudo, the folder should belong to the user who will run the watcher
  if (process.env.SUDO_UID) {
    fs.chownSync(input, parseInt(process.env.SUDO_UID, 10), parseInt(process.env.SUDO_GID || '0', 10));
  }

  fs.copyFileSync(BACKEND_SRC, BACKEND_PATH);
  fs.chownSync(BACKEND_PATH, 0, 0);
  fs.chmodSync(BACKEND_PATH, 0o700);

  execFileSync('lpadmin', [
    '-p', name, '-E',
    '-v', `opendn:${input}`,
    '-P', PPD_SRC,
    '-D', 'OpenDN delivery-note capture',
    '-o', 'printer-error-policy=retry-current-job',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  return { name, input, backend: BACKEND_PATH };
}

/** Remove the queue; remove the backend too once no opendn queue is left. */
function uninstall({ name = 'OpenDN' } = {}) {
  requireRoot('uninstall');
  execFileSync('lpadmin', ['-x', name], { stdio: ['ignore', 'inherit', 'inherit'] });
  const others = listQueues().filter((q) => q.name !== name);
  if (others.length === 0 && fs.existsSync(BACKEND_PATH)) fs.unlinkSync(BACKEND_PATH);
  return { name, backendRemoved: others.length === 0 };
}

/** All CUPS queues whose device URI uses the opendn backend. */
function listQueues() {
  let out = '';
  try { out = execFileSync('lpstat', ['-v'], { encoding: 'utf8' }); }
  catch { return []; }
  const queues = [];
  for (const line of out.split('\n')) {
    const m = line.match(/^device for ([^:]+): opendn:(.*)$/);
    if (m) queues.push({ name: m[1], input: m[2] });
  }
  return queues;
}

function status({ name = 'OpenDN' } = {}) {
  const queues = listQueues();
  const queue = queues.find((q) => q.name === name) || null;
  return { queue, queues, backendInstalled: fs.existsSync(BACKEND_PATH) };
}

module.exports = { install, uninstall, status, listQueues, BACKEND_PATH };
