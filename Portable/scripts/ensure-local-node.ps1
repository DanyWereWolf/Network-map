#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$RootDir,

    [string]$Version = '22.23.3',

    [int]$RequiredMajor = 20,

    [int]$RequiredMinor = 9
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-NodeVersionParts {
    param([string]$NodeExe)
    if (-not $NodeExe -or -not (Test-Path -LiteralPath $NodeExe)) { return $null }
    try {
        $raw = & $NodeExe -p "process.versions.node" 2>$null
        if (-not $raw) { return $null }
        $parts = ($raw.ToString().Trim() -split '\.') | ForEach-Object { [int]$_ }
        if ($parts.Count -lt 2) { return $null }
        return @{ Major = $parts[0]; Minor = $parts[1]; Raw = $raw.ToString().Trim() }
    } catch {
        return $null
    }
}

function Test-NodeOk {
    param($Info)
    if (-not $Info) { return $false }
    if ($Info.Major -lt $RequiredMajor) { return $false }
    if ($Info.Major -eq $RequiredMajor -and $Info.Minor -lt $RequiredMinor) { return $false }
    return $true
}

function Resolve-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    switch -Regex ($arch) {
        'ARM64' { return 'arm64' }
        'AMD64|x86_64|x64' { return 'x64' }
        default { throw "Unsupported Windows arch: $arch (need x64 or arm64)" }
    }
}

$RootDir = (Resolve-Path -LiteralPath $RootDir).Path
$runtimeDir = Join-Path $RootDir '.runtime\node'
$marker = Join-Path $runtimeDir '.portable-node-version'
$localNode = Join-Path $runtimeDir 'node.exe'
$localNpm = Join-Path $runtimeDir 'npm.cmd'

$systemNodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($systemNodeCmd) {
    $sysInfo = Get-NodeVersionParts -NodeExe $systemNodeCmd.Source
    $npmOk = [bool](Get-Command npm -ErrorAction SilentlyContinue)
    if ((Test-NodeOk $sysInfo) -and $npmOk) {
        Write-Host "[Node] system v$($sysInfo.Raw) - OK"
        exit 0
    }
    if ($sysInfo) {
        Write-Host "[Node] system v$($sysInfo.Raw) too old (need >= $RequiredMajor.$RequiredMinor) - using local runtime"
    }
}

if ((Test-Path -LiteralPath $localNode) -and (Test-Path -LiteralPath $localNpm)) {
    $localInfo = Get-NodeVersionParts -NodeExe $localNode
    $wantSame = (Test-Path -LiteralPath $marker) -and ((Get-Content -LiteralPath $marker -Raw).Trim() -eq $Version)
    if ((Test-NodeOk $localInfo) -and $wantSame) {
        Write-Host "[Node] local v$($localInfo.Raw) (.runtime\node) - OK"
        exit 0
    }
}

$arch = Resolve-Arch
$archiveName = "node-v$Version-win-$arch.zip"
$url = "https://nodejs.org/dist/v$Version/$archiveName"
Write-Host "[Node] downloading portable Node.js v$Version ($arch)..."
Write-Host "[Node] $url"

$parent = Split-Path -Parent $runtimeDir
if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
if (Test-Path -LiteralPath $runtimeDir) {
    Remove-Item -LiteralPath $runtimeDir -Recurse -Force
}

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm-node-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
$zipPath = Join-Path $tmpRoot $archiveName
$extractDir = Join-Path $tmpRoot 'extract'

try {
    try {
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    } catch {
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            & curl.exe -fsSL -o $zipPath $url
            if ($LASTEXITCODE -ne 0) { throw "curl exit code $LASTEXITCODE" }
        } else {
            throw
        }
    }

    if (-not (Test-Path -LiteralPath $zipPath) -or (Get-Item -LiteralPath $zipPath).Length -lt 1MB) {
        throw "Archive missing or too small: $zipPath"
    }

    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

    $inner = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
    if (-not $inner) { throw "No Node.js folder inside archive" }

    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $runtimeDir -Recurse -Force

    if (-not (Test-Path -LiteralPath $localNode)) {
        throw "node.exe missing after extract: $localNode"
    }
    if (-not (Test-Path -LiteralPath $localNpm)) {
        throw "npm.cmd missing after extract: $localNpm"
    }

    Set-Content -LiteralPath $marker -Value $Version -NoNewline -Encoding ASCII
    $info = Get-NodeVersionParts -NodeExe $localNode
    if (-not (Test-NodeOk $info)) {
        throw "Downloaded Node failed version check"
    }
    Write-Host "[Node] installed local v$($info.Raw) -> .runtime\node"
    exit 0
} catch {
    Write-Host "[Error] Node.js download failed: $($_.Exception.Message)"
    Write-Host "Install manually: https://nodejs.org (need >= $RequiredMajor.$RequiredMinor)"
    exit 1
} finally {
    if (Test-Path -LiteralPath $tmpRoot) {
        Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}