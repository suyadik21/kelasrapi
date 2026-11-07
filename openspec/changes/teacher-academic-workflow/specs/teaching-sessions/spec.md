# Spec Delta

## Purpose

Menyediakan jadwal berulang, pertemuan aktual, pengecualian tanggal, dan pencegahan konflik agar semua aktivitas guru memiliki sumber waktu yang sama.

## ADDED Requirements

### Requirement: Teacher can generate recurring sessions
The system SHALL create teaching sessions from a schedule template for a selected date range, including monthly or semester-wide recurrence.

#### Scenario: Generate semester sessions
- **WHEN** the teacher saves a weekly Monday schedule for a semester date range
- **THEN** the system generates the applicable dated sessions and shows their count before confirmation

### Requirement: System prevents schedule conflicts
The system SHALL validate overlapping class, teacher, room, and replacement-session schedules using the actual date and time before saving.

#### Scenario: Replacement session conflict
- **WHEN** a replacement session overlaps another session for the same teacher or room
- **THEN** the system rejects it and identifies the conflicting class, subject, date, and time

### Requirement: Teacher can override one session
The system SHALL allow a teacher to move, cancel, replace, mark as school holiday, or mark as a workday for one dated session without changing the recurring template.

#### Scenario: Move one session
- **WHEN** the teacher changes one Monday session to Tuesday
- **THEN** only that dated session changes and future recurring sessions remain unchanged

