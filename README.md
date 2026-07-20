# OpenDN — the open delivery-note QR standard

> **Use at your own risk.** The authors accept no responsibility for
> anything arising from use of this code — see [DISCLAIMER.md](DISCLAIMER.md).

Put the complete contents of a delivery note into a QR code that **anyone
can read with any QR app** and **any platform can parse** — so the data
survives damaged paperwork and nobody ever retypes a delivery note again.

**New here? Start with the [How-to guide](docs/howto.md)** — install to
first scannable note, step by step.

- **Plain text, open format** — no encoding, no links, no vendor lock-in.
  See [`docs/payload-spec.md`](docs/payload-spec.md) (OpenDN v1).
- **Damage-resilient** — error-correction level Q; the note still decodes
  with a quarter of the code obscured.
- **Two outputs** — an A6 label PDF to attach to paperwork, or the QR
  stamped directly into your existing delivery-note PDF.
- **Reference parser included** — tracking platforms (SmartWaste and
  similar) can ingest scanned codes with a few lines of code.

![How OpenDN works — capture, build, stamp, use](docs/how-it-works.png)

## Install

Requires [Node.js](https://nodejs.org) 18+ (Windows, macOS or Linux).

```bash
git clone https://github.com/gmitroimsc-07/OpenDN.git
cd OpenDN
npm install
npm link          # makes the `opendn` command available everywhere
```

## Quick start — install the OpenDN printer once, then just print

Windows (terminal opened with *Run as administrator*):

```powershell
opendn printer install --input C:\opendn\in
```

Linux/macOS:

```bash
sudo opendn printer install --input ~/opendn/in
```

That's it. **OpenDN** now appears in every print dialog and the stamping
engine runs as a background service. Print a delivery note to it from any
application — your ERP, LibreOffice, a browser — and a **stamped PDF is
saved automatically to the output folder** (`C:\opendn\out` /
`~/opendn/out`; change with `--output`), date+time in the name, with the
payload as a `.txt` beside it and the captured original in `archive/`.

**Printing is never blocked.** Anything OpenDN can't parse — a scan with
no text layer, a layout it doesn't know, a document that isn't a delivery
note at all — **passes through untouched** to `review/`, flagged with a
`.reason.txt` saying exactly why. Nothing is ever guessed or modified in
place. Parsing rules per supplier are small JSON files in
[`templates/`](templates/) ([`docs/templates.md`](docs/templates.md)),
with a generic fallback for common layouts. Details and platform notes:
[`docs/printer.md`](docs/printer.md).

## Other ways in

The printer is a front door to a folder pipeline you can also feed
directly — from an ERP's PDF export or a script:

```bash
opendn watch in/ out/            # every PDF landing in in/ comes out stamped
opendn watch in/ out/ --once     # process what's there now, then exit
```

(This is the engine the printer service runs for you — installing the
printer means never typing this.) Each PDF is read from its text layer
only — no OCR, scans are flagged to `review/`, never guessed. Folders and
defaults can live in `opendn.config.json`.

## For suppliers & integrators — exact ERP data, richest QR

Skip document parsing entirely: feed OpenDN the note's data straight from
your system and the payload is exact by construction — including
**per-item weight (kg) and embodied carbon (kgCO2e) even when they're not
printed on the page**. Describe the note as JSON (template:
`opendn example > note.json`):

```json
{
  "note": "DN10245876",
  "date": "2026-02-05 05:48",
  "supplier": "Brightmoor Trade Supplies Ltd, 12 Foundry Lane, Milton Keynes MK9 1AA",
  "deliverTo": "Stonegate Site 12, 55 Meadow Way, Northbridge NB1 5GH",
  "weightKg": 111.55,
  "co2eKg": 18.42,
  "items": [
    { "code": "5101001", "desc": "Trade Satinwood Paint Light Tint 5L", "qty": 3, "kg": 7.1, "kgCO2e": 3.9 },
    { "code": "5101006", "desc": "Decorators Caulk White 380ml", "qty": 12 }
  ]
}
```

Then generate a printable label, or stamp your existing PDF:

```bash
opendn generate note.json -o label.pdf --qr qr.png
opendn stamp delivery-note.pdf note.json -o stamped.pdf
```

Most ERP/accounts systems can export delivery notes as CSV or JSON — map
the export to these fields and call `opendn` from a script or scheduled
task at print time.

## For receiving platforms

A scanned payload parses back to JSON with the bundled reference parser:

```bash
opendn parse scanned-payload.txt
```

or in code:

```js
const { parsePayload } = require('opendn/src/payload');
const note = parsePayload(scannedText);   // { note, date, supplier, items: [...], ... }
```

The grammar is deliberately trivial — `KEY: value` header lines and
`code | description | qty [| kg [| kgCO2e]]` item lines — so implementing
it natively in any language takes ~20 lines. Full rules in
[`docs/payload-spec.md`](docs/payload-spec.md).

## Roadmap

Where this is going — the network print gateway, platform connectors, npm
releases and more: [ROADMAP.md](ROADMAP.md).

## Test

```bash
npm test
```

Builds a payload from the example note, renders the label and a stamped
PDF, decodes the QR back off the rendered output with zxing (the same
engine real scanner apps use), and checks the result is byte-identical.

## Licence

MIT — use it, ship it, put it on your own delivery notes.
