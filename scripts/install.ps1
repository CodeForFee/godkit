[CmdletBinding()]
param(
  [string]$Source,
  [string]$Project = (Get-Location).Path,
  [string]$HomeDirectory = $(if ($env:GODKIT_HOME) { $env:GODKIT_HOME } else { Join-Path $env:USERPROFILE '.godkit' }),
  [string]$RuntimeLock,
  [string]$NodePath,
  [switch]$ProjectOnly,
  [switch]$ForceRuntime,
  [switch]$Rollback
)
$ErrorActionPreference = 'Stop'
$release = '1.1.0'
function Get-Download([string]$Url, [string]$Destination) {
  if ($Url.StartsWith('file://')) { Copy-Item -LiteralPath ([Uri]$Url).LocalPath -Destination $Destination; return }
  if ($Url -notmatch '^https://' -and $Url -notmatch '^http://(127\.0\.0\.1|localhost):') { throw 'Unsupported download URL' }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 180
}
function Test-Node([string]$Candidate) {
  if (-not $Candidate -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $false }
  try { $v = & $Candidate --version 2>$null; return ($LASTEXITCODE -eq 0 -and $v -match '^v(22|24|26)\.') } catch { return $false }
}
$HomeDirectory = [IO.Path]::GetFullPath($HomeDirectory)
[IO.Directory]::CreateDirectory($HomeDirectory) | Out-Null
$scratch = Join-Path $HomeDirectory ('.bootstrap-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
try {
  if (-not $RuntimeLock) {
    $RuntimeLock = Join-Path $PSScriptRoot 'runtime-lock.json'
    if (-not (Test-Path -LiteralPath $RuntimeLock)) { $RuntimeLock = Join-Path $scratch 'runtime-lock.json'; Get-Download "https://github.com/CodeForFee/godkit/releases/download/v$release/runtime-lock.json" $RuntimeLock }
  }
  $lock = Get-Content -LiteralPath $RuntimeLock -Raw | ConvertFrom-Json
  if ($lock.godkitVersion -ne $release) { throw 'Runtime lock belongs to a different Godkit release' }
  if ($NodePath) { if (-not (Test-Node $NodePath)) { throw 'Selected Node must be a supported LTS runtime (22, 24 or 26)' } }
  elseif (-not $ForceRuntime) { $candidate = Get-Command node -ErrorAction SilentlyContinue; if ($candidate -and (Test-Node $candidate.Source)) { $NodePath = $candidate.Source } }
  if (-not $NodePath) {
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    if ($lock.version -notmatch '^24\.\d+\.\d+$') { throw 'Runtime lock must pin a Node 24 version' }
    $archive = $lock.archives."win-$architecture"
    if (-not $archive -or $archive.file -notmatch '^node-v24\.\d+\.\d+-win-(x64|arm64)\.zip$' -or $archive.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'Invalid pinned runtime archive/checksum' }
    $runtimeDirectory = Join-Path $HomeDirectory "runtime\$($lock.version)-win-$architecture"
    $NodePath = Join-Path $runtimeDirectory 'node.exe'
    if (-not (Test-Node $NodePath)) {
      $download = Join-Path $scratch $archive.file
      Get-Download "$($lock.baseUrl)/$($archive.file)" $download
      if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archive.sha256) { throw 'Runtime checksum mismatch; existing installation kept' }
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [IO.Compression.ZipFile]::OpenRead($download)
      try { foreach ($entry in $zip.Entries) { if ($entry.FullName -match '(^[\\/]|^[A-Za-z]:|(^|[\\/])\.\.([\\/]|$))') { throw 'Unsafe runtime archive path' } } } finally { $zip.Dispose() }
      $unpack = Join-Path $scratch 'runtime'
      # Windows' built-in tar handles npm's long archive paths where PS5 Expand-Archive fails.
      $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
      if ($tar) {
        [IO.Directory]::CreateDirectory($unpack) | Out-Null
        & $tar.Source -xf $download -C $unpack
        if ($LASTEXITCODE -ne 0) { throw 'Runtime archive extraction failed' }
      } else { [IO.Compression.ZipFile]::ExtractToDirectory($download, $unpack) }
      $runtimeSource = Join-Path $unpack ([IO.Path]::GetFileNameWithoutExtension($archive.file))
      if (-not (Test-Node (Join-Path $runtimeSource 'node.exe'))) { throw 'Downloaded runtime failed its version check' }
      if (Test-Path -LiteralPath $runtimeDirectory) { throw 'Existing runtime is damaged; remove it explicitly before retrying' }
      [IO.Directory]::CreateDirectory((Split-Path -Parent $runtimeDirectory)) | Out-Null
      Move-Item -LiteralPath $runtimeSource -Destination $runtimeDirectory
    }
  }
  $NodePath = [IO.Path]::GetFullPath($NodePath)
  if ($Source -and (Test-Path -LiteralPath $Source -PathType Container) -and (Test-Path -LiteralPath (Join-Path $Source 'bin/bootstrap.js') -PathType Leaf)) { $payload = [IO.Path]::GetFullPath($Source) }
  elseif (Test-Path -LiteralPath (Join-Path $PSScriptRoot '../bin/bootstrap.js')) { $payload = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
  else {
    $nodeDirectory = Split-Path -Parent $NodePath
    $npm = Join-Path $nodeDirectory 'node_modules/npm/bin/npm-cli.js'
    if (-not (Test-Path -LiteralPath $npm)) { $npm = Join-Path $nodeDirectory '../lib/node_modules/npm/bin/npm-cli.js' }
    if (-not (Test-Path -LiteralPath $npm)) { throw 'Selected runtime has no npm; rerun with -ForceRuntime' }
    $payloadSpec = "@codeforfee/godkit@$release"
    if ($Source -and (Test-Path -LiteralPath $Source -PathType Leaf)) { $payloadSpec = [IO.Path]::GetFullPath($Source) }
    & $NodePath $npm install --prefix (Join-Path $scratch 'payload') --ignore-scripts --no-audit --no-fund --package-lock=false -- $payloadSpec
    if ($LASTEXITCODE -ne 0) { throw 'Godkit package download failed' }
    $payload = Join-Path $scratch 'payload/node_modules/@codeforfee/godkit'
  }
  $bootstrapArgs = @((Join-Path $payload 'bin/bootstrap.js'), '--project', $Project, '--home', $HomeDirectory)
  if ($Source) { $bootstrapArgs += @('--source', $Source) }
  if ($ProjectOnly) { $bootstrapArgs += '--project-only' }
  if ($Rollback) { $bootstrapArgs += '--rollback' }
  & $NodePath @bootstrapArgs
  if ($LASTEXITCODE -ne 0) { throw "Godkit installation failed (exit $LASTEXITCODE)" }
} finally {
  $resolvedScratch = [IO.Path]::GetFullPath($scratch)
  if (-not $resolvedScratch.StartsWith($HomeDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe bootstrap cleanup path' }
  if (Test-Path -LiteralPath $resolvedScratch) { Remove-Item -LiteralPath $resolvedScratch -Recurse -Force }
}
