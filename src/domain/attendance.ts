export const ATTENDANCE_STATUSES = ['Hadir', 'Sakit', 'Izin', 'Alpa', 'Terlambat'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function summarizeAttendance(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((summary, status) => {
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});
}
