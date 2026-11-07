import { ATTENDANCE_STATUSES, isAttendanceStatus, summarizeAttendance } from './attendance';

describe('attendance domain rules', () => {
  it('accepts every visible status and rejects unknown values', () => {
    for (const status of ATTENDANCE_STATUSES) expect(isAttendanceStatus(status)).toBe(true);
    expect(isAttendanceStatus('Hadir lewat')).toBe(false);
  });

  it('summarizes duplicate session rows deterministically', () => {
    expect(summarizeAttendance(['Hadir', 'Sakit', 'Hadir', 'Alpa'])).toEqual({
      Hadir: 2,
      Sakit: 1,
      Alpa: 1,
    });
  });
});
