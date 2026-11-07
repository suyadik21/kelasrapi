# Export versus FigCraft review

Review date: 2026-11-06. The export surface intentionally uses a print-safe variant of the KelasRapi light neumorphic system: navy text, cool-blue table headers, coral action affordances, and no dark shadow/gradient that would waste ink.

| In-app FigCraft concept | Preview/export evidence                                                                              | Result                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------- |
| Active class identity   | `Kelas Restore · Hari ini` is shown above the report preview                                         | Same class scope        |
| Period chips            | Hari ini/Bulan ini/Semester control both preview and filename period stamp                           | Same period scope       |
| Attendance status       | Preview rows show student name plus status; exported row uses the same fields                        | Same data meaning       |
| Report kind             | Absensi/Data siswa/Nilai/Jurnal changes preview and export builder                                   | Same template selection |
| Recovery                | Export errors leave `kind`, `period`, and active class state in place                                | Retry preserves scope   |
| Print layout            | PDF builder uses A4 margins, escaped cells, repeated table structure, and `page-break-inside: avoid` | Print-safe variant      |

Structural evidence is covered by `src/reports/report-utils.test.ts`; the emulator smoke test verifies that the report screen and export controls are reachable. The printable HTML is deliberately flatter than the interactive FigCraft canvas so it remains readable on paper.
