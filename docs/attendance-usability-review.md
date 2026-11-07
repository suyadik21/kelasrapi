# Attendance usability review

Review target: `design/figcraft/handoff.md`, attendance frame in `design/figcraft/kelasrapi.figcraft`, and Android emulator `emulator-5554`.

## First-time happy path

| Step               | Visible control                                                  | Evidence                                                                |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Open attendance | Dashboard `Mulai absensi` or bottom tab `Absensi`                | Emulator accessibility tree exposes `Absensi {class}` and the tab label |
| 2. Set attendance  | `Semua hadir`, `Ubah status semua`, and per-student status chips | Emulator showed all five labels: Hadir, Sakit, Izin, Alpa, Terlambat    |
| 3. Add context     | `Tambah catatan` per student                                     | Content description `Isi catatan {student}` is exposed                  |
| 4. Save            | Coral `Simpan absensi` button                                    | Button is visible below the student list and has an explicit label      |
| 5. Inspect recap   | `Lihat rekap`, then Hari ini/Bulan ini/Semester                  | Period controls use radio semantics and retain the active class         |

## Recovery path

After changing a status or note, the draft autosaves locally. Reopening the app restored the selected status in the emulator. The unsaved journal guard and attendance undo action provide visible recovery choices; no hidden swipe or long-press is required to complete attendance.

## Findings

- [x] Primary happy path is reachable from visible controls.
- [x] Bulk action has an undo affordance.
- [x] Individual status and note controls remain available after bulk changes.
- [x] Recap scope is explicit and class-aware.
- [x] Accessibility labels are present for the core actions.

The native FigCraft file contains the attendance reference frame; the implementation follows the same toolbar, chip, coral CTA, and recap hierarchy. Full clickable prototype validation remains a separate FigCraft artifact task.
