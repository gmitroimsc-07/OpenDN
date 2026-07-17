# The OpenDN virtual printer

Milestone 2: a real printer called **OpenDN** in every application's print
dialog. Print a delivery note to it and the stamped PDF appears in the
watcher's output folder — no save dialogs, no folder to remember.

Only what you deliberately print to OpenDN enters the pipeline; your normal
printers are untouched. And if something printed to OpenDN turns out not to
be a delivery note, it fails open: the PDF lands untouched in `review/` with
a note explaining why, so nothing is ever lost or mangled.

## Install — Windows

From a terminal opened with **Run as administrator** (PowerShell or cmd):

```powershell
opendn printer install --input C:\opendn\in
```

One command: it creates a printer named **OpenDN** using Windows'
built-in *Microsoft Print To PDF* driver on a port that writes straight
into the capture folder (no save dialog), and registers the stamping
engine as a Scheduled Task (runs hidden as SYSTEM, starts with the
machine, restarts on failure). Stamped PDFs appear in `C:\opendn\out`
(change with `--output`).

```powershell
opendn printer status               # printer, port and task state
opendn printer uninstall            # removes printer, port and task (admin)
```

Every output name carries the print's date and time
(`capture-20260717-153012.stamped.pdf`), so files are unique and sort
chronologically. **Known limitation** of the Windows capture path: jobs
are captured through a single `capture.pdf`, so the document *title*
doesn't carry into the filename, and two jobs printed at exactly the same
moment can collide at capture — the engine clears the file within a
couple of seconds, so in normal use this doesn't bite. A local IPP print
server (the Milestone 3 gateway technology) will remove this limitation.

## Install — Linux / macOS

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

On **Windows** there is no CUPS: install instead creates a printer port
that is a file path inside the capture folder and binds the built-in
*Microsoft Print To PDF* driver to it — printing renders the PDF directly
to that path with no dialog. The engine runs as a Scheduled Task. Same
pipeline, different plumbing.
