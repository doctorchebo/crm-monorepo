#!/usr/bin/env pwsh
# Download FFmpeg static binaries for ARM64 Lambda
# This script downloads pre-built ffmpeg binaries suitable for AWS Lambda ARM64

$ErrorActionPreference = "Stop"

$layerDir = Join-Path $PSScriptRoot "..\layers\ffmpeg"
$binDir = Join-Path $layerDir "bin"

# Create directories
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

Write-Host "Downloading FFmpeg static binaries for ARM64..."

# Download from John Van Sickle's static builds (ARM64/aarch64)
$ffmpegUrl = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
$downloadPath = Join-Path $env:TEMP "ffmpeg-arm64.tar.xz"
$extractPath = Join-Path $env:TEMP "ffmpeg-arm64"

try {
    # Download
    Write-Host "Downloading from $ffmpegUrl..."
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $downloadPath -UseBasicParsing

    # Create extraction directory
    New-Item -ItemType Directory -Force -Path $extractPath | Out-Null

    # Extract using tar (available on Windows 10+)
    Write-Host "Extracting..."
    tar -xf $downloadPath -C $extractPath

    # Find the extracted directory
    $extractedDir = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1

    # Copy binaries
    Write-Host "Copying binaries to layer..."
    Copy-Item -Path (Join-Path $extractedDir.FullName "ffmpeg") -Destination (Join-Path $binDir "ffmpeg") -Force
    Copy-Item -Path (Join-Path $extractedDir.FullName "ffprobe") -Destination (Join-Path $binDir "ffprobe") -Force

    Write-Host "FFmpeg binaries downloaded successfully!"
    Write-Host "Location: $binDir"

    # Show binary info
    & (Join-Path $binDir "ffmpeg") -version 2>&1 | Select-Object -First 1
}
finally {
    # Cleanup
    if (Test-Path $downloadPath) { Remove-Item $downloadPath -Force }
    if (Test-Path $extractPath) { Remove-Item $extractPath -Recurse -Force }
}
