export type AcademicSessionInput = {
  id: string;
  classId: string;
  teacherId: string;
  roomId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status?: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';
};

export type SessionConflict = {
  resource: 'teacher' | 'class' | 'room';
  resourceId: string;
  incomingSessionId: string;
  existingSessionId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type RecurringScheduleInput = {
  id: string;
  classId: string;
  teacherId: string;
  roomId?: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  title: string;
};

export type GeneratedSession = AcademicSessionInput & { scheduleId: string; title: string };

export function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

export function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function findSessionConflicts(
  incoming: AcademicSessionInput,
  existing: AcademicSessionInput[],
): SessionConflict[] {
  const conflicts: SessionConflict[] = [];
  for (const session of existing) {
    if (session.id === incoming.id || session.date !== incoming.date) continue;
    if (session.status === 'cancelled' || incoming.status === 'cancelled') continue;
    if (!timeRangesOverlap(incoming.startTime, incoming.endTime, session.startTime, session.endTime))
      continue;
    const resources: Array<[SessionConflict['resource'], string | null | undefined]> = [
      ['teacher', incoming.teacherId === session.teacherId ? incoming.teacherId : null],
      ['class', incoming.classId === session.classId ? incoming.classId : null],
      ['room', incoming.roomId && incoming.roomId === session.roomId ? incoming.roomId : null],
    ];
    for (const [resource, resourceId] of resources) {
      if (!resourceId) continue;
      conflicts.push({
        resource,
        resourceId,
        incomingSessionId: incoming.id,
        existingSessionId: session.id,
        date: incoming.date,
        startTime: incoming.startTime,
        endTime: incoming.endTime,
      });
    }
  }
  return conflicts;
}

export function generateRecurringSessions(input: RecurringScheduleInput): GeneratedSession[] {
  const result: GeneratedSession[] = [];
  const cursor = new Date(`${input.startDate}T12:00:00`);
  const end = new Date(`${input.endDate}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return result;
  while (cursor <= end) {
    const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (weekday === input.weekday) {
      const date = localDateKey(cursor);
      result.push({
        id: `${input.id}-${date}`,
        scheduleId: input.id,
        classId: input.classId,
        teacherId: input.teacherId,
        roomId: input.roomId ?? null,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        status: 'scheduled',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' | 'Terlambat';

export function attendanceTotals(statuses: AttendanceStatus[]) {
  return statuses.reduce(
    (totals, status) => ({ ...totals, [status]: totals[status] + 1 }),
    { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0, Terlambat: 0 },
  );
}

export function attendanceRate(statuses: AttendanceStatus[]) {
  if (!statuses.length) return null;
  const totals = attendanceTotals(statuses);
  return Math.round(((totals.Hadir + totals.Terlambat) / statuses.length) * 100);
}

export function promotionPreview(
  students: Array<{ id: string; name: string; nis: string | null }>,
  assignments: Record<string, string>,
) {
  const rows = students.map((student) => ({
    ...student,
    destinationClassId: assignments[student.id] ?? null,
    valid: Boolean(assignments[student.id]),
  }));
  return {
    rows,
    valid: rows.every((row) => row.valid),
    unassigned: rows.filter((row) => !row.valid).map((row) => row.id),
  };
}

function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
