import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import {
  buildAttendanceAccumulationHtml,
  buildReportHtml,
  createReportWorkbook,
} from './src/reports/report-utils';
import { assertLocalFileUri } from './src/config/mode';
import { getNationalHoliday, WORKDAY_OVERRIDE_TITLE } from './src/calendar/national-holidays';
import { ATTENDANCE_STATUSES } from './src/domain/attendance';
import { missingScoreIds, validateScore } from './src/domain/grading';
import {
  applyScheduleExceptions,
  filterSchedulesForDay,
  isScheduleRangeValid,
  selectDashboardSchedule,
} from './src/domain/workflow';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  addAgenda,
  addClass,
  addGradeComponent,
  deleteGradeComponent,
  calculateWeightedScore,
  archiveClass,
  addSchedule,
  createScheduleTemplateAndSessions,
  addScheduleException,
  archiveSchedule,
  addStudent,
  promoteStudentsBulk,
  initializeDatabase,
  loadClasses,
  loadArchivedStudents,
  loadGradeComponents,
  loadScores,
  loadJournal,
  loadLessonJournal,
  loadAgendas,
  loadAttendanceRecap,
  loadAttendanceAlerts,
  loadAttendanceAccumulation,
  loadAttendanceStudentRecap,
  recordAuditEvent,
  type AttendancePeriod,
  loadSchedules,
  loadScheduleExceptions,
  loadTeachingSessions,
  loadActiveAcademicContext,
  loadStudents,
  createBackupPayload,
  findScheduleConflicts,
  restoreBackupPayload,
  validateBackupPayload,
  saveAttendanceDraft,
  saveAttendanceSession,
  saveAcademicContext,
  completeAgenda,
  saveJournal,
  saveLessonJournal,
  saveScore,
  reorderStudent,
  restoreStudent,
  updateAgenda,
  updateClass,
  updateGradeComponent,
  updateSchedule,
  localDateKey,
  removeScheduleException,
} from './src/db/schema';

type Tab = 'Beranda' | 'Absensi' | 'Kelas' | 'Jadwal' | 'Laporan' | 'Jurnal' | 'Nilai' | 'Pengaturan';
type AttendanceStatus = 'Belum diisi' | 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' | 'Terlambat';
type Student = { id: string; name: string; nis?: string | null; status: AttendanceStatus; note: string };
const STUDENT_PAGE_SIZE = 50;

function localLongDate(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function shiftDate(dateKey: string, offset: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

function localWeekday(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

type UiPalette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSoft: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  warningSurface: string;
  warningText: string;
  onAccent: string;
};

const lightPalette: UiPalette = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSoft: '#E9EFF8',
  text: '#1E293B',
  muted: '#475569',
  border: '#E2E8F0',
  primary: '#2563EB',
  primarySoft: '#DBEAFE',
  accent: '#EA580C',
  accentSoft: '#FFEDD5',
  warningSurface: '#FFF3DB',
  warningText: '#8D5B12',
  onAccent: '#FFFFFF',
};

const darkPalette: UiPalette = {
  background: '#0F172A',
  surface: '#111C33',
  surfaceRaised: '#192134',
  surfaceSoft: '#202D47',
  text: '#F8FAFC',
  muted: '#CBD5E1',
  border: '#334155',
  primary: '#60A5FA',
  primarySoft: '#1E3A8A',
  accent: '#FB923C',
  accentSoft: '#431407',
  warningSurface: '#493A20',
  warningText: '#FFD38A',
  onAccent: '#0F172A',
};

let activePalette = lightPalette;

const initialStudents: Student[] = [
  { id: '1', name: 'Aisyah Putri', status: 'Belum diisi', note: '' },
  { id: '2', name: 'Bima Pratama', status: 'Belum diisi', note: '' },
  { id: '3', name: 'Citra Lestari', status: 'Belum diisi', note: '' },
  { id: '4', name: 'Daffa Ramadhan', status: 'Belum diisi', note: '' },
];
const statusOptions: AttendanceStatus[] = [...ATTENDANCE_STATUSES];

export default function App() {
  return (
    <SQLiteProvider databaseName="kelasrapi.db" onInit={initializeDatabase}>
      <KelasRapiApp />
    </SQLiteProvider>
  );
}

function KelasRapiApp() {
  const db = useSQLiteContext();
  const colorScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const [, refreshTheme] = useState(0);
  const isDark = colorScheme === 'dark';
  activePalette = isDark ? darkPalette : lightPalette;
  const isLandscape = width > height;
  layoutWidth = width;
  layoutLandscape = isLandscape;
  const today = localDateKey();
  const [activeTab, setActiveTab] = useState<Tab>('Beranda');
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [students, setStudents] = useState(initialStudents);
  const [classes, setClasses] = useState<Awaited<ReturnType<typeof loadClasses>>>([]);
  const [academicContext, setAcademicContext] = useState<Awaited<ReturnType<typeof loadActiveAcademicContext>>>(null);
  const [contextEditorVisible, setContextEditorVisible] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('class-1a');
  const [saved, setSaved] = useState(false);
  const [undoStudents, setUndoStudents] = useState<Student[] | null>(null);
  const [journalDirty, setJournalDirty] = useState(false);
  const journalSaveRef = useRef<(() => Promise<void>) | null>(null);
  const studentsLoadedForRef = useRef('');
  useEffect(() => {
    styles = createStyles(activePalette);
    refreshTheme((value) => value + 1);
  }, [isDark, isLandscape, width]);
  const navigate = (nextTab: Tab) => {
    if (activeTab === 'Jurnal' && journalDirty && nextTab !== 'Jurnal') {
      Alert.alert(
        'Jurnal belum selesai',
        'Simpan sebagai draft, buang perubahan, atau tetap di halaman ini?',
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Buang',
            style: 'destructive',
            onPress: () => {
              setJournalDirty(false);
              setActiveTab(nextTab);
            },
          },
          {
            text: 'Simpan draft',
            onPress: async () => {
              await journalSaveRef.current?.();
              setJournalDirty(false);
              setActiveTab(nextTab);
            },
          },
        ],
      );
      return;
    }
    setActiveTab(nextTab);
  };
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab !== 'Beranda') {
        setActiveTab('Beranda');
      }
      return true;
    });
    return () => subscription.remove();
  }, [activeTab]);
  useEffect(() => {
    loadActiveAcademicContext(db).then(setAcademicContext).catch(() => setAcademicContext(null));
  }, [db]);
  useEffect(() => {
    loadClasses(db)
      .then((rows) => {
        setClasses(rows);
        if (rows.length && !rows.some((row) => row.id === selectedClassId))
          setSelectedClassId(rows[0].id);
      })
      .catch(() => setClasses([]));
  }, [db, selectedClassId]);
  useEffect(() => {
    const loadKey = `${selectedClassId}:${attendanceDate}`;
    studentsLoadedForRef.current = '';
    loadStudents(db, selectedClassId, attendanceDate)
      .then((rows) =>
        setStudents(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            nis: row.nis ?? null,
            status: row.status as AttendanceStatus,
            note: row.note ?? '',
          })),
        ),
      )
      .then(() => {
        studentsLoadedForRef.current = loadKey;
      })
      .catch(() => setStudents(initialStudents));
  }, [attendanceDate, db, selectedClassId]);
  useEffect(() => {
    const loadKey = `${selectedClassId}:${attendanceDate}`;
    if (!students.length || studentsLoadedForRef.current !== loadKey) return;
    const timer = setTimeout(() => {
      saveAttendanceDraft(db, selectedClassId, attendanceDate, students).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [attendanceDate, db, selectedClassId, students]);
  const presentCount = useMemo(
    () => students.filter((student) => student.status === 'Hadir').length,
    [students],
  );
  const attendanceSummary = useMemo(() => {
    const recorded = students.filter((student) => student.status !== 'Belum diisi');
    if (!recorded.length) return null;
    const onTimeOrLate = recorded.filter(
      (student) => student.status === 'Hadir' || student.status === 'Terlambat',
    ).length;
    return Math.round((onTimeOrLate / recorded.length) * 100);
  }, [students]);
  const updateStatus = (id: string, status: AttendanceStatus) => {
    setSaved(false);
    setUndoStudents(null);
    setStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, status } : student)),
    );
  };
  const markAllPresent = () => {
    setSaved(false);
    setUndoStudents(students);
    setStudents((current) => current.map((student) => ({ ...student, status: 'Hadir' })));
  };
  const bulkUpdateStatus = (status: AttendanceStatus) => {
    setSaved(false);
    setUndoStudents(students);
    setStudents((current) => current.map((student) => ({ ...student, status })));
  };
  const undoLastBulkChange = () => {
    if (!undoStudents) return;
    setStudents(undoStudents);
    setUndoStudents(null);
    setSaved(false);
  };
  const updateNote = (id: string, note: string) => {
    setSaved(false);
    setStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, note } : student)),
    );
  };
  const refreshStudents = () => {
    studentsLoadedForRef.current = '';
    loadStudents(db, selectedClassId, attendanceDate).then((rows) => {
      setStudents(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          nis: row.nis ?? null,
          status: row.status as AttendanceStatus,
          note: row.note ?? '',
        })),
      );
      studentsLoadedForRef.current = `${selectedClassId}:${attendanceDate}`;
    });
  };
  const refreshAllData = async () => {
    const rows = await loadClasses(db);
    setClasses(rows);
    const nextClassId = rows.some((item) => item.id === selectedClassId)
      ? selectedClassId
      : rows[0]?.id;
    if (!nextClassId) {
      setSelectedClassId('');
      setStudents([]);
      return;
    }
    setSelectedClassId(nextClassId);
    const studentRows = await loadStudents(db, nextClassId, attendanceDate);
    setStudents(
      studentRows.map((row) => ({
        id: row.id,
        name: row.name,
        nis: row.nis ?? null,
        status: row.status as AttendanceStatus,
        note: row.note ?? '',
      })),
    );
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={isDark ? [darkPalette.background, '#111C33'] : [lightPalette.background, '#EEF5FF']}
        style={styles.appShell}
      >
        {activeTab === 'Beranda' && (
          <Dashboard
            db={db}
            classes={classes}
            classId={selectedClassId}
            onSelectClass={setSelectedClassId}
            onOpenAttendance={() => navigate('Absensi')}
            onOpenJournal={() => navigate('Jurnal')}
            onOpenGrades={() => navigate('Nilai')}
            onOpenReport={() => navigate('Laporan')}
            className={classes.find((item) => item.id === selectedClassId)?.name ?? 'Belum ada kelas'}
            studentCount={students.length}
            missingNisCount={students.filter((student) => !student.nis?.trim()).length}
            attendanceRate={attendanceSummary}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            onOpenSettings={() => navigate('Pengaturan')}
            onChangeAcademicContext={() => {
              Alert.alert('Ganti semester / tahun ajaran?', 'Histori periode lama tetap tersimpan dan dapat dibaca dari backup.', [
                { text: 'Batal', style: 'cancel' },
                { text: 'Lanjutkan', onPress: () => setContextEditorVisible(true) },
              ]);
            }}
          />
        )}
        {activeTab === 'Absensi' && (
          <AttendanceScreen
            db={db}
            classes={classes}
            classId={selectedClassId}
            onSelectClass={setSelectedClassId}
            className={classes.find((item) => item.id === selectedClassId)?.name ?? 'Kelas'}
            attendanceDate={attendanceDate}
            onAttendanceDateChange={setAttendanceDate}
            students={students}
            saved={saved}
            presentCount={presentCount}
            onMarkAllPresent={markAllPresent}
            onBulkUpdateStatus={bulkUpdateStatus}
            onUndoBulkChange={undoLastBulkChange}
            canUndoBulk={Boolean(undoStudents && !saved)}
            onUpdateStatus={updateStatus}
            onUpdateNote={updateNote}
            onSave={() => {
              Promise.all([
                saveAttendanceDraft(db, selectedClassId, attendanceDate, students),
                loadTeachingSessions(db, attendanceDate, selectedClassId).then((sessions) =>
                  sessions[0]
                    ? saveAttendanceSession(
                        db,
                        sessions[0].id,
                        students.map((student) => ({
                          studentId: student.id,
                          status: student.status,
                          note: student.note,
                        })),
                        'draft',
                      ).then(async () => {
                        if (attendanceDate < localDateKey()) {
                          await recordAuditEvent(
                            db,
                            'attendance_session',
                            sessions[0].id,
                            'backfill_save',
                            null,
                            { attendanceDate, studentCount: students.length },
                            'Absensi tanggal lampau diisi setelah hari berjalan',
                          );
                        }
                      })
                    : null,
                ),
              ])
                .then(() => setSaved(true))
                .catch(() => setSaved(false));
            }}
            onFinalize={() => {
              Alert.alert('Finalisasi absensi?', 'Setelah final, koreksi harus diberi alasan.', [
                { text: 'Batal', style: 'cancel' },
                {
                  text: 'Finalisasi',
                  onPress: () => {
                    void loadTeachingSessions(db, attendanceDate, selectedClassId)
                      .then((sessions) =>
                        sessions[0]
                          ? saveAttendanceSession(
                              db,
                              sessions[0].id,
                              students.map((student) => ({
                                studentId: student.id,
                                status: student.status,
                                note: student.note,
                              })),
                              'final',
                            )
                          : saveAttendanceDraft(db, selectedClassId, attendanceDate, students),
                      )
                      .then(() => setSaved(true))
                      .catch(() => setSaved(false));
                  },
                },
              ]);
            }}
          />
        )}
        {activeTab === 'Kelas' && (
          <ClassScreen
            db={db}
            classes={classes}
            selectedClassId={selectedClassId}
            onSelectClass={(id) => setSelectedClassId(id)}
            onClassesChanged={async () => setClasses(await loadClasses(db))}
            students={students}
            onAddStudent={async (name, nis) => {
              await addStudent(db, selectedClassId, `student-${Date.now()}`, name, nis);
              refreshStudents();
            }}
            onUpdateStudent={async (id, name, nis) => {
              await db.runAsync(
                'UPDATE students SET name = ?, nis = ? WHERE id = ?',
                name.trim(),
                nis.trim() || null,
                id,
              );
              refreshStudents();
            }}
            onArchiveStudent={async (id) => {
              await db.runAsync(
                'UPDATE students SET archived_at = ? WHERE id = ?',
                new Date().toISOString(),
                id,
              );
              refreshStudents();
            }}
            onReorderStudent={async (id, direction) => {
              await reorderStudent(db, selectedClassId, id, direction);
              refreshStudents();
            }}
            onRestoreStudent={async (id) => {
              await restoreStudent(db, id);
              refreshStudents();
            }}
            onDownloadTemplate={async () => {
              const sheet = XLSX.utils.json_to_sheet([{ Nama: 'Contoh Nama Siswa', NIS: '26001' }]);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, sheet, 'Siswa');
              const file = new File(Paths.document, 'kelasrapi-template-siswa.xlsx');
              await file.write(XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }), {
                encoding: 'base64',
              });
              if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
            }}
            onImportStudents={async () => {
              const result = await DocumentPicker.getDocumentAsync({
                copyToCacheDirectory: true,
                // Some Android document providers report CSV as application/octet-stream
                // (or omit the MIME entirely). Keep the picker permissive and let SheetJS
                // validate the selected workbook/CSV content after selection.
                type: '*/*',
              });
              if (result.canceled) return;
              let workbook: XLSX.WorkBook;
              try {
                // Android's DocumentsUI may return a content:// URI whose provider
                // denies direct File.bytes access. fetch() reads it through the
                // content resolver and also works with CSV providers.
                assertLocalFileUri(result.assets[0].uri);
                const response = await fetch(result.assets[0].uri);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
              } catch {
                Alert.alert(
                  'Import gagal',
                  'File tidak dapat dibaca. Pastikan formatnya CSV atau XLSX dan coba lagi.',
                );
                return;
              }
              const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
                workbook.Sheets[workbook.SheetNames[0]],
                { defval: '' },
              );
              const candidates = rows.map((row) => ({
                name: String(row.Nama ?? row.nama ?? row.Name ?? row.name ?? '').trim(),
                nis: String(row.NIS ?? row.nis ?? row.NomorInduk ?? '').trim(),
              }));
              const existing = new Set(students.map((student) => student.name.toLocaleLowerCase()));
              const existingNis = new Set(
                students.map((student) => student.nis?.trim()).filter(Boolean),
              );
              const duplicates = new Set<string>();
              const invalid = candidates.filter((candidate) => {
                const key = candidate.name.toLocaleLowerCase();
                if (
                  candidate.name.length < 2 ||
                  !candidate.nis ||
                  existing.has(key) ||
                  existingNis.has(candidate.nis) ||
                  duplicates.has(key) ||
                  duplicates.has(`nis:${candidate.nis}`)
                ) {
                  duplicates.add(key);
                  return true;
                }
                duplicates.add(key);
                duplicates.add(`nis:${candidate.nis}`);
                return false;
              });
              const valid = candidates.filter(
                (candidate) =>
                  candidate.name.length >= 2 &&
                  Boolean(candidate.nis) &&
                  !existing.has(candidate.name.toLocaleLowerCase()) &&
                  !existingNis.has(candidate.nis) &&
                  candidates.filter(
                    (other) => other.name.toLocaleLowerCase() === candidate.name.toLocaleLowerCase(),
                  ).length === 1 &&
                  candidates.filter((other) => other.nis === candidate.nis).length === 1,
              );
              if (invalid.length > 0) {
                Alert.alert(
                  'Periksa spreadsheet',
                  `${invalid.length} baris tidak valid/duplikat. ${valid.length} baris valid siap diimpor.`,
                  [
                    { text: 'Batal', style: 'cancel' },
                    {
                      text: 'Impor yang valid',
                      onPress: async () => {
                        for (const candidate of valid)
                          await addStudent(
                            db,
                            selectedClassId,
                            `student-${Date.now()}-${candidate.nis}`,
                            candidate.name,
                            candidate.nis,
                          );
                        refreshStudents();
                      },
                    },
                  ],
                );
                return;
              }
              Alert.alert('Pratinjau import', `${valid.length} siswa valid siap diimpor.`, [
                { text: 'Batal', style: 'cancel' },
                {
                  text: 'Impor',
                  onPress: async () => {
                    for (const candidate of valid)
                      await addStudent(
                        db,
                        selectedClassId,
                        `student-${Date.now()}-${candidate.nis}`,
                        candidate.name,
                        candidate.nis,
                      );
                    refreshStudents();
                  },
                },
              ]);
            }}
          />
        )}
        {activeTab === 'Jadwal' && <ScheduleScreen db={db} classId={selectedClassId} />}
        {activeTab === 'Laporan' && (
          <ReportScreen
            db={db}
            classId={selectedClassId}
            className={classes.find((item) => item.id === selectedClassId)?.name ?? 'Kelas'}
            students={students}
            onRestoreComplete={refreshAllData}
          />
        )}
        {activeTab === 'Jurnal' && (
          <JournalScreen
            db={db}
            classId={selectedClassId}
            className={classes.find((item) => item.id === selectedClassId)?.name ?? 'Kelas'}
            onDirtyChange={setJournalDirty}
            onRegisterSave={(save) => {
              journalSaveRef.current = save;
            }}
          />
        )}
        {activeTab === 'Nilai' && (
          <GradeScreen db={db} classId={selectedClassId} students={students} />
        )}
        {activeTab === 'Pengaturan' && (
          <SettingsScreen
            context={academicContext}
            onBack={() => navigate('Beranda')}
            onEditProfile={() => setContextEditorVisible(true)}
          />
        )}
        {activeTab !== 'Beranda' &&
          activeTab !== 'Absensi' &&
          activeTab !== 'Kelas' &&
          activeTab !== 'Jadwal' &&
          activeTab !== 'Laporan' &&
          activeTab !== 'Jurnal' &&
          activeTab !== 'Nilai' &&
          activeTab !== 'Pengaturan' && <PlaceholderScreen title={activeTab} />}
        <BottomNavigation activeTab={activeTab} onChange={navigate} />
        <Modal visible={!academicContext} animationType="fade">
          <AcademicSetupScreen
            db={db}
            onComplete={(context) => setAcademicContext(context)}
          />
        </Modal>
        <Modal visible={contextEditorVisible} animationType="slide" onRequestClose={() => setContextEditorVisible(false)}>
          <AcademicSetupScreen
            db={db}
            initialContext={academicContext}
            onComplete={(context) => {
              setAcademicContext(context);
              setContextEditorVisible(false);
              void refreshAllData();
            }}
          />
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

