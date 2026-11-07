import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import {
  type EnrollmentMovementStatus,
  findSessionConflicts,
  generateRecurringSessions,
  type RepeatRule,
} from '../domain/academic';

export type StudentRow = {
  id: string;
  name: string;
  nis?: string | null;
  status: string;
  note: string;
  enrollment_status?: string;
};
export type ArchivedStudentRow = { id: string; name: string; nis?: string | null };
export type AttendanceRecapRow = { status: string; total: number };
export type AttendanceStudentRecapRow = { id: string; name: string; nis?: string | null; status: string };
export type AttendancePeriod = 'day' | 'week' | 'month' | 'semester' | 'custom';
export type AttendanceAlertRow = { id: string; name: string; nis?: string | null; missed_days: number };
export type AttendanceAccumulationRow = {
  id: string;
  name: string;
  nis?: string | null;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  terlambat: number;
};
export type ClassRow = {
  id: string;
  name: string;
  group_name: string | null;
  academic_year_id?: string | null;
  year_label?: string | null;
};
export type StudentIdentityRow = { id: string; name: string; nis: string | null };
export type TeachingSessionRow = {
  id: string;
  schedule_id: string | null;
  class_id: string;
  class_name?: string;
  subject_id: string | null;
  subject_name?: string | null;
  teacher_id: string | null;
  room_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  title: string;
  attendance_state?: string | null;
  present_count?: number;
  unfilled_count?: number;
  journal_state?: string | null;
};
export type EnrollmentRow = {
  id: string;
  student_id: string;
  class_id: string;
  academic_year_id: string;
  term_id: string;
  status: string;
  movement_status?: string | null;
  previous_class_id?: string | null;
  changed_by?: string | null;
  enrolled_at: string;
};
export type AttendanceRecordInput = { studentId: string; status: string; note?: string };
export type ScheduleRow = {
  id: string;
  title: string;
  weekday: number;
  start_time: string;
  end_time: string;
  repeat_rule: string | null;
  room_id?: string | null;
  subject_id?: string | null;
};
export type ScheduleExceptionRow = {
  id: string;
  class_id: string | null;
  schedule_id: string | null;
  exception_date: string;
  kind: 'holiday' | 'cancel' | 'reschedule' | 'extra';
  title: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};
export type JournalRow = {
  id: string;
  content: string;
  material?: string;
  objective?: string;
  activity?: string;
  method?: string;
  note?: string;
  state: string;
  updated_at: string;
};
export type ScoreRow = { student_id: string; score: number | null; note: string };
export type GradeComponentRow = {
  id: string;
  name: string;
  session_id?: string | null;
  subject: string | null;
  category: string | null;
  max_score: number;
  weight: number | null;
  kkm?: number | null;
  state?: string | null;
  assessment_date: string;
};
export type AgendaRow = {
  id: string;
  title: string;
  due_date: string;
  completed_at: string | null;
  note: string | null;
  class_id?: string;
  subject?: string | null;
  assigned_date?: string | null;
  max_score?: number | null;
  is_remedial?: number | null;
};
export type BackupPayload = {
  format: 'kelasrapi-backup';
  schemaVersion: number;
  createdAt: string;
  data: Record<string, unknown[]>;
  integrity: string;
};

export const SCHEMA_VERSION = 2;
export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [1, SCHEMA_VERSION, 3] as const;

