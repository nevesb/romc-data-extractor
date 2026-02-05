<#
.SYNOPSIS
    One-click setup for ROMC Data Extractor + RuneAtlas web app.
.DESCRIPTION
    This script:
      1. Creates a Python virtual environment and installs dependencies
      2. Starts MongoDB via Docker Compose
      3. Extracts game data from LDPlayer via ADB (if emulator is running)
      4. Loads extracted data into MongoDB
      5. Installs web app dependencies and starts the dev server

    Run with: .\setup.ps1
    Or step-by-step: .\setup.ps1 -Step extract
#>

param(
    [ValidateSet("all", "python", "docker", "extract", "load", "web")]
    [string]$Step = "all",

    [string]$AdbPath = "C:\LDPlayer\LDPlayer9\adb.exe",
    [string]$Tag = (Get-Date -Format "yyyyMMdd"),
    [string]$MongoUri = "mongodb://romc:romc@localhost:27017",
    [string]$Database = "romc",
    [string]$Modules = "items monsters skills formulas icons buffs rewards"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
    Write-Host ""
}

# ---------- 1. Python ----------
function Setup-Python {
    Write-Step "Setting up Python virtual environment"

    if (-not (Test-Path "$root\.venv")) {
        python -m venv "$root\.venv"
    }

    & "$root\.venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
    & "$root\.venv\Scripts\python.exe" -m pip install -r "$root\requirements.txt" --quiet

    Write-Host "Python environment ready." -ForegroundColor Green
}

# ---------- 2. Docker ----------
function Setup-Docker {
    Write-Step "Starting MongoDB with Docker Compose"

    if (-not (Test-Path "$root\.env")) {
        Copy-Item "$root\.env.example" "$root\.env"
        Write-Host "Created .env from .env.example"
    }

    docker compose -f "$root\docker-compose.yml" up -d

    # Wait for MongoDB to be ready
    Write-Host "Waiting for MongoDB..." -NoNewline
    $retries = 0
    while ($retries -lt 15) {
        try {
            $result = docker exec romc-mongodb mongosh --quiet --eval "db.runCommand({ping:1}).ok" 2>$null
            if ($result -match "1") {
                Write-Host " ready!" -ForegroundColor Green
                return
            }
        } catch {}
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
        $retries++
    }
    Write-Host " (timeout - check docker logs)" -ForegroundColor Yellow
}

# ---------- 3. Extract ----------
function Run-Extract {
    Write-Step "Extracting game data from LDPlayer (tag: $Tag)"

    if (-not (Test-Path $AdbPath)) {
        Write-Host "ADB not found at $AdbPath" -ForegroundColor Red
        Write-Host "Make sure LDPlayer is installed or pass -AdbPath <path>" -ForegroundColor Yellow
        Write-Host "Skipping extraction step." -ForegroundColor Yellow
        return
    }

    # Check if emulator is connected
    $devices = & $AdbPath devices 2>&1
    if ($devices -notmatch "device$") {
        Write-Host "No ADB device found. Make sure LDPlayer is running with ADB enabled." -ForegroundColor Red
        Write-Host "Skipping extraction step." -ForegroundColor Yellow
        return
    }

    $env:PYTHONPATH = "$root\src"
    & "$root\.venv\Scripts\python.exe" -m romc_data_extractor.ldplayer_pipeline `
        --adb-path $AdbPath `
        --tag $Tag `
        --modules $Modules.Split(" ")

    Write-Host "Extraction complete! Files in exports/mongo/$Tag/" -ForegroundColor Green
}

# ---------- 4. Load ----------
function Run-Load {
    Write-Step "Loading data into MongoDB (tag: $Tag)"

    $datasetDir = "$root\exports\mongo\$Tag"
    if (-not (Test-Path $datasetDir)) {
        # Try to find the latest dataset
        $latest = Get-ChildItem "$root\exports\mongo" -Directory -ErrorAction SilentlyContinue |
                  Sort-Object Name -Descending |
                  Select-Object -First 1
        if ($latest) {
            $datasetDir = $latest.FullName
            Write-Host "Using latest dataset: $($latest.Name)" -ForegroundColor Yellow
        } else {
            Write-Host "No dataset found in exports/mongo/. Run extraction first." -ForegroundColor Red
            Write-Host "Skipping load step." -ForegroundColor Yellow
            return
        }
    }

    $env:PYTHONPATH = "$root\src"
    & "$root\.venv\Scripts\python.exe" -m romc_data_extractor.mongo_loader `
        --mongo-uri $MongoUri `
        --database $Database `
        --dataset $datasetDir `
        --drop-first

    Write-Host "Data loaded into MongoDB!" -ForegroundColor Green
}

# ---------- 5. Web ----------
function Setup-Web {
    Write-Step "Setting up RuneAtlas web app"

    $webDir = "$root\web\runeatlas"

    if (-not (Test-Path "$webDir\.env")) {
        Copy-Item "$webDir\.env.example" "$webDir\.env"
        Write-Host "Created web/.env from .env.example"
    }

    Push-Location $webDir
    try {
        npm install --silent
        Write-Host ""
        Write-Host "Starting dev server at http://localhost:3000" -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
        Write-Host ""
        npm run dev
    } finally {
        Pop-Location
    }
}

# ---------- Run ----------
switch ($Step) {
    "python"  { Setup-Python }
    "docker"  { Setup-Docker }
    "extract" { Setup-Python; Run-Extract }
    "load"    { Setup-Python; Setup-Docker; Run-Load }
    "web"     { Setup-Web }
    "all"     {
        Setup-Python
        Setup-Docker
        Run-Extract
        Run-Load
        Setup-Web
    }
}
