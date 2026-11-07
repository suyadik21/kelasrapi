# Spec Delta

## Purpose

Menyediakan absensi berbasis pertemuan dengan input massal, identitas siswa, draft, finalisasi, koreksi, dan rekap yang dapat dipercaya.

## ADDED Requirements

### Requirement: Teacher can start attendance from a teaching session
The system SHALL show the session date, class, subject, teacher, time, and enrolled students with NIS when attendance is started.

#### Scenario: Start scheduled attendance
- **WHEN** the teacher opens an unfilled session from the dashboard or attendance list
- **THEN** the form is prefilled from the session and displays the current class roster

### Requirement: Teacher can apply bulk and individual statuses
The system SHALL support mark-all actions, individual status changes, notes, and undo before finalization.

#### Scenario: Bulk present then exception
- **WHEN** the teacher marks all students present and changes one student to Izin
- **THEN** the final preview shows the individual exception and the correct summary counts

### Requirement: Attendance supports draft and correction states
The system SHALL autosave drafts, allow finalization, and require a reason when a finalized record is corrected.

#### Scenario: Recover draft
- **WHEN** the app reopens after interruption during attendance input
- **THEN** the teacher can resume the latest draft with its timestamp and statuses

