# KelasRapi accessibility review

Review target: Android emulator `emulator-5554`, 2026-11-06. The review covers the implemented MVP screens: Beranda, Kelas, Absensi, Nilai, Jurnal, Jadwal, Laporan, and Backup/Restore.

## Implemented checks

- Core actions use `accessibilityRole="button"`; status choices use radio semantics.
- Primary actions have Indonesian labels that describe the action and, where relevant, the selected class or student.
- Text inputs expose a placeholder or an explicit content description, including per-student attendance and score notes.
- Core controls use a minimum 44dp touch target; primary actions use 52–56dp.
- Text uses React Native's default scalable text behavior; no global `allowFontScaling={false}` is used.
- Selected chips and statuses use both color and text/state, not color alone.
- Modal actions are ordered Batal then Simpan for predictable keyboard/screen-reader traversal.

## Findings and resolution

| Area           | Finding                                                        | Resolution                                                     | Evidence                                |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| Class identity | Some dashboard copy previously said “Kelas 1A” for every class | Replaced with the active class name                            | `App.tsx` dashboard labels              |
| Attendance     | Status action was icon/text-only in some states                | Added role, label, and selected radio state                    | `AttendanceScreen`, emulator smoke test |
| Notes          | Per-student note fields were difficult to discover             | Added “Tambah catatan” toggle and content descriptions         | `AttendanceScreen`, `GradeScreen`       |
| Touch targets  | Compact icon actions could be below target size                | `smallIconButton`, chips, and modal actions use 44dp+ minimums | `App.tsx` styles                        |

## Manual review checklist

The Android accessibility tree smoke check on `emulator-5554` exposed 16 content descriptions on the Laporan screen, including all four report filters, three period filters, Excel/PDF export, backup/restore, and all five navigation items.

At Android `font_scale=1.3` and `2.0`, the dashboard remained readable, the active class/primary action stayed visible, the hero text no longer overlapped the progress ring, and bottom navigation labels remained separated. The quick-action grid correctly continues below the viewport and remains scrollable. The setting was restored to `1.0` after each check. A first reload produced a transient Expo Go `EventEmitter` runtime error, but a clean Expo Go reopen loaded KelasRapi and the repeated font-scale checks passed; this is recorded as a development-runtime observation rather than a released-app crash result.

- [x] First launch guide can be dismissed without blocking the dashboard.
- [x] Attendance can be completed without relying on hidden swipe gestures.
- [x] Bulk status changes expose an undo action.
- [x] Unsaved journal navigation offers cancel, discard, or save draft.
- [x] Backup restore shows scope before confirmation and rejects invalid files.
- [ ] TalkBack traversal on a physical ARM64 device.
- [x] Large-font screenshot review at 200% on the emulator development build.

The last two items remain release-validation work because the current environment has only the x86_64 Expo development emulator.
