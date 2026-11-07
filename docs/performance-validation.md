# KelasRapi performance validation

The repeatable emulator check is `scripts/performance-smoke.ps1`. It taps each primary tab and waits for the Android accessibility tree to expose text, with a 5,000 ms observation threshold. The threshold includes the emulator's `uiautomator dump` overhead and is therefore a smoke bound, not a product latency SLA.

This is a bounded UI smoke measurement on the x86_64 development emulator. The agreed smoke threshold is 5,000 ms per screen and includes the emulator's accessibility-dump overhead; it is not a product latency SLA. ARM64 remains a separate release-device gate.

## Latest observed run

On 2026-11-06, after a Quick Boot restart, the x86_64 emulator opened Beranda, Absensi, Kelas, Jadwal, and Laporan in 2,421–2,708 ms per tab, within the 5,000 ms smoke bound. The repeatable `scripts/android-recovery-smoke.ps1` then passed force-stop/reopen, `RUNNING_CRITICAL` trim-memory, landscape rotation, and portrait restoration; the restored class and student data remained visible. The same five-tab smoke passed with Wi-Fi and mobile data disabled. The smoke harness now requires the dumped UI and foreground activity to belong to `id.kelasrapi.app`; home-screen text cannot produce a false pass.

The same recovery sequence was repeated against the embedded-bundle x86_64 release APK with Wi-Fi and mobile data disabled. All five tabs opened and the crash scan found no app fatal exception, React Native error, or app ANR.

## Large-class and memory-pressure run

On the same x86_64 release APK, a versioned local backup fixture with 500 students and one grade component was restored through DocumentsUI. After `RUNNING_CRITICAL` trim-memory, Beranda, Absensi, Kelas, Jadwal, and Laporan opened in 2,377–2,706 ms; the Grade screen opened in 3,075 ms. The class list is windowed in 50-student pages so all 500 records remain reachable without mounting 500 interactive rows at once. The large-class dashboard showed 500/500 attendance records and the grade screen exposed the first page with a “Tampilkan berikutnya” control.

The remaining validation gap is ARM64 installation and runtime behavior. An Android 35 Google APIs ARM64 image and AVD were provisioned, but the emulator exits before boot because QEMU2 does not support an ARM64 guest on this x86_64 host; a physical ARM64 device or ARM64 host is required.
