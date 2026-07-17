# The OpenDN virtual printer (Linux / macOS)

Milestone 2: a real printer called **OpenDN** in every application's print
dialog. Print a delivery note to it and the stamped PDF appears in the
watcher's output folder — no save dialogs, no folder to remember.

Only what you deliberately print to OpenDN enters the pipeline; your normal
printers are untouched. And if something printed to OpenDN turns out not to
be a delivery note, it fails open: the PDF lands untouched in `review/` with
a note explaining why, so nothing is ever lost or mangled.

## Install

```bash
sudo opendn printer install --input /home/you/opendn/in
```

One command, done: it registers the printer **and** starts the stamping
engine as a background service (a systemd user service that restarts on
failure and starts at every login). Stamped PDFs appear in
`/home/you/opendn/out` — set your own with `--output DIR`. Paths must be
absolute, with no spaces (they become a CUPS device URI).

Check or remove with:

```bash
opendn printer status          # queue, backend and service state
sudo opendn printer uninstall  # removes queue, backend and service
```

If the service could not be set up (no systemd — e.g. macOS), the install
says so and you run the engine yourself:
`opendn watch /home/you/opendn/in /home/you/opendn/out`.

## Use

Print from anything — your ERP, LibreOffice, a browser — and pick
**OpenDN** as the printer. Within a couple of seconds:

- `out/NAME.stamped.pdf` — the document with its QR (print this one on paper)
- `out/NAME.stamped.payload.txt` — the payload as text
- `out/archive/` — the captured original
- `out/review/` — anything unparseable, untouched, with a `.reason.txt`

Add per-supplier parsing rules as JSON files in `templates/` — see
[`templates.md`](templates.md).

## The background service

`install` writes `~/.config/systemd/user/opendn-watch.service` for the
user who ran sudo and enables it immediately. Useful commands:

```bash
systemctl --user status opendn-watch     # is it running? recent log lines
journalctl --user -u opendn-watch -f     # follow the stamping log live
systemctl --user restart opendn-watch    # e.g. after adding a template
```

## How it works

`install` copies [`printer/opendn-backend`](../printer/opendn-backend) to
`/usr/lib/cups/backend/opendn` and registers a queue with device URI
`opendn:<input-folder>` and the PPD in [`printer/`](../printer/). CUPS
renders every job to PDF through its standard filter chain and hands it to
the backend, which writes it into the folder (atomically, via a `.part`
rename) and chowns it to the user who printed. The backend is installed
mode `0700 root:root` — CUPS's convention (the same one cups-pdf uses) that
makes it run as root so it can write into your folder.

Documents printed from applications carry a digital text layer, which is
exactly what the no-OCR parser needs — the virtual printer and the watcher
are two halves of the same design.

**Windows** (XPS port monitor wrapping the same pipeline) is still on the
roadmap; until then Windows users can point *Microsoft Print to PDF* at the
input folder.
