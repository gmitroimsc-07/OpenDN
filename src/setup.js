// Double-click setup for the Windows executable. Opening opendn.exe with no
// arguments shows a short menu in its console window; the actual install
// runs in an elevated copy of the same exe, so Windows shows its normal
// administrator prompt and nothing happens without the user's "Yes".
'use strict';

const readline = require('readline');
const { execFileSync } = require('child_process');
const { psq } = require('./printer');

const BASE = 'C:\\opendn';

function ask(question) {
  // The executable's runtime (Bun) has a synchronous prompt(); its stdin
  // streams proved unreliable on Windows consoles, so prefer it there.
  if (typeof globalThis.prompt === 'function') {
    const answer = globalThis.prompt(question.trimEnd());
    return Promise.resolve((answer || '').trim());
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** Re-run this exe as administrator in a new window (the UAC prompt). */
function elevate(args) {
  const argLine = args.map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ');
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Start-Process -FilePath ${psq(process.execPath)} -ArgumentList ${psq(argLine)} -Verb RunAs`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function currentStatus() {
  let raw = '';
  try { raw = require('./printer').status({ name: 'OpenDN' }).raw; } catch { /* reported below */ }
  if (!raw) return '    (could not read the current state)';
  return raw.split('\n').map((l) => `    ${l.trim()}`).join('\n');
}

async function windowsSetup(version) {
  console.log(`
  OpenDN ${version} — the delivery-note QR printer

  This sets up a printer called "OpenDN" on this PC. Print a delivery note
  to it from any program and a copy carrying the OpenDN QR code is saved
  automatically to ${BASE}\\out. Your normal printers are not touched.

  Right now:
${currentStatus()}

    Enter   install (or repair) — Windows will ask for permission
    U       uninstall
    Q       quit
`);
  const choice = (await ask('  Your choice: ')).toLowerCase();
  if (choice === 'q') return;
  const args = choice === 'u'
    ? ['printer', 'uninstall', '--pause']
    : ['printer', 'install', '--input', `${BASE}\\in`, '--pause'];
  try {
    elevate(args);
    console.log('\n  Continue in the administrator window that just opened.');
  } catch {
    console.log('\n  Cancelled — Windows permission was not given, nothing was changed.');
  }
  await ask('\n  Press Enter to close this window. ');
}

module.exports = { windowsSetup, ask };
