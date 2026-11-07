# Spec Delta

## Purpose

Menyajikan pekerjaan guru hari ini berdasarkan data aktual, status sesi, peringatan, dan tindakan cepat yang dapat langsung dikerjakan.

## ADDED Requirements

### Requirement: Dashboard shows computed work
The system SHALL calculate dashboard counts from stored sessions, attendance, assessments, journals, tasks, and alerts rather than fixed or demo values.

#### Scenario: No attendance data
- **WHEN** no attendance session has been finalized for the selected period
- **THEN** the dashboard shows an explicit no-data state instead of a fabricated percentage

### Requirement: Dashboard opens the next teacher action
The system SHALL provide direct actions from a dated session to its attendance, assessment, journal, task, or report workflow.

#### Scenario: Attendance pending
- **WHEN** today's session has no finalized attendance
- **THEN** the dashboard offers an action that opens the attendance form with session context preselected

### Requirement: Mutations provide explicit feedback
The system SHALL show success, failure, loading, and retry feedback for important saves, deletes, exports, and restores.

#### Scenario: Attendance saved
- **WHEN** an attendance session is committed successfully
- **THEN** the system shows a visible success notification containing the class, subject, and date

