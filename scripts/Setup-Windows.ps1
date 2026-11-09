[CmdletBinding(SupportsShouldProcess=$true)]
param([ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,[ValidatePattern('^[a-zA-Z0-9._:-]+$')][string]$Model='qwen3.5:4b',[switch]$InstallOllama,[switch]$RefreshModel,[switch]$NoAutoStart)
$ErrorActionPreference='Stop'
if ($Model -match 'cloud') { throw 'Choose a local model.' }
if ($WhatIfPreference) { Write-Output 'Plan: check/install Ollama, allow your extension on loopback, download the local model if missing, configure sign-in startup unless -NoAutoStart. No changes made.'; return }
if (-not $ExtensionId) { $ExtensionId=(Read-Host 'Paste the Extension ID from Quizit! Preferences').Trim() }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'Copy the 32-character Extension ID from Preferences.' }
if (-not $PSCmdlet.ShouldProcess('Quizit local AI and optional sign-in startup','Set up')) { return }
function Find-Ollama {
 $command=Get-Command ollama -ErrorAction SilentlyContinue
 if ($command) { return $command.Source }
 $candidate=Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
 if (Test-Path -LiteralPath $candidate) { return $candidate }
 return $null
}
$ollamaPath=Find-Ollama
if (-not $ollamaPath) {
 if (-not $InstallOllama) { $InstallOllama=(Read-Host 'Install the official Ollama winget package? [Y/n]') -notmatch '^(n|no)$' }
 if ($InstallOllama -and (Get-Command winget -ErrorAction SilentlyContinue)) {
  & winget install --id Ollama.Ollama --exact --source winget
  if ($LASTEXITCODE -ne 0) { throw 'Installation did not finish. Install from https://ollama.com/download/windows then retry.' }
  $ollamaPath=Find-Ollama
 }
}
if (-not $ollamaPath) { throw 'Install Ollama from https://ollama.com/download/windows then retry.' }
$origin="chrome-extension://$ExtensionId"
$previous=[Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS','User')
$allowedOrigins=@($previous -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^chrome-extension://[a-p]{32}$' })
$env:OLLAMA_ORIGINS=(@($allowedOrigins+$origin) | Select-Object -Unique) -join ','
$env:OLLAMA_HOST='127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD='1'
$base='http://127.0.0.1:11434'
$running=$false
try { $null=Invoke-RestMethod "$base/api/tags" -TimeoutSec 3; $running=$true } catch {}
if ($running) {
 try {
  $probe=Invoke-WebRequest -UseBasicParsing "$base/api/tags" -Headers @{Origin=$origin} -TimeoutSec 5
  $allowed=[string]$probe.Headers['Access-Control-Allow-Origin']
  if ($allowed -ne $origin -and $allowed -ne '*') { throw 'Origin rejected' }
 } catch { throw 'Ollama is already running with different access settings. Quit its tray app, then run setup again. No process was stopped.' }
} else {
 Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
 $ready=$false
 for ($attempt=0;$attempt -lt 60;$attempt++) {
  try { $null=Invoke-RestMethod "$base/api/tags" -TimeoutSec 2; $ready=$true; break } catch { Start-Sleep -Milliseconds 500 }
 }
 if (-not $ready) { throw 'Ollama did not become ready. Open Ollama once then retry.' }
}
$tags=Invoke-RestMethod "$base/api/tags" -TimeoutSec 10
$found=@($tags.models | Where-Object { ($_.name -eq $Model -or $_.name -eq "$($Model):latest") -and -not $_.remote_model -and -not $_.remote_host })
if (-not $found.Count -or $RefreshModel) {
 & $ollamaPath pull $Model
 if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Rerun setup to resume.' }
}
$tags=Invoke-RestMethod "$base/api/tags" -TimeoutSec 10
if (-not @($tags.models | Where-Object { ($_.name -eq $Model -or $_.name -eq "$($Model):latest") -and -not $_.remote_model -and -not $_.remote_host }).Count) { throw 'Local model not found after setup.' }
if (-not $NoAutoStart) {
 $appPath=Join-Path (Split-Path $ollamaPath) 'ollama app.exe'
 if (-not (Test-Path -LiteralPath $appPath)) { throw 'Automatic startup requires the official Ollama Windows app. Install the official app or rerun with -NoAutoStart.' }
 foreach ($setting in @('OLLAMA_HOST','OLLAMA_ORIGINS','OLLAMA_NO_CLOUD')) { [Environment]::SetEnvironmentVariable($setting,[Environment]::GetEnvironmentVariable($setting,'Process'),'User') }
 $startup=[Environment]::GetFolderPath('Startup')
 $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startup 'Quizit Local AI.lnk'))
 $shortcut.TargetPath=$appPath
 $shortcut.Arguments=''
 $shortcut.WindowStyle=7
 $shortcut.Description='Start the official Ollama tray app for Quizit at sign-in'
 $shortcut.Save()
}
Write-Output "Ready: $Model. Reopen Quizit! and click Start creating. No inference started."
if ($NoAutoStart) { Write-Output 'Startup not installed; rerun setup after reboot when needed.' } else { Write-Output 'Sign-in startup configured. Model unload remains enabled. Remove Quizit Local AI from your Startup folder to disable automatic startup.' }
