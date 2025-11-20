param(
    [string]$AdbPath = "C:\LDPlayer\LDPlayer9\adb.exe",
    [string]$DeviceId = "",
    [string]$RemotePath = "/sdcard/Android/data/com.gravityus.romgzeny.aos/files",
    [string]$LocalMirror = "C:\Users\braya\romc-android",
    [string]$GameSubPath = "files\Android",
    [string]$Output = "data",
    [string]$DatasetRoot = "exports\datasets",
    [string[]]$Modules = @("items", "monsters", "skills", "classes", "formulas", "icons", "buffs", "rewards"),
    [string]$Python = "",
    [switch]$SkipPull,
    [string]$Tag = "",
    [string]$ExtractedAt = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $repoRoot "src"
$outputPath = Join-Path $repoRoot $Output
$datasetRootPath = Join-Path $repoRoot $DatasetRoot
$datasetTag = if ([string]::IsNullOrWhiteSpace($Tag)) { Get-Date -Format "yyyyMMdd_HHmmss" } else { $Tag }
$extractedAtValue = ""
if ([string]::IsNullOrWhiteSpace($ExtractedAt)) {
    $extractedAtValue = (Get-Date).ToUniversalTime().ToString("o")
} else {
    try {
        $extractedAtValue = ([DateTime]::Parse($ExtractedAt)).ToUniversalTime().ToString("o")
    } catch {
        throw "Invalid -ExtractedAt value '$ExtractedAt'. Use a parsable date (e.g. 2025-11-05 or ISO timestamp)."
    }
}

if (-not $SkipPull -and -not (Test-Path $AdbPath)) {
    throw "ADB binary not found: $AdbPath"
}

if (-not $Python) {
    $venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $Python = $venvPython
    } else {
        $Python = "python"
    }
}

function Get-AdbDevices {
    param(
        [string]$AdbPath
    )
    $raw = & $AdbPath devices
    $list = @()
    foreach ($line in $raw) {
        if ($line -match "^\s*([\w\-\.:]+)\s+device$") {
            $list += $matches[1]
        }
    }
    return $list
}

if (-not $SkipPull) {
    $availableDevices = Get-AdbDevices -AdbPath $AdbPath
    if (-not $availableDevices -or $availableDevices.Count -eq 0) {
        throw "No Android device/emulator detected through ADB."
    }
    if (-not $DeviceId) {
        $DeviceId = $availableDevices[0]
        if ($availableDevices.Count -gt 1) {
            Write-Warning ("Multiple devices detected ({0}). Defaulting to {1}. Use -DeviceId to override." -f ($availableDevices -join ", "), $DeviceId)
        }
    } elseif (-not ($availableDevices -contains $DeviceId)) {
        throw "Device '$DeviceId' is not listed in 'adb devices'. Available: $($availableDevices -join ', ')"
    }
    Write-Host "Using ADB device: $DeviceId"

    $adbArgsPrefix = @()
    if ($DeviceId) {
        $adbArgsPrefix += "-s"
        $adbArgsPrefix += $DeviceId
    }

    Write-Host "Mirroring remote files from $RemotePath ..."
    if (Test-Path $LocalMirror) {
        Remove-Item -LiteralPath $LocalMirror -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $LocalMirror | Out-Null

    $pullArgs = @()
    $pullArgs += $adbArgsPrefix
    $pullArgs += @("pull", $RemotePath, $LocalMirror)

    & $AdbPath @pullArgs
    if ($LASTEXITCODE -ne 0) {
        throw "ADB pull failed with exit code $LASTEXITCODE"
    }
} else {
    if (-not (Test-Path $LocalMirror)) {
        throw "SkipPull specified but local mirror '$LocalMirror' does not exist."
    }
    Write-Host "Skipping ADB pull, reusing existing local mirror at $LocalMirror"
}

$gameRootPath = if ([string]::IsNullOrWhiteSpace($GameSubPath)) { $LocalMirror } else { Join-Path $LocalMirror $GameSubPath }
if (-not (Test-Path $gameRootPath)) {
    throw "Game root '$gameRootPath' not found after pull. Check -GameSubPath."
}
Write-Host "Game assets ready at $gameRootPath"

if (-not (Test-Path $outputPath)) {
    New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
}

$previousPyPath = $env:PYTHONPATH
$env:PYTHONPATH = $srcPath

foreach ($module in $Modules) {
    Write-Host ">>> Extracting $module ..."
    $args = @(
        "-m", "romc_data_extractor.cli",
        "--game-root", $gameRootPath,
        "--output", $outputPath,
        "--modules", $module,
        "--extracted-at", $extractedAtValue
    )
    $commandOutput = & $Python @args 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $env:PYTHONPATH = $previousPyPath
        throw "Module '$module' failed (exit code $exitCode). Details:`n$commandOutput"
    }
    Write-Host $commandOutput
}

$metadataPath = Join-Path $outputPath "metadata.json"
$metadata = @{
    dataset_tag = $datasetTag
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    source_extracted_at = $extractedAtValue
    modules = $Modules
    game_root = $gameRootPath
}
$metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

$bundleManifestPath = Join-Path $outputPath "bundle_manifest.json"
$bundleScript = Join-Path $repoRoot "scripts/list_bundles.py"
$bundleArgs = @(
    $bundleScript,
    "--game-root", $gameRootPath,
    "--output", $bundleManifestPath,
    "--dataset-tag", $datasetTag
)
& $Python @bundleArgs
if ($LASTEXITCODE -ne 0) {
    throw "Bundle manifest generation failed with exit code $LASTEXITCODE"
}

$env:PYTHONPATH = $previousPyPath

New-Item -ItemType Directory -Force -Path $datasetRootPath | Out-Null
$datasetDir = Join-Path $datasetRootPath $datasetTag
if (Test-Path $datasetDir) {
    Remove-Item -LiteralPath $datasetDir -Recurse -Force
}
New-Item -ItemType Directory -Path $datasetDir | Out-Null
Get-ChildItem -LiteralPath $outputPath | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $datasetDir -Recurse
}
Write-Host "Snapshot stored at $datasetDir"

function Show-JsonSummary {
    param(
        [string]$FileName,
        [string]$Label
    )
    $filePath = Join-Path $outputPath $FileName
    if (Test-Path $filePath) {
        $json = Get-Content -LiteralPath $filePath -Raw | ConvertFrom-Json
        $total = if ($json.PSObject.Properties.Name -contains "total") { $json.total } else { "n/a" }
        $langs = if ($json.PSObject.Properties.Name -contains "languages") { ($json.languages -join ", ") } else { "n/a" }
        $timestamp = if ($json.PSObject.Properties.Name -contains "extracted_at") { $json.extracted_at } else { "n/a" }
        Write-Host ("  {0}: total={1}, extracted_at={2}, languages={3}" -f $Label, $total, $timestamp, $langs)
    } else {
        Write-Warning "  Missing expected file: $filePath"
    }
}

Write-Host "Summary of freshly extracted JSON files:"
Show-JsonSummary -FileName "items.json" -Label "Items"
Show-JsonSummary -FileName "monsters.json" -Label "Monsters"
Show-JsonSummary -FileName "skills.json" -Label "Skills"
Show-JsonSummary -FileName "classes.json" -Label "Classes"

$manifestPath = Join-Path $outputPath "icon_manifest.json"
if (Test-Path $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    Write-Host ("  Icons: {0} / {1} resolved" -f $manifest.found, $manifest.total)
}

Write-Host "Full extraction pipeline completed successfully."
