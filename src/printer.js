// The OpenDN virtual printer (Milestone 2): registers a print queue that
// drops every job, rendered to PDF, into the watch folder, and starts the
// stamping engine in the background. Print anything to "OpenDN" from any
// application; non-delivery-notes fail-open to review/ as ordinary PDFs.
//
// Folder layout (from --input): <base>/in (capture), <base>/out (stamped
// PDFs), <base>/templates (supplier templates, seeded with the built-in set).
//
// Linux/macOS: CUPS backend + queue, engine as a systemd user service.
// Windows: printer port that is a file path + the built-in "Microsoft
//   Print To PDF" driver + engine as a hidden Scheduled Task. Known
//   limitation: all jobs capture to one filename (capture.pdf), so the
//   job title is lost and truly simultaneous prints can collide — the
//   engine clears the file within seconds. A local IPP server (Milestone
//   3 technology) will lift this.
//
// The single-file executable installs itself first (C:\Program Files\OpenDN
// or /usr/local/bin/opendn), so the background engine never depends on the
// copy the user downloaded.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { packaged, readAsset, copyAssets, selfCommand } = require('./assets');

function install(opts) { return process.platform === 'win32' ? winInstall(opts) : cupsInstall(opts); }
function uninstall(opts) { return process.platform === 'win32' ? winUninstall(opts) : cupsUninstall(opts); }
function status(opts) { return process.platform === 'win32' ? winStatus(opts) : cupsStatus(opts); }

/** in/out/templates folders: --output and --templates default to siblings of --input. */
function layout({ input, output, templates }, p = path) {
  if (!input) throw new Error('an input folder is required: opendn printer install --input <dir>');
  input = p.resolve(input);
  const base = p.dirname(input);
  return {
    input,
    output: p.resolve(output || p.join(base, 'out')),
    templates: p.resolve(templates || p.join(base, 'templates')),
  };
}

// ---------------------------------------------------------------------------
// Linux/macOS — CUPS

const BACKEND_DIR = '/usr/lib/cups/backend';
const BACKEND_PATH = path.join(BACKEND_DIR, 'opendn');
const UNIX_BIN = '/usr/local/bin/opendn';

function requireRoot(action) {
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    throw new Error(`${action} registers a CUPS backend — run it with sudo:\n  sudo opendn printer ${action} ...`);
  }
}

function checkCups() {
  if (!fs.existsSync(BACKEND_DIR)) {
    throw new Error(`${BACKEND_DIR} not found — is CUPS installed?`);
  }
}

/**
 * Install the virtual printer: backend (0700 root:root, so CUPS runs it as
 * root and it can write into the user's folder) + queue via lpadmin + the
 * watcher as a background service, so after install there is nothing else
 * to run: print to "OpenDN", collect the stamped PDF from the output folder.
 */
