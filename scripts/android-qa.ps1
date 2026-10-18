# Windows Android QA. Machine configuration and the batch lease are shared by all worktrees.
# See docs/agents/android-device-qa.md. Requires PowerShell 7.
[CmdletBinding()]
param(
  [Parameter(Position=0)][ValidateSet('init','status','claim','release','devices','emulator','build','install','metro','open','screenshot','record','mirror')][string]$Action='status',
  [string]$Owner, [string]$Batch,
  [ValidateSet('emulator','phone')][string]$Lane='emulator',
  [string]$Serial, [string]$Label='capture',
  [switch]$ViewOnly,
  [ValidateRange(1024,65535)][int]$MetroPort=8085,
  [ValidateRange(1,180)][int]$Seconds=30,
  [string]$QueueRoot
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
trap {
  if ($QueueRoot -and (Test-Path -LiteralPath $QueueRoot)) {
    @{ time=[DateTime]::UtcNow.ToString('o'); phase='failed'; action=$Action; owner=$Owner;
       batch=$Batch; code='ANDROID_QA_FAILED' } | ConvertTo-Json -Compress |
      Add-Content -LiteralPath (Join-Path $QueueRoot 'events.jsonl')
  }
  throw $_
}
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Use PowerShell 7 (pwsh).' }
$Repo = Split-Path $PSScriptRoot -Parent
function Run([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe exited $LASTEXITCODE" }
}
if (!$QueueRoot) {
  $common = & git -C $Repo rev-parse --path-format=absolute --git-common-dir
  if ($LASTEXITCODE -ne 0) { throw 'Not a Git worktree' }
  $QueueRoot = Join-Path (Split-Path $common -Parent) '.humanlayer/device-qa/windows'
}
$QueueRoot = [IO.Path]::GetFullPath($QueueRoot)
$ConfigPath = Join-Path $QueueRoot 'config.json'
$LeasePath = Join-Path $QueueRoot 'active.json'
function ReadJson([string]$Path) { Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
function Event([string]$Phase) {
  @{ time=[DateTime]::UtcNow.ToString('o'); phase=$Phase; owner=$Owner; batch=$Batch } |
    ConvertTo-Json -Compress | Add-Content -LiteralPath (Join-Path $QueueRoot 'events.jsonl')
}
if ($Action -eq 'init') {
  New-Item -ItemType Directory -Force -Path $QueueRoot | Out-Null
  if (!(Test-Path $ConfigPath)) {
    $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    $scrcpy = Get-Command scrcpy.exe -ErrorAction SilentlyContinue
    @{ sdk=$sdk; gradleHome=$env:GRADLE_USER_HOME; javaHome=$env:JAVA_HOME;
       scrcpy=$(if ($scrcpy) { $scrcpy.Source } else { 'scrcpy.exe' });
       avd='BotHarness_AX_Android'; emulatorPort=5580; nativeRoot=''; cmakeVersion='3.22.1' } |
      ConvertTo-Json | Set-Content -LiteralPath $ConfigPath
  }
  $queue = Join-Path $QueueRoot 'queue.md'
  if (!(Test-Path $queue)) {
    @'
# Windows Android QA queue

Owner: unassigned (the requesting Human/session assigns the owner).
Only the owner freezes batches and designates a runner. Read android-device-qa.md.

## Next batch

<!-- Copy per request: PR/issue, branch + head SHA, agent task, report destination,
native inputs changed?, emulator/phone, feature-map steps, visible/canonical proof,
light/dark screenshots, video, model/second Host/FCM/Human prerequisites. -->

## Active batch

None. Owner records batch branch + SHA, runner, lane, serial and ports before claim.

## Results

<!-- Batch + PR head + tested commit; each step pass/fail/untested with evidence;
native fingerprint/ABI, Host+Metro ownership, limitations and cleanup. -->
'@ | Set-Content -LiteralPath $queue
  }
  @{ queue=$queue; config=$ConfigPath } | ConvertTo-Json
  exit
}
if ($Action -eq 'status') {
  @{ queue=(Join-Path $QueueRoot 'queue.md'); config=$ConfigPath;
     active=$(if (Test-Path $LeasePath) { ReadJson $LeasePath } else { $null }) } | ConvertTo-Json -Depth 8
  exit
}
if (!(Test-Path $ConfigPath)) { throw 'Run init, then fill in the machine-local config.json.' }
$Config = ReadJson $ConfigPath
if ($Action -eq 'claim') {
  if (!$Owner -or $Batch -notmatch '^[a-z0-9][a-z0-9-]*$' -or !$Serial) { throw 'claim needs -Owner <task-id> -Batch <safe-name> -Serial <adb-serial> -Lane emulator|phone' }
  $stream = [IO.File]::Open($LeasePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $lease = @{ owner=$Owner; batch=$Batch; lane=$Lane; serial=$Serial; worktree=$Repo; metroPort=$MetroPort; started=[DateTime]::UtcNow.ToString('o') }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($lease | ConvertTo-Json))
    $stream.Write($bytes, 0, $bytes.Length)
  } finally { $stream.Dispose() }
  Event 'claimed'
  $lease | ConvertTo-Json
  exit
}
if ($Action -ne 'devices') {
  if (!(Test-Path $LeasePath)) { throw 'No batch lease. The queue owner must designate a runner before claim.' }
  $Lease = ReadJson $LeasePath
  if (!$Owner -or $Owner -cne $Lease.owner -or $Batch -cne $Lease.batch -or $Repo -ne $Lease.worktree) { throw 'Owner, batch and worktree must match the active lease.' }
  if ($Serial -and $Serial -cne $Lease.serial) { throw 'Serial differs from the active lease.' }
  $Serial=$Lease.serial; $Lane=$Lease.lane; $MetroPort=$Lease.metroPort
  if ($Action -eq 'release') {
    Remove-Item -LiteralPath $LeasePath
    Event 'released'
    exit
  }
}
$env:ANDROID_HOME=$Config.sdk; $env:ANDROID_SDK_ROOT=$Config.sdk
if ($Config.gradleHome) { $env:GRADLE_USER_HOME=$Config.gradleHome }
if ($Config.javaHome) { $env:JAVA_HOME=$Config.javaHome; $env:Path="$($Config.javaHome)/bin;$env:Path" }
$Adb=Join-Path $Config.sdk 'platform-tools/adb.exe'
if (!(Test-Path $Adb)) { throw 'Configured SDK has no platform-tools/adb.exe' }
$env:ADB=$Adb # scrcpy uses the same ADB as this helper, not a bundled older server.
if ($Action -eq 'devices') { Run $Adb @('devices','-l'); exit }
$Evidence=Join-Path $QueueRoot "evidence/$Batch/$Lane"
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
if ($Action -eq 'emulator') {
  if ($Lane -ne 'emulator' -or $Serial -ne "emulator-$($Config.emulatorPort)") { throw 'Lease must target the configured emulator port.' }
  $connected = & $Adb devices
  if ($connected -match "(?m)^$([regex]::Escape($Serial))\s") { throw 'Emulator already present; inspect it instead of starting another.' }
  Start-Process -FilePath (Join-Path $Config.sdk 'emulator/emulator.exe') -WorkingDirectory $Config.sdk -WindowStyle Hidden -ArgumentList @('-avd',$Config.avd,'-port',$Config.emulatorPort,'-no-snapshot-save')
  Event 'emulator-started'
  exit
}
if ($Action -eq 'metro') {
  $env:REACT_NATIVE_PACKAGER_HOSTNAME='127.0.0.1'
  $env:NODE_OPTIONS="$env:NODE_OPTIONS --dns-result-order=ipv4first".Trim()
  # Explicit fixed-source capture mode. Restart after JS changes.
  $env:CI='1'
  Run 'pnpm.cmd' @('--dir',"$Repo/apps/mobile",'start','--localhost','--port',"$MetroPort")
  exit
}
$state = & $Adb -s $Serial get-state 2>&1
if ($LASTEXITCODE -ne 0 -or "$state".Trim() -ne 'device') { throw 'Selected device is missing/offline/unauthorized. Connect USB and accept its debugging prompt.' }
$qemu = & $Adb -s $Serial shell getprop ro.kernel.qemu
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect device type' }
if (($Lane -eq 'emulator') -ne ("$qemu".Trim() -eq '1')) { throw 'Device type does not match the claimed lane.' }
if ($Action -eq 'build') {
  if (!$env:NODE_ENV) { $env:NODE_ENV='development' }
  if ($Repo.Length -gt 30) { throw 'Use a short physical batch worktree path (at most 30 characters, e.g. D:/bhqa/1). AGP launches prefab_command.bat inside pnpm dependencies; short CMake staging and modern Ninja alone cannot fix that Windows path limit.' }
  if (!$Config.javaHome -or !$Config.nativeRoot) { throw 'Set javaHome (JDK 17) and a short nativeRoot in config.json before building.' }
  $abi = (& $Adb -s $Serial shell getprop ro.product.cpu.abi).Trim()
  if ($LASTEXITCODE -ne 0 -or $abi -notin @('x86_64','arm64-v8a','armeabi-v7a','x86')) { throw 'Unsupported device ABI' }
  $ninja=Join-Path $Config.sdk "cmake/$($Config.cmakeVersion)/bin/ninja.exe"
  $version = & $ninja --version
  if ($LASTEXITCODE -ne 0 -or [version]$version -lt [version]'1.12.0') { throw 'Windows long paths require Ninja 1.12+; see runbook.' }
  Run 'pnpm.cmd' @('--dir',"$Repo/apps/mobile",'exec','expo','prebuild','--platform','android','--no-install')
  $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Repo))).Substring(0,8)
  $staging=(Join-Path $Config.nativeRoot $hash).Replace('\','/').Replace("'","\'")
  $init=Join-Path $Evidence 'short-paths.gradle'
  @"
allprojects { p ->
  ['com.android.application', 'com.android.library'].each { id ->
    p.plugins.withId(id) {
      p.android.externalNativeBuild.cmake.buildStagingDirectory = p.file('$staging/' + p.name)
    }
  }
}
"@ | Set-Content -LiteralPath $init
  Event 'build-started'
  Run "$Repo/apps/mobile/android/gradlew.bat" @('-p',"$Repo/apps/mobile/android",'app:assembleDebug',"-PreactNativeArchitectures=$abi","-PreactNativeDevServerPort=$MetroPort",'--init-script',$init,'--max-workers','4','--build-cache','--console=plain')
  @{ commit=(& git -C $Repo rev-parse HEAD); abi=$abi; time=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content "$Evidence/build.json"
  Event 'build-completed'
  exit
}
if ($Action -eq 'install') {
  Run $Adb @('-s',$Serial,'install','-r',"$Repo/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk")
  exit
}
if ($Action -eq 'open') {
  Run $Adb @('-s',$Serial,'reverse',"tcp:$MetroPort","tcp:$MetroPort")
  $url="exp+deepseekbot://expo-development-client/?url=$([uri]::EscapeDataString("http://127.0.0.1:$MetroPort"))"
  Run $Adb @('-s',$Serial,'shell','am','force-stop','ai.botharness.deepseekbot.dev')
  Run $Adb @('-s',$Serial,'shell','am','start','-a','android.intent.action.VIEW','-d',$url,'ai.botharness.deepseekbot.dev')
  exit
}
if ($Action -in @('screenshot','record')) {
  $focus = & $Adb -s $Serial shell dumpsys window
  if ($LASTEXITCODE -ne 0 -or ($focus -join "`n") -notmatch 'mCurrentFocus=.*ai\.botharness\.deepseekbot\.dev/') {
    throw 'QA_APP_NOT_FOREGROUND: open DeepSeekBot and finish any Human/system prompts before capture.'
  }
}
if ($Label -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'Use a lowercase filename label with letters, digits and hyphens.' }
$prefix=Join-Path $Evidence "$Label-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))"
if ($Action -eq 'screenshot') {
  # Binary pipe: Windows PowerShell redirection can corrupt PNGs.
  $start=[Diagnostics.ProcessStartInfo]::new($Adb)
  $start.UseShellExecute=$false; $start.RedirectStandardOutput=$true
  foreach ($arg in @('-s',$Serial,'exec-out','screencap','-p')) { $start.ArgumentList.Add($arg) }
  $process=[Diagnostics.Process]::Start($start)
  $file=[IO.File]::Create("$prefix.png")
  try { $process.StandardOutput.BaseStream.CopyTo($file); $process.WaitForExit() } finally { $file.Dispose() }
  if ($process.ExitCode -ne 0) { throw 'Screenshot failed' }
  Run $Adb @('-s',$Serial,'shell','uiautomator','dump','/sdcard/botharness-qa.xml')
  Run $Adb @('-s',$Serial,'pull','/sdcard/botharness-qa.xml',"$prefix.ui.xml")
  Run $Adb @('-s',$Serial,'shell','rm','/sdcard/botharness-qa.xml')
} else {
  $version = & $Config.scrcpy --version
  if ($LASTEXITCODE -ne 0 -or "$version" -notmatch 'scrcpy (\d+\.\d+(?:\.\d+)?)' -or [version]$Matches[1] -lt [version]'5.0') { throw 'Configure official scrcpy 5.0+ in config.json.' }
  $arguments=@('--serial',$Serial,'--no-audio','--video-codec=h264','--max-fps=60')
  if ($ViewOnly) { $arguments+='--no-control' }
  if ($Action -eq 'record') { $arguments+=@("--record=$prefix.mp4","--time-limit=$Seconds") }
  Run $Config.scrcpy $arguments
}
@{ commit=(& git -C $Repo rev-parse HEAD); batch=$Batch; lane=$Lane; serial=$Serial; action=$Action; time=[DateTime]::UtcNow.ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath "$prefix.json"
Event "$Action-completed"
Write-Output $prefix
