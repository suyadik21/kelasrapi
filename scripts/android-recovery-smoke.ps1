param(
  [string]$Serial = 'emulator-5554'
)

$ErrorActionPreference = 'Stop'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb tidak ditemukan: $adb" }
if (-not (& $adb devices | Select-String "^$Serial\s+device$")) {
  throw "Perangkat $Serial tidak terhubung."
}

function Assert-KelasRapiUi([string]$label) {
  $xml = ''
  $timer = [Diagnostics.Stopwatch]::StartNew()
  do {
    Start-Sleep -Milliseconds 500
    try {
      & $adb -s $Serial shell uiautomator dump /sdcard/kelasrapi-recovery.xml 2>$null | Out-Null
    } catch {
      # UiAutomationBridge can briefly have no root during React Native startup.
    }
    $xml = & $adb -s $Serial shell cat /sdcard/kelasrapi-recovery.xml
  } while (([string]::IsNullOrWhiteSpace($xml) -or $xml -notmatch 'package="id\.kelasrapi\.app"') -and $timer.ElapsedMilliseconds -lt 30000)
  $timer.Stop()
  if ($xml -notmatch 'package="id\.kelasrapi\.app"') {
    throw "[$label] UI KelasRapi tidak terlihat setelah recovery."
  }
  $activity = & $adb -s $Serial shell dumpsys activity activities |
    Select-String 'mResumedActivity|topResumedActivity|mFocusedApp'
  if (-not $activity -or ($activity -notmatch 'id\.kelasrapi\.app')) {
    throw "[$label] Activity terdepan bukan id.kelasrapi.app."
  }
  Write-Output "[OK] $label"
}

& $adb -s $Serial shell am force-stop id.kelasrapi.app
& $adb -s $Serial shell am start -n id.kelasrapi.app/.MainActivity | Out-Null
Start-Sleep -Seconds 2
Assert-KelasRapiUi 'force-stop dan reopen'

& $adb -s $Serial shell am send-trim-memory id.kelasrapi.app RUNNING_CRITICAL
Start-Sleep -Seconds 2
Assert-KelasRapiUi 'trim-memory RUNNING_CRITICAL'

$oldAutoRotate = (& $adb -s $Serial shell settings get system accelerometer_rotation).Trim()
$oldRotation = (& $adb -s $Serial shell settings get system user_rotation).Trim()
try {
  & $adb -s $Serial shell settings put system accelerometer_rotation 0
  & $adb -s $Serial shell settings put system user_rotation 1
  Start-Sleep -Seconds 2
  Assert-KelasRapiUi 'rotasi landscape'

  & $adb -s $Serial shell settings put system user_rotation 0
  Start-Sleep -Seconds 2
  Assert-KelasRapiUi 'rotasi portrait'
}
finally {
  if ($oldAutoRotate -match '^\d+$') {
    & $adb -s $Serial shell settings put system accelerometer_rotation $oldAutoRotate
  }
  if ($oldRotation -match '^\d+$') {
    & $adb -s $Serial shell settings put system user_rotation $oldRotation
  }
}

Write-Output '[OK] Recovery smoke selesai; tidak ada kehilangan activity/UI yang terdeteksi.'
