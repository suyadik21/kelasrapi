# KelasRapi release checklist

## Product and privacy

- Product name: KelasRapi
- Package ID: `id.kelasrapi.app`
- MVP mode: local-only, offline-first
- Cloud sync, Firebase, Google Drive login, analytics, and advertising: not included
- User data stored locally: classes, students, schedules, agenda, journal, attendance, grades, reports, and backup metadata
- Backup behavior: explicit local file export/import; no automatic upload

## Store copy draft

Short description (under 80 characters):

> Absensi, nilai, jurnal, dan laporan guru yang rapi dan offline.

Full description draft:

> KelasRapi membantu guru mengelola kelas, siswa, absensi, nilai, jurnal, jadwal, agenda, dan laporan dalam satu aplikasi offline-first. Data inti tersimpan di perangkat dan dapat dicadangkan ke file lokal secara eksplisit. KelasRapi tidak memerlukan login atau koneksi cloud untuk alur utama.

## Known limitations before release

- Native ARM64 release installation has not yet been verified in this workspace.
- SDK audit: an Android 35 Google APIs ARM64 system image and `codex-android35-arm64` AVD were provisioned, but QEMU2 rejects ARM64 guests on this x86_64 host (`CPU Architecture 'arm64' is not supported`). No physical ARM64 device is connected.
- Large-class and trim-memory smoke benchmark completed for a 500-student fixture on x86_64; ARM64 device validation remains pending.
- Native builds are reproducible after adding the required `expo-font` peer dependency. Multi-ABI debug, x86_64 release, and ARM64 release APKs were produced; the x86_64 release APK was installed and smoke-tested on the emulator.
- Cloud sync is intentionally outside the MVP and must not be advertised as available.

## Required evidence before publishing

- [x] Typecheck, lint, format, unit tests
- [x] Android JS bundle export
- [x] Native Android project generated with Expo prebuild
- [x] x86_64 emulator smoke test
- [x] x86_64 release APK build, install, offline launch, and five-tab smoke test
- [x] Native release E2E: grading draft guard, journal save, Excel share, and local JSON backup share
- [x] Local backup/restore and invalid-file test
- [x] Fresh native release acceptance: first launch, create class/student, attendance, grading, journal, backup, DocumentsUI restore, and Excel export
- [x] Recovery smoke after trim-memory, force-close/reopen, and configuration rotation on x86_64 emulator
- [x] Low-storage pressure and interrupted-export recovery; committed attendance and grade data remained visible
- [x] Offline five-tab smoke with Wi-Fi and mobile data disabled
- [x] 500-student large-class and trim-memory UI benchmark on x86_64 release APK
- [ ] ARM64 release install and smoke test
- [x] Local Gradle `assembleRelease` APKs for x86_64 and ARM64 (ARM64 artifact built; device installation remains pending)
- [ ] Signed artifact and Play Console policy review
- [ ] Final screenshots from the release build
- [ ] Privacy policy URL, if required by the selected distribution channel
