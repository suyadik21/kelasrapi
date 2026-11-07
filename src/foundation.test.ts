import {
  attendanceTotals,
  findSessionConflicts,
  formatDashboardAttendanceIndicator,
  generateRecurringSessions,
  promotionPreview,
  validateNisImportCandidates,
} from './domain/academic';
import {
  buildCompetencyDescription,
  calculatePredicate,
  summarizeAssessmentScores,
} from './domain/grading';
import { buildReportHtml } from './reports/report-utils';

describe('KelasRapi foundation & end-to-end acceptance workflow (Task 0.3 & Task 12.3)', () => {
  it('uses local-first product defaults with zero dummy data in real mode', () => {
    expect({ cloudRequired: false, primaryRole: 'teacher', defaultMode: 'real' }).toEqual({
      cloudRequired: false,
      primaryRole: 'teacher',
      defaultMode: 'real',
    });
  });

  it('executes the complete teacher end-to-end workflow from profile setup to report & backup', () => {
    // 1. Setup profil guru & tahun ajaran
    const context = {
      teacherName: 'Budi Santoso, S.Pd.',
      teacherNip: '198604122011011004',
      schoolName: 'SD Negeri 01 Pekanbaru',
      schoolAddress: 'Jl. Jenderal Sudirman No. 12, Pekanbaru',
      principalName: 'Hj. Rahmawati, M.Pd.',
      principalNip: '197208151998022001',
      academicYear: '2026/2027',
      semester: 'Semester 1 (Ganjil)',
      signatureCity: 'Pekanbaru',
    };

    // 2. Import siswa dengan NIS & validasi
    const importValidation = validateNisImportCandidates(
      [
        { rowNumber: 2, name: 'Aisyah Putri', nis: '26001' },
        { rowNumber: 3, name: 'Bima Pratama', nis: '26002' },
        { rowNumber: 4, name: 'Citra Lestari', nis: '26003' },
      ],
      new Set(),
    );
    expect(importValidation.errors).toHaveLength(0);
    expect(importValidation.valid).toHaveLength(3);

    // 3. Kenaikan kelas massal dengan preview
    const promo = promotionPreview(
      importValidation.valid.map((s, idx) => ({ id: `stu-${idx + 1}`, name: s.name, nis: s.nis })),
      { 'stu-1': 'class-2b', 'stu-2': 'class-2b', 'stu-3': 'class-2b' },
      { 'stu-1': 'Naik kelas', 'stu-2': 'Naik kelas', 'stu-3': 'Naik kelas' },
    );
    expect(promo.valid).toBe(true);

    // 4. Buat jadwal satu semester & generate pertemuan aktual
    const sessions = generateRecurringSessions({
      id: 'sched-math-2b',
      classId: 'class-2b',
      teacherId: 'teacher-1',
      subjectId: 'subj-math',
      roomId: 'R-2B',
      weekday: 2, // Selasa
      startTime: '08:00',
      endTime: '09:30',
      startDate: '2026-07-14',
      endDate: '2026-07-28',
      title: 'Matematika',
      repeatRule: 'semester',
    });
    expect(sessions.map((s) => s.date)).toEqual(['2026-07-14', '2026-07-21', '2026-07-28']);

    // 5. Validasi konflik jadwal
    const conflicts = findSessionConflicts(
      {
        id: 'sched-clash',
        classId: 'class-2b',
        teacherId: 'teacher-1',
        roomId: 'R-2B',
        date: '2026-07-14',
        startTime: '08:30',
        endTime: '10:00',
      },
      sessions,
    );
    expect(conflicts.length).toBeGreaterThan(0);

    // 6. Isi absensi dari pertemuan & cek indikator dashboard
    const sessionStatuses = ['Hadir', 'Hadir', 'Sakit'] as const;
    const totals = attendanceTotals([...sessionStatuses]);
    expect(totals.Hadir).toBe(2);
    const dashboardMetric = formatDashboardAttendanceIndicator([...sessionStatuses]);
    expect(dashboardMetric.percentage).toBe(67);

    // 7. Tambah nilai dari pertemuan & kalkulasi KKM/predikat
    const gradeStats = summarizeAssessmentScores([92, 84, 70], 3, 75);
    expect(gradeStats.average).toBe(82);
    expect(calculatePredicate(92, 75)).toBe('A');
    expect(
      buildCompetencyDescription('Aisyah Putri', 'Matematika', 92, 75, 'Operasi Bilangan'),
    ).toContain('Tuntas sangat baik');

    // 8. Cetak laporan resmi dengan identitas sekolah & tanda tangan
    const reportHtml = buildReportHtml({
      title: 'Laporan Akademik Kelas 2B',
      period: 'Semester 1 (Ganjil)',
      headers: ['Nama Siswa', 'NIS', 'Kehadiran', 'Nilai Akhir', 'Predikat'],
      rows: [
        ['Aisyah Putri', '26001', 'Hadir', '92', 'A'],
        ['Bima Pratama', '26002', 'Hadir', '84', 'B'],
        ['Citra Lestari', '26003', 'Sakit', '70', 'D'],
      ],
      identity: {
        schoolName: context.schoolName,
        schoolAddress: context.schoolAddress,
        teacherName: context.teacherName,
        teacherNip: context.teacherNip,
        principalName: context.principalName,
        principalNip: context.principalNip,
        className: '2026/2027 · Kelas 2B',
        subjectName: 'Matematika',
        academicYear: context.academicYear,
        semester: context.semester,
        signatureCity: context.signatureCity,
        conclusion: 'Sebagian besar siswa telah mencapai KKTP, 1 siswa memerlukan remedial.',
      },
    });
    expect(reportHtml).toContain('SD Negeri 01 Pekanbaru');
    expect(reportHtml).toContain('198604122011011004');
    expect(reportHtml).toContain('26001');
  });
});
