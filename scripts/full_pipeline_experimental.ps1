param(
    [string]$AdbPath = "C:\LDPlayer\LDPlayer9\adb.exe",
    [string]$DeviceId = "",
    [string]$RemotePath = "/sdcard/Android/data/com.gravityus.romgzeny.aos/files",
    [string]$LocalMirror = "C:\Users\braya\romc-android",
    [string]$GameSubPath = "files\Android",
    [string]$Output = "data_experimental",
    [string]$DatasetRoot = "exports\datasets_experimental",
    [string[]]$Modules = @("items", "monsters", "skills", "classes", "formulas", "icons", "buffs", "rewards"),
    [string]$Python = "",
    [switch]$SkipPull,
    [string]$Tag = "",
    [string]$ExtractedAt = ""
)

$commonParams = @{
    AdbPath      = $AdbPath
    DeviceId     = $DeviceId
    RemotePath   = $RemotePath
    LocalMirror  = $LocalMirror
    GameSubPath  = $GameSubPath
    Output       = $Output
    DatasetRoot  = $DatasetRoot
    Modules      = $Modules
    Python       = $Python
    SkipPull     = $SkipPull
    Tag          = $Tag
    ExtractedAt  = $ExtractedAt
}

$fullPipelineScript = Join-Path $PSScriptRoot "full_pipeline.ps1"
& $fullPipelineScript @commonParams