export function localDateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      logo_uri TEXT,
      principal_name TEXT,
      principal_nip TEXT,
      city TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teacher_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      nip_nuptk TEXT,
      school_id TEXT,
      default_subject_id TEXT,
      report_preferences_json TEXT,
      app_mode TEXT NOT NULL DEFAULT 'real',
      theme_preference TEXT NOT NULL DEFAULT 'system',
      pin_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT,
      label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      active INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS academic_terms (
      id TEXT PRIMARY KEY NOT NULL,
      academic_year_id TEXT NOT NULL,
      label TEXT NOT NULL,
      term_number INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      active INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
    );
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY NOT NULL,
      school_id TEXT,
      name TEXT NOT NULL,
      code TEXT,
      default_kkm REAL NOT NULL DEFAULT 75,
      archived_at TEXT,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
    CREATE TABLE IF NOT EXISTS student_enrollments (
      id TEXT PRIMARY KEY NOT NULL,
      student_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      academic_year_id TEXT NOT NULL,
      term_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      movement_status TEXT DEFAULT 'Naik kelas',
      previous_class_id TEXT,
      changed_by TEXT,
      enrolled_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_student_term ON student_enrollments(student_id, term_id);
    CREATE VIEW IF NOT EXISTS class_enrollments AS SELECT * FROM student_enrollments;
    CREATE TABLE IF NOT EXISTS schedule_templates (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      subject_id TEXT,
      teacher_id TEXT,
      room_id TEXT,
      academic_year_id TEXT,
      term_id TEXT,
      title TEXT NOT NULL,
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      repeat_rule TEXT NOT NULL DEFAULT 'weekly',
      archived_at TEXT,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS teaching_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      schedule_id TEXT,
      class_id TEXT NOT NULL,
      subject_id TEXT,
      teacher_id TEXT,
      room_id TEXT,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      exception_reason TEXT,
      UNIQUE(schedule_id, session_date),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_teaching_sessions_date ON teaching_sessions(session_date, class_id, start_time);
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      teaching_session_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'draft',
      correction_reason TEXT,
      finalized_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (teaching_session_id) REFERENCES teaching_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS attendance_records (
      attendance_session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (attendance_session_id, student_id),
      FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY NOT NULL,
      teaching_session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      max_score REAL NOT NULL,
      weight REAL NOT NULL DEFAULT 1,
      kkm REAL NOT NULL DEFAULT 75,
      state TEXT NOT NULL DEFAULT 'draft',
      correction_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (teaching_session_id) REFERENCES teaching_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS assessment_scores (
      assessment_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score REAL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (assessment_id, student_id),
      FOREIGN KEY (assessment_id) REFERENCES assessments(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS lesson_journals (
      id TEXT PRIMARY KEY NOT NULL,
      teaching_session_id TEXT NOT NULL UNIQUE,
      material TEXT NOT NULL DEFAULT '',
      objective TEXT NOT NULL DEFAULT '',
      activity TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'draft',
      correction_reason TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (teaching_session_id) REFERENCES teaching_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      teaching_session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      assigned_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      FOREIGN KEY (teaching_session_id) REFERENCES teaching_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migration_issues (
      id TEXT PRIMARY KEY NOT NULL,
      source_table TEXT NOT NULL,
      source_id TEXT,
      issue TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_metadata (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      sync_state TEXT NOT NULL DEFAULT 'local',
      version INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(entity_type, entity_id)
    );
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      group_name TEXT,
      academic_year_id TEXT,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      name TEXT NOT NULL,
      nis TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      repeat_rule TEXT,
      room_id TEXT,
      subject_id TEXT,
      archived_at TEXT,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS schedule_exceptions (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT,
      schedule_id TEXT,
      exception_date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('holiday', 'cancel', 'reschedule', 'extra')),
      title TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      note TEXT,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      UNIQUE (schedule_id, exception_date, kind)
    );
    CREATE TABLE IF NOT EXISTS agendas (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      completed_at TEXT,
      note TEXT,
      subject TEXT,
      assigned_date TEXT,
      max_score REAL DEFAULT 100,
      is_remedial INTEGER DEFAULT 0,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS journals (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      journal_date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      material TEXT DEFAULT '',
      objective TEXT DEFAULT '',
      activity TEXT DEFAULT '',
      method TEXT DEFAULT '',
      note TEXT DEFAULT '',
      state TEXT NOT NULL DEFAULT 'draft',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      UNIQUE (class_id, journal_date)
    );
    CREATE TABLE IF NOT EXISTS grading_components (
      id TEXT PRIMARY KEY NOT NULL,
      class_id TEXT NOT NULL,
      name TEXT NOT NULL,
      subject TEXT,
      category TEXT,
      max_score REAL NOT NULL,
      weight REAL,
      kkm REAL DEFAULT 75,
      state TEXT DEFAULT 'draft',
      correction_reason TEXT,
      assessment_date TEXT NOT NULL,
      session_id TEXT,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS scores (
      component_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score REAL,
      note TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (component_id, student_id),
      FOREIGN KEY (component_id) REFERENCES grading_components(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
    CREATE TABLE IF NOT EXISTS attendance_drafts (
      class_id TEXT NOT NULL,
      attendance_date TEXT NOT NULL,
      student_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (class_id, attendance_date, student_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      class_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      format TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft',
      file_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    );
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY NOT NULL,
      schema_version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      integrity_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const additiveMigrations = [
    'ALTER TABLE grading_components ADD COLUMN category TEXT',
    'ALTER TABLE grading_components ADD COLUMN session_id TEXT',
    'ALTER TABLE grading_components ADD COLUMN kkm REAL DEFAULT 75',
    "ALTER TABLE grading_components ADD COLUMN state TEXT DEFAULT 'draft'",
    'ALTER TABLE grading_components ADD COLUMN correction_reason TEXT',
    'ALTER TABLE students ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE students ADD COLUMN nis TEXT',
    "ALTER TABLE attendance_drafts ADD COLUMN note TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE classes ADD COLUMN group_name TEXT',
    'ALTER TABLE classes ADD COLUMN academic_year_id TEXT',
    'ALTER TABLE teacher_profiles ADD COLUMN nip_nuptk TEXT',
    'ALTER TABLE teacher_profiles ADD COLUMN report_preferences_json TEXT',
    "ALTER TABLE teacher_profiles ADD COLUMN app_mode TEXT NOT NULL DEFAULT 'real'",
    "ALTER TABLE teacher_profiles ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'",
    'ALTER TABLE teacher_profiles ADD COLUMN pin_code TEXT',
    'ALTER TABLE schools ADD COLUMN logo_uri TEXT',
    'ALTER TABLE schools ADD COLUMN principal_name TEXT',
    'ALTER TABLE schools ADD COLUMN principal_nip TEXT',
    'ALTER TABLE schools ADD COLUMN city TEXT',
    "ALTER TABLE student_enrollments ADD COLUMN movement_status TEXT DEFAULT 'Naik kelas'",
    'ALTER TABLE student_enrollments ADD COLUMN previous_class_id TEXT',
    'ALTER TABLE student_enrollments ADD COLUMN changed_by TEXT',
    "ALTER TABLE lesson_journals ADD COLUMN activity TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE lesson_journals ADD COLUMN correction_reason TEXT',
    "ALTER TABLE journals ADD COLUMN material TEXT DEFAULT ''",
    "ALTER TABLE journals ADD COLUMN objective TEXT DEFAULT ''",
    "ALTER TABLE journals ADD COLUMN activity TEXT DEFAULT ''",
    "ALTER TABLE journals ADD COLUMN method TEXT DEFAULT ''",
    "ALTER TABLE journals ADD COLUMN note TEXT DEFAULT ''",
    'ALTER TABLE agendas ADD COLUMN subject TEXT',
    'ALTER TABLE agendas ADD COLUMN assigned_date TEXT',
    'ALTER TABLE agendas ADD COLUMN max_score REAL DEFAULT 100',
    'ALTER TABLE agendas ADD COLUMN is_remedial INTEGER DEFAULT 0',
  ];

  for (const sql of additiveMigrations) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists
    }
  }

  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_nis ON students(nis) WHERE nis IS NOT NULL AND archived_at IS NULL',
  );

  await db.runAsync(
    'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
    SCHEMA_VERSION,
    new Date().toISOString(),
  );
}

/**
 * Task 1.5 & 2.2: Clean dummy records ("Latihan pecahan") when operating in real mode
 */
export async function purgeDummyArtifactsInRealMode(db: SQLiteDatabase) {
  await db.runAsync(
    "DELETE FROM grading_components WHERE lower(name) = 'latihan pecahan' AND id LIKE 'component-default-%'",
  );
}

export async function loadStudents(
  db: SQLiteDatabase,
  classId = 'class-1a',
  date = localDateKey(),
): Promise<StudentRow[]> {
  return db.getAllAsync<StudentRow>(
    `SELECT students.id, students.name, students.nis,
      COALESCE(
        (SELECT ar.status FROM attendance_records ar
         JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
         JOIN teaching_sessions ts ON ts.id = ats.teaching_session_id
         WHERE ts.class_id = ? AND ts.session_date = ? AND ar.student_id = students.id
         ORDER BY ts.start_time DESC LIMIT 1),
        (SELECT status FROM attendance_drafts WHERE class_id = ? AND attendance_date = ? AND student_id = students.id LIMIT 1),
        ?
      ) AS status,
      COALESCE(
        (SELECT ar.note FROM attendance_records ar
         JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
         JOIN teaching_sessions ts ON ts.id = ats.teaching_session_id
         WHERE ts.class_id = ? AND ts.session_date = ? AND ar.student_id = students.id
         ORDER BY ts.start_time DESC LIMIT 1),
        (SELECT note FROM attendance_drafts WHERE class_id = ? AND attendance_date = ? AND student_id = students.id LIMIT 1),
        ''
      ) AS note
     FROM students
     WHERE (
       students.class_id = ?
       OR EXISTS (
         SELECT 1 FROM student_enrollments se
         WHERE se.student_id = students.id AND se.class_id = ? AND se.status = 'active'
       )
     )
     AND students.archived_at IS NULL
     ORDER BY students.sort_order, students.name`,
    classId,
    date,
    classId,
    date,
    'Belum diisi',
    classId,
    date,
    classId,
    date,
    classId,
    classId,
  );
}

export async function loadAttendanceRecap(
  db: SQLiteDatabase,
  classId = 'class-1a',
  period: AttendancePeriod = 'day',
  date = localDateKey(),
  customStart = date,
  customEnd = date,
) {
  const range = attendanceDateRange(period, date, customStart, customEnd);
  return db.getAllAsync<AttendanceRecapRow>(
    'SELECT status, COUNT(*) AS total FROM attendance_drafts WHERE class_id = ? AND attendance_date BETWEEN ? AND ? GROUP BY status ORDER BY status',
    classId,
    range.start,
    range.end,
  );
}

export async function loadAttendanceStudentRecap(
  db: SQLiteDatabase,
  classId = 'class-1a',
  period: AttendancePeriod = 'day',
  date = localDateKey(),
  customStart = date,
  customEnd = date,
) {
  const range = attendanceDateRange(period, date, customStart, customEnd);
  return db.getAllAsync<AttendanceStudentRecapRow>(
    "SELECT students.id, students.name, students.nis, COALESCE((SELECT status FROM attendance_drafts WHERE attendance_drafts.class_id = ? AND attendance_drafts.student_id = students.id AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date DESC LIMIT 1), 'Belum diisi') AS status FROM students WHERE students.class_id = ? AND students.archived_at IS NULL ORDER BY students.name",
    classId,
    range.start,
    range.end,
    classId,
  );
}

export async function loadAttendanceAlerts(
  db: SQLiteDatabase,
  classId = 'class-1a',
  endDate = localDateKey(),
) {
  const start = new Date(`${endDate}T12:00:00`);
  start.setDate(start.getDate() - 29);
  return db.getAllAsync<AttendanceAlertRow>(
    "SELECT students.id, students.name, students.nis, COUNT(*) AS missed_days FROM students JOIN attendance_drafts ON attendance_drafts.student_id = students.id AND attendance_drafts.class_id = students.class_id WHERE students.class_id = ? AND students.archived_at IS NULL AND attendance_drafts.attendance_date BETWEEN ? AND ? AND attendance_drafts.status NOT IN ('Hadir', 'Belum diisi') GROUP BY students.id, students.name, students.nis HAVING COUNT(*) > 3 ORDER BY missed_days DESC, students.name",
    classId,
    localDateKey(start),
    endDate,
  );
}

export async function loadAttendanceAccumulation(
  db: SQLiteDatabase,
  classId = 'class-1a',
  startDate: string,
  endDate: string,
) {
  return db.getAllAsync<AttendanceAccumulationRow>(
    `WITH session_attendance AS (
      SELECT ar.student_id, ts.class_id, ts.session_date AS attendance_date, ar.status
      FROM attendance_records ar
      JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id
      JOIN teaching_sessions ts ON ts.id = ats.teaching_session_id
      WHERE ts.session_date BETWEEN ? AND ? AND ts.class_id = ?
    ), legacy_attendance AS (
      SELECT ad.student_id, ad.class_id, ad.attendance_date, ad.status
      FROM attendance_drafts ad
      WHERE ad.attendance_date BETWEEN ? AND ? AND ad.class_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM teaching_sessions ts
          JOIN attendance_sessions ats ON ats.teaching_session_id = ts.id
          WHERE ts.class_id = ad.class_id AND ts.session_date = ad.attendance_date
        )
    ), all_attendance AS (
      SELECT * FROM session_attendance
      UNION ALL
      SELECT * FROM legacy_attendance
    )
    SELECT students.id, students.name, students.nis,
      SUM(CASE WHEN all_attendance.status = 'Hadir' THEN 1 ELSE 0 END) AS hadir,
      SUM(CASE WHEN all_attendance.status = 'Sakit' THEN 1 ELSE 0 END) AS sakit,
      SUM(CASE WHEN all_attendance.status = 'Izin' THEN 1 ELSE 0 END) AS izin,
      SUM(CASE WHEN all_attendance.status = 'Alpa' THEN 1 ELSE 0 END) AS alpa,
      SUM(CASE WHEN all_attendance.status = 'Terlambat' THEN 1 ELSE 0 END) AS terlambat
    FROM students LEFT JOIN all_attendance ON all_attendance.student_id = students.id
    WHERE students.class_id = ? AND students.archived_at IS NULL
    GROUP BY students.id, students.name, students.nis ORDER BY students.name`,
    startDate,
    endDate,
    classId,
    startDate,
    endDate,
    classId,
    classId,
  );
}

function attendanceDateRange(
  period: AttendancePeriod,
  date: string,
  customStart: string,
  customEnd: string,
) {
  if (period === 'custom') return { start: customStart, end: customEnd };
  if (period === 'day') return { start: date, end: date };
  const anchor = new Date(`${date}T12:00:00`);
  if (period === 'week') {
    const day = anchor.getDay() === 0 ? 7 : anchor.getDay();
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: localDateKey(start), end: localDateKey(end) };
  }
  if (period === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    return { start: localDateKey(start), end: localDateKey(end) };
  }
  return { start: `${anchor.getFullYear()}-01-01`, end: `${anchor.getFullYear()}-12-31` };
}

export async function loadClasses(db: SQLiteDatabase) {
  return db.getAllAsync<ClassRow>(
    `SELECT classes.id, classes.name, classes.group_name, classes.academic_year_id,
      academic_years.label AS year_label
     FROM classes
     LEFT JOIN academic_years ON academic_years.id = classes.academic_year_id
     WHERE classes.archived_at IS NULL
     ORDER BY classes.group_name, classes.name`,
  );
}

export async function addClass(
  db: SQLiteDatabase,
  id: string,
  name: string,
  groupName = '',
  academicYearId?: string | null,
) {
  if (academicYearId !== undefined) {
    await db.runAsync(
      'INSERT INTO classes (id, name, group_name, academic_year_id) VALUES (?, ?, ?, ?)',
      id,
      name.trim(),
      groupName.trim() || null,
      academicYearId,
    );
    return;
  }
  await db.runAsync(
    'INSERT INTO classes (id, name, group_name) VALUES (?, ?, ?)',
    id,
    name.trim(),
    groupName.trim() || null,
  );
}

export async function updateClass(db: SQLiteDatabase, id: string, name: string, groupName = '') {
  await db.runAsync(
    'UPDATE classes SET name = ?, group_name = ? WHERE id = ?',
    name.trim(),
    groupName.trim() || null,
    id,
  );
}

export async function archiveClass(db: SQLiteDatabase, id: string) {
  await db.runAsync(
    'UPDATE classes SET archived_at = ? WHERE id = ?',
    new Date().toISOString(),
    id,
  );
}

export async function addStudent(
  db: SQLiteDatabase,
  classId: string,
  id: string,
  name: string,
  nis = '',
) {
  const normalizedName = name.trim();
  if (normalizedName.length < 2) throw new Error('Nama siswa minimal 2 karakter.');
  const duplicate = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM students WHERE class_id = ? AND archived_at IS NULL AND lower(name) = lower(?) LIMIT 1',
    classId,
    normalizedName,
  );
  if (duplicate) throw new Error('Siswa dengan nama tersebut sudah ada di kelas ini.');
  const normalizedNis = nis.trim();
  if (normalizedNis) {
    const duplicateNis = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM students WHERE archived_at IS NULL AND nis = ? LIMIT 1',
      normalizedNis,
    );
    if (duplicateNis) throw new Error('NIS tersebut sudah digunakan siswa lain.');
  }
  const order = await db.getFirstAsync<{ maxOrder: number | null }>(
    'SELECT MAX(sort_order) AS maxOrder FROM students WHERE class_id = ?',
    classId,
  );
  await db.runAsync(
    'INSERT INTO students (id, class_id, name, nis, sort_order) VALUES (?, ?, ?, ?, ?)',
    id,
    classId,
    normalizedName,
    normalizedNis || null,
    (order?.maxOrder ?? -1) + 1,
  );
}

export async function addStudentWithNis(
  db: SQLiteDatabase,
  classId: string,
  id: string,
  name: string,
  nis: string,
) {
  const normalizedName = name.trim();
  const normalizedNis = nis.trim();
  if (normalizedName.length < 2) throw new Error('Nama siswa minimal 2 karakter.');
  if (!normalizedNis) throw new Error('NIS wajib diisi.');
  const duplicate = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM students WHERE archived_at IS NULL AND nis = ? LIMIT 1',
    normalizedNis,
  );
  if (duplicate) throw new Error('NIS tersebut sudah digunakan siswa lain.');
  await db.runAsync(
    'INSERT INTO students (id, class_id, name, nis, sort_order) VALUES (?, ?, ?, ?, ?)',
    id,
    classId,
    normalizedName,
    normalizedNis,
    0,
  );
}

export async function loadStudentIdentities(db: SQLiteDatabase, classId: string) {
  return db.getAllAsync<StudentIdentityRow>(
    'SELECT id, name, nis FROM students WHERE class_id = ? AND archived_at IS NULL ORDER BY sort_order, name',
    classId,
  );
}

export async function saveAcademicContext(
  db: SQLiteDatabase,
  context: {
    teacherId: string;
    teacherName: string;
    teacherNip?: string;
    schoolId: string;
    schoolName: string;
    schoolAddress?: string;
    principalName?: string;
    principalNip?: string;
    city?: string;
    yearId: string;
    yearLabel: string;
    termId: string;
    termLabel: string;
    termNumber: number;
    startDate: string;
    endDate: string;
    appMode?: 'real' | 'demo';
    defaultSubjectName?: string;
    initialClassName?: string;
  },
) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO schools (id, name, address, principal_name, principal_nip, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      context.schoolId,
      context.schoolName.trim(),
      context.schoolAddress?.trim() || null,
      context.principalName?.trim() || null,
      context.principalNip?.trim() || null,
      context.city?.trim() || null,
      now,
    );
    await db.runAsync(
      'INSERT OR REPLACE INTO teacher_profiles (id, name, nip_nuptk, school_id, app_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      context.teacherId,
      context.teacherName.trim(),
      context.teacherNip?.trim() || null,
      context.schoolId,
      context.appMode ?? 'real',
      now,
      now,
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO academic_years (id, school_id, label, start_date, end_date, status, active) VALUES (?, ?, ?, ?, ?, 'active', 1)",
      context.yearId,
      context.schoolId,
      context.yearLabel.trim(),
      context.startDate,
      context.endDate,
    );
    await db.runAsync(
      "UPDATE academic_years SET active = 0, status = 'archived' WHERE id <> ?",
      context.yearId,
    );
    await db.runAsync(
      "INSERT OR REPLACE INTO academic_terms (id, academic_year_id, label, term_number, start_date, end_date, status, active) VALUES (?, ?, ?, ?, ?, ?, 'active', 1)",
      context.termId,
      context.yearId,
      context.termLabel.trim(),
      context.termNumber,
      context.startDate,
      context.endDate,
    );
    await db.runAsync('UPDATE academic_terms SET active = 0 WHERE id <> ?', context.termId);

    if (context.defaultSubjectName?.trim()) {
      await db.runAsync(
        'INSERT OR IGNORE INTO subjects (id, school_id, name, default_kkm) VALUES (?, ?, ?, 75)',
        `subject-${context.defaultSubjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        context.schoolId,
        context.defaultSubjectName.trim(),
      );
    }

    if (context.initialClassName?.trim()) {
      const existingClasses = await loadClasses(db);
      if (!existingClasses.length) {
        await addClass(
          db,
          `class-${context.initialClassName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          context.initialClassName.trim(),
          context.yearLabel.trim(),
          context.yearId,
        );
      }
    }

    if ((context.appMode ?? 'real') === 'real') {
      await purgeDummyArtifactsInRealMode(db);
    }

    const legacyStudents = await db.getAllAsync<{ id: string; class_id: string; nis: string | null }>(
      'SELECT id, class_id, nis FROM students WHERE archived_at IS NULL',
    );
    for (const student of legacyStudents) {
      await db.runAsync(
        `INSERT OR IGNORE INTO student_enrollments
         (id, student_id, class_id, academic_year_id, term_id, status, enrolled_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        `enrollment-${student.id}-${context.termId}`,
        student.id,
        student.class_id,
        context.yearId,
        context.termId,
        now,
      );
      if (!student.nis) {
        await db.runAsync(
          'INSERT OR IGNORE INTO migration_issues (id, source_table, source_id, issue, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          `migration-student-nis-${student.id}`,
          'students',
          student.id,
          'missing_nis',
          'Siswa lama belum memiliki NIS dan perlu dilengkapi.',
          now,
        );
      }
    }
  });
}

export async function loadActiveAcademicContext(db: SQLiteDatabase) {
  return db.getFirstAsync<{
    teacher_id: string;
    teacher_name: string;
    nip_nuptk: string | null;
    app_mode: string | null;
    theme_preference: string | null;
    pin_code: string | null;
    school_id: string | null;
    school_name: string | null;
    school_address: string | null;
    principal_name: string | null;
    principal_nip: string | null;
    city: string | null;
    year_id: string;
    year_label: string;
    term_id: string;
    term_label: string;
    start_date: string;
    end_date: string;
  }>(
    `SELECT teacher_profiles.id AS teacher_id, teacher_profiles.name AS teacher_name,
      teacher_profiles.nip_nuptk, teacher_profiles.app_mode,
      teacher_profiles.theme_preference, teacher_profiles.pin_code,
      schools.id AS school_id, schools.name AS school_name,
      schools.address AS school_address, schools.principal_name,
      schools.principal_nip, schools.city,
      academic_years.id AS year_id, academic_years.label AS year_label,
      academic_terms.id AS term_id, academic_terms.label AS term_label,
      academic_terms.start_date, academic_terms.end_date
     FROM teacher_profiles
     LEFT JOIN schools ON schools.id = teacher_profiles.school_id
     JOIN academic_years ON academic_years.active = 1
     JOIN academic_terms ON academic_terms.academic_year_id = academic_years.id AND academic_terms.active = 1
     ORDER BY teacher_profiles.updated_at DESC LIMIT 1`,
  );
}

export async function saveTeachingSession(
  db: SQLiteDatabase,
  session: {
    id: string;
    scheduleId?: string | null;
    classId: string;
    subjectId?: string | null;
    teacherId?: string | null;
    roomId?: string | null;
    date: string;
    startTime: string;
    endTime: string;
    title: string;
    status?: string;
    exceptionReason?: string | null;
  },
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO teaching_sessions
      (id, schedule_id, class_id, subject_id, teacher_id, room_id, session_date, start_time, end_time, title, status, exception_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    session.id,
    session.scheduleId ?? null,
    session.classId,
    session.subjectId ?? null,
    session.teacherId ?? null,
    session.roomId ?? null,
    session.date,
    session.startTime,
    session.endTime,
    session.title.trim(),
    session.status ?? 'scheduled',
    session.exceptionReason ?? null,
  );
}

export async function loadTeachingSessions(db: SQLiteDatabase, date: string, classId?: string) {
  return db.getAllAsync<TeachingSessionRow>(
    `SELECT ts.id, ts.schedule_id, ts.class_id, classes.name AS class_name,
      ts.subject_id, ts.teacher_id, ts.room_id, ts.session_date, ts.start_time, ts.end_time, ts.status, ts.title,
      (SELECT state FROM attendance_sessions WHERE teaching_session_id = ts.id LIMIT 1) AS attendance_state,
      (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id WHERE ats.teaching_session_id = ts.id AND ar.status = 'Hadir') AS present_count,
      (SELECT state FROM lesson_journals WHERE teaching_session_id = ts.id LIMIT 1) AS journal_state
     FROM teaching_sessions ts
     LEFT JOIN classes ON classes.id = ts.class_id
     WHERE ts.session_date = ? AND (? IS NULL OR ts.class_id = ?)
     ORDER BY ts.start_time, ts.title`,
    date,
    classId ?? null,
    classId ?? null,
  );
}

export async function loadAllTeachingSessionsForClass(
  db: SQLiteDatabase,
  classId: string,
  limit = 60,
) {
  return db.getAllAsync<TeachingSessionRow>(
    `SELECT ts.id, ts.schedule_id, ts.class_id, classes.name AS class_name,
      ts.subject_id, ts.teacher_id, ts.room_id, ts.session_date, ts.start_time, ts.end_time, ts.status, ts.title,
      (SELECT state FROM attendance_sessions WHERE teaching_session_id = ts.id LIMIT 1) AS attendance_state,
      (SELECT COUNT(*) FROM attendance_records ar JOIN attendance_sessions ats ON ats.id = ar.attendance_session_id WHERE ats.teaching_session_id = ts.id AND ar.status = 'Hadir') AS present_count,
      (SELECT state FROM lesson_journals WHERE teaching_session_id = ts.id LIMIT 1) AS journal_state
     FROM teaching_sessions ts
     LEFT JOIN classes ON classes.id = ts.class_id
     WHERE ts.class_id = ?
     ORDER BY ts.session_date DESC, ts.start_time ASC
     LIMIT ?`,
    classId,
    limit,
  );
}

export async function createScheduleTemplateAndSessions(
  db: SQLiteDatabase,
  input: {
    id: string;
    classId: string;
    subjectId?: string | null;
    teacherId?: string | null;
    roomId?: string | null;
    title: string;
    weekday: number;
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    repeatRule?: RepeatRule;
  },
) {
  const sessions = generateRecurringSessions({
    id: input.id,
    classId: input.classId,
    teacherId: input.teacherId ?? '',
    subjectId: input.subjectId,
    roomId: input.roomId,
    weekday: input.weekday,
    startTime: input.startTime,
    endTime: input.endTime,
    startDate: input.startDate,
    endDate: input.endDate,
    title: input.title,
    repeatRule: input.repeatRule ?? 'weekly',
  });
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO schedule_templates
       (id, class_id, subject_id, teacher_id, room_id, title, weekday, start_time, end_time, start_date, end_date, repeat_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.classId,
      input.subjectId ?? null,
      input.teacherId ?? null,
      input.roomId ?? null,
      input.title.trim(),
      input.weekday,
      input.startTime,
      input.endTime,
      input.startDate,
      input.endDate,
      input.repeatRule ?? 'weekly',
    );
    for (const session of sessions) {
      const existing = await loadTeachingSessions(db, session.date);
      const conflicts = findSessionConflicts(
        session,
        existing.map((row) => ({
          id: row.id,
          classId: row.class_id,
          teacherId: row.teacher_id ?? '',
          roomId: row.room_id,
          date: row.session_date,
          startTime: row.start_time,
          endTime: row.end_time,
          status: row.status as 'scheduled' | 'cancelled' | 'rescheduled' | 'completed',
        })),
      );
      if (conflicts.length) {
        throw new Error(
          `Sesi ${session.title} bentrok pada ${session.date} pukul ${session.startTime} (${conflicts[0].description}).`,
        );
      }
      await saveTeachingSession(db, { ...session, subjectId: input.subjectId });
    }
  });
  return sessions;
}

export async function promoteStudentsBulk(
  db: SQLiteDatabase,
  students: Array<{
    id: string;
    destinationClassId: string;
    movementStatus?: EnrollmentMovementStatus;
    previousClassId?: string;
  }>,
  academicYearId: string,
  termId: string,
  actorName = 'Guru',
) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const student of students) {
      const moveStatus = student.movementStatus ?? 'Naik kelas';
      const needsClass =
        moveStatus === 'Naik kelas' || moveStatus === 'Pindah kelas' || moveStatus === 'Tinggal kelas';
      if (needsClass && !student.destinationClassId) {
        throw new Error('Semua siswa aktif harus memiliki kelas tujuan.');
      }
      const targetClass = student.destinationClassId || student.previousClassId || '';
      await db.runAsync(
        `INSERT OR REPLACE INTO student_enrollments
         (id, student_id, class_id, academic_year_id, term_id, status, movement_status, previous_class_id, changed_by, enrolled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `enrollment-${student.id}-${termId}`,
        student.id,
        targetClass,
        academicYearId,
        termId,
        moveStatus === 'Lulus' || moveStatus === 'Keluar' || moveStatus === 'Arsip' ? 'archived' : 'active',
        moveStatus,
        student.previousClassId ?? null,
        actorName,
        now,
      );
      if (needsClass && targetClass) {
        await db.runAsync('UPDATE students SET class_id = ? WHERE id = ?', targetClass, student.id);
      } else if (moveStatus === 'Arsip' || moveStatus === 'Lulus' || moveStatus === 'Keluar') {
        await db.runAsync('UPDATE students SET archived_at = ? WHERE id = ?', now, student.id);
      }
      await db.runAsync(
        'INSERT INTO audit_events (id, entity_type, entity_id, action, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        `audit-${student.id}-${termId}-${Date.now()}`,
        'student_enrollment',
        student.id,
        'promote',
        JSON.stringify({ previousClassId: student.previousClassId ?? null }),
        JSON.stringify({
          classId: targetClass,
          academicYearId,
          termId,
          movementStatus: moveStatus,
          changedBy: actorName,
        }),
        `Perpindahan kelas (${moveStatus}) oleh ${actorName}`,
        now,
      );
    }
  });
}

export async function undoLastPromotion(db: SQLiteDatabase, studentId: string, termId: string) {
  const enrollment = await db.getFirstAsync<{ previous_class_id: string | null; class_id: string }>(
    'SELECT previous_class_id, class_id FROM student_enrollments WHERE student_id = ? AND term_id = ? LIMIT 1',
    studentId,
    termId,
  );
  if (!enrollment?.previous_class_id) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE students SET class_id = ?, archived_at = NULL WHERE id = ?',
      enrollment.previous_class_id,
      studentId,
    );
    await db.runAsync(
      "UPDATE student_enrollments SET class_id = ?, status = 'active', movement_status = 'Undo perpindahan' WHERE student_id = ? AND term_id = ?",
      enrollment.previous_class_id,
      studentId,
      termId,
    );
    await recordAuditEvent(
      db,
      'student_enrollment',
      studentId,
      'undo_promote',
      { classId: enrollment.class_id },
      { classId: enrollment.previous_class_id },
      'Membatalkan perpindahan kelas',
    );
  });
  return true;
}

