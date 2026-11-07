# Spec Delta

## Purpose

Menyediakan rekap dan laporan akademik yang konsisten dengan konteks guru, sekolah, tahun ajaran, semester, kelas, mata pelajaran, dan NIS siswa.

## ADDED Requirements

### Requirement: Teacher can filter academic reports
The system SHALL filter reports by academic year, semester, class, subject, student, session range, and report type before preview.

#### Scenario: Semester attendance report
- **WHEN** the teacher selects semester attendance for class 2B
- **THEN** the preview includes only sessions and students from that academic context

### Requirement: Reports include school identity and computed summaries
The system SHALL include school and teacher identity, NIS, session period, totals, averages, and configured signature fields in supported reports.

#### Scenario: Export grade report
- **WHEN** the teacher exports a finalized grade report
- **THEN** the PDF and Excel contain the same selected scope, student identities, statistics, and report metadata

