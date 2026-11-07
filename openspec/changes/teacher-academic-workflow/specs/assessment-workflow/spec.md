# Spec Delta

## Purpose

Menyediakan buku nilai berbasis pertemuan dengan ringkasan statistik, daftar siswa otomatis, komponen penilaian, remedial, dan finalisasi.

## ADDED Requirements

### Requirement: Teacher can create an assessment from a session
The system SHALL prefill teacher, class, subject, date, and time from a selected teaching session and SHALL let the teacher choose assessment type, maximum score, and weight.

#### Scenario: Add assessment
- **WHEN** the teacher selects a Mathematics session and chooses Assignment
- **THEN** the assessment form uses that session context and displays the enrolled students with NIS

### Requirement: Grade summary is computed
The system SHALL show average, highest, lowest, student count, incomplete count, and assessment date for each assessment summary.

#### Scenario: Incomplete assessment
- **WHEN** two enrolled students have no score
- **THEN** the summary shows two incomplete scores and does not claim final completion

### Requirement: Teacher can edit, delete, remediate, and finalize
The system SHALL allow assessment edits and deletion with confirmation, and SHALL support remedial or make-up assessments without mutating the original source scores.

#### Scenario: Delete sample assessment
- **WHEN** the teacher deletes an unlocked assessment
- **THEN** the assessment and its scores are removed after confirmation and the summary refreshes