export async function saveAttendanceSession(
  db: SQLiteDatabase,
  teachingSessionId: string,
  records: AttendanceRecordInput[],
  state: 'draft' | 'final' = 'draft',
  reason = state === 'final' ? 'Finalisasi absensi' : 'Simpan draft absensi',
) {
  const now = new Date().toISOString();
  const attendanceSessionId = `attendance-${teachingSessionId}`;
  const existingSession = await db.getFirstAsync<{ state: string }>(
    'SELECT state FROM attendance_sessions WHERE id = ? LIMIT 1',
    attendanceSessionId,
  );
  if (existingSession?.state === 'final' && (!reason.trim() || reason === 'Finalisasi absensi' || reason === 'Simpan draft absensi')) {
    throw new Error('Data absensi sudah final. Masukkan alasan koreksi untuk mengubahnya.');
  }
  await db.withTransactionAsync(async () => {
    const before = await db.getAllAsync<{ student_id: string; status: string; note: string }>(
      'SELECT student_id, status, note FROM attendance_records WHERE attendance_session_id = ? ORDER BY student_id',
      attendanceSessionId,
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO attendance_sessions
       (id, teaching_session_id, state, correction_reason, finalized_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM attendance_sessions WHERE id = ?), ?), ?)`,
      attendanceSessionId,
      teachingSessionId,
      state,
      reason.trim() || null,
      state === 'final' ? now : null,
      attendanceSessionId,
      now,
      now,
    );
    for (const record of records) {
      await db.runAsync(
        `INSERT OR REPLACE INTO attendance_records
         (attendance_session_id, student_id, status, note, updated_at) VALUES (?, ?, ?, ?, ?)`,
        attendanceSessionId,
        record.studentId,
        record.status,
        record.note?.trim() ?? '',
        now,
      );
    }
    await recordAuditEvent(
      db,
      'attendance_session',
      teachingSessionId,
      state === 'final' ? 'finalize_or_correct' : 'save_draft',
      before,
      records,
      reason,
    );
  });
}

export async function recordAuditEvent(
  db: SQLiteDatabase,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
  reason = '',
) {
  await db.runAsync(
    'INSERT INTO audit_events (id, entity_type, entity_id, action, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    `audit-${entityType}-${entityId}-${Date.now()}`,
    entityType,
    entityId,
    action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    reason.trim() || null,
    new Date().toISOString(),
  );
}

export async function loadAuditHistory(db: SQLiteDatabase, limit = 30) {
  return db.getAllAsync<{
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    reason: string | null;
    created_at: string;
  }>(
    'SELECT id, entity_type, entity_id, action, reason, created_at FROM audit_events ORDER BY created_at DESC LIMIT ?',
    limit,
  );
}

export async function loadArchivedStudents(db: SQLiteDatabase, classId = 'class-1a') {
  return db.getAllAsync<ArchivedStudentRow>(
    'SELECT id, name, nis FROM students WHERE class_id = ? AND archived_at IS NOT NULL ORDER BY name',
    classId,
  );
}

export async function restoreStudent(db: SQLiteDatabase, id: string) {
  await db.runAsync('UPDATE students SET archived_at = NULL WHERE id = ?', id);
}

export async function reorderStudent(
  db: SQLiteDatabase,
  classId: string,
  studentId: string,
  direction: 'up' | 'down',
) {
  const rows = await db.getAllAsync<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM students WHERE class_id = ? AND archived_at IS NULL ORDER BY sort_order, name',
    classId,
  );
  const index = rows.findIndex((row) => row.id === studentId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE students SET sort_order = ? WHERE id = ?',
      rows[target].sort_order,
      rows[index].id,
    );
    await db.runAsync(
      'UPDATE students SET sort_order = ? WHERE id = ?',
      rows[index].sort_order,
      rows[target].id,
    );
  });
}

export async function loadSchedules(db: SQLiteDatabase, classId = 'class-1a') {
  return db.getAllAsync<ScheduleRow>(
    'SELECT id, title, weekday, start_time, end_time, repeat_rule, room_id, subject_id FROM schedules WHERE class_id = ? AND archived_at IS NULL ORDER BY weekday, start_time',
    classId,
  );
}

export async function loadScheduleExceptions(db: SQLiteDatabase, classId: string, date: string) {
  return db.getAllAsync<ScheduleExceptionRow>(
    'SELECT id, class_id, schedule_id, exception_date, kind, title, start_time, end_time, note FROM schedule_exceptions WHERE exception_date = ? AND (class_id = ? OR class_id IS NULL) ORDER BY start_time, title',
    date,
    classId,
  );
}

export async function findScheduleConflicts(
  db: SQLiteDatabase,
  candidate: {
    id?: string;
    weekday: number;
    startTime: string;
    endTime: string;
  },
) {
  const rows = await db.getAllAsync<{
    id: string;
    class_name: string;
    title: string;
    start_time: string;
    end_time: string;
  }>(
    `SELECT schedules.id, classes.name AS class_name, schedules.title, schedules.start_time, schedules.end_time
     FROM schedules JOIN classes ON classes.id = schedules.class_id
     WHERE schedules.weekday = ? AND schedules.archived_at IS NULL
       AND schedules.id != COALESCE(?, '')
       AND schedules.start_time < ? AND schedules.end_time > ?
     ORDER BY schedules.start_time`,
    candidate.weekday,
    candidate.id ?? null,
    candidate.endTime,
    candidate.startTime,
  );
  return rows;
}

export async function addScheduleException(
  db: SQLiteDatabase,
  exception: Omit<ScheduleExceptionRow, 'note'> & { note?: string | null },
) {
  await db.runAsync(
    'INSERT INTO schedule_exceptions (id, class_id, schedule_id, exception_date, kind, title, start_time, end_time, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    exception.id,
    exception.class_id,
    exception.schedule_id,
    exception.exception_date,
    exception.kind,
    exception.title.trim(),
    exception.start_time,
    exception.end_time,
    exception.note?.trim() ?? null,
  );
}

export async function removeScheduleException(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM schedule_exceptions WHERE id = ?', id);
}

export async function addSchedule(
  db: SQLiteDatabase,
  schedule: {
    id: string;
    classId: string;
    title: string;
    weekday: number;
    startTime: string;
    endTime: string;
    repeatRule?: string;
    roomId?: string;
    subjectId?: string;
  },
) {
  await db.runAsync(
    'INSERT INTO schedules (id, class_id, title, weekday, start_time, end_time, repeat_rule) VALUES (?, ?, ?, ?, ?, ?, ?)',
    schedule.id,
    schedule.classId,
    schedule.title.trim(),
    schedule.weekday,
    schedule.startTime,
    schedule.endTime,
    schedule.repeatRule ?? 'weekly',
  );
}

export async function updateSchedule(
  db: SQLiteDatabase,
  id: string,
  values: {
    title: string;
    weekday: number;
    startTime: string;
    endTime: string;
    repeatRule?: string;
  },
) {
  await db.runAsync(
    'UPDATE schedules SET title = ?, weekday = ?, start_time = ?, end_time = ?, repeat_rule = ? WHERE id = ?',
    values.title.trim(),
    values.weekday,
    values.startTime,
    values.endTime,
    values.repeatRule ?? 'weekly',
    id,
  );
}

export async function archiveSchedule(db: SQLiteDatabase, id: string) {
  await db.runAsync(
    'UPDATE schedules SET archived_at = ? WHERE id = ?',
    new Date().toISOString(),
    id,
  );
}

export async function copySchedulesToClass(
  db: SQLiteDatabase,
  sourceClassId: string,
  targetClassId: string,
  startDate: string,
  endDate: string,
  selectedScheduleIds?: string[],
) {
  const sourceSchedules = await loadSchedules(db, sourceClassId);
  const filtered = selectedScheduleIds?.length
    ? sourceSchedules.filter((item) => selectedScheduleIds.includes(item.id))
    : sourceSchedules;
  let copiedCount = 0;
  for (const item of filtered) {
    const newId = `schedule-copy-${Date.now()}-${copiedCount}`;
    await addSchedule(db, {
      id: newId,
      classId: targetClassId,
      title: item.title,
      weekday: item.weekday,
      startTime: item.start_time,
      endTime: item.end_time,
      repeatRule: item.repeat_rule ?? 'weekly',
    });
    await createScheduleTemplateAndSessions(db, {
      id: newId,
      classId: targetClassId,
      title: item.title,
      weekday: item.weekday,
      startTime: item.start_time,
      endTime: item.end_time,
      startDate,
      endDate,
      repeatRule: (item.repeat_rule as RepeatRule) ?? 'weekly',
    });
    copiedCount += 1;
  }
  return copiedCount;
}

export async function archiveStudent(db: SQLiteDatabase, studentId: string) {
  await db.runAsync(
    'UPDATE students SET archived_at = ? WHERE id = ?',
    new Date().toISOString(),
    studentId,
  );
}

export async function saveAttendanceDraft(
  db: SQLiteDatabase,
  classId: string,
  date: string,
  students: StudentRow[],
) {
  const updatedAt = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const student of students) {
      await db.runAsync(
        `INSERT INTO attendance_drafts (class_id, attendance_date, student_id, status, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(class_id, attendance_date, student_id)
         DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
        classId,
        date,
        student.id,
        student.status,
        student.note ?? '',
        updatedAt,
      );
    }
  });
}

