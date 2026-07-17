// Backend test: exercises printer/opendn-backend exactly as CUPS would call
// it (arguments, DEVICE_URI, stdin/file modes) — no root, no CUPS daemon
// needed, so it runs in CI. The end product of the backend is a PDF in the
// watch folder, so the last check hands a captured job to the watcher.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { brightmoorPdf } = require('./fixtures');
const { loadConfig } = require('../src/config');
const { watch } = require('../src/watch');
const { serviceUnit, winInstallScript, winUninstallScript, winStatusScript } = require('../src/printer');

const BACKEND = path.join(__dirname, '..', 'printer', 'opendn-backend');

function runBackend(args, { dest, stdin } = {}) {
  return execFileSync('sh', [BACKEND, ...args], {
    env: { ...process.env, DEVICE_URI: dest === undefined ? '' : `opendn:${dest}` },
    input: stdin,
    encoding: stdin && Buffer.isBuffer(stdin) ? undefined : 'utf8',
  });
}

(async () => {
  const root = path.join(__dirname, 'out', 'printer');
  fs.rmSync(root, { recursive: true, force: true });
  const dest = path.join(root, 'in');

  // 1. discovery mode (CUPS calls with no arguments at startup)
  const discovery = runBackend([]);
  assert.ok(discovery.startsWith('file opendn:/'), 'discovery line advertised');
  console.log('discovery mode OK');

  // 2. capture via stdin (5 args) — like a real filtered job
  const pdfBytes = await brightmoorPdf();
  runBackend(['42', 'mgi', 'Delivery Note: DN 123/45', '1', ''], { dest, stdin: pdfBytes });
  let files = fs.readdirSync(dest);
  assert.strictEqual(files.length, 1, 'one file captured');
  assert.ok(/^\d{8}-\d{6}-Delivery_Note_DN_123_45\.pdf$/.test(files[0]), `title sanitised: ${files[0]}`);
  assert.deepStrictEqual(fs.readFileSync(path.join(dest, files[0])), pdfBytes, 'captured byte-identical');
  console.log('stdin capture OK (title sanitised, byte-identical)');

  // 3. capture via file argument (6 args) + collision-safe naming
  const jobFile = path.join(root, 'job.pdf');
  fs.writeFileSync(jobFile, pdfBytes);
  runBackend(['43', 'mgi', 'Delivery Note: DN 123/45', '1', '', jobFile], { dest });
  runBackend(['44', 'mgi', 'Delivery Note: DN 123/45', '1', '', jobFile], { dest });
  files = fs.readdirSync(dest);
  assert.strictEqual(files.length, 3, 'three captures, three files (no overwrite)');
  assert.ok(files.every((f) => f.endsWith('.pdf')), 'no .part files left behind');
  console.log('file-argument capture + unique naming OK');

  // 4. bad invocations fail loudly, good exit codes
  assert.throws(() => runBackend(['1', 'u', 't'], { dest }), 'too few arguments rejected');
  assert.throws(() => runBackend(['1', 'u', 't', '1', ''], { dest: undefined }), 'missing DEVICE_URI rejected');
  assert.throws(() => runBackend(['1', 'u', 't', '1', ''], { dest: '/' }), 'empty capture folder rejected');
  console.log('error handling OK');

  // 5. a captured job flows through the watcher end to end
  const cfg = loadConfig(null, {
    input: dest,
    output: path.join(root, 'out'),
    templates: path.join(__dirname, '..', 'templates'),
  });
  const results = await watch(cfg, { once: true, log: () => {} });
  assert.strictEqual(results.processed.length, 3, 'all captured jobs stamped');
  assert.strictEqual(results.processed[0].note.note, 'DN10245876', 'captured job parsed by template');
  console.log('printer → watcher → stamped PDF OK');

  // 6. the watcher-service unit file is generated correctly
  const unit = serviceUnit({ nodeBin: '/usr/bin/node', opendnBin: '/opt/opendn/bin/opendn.js', input: '/data/in', output: '/data/out' });
  assert.ok(unit.includes('ExecStart=/usr/bin/node /opt/opendn/bin/opendn.js watch /data/in /data/out'), 'ExecStart wired');
  assert.ok(unit.includes('Restart=on-failure'), 'service restarts on failure');
  assert.ok(unit.includes('WantedBy=default.target'), 'starts at login');
  console.log('service unit generation OK');

  // 7. Windows PowerShell script generation (scripts run on Windows only;
  //    their construction is verified everywhere)
  const win = {
    name: 'OpenDN',
    input: 'C:\\opendn\\in',
    output: 'C:\\opendn\\out',
    port: 'C:\\opendn\\in\\capture.pdf',
    nodeBin: 'C:\\Program Files\\nodejs\\node.exe',
    opendnBin: 'C:\\opendn\\OpenDN\\bin\\opendn.js',
  };
  const ps = winInstallScript(win);
  assert.ok(ps.includes("Add-PrinterPort -Name 'C:\\opendn\\in\\capture.pdf'"), 'file-path port added');
  assert.ok(ps.includes("-DriverName 'Microsoft Print To PDF'"), 'built-in PDF driver used');
  assert.ok(ps.includes("New-ScheduledTaskAction -Execute 'C:\\Program Files\\nodejs\\node.exe'"), 'spaces in node path survive');
  assert.ok(ps.includes('watch "C:\\opendn\\in" "C:\\opendn\\out"'), 'engine watches the right folders');
  assert.ok(ps.includes('WindowsBuiltInRole]::Administrator'), 'elevation is checked');
  assert.ok(winUninstallScript({ name: 'OpenDN' }).includes('Unregister-ScheduledTask'), 'uninstall removes the task');
  assert.ok(winStatusScript({ name: 'OpenDN' }).includes('Get-Printer'), 'status queries the printer');
  assert.throws(() => winInstallScript({ ...win, input: "C:\\o'; Remove-Item x" }), 'quote injection rejected');
  console.log('Windows install/uninstall/status script generation OK');

  console.log('\nall printer tests passed');
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
