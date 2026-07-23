$ErrorActionPreference = 'Stop'

# Edit these values before the first provisioning run.
$GLF_REPOSITORY_URL = 'https://github.com/giulioleuci/GasLibraryFactory.git'
$GLF_BRANCH = 'main'
$MASTER_TITLE = 'ALDO — Master'
$MASTER_FOLDER_PATH = 'ALDO/Produzione/Master'

$ALDO_ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GLF_DIR = Join-Path $ALDO_ROOT 'GasLibraryFactory'
$DIST_DIR = Join-Path $ALDO_ROOT 'dist'
$REPO_INFO_FILE = Join-Path $ALDO_ROOT 'REPO_FOR_GLF.txt'
$TEMP_DIR = Join-Path ([System.IO.Path]::GetTempPath()) ("aldo-bound-master-$([System.Guid]::NewGuid().ToString('N'))")
$succeeded = $false

function Require-Command([string]$Name) {
  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando richiesto non trovato: $Name"
  }
}

function Assert-LastExitCode([string]$Operation) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Operation non riuscita (exit code $LASTEXITCODE)."
  }
}

Require-Command git
Require-Command npm
Require-Command npx

& npx --prefix $ALDO_ROOT clasp show-authorized-user *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Autorizzazione clasp assente o scaduta: completa il login nel browser.'
  & npx --prefix $ALDO_ROOT clasp login
  Assert-LastExitCode 'clasp login'
}

if (-not (Test-Path (Join-Path $GLF_DIR '.git'))) {
  & git clone --branch $GLF_BRANCH --single-branch $GLF_REPOSITORY_URL $GLF_DIR
  Assert-LastExitCode 'Clone di GasLibraryFactory'
}
else {
  if ((git -C $GLF_DIR status --porcelain)) {
    throw 'GasLibraryFactory contiene modifiche locali: aggiornamento interrotto per non sovrascriverle.'
  }
  & git -C $GLF_DIR fetch origin $GLF_BRANCH
  Assert-LastExitCode 'Fetch di GasLibraryFactory'
  & git -C $GLF_DIR checkout $GLF_BRANCH
  Assert-LastExitCode 'Checkout del ramo GasLibraryFactory'
  & git -C $GLF_DIR pull --ff-only origin $GLF_BRANCH
  Assert-LastExitCode 'Aggiornamento di GasLibraryFactory'
}

$GLF_COMMIT = (git -C $GLF_DIR rev-parse HEAD).Trim()
Assert-LastExitCode 'Lettura della revisione GasLibraryFactory'
@(
  "repository=$GLF_REPOSITORY_URL"
  "branch=$GLF_BRANCH"
  "commit=$GLF_COMMIT"
) | Set-Content -Path $REPO_INFO_FILE -Encoding utf8

Push-Location $ALDO_ROOT
try {
  & npm run refresh:vendor
  Assert-LastExitCode 'Aggiornamento del vendor'
  & npm run build:production
  Assert-LastExitCode 'Build di produzione'
}
finally {
  Pop-Location
}

New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null
try {
  Push-Location $TEMP_DIR
  try {
    & npx --prefix $ALDO_ROOT clasp create --type sheets --title $MASTER_TITLE --rootDir $DIST_DIR
    Assert-LastExitCode 'Creazione del progetto Apps Script bound'
    & npx --prefix $ALDO_ROOT clasp push
    Assert-LastExitCode 'Push del progetto Apps Script'
  }
  finally {
    Pop-Location
  }
  $succeeded = $true
}
finally {
  if ($succeeded) {
    Remove-Item -Recurse -Force $TEMP_DIR
  }
  else {
    Write-Warning "Provisioning non completato. Directory temporanea mantenuta: $TEMP_DIR"
  }
}

Write-Host "Master creato nella Drive root. Spostalo manualmente in: $MASTER_FOLDER_PATH"
Write-Host "Revision GLF registrata in: $REPO_INFO_FILE"
