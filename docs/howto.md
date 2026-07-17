# OpenDN — how to install and use it

This guide takes you from nothing to scannable delivery notes, step by
step. No prior knowledge assumed beyond being able to open a terminal.

**What OpenDN does, in one sentence:** it puts the complete contents of a
delivery note into a QR code printed on the note itself, so the data
survives crumpled, rained-on, photographed paperwork — anyone can read it
with a phone camera, and nobody ever retypes a delivery note again.

**Who does what:**

- **Suppliers** (or anyone *producing* delivery notes) generate or stamp
  the QR at print time — sections 2–5.
- **Sites and drivers** just scan the code with any QR app; the full note
  appears as plain text. Nothing to install — section 6.
- **Tracking platforms** parse scanned payloads with ~20 lines of code in
  any language — section 7.

---

## 1. Install

You need [Node.js](https://nodejs.org) 18 or newer (Windows, macOS or
Linux). Then:

```bash
git clone https://github.com/gmitroimsc-07/OpenDN.git
cd OpenDN
npm install
npm link        # makes the `opendn` command available everywhere
npm test        # optional: verify everything works on your machine
```

`npm link` may need `sudo` on some systems. To check it worked:

```bash
opendn --help
```

---

## 2. Your first QR — one note by hand

Describe a delivery note as a small JSON file. Print a template to start
from:

```bash
opendn example > note.json
```

Edit `note.json` — the fields are:

| field | required | example |
|---|---|---|
| `note` | ✅ | `"DN10245876"` — the delivery-note number |
| `date` | ✅ | `"2026-02-05 05:48"` |
| `supplier` | ✅ | name + address + phone, one string |
| `items` | ✅ | array of `{ "code", "desc", "qty" }` |
| `customer` | — | invoice-to name and address |
| `deliverTo` | — | site address the goods go to |
| `ref`, `custRef`, `account` | — | order / customer references |
| `weightKg` | — | total weight, e.g. `111.55` |

Then either **generate a label** to attach to the paperwork:

```bash
opendn generate note.json -o label.pdf
```

…or **stamp the QR straight onto your existing delivery-note PDF**
(bottom-right corner, on a white panel so it scans on any background):

```bash
opendn stamp delivery-note.pdf note.json -o stamped.pdf
```

Print the result and send it with the goods. Point a phone camera at the
code — the whole note appears as readable text.

> **Size rule:** keep the QR at 40 mm or larger when printing (the
> default). Smaller codes stop surviving damaged paper, which defeats the
> point.

---

## 3. The OpenDN printer — the everyday workflow (Linux/macOS)

Doing that per note gets old. The way OpenDN is meant to be used day to
day is as **a real printer called OpenDN in every print dialog**. One-time
setup:

```bash
sudo opendn printer install --input ~/opendn/in
```

That single command registers the printer *and* starts the stamping
engine as a background service — there is nothing to keep running by
hand. From then on:

1. Open the delivery note in whatever produced it (ERP, LibreOffice,
   browser…) and hit **Print**.
2. Choose **OpenDN** as the printer.
3. Seconds later, collect from `~/opendn/out`:
   - `NAME.stamped.pdf` — your document with the QR (print this one on
     your real printer)
   - `NAME.stamped.payload.txt` — the payload as plain text
   - `archive/` — the captured original, untouched
   - `review/` — anything OpenDN couldn't parse, **untouched**, with a
     `NAME.reason.txt` saying exactly why

Not every document is a delivery note — so nothing is captured
automatically. *You* choose, per document, by choosing the printer. And a
misfire costs nothing: a non-delivery-note printed to OpenDN just sits
untouched in `review/`.

`opendn printer status` shows the queue and the service;
`sudo opendn printer uninstall` removes everything. More (service logs,
how it works inside): [`printer.md`](printer.md). Windows: a native
OpenDN printer is on the roadmap — until then use the watch folder below
with Microsoft Print to PDF.

---

## 4. The watch folder — other ways in

The printer is a front door to a folder pipeline you can also feed
directly — an ERP's scheduled PDF export, Microsoft Print to PDF on
Windows, a script:

```bash
opendn watch in/ out/            # every PDF landing in in/ comes out stamped
opendn watch in/ out/ --once     # process what's there now, then exit
```

