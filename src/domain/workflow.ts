export type ScheduleLike = { weekday: number };

export type ScheduleExceptionLike = {
  kind: 'holiday' | 'cancel' | 'reschedule' | 'extra';
  schedule_id: string | null;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

export function applyScheduleExceptions<
  T extends ScheduleLike & { id: string; title: string; start_time: string; end_time: string },
>(schedules: T[], exceptions: ScheduleExceptionLike[]): T[] {
  const hasWorkdayOverride = exceptions.some(
    (exception) =>
      exception.kind === 'extra' && exception.title === '__KELASRAPI_WORKDAY_OVERRIDE__',
  );
  if (exceptions.some((exception) => exception.kind === 'holiday') && !hasWorkdayOverride)
    return [];
  const cancelled = new Set(
    exceptions
      .filter((exception) => exception.kind === 'cancel')
      .map((exception) => exception.schedule_id)
      .filter((id): id is string => Boolean(id)),
  );
  const result = schedules
    .filter((schedule) => !cancelled.has(schedule.id))
    .map((schedule) => {
      const override = exceptions.find(
        (exception) => exception.kind === 'reschedule' && exception.schedule_id === schedule.id,
      );
      return override
        ? {
            ...schedule,
            title: override.title || schedule.title,
            start_time: override.start_time ?? schedule.start_time,
            end_time: override.end_time ?? schedule.end_time,
          }
        : schedule;
    });
  const extras = exceptions
    .filter(
      (exception) =>
        exception.kind === 'extra' && exception.title !== '__KELASRAPI_WORKDAY_OVERRIDE__',
    )
    .map((exception, index) => {
      const base = schedules[0];
      return {
        ...(base ?? { weekday: 0 }),
        id: `exception-${index}-${exception.title}`,
        title: exception.title,
        start_time: exception.start_time ?? '00:00',
        end_time: exception.end_time ?? '00:00',
      } as T;
    });
  return [...result, ...extras].sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
}

export function filterSchedulesForDay<T extends ScheduleLike>(rows: T[], weekday: number): T[] {
  return rows.filter((row) => row.weekday === weekday);
}

export function selectDashboardSchedule<T extends ScheduleLike>(rows: T[], weekday: number): T[] {
  return filterSchedulesForDay(rows, weekday).slice(0, 1);
}

export function isValidScheduleTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function isScheduleRangeValid(start: string, end: string): boolean {
  if (!isValidScheduleTime(start) || !isValidScheduleTime(end)) return false;
  return start < end;
}

export function journalLeaveChoices(isDirty: boolean): Array<'cancel' | 'discard' | 'save'> {
  return isDirty ? ['cancel', 'discard', 'save'] : [];
}
