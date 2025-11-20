param(
    [string]$GameRoot = "C:\Users\braya\romc-android",
    [string]$Output = "data",
    [string[]]$Modules = @("items", "monsters", "skills", "classes", "formulas", "icons", "buffs"),
    [string]$Python = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $repoRoot "src"

if (-not $Python) {
    $venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        $Python = $venvPython
    } else {
        $Python = "python"
    }
}

$previousPyPath = $env:PYTHONPATH
$env:PYTHONPATH = $srcPath

$results = @()

foreach ($module in $Modules) {
    Write-Host ">>> Extracting $module ..."
    $args = @(
        "-m", "romc_data_extractor.cli",
        "--game-root", $GameRoot,
        "--output", $Output,
        "--modules", $module
    )

    try {
        $output = & $Python @args 2>&1
        $exitCode = $LASTEXITCODE
    } catch {
        $output = $_.Exception.Message
        $exitCode = 1
    }

    if ($exitCode -ne 0) {
        Write-Warning "Module '$module' failed (exit code $exitCode). See details below:`n$output"
    } else {
        Write-Host $output
    }
    $results += [pscustomobject]@{
        Module = $module
        ExitCode = $exitCode
    }
}

$env:PYTHONPATH = $previousPyPath

Write-Host "`nSummary:"
foreach ($res in $results) {
    if ($res.ExitCode -eq 0) {
        Write-Host ("  [OK]  {0}" -f $res.Module)
    } else {
        Write-Host ("  [ERR] {0} (exit code {1})" -f $res.Module, $res.ExitCode)
    }
}

if ($results.Where({ $_.ExitCode -ne 0 }).Count -gt 0) {
    throw "One or more modules failed. See log above."
}
