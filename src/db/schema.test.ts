import {
  BACKUP_TABLES,
  calculateWeightedScore,
  createBackupPayload,
  initializeDatabase,
  addStudent,
  updateClass,
  archiveClass,
  reorderStudent,
  saveAttendanceDraft,
  addAgenda,
  completeAgenda,
  updateAgenda,
  saveJournal,
  loadAgendas,
  restoreBackupPayload,
  validateBackupPayload,
  localDateKey,
} from './schema';

class FakeDatabase {
  constructor(
    public rows: Record<string, Record<string, unknown>[]>,
    private readonly failOnInsertTable?: string,
  ) {}

  async getAllAsync<T>(sql: string): Promise<T[]> {
    const table = sql.match(/FROM (\w+)/i)?.[1];
    return (table ? (this.rows[table] ?? []) : []) as T[];
  }

  async runAsync(sql: string, ...values: unknown[]) {
    const deleteTable = sql.match(/^DELETE FROM (\w+)/i)?.[1];
    if (deleteTable) {
      this.rows[deleteTable] = [];
      return;
    }
    const insert = sql.match(/^INSERT INTO (\w+) \(([^)]+)\)/i);
    if (!insert) return;
    const table = insert[1];
    if (table === this.failOnInsertTable) throw new Error(`simulated ${table} write failure`);
    const fields = insert[2].split(',').map((field) => field.trim());
    this.rows[table] ??= [];
    this.rows[table].push(
      Object.fromEntries(fields.map((field, index) => [field, values[index] ?? null])),
    );
  }

  async withTransactionAsync(callback: () => Promise<void>) {
    const snapshot = structuredClone(this.rows);
    try {
      await callback();
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  }
}

