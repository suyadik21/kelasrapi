export type RepeatRule = 'once' | 'weekly' | 'monthly' | 'semester' | 'custom';

export type AcademicSessionInput = {
  id: string;
  classId: string;
  teacherId: string;
  subjectId?: string | null;
  roomId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status?: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed' | 'replacement';
};

export type SessionConflict = {
  resource: 'teacher' | 'class' | 'room' | 'subject';
  resourceId: string;
  incomingSessionId: string;
  existingSessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
};

export type RecurringScheduleInput = {
  id: string;
  classId: string;
  teacherId: string;
  subjectId?: string | null;
  roomId?: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  title: string;
  repeatRule?: RepeatRule;
};

export type GeneratedSession = AcademicSessionInput & {
  scheduleId: string;
  title: string;
  repeatRule: RepeatRule;
};

export type EnrollmentMovementStatus =
  | 'Naik kelas'
  | 'Pindah kelas'
  | 'Tinggal kelas'
  | 'Lulus'
  | 'Keluar'
  | 'Arsip';

export const ENROLLMENT_MOVEMENT_STATUSES: EnrollmentMovementStatus[] = [
  'Naik kelas',
  'Pindah kelas',
  'Tinggal kelas',
  'Lulus',
  'Keluar',
  'Arsip',
];

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
    const resources: Array<[SessionConflict['resource'], string | null | undefined, string]> = [
      [
        'teacher',
        incoming.teacherId && incoming.teacherId === session.teacherId ? incoming.teacherId : null,
        `Jadwal guru bentrok pada ${incoming.date} (${incoming.startTime}–${incoming.endTime})`,
      ],
      [
        'class',
        incoming.classId && incoming.classId === session.classId ? incoming.classId : null,
        `Jadwal kelas bentrok pada ${incoming.date} (${incoming.startTime}–${incoming.endTime})`,
      ],
      [
        'room',
        incoming.roomId && incoming.roomId === session.roomId ? incoming.roomId : null,
        `Ruangan ${incoming.roomId} sedang dipakai pada ${incoming.date} (${incoming.startTime}–${incoming.endTime})`,
      ],
    ];
    for (const [resource, resourceId, description] of resources) {
      if (!resourceId) continue;
      conflicts.push({
        resource,
        resourceId,
        incomingSessionId: incoming.id,
        existingSessionId: session.id,
        date: incoming.date,
        startTime: incoming.startTime,
        endTime: incoming.endTime,
        description,
      });
    }
  }
  return conflicts;
}