export async function loadJournal(
  db: SQLiteDatabase,
  classId = 'class-1a',
  date = localDateKey(),
): Promise<JournalRow | null> {
  return db.getFirstAsync<JournalRow>(
    'SELECT id, content, material, objective, activity, method, note, state, updated_at FROM journals WHERE class_id = ? AND journal_date = ?',
    classId,
    date,
  );
}

export async function saveJournal(
  db: SQLiteDatabase,
  classId: string,
  date: string,
  content: string,
  state: 'draft' | 'submitted' = 'submitted',
) {
  await db.runAsync(
    `INSERT INTO journals (id, class_id, journal_date, content, state, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(class_id, journal_date)
     DO UPDATE SET content = excluded.content, state = excluded.state, updated_at = excluded.updated_at`,
    `journal-${classId}-${date}`,
    classId,
    date,
    content.trim(),
    state,
    new Date().toISOString(),
  );
}

export async function loadLessonJournal(db: SQLiteDatabase, teachingSessionId: string) {
  return db.getFirstAsync<{
    id: string;
    teaching_session_id: string;
    material: string;
    objective: string;
    activity: string;
    method: string;
    note: string;
    state: string;
  }>(
    'SELECT id, teaching_session_id, material, objective, activity, method, note, state FROM lesson_journals WHERE teaching_session_id = ?',
    teachingSessionId,
  );
}