function AcademicSetupScreen({
  db,
  initialContext,
  onComplete,
}: {
  db: SQLiteDatabase;
  initialContext?: Awaited<ReturnType<typeof loadActiveAcademicContext>>;
  onComplete: (context: Awaited<ReturnType<typeof loadActiveAcademicContext>>) => void;
}) {
  const [teacherName, setTeacherName] = useState(initialContext?.teacher_name ?? '');
  const [schoolName, setSchoolName] = useState(initialContext?.school_name ?? '');
  const [yearLabel, setYearLabel] = useState(initialContext?.year_label ?? '2026/2027');
  const [termLabel, setTermLabel] = useState(initialContext?.term_label ?? 'Semester 1');
  const [startDate, setStartDate] = useState('2026-07-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!teacherName.trim() || !schoolName.trim() || !yearLabel.trim() || !termLabel.trim()) {
      setError('Nama guru, sekolah, tahun ajaran, dan semester wajib diisi.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
      setError('Rentang tanggal harus menggunakan format YYYY-MM-DD yang valid.');
      return;
    }
    try {
      await saveAcademicContext(db, {
        teacherId: 'teacher-local',
        teacherName,
        schoolId: 'school-local',
        schoolName,
        yearId: `year-${yearLabel.replace(/[^0-9]/g, '-')}`,
        yearLabel,
        termId: `term-${yearLabel.replace(/[^0-9]/g, '-')}-${termLabel.replace(/\s+/g, '-')}`,
        termLabel,
        termNumber: termLabel.toLowerCase().includes('2') ? 2 : 1,
        startDate,
        endDate,
      });
      onComplete(await loadActiveAcademicContext(db));
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Profil belum dapat disimpan.');
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.setupContent}>
      <Ionicons name="school-outline" size={48} color="#FF795C" />
      <Text style={styles.screenTitle}>Siapkan KelasRapi</Text>
      <Text style={styles.helpText}>
        Lengkapi konteks akademik sekali. Data inti tetap tersimpan lokal dan dapat dibackup kapan saja.
      </Text>
      <TextInput value={teacherName} onChangeText={setTeacherName} placeholder="Nama guru" placeholderTextColor="#8A9AAF" style={styles.textInput} accessibilityLabel="Nama guru" />
      <TextInput value={schoolName} onChangeText={setSchoolName} placeholder="Nama sekolah" placeholderTextColor="#8A9AAF" style={styles.textInput} accessibilityLabel="Nama sekolah" />
      <TextInput value={yearLabel} onChangeText={setYearLabel} placeholder="Tahun ajaran, contoh 2026/2027" placeholderTextColor="#8A9AAF" style={styles.textInput} accessibilityLabel="Tahun ajaran" />
      <TextInput value={termLabel} onChangeText={setTermLabel} placeholder="Semester 1" placeholderTextColor="#8A9AAF" style={styles.textInput} accessibilityLabel="Semester" />
      <View style={styles.scheduleInputRow}>
        <TextInput value={startDate} onChangeText={setStartDate} placeholder="Mulai YYYY-MM-DD" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel="Tanggal mulai semester" />
        <TextInput value={endDate} onChangeText={setEndDate} placeholder="Selesai YYYY-MM-DD" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel="Tanggal selesai semester" />
      </View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable onPress={submit} style={styles.saveButton} accessibilityRole="button">
        <Text style={styles.saveButtonText}>Simpan konteks akademik</Text>
      </Pressable>
    </ScrollView>
  );
}

