# The OpenDN virtual printer

Milestone 2: a real printer called **OpenDN** in every application's print
dialog. Print a delivery note to it and the stamped PDF appears in the
output folder — no save dialogs, no folder to remember.

Only what you deliberately print to OpenDN enters the pipeline; your normal
printers are untouched. And if something printed to OpenDN turns out not to
be a delivery note, it fails open: the PDF lands untouched in `review/` with
a note explaining why, so nothing is ever lost or mangled.

## Install — Windows

**Easiest:** download `opendn-windows-x64.exe` from the
[Releases page](https://github.com/gmitroimsc-07/OpenDN/releases),
double-click it, press **Enter**, and click **Yes** when Windows asks for
administrator permission. (Unsigned for now: if Windows shows *"Windows
protected your PC"*, click **More info → Run anyway**.)

Setup then:

- copies the program to `C:\Program Files\OpenDN\opendn.exe` — the
  downloaded file is no longer needed;
- creates `C:\opendn\in` (capture), `C:\opendn\out` (stamped PDFs) and
  `C:\opendn\templates` (supplier templates, starting with the built-in
  example), and lets every user of the PC read and add files there;
- creates a printer named **OpenDN** using Windows' built-in *Microsoft
  Print To PDF* driver, on a port that writes straight into the capture
  folder (no save dialog);
- registers the stamping engine as a Scheduled Task, *OpenDN Watch*, that
  runs hidden, starts with the PC and restarts on failure.

Run it again any time to repair or update (a newer download replaces the
installed program). To remove: double-click it and choose **U** — the
printer, port and task go; your folders and the program folder stay, so
you can delete them yourself.

**From a terminal** (opened with *Run as administrator*) the same thing is:

```powershell
opendn printer install --input C:\opendn\in   # --output / --templates to choose other folders
opendn printer status                         # printer and engine state
opendn printer uninstall
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

Linux, with the downloaded single file:

```bash
chmod +x opendn-linux-x64
sudo ./opendn-linux-x64 printer install --input /home/you/opendn/in
```

From source (Linux or macOS): `sudo opendn printer install --input /home/you/opendn/in`.

One command, done: it registers the printer **and** starts the stamping
engine as a background service (a systemd user service that restarts on
failure and starts at every login). The downloaded program is copied to
`/usr/local/bin/opendn`. Stamped PDFs appear in `/home/you/opendn/out` and
supplier templates live in `/home/you/opendn/templates` — choose others
with `--output DIR` / `--templates DIR`. Paths must be absolute, with no
spaces (they become a CUPS device URI).

Check or remove with:

```bash
opendn printer status          # queue, backend and service state
sudo opendn printer uninstall  # removes queue, backend and service
```

If the service could not be set up (no systemd — e.g. macOS), the install
says so and prints the one `opendn watch …` command to run yourself.

## Use

Print from anything — your ERP, LibreOffice, a browser — and pick
**OpenDN** as the printer. Within a couple of seconds:

- `out/NAME-<date>-<time>.stamped.pdf` — the document with its QR (print this one on paper)
- `out/NAME-<date>-<time>.stamped.payload.txt` — the payload as text
- `out/archive/` — the captured original
- `out/review/` — anything unparseable, untouched, with a `.reason.txt`

Add per-supplier parsing rules as JSON files in the `templates` folder —
see [`templates.md`](templates.md). They are read again for every
document, so a new template works from the next print.

## The background service

**Windows:** Task Scheduler → *OpenDN Watch*, or `opendn printer status`.

**Linux:** `install` writes `~/.config/systemd/user/opendn-watch.service`
for the user who ran sudo and enables it immediately. Useful commands:

```bash
systemctl --user status opendn-watch     # is it running? recent log lines
journalctl --user -u opendn-watch -f     # follow the stamping log live
systemctl --user restart opendn-watch    # restart after changing folders
```

## How it works

On **Linux/macOS**, `install` writes the CUPS backend
([`printer/opendn-backend`](../printer/opendn-backend)) to
`/usr/lib/cups/backend/opendn` and registers a queue with device URI
`opendn:<input-folder>` and the PPD in [`printer/`](../printer/). CUPS
renders every job to PDF through its standard filter chain and hands it to
the backend, which writes it into the folder (atomically, via a `.part`
rename) and chowns it to the user who printed. The backend is installed
mode `0700 root:root` — CUPS's convention (the same one cups-pdf uses) that
makes it run as root so it can write into your folder.

On **Windows** there is no CUPS: install instead creates a printer port
that is a file path inside the capture folder and binds the built-in
*Microsoft Print To PDF* driver to it — printing renders the PDF directly
to that path with no dialog. The engine runs as a Scheduled Task. Same
pipeline, different plumbing.

The single-file executable carries the backend, the PPD and the built-in
templates inside itself, and installs a copy of itself to a fixed location
so the background engine never depends on the file you downloaded.

Documents printed from applications carry a digital text layer, which is
exactly what the no-OCR parser needs — the virtual printer and the watcher
are two halves of the same design.

This whole path is tested on a real Windows machine on every push
([`test/windows-printer-e2e.ps1`](../test/windows-printer-e2e.ps1)):
install, print a delivery note to OpenDN, check the stamped PDF's payload,
uninstall.
