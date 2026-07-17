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
 * root and it can write into the user's folder) + queue via lpadmin + the
 * watcher as a background service, so after install there is nothing else
 * to run: print to "OpenDN", collect the stamped PDF from the output folder.
 */
function install({ name = 'OpenDN', input, output }) {
  requireRoot('install');
  checkCups();
  if (!input) throw new Error('an input folder is required: opendn printer install --input <dir>');
  input = path.resolve(input);
  output = path.resolve(output || path.join(path.dirname(input), 'out'));
  for (const dir of [input, output]) {
    if (/[\s%#?]/.test(dir)) {
      throw new Error(`folder paths may not contain spaces or %#? (they become a device URI): ${dir}`);
    }
  }

  // under sudo, the folders belong to the user who prints, not to root
  const uid = process.env.SUDO_UID ? parseInt(process.env.SUDO_UID, 10) : null;
  const gid = process.env.SUDO_GID ? parseInt(process.env.SUDO_GID, 10) : null;
  for (const dir of [input, output]) {
    fs.mkdirSync(dir, { recursive: true });
    if (uid !== null) fs.chownSync(dir, uid, gid || 0);
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

  const service = installService({ input, output, uid, gid });
  return { name, input, output, backend: BACKEND_PATH, service };
}

// ---------------------------------------------------------------------------
// Background service: the engine that turns captured jobs into stamped PDFs.
// A systemd *user* unit for the person who ran sudo — it runs as them, in
// their session, and starts at every login.

const SERVICE_NAME = 'opendn-watch.service';

/** The unit file text — exported for tests. */
function serviceUnit({ nodeBin, opendnBin, input, output }) {
  return `[Unit]
Description=OpenDN watcher — stamps PDFs captured by the OpenDN printer

[Service]
ExecStart=${nodeBin} ${opendnBin} watch ${input} ${output}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function installService({ input, output, uid, gid }) {
  const user = process.env.SUDO_USER;
  if (process.platform !== 'linux' || !user || uid === null) {
    return { installed: false, why: 'no systemd user session (run the watcher yourself: opendn watch)' };
  }
  try {
    const home = execFileSync('getent', ['passwd', user], { encoding: 'utf8' }).split(':')[5];
    const unitDir = path.join(home, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    const unitPath = path.join(unitDir, SERVICE_NAME);
    fs.writeFileSync(unitPath, serviceUnit({
      nodeBin: process.execPath,
      opendnBin: path.join(__dirname, '..', 'bin', 'opendn.js'),
      input, output,
    }));
    // the unit dir may have been created by us as root — hand it to the user
    for (let dir = unitPath; dir !== home; dir = path.dirname(dir)) fs.chownSync(dir, uid, gid || 0);
    userSystemctl(user, uid, ['daemon-reload']);
    userSystemctl(user, uid, ['enable', '--now', SERVICE_NAME]);
    return { installed: true, unit: unitPath };
  } catch (e) {
    return { installed: false, why: e.message };
  }
}

function removeService() {
  const user = process.env.SUDO_USER;
  const uid = process.env.SUDO_UID ? parseInt(process.env.SUDO_UID, 10) : null;
  if (process.platform !== 'linux' || !user || uid === null) return false;
  try {
    userSystemctl(user, uid, ['disable', '--now', SERVICE_NAME]);
    const home = execFileSync('getent', ['passwd', user], { encoding: 'utf8' }).split(':')[5];
    fs.rmSync(path.join(home, '.config', 'systemd', 'user', SERVICE_NAME), { force: true });
    userSystemctl(user, uid, ['daemon-reload']);
    return true;
  } catch {
    return false;
  }
}

/** Run `systemctl --user …` as the sudo-invoking user, in their session bus. */
function userSystemctl(user, uid, args) {
  execFileSync('runuser', ['-u', user, '--', 'systemctl', '--user', ...args], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: `/run/user/${uid}`,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${uid}/bus`,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

/** Remove queue + watcher service; remove the backend once no queue is left. */
function uninstall({ name = 'OpenDN' } = {}) {
  requireRoot('uninstall');
  execFileSync('lpadmin', ['-x', name], { stdio: ['ignore', 'inherit', 'inherit'] });
  const serviceRemoved = removeService();
  const others = listQueues().filter((q) => q.name !== name);
  if (others.length === 0 && fs.existsSync(BACKEND_PATH)) fs.unlinkSync(BACKEND_PATH);
  return { name, backendRemoved: others.length === 0, serviceRemoved };
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
  let service = 'unknown';
  try {
    service = execFileSync('systemctl', ['--user', 'is-active', SERVICE_NAME], { encoding: 'utf8' }).trim();
  } catch (e) {
    service = (e.stdout || '').trim() || 'not installed';
  }
  return { queue, queues, backendInstalled: fs.existsSync(BACKEND_PATH), service };
}

module.exports = { install, uninstall, status, listQueues, serviceUnit, BACKEND_PATH };
