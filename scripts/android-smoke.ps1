param(
  [string]$Serial = 'emulator-5554'
)

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb tidak ditemukan: $adb" }

$device = & $adb devices | Select-String "^$Serial\s+device$"
if (-not $device) { throw "Perangkat $Serial tidak terhubung." }

$tabs = @(
  @{ Name = 'Beranda'; X = 80; Pattern = 'text="KelasRapi"' },
  @{ Name = 'Absensi'; X = 220; Pattern = 'text="Absensi Kelas' },
  @{ Name = 'Kelas'; X = 360; Pattern = 'text="Kelas saya"' },
  @{ Name = 'Jadwal'; X = 500; Pattern = 'text="Atur ritme pembelajaran' },
  @{ Name = 'Laporan'; X = 630; Pattern = 'text="Pilih data lokal' }
)

foreach ($tab in $tabs) {
  & $adb -s $Serial shell input tap $tab.X 1230
  # Reset any retained ScrollView position before checking the tab's top-level marker.
  & $adb -s $Serial shell input swipe 360 350 360 1050 250
  $timer = [Diagnostics.Stopwatch]::StartNew()
  do {
    Start-Sleep -Milliseconds 100
    & $adb -s $Serial shell uiautomator dump /sdcard/kelasrapi-window.xml 2>$null | Out-Null
    $xml = & $adb -s $Serial shell cat /sdcard/kelasrapi-window.xml
    $hasApp = $xml -match 'package="id\.kelasrapi\.app"'
    $hasExpected = $xml -match $tab.Pattern
  } while ((-not $hasApp -or -not $hasExpected) -and $timer.ElapsedMilliseconds -lt 5000)
  $timer.Stop()
  if (-not $hasApp -or -not $hasExpected) {
    throw "Tab $($tab.Name) tidak menampilkan UI KelasRapi; aplikasi bukan activity terdepan."
  }
  $texts = [regex]::Matches($xml, 'text="([^"]*)"') |
    ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -and $_.Length -gt 2 } |
    Select-Object -First 6
  if (-not $texts) { throw "Tidak ada accessibility text pada tab $($tab.Name)." }
  Write-Output ("[$($tab.Name)] " + ($texts -join ' | '))
}

$activity = & $adb -s $Serial shell dumpsys activity activities | Select-String 'mResumedActivity|topResumedActivity|mFocusedApp'
if (-not $activity -or ($activity -notmatch 'id\.kelasrapi\.app')) {
  throw 'Activity terdepan bukan id.kelasrapi.app setelah smoke test.'
}
Write-Output '[OK] Semua tab utama dapat dibuka.'
