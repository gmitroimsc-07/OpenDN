# Building the executables and making a release

OpenDN is distributed as single-file programs, so users need no Node.js,
git or npm:

| file | for |
|---|---|
| `opendn-windows-x64.exe` | Windows 10/11 (x64) — double-click to install the printer |
| `opendn-linux-x64` | Linux (x64) |
| `SHA256SUMS.txt` | checksums to verify a download |

macOS users run from source for now (an unsigned macOS binary would be
blocked by Gatekeeper).

## Build locally

You need [Bun](https://bun.sh) 1.3 or newer as well as Node.js and
`npm install`. Bun compiles the code together with a JavaScript runtime
into one file and can cross-compile, so one machine builds every target:

```bash
node scripts/build.js                 # all targets → dist/
node scripts/build.js windows-x64     # just one
node scripts/build.js native          # the machine you're on
```

The shipped files the program needs at run time — the built-in supplier
templates and the CUPS backend + PPD — are embedded into the executable
([`src/assets.js`](../src/assets.js)); the build machine's paths are never
used.

Check a build behaves exactly like the source version (it runs the binary
from an empty folder outside the repository and compares every output
byte-for-byte):

```bash
node test/exe.js dist/opendn-linux-x64
OPENDN_EXE_RUNNER=wine node test/exe.js dist/opendn-windows-x64.exe   # Windows build, on Linux
```

On a Windows PC, the full printer path can be checked from an
administrator terminal (it installs, prints a note, verifies, uninstalls):

```powershell
powershell -ExecutionPolicy Bypass -File test\windows-printer-e2e.ps1 dist\opendn-windows-x64.exe
```

## What CI checks on every push

- `npm test` on Linux and Windows
- build the executable on Linux and Windows, run `test/exe.js` against it
- the real Windows printer test above, on a GitHub Windows runner

## Make a release

1. Bump `version` in `package.json` (`npm version 0.6.0 --no-git-tag-version`)
   and commit.
2. Tag and push: `git tag v0.6.0 && git push origin v0.6.0`.

The [release workflow](../.github/workflows/release.yml) then runs the
tests, builds both executables, runs each one on its own OS, and
publishes a GitHub Release with the files and `SHA256SUMS.txt`. A tag with
a hyphen (`v0.6.0-beta.1`) is published as a pre-release.

## Known gaps

- **Code signing.** The Windows executable is unsigned, so SmartScreen
  shows *"Windows protected your PC"* on first run and some antivirus
  heuristics may flag it. Signing needs a paid certificate or Microsoft's
  signing service; until then users can verify downloads with
  `SHA256SUMS.txt`.
- **Size.** Each file is about 100–115 MB (around 40 MB compressed)
  because it carries its own runtime.
- **The administrator prompt** shown when a user double-clicks the `.exe`
  can't be exercised in CI (the runner is already administrator); the
  install it leads to is.