export async function saveLessonJournal(
  db: SQLiteDatabase,
  teachingSessionId: string,
  material: string,
  state: 'draft' | 'submitted' = 'submitted',
  details?: {
    objective?: string;
    activity?: string;
    method?: string;
    note?: string;
    correctionReason?: string;
  },
) {
  await db.runAsync(
    `INSERT INTO lesson_journals (id, teaching_session_id, material, objective, activity, method, note, state, correction_reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(teaching_session_id) DO UPDATE SET
       material = excluded.material,
       objective = excluded.objective,
       activity = excluded.activity,
       method = excluded.method,
       note = excluded.note,
       state = excluded.state,
       correction_reason = excluded.correction_reason,
       updated_at = excluded.updated_at`,
    `lesson-journal-${teachingSessionId}`,
    teachingSessionId,
    material.trim(),
    details?.objective?.trim() ?? '',
    details?.activity?.trim() ?? '',
    details?.method?.trim() ?? '',
    details?.note?.trim() ?? '',
    state,
    details?.correctionReason?.trim() || null,
    new Date().toISOString(),
  );
}

export async function loadAgendas(db: SQLiteDatabase, classId = 'class-1a') {
  return db.getAllAsync<AgendaRow>(
    'SELECT id, title, due_date, completed_at, note, class_id, subject, assigned_date, max_score, is_remedial FROM agendas WHERE class_id = ? ORDER BY completed_at IS NOT NULL, due_date, title',
    classId,
  );
}

