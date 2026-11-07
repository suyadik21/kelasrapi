/* global process, console */
import { writeFile } from 'node:fs/promises';

const studentCount = Number(process.argv[2] ?? 500);
const output = process.argv[3] ?? 'fixtures/backup-large-class.json';
const createdAt = '2026-11-06T08:00:00.000Z';
const data = {
  classes: [
    {
      id: 'class-large',
      name: `Kelas Besar ${studentCount}`,
      group_name: 'Benchmark',
      archived_at: null,
    },
  ],
  students: Array.from({ length: studentCount }, (_, index) => ({
    id: `student-large-${String(index + 1).padStart(4, '0')}`,
    class_id: 'class-large',
    name: `Siswa Benchmark ${String(index + 1).padStart(4, '0')}`,
    sort_order: index,
    archived_at: null,
  })),
  schedules: [],
  schedule_exceptions: [],
  agendas: [],
  journals: [],
  grading_components: [
    {
      id: 'component-large-math',
      class_id: 'class-large',
      name: 'Matematika',
      subject: 'Matematika',
      category: 'Tugas',
      max_score: 100,
      weight: 100,
      assessment_date: '2026-11-06',
    },
  ],
  scores: [
    {
      component_id: 'component-large-math',
      student_id: 'student-large-0001',
      score: 88,
      note: 'Nilai recovery',
      updated_at: createdAt,
    },
  ],
  attendance_drafts: [
    {
      class_id: 'class-large',
      attendance_date: '2026-11-06',
      student_id: 'student-large-0001',
      status: 'Sakit',
      note: 'Catatan recovery',
      updated_at: createdAt,
    },
  ],
  reports: [],
  backups: [],
};

function checksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const body = JSON.stringify({ format: 'kelasrapi-backup', schemaVersion: 1, data });
const payload = {
  format: 'kelasrapi-backup',
  schemaVersion: 1,
  createdAt,
  data,
  integrity: checksum(body),
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Generated ${output} with ${studentCount} students`);
