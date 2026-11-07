import {
  attendanceRate,
  attendanceTotals,
  findSessionConflicts,
  generateRecurringSessions,
  promotionPreview,
} from './academic';

describe('academic workflow domain', () => {
  it('generates one session per matching weekday for a date range', () => {
    const sessions = generateRecurringSessions({
      id: 'schedule-2b-math',
      classId: 'class-2b',
      teacherId: 'teacher-1',
      weekday: 1,
      startTime: '08:00',
      endTime: '09:30',
      startDate: '2026-11-02',
      endDate: '2026-11-30',
      title: 'Matematika',
    });
    expect(sessions).toHaveLength(5);
    expect(sessions[0].date).toBe('2026-11-02');
    expect(sessions[4].id).toBe('schedule-2b-math-2026-11-30');
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

  it('calculates real attendance totals and no-data rate', () => {
    expect(attendanceTotals(['Hadir', 'Hadir', 'Sakit', 'Terlambat', 'Alpa'])).toEqual({
      Hadir: 2,
      Sakit: 1,
      Izin: 0,
      Alpa: 1,
      Terlambat: 1,
    });
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate(['Hadir', 'Terlambat', 'Alpa'])).toBe(67);
  });

  it('previews bulk promotion and flags unassigned students', () => {
    const preview = promotionPreview(
      [
        { id: 's1', name: 'Alya', nis: '1001' },
        { id: 's2', name: 'Bima', nis: '1002' },
      ],
      { s1: 'class-2b' },
    );
    expect(preview.valid).toBe(false);
    expect(preview.unassigned).toEqual(['s2']);
  });
});
