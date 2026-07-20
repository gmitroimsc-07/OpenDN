# OpenDN v1 — open delivery-note QR payload specification

OpenDN is an open, plain-text format for carrying the complete contents of
a delivery note inside a QR code. It is designed so that:

- **any person** scanning the code with any QR app sees the delivery note
  as readable text, with no special software, and
- **any platform** (materials/waste tracking, ERP, site diary) can parse it
  with a few lines of code.

There is no encoding, compression, or external link. The data lives in the
code itself, so it survives damage to the document and works offline.

## Format

The payload is UTF-8 text with `\n` line endings:

```
OpenDN v1
NOTE: DN10245876
DATE: 2026-02-05 05:48
SUPPLIER: Brightmoor Trade Supplies Ltd, 12 Foundry Lane, Milton Keynes MK9 1AA, T:01632 960812
CUSTOMER: Stonegate Construction Ltd, Unit 4, Harbour Business Park, Riverton RV2 4TQ
DELIVER-TO: Stonegate Site 12, 55 Meadow Way, Northbridge NB1 5GH, T:07700 900123
REF: G123/SO45678901
CUST-REF: OAKFIELD0402-2026
ACCOUNT: 456789
ITEMS: 14
5101001 | Trade Satinwood Paint Light Tint 5L S1005-Y10R | 3 | 7.1 | 3.9
5101002 | QD Exterior Flexible Undercoat White 5L | 1
WEIGHT-KG: 111.55
CO2E-KG: 18.42
```

### Rules

1. **Line 1** is exactly `OpenDN v1`. Use it to detect the format; the
   version number will change if the grammar ever changes.
2. **Header lines** are `KEY: value`. Defined keys, in order:
   `NOTE` (required), `DATE` (required), `SUPPLIER` (required), `CUSTOMER`,
   `DELIVER-TO`, `REF`, `CUST-REF`, `ACCOUNT`. Unknown `KEY:` lines must be
   ignored by parsers (future versions may add keys).
3. **`ITEMS: n`** declares the number of item lines that follow. Parsers
   should verify the count — a mismatch means the payload was truncated.
4. **Item lines** are `code | description | qty [| kg [| kgCO2e]]`,
   pipe-separated: 3 columns minimum, with optional per-line weight (kg)
   and embodied carbon (kg CO2e) — data the delivery system may know even
   when it is not printed on the page. `kgCO2e` requires `kg`. Values
   never contain `|` or line breaks (the writer strips them).
5. **`WEIGHT-KG: x`** (optional) and **`CO2E-KG: x`** (optional) close the
   payload with note totals.
6. Dates are `YYYY-MM-DD` optionally followed by ` HH:MM`.

### QR requirements

- Error-correction level **Q** (25%) — the payload must survive partial
  damage to the printed code.
- Minimum printed size **40 mm** including quiet zone; a typical 14-line
  note is ~1,050 characters → QR version 32.
- Practical ceiling ≈ 1,400 characters (roughly 25–30 item lines). Longer
  notes: shorten descriptions, or split across two codes and mark the
  header `NOTE: DN10245876 (1/2)` / `(2/2)`.

## Reference parser

`src/payload.js` in this repository exports `parsePayload(text)` returning:

```json
{
  "format": "OpenDN v1",
  "note": "DN10245876",
  "date": "2026-02-05 05:48",
  "supplier": "…",
  "customer": "…",
  "deliverTo": "…",
  "ref": "…",
  "custRef": "…",
  "account": "…",
  "items": [ { "code": "5101001", "desc": "…", "qty": 3, "kg": 7.1, "kgCO2e": 3.9 } ],
  "weightKg": 111.55,
  "co2eKg": 18.42
}
```

(`kg`, `kgCO2e` and `co2eKg` appear only when present in the payload.)

Any language can implement the same in ~20 lines: split lines, match
`KEY: value`, split item lines on `|`.

## Versioning

Breaking grammar changes bump the version line (`OpenDN v2`). Parsers
should accept every version they know and report — not guess at — versions
they don't.
