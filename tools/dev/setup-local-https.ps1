$ErrorActionPreference = 'Stop'

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  throw 'mkcert is required. Install it with: winget install FiloSottile.mkcert'
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$certificateDirectory = Join-Path $repoRoot '.cert'
$certificatePath = Join-Path $certificateDirectory 'powderline-local.pem'
$keyPath = Join-Path $certificateDirectory 'powderline-local-key.pem'
$lanAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.PrefixOrigin -ne 'WellKnown'
  } |
  Select-Object -ExpandProperty IPAddress -Unique)

if ($lanAddresses.Count -eq 0) {
  throw 'No active LAN IPv4 address was found. Connect to the test network and retry.'
}

New-Item -ItemType Directory -Force -Path $certificateDirectory | Out-Null
mkcert -install
& mkcert -cert-file $certificatePath -key-file $keyPath localhost 127.0.0.1 ::1 @lanAddresses

Write-Host "Trusted local certificate created for: $($lanAddresses -join ', ')"
Write-Host 'Run npm run dev:https, then open the printed Network HTTPS URL.'
Write-Host "Install the mkcert root CA on iOS/iPadOS and enable full trust: $(mkcert -CAROOT)"
