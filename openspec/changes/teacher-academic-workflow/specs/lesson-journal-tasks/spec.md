# Spec Delta

## Purpose

Menyediakan jurnal pembelajaran dan tugas yang mengacu pada pertemuan yang sama dengan absensi dan penilaian.

## ADDED Requirements

### Requirement: Teacher can record a session journal
The system SHALL allow the teacher to record material, objectives, activity, method, assignment, and notes against a teaching session.

#### Scenario: Complete session journal
- **WHEN** the teacher fills the journal for a dated session and marks it complete
- **THEN** the journal remains linked to that class, subject, teacher, and session date

### Requirement: Teacher can manage session tasks
The system SHALL allow tasks to have a class, subject, assigned date, due date, submission state, score, and remedial state.

#### Scenario: Overdue task
- **WHEN** the due date passes and submissions remain incomplete
- **THEN** the dashboard reports the task as overdue and links to the task detail

