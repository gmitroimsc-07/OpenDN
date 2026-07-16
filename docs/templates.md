# Supplier templates

The watcher (`opendn watch`) turns each supplier's delivery-note PDF into an
OpenDN payload using a **template**: a JSON file describing where that
supplier's layout puts each field. Templates live in the `templates/` folder
(or wherever `--templates` / `opendn.config.json` points) — add a file per
supplier, no code changes.

When no template matches, a conservative generic parser tries common layouts;
if it cannot find a note number, date, supplier and at least one item line,
the PDF goes untouched to `review/` with a reason file (fail-open — nothing
is ever guessed).

## File format

One JSON object per file — see
[`templates/brightmoor-trade-supplies.json`](../templates/brightmoor-trade-supplies.json)
for a working example.

```json
{
  "name": "Brightmoor Trade Supplies",
  "match": ["BRIGHTMOOR TRADE SUPPLIES"],
  "fields": {
    "note":      { "pattern": "DELIVERY NOTE\\s+No:?\\s*([A-Z0-9/-]+)" },
    "date":      { "pattern": "Date:\\s*([0-9]{2}/[0-9]{2}/[0-9]{4})" },
    "supplier":  { "value": "Brightmoor Trade Supplies Ltd, 12 Foundry Lane, …" },
    "deliverTo": { "pattern": "Deliver to:\\s*(.+)", "lines": 2 },
    "ref":       { "pattern": "Ref:\\s*(\\S+)", "optional": true },
    "weightKg":  { "pattern": "Total weight:\\s*([0-9.]+)\\s*kg", "optional": true }
  },
  "items": {
    "begin": "^CODE\\s{2,}DESCRIPTION",
    "end": "^(Total weight|GOODS RECEIVED)",
    "pattern": "^(\\S+)\\s{2,}(.+?)\\s{2,}([0-9]+(?:\\.[0-9]+)?)$"
  }
}
```

### Top level

| key     | meaning                                                              |
| ------- | -------------------------------------------------------------------- |
| `name`  | shown in logs and error messages                                      |
| `match` | the template applies when **every** string appears anywhere in the PDF text (case-insensitive) — use the supplier's letterhead |
| `fields`| one entry per note field (see below)                                  |
| `items` | how to find the item table (see below)                                |

### `fields` — each entry is one of

- `{ "pattern": "…" }` — a case-insensitive regex tried against each line of
  the PDF text; capture group 1 is the value.
- `{ "pattern": "…", "lines": N }` — for addresses that continue on following
  lines: the capture plus the next N−1 non-empty lines, joined with `", "`.
- `{ "value": "…" }` — a constant (typical for `supplier`: the letterhead is
  a logo image, so spell the address out here once).
- add `"optional": true` if the field may be absent; without it a missing
  field sends the PDF to review.

Field names are the payload fields: `note`, `date`, `supplier`, `customer`,
`deliverTo`, `ref`, `custRef`, `account`, `weightKg`
(`note`, `date`, `supplier` are required).

### `items`

- `begin` — regex for the table's heading line; matching starts after it
  (omit to scan the whole document).
- `end` — regex for the line where the table stops (totals, signature box).
- `pattern` — regex applied to each line in between, with exactly three
  capture groups: code, description, quantity.

## How lines are extracted

The PDF's text layer is rebuilt line by line (no OCR, ever). Horizontal gaps
wider than ~2 mm become a **double space**, so table columns are reliably
separable with `\s{2,}` in your patterns — as in the examples above.

Write templates against real output: drop one of the supplier's PDFs into the
input folder, read the `.reason.txt` in `review/`, and adjust. Test data in
this repository must stay fictional.
