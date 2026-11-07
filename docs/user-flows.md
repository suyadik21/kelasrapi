# KelasRapi primary user flows

This document is the behavioral source for FigCraft and the React Native MVP. Every flow is local-first and must remain usable without Firebase, Google Drive, or a network connection.

## First launch and class setup

| State    | Behavior                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------ |
| Entry    | Open KelasRapi and land on the dashboard with a clear “Buat kelas” action when no class exists.  |
| Success  | Save class name and optional subject group locally; show the class immediately on the dashboard. |
| Error    | Keep entered values, show inline validation, and explain the duplicate/invalid field.            |
| Offline  | Continue normally; show a small “Tersimpan di perangkat” status.                                 |
| Recovery | Reopen the draft after app close and offer lanjutkan atau buang draft.                           |

## Class and student management

| State    | Behavior                                                                         |
| -------- | -------------------------------------------------------------------------------- |
| Entry    | Select Kelas from bottom navigation, then open a class or add a class.           |
| Success  | Add/edit/archive a class or student and refresh all related screens immediately. |
| Error    | Reject duplicate names or invalid imports without partial writes.                |
| Offline  | List, edit, archive, and restore remain available locally.                       |
| Recovery | Cancel archive/delete confirmation leaves the current data unchanged.            |

## Attendance

| State    | Behavior                                                                          |
| -------- | --------------------------------------------------------------------------------- |
| Entry    | Tap Mulai absensi from the dashboard or Absensi navigation.                       |
| Success  | Mark each student, save the session, show recap, and confirm “Absensi tersimpan”. |
| Error    | Keep unsaved statuses and show the failed save reason beside the action.          |
| Offline  | Autosave the latest draft locally; no network request is required.                |
| Recovery | Reopen the class/date and restore the latest draft with its timestamp.            |

## Grading

| State    | Behavior                                                                                |
| -------- | --------------------------------------------------------------------------------------- |
| Entry    | Open Nilai from a class or dashboard quick action.                                      |
| Success  | Create an assessment, enter scores, calculate the explainable result, and save locally. |
| Error    | Identify invalid ranges and missing required scores next to the affected student.       |
| Offline  | Score entry and calculations remain available without a network.                        |
| Recovery | Restore the last score draft after app close and keep committed scores intact.          |

## Journal and agenda

| State    | Behavior                                                           |
| -------- | ------------------------------------------------------------------ |
| Entry    | Tap Jurnal from a schedule item or quick action.                   |
| Success  | Save agenda, notes, and journal state; show the saved timestamp.   |
| Error    | Preserve text and show validation near the missing required field. |
| Offline  | Draft and final journal states are stored locally.                 |
| Recovery | Leaving with unsaved changes offers simpan draft, buang, or batal. |

## Schedule

| State    | Behavior                                                                              |
| -------- | ------------------------------------------------------------------------------------- |
| Entry    | Open Jadwal from bottom navigation or the dashboard schedule link.                    |
| Success  | Create/edit/repeat an item and filter it by day; dashboard reflects the selected day. |
| Error    | Reject invalid time ranges and overlapping entries with an actionable message.        |
| Offline  | Schedule remains readable and editable locally.                                       |
| Recovery | Restore an interrupted schedule edit from the local draft marker.                     |

## Reports and export

| State    | Behavior                                                                          |
| -------- | --------------------------------------------------------------------------------- |
| Entry    | Open Laporan and choose attendance, grades, journal, or student data.             |
| Success  | Preview filtered data, export Excel/PDF, and show the file location/share action. |
| Error    | Preserve filters and show retry/storage guidance when export fails.               |
| Offline  | Generate reports from local data without Firebase or Drive.                       |
| Recovery | Retry the same export parameters after a storage/share failure.                   |

## Backup and restore

| State                                                                                                                                                                                                                                                                                                                            | Behavior                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Entry                                                                                                                                                                                                                                                                                                                            | Open Backup & Restore from settings or the report area.                     |
| Success                                                                                                                                                                                                                                                                                                                          | Create a versioned local archive, validate it, and show its file location.  |
| Error                                                                                                                                                                                                                                                                                                                            | Reject corrupt/incompatible files before changing current data.             |
| Offline                                                                                                                                                                                                                                                                                                                          | Backup and restore use local files only.                                    |
| Recovery                                                                                                                                                                                                                                                                                                                         | Preview affected scope and choose replace, merge, or cancel before restore. |
| Implementation note: KelasRapi creates a versioned local JSON backup containing all local tables, validates its checksum and schema version before restore, previews the affected row count, and asks for explicit replace confirmation. Sharing is optional and user-selected; no Firebase, Google Drive, or login is required. |
