// Single-file executable test: runs a built opendn binary from an empty
// folder outside the repository — so nothing can fall back on the source
// tree or on Node — and checks it behaves exactly like the source version.
//
//   node test/exe.js dist/opendn-linux-x64
//   OPENDN_EXE_RUNNER=wine node test/exe.js dist/opendn-windows-x64.exe
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { brightmoorPdf, unknownSupplierPdf, noTextPdf } = require('./fixtures');

const exe = path.resolve(process.argv[2] || process.env.OPENDN_EXE || '');
if (!process.argv[2] && !process.env.OPENDN_EXE) {
  console.error('usage: node test/exe.js <path to built opendn executable>');
  process.exit(2);
}
const runner = process.env.OPENDN_EXE_RUNNER ? [process.env.OPENDN_EXE_RUNNER] : [];
const SOURCE = path.join(__dirname, '..', 'bin', 'opendn.js');

function runExe(args, cwd) {
  const [cmd, ...pre] = runner.length ? [...runner, exe] : [exe];
  return execFileSync(cmd, [...pre, ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WINEDEBUG: '-all' },
  });
}
function runSource(args, cwd) {
  return execFileSync(process.execPath, [SOURCE, ...args], { cwd, encoding: 'utf8' });
}
const payloads = (dir) => Object.fromEntries(fs.readdirSync(dir)
  .filter((f) => f.endsWith('.payload.txt'))
  .map((f) => [f.replace(/-\d{8}-\d{6}\.stamped\.payload\.txt$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')]));

(async () => {
  assert.ok(fs.existsSync(exe), `executable not found: ${exe}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opendn-exe-'));
  const viaExe = path.join(tmp, 'exe');
  const viaSource = path.join(tmp, 'source');
  try {
    // 1. it knows it is the single-file build, and carries its files inside
    const v = runExe(['version'], tmp);
    assert.ok(v.includes('single-file build'), `packaged build detected: ${v}`);
    assert.ok(/built-in templates: [1-9]/.test(v), `templates embedded: ${v}`);
    assert.ok(v.includes('printer files: 2'), `printer backend + PPD embedded: ${v}`);
    console.log(`version OK — ${v.trim()}`);

    // 2. example / generate / parse give the same results as the source
    fs.mkdirSync(viaExe);
    fs.mkdirSync(viaSource);
    assert.deepStrictEqual(JSON.parse(runExe(['example'], tmp)), JSON.parse(runSource(['example'], tmp)), 'example matches');
    fs.writeFileSync(path.join(tmp, 'note.json'), runSource(['example'], tmp));
    runExe(['generate', '../note.json', '-o', 'label.pdf', '--payload', 'p.txt'], viaExe);
    runSource(['generate', '../note.json', '-o', 'label.pdf', '--payload', 'p.txt'], viaSource);
    const p = fs.readFileSync(path.join(viaExe, 'p.txt'), 'utf8');
    assert.strictEqual(p, fs.readFileSync(path.join(viaSource, 'p.txt'), 'utf8'), 'generate: payload byte-identical');
    assert.ok(fs.statSync(path.join(viaExe, 'label.pdf')).size > 10_000, 'label PDF rendered');
    assert.deepStrictEqual(JSON.parse(runExe(['parse', 'p.txt'], viaExe)), JSON.parse(runSource(['parse', 'p.txt'], viaExe)), 'parse matches');
    console.log('example / generate / parse OK (byte-identical to source)');

    // 3. the watcher reads PDFs, uses the built-in templates, fails open
    for (const dir of [viaExe, viaSource]) {
      fs.mkdirSync(path.join(dir, 'in'));
      fs.writeFileSync(path.join(dir, 'in', 'brightmoor.pdf'), await brightmoorPdf());
      fs.writeFileSync(path.join(dir, 'in', 'unknown.pdf'), await unknownSupplierPdf());
      fs.writeFileSync(path.join(dir, 'in', 'scan.pdf'), await noTextPdf());
    }
    const log = runExe(['watch', 'in', 'out', '--once'], viaExe);
    runSource(['watch', 'in', 'out', '--once'], viaSource);
    assert.ok(log.includes('from the built-in set'), `built-in templates used: ${log}`);
    assert.ok(log.includes('template: Brightmoor Trade Supplies'), `supplier template applied: ${log}`);
    assert.ok(log.includes('template: generic'), `generic fallback applied: ${log}`);
    assert.ok(log.includes('done — 2 stamped, 1 to review'), `fail-open for the scan: ${log}`);
    const fromExe = payloads(path.join(viaExe, 'out'));
    assert.deepStrictEqual(Object.keys(fromExe).sort(), ['brightmoor', 'unknown'], 'both notes stamped');
    assert.deepStrictEqual(fromExe, payloads(path.join(viaSource, 'out')), 'watch: payloads byte-identical to source');
    assert.ok(fs.existsSync(path.join(viaExe, 'out', 'review', 'scan.reason.txt')), 'scan flagged with a reason');
    console.log('watch OK (PDF text read, built-in templates, fail-open, byte-identical to source)');

    console.log('\nall executable tests passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
