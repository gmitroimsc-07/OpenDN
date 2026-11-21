# End-to-end test of the OpenDN printer on a real Windows machine:
# install -> print a delivery note to "OpenDN" -> check the stamped PDF and
# its payload -> uninstall. CI runs it on every push; you can run it on any
# Windows PC from a terminal opened as administrator:
#
#   powershell -ExecutionPolicy Bypass -File test\windows-printer-e2e.ps1 dist\opendn-windows-x64.exe
#
# It uses its own folders (C:\opendn-e2e) and removes the printer afterwards.
# Note: it replaces any OpenDN printer already installed on the machine.
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [string]$Base = 'C:\opendn-e2e'
)
$ErrorActionPreference = 'Stop'
$Exe = (Resolve-Path $Exe).Path

# Desktop Windows has both; server images (CI) may need them switched on.
if ((Get-Service Spooler).Status -ne 'Running') { Start-Service Spooler }
if (-not (Get-PrinterDriver -Name 'Microsoft Print To PDF' -ErrorAction SilentlyContinue)) {
  Write-Host 'Microsoft Print To PDF driver missing - enabling the Windows feature'
  Enable-WindowsOptionalFeature -Online -FeatureName 'Printing-PrintToPDFServices-Features' -All -NoRestart | Out-Null
}

& $Exe printer install --input "$Base\in"
if ($LASTEXITCODE -ne 0) { throw "printer install failed (exit code $LASTEXITCODE)" }
& $Exe printer status

try {
  # Fictional note in a layout the generic parser knows
  @(
    'Harbourside Building Products Ltd',
    '',
    'Delivery Note No: HB-88231',
    'Date 14/07/2026',
    '',
    '7734001        Sharp Sand 25kg Bag        40',
    '7734015        Cement OPC 25kg            10'
  ) | Out-Printer -Name 'OpenDN'

  $deadline = (Get-Date).AddSeconds(120)
  do {
    Start-Sleep -Seconds 2
    $stamped = @(Get-ChildItem "$Base\out" -Filter '*.stamped.pdf' -ErrorAction SilentlyContinue)
    $flagged = @(Get-ChildItem "$Base\out\review" -Filter '*.reason.txt' -ErrorAction SilentlyContinue)
  } until (($stamped.Count + $flagged.Count) -gt 0 -or (Get-Date) -gt $deadline)

  Get-ChildItem -Recurse $Base | Select-Object FullName, Length | Format-Table -AutoSize | Out-String | Write-Host
  foreach ($f in $flagged) { Write-Host "review reason: $(Get-Content $f.FullName -Raw)" }
  if ($stamped.Count -eq 0) { throw 'no stamped PDF was produced' }

  $payload = Get-Content ($stamped[0].FullName -replace '\.pdf$', '.payload.txt') -Raw
  Write-Host "payload:`n$payload"
  if ($payload -notmatch 'NOTE: HB-88231' -or $payload -notmatch '7734001 \| Sharp Sand 25kg Bag \| 40') {
    throw 'the payload does not match the printed note'
  }
  Write-Host 'PASS: printed to OpenDN -> captured -> stamped, payload matches the note'
} finally {
  & $Exe printer uninstall
  Remove-Item -Recurse -Force $Base -ErrorAction SilentlyContinue
}