function cupsInstall({ name = 'OpenDN', input, output, templates }) {
  requireRoot('install');
  checkCups();
  const dirs = layout({ input, output, templates });
  for (const dir of Object.values(dirs)) {
    if (/[\s%#?]/.test(dir)) {
      throw new Error(`folder paths may not contain spaces or %#? (they become a device URI): ${dir}`);
    }
  }

  // under sudo, the folders belong to the user who prints, not to root
  const uid = process.env.SUDO_UID ? parseInt(process.env.SUDO_UID, 10) : null;
  const gid = process.env.SUDO_GID ? parseInt(process.env.SUDO_GID, 10) : null;
  const giveToUser = (p) => { if (uid !== null) fs.chownSync(p, uid, gid || 0); };
  for (const dir of [dirs.input, dirs.output, dirs.templates]) {
    fs.mkdirSync(dir, { recursive: true });
    giveToUser(dir);
  }
  copyAssets('templates', dirs.templates).forEach(giveToUser);

  fs.writeFileSync(BACKEND_PATH, readAsset('printer/opendn-backend'));
  fs.chownSync(BACKEND_PATH, 0, 0);
  fs.chmodSync(BACKEND_PATH, 0o700);

  // lpadmin needs the PPD as a file; in the executable it lives in memory
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendn-'));
  try {
    const ppd = path.join(tmp, 'opendn.ppd');
    fs.writeFileSync(ppd, readAsset('printer/opendn.ppd'));
    execFileSync('lpadmin', [
      '-p', name, '-E',
      '-v', `opendn:${dirs.input}`,
      '-P', ppd,
      '-D', 'OpenDN delivery-note capture',
      '-o', 'printer-error-policy=retry-current-job',
    ], { stdio: ['ignore', 'inherit', 'inherit'] });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const command = installProgram();
  const service = installService({ ...dirs, command, uid, gid });
  return { name, ...dirs, program: command[0], backend: BACKEND_PATH, service };
}

/**
 * Where the background engine runs from. From source: node + this checkout.
 * Packaged: a copy of the executable at a fixed system location.
 */
function installProgram() {
  if (!packaged()) return selfCommand();
  if (process.platform === 'win32') return [winInstallExe()];
  if (path.resolve(process.execPath) !== UNIX_BIN) {
    const tmp = `${UNIX_BIN}.new`;
    fs.mkdirSync(path.dirname(UNIX_BIN), { recursive: true });
    fs.copyFileSync(process.execPath, tmp);
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, UNIX_BIN); // atomic: safe while an older copy is running
  }
  return [UNIX_BIN];
}

// ---------------------------------------------------------------------------
// Background service: the engine that turns captured jobs into stamped PDFs.
// A systemd *user* unit for the person who ran sudo — it runs as them, in
// their session, and starts at every login.

const SERVICE_NAME = 'opendn-watch.service';

/** The unit file text — exported for tests. */
function serviceUnit({ command, input, output, templates }) {
  const exec = [...command, 'watch', input, output, '--templates', templates].join(' ');
  return `[Unit]
Description=OpenDN watcher — stamps PDFs captured by the OpenDN printer

[Service]
ExecStart=${exec}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function installService({ input, output, templates, command, uid, gid }) {
  const user = process.env.SUDO_USER;
  if (process.platform !== 'linux' || !user || uid === null) {
    return { installed: false, why: 'no systemd user session (run the watcher yourself: opendn watch)' };
  }
  try {
    const home = execFileSync('getent', ['passwd', user], { encoding: 'utf8' }).split(':')[5];
    const unitDir = path.join(home, '.config', 'systemd', 'user');
    fs.mkdirSync(unitDir, { recursive: true });
    const unitPath = path.join(unitDir, SERVICE_NAME);
    fs.writeFileSync(unitPath, serviceUnit({ command, input, output, templates }));
    // the unit dir may have been created by us as root — hand it to the user
    for (let dir = unitPath; dir !== home; dir = path.dirname(dir)) fs.chownSync(dir, uid, gid || 0);
    userSystemctl(user, uid, ['daemon-reload']);
    userSystemctl(user, uid, ['enable', SERVICE_NAME]);
    userSystemctl(user, uid, ['restart', SERVICE_NAME]); // picks up a new program or folders
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
function cupsUninstall({ name = 'OpenDN' } = {}) {
  requireRoot('uninstall');
  execFileSync('lpadmin', ['-x', name], { stdio: ['ignore', 'inherit', 'inherit'] });
  const serviceRemoved = removeService();
  const others = listQueues().filter((q) => q.name !== name);
  if (others.length === 0 && fs.existsSync(BACKEND_PATH)) fs.unlinkSync(BACKEND_PATH);
  return {
    name, backendRemoved: others.length === 0, serviceRemoved,
    leftInPlace: fs.existsSync(UNIX_BIN) ? [UNIX_BIN] : [],
  };
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

function cupsStatus({ name = 'OpenDN' } = {}) {
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

// ---------------------------------------------------------------------------
// Windows — built-in "Microsoft Print To PDF" driver + a printer port that
// is a file path (so no save dialog), engine as a SYSTEM Scheduled Task.
// Everything is driven through PowerShell; the script generators are pure
// functions so they can be tested on any platform.

const WIN_TASK = 'OpenDN Watch';
const WIN_DRIVER = 'Microsoft Print To PDF';
const USERS_SID = '*S-1-5-32-545'; // BUILTIN\Users, the same in every Windows language

/**
 * A PowerShell single-quoted string literal. Inside one, only quote
 * characters are special — PowerShell treats the typographic ‘’‚‛ as
 * quotes too — and each is escaped by doubling it.
 */
function psq(value, what = 'value') {
  value = String(value);
  if (/[\r\n\0]/.test(value)) throw new Error(`${what} may not contain line breaks: ${value}`);
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, (q) => q + q)}'`;
}

/** One argument of a Windows command line, double-quoted. */
function cmdArg(value) {
  value = String(value);
  if (value.includes('"')) throw new Error(`argument may not contain double quotes: ${value}`);
  // a trailing backslash would escape the closing quote
  return `"${value.endsWith('\\') ? `${value}\\` : value}"`;
}

function winInstallScript({ name, input, output, templates, port, command }) {
  const args = [
    ...command.slice(1).map(cmdArg),
    'watch', cmdArg(input), cmdArg(output), '--templates', cmdArg(templates),
  ].join(' ');
  const folders = [input, output, templates].map((d) => psq(d, 'folder')).join(', ');
  return `$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'opendn printer install must be run as administrator'
}
foreach ($d in @(${folders})) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  & icacls $d /grant '${USERS_SID}:(OI)(CI)M' | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Error ('could not grant users access to ' + $d) }
}
if (-not (Get-PrinterPort -Name ${psq(port, 'port')} -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name ${psq(port, 'port')}
}
if (-not (Get-Printer -Name ${psq(name, 'printer name')} -ErrorAction SilentlyContinue)) {
  Add-Printer -Name ${psq(name, 'printer name')} -DriverName ${psq(WIN_DRIVER)} -PortName ${psq(port, 'port')}
}
$action = New-ScheduledTaskAction -Execute ${psq(command[0], 'program')} -Argument ${psq(args, 'arguments')}
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName ${psq(WIN_TASK)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Stop-ScheduledTask -TaskName ${psq(WIN_TASK)} -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName ${psq(WIN_TASK)}
Write-Output 'installed'
`;
}

function winUninstallScript({ name }) {
  return `$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName ${psq(WIN_TASK)} -Confirm:$false -ErrorAction SilentlyContinue
$p = Get-Printer -Name ${psq(name, 'printer name')} -ErrorAction SilentlyContinue
if ($p) {
  $port = $p.PortName
  Remove-Printer -Name ${psq(name, 'printer name')}
  Start-Sleep -Seconds 1
  Remove-PrinterPort -Name $port -ErrorAction SilentlyContinue
}
Write-Output 'removed'
`;
}

function winStatusScript({ name }) {
  return `$p = Get-Printer -Name ${psq(name, 'printer name')} -ErrorAction SilentlyContinue
if ($p) { Write-Output ('printer "' + $p.Name + '" -> ' + $p.PortName) } else { Write-Output ('no ' + ${psq(name)} + ' printer installed') }
$t = Get-ScheduledTask -TaskName ${psq(WIN_TASK)} -ErrorAction SilentlyContinue
if ($t) { Write-Output ('background engine: ' + $t.State + ' (' + $t.Actions[0].Execute + ')') } else { Write-Output 'background engine: not installed' }
`;
}

const WIN_ADMIN_SCRIPT = `$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if ($id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'admin' } else { 'user' }`;

function powershell(script) {
  return execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function winRequireAdmin(action) {
  if (powershell(WIN_ADMIN_SCRIPT).trim() !== 'admin') {
    throw new Error(`printer ${action} must be run as administrator (right-click the terminal → Run as administrator), or double-click opendn.exe`);
  }
}

function winProgramPath() {
  return path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenDN', 'opendn.exe');
}

/** Copy the running executable to Program Files; returns its new path. */
function winInstallExe() {
  const dest = winProgramPath();
  if (path.resolve(process.execPath).toLowerCase() === dest.toLowerCase()) return dest;
  // stop the engine so the copy it runs from can be replaced
  try { powershell(`Stop-ScheduledTask -TaskName ${psq(WIN_TASK)} -ErrorAction SilentlyContinue`); } catch { /* not installed */ }
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir).filter((n) => n.startsWith('opendn.exe.old'))) {
    try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* still locked: next time */ }
  }
  // a running exe can be renamed but not overwritten
  if (fs.existsSync(dest)) fs.renameSync(dest, `${dest}.old-${Date.now()}`);
  fs.copyFileSync(process.execPath, dest);
  return dest;
}

function winInstall({ name = 'OpenDN', input, output, templates }) {
  winRequireAdmin('install');
  const dirs = layout({ input, output, templates });
  const port = path.join(dirs.input, 'capture.pdf');
  const command = installProgram();
  copyAssets('templates', dirs.templates);
  powershell(winInstallScript({ name, ...dirs, port, command }));
  return {
    name, ...dirs, program: command[0],
    service: { installed: true, unit: `Scheduled Task "${WIN_TASK}"` },
  };
}

function winUninstall({ name = 'OpenDN' } = {}) {
  winRequireAdmin('uninstall');
  powershell(winUninstallScript({ name }));
  const program = winProgramPath();
  return {
    name, backendRemoved: true, serviceRemoved: true,
    leftInPlace: fs.existsSync(program) ? [path.dirname(program)] : [],
  };
}

function winStatus({ name = 'OpenDN' } = {}) {
  return { raw: powershell(winStatusScript({ name })).trim() };
}

module.exports = {
  install, uninstall, status, listQueues, layout, serviceUnit, BACKEND_PATH,
  winInstallScript, winUninstallScript, winStatusScript, psq,
};
