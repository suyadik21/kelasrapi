# Spec Delta

## Purpose

Menjaga konsistensi, pemulihan, audit, dan portabilitas data akademik ketika schema dan workflow KelasRapi berubah.

## ADDED Requirements

### Requirement: Academic migrations preserve history
The system SHALL migrate existing local data into the academic model without deleting committed attendance, scores, journals, or report records.

#### Scenario: Upgrade existing database
- **WHEN** a user upgrades from the foundation release
- **THEN** the app creates a verified backup, runs the migration, and preserves existing records or reports a recoverable migration failure

### Requirement: Backup includes academic context and enrollment history
The system SHALL include profiles, academic periods, subjects, enrollments, sessions, attendance, assessments, journals, tasks, and audit metadata in a versioned backup.

#### Scenario: Restore academic backup
- **WHEN** the teacher previews a valid backup from another device
- **THEN** the system shows affected academic scope and restores it only after explicit confirmation

