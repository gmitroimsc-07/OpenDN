# OpenDN Roadmap

Where this project is going. Current state: **v0.3.0** — the core toolkit
(payload builder/parser, QR generation, A6 label, PDF stamping, CLI),
Milestone 1, the Watcher (`opendn watch`), and Milestone 2, the virtual
printer, on CUPS (`opendn printer install`, Linux/macOS).

## Design principles (settled — do not reopen without strong reason)

1. **Plain text payload** (`OpenDN v1`, see `docs/payload-spec.md`): any QR
   app shows the note; any platform parses it. No encoding, no compression,
   no links.
2. **No OCR anywhere.** Only exact digital sources: PDF text layers,
   structured exports, plain-text/ESC-P print streams. Unparseable input is
   passed through untouched and flagged — never guessed.
3. **Fail-open.** The tool must never block, delay, or corrupt anyone's
   printing or paperwork. On any error: output the original, flag it.
4. **EC level Q, ≥40 mm print size** — codes must survive damaged paper.
5. **Fictional data only** in examples/tests (Ofcom reserved phone ranges).

## Milestone 1 — the Watcher (✅ shipped in v0.2.0)

**Endpoint: when a user prints a delivery note, a stamped PDF is saved
automatically to a dedicated folder.** No commands, no manual steps.

How it works:

```
input folder  ──▶  watcher  ──▶  parse PDF text  ──▶  build OpenDN payload
(user prints /                    (supplier                │
 exports PDFs                     templates)               ▼
 here)                                            stamp QR (existing
                                                  src/stamp.js)
                                                           │
                                                           ▼
                                          output folder: stamped PDF
                                          (+ archive copy, + .txt payload)
```

Build list:

1. `opendn watch <in-dir> <out-dir>` command: chokidar-based folder watcher;
   new PDF arrives → process → save `NAME.stamped.pdf` to the output folder;
   move the original to `archive/`. Unparseable PDFs → copy through to
   `review/` and log why (fail-open).
2. PDF text extraction (`pdf-parse` or `pdfjs-dist`) — text layer only,
   per the no-OCR principle.
3. Supplier template parser: per-supplier data files (JSON: regex/anchor
   rules mapping text → note fields + item table). Generic fallback
   heuristics for dates/references/quantities. Templates live in a
   `templates/` folder users can add to without touching code.
4. Config file (`opendn.config.json`): folders, default QR size, template
   dir, filename pattern.
5. How users feed it with zero workflow change: print with **Microsoft
   Print to PDF** (or any print-to-PDF) targeting the input folder, or
   point their ERP's PDF export there. A true virtual printer comes in
   Milestone 2.
6. Tests: template parsing fixtures (fictional notes), end-to-end
   watch → stamped PDF, decode verification with zxing.

## Milestone 2 — virtual printer input (✅ CUPS shipped in v0.3.0)

Register a printer that feeds the same pipeline directly (no manual
"print to PDF" target selection). Same engine, new front door.

- ✅ Linux/macOS: `opendn printer install` — CUPS backend + queue; jobs
  printed to "OpenDN" land in the watch folder as PDFs (`docs/printer.md`).
- ⬜ Windows: service wrapping an XPS/PDF port monitor. Until then:
  Microsoft Print to PDF targeting the watch folder.

## Milestone 3 — the network gateway (the full product)

One appliance per organisation (Docker / Windows service): advertises as an
IPP Everywhere printer on the LAN, captures ALL print jobs, classifies
delivery notes, stamps them, forwards to the physical printer, archives the
stamped PDF. Includes ESC/P plain-text parsing for dot-matrix ERP output
and an admin web UI (review queue, templates, printer config).

## Milestone 4 — connectors & ecosystem

- Webhook/REST push of confirmed notes to tracking platforms
  (BRE SmartWaste and similar), signed and retried.
- Native OpenDN parsers contributed for other languages (Python, C#).
- npm publish (`npm i -g opendn`), versioned releases, CI.

## Milestone 5 — distribution (commercial optional)

Installers (Windows service, systemd), vendor printer-app channel
(HP Workpath / Ricoh SI etc.), releases and update channel.

---

*Full background and decision history: `QR-Code/PLAN.md` in the originating
C2C repository (github.com/mgirom/C2C, branch
`claude/qr-code-folder-setup-nnwuz4`).*