describe('backup validation', () => {
  it('rejects unsupported or tampered payloads without touching the database', () => {
    expect(validateBackupPayload(null)).toBe(false);
    expect(
      validateBackupPayload({
        format: 'kelasrapi-backup',
        schemaVersion: 999,
        createdAt: '2026-11-06T00:00:00.000Z',
        data: {},
        integrity: 'invalid',
      }),
    ).toBe(false);
    expect(
      validateBackupPayload({
        format: 'kelasrapi-backup',
        schemaVersion: 1,
        createdAt: '2026-11-06T00:00:00.000Z',
        data: {},
        integrity: 'invalid',
      }),
    ).toBe(false);
  });

  it('calculates weighted scores transparently from component values', () => {
    expect(
      calculateWeightedScore([
        { score: 80, maxScore: 100, weight: 1 },
        { score: 50, maxScore: 50, weight: 2 },
      ]),
    ).toBeCloseTo(93.33, 1);
    expect(calculateWeightedScore([{ score: null, maxScore: 100, weight: 1 }])).toBeNull();
  });

  it('round-trips every backup table and preserves Indonesian text', async () => {
    const sourceRows: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, []]),
    );
    sourceRows.classes = [
      { id: 'class-1', name: 'Kelas Bahasa & Seni', group_name: 'Seni', archived_at: null },
    ];
    sourceRows.students = [
      {
        id: 'student-1',
        class_id: 'class-1',
        name: 'Siti Nur Aisyah é',
        nis: '10001',
        sort_order: 3,
        archived_at: null,
      },
    ];
    sourceRows.schedules = [
      {
        id: 'schedule-1',
        class_id: 'class-1',
        title: 'Bahasa Indonesia',
        weekday: 1,
        start_time: '07:00',
        end_time: '08:30',
        repeat_rule: 'weekly',
        archived_at: null,
      },
    ];
    sourceRows.agendas = [
      {
        id: 'agenda-1',
        class_id: 'class-1',
        title: 'Kirim materi “cerita rakyat”',
        due_date: '2026-11-06',
        completed_at: null,
        note: 'Tautan dikirim ke wali kelas',
      },
    ];
    sourceRows.journals = [
      {
        id: 'journal-1',
        class_id: 'class-1',
        journal_date: '2026-11-06',
        content: 'Siswa berdiskusi tentang budaya Nusantara.',
        state: 'submitted',
        updated_at: '2026-11-06T00:00:00.000Z',
      },
    ];
    sourceRows.grading_components = [
      {
        id: 'component-1',
        class_id: 'class-1',
        name: 'Proyek akhir',
        subject: 'Seni',
        category: 'Proyek',
        max_score: 100,
        weight: 2,
        assessment_date: '2026-11-06',
        session_id: null,
      },
    ];
    sourceRows.scores = [
      {
        component_id: 'component-1',
        student_id: 'student-1',
        score: 92,
        note: 'Sangat baik',
        updated_at: '2026-11-06T00:00:00.000Z',
      },
    ];
    sourceRows.attendance_drafts = [
      {
        class_id: 'class-1',
        attendance_date: '2026-11-06',
        student_id: 'student-1',
        status: 'Hadir',
        note: '',
        updated_at: '2026-11-06T00:00:00.000Z',
      },
    ];
    sourceRows.reports = [
      {
        id: 'report-1',
        kind: 'attendance',
        class_id: 'class-1',
        period_start: '2026-11-01',
        period_end: '2026-11-30',
        format: 'xlsx',
        state: 'exported',
        file_path: '/data/report.xlsx',
        created_at: '2026-11-06T00:00:00.000Z',
      },
    ];
    sourceRows.backups = [
      {
        id: 'backup-1',
        schema_version: 1,
        file_path: '/data/backup.json',
        integrity_hash: 'deadbeef',
        created_at: '2026-11-06T00:00:00.000Z',
      },
    ];

    const payload = await createBackupPayload(new FakeDatabase(sourceRows) as never);
    const destination = new FakeDatabase(
      Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
    );
    await restoreBackupPayload(destination as never, payload);

    expect(destination.rows).toEqual(sourceRows);
  });

  it('rolls back a restore when a table write fails mid-transaction', async () => {
    const sourceRows: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, []]),
    );
    sourceRows.classes = [
      { id: 'new-class', name: 'Kelas Baru', group_name: null, archived_at: null },
    ];
    sourceRows.students = [
      {
        id: 'new-student',
        class_id: 'new-class',
        name: 'Siswa Baru',
        sort_order: 0,
        archived_at: null,
      },
    ];
    const payload = await createBackupPayload(new FakeDatabase(sourceRows) as never);
    const original: Record<string, Record<string, unknown>[]> = Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, []]),
    );
    original.classes = [{ id: 'old-class', name: 'Kelas Lama' }];
    const expected = structuredClone(original);
    const destination = new FakeDatabase(structuredClone(original), 'students');

    await expect(restoreBackupPayload(destination as never, payload)).rejects.toThrow(
      'simulated students write failure',
    );
    expect(destination.rows).toEqual(expected);
  });

  it('rejects duplicate active student names before writing', async () => {
    const duplicateDb = {
      getFirstAsync: async () => ({ id: 'existing-student' }),
      runAsync: jest.fn(),
    };
    await expect(
      addStudent(duplicateDb as never, 'class-1', 'student-2', ' SITI NUR AISYAH '),
    ).rejects.toThrow('sudah ada');
    expect(duplicateDb.runAsync).not.toHaveBeenCalled();
  });

  it('keeps class updates and archive writes scoped to the requested record', async () => {
    const db = { runAsync: jest.fn() };
    await updateClass(db as never, 'class-2', '  Kelas 2  ', '  Pagi  ');
    await archiveClass(db as never, 'class-2');
    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      'UPDATE classes SET name = ?, group_name = ? WHERE id = ?',
      'Kelas 2',
      'Pagi',
      'class-2',
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      2,
      'UPDATE classes SET archived_at = ? WHERE id = ?',
      expect.any(String),
      'class-2',
    );
  });

  it('uses one transaction for reorder and attendance writes, with no-op reorder protection', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([
        { id: 'a', sort_order: 0 },
        { id: 'b', sort_order: 1 },
      ]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await reorderStudent(db as never, 'class-1', 'a', 'down');
    expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledTimes(2);

    const noOpDb = {
      getAllAsync: jest.fn().mockResolvedValue([{ id: 'a', sort_order: 0 }]),
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(),
    };
    await reorderStudent(noOpDb as never, 'class-1', 'a', 'down');
    expect(noOpDb.withTransactionAsync).not.toHaveBeenCalled();
    expect(noOpDb.runAsync).not.toHaveBeenCalled();

    const attendanceDb = {
      runAsync: jest.fn(),
      withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => callback()),
    };
    await saveAttendanceDraft(attendanceDb as never, 'class-1', '2026-11-06', [
      { id: 'a', name: 'A', status: 'Hadir', note: '' },
    ]);
    expect(attendanceDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    expect(attendanceDb.runAsync).toHaveBeenCalledTimes(1);
  });

  it('covers empty agenda state, validation trimming, completion, and journal recovery writes', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn(),
    };
    await expect(loadAgendas(db as never, 'class-empty')).resolves.toEqual([]);
    await addAgenda(db as never, 'class-empty', '  Kumpulkan jurnal  ', '  cek lampiran  ');
    await updateAgenda(db as never, 'agenda-1', '  Revisi jurnal  ', '  sudah diperiksa  ');
    await completeAgenda(db as never, 'agenda-1', true);
    expect(db.runAsync).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO agendas (id, class_id, title, due_date, note) VALUES (?, ?, ?, ?, ?)',
      expect.stringMatching(/^agenda-/),
      'class-empty',
      'Kumpulkan jurnal',
      localDateKey(),
      'cek lampiran',
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      2,
      'UPDATE agendas SET title = ?, note = ? WHERE id = ?',
      'Revisi jurnal',
      'sudah diperiksa',
      'agenda-1',
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      3,
      'UPDATE agendas SET completed_at = ? WHERE id = ?',
      expect.any(String),
      'agenda-1',
    );

    await saveJournal(db as never, 'class-empty', '2026-11-06', 'Draft awal', 'draft');
    await saveJournal(db as never, 'class-empty', '2026-11-06', 'Final', 'submitted');
    expect(db.runAsync).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('ON CONFLICT(class_id, journal_date)'),
      'journal-class-empty-2026-11-06',
      'class-empty',
      '2026-11-06',
      'Draft awal',
      'draft',
      expect.any(String),
    );
    expect(db.runAsync).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('ON CONFLICT(class_id, journal_date)'),
      'journal-class-empty-2026-11-06',
      'class-empty',
      '2026-11-06',
      'Final',
      'submitted',
      expect.any(String),
    );
  });

  it('declares the complete local schema through idempotent initialization', async () => {
    const migrations: string[] = [];
    const db = {
      execAsync: async (sql: string) => migrations.push(sql),
      runAsync: jest.fn(),
      getFirstAsync: async () => ({ count: 1 }),
    };
    await initializeDatabase(db as never);
    const createSql = migrations[0];
    for (const table of [
      'classes',
      'students',
      'schedules',
      'agendas',
      'journals',
      'grading_components',
      'scores',
      'attendance_drafts',
      'reports',
      'backups',
    ]) {
      expect(createSql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(createSql).toContain('group_name TEXT');
    expect(createSql).toContain("note TEXT NOT NULL DEFAULT ''");
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('schema_migrations'),
      2,
      expect.any(String),
    );
  });
});