function Dashboard({
  db,
  classes,
  classId,
  onSelectClass,
  onOpenAttendance,
  onOpenJournal,
  onOpenGrades,
  onOpenReport,
  className,
  studentCount,
  missingNisCount,
  attendanceRate,
  teacherName,
  onOpenSettings,
  onChangeAcademicContext,
}: {
  db: SQLiteDatabase;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  classId: string;
  onSelectClass: (id: string) => void;
  onOpenAttendance: () => void;
  onOpenJournal: () => void;
  onOpenGrades: () => void;
  onOpenReport: () => void;
  className: string;
  studentCount: number;
  missingNisCount: number;
  attendanceRate: number | null;
  teacherName: string;
  onOpenSettings: () => void;
  onChangeAcademicContext: () => void;
}) {
  const [showGuide, setShowGuide] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<Awaited<ReturnType<typeof loadSchedules>>>([]);
  const [todaySessions, setTodaySessions] = useState<Awaited<ReturnType<typeof loadTeachingSessions>>>([]);
  const [journalCompleted, setJournalCompleted] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [attendanceAlerts, setAttendanceAlerts] = useState<
    Awaited<ReturnType<typeof loadAttendanceAlerts>>
  >([]);
  useEffect(() => {
    const today = localDateKey();
    Promise.all([
      loadSchedules(db, classId),
      loadScheduleExceptions(db, classId, today),
      loadAttendanceAlerts(db, classId, today),
      loadTeachingSessions(db, today, classId),
      loadJournal(db, classId, today),
    ])
      .then(([rows, exceptions, alerts, sessions, journal]) => {
        setAttendanceAlerts(alerts);
        setTodaySessions(sessions);
        setJournalCompleted(Boolean(journal?.content?.trim() && journal.state === 'submitted'));
        const workdayOverride = exceptions.some(
          (exception) => exception.kind === 'extra' && exception.title === WORKDAY_OVERRIDE_TITLE,
        );
        const nationalHoliday = getNationalHoliday(today);
        const holiday =
          exceptions.find((exception) => exception.kind === 'holiday') ??
          (workdayOverride ? null : nationalHoliday);
        const cancelled = exceptions.find((exception) => exception.kind === 'cancel');
        const moved = exceptions.find((exception) => exception.kind === 'reschedule');
        const extra = exceptions.find((exception) => exception.kind === 'extra');
        setScheduleNotice(
          holiday
            ? `${holiday.title}: jadwal hari ini dinonaktifkan${exceptions.some((exception) => exception.kind === 'holiday') ? '.' : ' otomatis.'}`
            : cancelled
              ? `${cancelled.title} dibatalkan hari ini.`
              : moved
                ? `${moved.title} dipindahkan ke ${moved.start_time ?? 'jam baru'} hari ini.`
                : extra
                  ? `Kelas pengganti: ${extra.title} mulai ${extra.start_time ?? 'sesuai agenda'}.`
                  : null,
        );
        setTodaySchedule(
          selectDashboardSchedule(
            applyScheduleExceptions(
              rows.filter((row) => row.weekday === localWeekday()),
              holiday && !exceptions.some((exception) => exception.kind === 'holiday')
                ? [
                    ...exceptions,
                    {
                      id: `national-${today}`,
                      class_id: null,
                      schedule_id: null,
                      exception_date: today,
                      kind: 'holiday' as const,
                      title: holiday.title,
                      start_time: null,
                      end_time: null,
                      note: 'Libur nasional otomatis',
                    },
                  ]
                : exceptions,
            ),
            localWeekday(),
          ),
        );
      })
      .catch(() => {
        setTodaySchedule([]);
        setTodaySessions([]);
        setJournalCompleted(false);
        setScheduleNotice(null);
        setAttendanceAlerts([]);
      });
  }, [db, classId]);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.dashboardHeader}>
        <Text style={styles.brand}>KelasRapi</Text>
        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Buka pengaturan profil guru"
        >
          <Ionicons name="settings-outline" size={22} color={activePalette.primary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classPickerRow}>
        {classes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectClass(item.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: classId === item.id }}
            accessibilityLabel={`Pilih kelas ${item.name} di dashboard`}
            style={[styles.classPickerChip, classId === item.id && styles.classPickerChipSelected]}
          >
            <Text
              style={[
                styles.classPickerText,
                classId === item.id && styles.classPickerTextSelected,
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.greeting}>Selamat pagi, {teacherName}</Text>
      <Text style={styles.date}>{localLongDate()}</Text>
      <Pressable onPress={onChangeAcademicContext} style={styles.contextSwitchButton} accessibilityRole="button" accessibilityLabel="Ganti semester atau tahun ajaran">
        <Ionicons name="school-outline" size={18} color={activePalette.primary} />
        <Text style={styles.contextSwitchText}>Ganti semester / tahun ajaran</Text>
      </Pressable>
      {showGuide ? (
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>Mulai dari tugas hari ini</Text>
          <Text style={styles.helpText}>
            Pilih kelas, lalu gunakan aksi cepat untuk absensi, nilai, jurnal, atau laporan. Semua
            perubahan inti tersimpan offline.
          </Text>
          <Pressable onPress={() => setShowGuide(false)} accessibilityLabel="Tutup panduan beranda">
            <Text style={styles.guideDismiss}>Tutup panduan</Text>
          </Pressable>
        </View>
      ) : null}
      <LinearGradient
        colors={[activePalette.surfaceRaised, activePalette.surfaceSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIllustration}>
            <Ionicons name="library-outline" size={42} color={activePalette.accent} />
            <Ionicons name="pencil-outline" size={22} color={activePalette.primary} style={styles.pencilIcon} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle}>{className}</Text>
            <Text style={styles.heroSubtitle}>{studentCount} siswa</Text>
          </View>
          <View
            style={styles.progressRing}
            accessibilityLabel={
              attendanceRate === null
                ? 'Belum ada data kehadiran'
                : `${attendanceRate} persen data kehadiran tercatat hadir atau terlambat`
            }
          >
            <Text style={styles.progressValue} maxFontSizeMultiplier={1.4}>
              {attendanceRate === null ? '—' : `${attendanceRate}%`}
            </Text>
            <Text style={styles.progressLabel} maxFontSizeMultiplier={1.4}>
              {attendanceRate === null ? 'belum ada' : 'hadir/terlambat'}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mulai absensi ${className}`}
          onPress={onOpenAttendance}
          style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}
        >
          <Text style={styles.inlineActionText}>Mulai absensi</Text>
          <Text style={styles.inlineArrow}>›</Text>
        </Pressable>
      </LinearGradient>
      <Text style={styles.sectionTitle}>Aksi cepat</Text>
      <View style={styles.quickRow}>
        <QuickAction
          icon="calendar-outline"
          title="Absensi"
          subtitle="Hari ini"
          onPress={onOpenAttendance}
        />
        <QuickAction
          icon="stats-chart-outline"
          title="Nilai"
          subtitle="Input dari sesi"
          onPress={onOpenGrades}
        />
        <QuickAction
          icon="book-outline"
          title="Jurnal"
          subtitle="Isi jurnal"
          onPress={onOpenJournal}
        />
        <QuickAction
          icon="document-text-outline"
          title="Laporan"
          subtitle="Excel / PDF"
          onPress={onOpenReport}
        />
      </View>
      {attendanceAlerts.length ? (
        <View style={styles.attendanceAlertCard} accessibilityLabel="Peringatan evaluasi kehadiran">
          <Ionicons name="warning-outline" size={25} color="#C36F0C" />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>Perlu evaluasi kehadiran</Text>
            <Text style={styles.alertSubtitle}>
              {attendanceAlerts.length} siswa memiliki lebih dari 3 hari tidak hadir dalam 30 hari
              terakhir.
            </Text>
            {attendanceAlerts.slice(0, 3).map((item) => (
              <Text key={item.id} style={styles.alertDetail}>
                {item.name} · {item.missed_days} hari
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {missingNisCount ? (
        <View style={styles.scheduleNotice} accessibilityLabel="Peringatan NIS belum lengkap">
          <Ionicons name="id-card-outline" size={24} color="#C36F0C" />
          <Text style={styles.scheduleNoticeText}>
            {missingNisCount} siswa belum memiliki NIS. Lengkapi sebelum mencetak laporan resmi.
          </Text>
        </View>
      ) : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Jadwal hari ini</Text>
        <Text style={styles.sectionLink}>Lihat jadwal ›</Text>
      </View>
      {scheduleNotice ? (
        <View
          style={styles.scheduleNotice}
          accessibilityLabel={`Peringatan jadwal: ${scheduleNotice}`}
        >
          <Ionicons name="alert-circle-outline" size={24} color="#C36F0C" />
          <Text style={styles.scheduleNoticeText}>{scheduleNotice}</Text>
        </View>
      ) : null}
      {todaySessions.length ? (
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleTime}>
            <Ionicons name="time-outline" size={22} color={activePalette.primary} />
            <Text style={styles.scheduleTimeText}>{todaySessions[0].start_time}</Text>
          </View>
          <Text style={styles.scheduleTitle}>{todaySessions[0].title}</Text>
          <Text style={styles.quickSubtitle}>{todaySessions[0].status}</Text>
        </View>
      ) : todaySchedule.length ? (
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleTime}>
            <Ionicons name="time-outline" size={22} color={activePalette.primary} />
            <Text style={styles.scheduleTimeText}>{todaySchedule[0].start_time}</Text>
          </View>
          <Text style={styles.scheduleTitle}>{todaySchedule[0].title}</Text>
          <Ionicons name="calculator-outline" size={30} color="#FF795C" />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.placeholderText}>Belum ada jadwal untuk kelas ini.</Text>
        </View>
      )}
      {!journalCompleted ? <View style={styles.journalAlert}>
        <Ionicons name="warning-outline" size={28} color="#E58A23" />
        <View style={styles.alertCopy}>
          <Text style={styles.alertTitle}>Jurnal belum diisi</Text>
          <Text style={styles.alertSubtitle}>
            Isi jurnal pembelajaran hari ini untuk {className}.
          </Text>
        </View>
        <Pressable onPress={onOpenJournal} accessibilityRole="button">
          <Text style={styles.alertAction}>Isi jurnal</Text>
        </Pressable>
      </View> : <View style={styles.journalCompleteCard}>
          <Ionicons name="checkmark-circle-outline" size={28} color={activePalette.primary} />
        <Text style={styles.alertTitle}>Jurnal hari ini sudah selesai</Text>
      </View>}
    </ScrollView>
  );
}

function SettingsScreen({
  context,
  onBack,
  onEditProfile,
}: {
  context: Awaited<ReturnType<typeof loadActiveAcademicContext>>;
  onBack: () => void;
  onEditProfile: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsHeader}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.settingsBackButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Kembali ke beranda"
        >
          <Ionicons name="arrow-back" size={22} color={activePalette.text} />
        </Pressable>
        <View style={styles.settingsHeaderCopy}>
          <Text style={styles.screenTitle}>Pengaturan</Text>
          <Text style={styles.helpText}>Kelola profil guru dan konteks akademik.</Text>
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Ionicons name="person" size={30} color="#FF795C" />
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{context?.teacher_name ?? 'Profil guru belum diatur'}</Text>
          <Text style={styles.profileSchool}>{context?.school_name ?? 'Tambahkan nama sekolah'}</Text>
        </View>
        <Pressable
          onPress={onEditProfile}
          style={({ pressed }) => [styles.outlineAction, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Edit profil guru"
        >
          <Text style={styles.outlineActionText}>Edit</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Konteks akademik aktif</Text>
      <View style={styles.settingsInfoCard}>
        <View style={styles.settingsInfoRow}>
          <Ionicons name="calendar-outline" size={20} color={activePalette.primary} />
          <View style={styles.settingsInfoCopy}>
            <Text style={styles.settingsInfoLabel}>Tahun ajaran</Text>
            <Text style={styles.settingsInfoValue}>{context?.year_label ?? 'Belum diatur'}</Text>
          </View>
        </View>
        <View style={styles.settingsInfoRow}>
          <Ionicons name="school-outline" size={20} color={activePalette.primary} />
          <View style={styles.settingsInfoCopy}>
            <Text style={styles.settingsInfoLabel}>Semester</Text>
            <Text style={styles.settingsInfoValue}>{context?.term_label ?? 'Belum diatur'}</Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={onEditProfile}
        style={({ pressed }) => [styles.primarySettingsAction, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Ubah profil dan konteks akademik"
      >
        <Ionicons name="create-outline" size={20} color="#FFFFFF" />
        <Text style={styles.primarySettingsActionText}>Ubah profil & konteks akademik</Text>
      </Pressable>
      <View style={styles.settingsHintCard}>
        <Ionicons name="shield-checkmark-outline" size={22} color="#187F79" />
        <Text style={styles.helpText}>
          Data profil dan data akademik tersimpan lokal di perangkat. Mengubah semester tidak menghapus histori periode sebelumnya.
        </Text>
      </View>
    </ScrollView>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={28} color={activePalette.accent} />
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AttendanceScreen({
  db,
  classes,
  classId,
  onSelectClass,
  className,
  attendanceDate,
  onAttendanceDateChange,
  students,
  saved,
  presentCount,
  onMarkAllPresent,
  onBulkUpdateStatus,
  onUndoBulkChange,
  canUndoBulk,
  onUpdateStatus,
  onUpdateNote,
  onSave,
  onFinalize,
}: {
  db: SQLiteDatabase;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  classId: string;
  onSelectClass: (id: string) => void;
  className: string;
  attendanceDate: string;
  onAttendanceDateChange: (date: string) => void;
  students: Student[];
  saved: boolean;
  presentCount: number;
  onMarkAllPresent: () => void;
  onBulkUpdateStatus: (status: AttendanceStatus) => void;
  onUndoBulkChange: () => void;
  canUndoBulk: boolean;
  onUpdateStatus: (id: string, status: AttendanceStatus) => void;
  onUpdateNote: (id: string, note: string) => void;
  onSave: () => void;
  onFinalize: () => void;
}) {
  const [entryVisible, setEntryVisible] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [noteStudentId, setNoteStudentId] = useState<string | null>(null);
  const [period, setPeriod] = useState<AttendancePeriod>('day');
  const [customStart, setCustomStart] = useState(shiftDate(attendanceDate, -6));
  const [customEnd, setCustomEnd] = useState(attendanceDate);
  const [visibleStudentCount, setVisibleStudentCount] = useState(STUDENT_PAGE_SIZE);
  const [recap, setRecap] = useState<Awaited<ReturnType<typeof loadAttendanceRecap>>>([]);
  const [studentRecap, setStudentRecap] = useState<
    Awaited<ReturnType<typeof loadAttendanceStudentRecap>>
  >([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof loadTeachingSessions>>>([]);
  const attendanceSummary = useMemo(
    () => ({
      hadir: students.filter((student) => student.status === 'Hadir').length,
      sakit: students.filter((student) => student.status === 'Sakit').length,
      izin: students.filter((student) => student.status === 'Izin').length,
      alpa: students.filter((student) => student.status === 'Alpa').length,
    }),
    [students],
  );
  useEffect(() => {
    if (showRecap) {
      loadAttendanceRecap(db, classId, period, attendanceDate, customStart, customEnd)
        .then(setRecap)
        .catch(() => setRecap([]));
      loadAttendanceStudentRecap(db, classId, period, attendanceDate, customStart, customEnd)
        .then(setStudentRecap)
        .catch(() => setStudentRecap([]));
    }
  }, [attendanceDate, classId, customEnd, customStart, db, period, showRecap]);
  useEffect(() => {
    setVisibleStudentCount(STUDENT_PAGE_SIZE);
    setNoteStudentId(null);
  }, [classId, students.length]);
  useEffect(() => {
    loadTeachingSessions(db, attendanceDate, classId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [attendanceDate, classId, db]);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Absensi {className}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classPickerRow}>
        {classes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectClass(item.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: classId === item.id }}
            accessibilityLabel={`Pilih kelas ${item.name}`}
            style={[styles.classPickerChip, classId === item.id && styles.classPickerChipSelected]}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={classId === item.id ? '#FFFFFF' : '#187F79'}
            />
            <Text
              style={[
                styles.classPickerText,
                classId === item.id && styles.classPickerTextSelected,
              ]}
            >
              {item.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {!entryVisible ? (
        <>
          <View style={styles.workflowSummaryCard}>
            <View style={styles.workflowSummaryHeader}>
              <View>
                <Text style={styles.sectionTitle}>Ringkasan absensi</Text>
                <Text style={styles.quickSubtitle}>{localLongDate(new Date(`${attendanceDate}T12:00:00`))}</Text>
              </View>
              <Ionicons name="calendar-outline" size={30} color="#FF795C" />
            </View>
            <View style={styles.metricRow}>
              <MetricCard label="Hadir" value={String(attendanceSummary.hadir)} />
              <MetricCard label="Sakit" value={String(attendanceSummary.sakit)} />
              <MetricCard label="Izin" value={String(attendanceSummary.izin)} />
              <MetricCard label="Alpa" value={String(attendanceSummary.alpa)} />
            </View>
            <Text style={styles.fieldHelp}>
              {sessions[0] ? `${sessions[0].title} · ${sessions[0].start_time}–${sessions[0].end_time}` : 'Pilih tanggal untuk melihat sesi sesuai jadwal.'}
            </Text>
          </View>
          <Pressable onPress={() => setEntryVisible(true)} style={({ pressed }) => [styles.addStudentButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Tambah absensi">
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.addStudentText}>Tambah absensi</Text>
          </Pressable>
          <Pressable onPress={() => setShowRecap((value) => !value)} style={styles.recapToggle} accessibilityRole="button" accessibilityLabel="Lihat rekap absensi">
            <Ionicons name="analytics-outline" size={20} color="#187F79" />
            <Text style={styles.recapToggleText}>{showRecap ? 'Tutup rekap' : 'Lihat rekap periode lain'}</Text>
          </Pressable>
        </>
      ) : null}
      <View style={!entryVisible ? styles.hidden : undefined}>
      <Text style={styles.date}>
        {localLongDate(new Date(`${attendanceDate}T12:00:00`))} · {students.length} siswa
      </Text>
      {attendanceDate < localDateKey() ? (
        <View style={styles.scheduleNotice} accessibilityLabel="Absensi backfill">
          <Ionicons name="time-outline" size={22} color="#C36F0C" />
          <Text style={styles.scheduleNoticeText}>
            Mode backfill: tanggal sudah lewat. Simpan akan dicatat sebagai pengisian terlambat.
          </Text>
        </View>
      ) : null}
      {sessions.length ? (
        <View style={styles.sessionContextCard} accessibilityLabel="Sesi mengajar terpilih">
          <Ionicons name="school-outline" size={21} color="#187F79" />
          <View style={styles.alertCopy}>
            <Text style={styles.sessionContextTitle}>{sessions[0].title}</Text>
            <Text style={styles.sessionContextText}>
              Sesi {sessions[0].start_time}–{sessions[0].end_time} · konteks jadwal aktif
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.sessionEmptyCard}>
          <Text style={styles.sessionContextText}>
            Belum ada sesi mengajar terjadwal untuk kelas ini pada tanggal tersebut.
          </Text>
        </View>
      )}
      <View style={styles.attendanceDateToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hari absensi sebelumnya"
          onPress={() => onAttendanceDateChange(shiftDate(attendanceDate, -1))}
          style={({ pressed }) => [styles.dateStepButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color="#24354D" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pilih tanggal absensi"
          onPress={() => setDatePickerVisible(true)}
          style={({ pressed }) => [styles.selectedDateButton, pressed && styles.pressed]}
        >
          <Text style={styles.selectedDateText}>
            {attendanceDate === localDateKey() ? 'Hari ini' : 'Tanggal lampau'}
          </Text>
          <Text style={styles.selectedDateHint}>
            {attendanceDate === localDateKey()
              ? 'Ketuk untuk memilih tanggal'
              : 'Ketuk untuk mengganti tanggal'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hari absensi berikutnya"
          disabled={attendanceDate >= localDateKey()}
          onPress={() => onAttendanceDateChange(shiftDate(attendanceDate, 1))}
          style={({ pressed }) => [
            styles.dateStepButton,
            attendanceDate >= localDateKey() && styles.dateStepButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={attendanceDate >= localDateKey() ? '#A9BBD0' : '#24354D'}
          />
        </Pressable>
      </View>
      <View style={styles.attendanceToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tandai semua siswa hadir"
          onPress={onMarkAllPresent}
          style={({ pressed }) => [styles.toolbarAction, pressed && styles.pressed]}
        >
          <Text style={styles.toolbarActionText}>Semua hadir</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ubah status semua siswa"
          onPress={() =>
            Alert.alert(
              'Ubah status semua siswa',
              'Status yang dipilih akan diterapkan ke semua siswa dan bisa diurungkan.',
              [
                { text: 'Batal', style: 'cancel' },
                ...statusOptions.map((status) => ({
                  text: status,
                  onPress: () => onBulkUpdateStatus(status),
                })),
              ],
            )
          }
          style={({ pressed }) => [styles.toolbarAction, pressed && styles.pressed]}
        >
          <Text style={styles.toolbarActionText}>Status semua</Text>
        </Pressable>
        {canUndoBulk ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Urungkan perubahan status semua"
            onPress={onUndoBulkChange}
            style={({ pressed }) => [styles.toolbarAction, pressed && styles.pressed]}
          >
            <Text style={styles.toolbarActionText}>Urungkan</Text>
          </Pressable>
        ) : null}
        <Text style={styles.countText}>
          {presentCount}/{students.length} hadir
        </Text>
      </View>
      {students.slice(0, visibleStudentCount).map((student) => (
        <View key={student.id} style={styles.studentCard}>
          <Text style={styles.studentName}>
            {student.nis ? `NIS ${student.nis}` : 'NIS belum diisi'} · {student.name}
          </Text>
          <View style={styles.statusRow}>
            {statusOptions.map((status) => (
              <Pressable
                key={status}
                accessibilityRole="radio"
                accessibilityState={{ selected: student.status === status }}
                accessibilityLabel={`${student.name}: ${status}`}
                onPress={() => onUpdateStatus(student.id, status)}
                style={({ pressed }) => [
                  styles.statusChip,
                  student.status === status && styles.statusChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    student.status === status && styles.statusTextSelected,
                  ]}
                >
                  {status}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Catatan absensi ${student.name}`}
            onPress={() =>
              setNoteStudentId((current) => (current === student.id ? null : student.id))
            }
            style={styles.noteToggle}
          >
            <Ionicons name="create-outline" size={16} color="#187F79" />
            <Text style={styles.noteToggleText}>
              {student.note ? 'Edit catatan' : 'Tambah catatan'}
            </Text>
          </Pressable>
          {noteStudentId === student.id ? (
            <TextInput
              value={student.note}
              onChangeText={(note) => onUpdateNote(student.id, note)}
              placeholder="Catatan kejadian (opsional)"
              placeholderTextColor="#93A4B8"
              multiline
              style={styles.noteInput}
              accessibilityLabel={`Isi catatan ${student.name}`}
            />
          ) : null}
        </View>
      ))}
      {visibleStudentCount < students.length ? (
        <Pressable
          onPress={() => setVisibleStudentCount((count) => count + STUDENT_PAGE_SIZE)}
          style={styles.templateButton}
          accessibilityRole="button"
          accessibilityLabel="Tampilkan siswa berikutnya untuk absensi"
        >
          <Ionicons name="chevron-down-outline" size={20} color="#187F79" />
          <Text style={styles.templateText}>
            Tampilkan berikutnya (
            {Math.min(STUDENT_PAGE_SIZE, students.length - visibleStudentCount)})
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Simpan absensi"
        onPress={onSave}
        style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
      >
        <LinearGradient
          colors={['#FF8A72', '#FF6F59']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.saveGradient}
        >
          <Text style={styles.saveButtonText}>
            {saved ? 'Absensi tersimpan' : 'Simpan absensi'}
          </Text>
        </LinearGradient>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Finalisasi absensi"
        onPress={onFinalize}
        style={({ pressed }) => [styles.finalizeButton, pressed && styles.pressed]}
      >
        <Text style={styles.finalizeButtonText}>Finalisasi absensi</Text>
      </Pressable>
      <Text style={styles.draftText}>Draft lokal tersimpan otomatis saat ada perubahan.</Text>
      <Pressable
        onPress={() => setShowRecap((value) => !value)}
        style={styles.recapToggle}
        accessibilityRole="button"
        accessibilityLabel="Buka rekap absensi"
      >
        <Ionicons name="analytics-outline" size={20} color="#187F79" />
        <Text style={styles.recapToggleText}>{showRecap ? 'Tutup rekap' : 'Lihat rekap'}</Text>
      </Pressable>
      {showRecap ? (
        <View style={styles.recapCard}>
          <Text style={styles.alertTitle}>Rekap absensi</Text>
          <View style={styles.recapPeriodRow}>
            {(['day', 'week', 'month', 'custom'] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => setPeriod(item)}
                style={[styles.recapPeriod, period === item && styles.recapPeriodSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: period === item }}
                accessibilityLabel={`Periode rekap ${item === 'day' ? 'hari ini' : item === 'week' ? 'minggu ini' : item === 'month' ? 'bulan ini' : 'custom'}`}
              >
                <Text
                  style={[
                    styles.recapPeriodText,
                    period === item && styles.recapPeriodTextSelected,
                  ]}
                >
                  {item === 'day'
                    ? 'Hari ini'
                    : item === 'week'
                      ? 'Minggu'
                      : item === 'month'
                        ? 'Bulan'
                        : 'Custom'}
                </Text>
              </Pressable>
            ))}
          </View>
          {period === 'custom' ? (
            <View style={styles.customRangeRow}>
              <TextInput
                value={customStart}
                onChangeText={setCustomStart}
                placeholder="Mulai YYYY-MM-DD"
                placeholderTextColor="#8A9AAF"
                style={styles.customRangeInput}
                accessibilityLabel="Tanggal mulai rekap custom"
              />
              <TextInput
                value={customEnd}
                onChangeText={setCustomEnd}
                placeholder="Selesai YYYY-MM-DD"
                placeholderTextColor="#8A9AAF"
                style={styles.customRangeInput}
                accessibilityLabel="Tanggal selesai rekap custom"
              />
            </View>
          ) : null}
          {recap.length ? (
            recap.map((item) => (
              <View key={item.status} style={styles.recapRow}>
                <Text style={styles.studentName}>{item.status}</Text>
                <Text style={styles.countText}>{item.total} siswa</Text>
              </View>
            ))
          ) : (
            <Text style={styles.placeholderText}>Belum ada data tersimpan untuk periode ini.</Text>
          )}
          {studentRecap.length ? <Text style={styles.recapSubheading}>Per siswa</Text> : null}
          {studentRecap.map((item) => (
            <View key={item.id} style={styles.recapRow}>
              <Text style={styles.quickSubtitle}>{item.name}</Text>
              <Text style={styles.previewStatus}>{item.status}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable onPress={() => setEntryVisible(false)} style={styles.recapToggle} accessibilityRole="button" accessibilityLabel="Kembali ke ringkasan absensi">
        <Ionicons name="arrow-back-outline" size={20} color="#187F79" />
        <Text style={styles.recapToggleText}>Kembali ke ringkasan</Text>
      </Pressable>
      </View>
      <CalendarDatePicker
        visible={datePickerVisible}
        value={attendanceDate}
        onClose={() => setDatePickerVisible(false)}
        onSelect={(date) => {
          onAttendanceDateChange(date);
          setDatePickerVisible(false);
        }}
      />
    </ScrollView>
  );
}

function CalendarDatePicker({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => new Date(`${value}T12:00:00`));
  useEffect(() => {
    if (visible) setMonth(new Date(`${value}T12:00:00`));
  }, [value, visible]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= days
      ? localDateKey(new Date(month.getFullYear(), month.getMonth(), day, 12))
      : null;
  });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalScrimCenter}>
        <View style={styles.datePickerCard}>
          <Text style={styles.screenTitle}>Pilih tanggal absensi</Text>
          <View style={styles.datePickerHeader}>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}
              style={styles.datePickerNav}
              accessibilityLabel="Bulan sebelumnya"
            >
              <Ionicons name="chevron-back" size={20} color="#24354D" />
            </Pressable>
            <Text style={styles.datePickerMonth}>
              {month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}
              style={styles.datePickerNav}
              accessibilityLabel="Bulan berikutnya"
            >
              <Ionicons name="chevron-forward" size={20} color="#24354D" />
            </Pressable>
          </View>
          <View style={styles.calendarWeekRow}>
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day) => (
              <Text key={day} style={styles.calendarWeekText}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((date, index) =>
              date ? (
                <Pressable
                  key={date}
                  onPress={() => onSelect(date)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pilih ${date}`}
                  style={[styles.calendarDay, date === value && styles.calendarDaySelected]}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      date === value && styles.calendarDayTextSelected,
                    ]}
                  >
                    {Number(date.slice(-2))}
                  </Text>
                </Pressable>
              ) : (
                <View key={`empty-${index}`} style={styles.calendarDay} />
              ),
            )}
          </View>
          <View style={styles.modalActions}>
            <Pressable onPress={() => onSelect(localDateKey())} style={styles.templateButton}>
              <Text style={styles.templateText}>Hari ini</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ClassScreen({
  db,
  classes,
  selectedClassId,
  onSelectClass,
  onClassesChanged,
  students,
  onAddStudent,
  onUpdateStudent,
  onArchiveStudent,
  onReorderStudent,
  onRestoreStudent,
  onDownloadTemplate,
  onImportStudents,
}: {
  db: SQLiteDatabase;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  selectedClassId: string;
  onSelectClass: (id: string) => void;
  onClassesChanged: () => Promise<void>;
  students: Student[];
  onAddStudent: (name: string, nis: string) => Promise<void>;
  onUpdateStudent: (id: string, name: string, nis: string) => Promise<void>;
  onArchiveStudent: (id: string) => Promise<void>;
  onReorderStudent: (id: string, direction: 'up' | 'down') => Promise<void>;
  onRestoreStudent: (id: string) => Promise<void>;
  onDownloadTemplate: () => Promise<void>;
  onImportStudents: () => Promise<void>;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [nis, setNis] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [classModalVisible, setClassModalVisible] = useState(false);
  const [className, setClassName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [archivedStudents, setArchivedStudents] = useState<
    Awaited<ReturnType<typeof loadArchivedStudents>>
  >([]);
  const [showArchived, setShowArchived] = useState(false);
  const [promotionVisible, setPromotionVisible] = useState(false);
  const [promotionAssignments, setPromotionAssignments] = useState<Record<string, string>>({});
  const [visibleStudentCount, setVisibleStudentCount] = useState(STUDENT_PAGE_SIZE);
  useEffect(() => {
    setVisibleStudentCount(STUDENT_PAGE_SIZE);
  }, [selectedClassId, students.length]);
  useEffect(() => {
    loadArchivedStudents(db, selectedClassId)
      .then(setArchivedStudents)
      .catch(() => setArchivedStudents([]));
  }, [db, selectedClassId, students]);
  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Nama siswa minimal 2 karakter.');
      return;
    }
    if (!editingId && !nis.trim()) {
      setError('NIS wajib diisi untuk siswa baru.');
      return;
    }
    try {
      if (editingId) await onUpdateStudent(editingId, name, nis);
      else await onAddStudent(name, nis);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Siswa tidak dapat disimpan.',
      );
      return;
    }
    setName('');
    setNis('');
    setError('');
    setEditingId(null);
    setModalVisible(false);
  };
  const saveClass = async () => {
    if (className.trim().length < 2) return;
    const id = editingClassId ?? `class-${Date.now()}`;
    if (editingClassId) await updateClass(db, id, className, groupName);
    else await addClass(db, id, className, groupName);
    setClassName('');
    setGroupName('');
    setEditingClassId(null);
    setClassModalVisible(false);
    await onClassesChanged();
    if (!editingClassId) onSelectClass(id);
  };
  const promoteAllStudents = async () => {
    const assignments = students
      .map((student) => ({ id: student.id, destinationClassId: promotionAssignments[student.id] }))
      .filter((item): item is { id: string; destinationClassId: string } => Boolean(item.destinationClassId));
    if (!assignments.length || assignments.length !== students.length) {
      setError('Pilih kelas tujuan untuk setiap siswa.');
      return;
    }
    const context = await loadActiveAcademicContext(db);
    if (!context) {
      setError('Lengkapi konteks akademik sebelum melakukan promosi.');
      return;
    }
    await promoteStudentsBulk(
      db,
      assignments,
      context.year_id,
      context.term_id,
    );
    setPromotionVisible(false);
    Alert.alert('Promosi tersimpan', `${assignments.length} siswa mendapat enrollment sesuai pemetaan kelas.`);
  };
  const manageClass = (item: Awaited<ReturnType<typeof loadClasses>>[number]) => {
    Alert.alert(`Kelola ${item.name}`, 'Kelas dan seluruh data siswanya tetap tersimpan lokal.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Arsipkan',
        style: 'destructive',
        onPress: async () => {
          if (classes.length <= 1) return;
          await archiveClass(db, item.id);
          await onClassesChanged();
          if (selectedClassId === item.id)
            onSelectClass(classes.find((entry) => entry.id !== item.id)?.id ?? 'class-1a');
        },
      },
      {
        text: 'Edit nama',
        onPress: () => {
          setEditingClassId(item.id);
          setClassName(item.name);
          setGroupName(item.group_name ?? '');
          setClassModalVisible(true);
        },
      },
    ]);
  };
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Kelas saya</Text>
      <Text style={styles.date}>Kelola kelas dan daftar siswa secara offline</Text>
      <Text style={styles.helpText}>
        Ketuk kelas untuk memilihnya. Tekan lama chip kelas untuk edit atau arsipkan; folder/grup
        membantu mengelompokkan kelas. Gunakan template XLSX untuk import banyak siswa.
      </Text>
      <View style={styles.classPickerRow}>
        {classes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectClass(item.id)}
            onLongPress={() => manageClass(item)}
            style={[styles.classChip, selectedClassId === item.id && styles.classChipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedClassId === item.id }}
            accessibilityLabel={`Pilih ${item.name}`}
          >
            <Text
              style={[
                styles.classChipText,
                selectedClassId === item.id && styles.classChipTextSelected,
              ]}
            >
              {item.name}
            </Text>
            {item.group_name ? <Text style={styles.classChipGroup}>{item.group_name}</Text> : null}
          </Pressable>
        ))}
        <Pressable
          onPress={() => setClassModalVisible(true)}
          style={styles.classAddChip}
          accessibilityRole="button"
          accessibilityLabel="Tambah kelas"
        >
          <Ionicons name="add" size={20} color="#187F79" />
        </Pressable>
      </View>
      <LinearGradient colors={['#F9FCFF', '#E8F3FF']} style={styles.classHero}>
        <View style={styles.classHeroIcon}>
          <Ionicons name="people-outline" size={32} color="#FF795C" />
        </View>
        <View style={styles.classHeroCopy}>
          <Text style={styles.heroTitle}>
            {classes.find((item) => item.id === selectedClassId)?.name ?? 'Kelas'}
          </Text>
          <Text style={styles.heroSubtitle}>{students.length} siswa terdaftar</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#687B91" />
      </LinearGradient>
      <View style={styles.classSectionHeader}>
        <Text style={styles.sectionTitle}>Daftar siswa</Text>
        <Text style={styles.countText}>{students.length} siswa</Text>
      </View>
      {students.slice(0, visibleStudentCount).map((student, index) => (
        <View key={student.id} style={styles.classStudentRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{student.name.slice(0, 1)}</Text>
          </View>
          <View style={styles.studentRowCopy}>
            <Text style={styles.studentName}>{student.name}</Text>
            <Text style={styles.quickSubtitle}>Siswa nomor {index + 1}</Text>
          </View>
          <View style={styles.studentActions}>
            <Pressable
              onPress={() => onReorderStudent(student.id, 'up')}
              accessibilityRole="button"
              accessibilityLabel={`Naikkan ${student.name}`}
              style={styles.smallIconButton}
            >
              <Ionicons name="chevron-up" size={18} color="#187F79" />
            </Pressable>
            <Pressable
              onPress={() => onReorderStudent(student.id, 'down')}
              accessibilityRole="button"
              accessibilityLabel={`Turunkan ${student.name}`}
              style={styles.smallIconButton}
            >
              <Ionicons name="chevron-down" size={18} color="#187F79" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Kelola ${student.name}`}
              onPress={() =>
                Alert.alert(
                  `Kelola ${student.name}`,
                  'Mengarsipkan menyembunyikan siswa dari daftar aktif; riwayat absensi dan nilai terkait tetap tersimpan.',
                  [
                    { text: 'Batal', style: 'cancel' },
                    {
                      text: 'Edit nama',
                      onPress: () => {
                        setEditingId(student.id);
                        setName(student.name);
                        setNis(student.nis ?? '');
                        setModalVisible(true);
                      },
                    },
                    {
                      text: 'Arsipkan',
                      style: 'destructive',
                      onPress: () => onArchiveStudent(student.id),
                    },
                  ],
                )
              }
              style={styles.smallIconButton}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#687B91" />
            </Pressable>
          </View>
        </View>
      ))}
      {visibleStudentCount < students.length ? (
        <Pressable
          onPress={() => setVisibleStudentCount((count) => count + STUDENT_PAGE_SIZE)}
          style={styles.templateButton}
          accessibilityRole="button"
          accessibilityLabel="Tampilkan siswa berikutnya di daftar kelas"
        >
          <Ionicons name="chevron-down-outline" size={20} color="#187F79" />
          <Text style={styles.templateText}>
            Tampilkan berikutnya (
            {Math.min(STUDENT_PAGE_SIZE, students.length - visibleStudentCount)})
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tambah siswa"
        onPress={() => setModalVisible(true)}
        style={({ pressed }) => [styles.addStudentButton, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Tambah siswa</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Promosi siswa secara massal"
        onPress={() => {
          const firstDestination = classes.find((item) => item.id !== selectedClassId)?.id ?? '';
          setPromotionAssignments(
            Object.fromEntries(students.map((student) => [student.id, firstDestination])),
          );
          setError('');
          setPromotionVisible(true);
        }}
        style={({ pressed }) => [styles.overrideButton, pressed && styles.pressed]}
      >
        <Ionicons name="arrow-up-circle-outline" size={21} color="#187F79" />
        <Text style={styles.overrideText}>Promosi semua siswa ke kelas lain</Text>
      </Pressable>
      {archivedStudents.length ? (
        <Pressable
          onPress={() => setShowArchived((value) => !value)}
          style={styles.archivedToggle}
          accessibilityRole="button"
          accessibilityLabel="Tampilkan siswa diarsipkan"
        >
          <Text style={styles.recapToggleText}>
            {showArchived
              ? 'Sembunyikan arsip'
              : `Tampilkan ${archivedStudents.length} siswa diarsipkan`}
          </Text>
        </Pressable>
      ) : null}
      {showArchived
        ? archivedStudents.map((student) => (
            <View key={student.id} style={styles.classStudentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{student.name.slice(0, 1)}</Text>
              </View>
              <Text style={[styles.studentName, styles.studentRowCopy]}>{student.name}</Text>
              <Pressable
                onPress={() => onRestoreStudent(student.id)}
                style={styles.restoreButton}
                accessibilityRole="button"
                accessibilityLabel={`Pulihkan ${student.name}`}
              >
                <Text style={styles.restoreText}>Pulihkan</Text>
              </Pressable>
            </View>
          ))
        : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Import siswa dari spreadsheet"
        onPress={onImportStudents}
        style={({ pressed }) => [styles.importButton, pressed && styles.pressed]}
      >
        <Ionicons name="cloud-upload-outline" size={22} color="#187F79" />
        <Text style={styles.importText}>Import spreadsheet</Text>
      </Pressable>
      <Pressable
        onPress={onDownloadTemplate}
        accessibilityRole="button"
        accessibilityLabel="Unduh template siswa spreadsheet"
        style={styles.templateButton}
      >
        <Ionicons name="download-outline" size={20} color="#687B91" />
        <Text style={styles.templateText}>Unduh template XLSX</Text>
      </Pressable>
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>{editingId ? 'Edit siswa' : 'Tambah siswa'}</Text>
            <Text style={styles.modalHint}>Data disimpan di perangkat ini.</Text>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Nama lengkap siswa"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Nama lengkap siswa"
            />
            <TextInput
              value={nis}
              onChangeText={setNis}
              placeholder="NIS (wajib untuk data baru)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              keyboardType="number-pad"
              accessibilityLabel="NIS siswa"
            />
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={submit} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent
        visible={promotionVisible}
        onRequestClose={() => setPromotionVisible(false)}
      >
        <View style={styles.modalScrimCenter}>
          <View style={styles.reasonCard}>
            <Text style={styles.screenTitle}>Promosi massal</Text>
            <Text style={styles.modalHint}>
              Petakan setiap siswa ke kelas tujuan. Histori kelas asal tetap tersimpan.
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {students.map((student) => (
                <View key={student.id} style={styles.promotionStudentRow}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <View style={styles.reasonGrid}>
                    {classes
                      .filter((item) => item.id !== selectedClassId)
                      .map((item) => (
                        <Pressable
                          key={`${student.id}-${item.id}`}
                          onPress={() =>
                            setPromotionAssignments((current) => ({
                              ...current,
                              [student.id]: item.id,
                            }))
                          }
                          style={[
                            styles.reasonButton,
                            promotionAssignments[student.id] === item.id && styles.classChipSelected,
                          ]}
                        >
                          <Text style={styles.reasonButtonText}>{item.name}</Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.modalHint}>
              {Object.values(promotionAssignments).filter(Boolean).length}/{students.length} siswa siap dipromosikan.
            </Text>
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPromotionVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void promoteAllStudents()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent
        visible={classModalVisible}
        onRequestClose={() => setClassModalVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>{editingClassId ? 'Edit kelas' : 'Tambah kelas'}</Text>
            <Text style={styles.modalHint}>Kelas baru akan tersimpan di perangkat ini.</Text>
            <TextInput
              value={className}
              onChangeText={setClassName}
              placeholder="Contoh: Kelas 2B"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Nama kelas"
            />
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Folder / grup (opsional)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Folder atau grup kelas"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setClassModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={saveClass} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ScheduleScreen({ db, classId }: { db: SQLiteDatabase; classId: string }) {
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof loadSchedules>>>([]);
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [exceptions, setExceptions] = useState<Awaited<ReturnType<typeof loadScheduleExceptions>>>(
    [],
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [extraMode, setExtraMode] = useState(false);
  const [holidayReasonVisible, setHolidayReasonVisible] = useState(false);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [bulkRows, setBulkRows] = useState(
    [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      enabled: false,
      title: '',
      startTime: `${String(7 + weekday).padStart(2, '0')}:00`,
      endTime: `${String(8 + weekday).padStart(2, '0')}:00`,
    })),
  );
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [rangeStart, setRangeStart] = useState(() => `${localDateKey().slice(0, 8)}01`);
  const [rangeEnd, setRangeEnd] = useState(() => `${localDateKey().slice(0, 8)}28`);
  const selectedDay = localWeekday(new Date(`${selectedDate}T12:00:00`));
  useEffect(() => {
    Promise.all([loadSchedules(db, classId), loadScheduleExceptions(db, classId, selectedDate)])
      .then(([rows, exceptionRows]) => {
        setSchedules(rows);
        setExceptions(exceptionRows);
      })
      .catch(() => {
        setSchedules([]);
        setExceptions([]);
      });
  }, [db, classId, selectedDate]);
  const visibleSchedules = applyScheduleExceptions(
    filterSchedulesForDay(schedules, selectedDay),
    getNationalHoliday(selectedDate) &&
      !exceptions.some((exception) => exception.kind === 'holiday') &&
      !exceptions.some(
        (exception) => exception.kind === 'extra' && exception.title === WORKDAY_OVERRIDE_TITLE,
      )
      ? [
          ...exceptions,
          {
            id: `national-${selectedDate}`,
            class_id: null,
            schedule_id: null,
            exception_date: selectedDate,
            kind: 'holiday' as const,
            title: getNationalHoliday(selectedDate)?.title ?? 'Libur nasional',
            start_time: null,
            end_time: null,
            note: 'Libur nasional otomatis',
          },
        ]
      : exceptions,
  );
  const nationalHoliday = getNationalHoliday(selectedDate);
  const workdayOverride = exceptions.some(
    (exception) => exception.kind === 'extra' && exception.title === WORKDAY_OVERRIDE_TITLE,
  );
  const holiday =
    exceptions.find((exception) => exception.kind === 'holiday') ??
    (workdayOverride ? null : nationalHoliday);
  const refreshSchedules = async () => {
    const [rows, exceptionRows] = await Promise.all([
      loadSchedules(db, classId),
      loadScheduleExceptions(db, classId, selectedDate),
    ]);
    setSchedules(rows);
    setExceptions(exceptionRows);
  };
  const saveSchedule = async () => {
    if (!title.trim() || !isScheduleRangeValid(startTime, endTime)) return;
    if (
      !extraMode &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd) ||
        rangeStart > rangeEnd)
    ) {
      Alert.alert('Rentang tanggal tidak valid', 'Gunakan format YYYY-MM-DD dan pastikan tanggal mulai sebelum selesai.');
      return;
    }
    if (extraMode) {
      const conflicts = await findScheduleConflicts(db, {
        weekday: selectedDay,
        startTime,
        endTime,
      });
      if (conflicts.length) {
        Alert.alert(
          'Kelas pengganti bentrok',
          `Waktu ini bertabrakan dengan ${conflicts
            .map((item) => `${item.class_name} · ${item.title}`)
            .join(', ')}. Pilih jam lain.`,
        );
        return;
      }
      await addScheduleException(db, {
        id: `schedule-extra-${Date.now()}`,
        class_id: classId,
        schedule_id: null,
        exception_date: selectedDate,
        kind: 'extra',
        title,
        start_time: startTime,
        end_time: endTime,
        note: 'Kelas pengganti pada tanggal tertentu',
      });
      await refreshSchedules();
      setTitle('');
      setExtraMode(false);
      setModalVisible(false);
      return;
    }
    const conflicts = await findScheduleConflicts(db, {
      id: editingId ?? undefined,
      weekday: selectedDay,
      startTime,
      endTime,
    });
    if (conflicts.length) {
      Alert.alert(
        'Jadwal bentrok',
        `Waktu ini bertabrakan dengan ${conflicts
          .map((item) => `${item.class_name} · ${item.title} (${item.start_time}–${item.end_time})`)
          .join(', ')}. Pilih jam lain sebelum menyimpan.`,
      );
      return;
    }
    if (editingId) {
      await updateSchedule(db, editingId, { title, weekday: selectedDay, startTime, endTime });
    } else {
      const scheduleId = `schedule-${Date.now()}`;
      await addSchedule(db, {
        id: scheduleId,
        classId,
        title,
        weekday: selectedDay,
        startTime,
        endTime,
      });
      await createScheduleTemplateAndSessions(db, {
        id: scheduleId,
        classId,
        title,
        weekday: selectedDay,
        startTime,
        endTime,
        startDate: rangeStart,
        endDate: rangeEnd,
      });
    }
    await refreshSchedules();
    setTitle('');
    setEditingId(null);
    setModalVisible(false);
  };
  const saveDateOverride = async () => {
    if (!editingId || !title.trim() || !isScheduleRangeValid(startTime, endTime)) return;
    const conflicts = await findScheduleConflicts(db, {
      id: editingId,
      weekday: selectedDay,
      startTime,
      endTime,
    });
    if (conflicts.length) {
      Alert.alert(
        'Perubahan tetap bentrok',
        `Jam baru bertabrakan dengan ${conflicts
          .map((item) => `${item.class_name} · ${item.title}`)
          .join(', ')}.`,
      );
      return;
    }
    await addScheduleException(db, {
      id: `schedule-exception-${Date.now()}`,
      class_id: classId,
      schedule_id: editingId,
      exception_date: selectedDate,
      kind: 'reschedule',
      title,
      start_time: startTime,
      end_time: endTime,
      note: 'Perubahan hanya untuk tanggal ini',
    });
    await refreshSchedules();
    setModalVisible(false);
  };
  const setHoliday = async (reason: string) => {
    await addScheduleException(db, {
      id: `holiday-${selectedDate}`,
      class_id: null,
      schedule_id: null,
      exception_date: selectedDate,
      kind: 'holiday',
      title: reason,
      start_time: null,
      end_time: null,
      note: reason,
    });
    await refreshSchedules();
  };
  const toggleHoliday = async () => {
    if (workdayOverride) {
      const override = exceptions.find(
        (exception) => exception.kind === 'extra' && exception.title === WORKDAY_OVERRIDE_TITLE,
      );
      if (override) await removeScheduleException(db, override.id);
    } else if (holiday && 'id' in holiday) await removeScheduleException(db, holiday.id);
    else if (holiday) {
      await addScheduleException(db, {
        id: `workday-${selectedDate}`,
        class_id: null,
        schedule_id: null,
        exception_date: selectedDate,
        kind: 'extra',
        title: WORKDAY_OVERRIDE_TITLE,
        start_time: null,
        end_time: null,
        note: 'Tetap masuk sekolah pada hari libur nasional',
      });
    } else {
      setHolidayReasonVisible(true);
      return;
    }
    await refreshSchedules();
  };
  const chooseHolidayReason = async (reason: string) => {
    setHolidayReasonVisible(false);
    await setHoliday(reason);
  };
  const openCreate = () => {
    setEditingId(null);
    setExtraMode(false);
    setTitle('');
    setStartTime('08:00');
    setEndTime('09:00');
    setRangeStart(`${selectedDate.slice(0, 8)}01`);
    setRangeEnd(`${selectedDate.slice(0, 8)}28`);
    setModalVisible(true);
  };
  const openExtra = () => {
    setEditingId(null);
    setExtraMode(true);
    setTitle('Kelas pengganti');
    setStartTime('08:00');
    setEndTime('09:00');
    setModalVisible(true);
  };
  const openBulk = () => {
    setBulkRows((current) =>
      current.map((row) => ({
        ...row,
        enabled: false,
        title: row.title || '',
      })),
    );
    setBulkVisible(true);
  };
  const saveBulk = async () => {
    const activeRows = bulkRows.filter((row) => row.enabled && row.title.trim());
    if (!activeRows.length) {
      Alert.alert('Jadwal belum dipilih', 'Aktifkan minimal satu hari dan isi nama pelajaran.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd) || rangeStart > rangeEnd) {
      Alert.alert('Rentang tanggal tidak valid', 'Gunakan format YYYY-MM-DD dan pastikan mulai sebelum selesai.');
      return;
    }
    for (const row of activeRows) {
      if (!isScheduleRangeValid(row.startTime, row.endTime)) {
        Alert.alert('Jam tidak valid', `Periksa jam ${['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][row.weekday]}.`);
        return;
      }
      const conflicts = await findScheduleConflicts(db, {
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
      });
      if (conflicts.length) {
        Alert.alert('Jadwal bentrok', `${row.title} bentrok dengan ${conflicts.map((item) => `${item.class_name} · ${item.title}`).join(', ')}.`);
        return;
      }
    }
    for (const row of activeRows) {
      const id = `schedule-${Date.now()}-${row.weekday}`;
      await addSchedule(db, { id, classId, title: row.title, weekday: row.weekday, startTime: row.startTime, endTime: row.endTime });
      await createScheduleTemplateAndSessions(db, { id, classId, title: row.title, weekday: row.weekday, startTime: row.startTime, endTime: row.endTime, startDate: rangeStart, endDate: rangeEnd });
    }
    await refreshSchedules();
    setBulkVisible(false);
    Alert.alert('Jadwal tersimpan', `${activeRows.length} jadwal mingguan dibuat sekaligus.`);
  };
  const openEdit = (item: Awaited<ReturnType<typeof loadSchedules>>[number]) => {
    setEditingId(item.id);
    setExtraMode(false);
    setTitle(item.title);
    setStartTime(item.start_time);
    setEndTime(item.end_time);
    setSelectedDate(
      shiftDate(selectedDate, item.weekday - localWeekday(new Date(`${selectedDate}T12:00:00`))),
    );
    setModalVisible(true);
  };
  const removeSchedule = async (id: string) => {
    await archiveSchedule(db, id);
    await refreshSchedules();
  };
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Jadwal</Text>
      <Text style={styles.date}>Atur ritme pembelajaran kelas secara offline</Text>
      <View style={styles.dayRow}>
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum'].map((day, index) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`Pilih ${day}`}
            onPress={() => setSelectedDate(shiftDate(selectedDate, index + 1 - selectedDay))}
            style={[styles.dayChip, selectedDay === index + 1 && styles.dayChipSelected]}
          >
            <Text
              style={[styles.dayChipText, selectedDay === index + 1 && styles.dayChipTextSelected]}
            >
              {day}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.scheduleDateToolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hari jadwal sebelumnya"
          onPress={() => setSelectedDate(shiftDate(selectedDate, -1))}
          style={({ pressed }) => [styles.dateStepButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color="#24354D" />
        </Pressable>
        <View style={styles.scheduleDateCopy}>
          <Text style={styles.sectionTitle}>
            {localLongDate(new Date(`${selectedDate}T12:00:00`)).replace(/\s+\d{4}$/, '')}
          </Text>
          <Text style={styles.selectedDateHint}>
            {holiday
              ? 'Hari libur — jadwal dinonaktifkan'
              : workdayOverride
                ? 'Hari belajar khusus — override libur nasional'
                : 'Jadwal rutin dapat diganti untuk tanggal ini'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hari jadwal berikutnya"
          onPress={() => setSelectedDate(shiftDate(selectedDate, 1))}
          style={({ pressed }) => [styles.dateStepButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-forward" size={20} color="#24354D" />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          workdayOverride
            ? 'Batalkan hari belajar khusus'
            : holiday
              ? 'Batalkan status hari libur'
              : 'Tandai tanggal sebagai hari libur'
        }
        onPress={toggleHoliday}
        style={({ pressed }) => [
          styles.holidayButton,
          (holiday || workdayOverride) && styles.holidayButtonActive,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={holiday || workdayOverride ? 'sunny' : 'calendar-clear-outline'}
          size={20}
          color={holiday || workdayOverride ? '#FFFFFF' : '#C36F0C'}
        />
        <Text
          style={[
            styles.holidayButtonText,
            (holiday || workdayOverride) && styles.holidayButtonTextActive,
          ]}
        >
          {workdayOverride
            ? 'Batalkan hari belajar khusus'
            : holiday
              ? 'Jadikan hari belajar'
              : 'Tandai sebagai hari libur'}
        </Text>
      </Pressable>
      {holiday ? (
        <View style={styles.emptyCard}>
          <Ionicons name="sunny-outline" size={34} color="#E58A23" />
          <Text style={styles.emptyTitle}>Hari libur</Text>
          <Text style={styles.placeholderText}>Jadwal rutin tidak berjalan pada tanggal ini.</Text>
        </View>
      ) : visibleSchedules.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={34} color="#FF795C" />
          <Text style={styles.emptyTitle}>Belum ada jadwal</Text>
          <Text style={styles.placeholderText}>Tambahkan pelajaran untuk hari ini.</Text>
        </View>
      ) : (
        visibleSchedules.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => openEdit(item)}
            style={styles.scheduleCard}
            accessibilityLabel={`Edit jadwal ${item.title}`}
          >
            <View style={styles.scheduleTime}>
              <Ionicons name="time-outline" size={22} color="#187F79" />
              <Text style={styles.scheduleTimeText}>{item.start_time}</Text>
            </View>
            <Text style={styles.scheduleTitle}>{item.title}</Text>
            <Text style={styles.quickSubtitle}>{item.end_time}</Text>
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                removeSchedule(item.id);
              }}
              accessibilityLabel={`Arsipkan jadwal ${item.title}`}
              style={styles.smallIconButton}
            >
              <Ionicons name="archive-outline" size={20} color="#687B91" />
            </Pressable>
          </Pressable>
        ))
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tambah jadwal"
        onPress={openCreate}
        style={({ pressed }) => [styles.addStudentButton, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Tambah jadwal</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tambah jadwal satu minggu sekaligus"
        onPress={openBulk}
        style={({ pressed }) => [styles.overrideButton, pressed && styles.pressed]}
      >
        <Ionicons name="layers-outline" size={20} color="#187F79" />
        <Text style={styles.overrideText}>Isi jadwal satu minggu sekaligus</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tambah kelas pengganti pada tanggal ini"
        onPress={openExtra}
        style={({ pressed }) => [styles.overrideButton, pressed && styles.pressed]}
      >
        <Ionicons name="swap-horizontal-outline" size={20} color="#187F79" />
        <Text style={styles.overrideText}>Tambah kelas pengganti tanggal ini</Text>
      </Pressable>
      <Modal
        animationType="fade"
        transparent
        visible={holidayReasonVisible}
        onRequestClose={() => setHolidayReasonVisible(false)}
      >
        <View style={styles.modalScrimCenter}>
          <View style={styles.reasonCard}>
            <Text style={styles.screenTitle}>Alasan hari libur</Text>
            <Text style={styles.modalHint}>
              Pilih alasan agar guru lain memahami perubahan agenda.
            </Text>
            <View style={styles.reasonGrid}>
              {['Tanggal merah', 'Libur sekolah', 'Rapat guru', 'Kegiatan khusus'].map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => void chooseHolidayReason(reason)}
                  style={({ pressed }) => [styles.reasonButton, pressed && styles.pressed]}
                >
                  <Text style={styles.reasonButtonText}>{reason}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setHolidayReasonVisible(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" transparent visible={bulkVisible} onRequestClose={() => setBulkVisible(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Jadwal satu minggu</Text>
            <Text style={styles.modalHint}>Centang hari yang aktif, lalu isi pelajaran dan jamnya. Sesi dibuat untuk seluruh rentang tanggal.</Text>
            <View style={styles.scheduleInputRow}>
              <TextInput value={rangeStart} onChangeText={setRangeStart} placeholder="Mulai YYYY-MM-DD" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel="Tanggal mulai jadwal mingguan" />
              <TextInput value={rangeEnd} onChangeText={setRangeEnd} placeholder="Selesai YYYY-MM-DD" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel="Tanggal selesai jadwal mingguan" />
            </View>
            <ScrollView style={{ maxHeight: 390 }}>
              {bulkRows.map((row) => (
                <View key={row.weekday} style={styles.bulkScheduleRow}>
                  <Pressable onPress={() => setBulkRows((current) => current.map((item) => item.weekday === row.weekday ? { ...item, enabled: !item.enabled } : item))} style={styles.bulkDayToggle} accessibilityRole="checkbox" accessibilityState={{ checked: row.enabled }}>
                    <Ionicons name={row.enabled ? 'checkbox' : 'square-outline'} size={22} color={row.enabled ? '#187F79' : '#687B91'} />
                    <Text style={styles.studentName}>{['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][row.weekday]}</Text>
                  </Pressable>
                  <TextInput value={row.title} onChangeText={(value) => setBulkRows((current) => current.map((item) => item.weekday === row.weekday ? { ...item, title: value } : item))} placeholder="Mata pelajaran" placeholderTextColor="#8A9AAF" style={styles.textInput} accessibilityLabel={`Mata pelajaran ${row.weekday}`} />
                  <View style={styles.scheduleInputRow}>
                    <TextInput value={row.startTime} onChangeText={(value) => setBulkRows((current) => current.map((item) => item.weekday === row.weekday ? { ...item, startTime: value } : item))} placeholder="Mulai" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel={`Jam mulai ${row.weekday}`} />
                    <TextInput value={row.endTime} onChangeText={(value) => setBulkRows((current) => current.map((item) => item.weekday === row.weekday ? { ...item, endTime: value } : item))} placeholder="Selesai" placeholderTextColor="#8A9AAF" style={styles.textInputHalf} accessibilityLabel={`Jam selesai ${row.weekday}`} />
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setBulkVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Batal</Text></Pressable>
              <Pressable onPress={() => void saveBulk()} style={styles.confirmButton}><Text style={styles.confirmText}>Simpan semua</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>
              {extraMode ? 'Tambah kelas pengganti' : editingId ? 'Edit jadwal' : 'Tambah jadwal'}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Nama pelajaran"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Nama pelajaran"
            />
            <View style={styles.scheduleInputRow}>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="08:00"
                placeholderTextColor="#8A9AAF"
                style={styles.textInputHalf}
                accessibilityLabel="Jam mulai"
              />
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="09:00"
                placeholderTextColor="#8A9AAF"
                style={styles.textInputHalf}
                accessibilityLabel="Jam selesai"
              />
            </View>
            {!editingId && !extraMode ? (
              <View style={styles.scheduleInputRow}>
                <TextInput
                  value={rangeStart}
                  onChangeText={setRangeStart}
                  placeholder="Mulai YYYY-MM-DD"
                  placeholderTextColor="#8A9AAF"
                  style={styles.textInputHalf}
                  accessibilityLabel="Tanggal mulai jadwal berulang"
                />
                <TextInput
                  value={rangeEnd}
                  onChangeText={setRangeEnd}
                  placeholder="Selesai YYYY-MM-DD"
                  placeholderTextColor="#8A9AAF"
                  style={styles.textInputHalf}
                  accessibilityLabel="Tanggal selesai jadwal berulang"
                />
              </View>
            ) : null}
            <Text style={styles.modalHint}>
              Hari aktif:{' '}
              {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][selectedDay - 1] ?? 'Kamis'} · sesi
              dibuat dari rentang tanggal
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={saveSchedule} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
            {editingId && !extraMode ? (
              <Pressable onPress={saveDateOverride} style={styles.overrideButton}>
                <Text style={styles.overrideText}>Simpan hanya tanggal ini</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ReportScreen({
  db,
  classId,
  className,
  students,
  onRestoreComplete,
}: {
  db: SQLiteDatabase;
  classId: string;
  className: string;
  students: Student[];
  onRestoreComplete: () => Promise<void>;
}) {
  const [kind, setKind] = useState<'attendance' | 'students' | 'grades' | 'journals'>('attendance');
  const [reportStudentId, setReportStudentId] = useState('all');
  const [period, setPeriod] = useState<AttendancePeriod>('day');
  const [customStart, setCustomStart] = useState(shiftDate(localDateKey(), -6));
  const [customEnd, setCustomEnd] = useState(localDateKey());
  const [message, setMessage] = useState('');
  const [reportComponents, setReportComponents] = useState<
    Awaited<ReturnType<typeof loadGradeComponents>>
  >([]);
  const [reportScores, setReportScores] = useState<Record<string, string>>({});
  const [reportScoreNotes, setReportScoreNotes] = useState<Record<string, string>>({});
  const [reportAttendance, setReportAttendance] = useState<
    Awaited<ReturnType<typeof loadAttendanceStudentRecap>>
  >([]);
  const [reportAttendanceSummary, setReportAttendanceSummary] = useState<
    Awaited<ReturnType<typeof loadAttendanceRecap>>
  >([]);
  const [includeAccumulation, setIncludeAccumulation] = useState(false);
  const [reportNote, setReportNote] = useState('');
  const [attendanceAccumulation, setAttendanceAccumulation] = useState<
    Awaited<ReturnType<typeof loadAttendanceAccumulation>>
  >([]);
  const [journalContent, setJournalContent] = useState('');
  const [reportAgendas, setReportAgendas] = useState<Awaited<ReturnType<typeof loadAgendas>>>([]);
  const periodLabel =
    period === 'day'
      ? 'Hari ini'
      : period === 'week'
        ? 'Minggu ini'
        : period === 'month'
          ? 'Bulan ini'
          : period === 'custom'
            ? `${customStart} s.d. ${customEnd}`
            : 'Semester ini';
  const today = new Date();
  const periodStamp =
    period === 'day'
      ? localDateKey(today)
      : period === 'month'
        ? localDateKey(today).slice(0, 7)
        : String(today.getFullYear());
  const reportStudents = students
    .filter((student) => reportStudentId === 'all' || student.id === reportStudentId)
    .map((student) => ({
      ...student,
      status: reportAttendance.find((item) => item.id === student.id)?.status ?? student.status,
    }));
  const present = reportAttendanceSummary.find((item) => item.status === 'Hadir')?.total ?? 0;
  useEffect(() => {
    Promise.all([
      loadAttendanceStudentRecap(db, classId, period, localDateKey(), customStart, customEnd),
      loadAttendanceRecap(db, classId, period, localDateKey(), customStart, customEnd),
    ])
      .then(([studentRows, summaryRows]) => {
        setReportAttendance(studentRows);
        setReportAttendanceSummary(summaryRows);
      })
      .catch(() => {
        setReportAttendance([]);
        setReportAttendanceSummary([]);
      });
  }, [classId, customEnd, customStart, db, period]);
  useEffect(() => {
    const today = new Date();
    const start = localDateKey(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    const end = localDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12));
    loadAttendanceAccumulation(db, classId, start, end)
      .then(setAttendanceAccumulation)
      .catch(() => setAttendanceAccumulation([]));
  }, [classId, db]);
  useEffect(() => {
    loadGradeComponents(db, classId)
      .then(async (components) => {
        setReportComponents(components);
        if (components[0]) {
          const scores = await loadScores(db, components[0].id);
          setReportScores(
            Object.fromEntries(scores.map((row) => [row.student_id, String(row.score ?? '—')])),
          );
          setReportScoreNotes(
            Object.fromEntries(scores.map((row) => [row.student_id, row.note ?? ''])),
          );
        }
      })
      .catch(() => undefined);
    loadJournal(db, classId)
      .then((row) => setJournalContent(row?.content ?? ''))
      .catch(() => undefined);
    loadAgendas(db, classId)
      .then(setReportAgendas)
      .catch(() => setReportAgendas([]));
  }, [classId, db]);
  const shareIfAvailable = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    } else {
      setMessage(`File tersimpan di ${uri}`);
    }
  };
  const exportExcel = async () => {
    try {
      const rows =
        kind === 'attendance'
          ? includeAccumulation
            ? attendanceAccumulation.map((student, index) => ({
                No: index + 1,
                Siswa: student.name,
                NIS: student.nis ?? 'Belum diisi',
                Hadir: student.hadir,
                Sakit: student.sakit,
                Izin: student.izin,
                Alpa: student.alpa,
                Terlambat: student.terlambat,
              }))
            : reportStudents.map((student, index) => ({
                No: index + 1,
                Siswa: student.name,
                NIS: student.nis ?? 'Belum diisi',
                Status: student.status,
              }))
          : kind === 'students'
            ? reportStudents.map((student, index) => ({
                No: index + 1,
                Siswa: student.name,
                NIS: student.nis ?? 'Belum diisi',
                Kelas: className,
              }))
            : kind === 'grades'
              ? reportStudents.map((student, index) => ({
                  No: index + 1,
                  Siswa: student.name,
                  NIS: student.nis ?? 'Belum diisi',
                  Nilai: reportScores[student.id] ?? '—',
                  Catatan: reportScoreNotes[student.id] ?? '',
                  Komponen: reportComponents[0]?.name ?? '—',
                }))
              : [
                  {
                    Tanggal: localLongDate(),
                    Kelas: className,
                    Jurnal: journalContent || 'Belum diisi',
                    Agenda:
                      reportAgendas
                        .map((agenda) => `${agenda.completed_at ? '✓' : '○'} ${agenda.title}`)
                        .join(' | ') || 'Tidak ada agenda',
                  },
                ];
      const workbook = createReportWorkbook(
        kind === 'attendance'
          ? 'Absensi'
          : kind === 'students'
            ? 'Siswa'
            : kind === 'grades'
              ? 'Nilai'
              : 'Jurnal',
        rows,
      );
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const safeClassName = className.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');
      const file = new File(
        Paths.document,
        `kelasrapi-${safeClassName}-${kind}-${periodStamp}.xlsx`,
      );
      await file.write(base64, { encoding: 'base64' });
      await shareIfAvailable(file.uri);
      setMessage('Excel berhasil dibuat.');
    } catch (error) {
      setMessage('Excel gagal dibuat. Data laporan tetap aman, silakan coba lagi.');
      Alert.alert('Ekspor gagal', String(error));
    }
  };
  const exportPdf = async () => {
    try {
      const title =
        kind === 'attendance'
          ? `Laporan Absensi ${className}`
          : kind === 'students'
            ? `Data Siswa ${className}`
            : kind === 'grades'
              ? `Laporan Nilai ${className}`
              : `Jurnal ${className}`;
      const html = buildReportHtml({
        title,
        period: periodLabel,
        headers: [
          'Siswa',
          'NIS',
          kind === 'attendance' ? 'Status' : kind === 'students' ? 'Kelas' : 'Nilai',
          ...(kind === 'grades' ? ['Catatan'] : []),
        ],
        rows: reportStudents.map((student) => [
          student.name,
          student.nis ?? 'Belum diisi',
          kind === 'attendance'
            ? student.status
            : kind === 'students'
              ? className
              : (reportScores[student.id] ?? '—'),
          ...(kind === 'grades' ? [reportScoreNotes[student.id] ?? ''] : []),
        ]),
        summary:
          kind === 'attendance'
            ? period === 'day'
              ? `${present} dari ${students.length} siswa berstatus Hadir pada ringkasan periode ini.`
              : `${present} catatan kehadiran berstatus Hadir pada ringkasan periode ini.`
            : `${reportStudents.length} siswa tercatat dalam laporan ${periodLabel.toLocaleLowerCase()}.`,
        extraHtml:
          [
            kind === 'journals'
              ? `<p>${journalContent || 'Jurnal belum diisi.'}</p><h2>Agenda</h2><ul>${reportAgendas.map((agenda) => `<li>${agenda.completed_at ? 'Selesai: ' : 'Belum: '}${agenda.title}${agenda.note ? ` — ${agenda.note}` : ''}</li>`).join('')}</ul>`
              : '',
            includeAccumulation ? buildAttendanceAccumulationHtml(attendanceAccumulation) : '',
            `<section style="margin-top:24px"><p><strong>Catatan:</strong> ${reportNote.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character)) || '—'}</p><div style="display:flex;justify-content:space-between;margin-top:36px"><span>Mengetahui,</span><span>Guru pengampu</span></div><div style="display:flex;justify-content:space-between;margin-top:48px"><span>(________________)</span><span>(________________)</span></div></section>`,
          ].join('') || undefined,
      });
      await Print.printAsync({ html });
      setMessage('Dialog cetak PDF dibuka. Pilih “Simpan sebagai PDF” untuk menyimpan laporan.');
    } catch (error) {
      setMessage('PDF gagal dibuat. Data laporan tetap aman, silakan coba lagi.');
      Alert.alert('Ekspor gagal', String(error));
    }
  };
  const createLocalBackup = async () => {
    try {
      const payload = await createBackupPayload(db);
      const stamp = payload.createdAt.replace(/[:.]/g, '-');
      const file = new File(Paths.document, `kelasrapi-backup-${stamp}.json`);
      await file.write(JSON.stringify(payload, null, 2));
      const verified = JSON.parse(await file.text());
      if (!validateBackupPayload(verified)) throw new Error('Verifikasi checksum backup gagal.');
      await db.runAsync(
        'INSERT INTO backups (id, schema_version, file_path, integrity_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        `backup-${Date.now()}`,
        payload.schemaVersion,
        file.uri,
        payload.integrity,
        payload.createdAt,
      );
      setMessage(
        `Backup lokal siap (${(file.size ?? 0) / 1024 < 1 ? '<1' : Math.round((file.size ?? 0) / 1024)} KB): ${file.uri}`,
      );
      await shareIfAvailable(file.uri);
    } catch (error) {
      setMessage('Backup gagal dibuat. Data lokal tetap aman.');
      Alert.alert('Backup gagal', String(error));
    }
  };
  const restoreLocalBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: 'application/json',
      });
      if (result.canceled) return;
      const selected = result.assets[0];
      assertLocalFileUri(selected.uri);
      const response = await fetch(selected.uri);
      if (!response.ok) throw new Error(`File tidak dapat dibaca (HTTP ${response.status}).`);
      const payload = JSON.parse(await response.text());
      if (!validateBackupPayload(payload)) {
        Alert.alert(
          'Backup ditolak',
          'File tidak valid, rusak, atau dibuat oleh versi yang tidak didukung.',
        );
        return;
      }
      const scope = Object.entries(payload.data)
        .filter(([table]) => table !== 'backups')
        .reduce((total, [, rows]) => total + rows.length, 0);
      const affected = Object.entries(payload.data)
        .filter(([table, rows]) => table !== 'backups' && rows.length > 0)
        .map(([table, rows]) => `${table}: ${rows.length}`)
        .join(' · ');
      Alert.alert(
        'Pulihkan backup?',
        `${scope} baris data lokal akan menggantikan data saat ini.\n\n${affected || 'Tidak ada data inti.'}\n\nBackup dibuat ${new Date(payload.createdAt).toLocaleString('id-ID')}.`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Pulihkan',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackupPayload(db, payload);
                await onRestoreComplete();
                setMessage(
                  'Backup berhasil dipulihkan. Data lokal sudah diganti sesuai pratinjau.',
                );
              } catch (error) {
                setMessage('Restore gagal. Data saat ini tidak diubah.');
                Alert.alert('Restore gagal', String(error));
              }
            },
          },
        ],
      );
    } catch (error) {
      setMessage('Restore gagal. Data saat ini tidak diubah.');
      Alert.alert('Restore gagal', String(error));
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Laporan</Text>
      <Text style={styles.date}>Pilih data lokal yang ingin dibagikan atau dicetak</Text>
      <View style={styles.reportSummary}>
        <Ionicons name="analytics-outline" size={34} color="#FF795C" />
        <View style={styles.alertCopy}>
          <Text style={styles.alertTitle}>
            {kind === 'attendance'
              ? period === 'day'
                ? `${present}/${students.length} siswa hadir`
                : `${present} catatan hadir`
              : kind === 'students'
                ? `${students.length} siswa terdaftar`
                : kind === 'grades'
                  ? `${reportComponents.length} komponen nilai`
                  : journalContent
                    ? 'Jurnal sudah diisi'
                    : 'Jurnal belum diisi'}
          </Text>
          <Text style={styles.alertSubtitle}>
            {className} · {periodLabel}
          </Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Jenis laporan</Text>
      <View style={styles.reportOptions}>
        <Pressable
          onPress={() => setKind('attendance')}
          style={[styles.reportOption, kind === 'attendance' && styles.reportOptionSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: kind === 'attendance' }}
          accessibilityLabel="Laporan absensi"
        >
          <Ionicons
            name="calendar-outline"
            size={24}
            color={kind === 'attendance' ? '#FF795C' : '#687B91'}
          />
          <Text style={styles.reportOptionText}>Absensi</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('students')}
          style={[styles.reportOption, kind === 'students' && styles.reportOptionSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: kind === 'students' }}
          accessibilityLabel="Laporan data siswa"
        >
          <Ionicons
            name="people-outline"
            size={24}
            color={kind === 'students' ? '#FF795C' : '#687B91'}
          />
          <Text style={styles.reportOptionText}>Data siswa</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('grades')}
          style={[styles.reportOption, kind === 'grades' && styles.reportOptionSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: kind === 'grades' }}
          accessibilityLabel="Laporan nilai"
        >
          <Ionicons
            name="stats-chart-outline"
            size={24}
            color={kind === 'grades' ? '#FF795C' : '#687B91'}
          />
          <Text style={styles.reportOptionText}>Nilai</Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('journals')}
          style={[styles.reportOption, kind === 'journals' && styles.reportOptionSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: kind === 'journals' }}
          accessibilityLabel="Laporan jurnal"
        >
          <Ionicons
            name="book-outline"
            size={24}
            color={kind === 'journals' ? '#FF795C' : '#687B91'}
          />
          <Text style={styles.reportOptionText}>Jurnal</Text>
        </Pressable>
      </View>
      <Text style={styles.sectionTitle}>Filter siswa</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classPickerRow}>
        <Pressable
          onPress={() => setReportStudentId('all')}
          style={[styles.classPickerChip, reportStudentId === 'all' && styles.classPickerChipSelected]}
          accessibilityRole="radio"
          accessibilityState={{ selected: reportStudentId === 'all' }}
        >
          <Text style={[styles.classPickerText, reportStudentId === 'all' && styles.classPickerTextSelected]}>Semua siswa</Text>
        </Pressable>
        {students.map((student) => (
          <Pressable
            key={student.id}
            onPress={() => setReportStudentId(student.id)}
            style={[styles.classPickerChip, reportStudentId === student.id && styles.classPickerChipSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: reportStudentId === student.id }}
            accessibilityLabel={`Filter laporan ${student.name}`}
          >
            <Text style={[styles.classPickerText, reportStudentId === student.id && styles.classPickerTextSelected]}>{student.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.sectionTitle}>Periode laporan</Text>
      <View style={styles.recapPeriodRow}>
        {(['day', 'week', 'month', 'custom'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setPeriod(item)}
            style={[styles.recapPeriod, period === item && styles.recapPeriodSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: period === item }}
            accessibilityLabel={`Periode ${item === 'day' ? 'hari ini' : item === 'week' ? 'minggu ini' : item === 'month' ? 'bulan ini' : 'custom'}`}
          >
            <Text
              style={[styles.recapPeriodText, period === item && styles.recapPeriodTextSelected]}
            >
              {item === 'day'
                ? 'Hari ini'
                : item === 'week'
                  ? 'Minggu'
                  : item === 'month'
                    ? 'Bulan'
                    : 'Custom'}
            </Text>
          </Pressable>
        ))}
      </View>
      {period === 'custom' ? (
        <View style={styles.customRangeRow}>
          <TextInput
            value={customStart}
            onChangeText={setCustomStart}
            placeholder="Mulai YYYY-MM-DD"
            placeholderTextColor="#8A9AAF"
            style={styles.customRangeInput}
            accessibilityLabel="Tanggal mulai laporan custom"
          />
          <TextInput
            value={customEnd}
            onChangeText={setCustomEnd}
            placeholder="Selesai YYYY-MM-DD"
            placeholderTextColor="#8A9AAF"
            style={styles.customRangeInput}
            accessibilityLabel="Tanggal selesai laporan custom"
          />
        </View>
      ) : null}
      <Pressable
        onPress={() => setIncludeAccumulation((current) => !current)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: includeAccumulation }}
        style={styles.reportCheckRow}
      >
        <Ionicons
          name={includeAccumulation ? 'checkbox' : 'square-outline'}
          size={23}
          color={includeAccumulation ? '#187F79' : '#687B91'}
        />
        <View style={styles.alertCopy}>
          <Text style={styles.reportCheckText}>Sertakan kesimpulan & rekap akumulasi</Text>
          <Text style={styles.fieldHelp}>
            Menampilkan rekap bulan berjalan dan 5 siswa teratas per kategori.
          </Text>
        </View>
      </Pressable>
      <TextInput
        value={reportNote}
        onChangeText={setReportNote}
        placeholder="Catatan laporan / kesimpulan (opsional)"
        placeholderTextColor="#8A9AAF"
        style={styles.textInput}
        accessibilityLabel="Catatan laporan atau kesimpulan"
      />
      <View style={styles.reportPreview}>
        <Text style={styles.alertTitle}>Preview · {periodLabel}</Text>
        {kind === 'journals' ? (
          <View>
            <Text style={styles.quickSubtitle}>{journalContent || 'Jurnal belum diisi.'}</Text>
            {reportAgendas.slice(0, 3).map((agenda) => (
              <Text key={agenda.id} style={styles.quickSubtitle}>
                {agenda.completed_at ? '✓' : '○'} {agenda.title}
              </Text>
            ))}
          </View>
        ) : reportStudents.length ? (
          reportStudents.slice(0, 4).map((student) => (
            <View key={student.id} style={styles.previewRow}>
              <Text style={styles.quickSubtitle}>{student.name}</Text>
              <Text style={styles.previewStatus}>
                {kind === 'attendance' ? student.status : className}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.placeholderText}>Belum ada data untuk kelas dan periode ini.</Text>
        )}
        {reportStudents.length > 4 ? (
          <Text style={styles.quickSubtitle}>
            Menampilkan 1–4 dari {reportStudents.length} siswa
          </Text>
        ) : null}
      </View>
      {kind === 'attendance' && includeAccumulation ? (
        <View style={styles.accumulationPreview}>
          <Text style={styles.alertTitle}>Rekap per siswa · bulan berjalan</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.accumulationHeaderRow}>
                {['Siswa', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Telat'].map((label) => (
                  <Text key={label} style={styles.accumulationHeaderCell}>
                    {label}
                  </Text>
                ))}
              </View>
              {attendanceAccumulation.length ? (
                attendanceAccumulation.map((student) => (
                  <View key={student.id} style={styles.accumulationRow}>
                    <Text style={[styles.accumulationCell, styles.accumulationNameCell]}>
                      {student.name}
                    </Text>
                    <Text style={styles.accumulationCell}>{student.hadir}</Text>
                    <Text style={styles.accumulationCell}>{student.sakit}</Text>
                    <Text style={styles.accumulationCell}>{student.izin}</Text>
                    <Text style={styles.accumulationCell}>{student.alpa}</Text>
                    <Text style={styles.accumulationCell}>{student.terlambat}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.placeholderText}>Belum ada catatan akumulasi.</Text>
              )}
            </View>
          </ScrollView>
          <Text style={styles.fieldHelp}>
            Excel dan PDF juga menyertakan tabel ini saat opsi rekap dicentang.
          </Text>
        </View>
      ) : null}
      <View style={styles.exportRow}>
        <Pressable
          onPress={exportExcel}
          style={styles.exportButton}
          accessibilityRole="button"
          accessibilityLabel="Ekspor laporan ke Excel"
        >
          <Ionicons name="grid-outline" size={20} color="#187F79" />
          <Text style={styles.exportText}>Excel</Text>
        </Pressable>
        <Pressable
          onPress={exportPdf}
          style={styles.exportButton}
          accessibilityRole="button"
          accessibilityLabel="Ekspor laporan ke PDF"
        >
          <Ionicons name="document-outline" size={20} color="#FF795C" />
          <Text style={styles.exportText}>PDF</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.exportMessage}>{message}</Text> : null}
      <Text style={styles.sectionTitle}>Backup lokal</Text>
      <Text style={styles.date}>
        Tanpa Firebase, Google Drive, atau login. Pilih sendiri lokasi berbagi file.
      </Text>
      <View style={styles.exportRow}>
        <Pressable
          onPress={createLocalBackup}
          style={styles.exportButton}
          accessibilityLabel="Buat backup lokal"
        >
          <Ionicons name="archive-outline" size={20} color="#187F79" />
          <Text style={styles.exportText}>Buat backup</Text>
        </Pressable>
        <Pressable
          onPress={restoreLocalBackup}
          style={styles.exportButton}
          accessibilityLabel="Pulihkan backup lokal"
        >
          <Ionicons name="refresh-outline" size={20} color="#FF795C" />
          <Text style={styles.exportText}>Pulihkan</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function JournalScreen({
  db,
  classId,
  className,
  onDirtyChange,
  onRegisterSave,
}: {
  db: SQLiteDatabase;
  classId: string;
  className: string;
  onDirtyChange: (dirty: boolean) => void;
  onRegisterSave: (save: () => Promise<void>) => void;
}) {
  const [showGuide, setShowGuide] = useState(true);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [journalState, setJournalState] = useState<'draft' | 'submitted'>('draft');
  const [todaySessionId, setTodaySessionId] = useState<string | null>(null);
  const [agendas, setAgendas] = useState<Awaited<ReturnType<typeof loadAgendas>>>([]);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaNote, setAgendaNote] = useState('');
  const [agendaModalVisible, setAgendaModalVisible] = useState(false);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([
      loadJournal(db, classId),
      loadTeachingSessions(db, localDateKey(), classId),
    ])
      .then(async ([row, sessions]) => {
        const sessionId = sessions[0]?.id ?? null;
        setTodaySessionId(sessionId);
        const sessionJournal = sessionId ? await loadLessonJournal(db, sessionId) : null;
        const nextContent = sessionJournal?.material || row?.content || '';
        const nextState = sessionJournal?.state === 'submitted' || row?.state === 'submitted' ? 'submitted' : 'draft';
        setContent(nextContent);
        setJournalState(nextState);
        setSaved(Boolean(nextContent && nextState === 'submitted'));
        onDirtyChange(Boolean(nextContent && nextState === 'draft'));
      })
      .catch(() => undefined);
    loadAgendas(db, classId)
      .then(setAgendas)
      .catch(() => setAgendas([]));
  }, [classId, db]);
  useEffect(() => {
    if (!content.trim() || journalState === 'submitted') return;
    const timer = setTimeout(() => {
      Promise.all([
        saveJournal(db, classId, localDateKey(), content, 'draft'),
        todaySessionId ? saveLessonJournal(db, todaySessionId, content, 'draft') : Promise.resolve(),
      ])
        .then(() => setSaved(true))
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(timer);
  }, [classId, content, db, journalState, todaySessionId]);
  const submit = async () => {
    if (!content.trim()) return;
    await saveJournal(db, classId, localDateKey(), content);
    if (todaySessionId) await saveLessonJournal(db, todaySessionId, content);
    setSaved(true);
    setJournalState('submitted');
    onDirtyChange(false);
  };
  const saveDraft = async () => {
    if (content.trim()) {
      await saveJournal(db, classId, localDateKey(), content, 'draft');
      if (todaySessionId) await saveLessonJournal(db, todaySessionId, content, 'draft');
    }
  };
  useEffect(() => {
    onRegisterSave(saveDraft);
  }, [classId, content, db, onRegisterSave]);
  const addNextAgenda = async () => {
    if (!agendaTitle.trim()) return;
    if (editingAgendaId) await updateAgenda(db, editingAgendaId, agendaTitle, agendaNote);
    else await addAgenda(db, classId, agendaTitle, agendaNote);
    setAgendaTitle('');
    setAgendaNote('');
    setEditingAgendaId(null);
    setAgendaModalVisible(false);
    setAgendas(await loadAgendas(db));
  };
  const openAgendaEditor = (agenda?: (typeof agendas)[number]) => {
    setEditingAgendaId(agenda?.id ?? null);
    setAgendaTitle(agenda?.title ?? '');
    setAgendaNote(agenda?.note ?? '');
    setAgendaModalVisible(true);
  };
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Jurnal pembelajaran</Text>
      <Text style={styles.date}>
        {className} · {localLongDate()}
      </Text>
      {showGuide ? (
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>Panduan jurnal</Text>
          <Text style={styles.helpText}>
            Tulis kegiatan hari ini. Draft tersimpan otomatis; tekan Simpan jurnal saat isinya siap
            dibagikan ke laporan.
          </Text>
          <Pressable onPress={() => setShowGuide(false)} accessibilityLabel="Tutup panduan jurnal">
            <Text style={styles.guideDismiss}>Tutup panduan</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.journalCard}>
        <Ionicons name="book-outline" size={30} color="#FF795C" />
        <Text style={styles.alertTitle}>Catatan kegiatan hari ini</Text>
        <TextInput
          value={content}
          onChangeText={(value) => {
            setContent(value);
            setSaved(false);
            setJournalState('draft');
            onDirtyChange(true);
          }}
          multiline
          textAlignVertical="top"
          placeholder="Tulis materi, kegiatan, dan catatan penting..."
          placeholderTextColor="#8A9AAF"
          style={styles.journalInput}
          accessibilityLabel="Isi jurnal pembelajaran"
        />
      </View>
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
      >
        <LinearGradient colors={[activePalette.accent, '#FF6F59']} style={styles.saveGradient}>
          <Text style={styles.saveButtonText}>{saved ? 'Jurnal tersimpan' : 'Simpan jurnal'}</Text>
        </LinearGradient>
      </Pressable>
      <Text style={styles.draftText}>
        {journalState === 'submitted'
          ? 'Jurnal tersimpan lokal dan dapat dilengkapi saat offline.'
          : saved
            ? 'Draft jurnal tersimpan otomatis. Simpan untuk menandai selesai.'
            : 'Perubahan akan tersimpan sebagai draft secara otomatis.'}
      </Text>
      <Text style={styles.sectionTitle}>Agenda tindak lanjut</Text>
      <Pressable
        onPress={() => openAgendaEditor()}
        style={styles.addStudentButton}
        accessibilityLabel="Tambah agenda"
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Tambah agenda</Text>
      </Pressable>
      {agendas.map((agenda) => (
        <Pressable
          key={agenda.id}
          onPress={async () => {
            await completeAgenda(db, agenda.id, !agenda.completed_at);
            setAgendas(await loadAgendas(db));
          }}
          onLongPress={() => openAgendaEditor(agenda)}
          style={styles.agendaRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: Boolean(agenda.completed_at) }}
          accessibilityLabel={`Agenda ${agenda.title}`}
        >
          <Ionicons
            name={agenda.completed_at ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={agenda.completed_at ? '#187F79' : '#FF795C'}
          />
          <Text style={[styles.studentName, agenda.completed_at && styles.completedAgenda]}>
            {agenda.title}
          </Text>
          {agenda.note ? <Text style={styles.quickSubtitle}>{agenda.note}</Text> : null}
        </Pressable>
      ))}
      <Modal
        animationType="slide"
        transparent
        visible={agendaModalVisible}
        onRequestClose={() => setAgendaModalVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>
              {editingAgendaId ? 'Edit agenda' : 'Tambah agenda'}
            </Text>
            <TextInput
              value={agendaTitle}
              onChangeText={setAgendaTitle}
              placeholder="Judul agenda"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Judul agenda"
            />
            <TextInput
              value={agendaNote}
              onChangeText={setAgendaNote}
              placeholder="Catatan (opsional)"
              placeholderTextColor="#8A9AAF"
              multiline
              style={styles.journalInputSmall}
              accessibilityLabel="Catatan agenda"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAgendaModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={addNextAgenda} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function GradeScreen({
  db,
  classId,
  students,
}: {
  db: SQLiteDatabase;
  classId: string;
  students: Student[];
}) {
  const [entryVisible, setEntryVisible] = useState(false);
  const [components, setComponents] = useState<Awaited<ReturnType<typeof loadGradeComponents>>>([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof loadTeachingSessions>>>([]);
  const [selectedId, setSelectedId] = useState(`component-default-${classId}`);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [componentName, setComponentName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Tugas');
  const [maxScore, setMaxScore] = useState('100');
  const [weight, setWeight] = useState('1');
  const [visibleStudentCount, setVisibleStudentCount] = useState(STUDENT_PAGE_SIZE);
  useEffect(() => {
    setVisibleStudentCount(STUDENT_PAGE_SIZE);
  }, [classId, students.length]);
  const refreshComponents = async () => {
    const rows = await loadGradeComponents(db, classId);
    setComponents(rows);
    if (rows.length && !rows.some((row) => row.id === selectedId)) setSelectedId(rows[0].id);
  };
  useEffect(() => {
    refreshComponents().catch(() => undefined);
  }, [classId, db]);
  useEffect(() => {
    loadTeachingSessions(db, localDateKey(), classId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [classId, db]);
  useEffect(() => {
    loadScores(db, selectedId)
      .then((rows) =>
        setScores(Object.fromEntries(rows.map((row) => [row.student_id, String(row.score ?? '')]))),
      )
      .catch(() => setScores({}));
    loadScores(db, selectedId)
      .then((rows) =>
        setScoreNotes(Object.fromEntries(rows.map((row) => [row.student_id, row.note ?? '']))),
      )
      .catch(() => setScoreNotes({}));
    setSaved(false);
  }, [db, selectedId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const [studentId, value] of Object.entries(scores)) {
        const score = Number(value);
        if (
          value !== '' &&
          Number.isFinite(score) &&
          score >= 0 &&
          score <= (components.find((item) => item.id === selectedId)?.max_score ?? 100)
        ) {
          saveScore(db, selectedId, studentId, score, scoreNotes[studentId] ?? '').catch(
            () => undefined,
          );
        }
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [components, db, scores, scoreNotes, selectedId]);
  const selected = components.find((item) => item.id === selectedId);
  const submit = async () => {
    const invalid = Object.values(scores).some(
      (value) => value !== '' && !validateScore(value, selected?.max_score ?? 100).valid,
    );
    if (invalid) {
      setScoreError(`Nilai harus berada di antara 0–${selected?.max_score ?? 100}.`);
      return;
    }
    const missing = missingScoreIds(
      students.map((student) => student.id),
      scores,
    );
    if (missing.length) {
      Alert.alert(
        'Nilai belum lengkap',
        `${missing.length} siswa belum memiliki nilai. Simpan sebagai draft atau kembali mengisi?`,
        [
          { text: 'Kembali', style: 'cancel' },
          {
            text: 'Simpan draft',
            onPress: async () => {
              for (const [studentId, value] of Object.entries(scores)) {
                const validation = validateScore(value, selected?.max_score ?? 100);
                if (validation.valid)
                  await saveScore(
                    db,
                    selectedId,
                    studentId,
                    validation.value,
                    scoreNotes[studentId] ?? '',
                  );
              }
              setSaved(true);
            },
          },
        ],
      );
      return;
    }
    setScoreError('');
    for (const [studentId, value] of Object.entries(scores)) {
      const validation = validateScore(value, selected?.max_score ?? 100);
      if (validation.valid) {
        await saveScore(db, selectedId, studentId, validation.value, scoreNotes[studentId] ?? '');
      }
    }
    setSaved(true);
  };
  const createComponent = async () => {
    const parsedMax = Number(maxScore);
    const parsedWeight = Number(weight);
    if (
      !componentName.trim() ||
      !subject.trim() ||
      !category.trim() ||
      !Number.isFinite(parsedMax) ||
      parsedMax <= 0 ||
      !Number.isFinite(parsedWeight) ||
      parsedWeight <= 0
    )
      return;
    const id = editingComponentId ?? `component-${Date.now()}`;
    if (editingComponentId)
      await updateGradeComponent(db, id, {
        name: componentName,
        subject,
        category,
        maxScore: parsedMax,
        weight: parsedWeight,
      });
    else
      await addGradeComponent(db, {
        id,
        classId,
        name: componentName,
        subject,
        category,
        maxScore: parsedMax,
        weight: parsedWeight,
        sessionId: sessions[0]?.id ?? null,
      });
    await refreshComponents();
    setSelectedId(id);
    setComponentName('');
    setSubject('');
    setCategory('Tugas');
    setMaxScore('100');
    setWeight('1');
    setEditingComponentId(null);
    setModalVisible(false);
  };
  const openComponentEditor = () => {
    if (!selected) return;
    setEditingComponentId(selected.id);
    setComponentName(selected.name);
    setSubject(selected.subject ?? '');
    setCategory(selected.category ?? 'Tugas');
    setMaxScore(String(selected.max_score));
    setWeight(String(selected.weight ?? 1));
    setModalVisible(true);
  };
  const removeComponent = () => {
    if (!selected) return;
    Alert.alert('Hapus komponen?', `Nilai siswa pada “${selected.name}” juga akan dihapus.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteGradeComponent(db, selected.id);
          setSelectedId('');
          await refreshComponents();
        },
      },
    ]);
  };
  const weightedPreview = selected
    ? calculateWeightedScore([
        {
          score:
            scores[students[0]?.id] === undefined || scores[students[0]?.id] === ''
              ? null
              : Number(scores[students[0]?.id]),
          maxScore: selected.max_score,
          weight: selected.weight,
        },
      ])
    : null;
  const scoreValues = Object.values(scores)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  const scoreAverage = scoreValues.length
    ? (scoreValues.reduce((total, value) => total + value, 0) / scoreValues.length).toFixed(1)
    : '—';
  const scoreHighest = scoreValues.length ? String(Math.max(...scoreValues)) : '—';
  const scoreLowest = scoreValues.length ? String(Math.min(...scoreValues)) : '—';
  const scoreMissing = Math.max(0, students.length - scoreValues.length);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Nilai</Text>
      <Text style={styles.date}>Komponen penilaian tersimpan offline</Text>
      <Text style={styles.helpText}>
        Pilih komponen atau tekan + untuk membuat penilaian. Isi skor per siswa; kolom kosong akan
        disimpan sebagai draft sampai lengkap.
      </Text>
      {!entryVisible ? (
        <>
          <View style={styles.workflowSummaryCard}>
            <View style={styles.workflowSummaryHeader}>
              <View>
                <Text style={styles.sectionTitle}>Ringkasan nilai</Text>
                <Text style={styles.quickSubtitle}>{selected?.name ?? 'Belum ada tugas/asesmen'}</Text>
              </View>
              <Ionicons name="stats-chart-outline" size={30} color="#FF795C" />
            </View>
            <View style={styles.metricRow}>
              <MetricCard label="Rata-rata" value={scoreAverage} />
              <MetricCard label="Tertinggi" value={scoreHighest} />
              <MetricCard label="Terendah" value={scoreLowest} />
              <MetricCard label="Siswa" value={String(students.length)} />
            </View>
            <Text style={styles.fieldHelp}>{sessions[0] ? `${sessions[0].title} · ${sessions[0].start_time}–${sessions[0].end_time}` : 'Nilai akan terhubung ke sesi jadwal yang dipilih.'}</Text>
          </View>
          <Pressable onPress={() => setEntryVisible(true)} style={({ pressed }) => [styles.addStudentButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Tambah nilai">
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.addStudentText}>Tambah nilai</Text>
          </Pressable>
        </>
      ) : null}
      <View style={!entryVisible ? styles.hidden : undefined}>
      {sessions.length ? (
        <View style={styles.sessionContextCard}>
          <Ionicons name="school-outline" size={21} color="#187F79" />
          <View style={styles.alertCopy}>
            <Text style={styles.sessionContextTitle}>Penilaian dari sesi</Text>
            <Text style={styles.sessionContextText}>
              {sessions[0].title} · {sessions[0].start_time}–{sessions[0].end_time}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.gradeSummaryRow} accessibilityLabel="Ringkasan nilai terpilih">
        <MetricCard label="Rata-rata" value={scoreAverage} />
        <MetricCard label="Tertinggi" value={scoreHighest} />
        <MetricCard label="Terendah" value={scoreLowest} />
        <MetricCard label="Belum dinilai" value={String(scoreMissing)} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gradeComponentRow}
      >
        {components.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSelectedId(item.id)}
            style={[
              styles.gradeComponentChip,
              selectedId === item.id && styles.gradeComponentSelected,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedId === item.id }}
          >
            <Text
              style={[
                styles.gradeComponentText,
                selectedId === item.id && styles.gradeComponentTextSelected,
              ]}
            >
              {item.name}
            </Text>
            <Text
              style={[
                styles.gradeComponentMeta,
                selectedId === item.id && styles.gradeComponentTextSelected,
              ]}
            >
              {item.weight ?? 1}×
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setEditingComponentId(null);
            setComponentName('');
            setSubject(sessions[0]?.title ?? '');
            setCategory('Tugas');
            setMaxScore('100');
            setWeight('1');
            setModalVisible(true);
          }}
          style={styles.classAddChip}
          accessibilityLabel="Tambah komponen nilai"
        >
          <Ionicons name="add" size={20} color="#187F79" />
        </Pressable>
      </ScrollView>
      {selected ? (
        <View style={styles.componentActions}>
          <Pressable
            onPress={openComponentEditor}
            style={styles.componentAction}
            accessibilityLabel="Edit komponen nilai"
          >
            <Ionicons name="create-outline" size={18} color="#187F79" />
            <Text style={styles.componentActionText}>Edit tugas</Text>
          </Pressable>
          <Pressable
            onPress={removeComponent}
            style={styles.componentAction}
            accessibilityLabel="Hapus komponen nilai"
          >
            <Ionicons name="trash-outline" size={18} color="#C36F0C" />
            <Text style={[styles.componentActionText, { color: '#C36F0C' }]}>Hapus</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.gradeHint}>
        <Ionicons name="information-circle-outline" size={24} color="#187F79" />
        <View style={styles.gradeHintCopy}>
          <Text style={styles.alertSubtitle}>
            Isi nilai 0–{selected?.max_score ?? 100}. Kolom kosong ditandai belum dinilai.
          </Text>
          {selected ? (
            <Text style={styles.gradeDetail}>
              {selected.category ?? 'Penilaian'} · Bobot {selected.weight ?? 1}× ·{' '}
              {selected.subject ?? 'Tanpa mapel'}
            </Text>
          ) : null}
        </View>
      </View>
      {weightedPreview !== null ? (
        <Text style={styles.weightedText}>
          Preview nilai berbobot {students[0]?.name}: {weightedPreview.toFixed(1)}
        </Text>
      ) : null}
      {students.slice(0, visibleStudentCount).map((student) => (
        <View key={student.id} style={styles.gradeRow}>
          <Pressable
            style={styles.studentRowCopy}
            accessibilityRole="button"
            accessibilityLabel={`Lihat detail nilai ${student.name}`}
            onPress={() =>
              Alert.alert(
                `Detail nilai ${student.name}`,
                `${selected?.name ?? 'Komponen'}\nNilai: ${scores[student.id] || 'Belum dinilai'} / ${selected?.max_score ?? 100}\nBobot: ${selected?.weight ?? 1}×\nCatatan: ${scoreNotes[student.id] || '—'}`,
              )
            }
          >
            <Text style={styles.studentName}>{student.name}</Text>
            {!(scores[student.id] ?? '').trim() ? (
              <Text style={styles.missingScore}>Belum dinilai</Text>
            ) : null}
            {scores[student.id] ? (
              <Text style={styles.gradeDetail}>
                Hasil komponen:{' '}
                {((Number(scores[student.id]) / (selected?.max_score ?? 100)) * 100).toFixed(1)}
              </Text>
            ) : null}
          </Pressable>
          <TextInput
            value={scores[student.id] ?? ''}
            onChangeText={(value) => {
              const normalized = value.replace(/[^0-9]/g, '');
              setScores((current) => ({ ...current, [student.id]: normalized }));
              setScoreError(
                Number(normalized) > (selected?.max_score ?? 100)
                  ? `Nilai harus berada di antara 0–${selected?.max_score ?? 100}.`
                  : '',
              );
              setSaved(false);
            }}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder="—"
            placeholderTextColor="#8A9AAF"
            style={styles.scoreInput}
            accessibilityLabel={`Nilai ${student.name}`}
          />
          <TextInput
            value={scoreNotes[student.id] ?? ''}
            onChangeText={(note) => {
              setScoreNotes((current) => ({ ...current, [student.id]: note }));
              setSaved(false);
            }}
            placeholder="Catatan (opsional)"
            placeholderTextColor="#8A9AAF"
            style={styles.scoreNoteInput}
            accessibilityLabel={`Catatan nilai ${student.name}`}
          />
        </View>
      ))}
      {visibleStudentCount < students.length ? (
        <Pressable
          onPress={() => setVisibleStudentCount((count) => count + STUDENT_PAGE_SIZE)}
          style={styles.templateButton}
          accessibilityRole="button"
          accessibilityLabel="Tampilkan siswa berikutnya untuk nilai"
        >
          <Ionicons name="chevron-down-outline" size={20} color="#187F79" />
          <Text style={styles.templateText}>
            Tampilkan berikutnya (
            {Math.min(STUDENT_PAGE_SIZE, students.length - visibleStudentCount)})
          </Text>
        </Pressable>
      ) : null}
      {scoreError ? <Text style={styles.formError}>{scoreError}</Text> : null}
      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
      >
        <LinearGradient colors={[activePalette.accent, '#FF6F59']} style={styles.saveGradient}>
          <Text style={styles.saveButtonText}>{saved ? 'Nilai tersimpan' : 'Simpan nilai'}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={() => setEntryVisible(false)} style={styles.recapToggle} accessibilityRole="button" accessibilityLabel="Kembali ke ringkasan nilai">
        <Ionicons name="arrow-back-outline" size={20} color="#187F79" />
        <Text style={styles.recapToggleText}>Kembali ke ringkasan</Text>
      </Pressable>
      </View>
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>
              {editingComponentId ? 'Edit komponen' : 'Tambah komponen'}
            </Text>
            <Text style={styles.modalHint}>
              Isi identitas penilaian agar rekap dan PDF mudah dipahami.
            </Text>
            <Text style={styles.fieldLabel}>Nama tugas/asesmen</Text>
            <TextInput
              value={componentName}
              onChangeText={setComponentName}
              placeholder="Nama asesmen"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Nama asesmen"
            />
            <Text style={styles.fieldHelp}>Contoh: Tugas Pecahan 1 atau Ulangan Harian Bab 2.</Text>
            <Text style={styles.fieldLabel}>Mata pelajaran</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Mata pelajaran"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Mata pelajaran"
            />
            <Text style={styles.fieldHelp}>Contoh: Matematika, Bahasa Indonesia, atau IPA.</Text>
            <Text style={styles.fieldLabel}>Kategori</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Kategori (Tugas/Ulangan)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
              accessibilityLabel="Kategori asesmen"
            />
            <Text style={styles.fieldHelp}>Contoh: Tugas, Ulangan, Proyek, atau Praktik.</Text>
            <Text style={styles.fieldLabel}>Batas nilai dan bobot</Text>
            <View style={styles.scheduleInputRow}>
              <TextInput
                value={maxScore}
                onChangeText={setMaxScore}
                keyboardType="number-pad"
                placeholder="Maks."
                placeholderTextColor="#8A9AAF"
                style={styles.textInputHalf}
                accessibilityLabel="Nilai maksimum"
              />
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="Bobot"
                placeholderTextColor="#8A9AAF"
                style={styles.textInputHalf}
                accessibilityLabel="Bobot nilai"
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={createComponent} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function PlaceholderScreen({ title }: { title: Tab }) {
  return (
    <View style={[styles.content, styles.placeholder]}>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.placeholderText}>Modul {title.toLowerCase()} sedang disiapkan.</Text>
    </View>
  );
}

function BottomNavigation({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  const tabs: Tab[] = ['Beranda', 'Absensi', 'Kelas', 'Jadwal', 'Laporan'];
  const icons: Record<Tab, keyof typeof Ionicons.glyphMap> = {
    Beranda: 'home-outline',
    Absensi: 'calendar-outline',
    Kelas: 'people-outline',
    Jadwal: 'time-outline',
    Laporan: 'bar-chart-outline',
    Jurnal: 'book-outline',
    Nilai: 'stats-chart-outline',
    Pengaturan: 'settings-outline',
  };
  return (
    <View style={styles.bottomNavigation} accessibilityRole="tablist">
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === tab }}
          accessibilityLabel={`Buka ${tab}`}
          onPress={() => onChange(tab)}
          style={({ pressed }) => [
            styles.navItem,
            activeTab === tab && styles.navItemActive,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={icons[tab]} size={22} color={activeTab === tab ? activePalette.accent : activePalette.muted} />
          <Text
            style={[styles.navText, activeTab === tab && styles.navTextActive]}
            maxFontSizeMultiplier={1.4}
            numberOfLines={1}
          >
            {tab}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

let styles = createStyles(lightPalette);

let layoutWidth = 390;
let layoutLandscape = false;

function createStyles(palette: UiPalette) {
  return StyleSheet.create({
    setupContent: {
      backgroundColor: palette.background,
      flexGrow: 1,
      justifyContent: 'center',
      padding: 30,
    },
    safeArea: { flex: 1, backgroundColor: palette.background },
    appShell: { flex: 1 },
    dashboardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    settingsButton: {
      alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border,
      borderRadius: 16, borderWidth: 1, elevation: 3, height: 46, justifyContent: 'center', width: 46,
    },
    settingsHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
    settingsBackButton: {
      alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border,
      borderRadius: 16, borderWidth: 1, height: 46, justifyContent: 'center', marginRight: 12, width: 46,
    },
    settingsHeaderCopy: { flex: 1 },
    profileCard: {
      alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border,
      borderRadius: 24, borderWidth: 1, elevation: 4, flexDirection: 'row', marginTop: 14, padding: 16,
    },
    profileAvatar: {
      alignItems: 'center', backgroundColor: palette.primarySoft, borderRadius: 30,
      height: 60, justifyContent: 'center', width: 60,
    },
    profileCopy: { flex: 1, marginLeft: 12 },
    profileName: { color: palette.text, fontSize: 16, fontWeight: '800' },
    profileSchool: { color: palette.muted, fontSize: 13, marginTop: 5 },
    outlineAction: { borderColor: palette.accent, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
    outlineActionText: { color: palette.accent, fontSize: 13, fontWeight: '800' },
    settingsInfoCard: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 20, borderWidth: 1, padding: 16 },
    settingsInfoRow: { alignItems: 'center', flexDirection: 'row', marginVertical: 6 },
    settingsInfoCopy: { marginLeft: 12 },
    settingsInfoLabel: { color: palette.muted, fontSize: 12 },
    settingsInfoValue: { color: palette.text, fontSize: 15, fontWeight: '800', marginTop: 3 },
    primarySettingsAction: {
      alignItems: 'center', backgroundColor: palette.accent, borderRadius: 16, flexDirection: 'row',
      justifyContent: 'center', marginTop: 18, minHeight: 52, paddingHorizontal: 16,
    },
    primarySettingsActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginLeft: 8 },
    settingsHintCard: {
      alignItems: 'center', backgroundColor: palette.primarySoft, borderColor: palette.border,
      borderRadius: 18, borderWidth: 1, flexDirection: 'row', marginTop: 18, padding: 14,
    },
    content: {
      alignSelf: 'center',
      flexGrow: 1,
      paddingHorizontal: layoutWidth >= 768 ? 32 : 20,
      paddingTop: layoutLandscape ? 14 : 22,
      paddingBottom: layoutLandscape ? 96 : 28,
      width: layoutWidth >= 768 ? 760 : '100%',
    },
    brand: { color: palette.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
    greeting: { color: palette.text, fontSize: 24, fontWeight: '800', marginTop: 22 },
    screenTitle: { color: palette.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
    date: { color: palette.muted, fontSize: 14, marginTop: 6 },
    helpText: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 10,
    },
    guideCard: {
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 14,
    },
    guideTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    guideDismiss: { color: palette.primary, fontSize: 12, fontWeight: '800', marginTop: 8 },
    heroCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      elevation: 2,
      marginTop: 28,
      padding: 20,
      shadowColor: '#A9BBD0',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
    },
    heroTitle: { color: palette.text, fontSize: 21, fontWeight: '800' },
    heroSubtitle: { color: palette.muted, fontSize: 14, marginTop: 10 },
    heroTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    heroIllustration: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 42,
      height: 84,
      justifyContent: 'center',
      width: 84,
    },
    pencilIcon: { bottom: 17, left: 20, position: 'absolute' },
    heroInfo: { flex: 1, marginLeft: 14, minWidth: 0, paddingRight: 8 },
    progressRing: {
      alignItems: 'center',
      borderColor: palette.primary,
      borderRadius: 46,
      borderWidth: 8,
      height: 92,
      justifyContent: 'center',
      width: 92,
    },
    progressValue: { color: palette.text, fontSize: 18, fontWeight: '800' },
    progressLabel: { color: palette.muted, fontSize: 12, marginTop: 1 },
    inlineAction: { alignItems: 'center', flexDirection: 'row', marginTop: 16, minHeight: 48 },
    inlineActionText: { color: palette.accent, fontSize: 15, fontWeight: '800' },
    inlineArrow: { color: palette.accent, fontSize: 26, lineHeight: 26, marginLeft: 6 },
    sectionTitle: {
      color: palette.text,
      fontSize: 19,
      fontWeight: '800',
      marginTop: 30,
      marginBottom: 14,
    },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    quickCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderBottomColor: '#A9BBD0',
      borderBottomWidth: 3,
      borderWidth: 1,
      elevation: 2,
      flexBasis: '47%',
      flexGrow: 1,
      minHeight: 100,
      padding: 16,
    },
    quickTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
    quickSubtitle: { color: palette.muted, fontSize: 13, marginTop: 8 },
    sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    sectionLink: { color: palette.accent, fontSize: 13, fontWeight: '800', marginTop: 30 },
    scheduleCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      elevation: 3,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 18,
      shadowColor: '#A9BBD0',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.72,
      shadowRadius: 8,
    },
    scheduleTime: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 14,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    scheduleTimeText: { color: palette.primary, fontSize: 15, fontWeight: '800', marginLeft: 6 },
    scheduleTitle: {
      color: palette.text,
      flex: 1,
      fontSize: 17,
      fontWeight: '800',
      marginLeft: 12,
    },
    journalAlert: {
      alignItems: 'center',
      backgroundColor: palette.warningSurface,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 18,
      padding: 16,
    },
    journalCompleteCard: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      marginTop: 18,
      padding: 16,
    },
    sessionContextCard: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 14,
      padding: 14,
    },
    sessionEmptyCard: {
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 14,
    },
    sessionContextTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    sessionContextText: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    alertCopy: { flex: 1, marginHorizontal: 12 },
    alertTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    alertSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    alertAction: {
      borderColor: '#E58A23',
      borderRadius: 14,
      borderWidth: 1,
      color: palette.warningText,
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    attendanceToolbar: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      elevation: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 24,
      minHeight: 56,
      paddingHorizontal: 16,
    },
    attendanceDateToolbar: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
      minHeight: 62,
      paddingHorizontal: 8,
    },
    dateStepButton: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    dateStepButtonDisabled: { opacity: 0.6 },
    selectedDateButton: { alignItems: 'center', flex: 1, minHeight: 46, justifyContent: 'center' },
    selectedDateText: { color: palette.text, fontSize: 14, fontWeight: '800' },
    selectedDateHint: { color: palette.muted, fontSize: 11, marginTop: 3 },
    scheduleDateToolbar: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
      minHeight: 70,
      paddingHorizontal: 8,
    },
    scheduleDateCopy: { alignItems: 'center', flex: 1 },
    scheduleNotice: {
      alignItems: 'center',
      backgroundColor: '#FFF3DB',
      borderColor: '#FFE1A9',
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      marginBottom: 12,
      padding: 14,
    },
    scheduleNoticeText: {
      color: '#8D5B12',
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      marginLeft: 10,
    },
    attendanceAlertCard: {
      alignItems: 'flex-start',
      backgroundColor: '#FFF3DB',
      borderColor: '#FFE1A9',
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 16,
      padding: 14,
    },
    alertDetail: { color: '#8D5B12', fontSize: 12, fontWeight: '700', marginTop: 4 },
    holidayButton: {
      alignItems: 'center',
      backgroundColor: '#FFF3DB',
      borderColor: '#FFE1A9',
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 12,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    holidayButtonActive: { backgroundColor: '#E58A23', borderColor: '#C36F0C' },
    holidayButtonText: { color: '#C36F0C', fontSize: 14, fontWeight: '800', marginLeft: 8 },
    holidayButtonTextActive: { color: '#FFFFFF' },
    overrideButton: {
      alignItems: 'center',
      marginTop: 14,
      minHeight: 44,
      justifyContent: 'center',
    },
    overrideText: { color: '#187F79', fontSize: 14, fontWeight: '800' },
    toolbarAction: { minHeight: 48, justifyContent: 'center' },
    toolbarActionText: { color: '#FF795C', fontSize: 15, fontWeight: '800' },
    countText: { color: '#687B91', fontSize: 13, fontWeight: '600' },
    studentCard: {
      backgroundColor: '#DCE8F4',
      borderColor: '#F6FAFF',
      borderRadius: 20,
      borderWidth: 1,
      elevation: 2,
      marginTop: 12,
      padding: 16,
    },
    studentName: { color: '#24354D', fontSize: 16, fontWeight: '700' },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    noteToggle: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 12 },
    noteToggleText: { color: '#187F79', fontSize: 13, fontWeight: '700' },
    noteInput: {
      backgroundColor: '#F4F9FF',
      borderColor: '#C4D5E6',
      borderRadius: 12,
      borderWidth: 1,
      color: '#24354D',
      marginTop: 10,
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 10,
      textAlignVertical: 'top',
    },
    statusChip: {
      alignItems: 'center',
      backgroundColor: '#D2DFEE',
      borderColor: '#F6FAFF',
      borderRadius: 14,
      borderBottomColor: '#A9BBD0',
      borderBottomWidth: 2,
      borderWidth: 1,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    statusChipSelected: { backgroundColor: '#FF795C', borderColor: '#E9684C' },
    statusText: { color: '#24354D', fontSize: 13, fontWeight: '600' },
    statusTextSelected: { color: '#FFFFFF' },
    saveButton: {
      alignItems: 'center',
      backgroundColor: '#FF795C',
      borderColor: '#E9684C',
      borderRadius: 18,
      borderBottomWidth: 4,
      elevation: 4,
      justifyContent: 'center',
      marginTop: 24,
      minHeight: 56,
      overflow: 'hidden',
    },
    saveGradient: { alignItems: 'center', justifyContent: 'center', minHeight: 56, width: '100%' },
    savePressed: { backgroundColor: '#E9684C' },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    finalizeButton: {
      alignItems: 'center',
      borderColor: palette.primary,
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: 'center',
      marginTop: 12,
      minHeight: 52,
    },
    finalizeButtonText: { color: palette.primary, fontSize: 15, fontWeight: '800' },
    draftText: { color: '#687B91', fontSize: 12, marginTop: 12, textAlign: 'center' },
    recapToggle: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 18,
      minHeight: 48,
    },
    recapToggleText: { color: '#187F79', fontSize: 15, fontWeight: '800', marginLeft: 8 },
    recapCard: {
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 8,
      padding: 16,
    },
    recapPeriodRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    recapPeriod: {
      backgroundColor: '#DDEBFA',
      borderRadius: 14,
      flex: 1,
      minHeight: 42,
      justifyContent: 'center',
      alignItems: 'center',
    },
    recapPeriodSelected: { backgroundColor: palette.primary },
    recapPeriodText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
    recapPeriodTextSelected: { color: palette.onAccent },
    customRangeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    customRangeInput: {
      backgroundColor: palette.surfaceRaised,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.text,
      flex: 1,
      minHeight: 46,
      paddingHorizontal: 10,
    },
    recapRow: {
      alignItems: 'center',
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    recapSubheading: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '800',
      marginTop: 16,
      marginBottom: 4,
    },
    bottomNavigation: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      elevation: 8,
      borderTopWidth: 1,
      flexDirection: 'row',
      minHeight: 72,
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    navItem: {
      alignItems: 'center',
      borderRadius: 16,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    navItemActive: {
      backgroundColor: palette.primarySoft,
      borderColor: palette.primary,
      borderWidth: 1,
      elevation: 2,
      marginBottom: 4,
      marginHorizontal: 3,
    },
    navText: { color: palette.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
    navTextActive: { color: palette.accent, fontWeight: '800' },
    classHero: {
      alignItems: 'center',
      borderColor: palette.border,
      borderRadius: 24,
      borderWidth: 1,
      elevation: 4,
      flexDirection: 'row',
      marginTop: 24,
      padding: 18,
      shadowColor: '#B5C8DC',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.55,
      shadowRadius: 8,
    },
    classHeroIcon: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 30,
      height: 60,
      justifyContent: 'center',
      width: 60,
    },
    classHeroCopy: { flex: 1, marginLeft: 14 },
    classPickerRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
    classPickerChip: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      minHeight: 48,
      paddingHorizontal: 14,
    },
    classPickerChipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    classPickerText: { color: palette.primary, fontSize: 13, fontWeight: '800', marginLeft: 6 },
    classPickerTextSelected: { color: palette.onAccent },
    classChip: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      minHeight: 44,
      paddingHorizontal: 12,
    },
    classChipSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    classChipText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
    classChipTextSelected: { color: palette.onAccent },
    classChipGroup: { color: palette.primary, fontSize: 10, fontWeight: '700', marginTop: 2 },
    classAddChip: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 15,
      justifyContent: 'center',
      minHeight: 44,
      width: 44,
    },
    classSectionHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    classStudentRow: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      elevation: 2,
      flexDirection: 'row',
      marginBottom: 10,
      padding: 12,
    },
    avatar: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 24,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    avatarText: { color: palette.primary, fontSize: 20, fontWeight: '800' },
    studentRowCopy: { flex: 1, marginLeft: 12 },
    studentActions: { alignItems: 'center', flexDirection: 'row' },
    archivedToggle: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: 8 },
    restoreButton: {
      backgroundColor: palette.primarySoft,
      borderRadius: 12,
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    restoreText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    smallIconButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 44,
    },
    addStudentButton: {
      alignItems: 'center',
      backgroundColor: '#FF795C',
      borderColor: '#E9684C',
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 14,
      minHeight: 54,
    },
    addStudentText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginLeft: 8 },
    importButton: {
      alignItems: 'center',
      backgroundColor: '#C6E9E7',
      borderColor: '#A7D8D4',
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 10,
      minHeight: 54,
    },
    importText: { color: '#187F79', fontSize: 15, fontWeight: '800', marginLeft: 8 },
    templateButton: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 10,
      minHeight: 44,
    },
    templateText: { color: '#687B91', fontSize: 13, fontWeight: '700', marginLeft: 6 },
    modalScrim: { backgroundColor: 'rgba(36,53,77,0.32)', flex: 1, justifyContent: 'flex-end' },
    modalScrimCenter: {
      alignItems: 'center',
      backgroundColor: 'rgba(36,53,77,0.32)',
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: '#F9FCFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
    },
    datePickerCard: { backgroundColor: '#F9FCFF', borderRadius: 24, padding: 20, width: '100%' },
    datePickerHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    datePickerNav: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderRadius: 12,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    datePickerMonth: { color: '#24354D', fontSize: 16, fontWeight: '800' },
    calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
    calendarWeekText: {
      color: '#687B91',
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
      width: 40,
    },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    calendarDay: { alignItems: 'center', height: 44, justifyContent: 'center', width: '14.2857%' },
    calendarDaySelected: { backgroundColor: '#187F79', borderRadius: 14 },
    calendarDayText: { color: '#24354D', fontSize: 14, fontWeight: '700' },
    calendarDayTextSelected: { color: '#FFFFFF' },
    reasonCard: { backgroundColor: '#F9FCFF', borderRadius: 24, padding: 24, width: '100%' },
    promotionStudentRow: { borderBottomWidth: 1, borderBottomColor: '#DCE8F2', paddingVertical: 10 },
    bulkScheduleRow: { borderBottomWidth: 1, borderBottomColor: '#DCE8F2', paddingVertical: 10 },
    bulkDayToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    contextSwitchButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 },
    contextSwitchText: { color: palette.primary, fontSize: 13, fontWeight: '800' },
    reasonGrid: { gap: 10, marginTop: 20 },
    reasonButton: {
      backgroundColor: '#EAF4FF',
      borderColor: '#C7D8EA',
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    reasonButtonText: { color: '#187F79', fontSize: 15, fontWeight: '800' },
    modalHint: { color: '#687B91', fontSize: 14, marginTop: 8 },
    textInput: {
      backgroundColor: '#EAF4FF',
      borderColor: '#C7D8EA',
      borderRadius: 16,
      borderWidth: 1,
      color: '#24354D',
      fontSize: 16,
      marginTop: 20,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    scheduleInputRow: { flexDirection: 'row', gap: 10 },
    textInputHalf: {
      backgroundColor: '#EAF4FF',
      borderColor: '#C7D8EA',
      borderRadius: 16,
      borderWidth: 1,
      color: '#24354D',
      flex: 1,
      fontSize: 16,
      marginTop: 12,
      minHeight: 52,
      paddingHorizontal: 16,
    },
    formError: { color: '#C94E3B', fontSize: 13, marginTop: 8 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: {
      alignItems: 'center',
      borderColor: '#B5C8DC',
      borderRadius: 16,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 52,
    },
    cancelText: { color: '#687B91', fontSize: 15, fontWeight: '800' },
    confirmButton: {
      alignItems: 'center',
      backgroundColor: '#FF795C',
      borderRadius: 16,
      flex: 1,
      justifyContent: 'center',
      minHeight: 52,
    },
    confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    dayRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
    dayChip: {
      alignItems: 'center',
      backgroundColor: '#DDEBFA',
      borderColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      flex: 1,
      minHeight: 48,
      justifyContent: 'center',
    },
    dayChipSelected: { backgroundColor: '#FF795C', borderColor: '#E9684C' },
    dayChipText: { color: '#687B91', fontSize: 13, fontWeight: '800' },
    dayChipTextSelected: { color: '#FFFFFF' },
    emptyCard: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 10,
      padding: 28,
    },
    emptyTitle: { color: '#24354D', fontSize: 17, fontWeight: '800', marginTop: 10 },
    reportSummary: {
      alignItems: 'center',
      backgroundColor: '#FFF3DB',
      borderColor: '#FFE1A9',
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 24,
      padding: 16,
    },
    journalCard: {
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 22,
      borderWidth: 1,
      elevation: 3,
      marginTop: 24,
      padding: 18,
    },
    journalInput: {
      backgroundColor: '#DDEBFA',
      borderColor: '#C7D8EA',
      borderRadius: 16,
      borderWidth: 1,
      color: '#24354D',
      fontSize: 16,
      lineHeight: 24,
      marginTop: 16,
      minHeight: 190,
      padding: 14,
    },
    journalInputSmall: {
      backgroundColor: '#EAF4FF',
      borderColor: '#C7D8EA',
      borderRadius: 16,
      borderWidth: 1,
      color: '#24354D',
      fontSize: 15,
      marginTop: 12,
      minHeight: 90,
      padding: 14,
    },
    gradeHint: {
      alignItems: 'center',
      backgroundColor: '#C6E9E7',
      borderRadius: 18,
      flexDirection: 'row',
      gap: 10,
      marginTop: 22,
      padding: 14,
    },
    gradeHintCopy: { flex: 1, marginLeft: 10 },
    gradeDetail: { color: '#687B91', fontSize: 12, marginTop: 3 },
    gradeSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    metricCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexBasis: '47%',
      flexGrow: 1,
      padding: 12,
    },
    metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    workflowSummaryCard: { backgroundColor: activePalette.surfaceRaised, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: activePalette.border, marginTop: 14, elevation: 2 },
    workflowSummaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hidden: { display: 'none' },
    metricValue: { color: palette.text, fontSize: 18, fontWeight: '800' },
    metricLabel: { color: palette.muted, fontSize: 11, marginTop: 4 },
    gradeRow: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
      padding: 12,
    },
    scoreInput: {
      backgroundColor: '#DDEBFA',
      borderColor: '#B5C8DC',
      borderRadius: 14,
      borderWidth: 1,
      color: '#24354D',
      fontSize: 16,
      fontWeight: '800',
      minHeight: 48,
      paddingHorizontal: 14,
      textAlign: 'center',
      width: 74,
    },
    scoreNoteInput: {
      backgroundColor: '#F4F9FF',
      borderColor: '#C4D5E6',
      borderRadius: 12,
      borderWidth: 1,
      color: '#24354D',
      minHeight: 42,
      paddingHorizontal: 8,
      width: 118,
    },
    missingScore: { color: '#C36F0C', fontSize: 12, marginTop: 4 },
    gradeComponentRow: { gap: 8, paddingVertical: 16 },
    gradeComponentChip: {
      backgroundColor: '#DDEBFA',
      borderColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    gradeComponentSelected: { backgroundColor: '#FF795C', borderColor: '#E9684C' },
    gradeComponentText: { color: '#24354D', fontSize: 13, fontWeight: '800' },
    gradeComponentMeta: { color: '#687B91', fontSize: 11, marginTop: 3 },
    gradeComponentTextSelected: { color: '#FFFFFF' },
    componentActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    componentAction: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 44,
      paddingHorizontal: 8,
    },
    componentActionText: { color: '#187F79', fontSize: 13, fontWeight: '800', marginLeft: 6 },
    fieldLabel: { color: '#24354D', fontSize: 13, fontWeight: '800', marginTop: 16 },
    fieldHelp: { color: '#687B91', fontSize: 11, marginTop: 4 },
    weightedText: { color: '#187F79', fontSize: 13, fontWeight: '800', marginBottom: 8 },
    agendaComposer: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
    agendaInput: {
      backgroundColor: '#EAF4FF',
      borderColor: '#C7D8EA',
      borderRadius: 16,
      borderWidth: 1,
      color: '#24354D',
      flex: 1,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    agendaAddButton: {
      alignItems: 'center',
      backgroundColor: '#FF795C',
      borderRadius: 16,
      height: 52,
      justifyContent: 'center',
      width: 52,
    },
    agendaRow: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
      minHeight: 52,
      paddingHorizontal: 14,
    },
    completedAgenda: { color: '#687B91', textDecorationLine: 'line-through' },
    reportOptions: { flexDirection: 'row', gap: 12 },
    reportOption: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      minHeight: 86,
      justifyContent: 'center',
    },
    reportOptionSelected: { backgroundColor: '#FFF0EB', borderColor: '#FF795C' },
    reportOptionText: { color: '#24354D', fontSize: 14, fontWeight: '800', marginTop: 8 },
    reportCheckRow: { alignItems: 'center', flexDirection: 'row', marginTop: 16, minHeight: 52 },
    reportCheckText: { color: '#24354D', fontSize: 14, fontWeight: '800' },
    reportPreview: {
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 18,
      padding: 16,
    },
    previewRow: {
      borderBottomColor: '#D2DFEE',
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    previewStatus: { color: '#187F79', fontSize: 13, fontWeight: '800' },
    accumulationPreview: {
      backgroundColor: '#F4F9FF',
      borderColor: '#D2DFEE',
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 14,
    },
    accumulationHeaderRow: {
      backgroundColor: '#24354D',
      borderRadius: 8,
      flexDirection: 'row',
      marginTop: 12,
      paddingVertical: 8,
    },
    accumulationRow: {
      borderBottomColor: '#D2DFEE',
      borderBottomWidth: 1,
      flexDirection: 'row',
      minHeight: 38,
      paddingVertical: 8,
    },
    accumulationHeaderCell: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
      width: 58,
    },
    accumulationCell: {
      color: '#24354D',
      fontSize: 12,
      textAlign: 'center',
      width: 58,
    },
    accumulationNameCell: { textAlign: 'left', width: 148 },
    exportRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
    exportButton: {
      alignItems: 'center',
      backgroundColor: '#EAF4FF',
      borderColor: '#FFFFFF',
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 54,
    },
    exportText: { color: '#24354D', fontSize: 15, fontWeight: '800', marginLeft: 8 },
    exportMessage: {
      color: '#187F79',
      fontSize: 13,
      fontWeight: '700',
      marginTop: 14,
      textAlign: 'center',
    },
    placeholder: { justifyContent: 'center' },
    placeholderText: { color: '#687B91', fontSize: 16, marginTop: 12 },
    pressed: { opacity: 0.82, transform: [{ translateY: 1 }] },
  });
}