export async function addAgenda(
  db: SQLiteDatabase,
  classId: string,
  title: string,
  note = '',
  dueDate = localDateKey(),
  extra?: { subject?: string; assignedDate?: string; maxScore?: number; isRemedial?: boolean },
) {
  if (!extra && dueDate === localDateKey()) {
    await db.runAsync(
      'INSERT INTO agendas (id, class_id, title, due_date, note) VALUES (?, ?, ?, ?, ?)',
      `agenda-${Date.now()}`,
      classId,
      title.trim(),
      dueDate,
      note.trim(),
    );
    return;
  }
  await db.runAsync(
    'INSERT INTO agendas (id, class_id, title, due_date, note, subject, assigned_date, max_score, is_remedial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `agenda-${Date.now()}`,
    classId,
    title.trim(),
    dueDate,
    note.trim(),
    extra?.subject ?? null,
    extra?.assignedDate ?? localDateKey(),
    extra?.maxScore ?? 100,
    extra?.isRemedial ? 1 : 0,
  );
}

export async function completeAgenda(db: SQLiteDatabase, id: string, completed: boolean) {
  await db.runAsync(
    'UPDATE agendas SET completed_at = ? WHERE id = ?',
    completed ? new Date().toISOString() : null,
    id,
  );
}

export async function updateAgenda(db: SQLiteDatabase, id: string, title: string, note: string) {
  await db.runAsync(
    'UPDATE agendas SET title = ?, note = ? WHERE id = ?',
    title.trim(),
    note.trim(),
    id,
  );
}

