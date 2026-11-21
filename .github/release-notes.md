## Install — one file, nothing else needed

**Windows:** download `opendn-windows-x64.exe`, double-click it, press **Enter**, and click **Yes** when Windows asks for administrator permission. A printer called **OpenDN** appears in every print dialog; print a delivery note to it and the copy carrying the OpenDN QR code is saved to `C:\opendn\out`. Double-click again to repair, update or uninstall.

> The file is not code-signed yet, so Windows may show *"Windows protected your PC"* — click **More info → Run anyway**. Verify your download first if you like: `Get-FileHash opendn-windows-x64.exe` should match the line in `SHA256SUMS.txt`.

**Linux:**

```bash
chmod +x opendn-linux-x64
sudo ./opendn-linux-x64 printer install --input ~/opendn/in
```

**macOS / developers:** run from source — see the [README](https://github.com/gmitroimsc-07/OpenDN#readme).

## What it does

Puts the complete delivery note into a plain-text QR code that any phone can read offline and any platform can parse. Notes OpenDN can't parse pass through untouched to a `review` folder with the reason — printing is never blocked and nothing is ever guessed.

- How-to guide: [docs/howto.md](https://github.com/gmitroimsc-07/OpenDN/blob/main/docs/howto.md)
- The printer in detail: [docs/printer.md](https://github.com/gmitroimsc-07/OpenDN/blob/main/docs/printer.md)
- Payload format: [docs/payload-spec.md](https://github.com/gmitroimsc-07/OpenDN/blob/main/docs/payload-spec.md)

These files were built and tested by GitHub Actions from the tagged source: each executable was run on its own operating system, and the Windows printer was installed, printed to and checked on a real Windows machine before publishing.

*Use at your own risk — see [DISCLAIMER.md](https://github.com/gmitroimsc-07/OpenDN/blob/main/DISCLAIMER.md). MIT licensed.*
