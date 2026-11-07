/* global console, process */
import { writeFile } from 'node:fs/promises';

const output = process.argv[2] ?? 'fixtures/backup-two-classes.json';
const createdAt = '2026-11-06T08:00:00.000Z';
const data = {
  classes: [
    { id: 'class-a', name: 'Kelas A', group_name: 'Pagi', archived_at: null },
    { id: 'class-b', name: 'Kelas B', group_name: 'Pagi', archived_at: null },
  ],
  students: [
    {
      id: 'student-a-1',
      class_id: 'class-a',
      name: 'Alya Putri',
      sort_order: 0,
      archived_at: null,
    },
    {
      id: 'student-a-2',
      class_id: 'class-a',
      name: 'Bagas Pratama',
      sort_order: 1,
      archived_at: null,
    },
    {
      id: 'student-b-1',
      class_id: 'class-b',
      name: 'Citra Lestari',
      sort_order: 0,
      archived_at: null,
    },
    {
      id: 'student-b-2',
      class_id: 'class-b',
      name: 'Dimas Saputra',
      sort_order: 1,
      archived_at: null,
    },
  ],
  schedules: [
    {
      id: 'schedule-a',
      class_id: 'class-a',
      title: 'Matematika',
      weekday: 4,
      start_time: '08:00',
      end_time: '09:30',
      repeat_rule: 'weekly',
      archived_at: null,
    },
    {
      id: 'schedule-b',
      class_id: 'class-b',
      title: 'Bahasa Indonesia',
      weekday: 4,
      start_time: '10:00',
      end_time: '11:30',
      repeat_rule: 'weekly',
      archived_at: null,
    },
  ],
  schedule_exceptions: [],
  agendas: [],
  journals: [],
  grading_components: [],
  scores: [],
  attendance_drafts: [],
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
console.log(`Generated ${output} with two classes and two schedules`);
