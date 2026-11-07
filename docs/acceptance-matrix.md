# KelasRapi MVP acceptance matrix

| Flow         | Entry                      | Success evidence                                   | Recovery/error evidence                                           | Status                                                                                   |
| ------------ | -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Class setup  | Kelas                      | Active class and student appear immediately        | Duplicate student rejected; archive/restore available             | Verified                                                                                 |
| Import       | Kelas → Import spreadsheet | Valid rows imported after confirmation             | Invalid/duplicate rows reported without partial unconfirmed write | Verified                                                                                 |
| Attendance   | Beranda → Absensi          | Status, note, bulk action, save, and recap visible | Undo and draft recovery after reload                              | Verified                                                                                 |
| Grading      | Beranda → Nilai            | Component, score, note, weighted detail            | Missing-score draft prompt and range validation                   | Verified; native release score 90 saved                                                  |
| Journal      | Beranda → Jurnal           | Draft autosaves and can be submitted               | Leave guard offers cancel/discard/save draft                      | Verified; native release journal saved                                                   |
| Reports      | Laporan                    | Period/class scope shown in preview and filename   | Export error preserves selected parameters                        | Verified on native release; XLSX share chooser shows completed file                      |
| Backup       | Laporan → backup action    | Local JSON created and share chooser opens         | Corrupt/unsupported file rejected before mutation                 | Verified on native release after async-write fix                                         |
| First launch | Fresh database             | Guide and default class appear                     | Empty/error states are represented in component logic             | Verified on fresh native release; created Kelas 2B/student, then restored fixture backup |

“Verified” means covered by automated tests plus emulator evidence in the project work log. Release-ABI and physical accessibility checks remain separate gates.

The repeatable tab smoke test is `scripts/android-smoke.ps1`; it checks accessibility text and the resumed Android activity for each primary tab.
