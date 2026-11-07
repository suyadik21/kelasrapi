import {
  attendanceRate,
  attendanceTotals,
  findSessionConflicts,
  formatDashboardAttendanceIndicator,
  generateRecurringSessions,
  promotionPreview,
  validateNisImportCandidates,
} from './academic';

describe('academic workflow domain (Phases 0–6 & 12)', () => {
  it('generates sessions for once, weekly, monthly, and semester rules', () => {
    const weekly = generateRecurringSessions({
      id: 'schedule-2b-math',
      classId: 'class-2b',
      teacherId: 'teacher-1',
      weekday: 1,
      startTime: '08:00',
      endTime: '09:30',
      startDate: '2026-11-02',
      endDate: '2026-11-30',
      title: 'Matematika',
      repeatRule: 'weekly',
    });
    expect(weekly).toHaveLength(5);
    expect(weekly[0].date).toBe('2026-11-02');
    expect(weekly[4].id).toBe('schedule-2b-math-2026-11-30');

    const once = generateRecurringSessions({
      id: 'schedule-once',
      classId: 'class-2b',
      teacherId: 'teacher-1',
      weekday: 1,
      startTime: '10:00',
      endTime: '11:30',
      startDate: '2026-11-02',
      endDate: '2026-11-30',
      title: 'Praktikum IPA',
      repeatRule: 'once',
    });
    expect(once).toHaveLength(1);
    expect(once[0].date).toBe('2026-11-02');
  });

  it('detects teacher, class, and room conflicts only when time overlaps', () => {
    const conflicts = findSessionConflicts(
      {
        id: 'replacement',
        classId: 'class-2b',
        teacherId: 'teacher-1',
        roomId: 'room-a',
        date: '2026-11-10',
        startTime: '09:00',
        endTime: '10:00',
      },
      [
        {
          id: 'existing',
          classId: 'class-3a',
          teacherId: 'teacher-1',
          roomId: 'room-a',
          date: '2026-11-10',
          startTime: '09:30',
          endTime: '11:00',
        },
      ],
    );
    expect(conflicts.map((conflict) => conflict.resource)).toEqual(['teacher', 'room']);
  });

  it('calculates real attendance totals, strict dashboard formula, and honest empty state', () => {
    expect(attendanceTotals(['Hadir', 'Hadir', 'Sakit', 'Terlambat', 'Alpa'])).toEqual({
      Hadir: 2,
      Sakit: 1,
      Izin: 0,
      Alpa: 1,
      Terlambat: 1,
    });
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate(['Hadir', 'Terlambat', 'Alpa'])).toBe(67);
    expect(attendanceRate(['Hadir', 'Hadir', 'Sakit', 'Alpa'], true)).toBe(50);
    expect(formatDashboardAttendanceIndicator([])).toEqual({
      percentage: null,
      label: 'Belum ada cukup data',
    });
    expect(formatDashboardAttendanceIndicator(['Hadir', 'Hadir', 'Sakit', 'Alpa'])).toEqual({
      percentage: 50,
      label: '50% hadir (2/4 data absensi)',
    });
  });

  it('validates NIS import rows and pinpoints exact offending row numbers', () => {
    const existingNis = new Set(['26001']);
    const result = validateNisImportCandidates(
      [
        { rowNumber: 2, name: 'Alya Putri', nis: '26002' },
        { rowNumber: 3, name: 'Bima', nis: '' },
        { rowNumber: 4, name: 'Citra', nis: '26001' },
        { rowNumber: 5, name: 'Daffa', nis: '26002' },
      ],
      existingNis,
    );
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].nis).toBe('26002');
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4, 5]);
    expect(result.errors[0].reason).toContain('Baris 3');
    expect(result.errors[1].reason).toContain('Baris 4');
    expect(result.errors[2].reason).toContain('Baris 5');
  });

  it('previews bulk promotion with movement statuses and flags unassigned active students', () => {
    const preview = promotionPreview(
      [
        { id: 's1', name: 'Alya', nis: '1001' },
        { id: 's2', name: 'Bima', nis: '1002' },
        { id: 's3', name: 'Citra', nis: '1003' },
      ],
      { s1: 'class-2b' },
      { s1: 'Naik kelas', s2: 'Naik kelas', s3: 'Lulus' },
    );
    expect(preview.valid).toBe(false);
    expect(preview.unassigned).toEqual(['s2']);
  });
});
