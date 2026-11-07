param(
  [string]$Serial = 'emulator-5554',
  [int]$ReserveKb = 512
)

$ErrorActionPreference = 'Stop'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb tidak ditemukan: $adb" }
if (-not (& $adb devices | Select-String "^$Serial\s+device$")) {
  throw "Perangkat $Serial tidak terhubung."
}

$pressurePath = '/data/local/tmp/kelasrapi-low-storage-test.bin'
$app = 'id.kelasrapi.app'
$appPattern = 'package="' + [regex]::Escape($app) + '"'

function Get-AvailableKb {
  $row = & $adb -s $Serial shell df -k /data | Select-Object -Last 1
  $fields = ($row -replace '\s+', ' ').Trim().Split(' ')
  return [int64]$fields[3]
}

function Dump-AppXml {
  & $adb -s $Serial shell uiautomator dump /sdcard/kelasrapi-export-recovery.xml 2>$null | Out-Null
  return (& $adb -s $Serial shell cat /sdcard/kelasrapi-export-recovery.xml)
}

try {
  $available = Get-AvailableKb
  if ($available -le $ReserveKb + 4096) { throw "Ruang kosong emulator terlalu kecil untuk test aman: $available KB." }
  $fillKb = $available - $ReserveKb
  & $adb -s $Serial shell fallocate -l "${fillKb}K" $pressurePath | Out-Null
  $afterFill = Get-AvailableKb
  if ($afterFill -gt ($ReserveKb + 4096)) {
    throw "File tekanan tidak mengurangi ruang kosong sesuai target: $afterFill KB tersisa."
  }
  Write-Output "[OK] low-storage pressure aktif: $afterFill KB tersisa"

  & $adb -s $Serial shell am force-stop $app
  & $adb -s $Serial shell monkey -p $app 1 | Out-Null
  Start-Sleep -Milliseconds 700
  $xml = Dump-AppXml
  if ($xml -notmatch $appPattern) { throw 'Aplikasi tidak dapat dibuka saat ruang penyimpanan rendah.' }
  Write-Output '[OK] aplikasi tetap dapat dibuka saat ruang rendah'

  # Buka Laporan lalu tekan Excel; kegagalan tulis harus hanya menampilkan error,
  # bukan menghapus data lokal atau membuat app crash.
  & $adb -s $Serial shell input tap 630 1230
  Start-Sleep -Milliseconds 500
  & $adb -s $Serial shell input swipe 360 1000 360 450 300
  Start-Sleep -Milliseconds 250
  & $adb -s $Serial shell input tap 190 820
  Start-Sleep -Milliseconds 600
  & $adb -s $Serial shell am force-stop $app
  & $adb -s $Serial shell monkey -p $app 1 | Out-Null
  Start-Sleep -Milliseconds 900
  $xml = Dump-AppXml
  if ($xml -notmatch $appPattern) { throw 'Aplikasi tidak pulih setelah ekspor diinterupsi.' }
  Write-Output '[OK] force-stop saat ekspor lalu reopen berhasil'
  & $adb -s $Serial shell input tap 220 1230
  Start-Sleep -Milliseconds 500
  $xml = Dump-AppXml
  if ($xml -notmatch '500 siswa' -or $xml -notmatch 'Siswa Benchmark 0001' -or $xml -notmatch 'Sakit') {
    throw 'Data kelas/siswa tidak terlihat setelah recovery ekspor.'
  }
  Write-Output '[OK] data kelas dan siswa tetap ada setelah recovery ekspor'
  & $adb -s $Serial shell input tap 80 1230
  Start-Sleep -Milliseconds 300
  & $adb -s $Serial shell input tap 520 930
  Start-Sleep -Milliseconds 700
  $xml = Dump-AppXml
  & $adb -s $Serial shell input tap 310 260
  Start-Sleep -Milliseconds 600
  $xml = Dump-AppXml
  if ($xml -notmatch '88') { throw 'Nilai tersimpan tidak terlihat setelah recovery ekspor.' }
  Write-Output '[OK] nilai tersimpan tetap ada setelah recovery ekspor'
}
finally {
  & $adb -s $Serial shell rm -f $pressurePath | Out-Null
  $remaining = Get-AvailableKb
  Write-Output "[OK] file tekanan dihapus; ruang kosong kembali $remaining KB"
}
