# KelasRapi local data model

The MVP stores teacher-owned classroom data in `kelasrapi.db` through Expo SQLite. No Firebase, Google Drive, analytics SDK, or network request is required for core use.

| Table                | Purpose                                                               | Retention rule                         |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `schema_migrations`  | Applied schema version marker.                                        | Keep the latest migration history.     |
| `classes`            | Class identity, optional folder/group label, and archive state.       | Archive instead of destructive delete. |
| `students`           | Student identity linked to a class.                                   | Archive to preserve related records.   |
| `schedules`          | Repeating or one-off class schedule.                                  | Archive obsolete entries.              |
| `agendas`            | Tasks and agenda notes tied to a class/date.                          | Keep completion timestamps.            |
| `journals`           | Draft or saved learning journal by class/date.                        | Upsert by class and date.              |
| `grading_components` | Assessment name, subject, max score, weight, and date.                | Preserve source assessments.           |
| `scores`             | Per-student score and independent note.                               | Upsert by component/student.           |
| `attendance_drafts`  | Per-student status, optional event note, and draft/session timestamp. | Upsert by class/date/student.          |
| `reports`            | Export request metadata and retry parameters.                         | Keep history and file state.           |
| `backups`            | Versioned local archive metadata and integrity hash.                  | Keep user-visible backup history.      |

## Migration policy

1. Every database initialization runs idempotent `CREATE TABLE IF NOT EXISTS` statements.
2. Each released schema increments `SCHEMA_VERSION` and records the applied version in `schema_migrations`.
3. Migrations must be additive or transform data inside a transaction; never silently discard user records.
4. Failed migrations must leave the last committed database usable and surface a recovery action.
5. Repository methods must use parameterized SQL and transactions for multi-row writes.

## Local-first boundary

Core class, attendance, grades, journals, schedules, reports, and backup operations must succeed with network disabled. Cloud backup or Google sign-in, if added later, must be an explicit opt-in adapter outside these repositories.
The current local backup envelope is JSON with `format`, `schemaVersion`, `createdAt`, `data`, and a deterministic integrity checksum. Restore rejects unsupported versions or tampered payloads before opening the replace transaction.