export async function ensureDefaultGradeComponent(
  db: SQLiteDatabase,
  classId = 'class-1a',
  allowDemoData = false,
) {
  if (!allowDemoData) return;
  await db.runAsync(
    `INSERT OR IGNORE INTO grading_components (id, class_id, name, subject, category, max_score, assessment_date)
     VALUES (?, ?, 'Latihan pecahan (Demo)', 'Matematika', 'Tugas', 100, ?)`,
    `component-demo-${classId}`,
    classId,
    localDateKey(),
  );
}

export async function loadGradeComponents(db: SQLiteDatabase, classId = 'class-1a') {
  return db.getAllAsync<GradeComponentRow>(
    'SELECT id, name, session_id, subject, category, max_score, weight, kkm, state, assessment_date FROM grading_components WHERE class_id = ? ORDER BY assessment_date DESC, name',
    classId,
  );
}

export async function addGradeComponent(
  db: SQLiteDatabase,
  component: {
    id: string;
    classId: string;
    name: string;
    subject: string;
    category: string;
    maxScore: number;
    weight: number;
    kkm?: number;
    sessionId?: string | null;
    assessmentDate?: string;
  },
) {
  await db.runAsync(
    'INSERT INTO grading_components (id, class_id, name, subject, category, max_score, weight, kkm, assessment_date, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    component.id,
    component.classId,
    component.name.trim(),
    component.subject.trim(),
    component.category.trim(),
    component.maxScore,
    component.weight,
    component.kkm ?? 75,
    component.assessmentDate ?? localDateKey(),
    component.sessionId ?? null,
  );
}

export async function updateGradeComponent(
  db: SQLiteDatabase,
  id: string,
  component: {
    name: string;
    subject: string;
    category: string;
    maxScore: number;
    weight: number;
    kkm?: number;
    state?: string;
    correctionReason?: string;
  },
) {
  if (component.kkm === undefined && component.state === undefined) {
    await db.runAsync(
      'UPDATE grading_components SET name = ?, subject = ?, category = ?, max_score = ?, weight = ? WHERE id = ?',
      component.name.trim(),
      component.subject.trim(),
      component.category.trim(),
      component.maxScore,
      component.weight,
      id,
    );
    return;
  }
  await db.runAsync(
    'UPDATE grading_components SET name = ?, subject = ?, category = ?, max_score = ?, weight = ?, kkm = ?, state = COALESCE(?, state), correction_reason = COALESCE(?, correction_reason) WHERE id = ?',
    component.name.trim(),
    component.subject.trim(),
    component.category.trim(),
    component.maxScore,
    component.weight,
    component.kkm ?? 75,
    component.state ?? null,
    component.correctionReason ?? null,
    id,
  );
}

export async function deleteGradeComponent(db: SQLiteDatabase, id: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM scores WHERE component_id = ?', id);
    await db.runAsync('DELETE FROM grading_components WHERE id = ?', id);
  });
}

