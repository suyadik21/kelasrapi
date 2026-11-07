param(
  [string]$Serial = 'emulator-5554',
  [int]$ThresholdMs = 5000
)

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb tidak ditemukan: $adb" }
if (-not (& $adb devices | Select-String "^$Serial\s+device$")) {
  throw "Perangkat $Serial tidak terhubung."
}

$tabs = @(
  @{ Name = 'Beranda'; X = 80; Pattern = 'text="KelasRapi"' },
  @{ Name = 'Absensi'; X = 220; Pattern = 'text="Absensi Kelas' },
  @{ Name = 'Kelas'; X = 360; Pattern = 'text="Kelas saya"' },
  @{ Name = 'Jadwal'; X = 500; Pattern = 'text="Atur ritme pembelajaran' },
  @{ Name = 'Laporan'; X = 630; Pattern = 'text="Pilih data lokal' }
)

$results = foreach ($tab in $tabs) {
  $timer = [Diagnostics.Stopwatch]::StartNew()
  & $adb -s $Serial shell input tap $tab.X 1230
  do {
    Start-Sleep -Milliseconds 100
    & $adb -s $Serial shell uiautomator dump /sdcard/kelasrapi-perf.xml 2>$null | Out-Null
    $xml = & $adb -s $Serial shell cat /sdcard/kelasrapi-perf.xml
    $hasApp = $xml -match 'package="id\.kelasrapi\.app"'
    $hasText = $xml -match 'text="[^"]+"'
    $hasExpected = $xml -match $tab.Pattern
  } while ((-not $hasApp -or -not $hasText -or -not $hasExpected) -and $timer.ElapsedMilliseconds -lt $ThresholdMs)
  $timer.Stop()
  [pscustomobject]@{
    Tab = $tab.Name
    ElapsedMs = $timer.ElapsedMilliseconds
    WithinThreshold = ($hasApp -and $hasText -and $hasExpected -and $timer.ElapsedMilliseconds -le $ThresholdMs)
  }
}

$results | Format-Table -AutoSize
if ($results.WithinThreshold -contains $false) {
  throw "Ada tab yang melewati ambang $ThresholdMs ms."
}
Write-Output "[OK] Semua tab utama merespons <= $ThresholdMs ms."
