# KelasRapi FigCraft handoff

The native source is [`kelasrapi.figcraft`](./kelasrapi.figcraft). It contains eight mobile frames, reusable components for repeated controls, and the attendance happy/recovery prototype flows. The React Native implementation follows the same light neumorphic direction: `#EAF4FF` background, `#DCE8F4` surfaces, `#FF795C` primary action, `#187F79` confirmation, and `#24354D` text.

## Screen map

| Flow | Entry | Primary success | Empty/loading/error recovery |
|---|---|---|---|
| Dashboard | App launch | Selected class and next action visible | First-use guide can be dismissed and revisited |
| Class / students | Kelas tab | Create/select class, add or import students | Help text, spreadsheet preview, duplicate report, cancel |
| Attendance | Dashboard quick action or Absensi tab | Mark statuses, save, open recap | Local draft recovery, bulk undo, per-student note |
| Grade book | Dashboard quick action | Add component, enter scores, inspect detail | Missing-score draft dialog, range validation, autosave |
| Journal | Dashboard quick action | Save journal and complete agenda | Draft autosave and save/discard/cancel navigation guard |
| Schedule | Jadwal tab | Filter day, create/edit/archive repeating schedule | Empty state and modal validation |
| Reports | Dashboard quick action or Laporan tab | Preview then Excel/PDF/share/print | Period filters, empty preview, preserved parameters on failure |
| Backup / restore | Laporan tab | Verified local backup and scoped restore | Invalid checksum/schema rejection, preview, cancel |

## Native FigCraft verification

- `figcraft-cli info design/figcraft/kelasrapi.figcraft` reports 125 nodes and these frames: Dashboard, Attendance, Class, Grade book, Journal, Schedule, Reports, Backup, Attendance recovery, and States and components.
- The file contains 22 reusable components for navigation, status/action chips, class rows, grade fields, journal editor, schedule row, report preview/export, backup scope, primary actions, and empty/loading/error states.
- `Mulai absensi` (node 8) navigates to Attendance (node 21).
- `Rekap` (node 26) and `Simpan absensi` (node 32) navigate to Attendance recovery (node 102).
- `Buka absensi` (node 110) returns to Attendance (node 21).
- The rendered review artifact is [`kelasrapi-preview.png`](./kelasrapi-preview.png).

## Tokens and touch guidance

- Typography: Inter, 28/24 px screen heading, 16 px body control label, 12–14 px supporting copy.
- Spacing: 8 px base rhythm; 12–24 px card padding; 44 px minimum interactive target.
- Radius: 14 px controls, 18–28 px cards; elevation is a soft white edge plus cool blue shadow.
- Status colors: Hadir/confirmed `#187F79`; action/coral `#FF795C`; warning `#C36F0C`; destructive `#C94F3B`.
- Every core action has a visible label and an accessibility label; icon-only reorder controls expose `Naikkan ...` and `Turunkan ...` semantics.

## Prototype acceptance path

1. Dashboard → select the active class → `Mulai absensi`.
2. Choose a status or `Semua hadir` → optionally add a note → `Simpan absensi`.
3. `Lihat rekap` → choose Hari ini/Bulan ini/Semester → inspect per-student status.
4. Recovery path: edit a journal or attendance draft → switch tab → choose Simpan draft, Buang, or Batal.

The previews in this folder are review references; the `.figcraft` file remains the editable source of truth for the visual design.