export function generateRecurringSessions(input: RecurringScheduleInput): GeneratedSession[] {
  const result: GeneratedSession[] = [];
  const rule: RepeatRule = input.repeatRule ?? 'weekly';
  const cursor = new Date(`${input.startDate}T12:00:00`);
  const end = new Date(`${input.endDate}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) return result;

  if (rule === 'once') {
    const date = localDateKey(cursor);
    return [
      {
        id: `${input.id}-${date}`,
        scheduleId: input.id,
        classId: input.classId,
        teacherId: input.teacherId,
        subjectId: input.subjectId ?? null,
        roomId: input.roomId ?? null,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        status: 'scheduled',
        repeatRule: 'once',
      },
    ];
  }

  const startDayOfMonth = cursor.getDate();
  while (cursor <= end) {
    const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
    const matchesRule =
      rule === 'monthly'
        ? cursor.getDate() === startDayOfMonth
        : weekday === input.weekday;

    if (matchesRule) {
      const date = localDateKey(cursor);
      result.push({
        id: `${input.id}-${date}`,
        scheduleId: input.id,
        classId: input.classId,
        teacherId: input.teacherId,
        subjectId: input.subjectId ?? null,
        roomId: input.roomId ?? null,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
        title: input.title,
        status: 'scheduled',
        repeatRule: rule,
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

/**
 * Task 5.2: Persentase hadir = Total hadir / Total data absensi x 100
 * Jika belum ada data: "Belum ada cukup data"
 */
export function attendanceRate(statuses: AttendanceStatus[], strictHadirOnly = false) {
  if (!statuses.length) return null;
  const totals = attendanceTotals(statuses);
  const numerator = strictHadirOnly ? totals.Hadir : totals.Hadir + totals.Terlambat;
  return Math.round((numerator / statuses.length) * 100);
}

export function formatDashboardAttendanceIndicator(statuses: AttendanceStatus[]) {
  if (!statuses.length) {
    return { percentage: null, label: 'Belum ada cukup data' };
  }
  const totals = attendanceTotals(statuses);
  const percentage = Math.round((totals.Hadir / statuses.length) * 100);
  return {
    percentage,
    label: `${percentage}% hadir (${totals.Hadir}/${statuses.length} data absensi)`,
  };
}

export type NisImportCandidate = {
  rowNumber: number;
  name: string;
  nis: string;
  gender?: string;
};

export type NisValidationIssue = {
  rowNumber: number;
  name: string;
  nis: string;
  reason: string;
};

export function validateNisImportCandidates(
  candidates: NisImportCandidate[],
  existingNisSet: Set<string>,
) {
  const seenNisInFile = new Map<string, number>();
  const valid: NisImportCandidate[] = [];
  const errors: NisValidationIssue[] = [];

  for (const candidate of candidates) {
    const cleanName = candidate.name.trim();
    const cleanNis = candidate.nis.trim();
    if (cleanName.length < 2) {
      errors.push({
        rowNumber: candidate.rowNumber,
        name: cleanName,
        nis: cleanNis,
        reason: `Baris ${candidate.rowNumber}: Nama siswa minimal 2 karakter.`,
      });
      continue;
    }
    if (!cleanNis) {
      errors.push({
        rowNumber: candidate.rowNumber,
        name: cleanName,
        nis: cleanNis,
        reason: `Baris ${candidate.rowNumber}: NIS wajib diisi untuk "${cleanName}".`,
      });
      continue;
    }
    if (!/^[A-Za-z0-9.-]{3,20}$/.test(cleanNis)) {
      errors.push({
        rowNumber: candidate.rowNumber,
        name: cleanName,
        nis: cleanNis,
        reason: `Baris ${candidate.rowNumber}: Format NIS "${cleanNis}" tidak valid (3–20 karakter alfanumerik).`,
      });
      continue;
    }
    if (existingNisSet.has(cleanNis)) {
      errors.push({
        rowNumber: candidate.rowNumber,
        name: cleanName,
        nis: cleanNis,
        reason: `Baris ${candidate.rowNumber}: NIS "${cleanNis}" sudah terdaftar di sekolah ini.`,
      });
      continue;
    }
    const previousRow = seenNisInFile.get(cleanNis);
    if (previousRow !== undefined) {
      errors.push({
        rowNumber: candidate.rowNumber,
        name: cleanName,
        nis: cleanNis,
        reason: `Baris ${candidate.rowNumber}: NIS "${cleanNis}" duplikat dengan baris ${previousRow} di file import.`,
      });
      continue;
    }
    seenNisInFile.set(cleanNis, candidate.rowNumber);
    valid.push({ ...candidate, name: cleanName, nis: cleanNis });
  }

  return { valid, errors };
}

export function promotionPreview(
  students: Array<{ id: string; name: string; nis: string | null }>,
  assignments: Record<string, string>,
  movementStatuses: Record<string, EnrollmentMovementStatus> = {},
) {
  const rows = students.map((student) => {
    const status = movementStatuses[student.id] ?? 'Naik kelas';
    const requiresClass = status === 'Naik kelas' || status === 'Pindah kelas' || status === 'Tinggal kelas';
    const destinationClassId = assignments[student.id] ?? null;
    const valid = requiresClass ? Boolean(destinationClassId) : true;
    return {
      ...student,
      movementStatus: status,
      destinationClassId,
      valid,
    };
  });
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
