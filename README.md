# OpenDN — the open delivery-note QR standard

> **Use at your own risk.** The authors accept no responsibility for
> anything arising from use of this code — see [DISCLAIMER.md](DISCLAIMER.md).

Put the complete contents of a delivery note into a QR code that **anyone
can read with any QR app** and **any platform can parse** — so the data
survives damaged paperwork and nobody ever retypes a delivery note again.

- **Plain text, open format** — no encoding, no links, no vendor lock-in.
  See [`docs/payload-spec.md`](docs/payload-spec.md) (OpenDN v1).
- **Damage-resilient** — error-correction level Q; the note still decodes
  with a quarter of the code obscured.
- **Two outputs** — an A6 label PDF to attach to paperwork, or the QR
  stamped directly into your existing delivery-note PDF.
- **Reference parser included** — tracking platforms (SmartWaste and
  similar) can ingest scanned codes with a few lines of code.

## Install

Requires [Node.js](https://nodejs.org) 18+ (Windows, macOS or Linux).

```bash
git clone https://github.com/gmitroimsc-07/OpenDN.git
cd OpenDN
npm install
npm link          # makes the `opendn` command available everywhere
```

## Quick start

1. Describe a delivery note as JSON (print a template with
   `opendn example > note.json`, then edit):

```json
{
  "note": "DN10245876",
  "date": "2026-02-05 05:48",
  "supplier": "Brightmoor Trade Supplies Ltd, 12 Foundry Lane, Milton Keynes MK9 1AA",
  "deliverTo": "Stonegate Site 12, 55 Meadow Way, Northbridge NB1 5GH",
  "weightKg": 111.55,
  "items": [
    { "code": "5101001", "desc": "Trade Satinwood Paint Light Tint 5L", "qty": 3 },
    { "code": "5101006", "desc": "Decorators Caulk White 380ml", "qty": 12 }
  ]
}
```

2. Generate a printable label, or stamp your existing PDF:

```bash
opendn generate note.json -o label.pdf --qr qr.png
opendn stamp delivery-note.pdf note.json -o stamped.pdf
```

3. Scan the code with any phone — the full note appears as text.

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
`code | description | qty` item lines — so implementing it natively in any
language takes ~20 lines. Full rules in
[`docs/payload-spec.md`](docs/payload-spec.md).

## Exporting from your system

Most ERP/accounts systems can export delivery notes as CSV or JSON. Map
your export to the `note.json` fields above and call `opendn` from a script
or scheduled task at print time. (A print-gateway version that captures
print jobs automatically — no export step at all — is on the roadmap.)

## Test

```bash
npm test
```

Builds a payload from the example note, renders the label and a stamped
PDF, decodes the QR back off the rendered output with zxing (the same
engine real scanner apps use), and checks the result is byte-identical.

## Licence

MIT — use it, ship it, put it on your own delivery notes.