export function calculateWeightedScore(
  values: Array<{ score: number | null; maxScore: number; weight: number | null }>,
) {
  const complete = values.filter((value) => value.score !== null);
  if (!complete.length) return null;
  const weightTotal = complete.reduce((total, value) => total + (value.weight ?? 1), 0);
  return (
    complete.reduce(
      (total, value) => total + ((value.score ?? 0) / value.maxScore) * 100 * (value.weight ?? 1),
      0,
    ) / weightTotal
  );
}

export async function loadScores(db: SQLiteDatabase, componentId = 'component-math-2026-11-06') {
  return db.getAllAsync<ScoreRow>(
    "SELECT student_id, score, COALESCE(note, '') AS note FROM scores WHERE component_id = ?",
    componentId,
  );
}

export async function saveScore(
  db: SQLiteDatabase,
  componentId: string,
  studentId: string,
  score: number,
  note = '',
) {
  await db.runAsync(
    `INSERT INTO scores (component_id, student_id, score, note, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(component_id, student_id) DO UPDATE SET score = excluded.score, note = excluded.note, updated_at = excluded.updated_at`,
    componentId,
    studentId,
    score,
    note.trim(),
    new Date().toISOString(),
  );
}

function checksum(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export const BACKUP_TABLES = [
  'schools',
  'teacher_profiles',
  'academic_years',
  'academic_terms',
  'subjects',
  'student_enrollments',
  'schedule_templates',
  'teaching_sessions',
  'attendance_sessions',
  'attendance_records',
  'assessments',
  'assessment_scores',
  'lesson_journals',
  'tasks',
  'audit_events',
  'migration_issues',
  'sync_metadata',
  'classes',
  'students',
  'schedules',
  'schedule_exceptions',
  'agendas',
  'journals',
  'grading_components',
  'scores',
  'attendance_drafts',
  'reports',
  'backups',
];

export async function createBackupPayload(db: SQLiteDatabase): Promise<BackupPayload> {
  const data: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    data[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`);
  }
  const body = JSON.stringify({ format: 'kelasrapi-backup', schemaVersion: SCHEMA_VERSION, data });
  return {
    format: 'kelasrapi-backup',
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    data,
    integrity: checksum(body),
  };
}

export function validateBackupPayload(payload: unknown): payload is BackupPayload {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<BackupPayload>;
  if (
    value.format !== 'kelasrapi-backup' ||
    !SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(value.schemaVersion as 1 | 2 | 3) ||
    typeof value.createdAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt))
  )
    return false;
  if (!value.data || typeof value.data !== 'object' || typeof value.integrity !== 'string')
    return false;
  if (
    BACKUP_TABLES.some(
      (table) =>
        table !== 'schedule_exceptions' &&
        !Array.isArray((value.data as Record<string, unknown>)[table]),
    )
  )
    return false;
  const body = JSON.stringify({
    format: value.format,
    schemaVersion: value.schemaVersion,
    data: value.data,
  });
  return checksum(body) === value.integrity;
}

export async function restoreBackupPayload(
  db: SQLiteDatabase,
  payload: BackupPayload,
  mode: 'replace' | 'merge' = 'replace',
) {
  if (!validateBackupPayload(payload))
    throw new Error('Backup tidak valid atau versinya tidak didukung.');
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      for (const table of [...BACKUP_TABLES].reverse()) await db.runAsync(`DELETE FROM ${table}`);
    }
    const columns: Record<string, string[]> = {
      schools: ['id', 'name', 'address', 'created_at'],
      teacher_profiles: ['id', 'name', 'school_id', 'default_subject_id', 'created_at', 'updated_at'],
      academic_years: ['id', 'school_id', 'label', 'start_date', 'end_date', 'active'],
      academic_terms: ['id', 'academic_year_id', 'label', 'term_number', 'start_date', 'end_date', 'active'],
      subjects: ['id', 'school_id', 'name', 'code', 'archived_at'],
      student_enrollments: ['id', 'student_id', 'class_id', 'academic_year_id', 'term_id', 'status', 'enrolled_at', 'ended_at'],
      schedule_templates: ['id', 'class_id', 'subject_id', 'teacher_id', 'room_id', 'title', 'weekday', 'start_time', 'end_time', 'start_date', 'end_date', 'repeat_rule', 'archived_at'],
      teaching_sessions: ['id', 'schedule_id', 'class_id', 'subject_id', 'teacher_id', 'room_id', 'session_date', 'start_time', 'end_time', 'title', 'status', 'exception_reason'],
      attendance_sessions: ['id', 'teaching_session_id', 'state', 'finalized_at', 'created_at', 'updated_at'],
      attendance_records: ['attendance_session_id', 'student_id', 'status', 'note', 'updated_at'],
      assessments: ['id', 'teaching_session_id', 'name', 'category', 'max_score', 'weight', 'state', 'created_at', 'updated_at'],
      assessment_scores: ['assessment_id', 'student_id', 'score', 'note', 'updated_at'],
      lesson_journals: ['id', 'teaching_session_id', 'material', 'objective', 'method', 'note', 'state', 'updated_at'],
      tasks: ['id', 'teaching_session_id', 'title', 'assigned_date', 'due_date', 'note', 'state', 'created_at'],
      audit_events: ['id', 'entity_type', 'entity_id', 'action', 'before_json', 'after_json', 'reason', 'created_at'],
      migration_issues: ['id', 'source_table', 'source_id', 'issue', 'details', 'created_at'],
      sync_metadata: ['entity_type', 'entity_id', 'sync_state', 'version', 'last_error', 'updated_at'],
      classes: ['id', 'name', 'group_name', 'archived_at'],
      students: ['id', 'class_id', 'name', 'nis', 'sort_order', 'archived_at'],
      schedules: [
        'id',
        'class_id',
        'title',
        'weekday',
        'start_time',
        'end_time',
        'repeat_rule',
        'archived_at',
      ],
      schedule_exceptions: [
        'id',
        'class_id',
        'schedule_id',
        'exception_date',
        'kind',
        'title',
        'start_time',
        'end_time',
        'note',
      ],
      agendas: ['id', 'class_id', 'title', 'due_date', 'completed_at', 'note'],
      journals: ['id', 'class_id', 'journal_date', 'content', 'state', 'updated_at'],
      grading_components: [
        'id',
        'class_id',
        'name',
        'subject',
        'category',
        'max_score',
        'weight',
        'assessment_date',
        'session_id',
      ],
      scores: ['component_id', 'student_id', 'score', 'note', 'updated_at'],
      attendance_drafts: [
        'class_id',
        'attendance_date',
        'student_id',
        'status',
        'note',
        'updated_at',
      ],
      reports: [
        'id',
        'kind',
        'class_id',
        'period_start',
        'period_end',
        'format',
        'state',
        'file_path',
        'created_at',
      ],
      backups: ['id', 'schema_version', 'file_path', 'integrity_hash', 'created_at'],
    };
    const verb = mode === 'merge' ? 'INSERT OR REPLACE INTO' : 'INSERT INTO';
    for (const table of BACKUP_TABLES) {
      for (const row of payload.data[table] ?? []) {
        const record = row as Record<string, unknown>;
        const fields = columns[table];
        const placeholders = fields.map(() => '?').join(', ');
        await db.runAsync(
          `${verb} ${table} (${fields.join(', ')}) VALUES (${placeholders})`,
          ...fields.map(
            (field) =>
              (record[field] ??
                ((table === 'students' && field === 'sort_order') ||
                (table === 'attendance_drafts' && field === 'note')
                  ? table === 'students'
                    ? 0
                    : ''
                  : null)) as SQLiteBindValue,
          ),
        );
      }
    }
  });
}