Same outputs as above (`out/`, `archive/`, `review/`). This is exactly the
engine the printer's background service runs for you — if you installed
the printer, you never type this. Folders and defaults can also live in an
`opendn.config.json` file.

**Important:** however a PDF arrives, it must be *digitally produced*
(printed or exported from software). OpenDN reads the PDF's text layer and
never OCRs — a photo or scan of paper goes politely to `review/` instead
of being guessed at.

---

## 5. Teaching OpenDN your suppliers' layouts

The watcher reads each PDF's text and needs to know where *that supplier's*
layout puts the note number, date, addresses and item table. Two ways:

1. **Generic fallback** — built-in heuristics that handle common layouts
   ("Delivery Note No: …", "Date …", `code  description  qty` tables). No
   setup, works surprisingly often.
2. **Supplier templates** — one small JSON file per supplier in
   `templates/`, no code changes. Takes ~10 minutes per supplier and is
   exact.

The loop for writing one: drop a real PDF from that supplier into the
watch folder → read the `.reason.txt` it produces in `review/` → write or
adjust the template → drop the PDF in again. Full format reference with a
worked example: [`templates.md`](templates.md).

If neither a template nor the fallback can find the required fields, the
PDF goes to `review/` untouched. **OpenDN never guesses** — a wrong
quantity in a QR is worse than no QR.

---

## 6. Scanning — for sites, drivers, anyone

Nothing to install. Point any phone camera or QR app at the code: the
complete delivery note appears as plain, human-readable text —

```
OpenDN v1
NOTE: DN10245876
DATE: 2026-02-05 05:48
SUPPLIER: Brightmoor Trade Supplies Ltd, 12 Foundry Lane, ...
ITEMS: 2
5101001 | Trade Satinwood Paint Light Tint 5L | 3
5101006 | Decorators Caulk White 380ml | 12
```

No app, no account, no internet, no links. Error-correction level Q means
the code still reads with a quarter of it obscured — mud, staples,
creases.

---

## 7. Ingesting scans — for tracking platforms

A scanned payload parses back to structured JSON with the bundled
reference parser:

```bash
opendn parse scanned-payload.txt
```

or in code:

```js
const { parsePayload } = require('opendn/src/payload');
const note = parsePayload(scannedText);
// { note, date, supplier, deliverTo, items: [{code, desc, qty}], weightKg, ... }
```

The grammar is deliberately trivial — `KEY: value` header lines,
`code | description | qty` item lines — implementing it natively in any
language takes ~20 lines. Full rules: [`payload-spec.md`](payload-spec.md).

---

## 8. When something goes wrong

| symptom | cause & fix |
|---|---|
| PDF in `review/`, reason "no text layer" | It's a scan/photo. OpenDN never OCRs — get the digital PDF (print/export from the source system) instead. |
| PDF in `review/`, reason "could not find: …" | No template matched and the generic parser couldn't find those fields. Write a template for that supplier ([`templates.md`](templates.md)). |
| `payload is N chars (max 1400…)` | The note is too big for one scannable QR. Shorten item descriptions, or split the note across two codes. |
| `opendn: command not found` | Re-run `npm link` (possibly with `sudo`), or call `node bin/opendn.js …` from the repo. |
| `printer install` says to run with sudo | Registering a CUPS backend needs root: `sudo opendn printer install …`. |
| QR won't scan off paper | Printed too small or too dense. Keep ≥ 40 mm; shorter payloads scan easier. |

Every failure is fail-open by design: your original document is always
preserved byte-for-byte, either in `archive/` (parsed fine) or `review/`
(with the reason). OpenDN never blocks printing and never modifies a
document it couldn't understand.

---

## 9. Command cheat-sheet

```bash
sudo opendn printer install --input DIR     # the printer + engine, one command
opendn printer status | uninstall
opendn example > note.json                  # template to fill in
opendn generate note.json -o label.pdf      # A6 label with QR + summary
opendn stamp doc.pdf note.json -o out.pdf   # QR onto an existing PDF
opendn watch in/ out/ [--once]              # folder pipeline (no printer)
opendn parse payload.txt                    # scanned text -> JSON
npm test                                    # verify your installation
```

Questions, ideas, supplier templates to share? Open an issue on
[GitHub](https://github.com/gmitroimsc-07/OpenDN). Where the project goes
next: [`ROADMAP.md`](../ROADMAP.md).
