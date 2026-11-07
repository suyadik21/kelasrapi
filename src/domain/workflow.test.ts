import {
  applyScheduleExceptions,
  filterSchedulesForDay,
  isScheduleRangeValid,
  isValidScheduleTime,
  journalLeaveChoices,
  selectDashboardSchedule,
} from './workflow';

describe('teacher workflow rules', () => {
  it('filters schedules by weekday and preserves an empty state', () => {
    expect(
      filterSchedulesForDay(
        [
          { id: 'a', weekday: 4 },
          { id: 'b', weekday: 5 },
        ],
        4,
      ),
    ).toEqual([{ id: 'a', weekday: 4 }]);
    expect(filterSchedulesForDay([], 4)).toEqual([]);
    expect(
      selectDashboardSchedule(
        [
          { id: 'first', weekday: 4 },
          { id: 'second', weekday: 4 },
        ],
        4,
      ),
    ).toEqual([{ id: 'first', weekday: 4 }]);
  });

  it('validates real clock ranges, not only their shape', () => {
    expect(isValidScheduleTime('08:30')).toBe(true);
    expect(isValidScheduleTime('24:00')).toBe(false);
    expect(isValidScheduleTime('08:75')).toBe(false);
    expect(isValidScheduleTime('8:30')).toBe(false);
    expect(isScheduleRangeValid('08:00', '09:00')).toBe(true);
    expect(isScheduleRangeValid('10:00', '09:00')).toBe(false);
  });

  it('applies date-specific holidays, cancellations, and reschedules without mutating weekly data', () => {
    const weekly = [
      { id: 'math', title: 'Matematika', weekday: 5, start_time: '08:00', end_time: '09:00' },
      { id: 'indo', title: 'Bahasa Indonesia', weekday: 5, start_time: '10:00', end_time: '11:00' },
    ];
    expect(
      applyScheduleExceptions(weekly, [
        {
          kind: 'reschedule',
          schedule_id: 'math',
          title: 'Matematika pengganti',
          start_time: '09:30',
          end_time: '10:30',
        },
      ]),
    ).toEqual([
      {
        id: 'math',
        title: 'Matematika pengganti',
        weekday: 5,
        start_time: '09:30',
        end_time: '10:30',
      },
      { id: 'indo', title: 'Bahasa Indonesia', weekday: 5, start_time: '10:00', end_time: '11:00' },
    ]);
    expect(
      applyScheduleExceptions(weekly, [
        {
          kind: 'holiday',
          schedule_id: null,
          title: 'Tanggal merah',
          start_time: null,
          end_time: null,
        },
      ]),
    ).toEqual([]);
    expect(
      applyScheduleExceptions(
        [],
        [
          {
            kind: 'extra',
            schedule_id: null,
            title: 'Kelas pengganti',
            start_time: '08:00',
            end_time: '09:00',
          },
        ],
      ),
    ).toEqual([
      {
        id: 'exception-0-Kelas pengganti',
        title: 'Kelas pengganti',
        weekday: 0,
        start_time: '08:00',
        end_time: '09:00',
      },
    ]);
  });

  it('exposes the three journal recovery choices only when dirty', () => {
    expect(journalLeaveChoices(false)).toEqual([]);
    expect(journalLeaveChoices(true)).toEqual(['cancel', 'discard', 'save']);
  });
});
