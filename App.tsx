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
import {
  ASSESSMENT_CATEGORIES,
  buildCompetencyDescription,
  calculatePredicate,
  missingScoreIds,
  summarizeAssessmentScores,
  validateScore,
} from './src/domain/grading';
import {
  ENROLLMENT_MOVEMENT_STATUSES,
  type EnrollmentMovementStatus,
  formatDashboardAttendanceIndicator,
  type RepeatRule,
  validateNisImportCandidates,
} from './src/domain/academic';
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
  copySchedulesToClass,
  addScheduleException,
  archiveSchedule,
  addStudent,
  promoteStudentsBulk,
  undoLastPromotion,
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
  loadAuditHistory,
  recordAuditEvent,
  type AttendancePeriod,
  loadSchedules,
  loadScheduleExceptions,
  loadTeachingSessions,
  loadAllTeachingSessionsForClass,
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

type Tab =
  | 'Beranda'
  | 'Jadwal'
  | 'Absensi'
  | 'Nilai'
  | 'Jurnal'
  | 'Kelas'
  | 'Laporan'
  | 'Pengaturan';
type AttendanceStatus = 'Belum diisi' | 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' | 'Terlambat';
type Student = {
  id: string;
  name: string;
  nis?: string | null;
  status: AttendanceStatus;
  note: string;
};
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
  background: '#F4F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSoft: '#E6F2F2',
  text: '#1E293B',
  muted: '#52657A',
  border: '#D8E4F0',
  primary: '#187F79',
  primarySoft: '#D5F2EF',
  accent: '#FF795C',
  accentSoft: '#FFE8E2',
  warningSurface: '#FFF5E0',
  warningText: '#8D5B12',
  onAccent: '#FFFFFF',
};

const darkPalette: UiPalette = {
  background: '#0F172A',
  surface: '#162238',
  surfaceRaised: '#1E2D47',
  surfaceSoft: '#223654',
  text: '#F8FAFC',
  muted: '#CBD5E1',
  border: '#334155',
  primary: '#2BB7A9',
  primarySoft: '#134E4A',
  accent: '#FF8A72',
  accentSoft: '#431407',
  warningSurface: '#493A20',
  warningText: '#FFD38A',
  onAccent: '#0F172A',
};

let activePalette = lightPalette;
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
  const [academicContext, setAcademicContext] =
    useState<Awaited<ReturnType<typeof loadActiveAcademicContext>>>(null);
  const themePref = academicContext?.theme_preference ?? 'system';
  const isDark =
    themePref === 'dark' ? true : themePref === 'light' ? false : colorScheme === 'dark';
  activePalette = isDark ? darkPalette : lightPalette;
  const isLandscape = width > height;
  layoutWidth = width;
  layoutLandscape = isLandscape;
  const today = localDateKey();
  const [activeTab, setActiveTab] = useState<Tab>('Beranda');
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Task 0.2 & 2.2: No dummy data in real mode! Start with honest empty array.
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Awaited<ReturnType<typeof loadClasses>>>([]);
  const [contextEditorVisible, setContextEditorVisible] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [saved, setSaved] = useState(false);
  const [undoStudents, setUndoStudents] = useState<Student[] | null>(null);
  const [journalDirty, setJournalDirty] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const journalSaveRef = useRef<(() => Promise<void>) | null>(null);
  const studentsLoadedForRef = useRef('');

  const showNotice = (msg: string) => {
    setSnackbarMessage(msg);
    setTimeout(() => {
      setSnackbarMessage((current) => (current === msg ? null : current));
    }, 3500);
  };

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
    loadActiveAcademicContext(db)
      .then(setAcademicContext)
      .catch(() => setAcademicContext(null));
  }, [db]);

  useEffect(() => {
    loadClasses(db)
      .then((rows) => {
        setClasses(rows);
        if (rows.length && (!selectedClassId || !rows.some((row) => row.id === selectedClassId))) {
          setSelectedClassId(rows[0].id);
        }
      })
      .catch(() => setClasses([]));
  }, [db, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) {
      setStudents([]);
      return;
    }
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
      .catch(() => setStudents([]));
  }, [attendanceDate, db, selectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;
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

  // Task 5.2: Persentase hadir = Total hadir / Total data absensi x 100
  const attendanceSummary = useMemo(() => {
    const recorded = students.filter((student) => student.status !== 'Belum diisi');
    if (!recorded.length) return null;
    const indicator = formatDashboardAttendanceIndicator(
      recorded.map((s) => s.status as Exclude<AttendanceStatus, 'Belum diisi'>),
    );
    return indicator.percentage;
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
    showNotice('Perubahan massal dibatalkan.');
  };
  const updateNote = (id: string, note: string) => {
    setSaved(false);
    setStudents((current) =>
      current.map((student) => (student.id === id ? { ...student, note } : student)),
    );
  };
  const refreshStudents = () => {
    if (!selectedClassId) return;
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
    const ctx = await loadActiveAcademicContext(db);
    setAcademicContext(ctx);
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

  const activeClassName =
    classes.find((item) => item.id === selectedClassId)?.name ?? 'Belum ada kelas';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={
          isDark ? [darkPalette.background, '#111C33'] : [lightPalette.background, '#E8F3F8']
        }
        style={styles.appShell}
      >
        {snackbarMessage ? (
          <View style={styles.snackbarBanner} accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.snackbarText}>{snackbarMessage}</Text>
          </View>
        ) : null}

        {activeTab === 'Beranda' && (
          <Dashboard
            db={db}
            classes={classes}
            classId={selectedClassId}
            onSelectClass={setSelectedClassId}
            onOpenAttendance={(sessionId, date) => {
              if (sessionId) setActiveSessionId(sessionId);
              if (date) setAttendanceDate(date);
              navigate('Absensi');
            }}
            onOpenJournal={(sessionId) => {
              if (sessionId) setActiveSessionId(sessionId);
              navigate('Jurnal');
            }}
            onOpenGrades={(sessionId) => {
              if (sessionId) setActiveSessionId(sessionId);
              navigate('Nilai');
            }}
            onOpenSchedule={() => navigate('Jadwal')}
            onOpenClasses={() => navigate('Kelas')}
            onOpenReport={() => navigate('Laporan')}
            className={activeClassName}
            studentCount={students.length}
            missingNisCount={students.filter((student) => !student.nis?.trim()).length}
            attendanceRate={attendanceSummary}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            academicYearLabel={academicContext?.year_label ?? 'Tahun ajaran belum diatur'}
            termLabel={academicContext?.term_label ?? 'Semester belum diatur'}
            appMode={academicContext?.app_mode ?? 'real'}
            onOpenSettings={() => navigate('Pengaturan')}
            onChangeAcademicContext={() => setContextEditorVisible(true)}
          />
        )}
        {activeTab === 'Absensi' && (
          <AttendanceScreen
            db={db}
            classes={classes}
            classId={selectedClassId}
            onSelectClass={setSelectedClassId}
            className={activeClassName}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            attendanceDate={attendanceDate}
            onAttendanceDateChange={setAttendanceDate}
            activeSessionId={activeSessionId}
            onSelectSession={(sessionId, date) => {
              setActiveSessionId(sessionId);
              setAttendanceDate(date);
            }}
            students={students}
            saved={saved}
            presentCount={presentCount}
            onMarkAllPresent={markAllPresent}
            onBulkUpdateStatus={bulkUpdateStatus}
            onUndoBulkChange={undoLastBulkChange}
            canUndoBulk={Boolean(undoStudents && !saved)}
            onUpdateStatus={updateStatus}
            onUpdateNote={updateNote}
            onNotify={showNotice}
            onSave={(sessionTitle) => {
              Promise.all([
                saveAttendanceDraft(db, selectedClassId, attendanceDate, students),
                loadTeachingSessions(db, attendanceDate, selectedClassId).then((sessions) => {
                  const target =
                    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
                  return target
                    ? saveAttendanceSession(
                        db,
                        target.id,
                        students.map((student) => ({
                          studentId: student.id,
                          status: student.status,
                          note: student.note,
                        })),
                        'draft',
                      )
                    : null;
                }),
              ])
                .then(() => {
                  setSaved(true);
                  showNotice(
                    `Absensi ${sessionTitle || activeClassName} (${activeClassName}) berhasil disimpan sebagai draft.`,
                  );
                })
                .catch((err) => {
                  setSaved(false);
                  Alert.alert('Gagal menyimpan', err instanceof Error ? err.message : String(err));
                });
            }}
            onFinalize={(reason, sessionTitle) => {
              void loadTeachingSessions(db, attendanceDate, selectedClassId)
                .then((sessions) => {
                  const target =
                    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
                  return target
                    ? saveAttendanceSession(
                        db,
                        target.id,
                        students.map((student) => ({
                          studentId: student.id,
                          status: student.status,
                          note: student.note,
                        })),
                        'final',
                        reason || 'Finalisasi absensi',
                      )
                    : saveAttendanceDraft(db, selectedClassId, attendanceDate, students);
                })
                .then(() => {
                  setSaved(true);
                  showNotice(
                    `Absensi ${sessionTitle || ''} ${activeClassName} berhasil difinalisasi & dikunci.`,
                  );
                })
                .catch((err) => {
                  setSaved(false);
                  Alert.alert(
                    'Perlu Alasan Koreksi',
                    err instanceof Error ? err.message : String(err),
                  );
                });
            }}
          />
        )}
        {activeTab === 'Kelas' && (
          <ClassScreen
            db={db}
            classes={classes}
            selectedClassId={selectedClassId}
            onSelectClass={(id) => setSelectedClassId(id)}
            onClassesChanged={async () => {
              const rows = await loadClasses(db);
              setClasses(rows);
              if (rows.length && !selectedClassId) setSelectedClassId(rows[0].id);
            }}
            students={students}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            yearLabel={academicContext?.year_label ?? '2026/2027'}
            onNotify={showNotice}
            onAddStudent={async (name, nis) => {
              await addStudent(db, selectedClassId, `student-${Date.now()}`, name, nis);
              refreshStudents();
              showNotice(`Siswa ${name} (NIS ${nis}) ditambahkan.`);
            }}
            onUpdateStudent={async (id, name, nis) => {
              await db.runAsync(
                'UPDATE students SET name = ?, nis = ? WHERE id = ?',
                name.trim(),
                nis.trim() || null,
                id,
              );
              refreshStudents();
              showNotice(`Data ${name} berhasil diperbarui.`);
            }}
            onArchiveStudent={async (id) => {
              await db.runAsync(
                'UPDATE students SET archived_at = ? WHERE id = ?',
                new Date().toISOString(),
                id,
              );
              refreshStudents();
              showNotice('Siswa diarsipkan.');
            }}
            onReorderStudent={async (id, direction) => {
              await reorderStudent(db, selectedClassId, id, direction);
              refreshStudents();
            }}
            onRestoreStudent={async (id) => {
              await restoreStudent(db, id);
              refreshStudents();
              showNotice('Siswa dipulihkan dari arsip.');
            }}
            onDownloadTemplate={async () => {
              const sheet = XLSX.utils.json_to_sheet([
                { Nama: 'Contoh Nama Siswa', NIS: '26001', JK: 'P' },
              ]);
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
                type: '*/*',
              });
              if (result.canceled) return;
              let workbook: XLSX.WorkBook;
              try {
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
              const candidates = rows.map((row, index) => ({
                rowNumber: index + 2,
                name: String(row.Nama ?? row.nama ?? row.Name ?? row.name ?? '').trim(),
                nis: String(row.NIS ?? row.nis ?? row.NomorInduk ?? '').trim(),
              }));
              const existingNis = new Set(
                students.map((student) => student.nis?.trim() ?? '').filter(Boolean),
              );
              const { valid, errors } = validateNisImportCandidates(candidates, existingNis);
              if (errors.length > 0) {
                const errorPreview = errors
                  .slice(0, 4)
                  .map((e) => `• ${e.reason}`)
                  .join('\n');
                Alert.alert(
                  'Validasi Import NIS',
                  `${errors.length} baris bermasalah:\n${errorPreview}\n\n${valid.length} baris valid siap diimpor.`,
                  [
                    { text: 'Batalkan', style: 'cancel' },
                    ...(valid.length
                      ? [
                          {
                            text: `Impor ${valid.length} Siswa Valid`,
                            onPress: async () => {
                              for (const candidate of valid) {
                                await addStudent(
                                  db,
                                  selectedClassId,
                                  `student-${Date.now()}-${candidate.nis}`,
                                  candidate.name,
                                  candidate.nis,
                                );
                              }
                              refreshStudents();
                              showNotice(`${valid.length} siswa berhasil diimpor dengan NIS.`);
                            },
                          },
                        ]
                      : []),
                  ],
                );
                return;
              }
              Alert.alert(
                'Pratinjau Import Siswa',
                `${valid.length} siswa dengan NIS unik siap disimpan ke ${activeClassName}.`,
                [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Simpan Import',
                    onPress: async () => {
                      for (const candidate of valid) {
                        await addStudent(
                          db,
                          selectedClassId,
                          `student-${Date.now()}-${candidate.nis}`,
                          candidate.name,
                          candidate.nis,
                        );
                      }
                      refreshStudents();
                      showNotice(`${valid.length} siswa berhasil diimpor.`);
                    },
                  },
                ],
              );
            }}
          />
        )}
        {activeTab === 'Jadwal' && (
          <ScheduleScreen
            db={db}
            classId={selectedClassId}
            classes={classes}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            semesterStart={academicContext?.start_date ?? '2026-07-01'}
            semesterEnd={academicContext?.end_date ?? '2026-12-31'}
            onNotify={showNotice}
            onOpenSessionAction={(session, targetTab) => {
              setActiveSessionId(session.id);
              setAttendanceDate(session.session_date);
              navigate(targetTab);
            }}
          />
        )}
        {activeTab === 'Laporan' && (
          <ReportScreen
            db={db}
            classId={selectedClassId}
            className={activeClassName}
            students={students}
            academicContext={academicContext}
            onRestoreComplete={refreshAllData}
            onNotify={showNotice}
          />
        )}
        {activeTab === 'Jurnal' && (
          <JournalScreen
            db={db}
            classId={selectedClassId}
            className={activeClassName}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            activeSessionId={activeSessionId}
            onDirtyChange={setJournalDirty}
            onNotify={showNotice}
            onRegisterSave={(save) => {
              journalSaveRef.current = save;
            }}
          />
        )}
        {activeTab === 'Nilai' && (
          <GradeScreen
            db={db}
            classId={selectedClassId}
            className={activeClassName}
            teacherName={academicContext?.teacher_name ?? 'Guru'}
            activeSessionId={activeSessionId}
            students={students}
            onNotify={showNotice}
          />
        )}
        {activeTab === 'Pengaturan' && (
          <SettingsScreen
            db={db}
            context={academicContext}
            onBack={() => navigate('Beranda')}
            onEditProfile={() => setContextEditorVisible(true)}
            onRefreshAll={refreshAllData}
            onNotify={showNotice}
          />
        )}
        <BottomNavigation activeTab={activeTab} onChange={navigate} />
        <Modal visible={!academicContext} animationType="fade">
          <AcademicSetupScreen
            db={db}
            onComplete={async (context) => {
              setAcademicContext(context);
              await refreshAllData();
              showNotice('Setup KelasRapi selesai. Selamat mengajar!');
            }}
          />
        </Modal>
        <Modal
          visible={contextEditorVisible}
          animationType="slide"
          onRequestClose={() => setContextEditorVisible(false)}
        >
          <AcademicSetupScreen
            db={db}
            initialContext={academicContext}
            onCancel={() => setContextEditorVisible(false)}
            onComplete={async (context) => {
              setAcademicContext(context);
              setContextEditorVisible(false);
              await refreshAllData();
              showNotice('Profil & konteks akademik diperbarui.');
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
  onCancel,
  onComplete,
}: {
  db: SQLiteDatabase;
  initialContext?: Awaited<ReturnType<typeof loadActiveAcademicContext>>;
  onCancel?: () => void;
  onComplete: (context: Awaited<ReturnType<typeof loadActiveAcademicContext>>) => void;
}) {
  const [step, setStep] = useState(1);
  const [teacherName, setTeacherName] = useState(initialContext?.teacher_name ?? '');
  const [teacherNip, setTeacherNip] = useState(initialContext?.nip_nuptk ?? '');
  const [appMode, setAppMode] = useState<'real' | 'demo'>(
    (initialContext?.app_mode as 'real' | 'demo') ?? 'real',
  );
  const [schoolName, setSchoolName] = useState(initialContext?.school_name ?? '');
  const [schoolAddress, setSchoolAddress] = useState(initialContext?.school_address ?? '');
  const [city, setCity] = useState(initialContext?.city ?? 'Pekanbaru');
  const [principalName, setPrincipalName] = useState(initialContext?.principal_name ?? '');
  const [principalNip, setPrincipalNip] = useState(initialContext?.principal_nip ?? '');
  const [yearLabel, setYearLabel] = useState(initialContext?.year_label ?? '2026/2027');
  const [termLabel, setTermLabel] = useState(initialContext?.term_label ?? 'Semester 1 (Ganjil)');
  const [startDate, setStartDate] = useState(initialContext?.start_date ?? '2026-07-13');
  const [endDate, setEndDate] = useState(initialContext?.end_date ?? '2026-12-19');
  const [defaultSubjectName, setDefaultSubjectName] = useState('Matematika');
  const [initialClassName, setInitialClassName] = useState('Kelas 2B');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!teacherName.trim() || !schoolName.trim() || !yearLabel.trim() || !termLabel.trim()) {
      setError('Nama guru, sekolah, tahun ajaran, dan semester wajib diisi.');
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      startDate > endDate
    ) {
      setError('Rentang tanggal harus menggunakan format YYYY-MM-DD yang valid.');
      return;
    }
    try {
      await saveAcademicContext(db, {
        teacherId: 'teacher-local',
        teacherName,
        teacherNip,
        schoolId: 'school-local',
        schoolName,
        schoolAddress,
        principalName,
        principalNip,
        city,
        yearId: `year-${yearLabel.replace(/[^0-9]/g, '-')}`,
        yearLabel,
        termId: `term-${yearLabel.replace(/[^0-9]/g, '-')}-${termLabel.replace(/\s+/g, '-')}`,
        termLabel,
        termNumber: termLabel.toLowerCase().includes('2') ? 2 : 1,
        startDate,
        endDate,
        appMode,
        defaultSubjectName,
        initialClassName,
      });
      onComplete(await loadActiveAcademicContext(db));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : 'Profil belum dapat disimpan.',
      );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.setupContent}>
      <View style={styles.wizardBadgeRow}>
        {[1, 2, 3].map((item) => (
          <Pressable
            key={item}
            onPress={() => setStep(item)}
            style={[styles.wizardStepBadge, step === item && styles.wizardStepBadgeActive]}
          >
            <Text style={[styles.wizardStepText, step === item && styles.wizardStepTextActive]}>
              Langkah {item}/3
            </Text>
          </Pressable>
        ))}
      </View>
      <Ionicons name="school-outline" size={42} color={activePalette.accent} />
      <Text style={styles.screenTitle}>Wizard Setup KelasRapi</Text>
      <Text style={styles.helpText}>
        Alur terstruktur: Profil Guru → Sekolah → Tahun Ajaran & Semester → Mapel & Kelas Awal.
      </Text>

      {step === 1 ? (
        <View>
          <Text style={styles.fieldLabel}>1. Profil Guru & Sekolah</Text>
          <TextInput
            value={teacherName}
            onChangeText={setTeacherName}
            placeholder="Nama lengkap guru & gelar"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="Nama guru"
          />
          <TextInput
            value={teacherNip}
            onChangeText={setTeacherNip}
            placeholder="NIP / NUPTK (untuk laporan resmi)"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="NIP atau NUPTK"
          />
          <TextInput
            value={schoolName}
            onChangeText={setSchoolName}
            placeholder="Nama sekolah (contoh: SDN 01 Pekanbaru)"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="Nama sekolah"
          />
          <TextInput
            value={schoolAddress}
            onChangeText={setSchoolAddress}
            placeholder="Alamat lengkap sekolah"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="Alamat sekolah"
          />
          <View style={styles.scheduleInputRow}>
            <TextInput
              value={principalName}
              onChangeText={setPrincipalName}
              placeholder="Nama Kepala Sekolah"
              placeholderTextColor="#8A9AAF"
              style={styles.textInputHalf}
            />
            <TextInput
              value={principalNip}
              onChangeText={setPrincipalNip}
              placeholder="NIP Kepsek"
              placeholderTextColor="#8A9AAF"
              style={styles.textInputHalf}
            />
          </View>
          <Pressable onPress={() => setStep(2)} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Lanjut ke Tahun Ajaran ›</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Text style={styles.fieldLabel}>2. Tahun Ajaran & Semester Aktif</Text>
          <TextInput
            value={yearLabel}
            onChangeText={setYearLabel}
            placeholder="Tahun ajaran, contoh 2026/2027"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="Tahun ajaran"
          />
          <TextInput
            value={termLabel}
            onChangeText={setTermLabel}
            placeholder="Semester 1 (Ganjil) / Semester 2 (Genap)"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
            accessibilityLabel="Semester"
          />
          <View style={styles.scheduleInputRow}>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="Mulai YYYY-MM-DD"
              placeholderTextColor="#8A9AAF"
              style={styles.textInputHalf}
              accessibilityLabel="Tanggal mulai semester"
            />
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="Selesai YYYY-MM-DD"
              placeholderTextColor="#8A9AAF"
              style={styles.textInputHalf}
              accessibilityLabel="Tanggal selesai semester"
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable onPress={() => setStep(1)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>‹ Kembali</Text>
            </Pressable>
            <Pressable onPress={() => setStep(3)} style={styles.confirmButton}>
              <Text style={styles.confirmText}>Lanjut ›</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View>
          <Text style={styles.fieldLabel}>3. Mata Pelajaran, Kelas Awal & Mode Data</Text>
          <TextInput
            value={defaultSubjectName}
            onChangeText={setDefaultSubjectName}
            placeholder="Mata pelajaran utama (contoh: Matematika)"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
          />
          <TextInput
            value={initialClassName}
            onChangeText={setInitialClassName}
            placeholder="Kelas awal (contoh: Kelas 2B)"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
          />
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Kota tanda tangan laporan"
            placeholderTextColor="#8A9AAF"
            style={styles.textInput}
          />
          <Text style={styles.fieldLabel}>Mode Kerja Aplikasi (Task 2.2)</Text>
          <View style={styles.recapPeriodRow}>
            <Pressable
              onPress={() => setAppMode('real')}
              style={[styles.recapPeriod, appMode === 'real' && styles.recapPeriodSelected]}
            >
              <Text
                style={[
                  styles.recapPeriodText,
                  appMode === 'real' && styles.recapPeriodTextSelected,
                ]}
              >
                Mode Nyata (Tanpa Dummy)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAppMode('demo')}
              style={[styles.recapPeriod, appMode === 'demo' && styles.recapPeriodSelected]}
            >
              <Text
                style={[
                  styles.recapPeriodText,
                  appMode === 'demo' && styles.recapPeriodTextSelected,
                ]}
              >
                Mode Demo (Data Contoh)
              </Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.formError}>{error}</Text> : null}
          <Pressable onPress={submit} style={styles.saveButton} accessibilityRole="button">
            <Text style={styles.saveButtonText}>Simpan & Mulai KelasRapi</Text>
          </Pressable>
          <View style={styles.modalActions}>
            <Pressable onPress={() => setStep(2)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>‹ Kembali</Text>
            </Pressable>
            {onCancel ? (
              <Pressable onPress={onCancel} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Tutup</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
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
  onOpenSchedule,
  onOpenClasses,
  onOpenReport,
  className,
  studentCount,
  missingNisCount,
  attendanceRate,
  teacherName,
  academicYearLabel,
  termLabel,
  appMode,
  onOpenSettings,
  onChangeAcademicContext,
}: {
  db: SQLiteDatabase;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  classId: string;
  onSelectClass: (id: string) => void;
  onOpenAttendance: (sessionId?: string, date?: string) => void;
  onOpenJournal: (sessionId?: string) => void;
  onOpenGrades: (sessionId?: string) => void;
  onOpenSchedule: () => void;
  onOpenClasses: () => void;
  onOpenReport: () => void;
  className: string;
  studentCount: number;
  missingNisCount: number;
  attendanceRate: number | null;
  teacherName: string;
  academicYearLabel: string;
  termLabel: string;
  appMode: string;
  onOpenSettings: () => void;
  onChangeAcademicContext: () => void;
}) {
  const [todaySchedule, setTodaySchedule] = useState<Awaited<ReturnType<typeof loadSchedules>>>([]);
  const [todaySessions, setTodaySessions] = useState<
    Awaited<ReturnType<typeof loadTeachingSessions>>
  >([]);
  const [journalCompleted, setJournalCompleted] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [attendanceAlerts, setAttendanceAlerts] = useState<
    Awaited<ReturnType<typeof loadAttendanceAlerts>>
  >([]);
  const [pendingGradesCount, setPendingGradesCount] = useState(0);
  const [upcomingTasksCount, setUpcomingTasksCount] = useState(0);

  useEffect(() => {
    if (!classId) return;
    const today = localDateKey();
    Promise.all([
      loadSchedules(db, classId),
      loadScheduleExceptions(db, classId, today),
      loadAttendanceAlerts(db, classId, today),
      loadTeachingSessions(db, today, classId),
      loadJournal(db, classId, today),
      loadGradeComponents(db, classId),
      loadAgendas(db, classId),
    ])
      .then(([rows, exceptions, alerts, sessions, journal, components, agendas]) => {
        setAttendanceAlerts(alerts);
        setTodaySessions(sessions);
        setJournalCompleted(
          Boolean(
            (journal?.content?.trim() || journal?.material?.trim()) && journal.state === 'submitted',
          ),
        );
        setPendingGradesCount(components.filter((c) => c.state !== 'final').length);
        setUpcomingTasksCount(agendas.filter((a) => !a.completed_at).length);
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

  const unfilledSessionsCount = todaySessions.filter(
    (s) => s.attendance_state !== 'final' && s.attendance_state !== 'draft',
  ).length;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.dashboardHeader}>
        <View>
          <Text style={styles.brand}>KelasRapi</Text>
          <Text style={styles.quickSubtitle}>
            {academicYearLabel} · {termLabel} · {appMode === 'demo' ? 'Mode Demo' : 'Mode Nyata'}
          </Text>
        </View>
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
            style={[styles.classPickerChip, classId === item.id && styles.classPickerChipSelected]}
          >
            <Text
              style={[
                styles.classPickerText,
                classId === item.id && styles.classPickerTextSelected,
              ]}
            >
              {item.year_label ? `${item.year_label} · ${item.name}` : item.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.greeting}>Selamat bertugas, {teacherName}</Text>
      <Text style={styles.date}>{localLongDate()}</Text>
      <Pressable
        onPress={onChangeAcademicContext}
        style={styles.contextSwitchButton}
        accessibilityRole="button"
      >
        <Ionicons name="school-outline" size={18} color={activePalette.primary} />
        <Text style={styles.contextSwitchText}>Ubah Tahun Ajaran / Konteks Akademik</Text>
      </Pressable>

      <LinearGradient
        colors={[activePalette.surfaceRaised, activePalette.surfaceSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroIllustration}>
            <Ionicons name="library-outline" size={38} color={activePalette.accent} />
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle}>{className}</Text>
            <Text style={styles.heroSubtitle}>
              {studentCount > 0 ? `${studentCount} siswa terdaftar` : 'Belum ada siswa terdaftar'}
            </Text>
            <Text style={styles.fieldHelp}>
              {attendanceRate === null
                ? 'Kehadiran: Belum ada cukup data'
                : `Kehadiran aktual: ${attendanceRate}%`}
            </Text>
          </View>
          <View style={styles.progressRing}>
            <Text style={styles.progressValue}>
              {attendanceRate === null ? '—' : `${attendanceRate}%`}
            </Text>
            <Text style={styles.progressLabel}>
              {attendanceRate === null ? 'Belum ada' : 'Hadir'}
            </Text>
          </View>
        </View>

        {/* Task 5.1: Ringkasan Hari Ini */}
        <View style={styles.metricRow}>
          <MetricCard label="Sesi Hari Ini" value={`${todaySessions.length} sesi`} />
          <MetricCard label="Absensi Belum" value={`${unfilledSessionsCount} sesi`} />
          <MetricCard label="Nilai Draft" value={`${pendingGradesCount} komp`} />
          <MetricCard label="Tugas Aktif" value={`${upcomingTasksCount} tugas`} />
        </View>
      </LinearGradient>

      {/* Task 5.3: Tindakan Cepat */}
      <Text style={styles.sectionTitle}>Tindakan cepat</Text>
      <View style={styles.quickRow}>
        <QuickAction
          icon="checkbox-outline"
          title="Isi Absensi"
          subtitle="Dari sesi jadwal"
          onPress={() => onOpenAttendance(todaySessions[0]?.id, localDateKey())}
        />
        <QuickAction
          icon="stats-chart-outline"
          title="Tambah Nilai"
          subtitle="KKM & predikat"
          onPress={() => onOpenGrades(todaySessions[0]?.id)}
        />
        <QuickAction
          icon="book-outline"
          title="Isi Jurnal"
          subtitle="Materi & tugas"
          onPress={() => onOpenJournal(todaySessions[0]?.id)}
        />
        <QuickAction
          icon="calendar-outline"
          title="Lihat Jadwal"
          subtitle="1 semester"
          onPress={onOpenSchedule}
        />
        <QuickAction
          icon="people-outline"
          title="Kelola Siswa"
          subtitle="NIS & kenaikan"
          onPress={onOpenClasses}
        />
        <QuickAction
          icon="document-text-outline"
          title="Buat Laporan"
          subtitle="Cetak PDF / XLSX"
          onPress={onOpenReport}
        />
      </View>

      {/* Task 5.4: Peringatan */}
      {attendanceAlerts.length ? (
        <View style={styles.attendanceAlertCard}>
          <Ionicons name="warning-outline" size={25} color="#C36F0C" />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>Siswa absen melebihi batas</Text>
            <Text style={styles.alertSubtitle}>
              {attendanceAlerts.length} siswa tercatat tidak hadir lebih dari 3 kali dalam 30 hari.
            </Text>
            {attendanceAlerts.slice(0, 3).map((item) => (
              <Text key={item.id} style={styles.alertDetail}>
                • {item.name} ({item.nis ? `NIS ${item.nis}` : 'Tanpa NIS'}) — {item.missed_days}{' '}
                hari
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {missingNisCount ? (
        <View style={styles.scheduleNotice}>
          <Ionicons name="id-card-outline" size={24} color="#C36F0C" />
          <Text style={styles.scheduleNoticeText}>
            {missingNisCount} siswa belum memiliki NIS. Lengkapi di menu Kelas sebelum mencetak
            laporan.
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pertemuan & jadwal hari ini</Text>
        <Pressable onPress={onOpenSchedule}>
          <Text style={styles.sectionLink}>Kelola jadwal ›</Text>
        </Pressable>
      </View>

      {scheduleNotice ? (
        <View style={styles.scheduleNotice}>
          <Ionicons name="alert-circle-outline" size={24} color="#C36F0C" />
          <Text style={styles.scheduleNoticeText}>{scheduleNotice}</Text>
        </View>
      ) : null}

      {todaySessions.length ? (
        todaySessions.map((session) => (
          <View key={session.id} style={styles.scheduleCard}>
            <View style={styles.scheduleTime}>
              <Ionicons name="time-outline" size={20} color={activePalette.primary} />
              <Text style={styles.scheduleTimeText}>
                {session.start_time}–{session.end_time}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.studentName}>{session.title}</Text>
              <Text style={styles.quickSubtitle}>
                Absensi: {session.attendance_state ?? 'Belum diisi'} · Jurnal:{' '}
                {session.journal_state ?? 'Belum diisi'}
              </Text>
            </View>
            <Pressable
              onPress={() => onOpenAttendance(session.id, session.session_date)}
              style={styles.restoreButton}
            >
              <Text style={styles.restoreText}>Buka Sesi</Text>
            </Pressable>
          </View>
        ))
      ) : todaySchedule.length ? (
        <View style={styles.scheduleCard}>
          <View style={styles.scheduleTime}>
            <Ionicons name="time-outline" size={22} color={activePalette.primary} />
            <Text style={styles.scheduleTimeText}>{todaySchedule[0].start_time}</Text>
          </View>
          <Text style={styles.scheduleTitle}>{todaySchedule[0].title}</Text>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.placeholderText}>
            Belum ada pertemuan terjadwal hari ini. Buat jadwal semester di menu Jadwal.
          </Text>
        </View>
      )}

      {!journalCompleted ? (
        <View style={styles.journalAlert}>
          <Ionicons name="warning-outline" size={28} color="#E58A23" />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>Jurnal pertemuan belum selesai</Text>
            <Text style={styles.alertSubtitle}>
              Lengkapi materi, tujuan, dan metode mengajar untuk {className}.
            </Text>
          </View>
          <Pressable onPress={() => onOpenJournal(todaySessions[0]?.id)}>
            <Text style={styles.alertAction}>Isi jurnal</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.journalCompleteCard}>
          <Ionicons name="checkmark-circle-outline" size={28} color={activePalette.primary} />
          <Text style={styles.alertTitle}>Jurnal pembelajaran hari ini sudah selesai</Text>
        </View>
      )}
    </ScrollView>
  );
}

function SettingsScreen({
  db,
  context,
  onBack,
  onEditProfile,
  onRefreshAll,
  onNotify,
}: {
  db: SQLiteDatabase;
  context: Awaited<ReturnType<typeof loadActiveAcademicContext>>;
  onBack: () => void;
  onEditProfile: () => void;
  onRefreshAll: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof loadAuditHistory>>>([]);
  const [pinInput, setPinInput] = useState(context?.pin_code ?? '');

  useEffect(() => {
    loadAuditHistory(db, 15)
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]));
  }, [db]);

  const setThemePreference = async (theme: 'system' | 'light' | 'dark') => {
    await db.runAsync('UPDATE teacher_profiles SET theme_preference = ?', theme);
    await onRefreshAll();
    onNotify(`Tema diubah ke ${theme}.`);
  };

  const toggleAppMode = async (mode: 'real' | 'demo') => {
    await db.runAsync('UPDATE teacher_profiles SET app_mode = ?', mode);
    await onRefreshAll();
    onNotify(
      mode === 'real'
        ? 'Mode Nyata aktif (bebas data dummy).'
        : 'Mode Demo aktif (mengizinkan data simulasi).',
    );
  };

  const savePin = async () => {
    await db.runAsync('UPDATE teacher_profiles SET pin_code = ?', pinInput.trim() || null);
    await onRefreshAll();
    onNotify(pinInput.trim() ? 'PIN keamanan lokal diaktifkan.' : 'PIN keamanan dinonaktifkan.');
  };

  const clearLocalData = () => {
    Alert.alert(
      'Hapus seluruh data lokal?',
      'Tindakan ini akan mengosongkan siswa, jadwal, absensi, nilai, dan jurnal di perangkat ini. Pastikan Anda sudah membuat backup.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Semua Data',
          style: 'destructive',
          onPress: async () => {
            for (const table of [
              'attendance_records',
              'attendance_sessions',
              'attendance_drafts',
              'assessment_scores',
              'assessments',
              'scores',
              'grading_components',
              'lesson_journals',
              'journals',
              'tasks',
              'agendas',
              'teaching_sessions',
              'schedule_templates',
              'schedules',
              'schedule_exceptions',
              'student_enrollments',
              'students',
            ]) {
              await db.runAsync(`DELETE FROM ${table}`);
            }
            await onRefreshAll();
            onNotify('Seluruh data akademik lokal telah dibersihkan.');
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsHeader}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.settingsBackButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={22} color={activePalette.text} />
        </Pressable>
        <View style={styles.settingsHeaderCopy}>
          <Text style={styles.screenTitle}>Pengaturan Lengkap</Text>
          <Text style={styles.helpText}>
            Profil Guru, Sekolah, Tahun Ajaran, Tema, Privasi, Audit Log & Data Lokal.
          </Text>
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Ionicons name="person" size={30} color={activePalette.accent} />
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>
            {context?.teacher_name ?? 'Profil guru belum diatur'}
          </Text>
          <Text style={styles.profileSchool}>
            NIP/NUPTK: {context?.nip_nuptk || 'Belum diisi'} ·{' '}
            {context?.school_name ?? 'Sekolah belum diatur'}
          </Text>
        </View>
        <Pressable onPress={onEditProfile} style={styles.outlineAction}>
          <Text style={styles.outlineActionText}>Edit</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Konteks Akademik & Sekolah</Text>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.studentName}>
          {context?.year_label ?? '—'} · {context?.term_label ?? '—'}
        </Text>
        <Text style={styles.quickSubtitle}>
          Rentang Semester: {context?.start_date ?? '—'} s.d. {context?.end_date ?? '—'}
        </Text>
        <Text style={styles.quickSubtitle}>
          Kepala Sekolah: {context?.principal_name || '—'} (NIP: {context?.principal_nip || '—'})
        </Text>
        <Text style={styles.quickSubtitle}>
          Alamat Sekolah: {context?.school_address || '—'} ({context?.city || '—'})
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Tema & Mode Aplikasi</Text>
      <View style={styles.recapPeriodRow}>
        {(['system', 'light', 'dark'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => void setThemePreference(t)}
            style={[
              styles.recapPeriod,
              (context?.theme_preference ?? 'system') === t && styles.recapPeriodSelected,
            ]}
          >
            <Text
              style={[
                styles.recapPeriodText,
                (context?.theme_preference ?? 'system') === t && styles.recapPeriodTextSelected,
              ]}
            >
              {t === 'system' ? 'Sistem' : t === 'light' ? 'Terang' : 'Gelap'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.recapPeriodRow, { marginTop: 10 }]}>
        {(['real', 'demo'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => void toggleAppMode(m)}
            style={[
              styles.recapPeriod,
              (context?.app_mode ?? 'real') === m && styles.recapPeriodSelected,
            ]}
          >
            <Text
              style={[
                styles.recapPeriodText,
                (context?.app_mode ?? 'real') === m && styles.recapPeriodTextSelected,
              ]}
            >
              {m === 'real' ? 'Mode Produksi (Nyata)' : 'Mode Demo (Simulasi)'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Keamanan PIN & Sinkronisasi Cloud</Text>
      <View style={styles.settingsInfoCard}>
        <Text style={styles.quickSubtitle}>
          Status Cloud Sync: Local-First Aktif (Tidak ada pengiriman data tanpa persetujuan).
        </Text>
        <View style={styles.scheduleInputRow}>
          <TextInput
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="PIN 4–6 digit (opsional)"
            placeholderTextColor="#8A9AAF"
            secureTextEntry
            keyboardType="number-pad"
            style={styles.textInputHalf}
          />
          <Pressable onPress={() => void savePin()} style={styles.confirmButton}>
            <Text style={styles.confirmText}>Simpan PIN</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Riwayat Audit Perubahan ({auditLogs.length})</Text>
      <View style={styles.settingsInfoCard}>
        {auditLogs.length ? (
          auditLogs.slice(0, 6).map((log) => (
            <View key={log.id} style={styles.recapRow}>
              <Text style={styles.quickSubtitle}>
                {log.entity_type} · {log.action} ({log.reason || 'Tanpa alasan'})
              </Text>
              <Text style={styles.fieldHelp}>{log.created_at.slice(0, 10)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.quickSubtitle}>Belum ada log perubahan tercatat.</Text>
        )}
      </View>

      <Pressable
        onPress={clearLocalData}
        style={[styles.primarySettingsAction, { backgroundColor: '#C94F3B' }]}
      >
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.primarySettingsActionText}>Hapus Seluruh Data Akademik Lokal</Text>
      </Pressable>
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
      <Ionicons name={icon} size={26} color={activePalette.accent} />
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
  teacherName,
  attendanceDate,
  onAttendanceDateChange,
  activeSessionId,
  onSelectSession,
  students,
  saved,
  presentCount,
  onMarkAllPresent,
  onBulkUpdateStatus,
  onUndoBulkChange,
  canUndoBulk,
  onUpdateStatus,
  onUpdateNote,
  onNotify,
  onSave,
  onFinalize,
}: {
  db: SQLiteDatabase;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  classId: string;
  onSelectClass: (id: string) => void;
  className: string;
  teacherName: string;
  attendanceDate: string;
  onAttendanceDateChange: (date: string) => void;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string, date: string) => void;
  students: Student[];
  saved: boolean;
  presentCount: number;
  onMarkAllPresent: () => void;
  onBulkUpdateStatus: (status: AttendanceStatus) => void;
  onUndoBulkChange: () => void;
  canUndoBulk: boolean;
  onUpdateStatus: (id: string, status: AttendanceStatus) => void;
  onUpdateNote: (id: string, note: string) => void;
  onNotify: (msg: string) => void;
  onSave: (sessionTitle?: string) => void;
  onFinalize: (reason?: string, sessionTitle?: string) => void;
}) {
  const [entryVisible, setEntryVisible] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
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
  const [allClassSessions, setAllClassSessions] = useState<
    Awaited<ReturnType<typeof loadAllTeachingSessionsForClass>>
  >([]);

  const attendanceSummary = useMemo(
    () => ({
      hadir: students.filter((student) => student.status === 'Hadir').length,
      sakit: students.filter((student) => student.status === 'Sakit').length,
      izin: students.filter((student) => student.status === 'Izin').length,
      alpa: students.filter((student) => student.status === 'Alpa').length,
      belum: students.filter((student) => student.status === 'Belum diisi').length,
    }),
    [students],
  );

  useEffect(() => {
    if (showRecap && classId) {
      loadAttendanceRecap(db, classId, period, attendanceDate, customStart, customEnd)
        .then(setRecap)
        .catch(() => setRecap([]));
      loadAttendanceStudentRecap(db, classId, period, attendanceDate, customStart, customEnd)
        .then(setStudentRecap)
        .catch(() => setStudentRecap([]));
    }
  }, [attendanceDate, classId, customEnd, customStart, db, period, showRecap]);

  useEffect(() => {
    if (!classId) return;
    loadTeachingSessions(db, attendanceDate, classId)
      .then(setSessions)
      .catch(() => setSessions([]));
    loadAllTeachingSessionsForClass(db, classId, 30)
      .then(setAllClassSessions)
      .catch(() => setAllClassSessions([]));
  }, [attendanceDate, classId, db, saved]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Absensi Pertemuan · {className}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classPickerRow}>
        {classes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectClass(item.id)}
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

      {/* Task 6.1: Daftar Sesi Pertemuan */}
      {!entryVisible ? (
        <>
          <View style={styles.workflowSummaryCard}>
            <Text style={styles.sectionTitle}>Daftar Sesi Pertemuan ({className})</Text>
            <Text style={styles.helpText}>
              Pilih sesi pertemuan dari jadwal untuk mengisi absensi tanpa mengetik ulang konteks.
            </Text>
            {allClassSessions.length ? (
              allClassSessions.map((sess) => (
                <Pressable
                  key={sess.id}
                  onPress={() => {
                    onSelectSession(sess.id, sess.session_date);
                    setEntryVisible(true);
                  }}
                  style={styles.classStudentRow}
                >
                  <View style={styles.studentRowCopy}>
                    <Text style={styles.studentName}>
                      {sess.session_date} · {sess.start_time}–{sess.end_time}
                    </Text>
                    <Text style={styles.quickSubtitle}>
                      {sess.title} · Kelas {className} · Status:{' '}
                      {sess.attendance_state === 'final'
                        ? 'Final (Terkunci)'
                        : sess.attendance_state === 'draft'
                          ? 'Draft'
                          : 'Belum diisi'}
                    </Text>
                    <Text style={styles.fieldHelp}>
                      Hadir: {sess.present_count ?? 0} siswa · Belum diisi:{' '}
                      {Math.max(0, students.length - (sess.present_count ?? 0))} siswa
                    </Text>
                  </View>
                  <View style={styles.restoreButton}>
                    <Text style={styles.restoreText}>Isi Absensi</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <Text style={styles.placeholderText}>
                Belum ada sesi pertemuan dari jadwal. Anda tetap dapat mengisi absensi harian.
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => setEntryVisible(true)}
            style={({ pressed }) => [styles.addStudentButton, pressed && styles.pressed]}
          >
            <Ionicons name="create-outline" size={22} color="#FFFFFF" />
            <Text style={styles.addStudentText}>Buka Form Input Absensi ({attendanceDate})</Text>
          </Pressable>
        </>
      ) : null}

      <View style={!entryVisible ? styles.hidden : undefined}>
        {/* Task 6.2: Konteks Otomatis dari Jadwal & Profil */}
        <View style={styles.sessionContextCard}>
          <Ionicons name="school-outline" size={22} color={activePalette.primary} />
          <View style={styles.alertCopy}>
            <Text style={styles.sessionContextTitle}>
              {activeSession ? activeSession.title : 'Sesi Harian'} · {className}
            </Text>
            <Text style={styles.sessionContextText}>
              Guru: {teacherName} · Tanggal: {attendanceDate} · Jam:{' '}
              {activeSession ? `${activeSession.start_time}–${activeSession.end_time}` : 'Harian'} ·{' '}
              {students.length} Siswa
            </Text>
          </View>
        </View>

        <View style={styles.attendanceDateToolbar}>
          <Pressable
            onPress={() => onAttendanceDateChange(shiftDate(attendanceDate, -1))}
            style={styles.dateStepButton}
          >
            <Ionicons name="chevron-back" size={20} color="#24354D" />
          </Pressable>
          <Pressable onPress={() => setDatePickerVisible(true)} style={styles.selectedDateButton}>
            <Text style={styles.selectedDateText}>{attendanceDate}</Text>
            <Text style={styles.selectedDateHint}>Ketuk untuk ganti tanggal sesi</Text>
          </Pressable>
          <Pressable
            onPress={() => onAttendanceDateChange(shiftDate(attendanceDate, 1))}
            style={styles.dateStepButton}
          >
            <Ionicons name="chevron-forward" size={20} color="#24354D" />
          </Pressable>
        </View>

        {/* Task 6.3: Input Massal Lengkap + Undo */}
        <View style={styles.attendanceToolbar}>
          <Pressable onPress={onMarkAllPresent} style={styles.toolbarAction}>
            <Text style={styles.toolbarActionText}>Semua Hadir</Text>
          </Pressable>
          <Pressable onPress={() => onBulkUpdateStatus('Izin')} style={styles.toolbarAction}>
            <Text style={styles.toolbarActionText}>Semua Izin</Text>
          </Pressable>
          <Pressable onPress={() => onBulkUpdateStatus('Sakit')} style={styles.toolbarAction}>
            <Text style={styles.toolbarActionText}>Semua Sakit</Text>
          </Pressable>
          <Pressable onPress={() => onBulkUpdateStatus('Alpa')} style={styles.toolbarAction}>
            <Text style={styles.toolbarActionText}>Semua Alpa</Text>
          </Pressable>
          {canUndoBulk ? (
            <Pressable onPress={onUndoBulkChange} style={styles.toolbarAction}>
              <Text style={[styles.toolbarActionText, { color: activePalette.primary }]}>
                Undo Massal
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.fieldHelp}>
          Ringkasan Sesi: Hadir {presentCount} · Sakit {attendanceSummary.sakit} · Izin{' '}
          {attendanceSummary.izin} · Alpa {attendanceSummary.alpa} · Belum diisi{' '}
          {attendanceSummary.belum}
        </Text>

        {students.slice(0, visibleStudentCount).map((student) => (
          <View key={student.id} style={styles.studentCard}>
            <Text style={styles.studentName}>
              {student.nis ? `NIS ${student.nis}` : 'NIS belum diisi'} · {student.name}
            </Text>
            <View style={styles.statusRow}>
              {statusOptions.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => onUpdateStatus(student.id, status)}
                  style={[
                    styles.statusChip,
                    student.status === status && styles.statusChipSelected,
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
              onPress={() =>
                setNoteStudentId((current) => (current === student.id ? null : student.id))
              }
              style={styles.noteToggle}
            >
              <Ionicons name="create-outline" size={16} color="#187F79" />
              <Text style={styles.noteToggleText}>
                {student.note ? `Catatan: ${student.note}` : 'Tambah catatan siswa'}
              </Text>
            </Pressable>
            {noteStudentId === student.id ? (
              <TextInput
                value={student.note}
                onChangeText={(note) => onUpdateNote(student.id, note)}
                placeholder="Catatan kejadian/keterangan izin (opsional)"
                placeholderTextColor="#93A4B8"
                style={styles.noteInput}
              />
            ) : null}
          </View>
        ))}

        {/* Task 6.4: Simpan Draft, Finalisasi, dan Koreksi dengan Alasan */}
        <Pressable
          onPress={() => onSave(activeSession?.title)}
          style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
        >
          <LinearGradient colors={['#FF8A72', '#FF6F59']} style={styles.saveGradient}>
            <Text style={styles.saveButtonText}>
              {saved ? 'Draft Absensi Tersimpan' : 'Simpan Draft Absensi'}
            </Text>
          </LinearGradient>
        </Pressable>

        {activeSession?.attendance_state === 'final' ? (
          <Pressable
            onPress={() => setCorrectionModalVisible(true)}
            style={styles.finalizeButton}
          >
            <Text style={styles.finalizeButtonText}>
              Koreksi Absensi Final (Wajib Alasan Koreksi)
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => onFinalize('Finalisasi absensi pertemuan', activeSession?.title)}
            style={styles.finalizeButton}
          >
            <Text style={styles.finalizeButtonText}>Finalisasi & Kunci Absensi</Text>
          </Pressable>
        )}

        <Pressable onPress={() => setEntryVisible(false)} style={styles.recapToggle}>
          <Ionicons name="arrow-back-outline" size={20} color="#187F79" />
          <Text style={styles.recapToggleText}>Kembali ke Daftar Sesi Pertemuan</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setShowRecap((value) => !value)}
        style={styles.recapToggle}
      >
        <Ionicons name="analytics-outline" size={20} color="#187F79" />
        <Text style={styles.recapToggleText}>
          {showRecap ? 'Tutup Rekap Kehadiran' : 'Lihat Rekap Kehadiran Periode'}
        </Text>
      </Pressable>

      {showRecap ? (
        <View style={styles.recapCard}>
          <Text style={styles.alertTitle}>Rekap Kehadiran ({className})</Text>
          <View style={styles.recapPeriodRow}>
            {(['day', 'week', 'month', 'semester', 'custom'] as const).map((item) => (
              <Pressable
                key={item}
                onPress={() => setPeriod(item)}
                style={[styles.recapPeriod, period === item && styles.recapPeriodSelected]}
              >
                <Text
                  style={[
                    styles.recapPeriodText,
                    period === item && styles.recapPeriodTextSelected,
                  ]}
                >
                  {item === 'day'
                    ? 'Harian'
                    : item === 'week'
                      ? 'Mingguan'
                      : item === 'month'
                        ? 'Bulanan'
                        : item === 'semester'
                          ? 'Semester'
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
                style={styles.customRangeInput}
              />
              <TextInput
                value={customEnd}
                onChangeText={setCustomEnd}
                placeholder="Selesai YYYY-MM-DD"
                style={styles.customRangeInput}
              />
            </View>
          ) : null}
          {recap.map((item) => (
            <View key={item.status} style={styles.recapRow}>
              <Text style={styles.studentName}>{item.status}</Text>
              <Text style={styles.countText}>{item.total} catatan</Text>
            </View>
          ))}
          {studentRecap.map((item) => (
            <View key={item.id} style={styles.recapRow}>
              <Text style={styles.quickSubtitle}>
                {item.nis ? `${item.nis} · ` : ''}
                {item.name}
              </Text>
              <Text style={styles.previewStatus}>{item.status}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Modal
        visible={correctionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCorrectionModalVisible(false)}
      >
        <View style={styles.modalScrimCenter}>
          <View style={styles.reasonCard}>
            <Text style={styles.screenTitle}>Alasan Koreksi Absensi Final</Text>
            <Text style={styles.modalHint}>
              Sesuai aturan data final (Task 0.2 & 6.4), perubahan pada absensi yang sudah dikunci
              wajib menyertakan alasan koreksi untuk dicatat di log audit.
            </Text>
            <TextInput
              value={correctionReason}
              onChangeText={setCorrectionReason}
              placeholder="Contoh: Surat keterangan dokter menyusul"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCorrectionModalVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!correctionReason.trim()) {
                    onNotify('Alasan koreksi wajib diisi.');
                    return;
                  }
                  onFinalize(correctionReason, activeSession?.title);
                  setCorrectionReason('');
                  setCorrectionModalVisible(false);
                }}
                style={styles.confirmButton}
              >
                <Text style={styles.confirmText}>Simpan Koreksi</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
          <Text style={styles.screenTitle}>Pilih tanggal sesi</Text>
          <View style={styles.datePickerHeader}>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}
              style={styles.datePickerNav}
            >
              <Ionicons name="chevron-back" size={20} color="#24354D" />
            </Pressable>
            <Text style={styles.datePickerMonth}>
              {month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}
              style={styles.datePickerNav}
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
  teacherName,
  yearLabel,
  onNotify,
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
  teacherName: string;
  yearLabel: string;
  onNotify: (msg: string) => void;
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
  const [groupName, setGroupName] = useState(yearLabel);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [archivedStudents, setArchivedStudents] = useState<
    Awaited<ReturnType<typeof loadArchivedStudents>>
  >([]);
  const [showArchived, setShowArchived] = useState(false);
  const [promotionVisible, setPromotionVisible] = useState(false);
  const [promotionAssignments, setPromotionAssignments] = useState<Record<string, string>>({});
  const [promotionStatuses, setPromotionStatuses] = useState<
    Record<string, EnrollmentMovementStatus>
  >({});
  const [lastPromotedIds, setLastPromotedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedClassId) return;
    loadArchivedStudents(db, selectedClassId)
      .then(setArchivedStudents)
      .catch(() => setArchivedStudents([]));
  }, [db, selectedClassId, students]);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Nama siswa minimal 2 karakter.');
      return;
    }
    if (!nis.trim()) {
      setError('NIS wajib diisi sebagai identitas unik siswa.');
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
    const ctx = await loadActiveAcademicContext(db);
    if (editingClassId) await updateClass(db, id, className, groupName || yearLabel);
    else await addClass(db, id, className, groupName || yearLabel, ctx?.year_id ?? null);
    setClassName('');
    setGroupName(yearLabel);
    setEditingClassId(null);
    setClassModalVisible(false);
    await onClassesChanged();
    if (!editingClassId) onSelectClass(id);
    onNotify(`Kelas ${className} (${groupName || yearLabel}) berhasil disimpan.`);
  };

  const promoteAllStudents = async () => {
    const context = await loadActiveAcademicContext(db);
    if (!context) {
      setError('Lengkapi konteks akademik sebelum melakukan kenaikan kelas.');
      return;
    }
    const payload = students.map((student) => ({
      id: student.id,
      destinationClassId: promotionAssignments[student.id] ?? '',
      movementStatus: promotionStatuses[student.id] ?? 'Naik kelas',
      previousClassId: selectedClassId,
    }));
    try {
      await promoteStudentsBulk(db, payload, context.year_id, context.term_id, teacherName);
      setLastPromotedIds(students.map((s) => s.id));
      setPromotionVisible(false);
      onNotify(
        `Kenaikan/perpindahan kelas berhasil disimpan untuk ${payload.length} siswa. Histori kelas lama tetap aman.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUndoPromotion = async () => {
    const context = await loadActiveAcademicContext(db);
    if (!context || !lastPromotedIds.length) return;
    for (const studentId of lastPromotedIds) {
      await undoLastPromotion(db, studentId, context.term_id);
    }
    setLastPromotedIds([]);
    await onClassesChanged();
    onNotify('Perpindahan kelas terakhir berhasil dibatalkan (Undo).');
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Manajemen Kelas & Siswa (NIS)</Text>
      <Text style={styles.date}>
        Kelas berbasis Tahun Ajaran ({yearLabel}) · Identitas Siswa berbasis NIS
      </Text>

      <View style={styles.classPickerRow}>
        {classes.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectClass(item.id)}
            style={[styles.classChip, selectedClassId === item.id && styles.classChipSelected]}
          >
            <Text
              style={[
                styles.classChipText,
                selectedClassId === item.id && styles.classChipTextSelected,
              ]}
            >
              {item.group_name ? `${item.group_name} · ${item.name}` : item.name}
            </Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setClassModalVisible(true)} style={styles.classAddChip}>
          <Ionicons name="add" size={20} color="#187F79" />
        </Pressable>
      </View>

      <View style={styles.classSectionHeader}>
        <Text style={styles.sectionTitle}>Daftar Siswa ({students.length})</Text>
        {lastPromotedIds.length ? (
          <Pressable onPress={() => void handleUndoPromotion()} style={styles.restoreButton}>
            <Text style={styles.restoreText}>Undo Kenaikan Kelas</Text>
          </Pressable>
        ) : null}
      </View>

      {students.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada siswa di kelas ini</Text>
          <Text style={styles.placeholderText}>
            Tambahkan siswa dengan NIS atau impor dari template Excel.
          </Text>
        </View>
      ) : (
        students.map((student, index) => (
          <View key={student.id} style={styles.classStudentRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{student.name.slice(0, 1)}</Text>
            </View>
            <View style={styles.studentRowCopy}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.quickSubtitle}>
                NIS: {student.nis || 'Belum diisi'} · Urutan #{index + 1}
              </Text>
            </View>
            <View style={styles.studentActions}>
              <Pressable
                onPress={() => onReorderStudent(student.id, 'up')}
                style={styles.smallIconButton}
              >
                <Ionicons name="chevron-up" size={18} color="#187F79" />
              </Pressable>
              <Pressable
                onPress={() => onReorderStudent(student.id, 'down')}
                style={styles.smallIconButton}
              >
                <Ionicons name="chevron-down" size={18} color="#187F79" />
              </Pressable>
              <Pressable
                onPress={() => {
                  setEditingId(student.id);
                  setName(student.name);
                  setNis(student.nis ?? '');
                  setModalVisible(true);
                }}
                style={styles.smallIconButton}
              >
                <Ionicons name="create-outline" size={20} color="#187F79" />
              </Pressable>
              <Pressable
                onPress={() => void onArchiveStudent(student.id)}
                style={styles.smallIconButton}
              >
                <Ionicons name="archive-outline" size={20} color="#C94F3B" />
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Pressable
        onPress={() => {
          setEditingId(null);
          setName('');
          setNis('');
          setError('');
          setModalVisible(true);
        }}
        style={styles.addStudentButton}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Tambah Siswa (Wajib NIS)</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          const firstDest = classes.find((item) => item.id !== selectedClassId)?.id ?? '';
          setPromotionAssignments(
            Object.fromEntries(students.map((s) => [s.id, firstDest])),
          );
          setPromotionStatuses(
            Object.fromEntries(students.map((s) => [s.id, 'Naik kelas'])),
          );
          setError('');
          setPromotionVisible(true);
        }}
        style={styles.overrideButton}
      >
        <Ionicons name="arrow-up-circle-outline" size={21} color="#187F79" />
        <Text style={styles.overrideText}>
          Kenaikan / Perpindahan Kelas Massal (Dengan Preview & Undo)
        </Text>
      </Pressable>

      <Pressable onPress={onImportStudents} style={styles.importButton}>
        <Ionicons name="cloud-upload-outline" size={22} color="#187F79" />
        <Text style={styles.importText}>Import Siswa dari Excel/CSV (Validasi NIS)</Text>
      </Pressable>

      <Pressable onPress={onDownloadTemplate} style={styles.templateButton}>
        <Ionicons name="download-outline" size={20} color="#687B91" />
        <Text style={styles.templateText}>Unduh Template Excel (Nama & NIS)</Text>
      </Pressable>

      {archivedStudents.length ? (
        <Pressable
          onPress={() => setShowArchived((value) => !value)}
          style={styles.archivedToggle}
        >
          <Text style={styles.recapToggleText}>
            {showArchived
              ? 'Sembunyikan arsip siswa'
              : `Tampilkan ${archivedStudents.length} siswa diarsipkan`}
          </Text>
        </Pressable>
      ) : null}
      {showArchived
        ? archivedStudents.map((student) => (
            <View key={student.id} style={styles.classStudentRow}>
              <Text style={[styles.studentName, styles.studentRowCopy]}>
                {student.name} ({student.nis ?? 'Tanpa NIS'})
              </Text>
              <Pressable
                onPress={() => void onRestoreStudent(student.id)}
                style={styles.restoreButton}
              >
                <Text style={styles.restoreText}>Pulihkan</Text>
              </Pressable>
            </View>
          ))
        : null}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>{editingId ? 'Edit Siswa' : 'Tambah Siswa Baru'}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nama lengkap siswa"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
            />
            <TextInput
              value={nis}
              onChangeText={setNis}
              placeholder="Nomor Induk Siswa (NIS Unik - Wajib)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
            />
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void submit()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Task 3.3 & 3.4: Kenaikan Kelas Massal + Status Perpindahan */}
      <Modal visible={promotionVisible} transparent animationType="fade">
        <View style={styles.modalScrimCenter}>
          <View style={styles.reasonCard}>
            <Text style={styles.screenTitle}>Kenaikan & Perpindahan Kelas Massal</Text>
            <Text style={styles.modalHint}>
              Pilih status perpindahan (Naik kelas, Pindah kelas, Tinggal kelas, Lulus, Keluar,
              Arsip) dan kelas tujuan. Histori nilai & absensi lama tetap utuh.
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {students.map((student) => (
                <View key={student.id} style={styles.promotionStudentRow}>
                  <Text style={styles.studentName}>
                    {student.nis ? `${student.nis} · ` : ''}
                    {student.name}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.statusRow}>
                      {ENROLLMENT_MOVEMENT_STATUSES.map((st) => (
                        <Pressable
                          key={st}
                          onPress={() =>
                            setPromotionStatuses((curr) => ({ ...curr, [student.id]: st }))
                          }
                          style={[
                            styles.statusChip,
                            (promotionStatuses[student.id] ?? 'Naik kelas') === st &&
                              styles.statusChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              (promotionStatuses[student.id] ?? 'Naik kelas') === st &&
                                styles.statusTextSelected,
                            ]}
                          >
                            {st}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <View style={[styles.statusRow, { marginTop: 8 }]}>
                    {classes
                      .filter((item) => item.id !== selectedClassId)
                      .map((item) => (
                        <Pressable
                          key={`${student.id}-${item.id}`}
                          onPress={() =>
                            setPromotionAssignments((curr) => ({
                              ...curr,
                              [student.id]: item.id,
                            }))
                          }
                          style={[
                            styles.classChip,
                            promotionAssignments[student.id] === item.id &&
                              styles.classChipSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.classChipText,
                              promotionAssignments[student.id] === item.id &&
                                styles.classChipTextSelected,
                            ]}
                          >
                            Ke {item.name}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPromotionVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void promoteAllStudents()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Konfirmasi Kenaikan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={classModalVisible} transparent animationType="slide">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>
              {editingClassId ? 'Edit Kelas' : 'Tambah Kelas Berdasarkan Tahun Ajaran'}
            </Text>
            <TextInput
              value={className}
              onChangeText={setClassName}
              placeholder="Nama Kelas (contoh: Kelas 2B)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
            />
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Tahun Ajaran (contoh: 2026/2027)"
              placeholderTextColor="#8A9AAF"
              style={styles.textInput}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setClassModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void saveClass()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan Kelas</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ScheduleScreen({
  db,
  classId,
  classes,
  teacherName,
  semesterStart,
  semesterEnd,
  onNotify,
  onOpenSessionAction,
}: {
  db: SQLiteDatabase;
  classId: string;
  classes: Awaited<ReturnType<typeof loadClasses>>;
  teacherName: string;
  semesterStart: string;
  semesterEnd: string;
  onNotify: (msg: string) => void;
  onOpenSessionAction: (
    session: Awaited<ReturnType<typeof loadAllTeachingSessionsForClass>>[number],
    targetTab: 'Absensi' | 'Nilai' | 'Jurnal',
  ) => void;
}) {
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof loadSchedules>>>([]);
  const [generatedSessions, setGeneratedSessions] = useState<
    Awaited<ReturnType<typeof loadAllTeachingSessionsForClass>>
  >([]);
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [exceptions, setExceptions] = useState<Awaited<ReturnType<typeof loadScheduleExceptions>>>(
    [],
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [copyModalVisible, setCopyModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [extraMode, setExtraMode] = useState(false);
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('semester');
  const [title, setTitle] = useState('Matematika');
  const [roomId, setRoomId] = useState('R-2B');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:30');
  const [rangeStart, setRangeStart] = useState(semesterStart);
  const [rangeEnd, setRangeEnd] = useState(semesterEnd);

  const selectedDay = localWeekday(new Date(`${selectedDate}T12:00:00`));

  const refreshSchedules = async () => {
    if (!classId) return;
    const [rows, exceptionRows, sessionRows] = await Promise.all([
      loadSchedules(db, classId),
      loadScheduleExceptions(db, classId, selectedDate),
      loadAllTeachingSessionsForClass(db, classId, 40),
    ]);
    setSchedules(rows);
    setExceptions(exceptionRows);
    setGeneratedSessions(sessionRows);
  };

  useEffect(() => {
    refreshSchedules().catch(() => undefined);
  }, [db, classId, selectedDate]);

  const saveSchedule = async () => {
    if (!title.trim() || !isScheduleRangeValid(startTime, endTime)) {
      Alert.alert('Input jadwal belum lengkap', 'Pastikan mata pelajaran dan jam mulai < selesai.');
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
        'Konflik Jadwal Terdeteksi',
        `Bentrok dengan ${conflicts
          .map((item) => `${item.class_name} · ${item.title} (${item.start_time}–${item.end_time})`)
          .join(', ')}.`,
      );
      return;
    }
    try {
      if (editingId) {
        await updateSchedule(db, editingId, {
          title,
          weekday: selectedDay,
          startTime,
          endTime,
          repeatRule,
        });
      } else {
        const scheduleId = `schedule-${Date.now()}`;
        await addSchedule(db, {
          id: scheduleId,
          classId,
          title,
          weekday: selectedDay,
          startTime,
          endTime,
          repeatRule,
          roomId,
        });
        const created = await createScheduleTemplateAndSessions(db, {
          id: scheduleId,
          classId,
          teacherId: teacherName,
          roomId,
          title,
          weekday: selectedDay,
          startTime,
          endTime,
          startDate: repeatRule === 'once' ? selectedDate : rangeStart,
          endDate: repeatRule === 'once' ? selectedDate : rangeEnd,
          repeatRule,
        });
        onNotify(`Jadwal ${title} disimpan & ${created.length} pertemuan aktual dibuat.`);
      }
      await refreshSchedules();
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Konflik Sesi Aktual', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Jadwal Semester & Pertemuan Aktual</Text>
      <Text style={styles.date}>
        Buat jadwal sekali atau berulang 1 semester, validasi konflik otomatis, lalu buka sesi.
      </Text>

      <View style={styles.dayRow}>
        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum'].map((day, index) => (
          <Pressable
            key={day}
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

      <Pressable
        onPress={() => {
          setEditingId(null);
          setExtraMode(false);
          setRangeStart(semesterStart);
          setRangeEnd(semesterEnd);
          setModalVisible(true);
        }}
        style={styles.addStudentButton}
      >
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Buat Jadwal & Generate Pertemuan Semester</Text>
      </Pressable>

      <Pressable onPress={() => setCopyModalVisible(true)} style={styles.overrideButton}>
        <Ionicons name="copy-outline" size={20} color="#187F79" />
        <Text style={styles.overrideText}>Salin Jadwal dari Kelas / Tahun Ajaran Lain</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>
        Daftar Pertemuan Aktual ({generatedSessions.length} sesi)
      </Text>
      {generatedSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada pertemuan aktual</Text>
          <Text style={styles.placeholderText}>
            Tambahkan jadwal untuk menghasilkan daftar pertemuan semester secara otomatis.
          </Text>
        </View>
      ) : (
        generatedSessions.map((sess) => (
          <View key={sess.id} style={styles.studentCard}>
            <Text style={styles.studentName}>
              {sess.session_date} · {sess.title} · {sess.start_time}–{sess.end_time}
            </Text>
            <Text style={styles.quickSubtitle}>
              Ruang: {sess.room_id || 'Utama'} · Status: {sess.status} · Absensi:{' '}
              {sess.attendance_state ?? 'Belum diisi'}
            </Text>
            <View style={styles.statusRow}>
              <Pressable
                onPress={() => onOpenSessionAction(sess, 'Absensi')}
                style={styles.statusChipSelected}
              >
                <Text style={[styles.statusTextSelected, { paddingHorizontal: 10, paddingVertical: 6 }]}>
                  Isi Absensi
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onOpenSessionAction(sess, 'Nilai')}
                style={styles.statusChip}
              >
                <Text style={styles.statusText}>Tambah Nilai</Text>
              </Pressable>
              <Pressable
                onPress={() => onOpenSessionAction(sess, 'Jurnal')}
                style={styles.statusChip}
              >
                <Text style={styles.statusText}>Isi Jurnal & Tugas</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Buat Jadwal & Pertemuan</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Mata Pelajaran (contoh: Matematika)"
              style={styles.textInput}
            />
            <TextInput
              value={roomId}
              onChangeText={setRoomId}
              placeholder="Ruangan (contoh: R-2B)"
              style={styles.textInput}
            />
            <View style={styles.scheduleInputRow}>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="Mulai 08:00"
                style={styles.textInputHalf}
              />
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="Selesai 09:30"
                style={styles.textInputHalf}
              />
            </View>
            <Text style={styles.fieldLabel}>Pola Perulangan (Task 4.1 & 4.2)</Text>
            <View style={styles.recapPeriodRow}>
              {(['once', 'weekly', 'monthly', 'semester', 'custom'] as const).map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setRepeatRule(r)}
                  style={[styles.recapPeriod, repeatRule === r && styles.recapPeriodSelected]}
                >
                  <Text
                    style={[
                      styles.recapPeriodText,
                      repeatRule === r && styles.recapPeriodTextSelected,
                    ]}
                  >
                    {r === 'once'
                      ? 'Sekali'
                      : r === 'weekly'
                        ? 'Mingguan'
                        : r === 'monthly'
                          ? 'Bulanan'
                          : r === 'semester'
                            ? '1 Semester'
                            : 'Custom'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {repeatRule !== 'once' ? (
              <View style={styles.scheduleInputRow}>
                <TextInput
                  value={rangeStart}
                  onChangeText={setRangeStart}
                  placeholder="Mulai YYYY-MM-DD"
                  style={styles.textInputHalf}
                />
                <TextInput
                  value={rangeEnd}
                  onChangeText={setRangeEnd}
                  placeholder="Selesai YYYY-MM-DD"
                  style={styles.textInputHalf}
                />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void saveSchedule()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Validasi & Simpan</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={copyModalVisible} transparent animationType="fade">
        <View style={styles.modalScrimCenter}>
          <View style={styles.reasonCard}>
            <Text style={styles.screenTitle}>Salin Jadwal Tahun/Kelas Lain</Text>
            <Text style={styles.modalHint}>
              Pilih kelas asal untuk menyalin seluruh jadwal ke kelas aktif ini.
            </Text>
            {classes
              .filter((c) => c.id !== classId)
              .map((c) => (
                <Pressable
                  key={c.id}
                  onPress={async () => {
                    const count = await copySchedulesToClass(
                      db,
                      c.id,
                      classId,
                      semesterStart,
                      semesterEnd,
                    );
                    await refreshSchedules();
                    setCopyModalVisible(false);
                    onNotify(`${count} jadwal berhasil disalin dari ${c.name}.`);
                  }}
                  style={styles.reasonButton}
                >
                  <Text style={styles.reasonButtonText}>Salin Semua dari {c.name}</Text>
                </Pressable>
              ))}
            <Pressable
              onPress={() => setCopyModalVisible(false)}
              style={[styles.cancelButton, { marginTop: 14 }]}
            >
              <Text style={styles.cancelText}>Tutup</Text>
            </Pressable>
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
  academicContext,
  onRestoreComplete,
  onNotify,
}: {
  db: SQLiteDatabase;
  classId: string;
  className: string;
  students: Student[];
  academicContext: Awaited<ReturnType<typeof loadActiveAcademicContext>>;
  onRestoreComplete: () => Promise<void>;
  onNotify: (msg: string) => void;
}) {
  const [kind, setKind] = useState<'attendance' | 'students' | 'grades' | 'journals'>('attendance');
  const [reportStudentId, setReportStudentId] = useState('all');
  const [period, setPeriod] = useState<AttendancePeriod>('semester');
  const [customStart, setCustomStart] = useState(shiftDate(localDateKey(), -30));
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
  const [includeAccumulation, setIncludeAccumulation] = useState(true);
  const [reportNote, setReportNote] = useState(
    'Pembelajaran berjalan kondusif. Siswa yang belum mencapai KKTP telah dijadwalkan mengikuti bimbingan remedial.',
  );
  const [attendanceAccumulation, setAttendanceAccumulation] = useState<
    Awaited<ReturnType<typeof loadAttendanceAccumulation>>
  >([]);
  const [journalContent, setJournalContent] = useState('');
  const [reportAgendas, setReportAgendas] = useState<Awaited<ReturnType<typeof loadAgendas>>>([]);

  const periodLabel =
    period === 'day'
      ? 'Harian'
      : period === 'week'
        ? 'Mingguan'
        : period === 'month'
          ? 'Bulanan'
          : period === 'custom'
            ? `${customStart} s.d. ${customEnd}`
            : 'Satu Semester';

  const reportStudents = students
    .filter((student) => reportStudentId === 'all' || student.id === reportStudentId)
    .map((student) => ({
      ...student,
      status: reportAttendance.find((item) => item.id === student.id)?.status ?? student.status,
    }));

  useEffect(() => {
    if (!classId) return;
    Promise.all([
      loadAttendanceStudentRecap(db, classId, period, localDateKey(), customStart, customEnd),
      loadAttendanceRecap(db, classId, period, localDateKey(), customStart, customEnd),
    ])
      .then(([studentRows, summaryRows]) => {
        setReportAttendance(studentRows);
        setReportAttendanceSummary(summaryRows);
      })
      .catch(() => undefined);
  }, [classId, customEnd, customStart, db, period]);

  useEffect(() => {
    if (!classId) return;
    const start = academicContext?.start_date ?? '2026-01-01';
    const end = academicContext?.end_date ?? '2026-12-31';
    loadAttendanceAccumulation(db, classId, start, end)
      .then(setAttendanceAccumulation)
      .catch(() => setAttendanceAccumulation([]));
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
      .then((row) => setJournalContent(row?.content ?? row?.material ?? ''))
      .catch(() => undefined);
    loadAgendas(db, classId)
      .then(setReportAgendas)
      .catch(() => setReportAgendas([]));
  }, [academicContext, classId, db]);

  const shareIfAvailable = async (uri: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    } else {
      setMessage(`File tersimpan di ${uri}`);
    }
  };

  const exportExcel = async () => {
    try {
      const kkm = reportComponents[0]?.kkm ?? 75;
      const rows =
        kind === 'attendance'
          ? attendanceAccumulation.map((student, index) => ({
              No: index + 1,
              NIS: student.nis ?? 'Belum diisi',
              Siswa: student.name,
              Hadir: student.hadir,
              Sakit: student.sakit,
              Izin: student.izin,
              Alpa: student.alpa,
              Terlambat: student.terlambat,
            }))
          : kind === 'grades'
            ? reportStudents.map((student, index) => {
                const rawScore = Number(reportScores[student.id]);
                const numScore = Number.isFinite(rawScore) ? rawScore : null;
                return {
                  No: index + 1,
                  NIS: student.nis ?? 'Belum diisi',
                  Siswa: student.name,
                  Komponen: reportComponents[0]?.name ?? '—',
                  Nilai: reportScores[student.id] ?? '—',
                  Predikat: calculatePredicate(numScore, kkm),
                  Capaian: buildCompetencyDescription(
                    student.name,
                    reportComponents[0]?.subject ?? 'Mata Pelajaran',
                    numScore,
                    kkm,
                    reportComponents[0]?.name ?? 'Penilaian',
                  ),
                };
              })
            : reportStudents.map((student, index) => ({
                No: index + 1,
                NIS: student.nis ?? 'Belum diisi',
                Siswa: student.name,
                Kelas: className,
              }));
      const workbook = createReportWorkbook('Laporan', rows);
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const file = new File(Paths.document, `kelasrapi-laporan-${kind}.xlsx`);
      await file.write(base64, { encoding: 'base64' });
      await shareIfAvailable(file.uri);
      setMessage(`Excel berhasil disimpan di ${file.uri}`);
      onNotify('Laporan Excel berhasil diekspor.');
    } catch (error) {
      setMessage('Excel gagal dibuat. Silakan klik lagi untuk retry.');
      Alert.alert('Ekspor gagal', String(error));
    }
  };

  const exportPdf = async () => {
    try {
      const kkm = reportComponents[0]?.kkm ?? 75;
      const html = buildReportHtml({
        title: `Laporan Resmi ${kind.toUpperCase()} — ${className}`,
        period: periodLabel,
        headers:
          kind === 'grades'
            ? ['Nama Siswa', 'NIS', 'Nilai', 'Predikat', 'Deskripsi Capaian']
            : ['Nama Siswa', 'NIS', 'Status / Keterangan'],
        rows: reportStudents.map((student) => {
          const rawScore = Number(reportScores[student.id]);
          const numScore = Number.isFinite(rawScore) ? rawScore : null;
          return kind === 'grades'
            ? [
                student.name,
                student.nis ?? 'Belum diisi',
                reportScores[student.id] ?? '—',
                calculatePredicate(numScore, kkm),
                buildCompetencyDescription(
                  student.name,
                  reportComponents[0]?.subject ?? 'Mata Pelajaran',
                  numScore,
                  kkm,
                  reportComponents[0]?.name ?? 'Penilaian',
                ),
              ]
            : [student.name, student.nis ?? 'Belum diisi', student.status];
        }),
        identity: {
          schoolName: academicContext?.school_name ?? 'Sekolah',
          schoolAddress: academicContext?.school_address ?? '',
          teacherName: academicContext?.teacher_name ?? 'Guru',
          teacherNip: academicContext?.nip_nuptk ?? '—',
          principalName: academicContext?.principal_name ?? '',
          principalNip: academicContext?.principal_nip ?? '—',
          className,
          subjectName: reportComponents[0]?.subject ?? 'Semua Mata Pelajaran',
          academicYear: academicContext?.year_label ?? '2026/2027',
          semester: academicContext?.term_label ?? 'Semester 1',
          signatureCity: academicContext?.city ?? 'Pekanbaru',
          conclusion: reportNote,
        },
        extraHtml: includeAccumulation
          ? buildAttendanceAccumulationHtml(attendanceAccumulation)
          : undefined,
      });
      await Print.printAsync({ html });
      setMessage('Dialog cetak PDF resmi dibuka.');
      onNotify('Laporan PDF resmi siap dicetak.');
    } catch (error) {
      setMessage('PDF gagal dibuat. Silakan coba lagi.');
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
        `Backup terverifikasi (Checksum ${payload.integrity}) tersimpan di: ${file.uri}`,
      );
      onNotify(`Backup berhasil dibuat (Checksum ${payload.integrity}).`);
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
      const payload = JSON.parse(await response.text());
      if (!validateBackupPayload(payload)) {
        Alert.alert('Backup ditolak', 'Checksum tidak cocok atau format tidak didukung.');
        return;
      }
      const scope = Object.entries(payload.data)
        .filter(([table]) => table !== 'backups')
        .reduce((total, [, rows]) => total + rows.length, 0);
      Alert.alert(
        'Pulihkan Backup (Replace / Merge)',
        `Ditemukan ${scope} baris data valid (Checksum ${payload.integrity}). Pilih mode pemulihan:`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Merge (Gabungkan)',
            onPress: async () => {
              await restoreBackupPayload(db, payload, 'merge');
              await onRestoreComplete();
              onNotify('Backup berhasil digabungkan (Merge).');
            },
          },
          {
            text: 'Replace (Ganti Semua)',
            style: 'destructive',
            onPress: async () => {
              await restoreBackupPayload(db, payload, 'replace');
              await onRestoreComplete();
              onNotify('Backup berhasil dipulihkan (Replace).');
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Restore gagal', String(error));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Rekap, Laporan Resmi & Backup</Text>
      <Text style={styles.date}>
        Dilengkapi Kop Sekolah, NIP Guru/Kepala Sekolah, NIS Siswa, Kesimpulan & Tanda Tangan
      </Text>

      <View style={styles.reportOptions}>
        {(['attendance', 'grades', 'journals', 'students'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={[styles.reportOption, kind === k && styles.reportOptionSelected]}
          >
            <Text style={styles.reportOptionText}>
              {k === 'attendance'
                ? 'Absensi'
                : k === 'grades'
                  ? 'Nilai'
                  : k === 'journals'
                    ? 'Jurnal'
                    : 'Siswa'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Periode Rekap</Text>
      <View style={styles.recapPeriodRow}>
        {(['day', 'week', 'month', 'semester', 'custom'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setPeriod(item)}
            style={[styles.recapPeriod, period === item && styles.recapPeriodSelected]}
          >
            <Text
              style={[styles.recapPeriodText, period === item && styles.recapPeriodTextSelected]}
            >
              {item === 'day'
                ? 'Harian'
                : item === 'week'
                  ? 'Mingguan'
                  : item === 'month'
                    ? 'Bulanan'
                    : item === 'semester'
                      ? 'Semester'
                      : 'Custom'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Kesimpulan & Evaluasi Guru pada Laporan</Text>
      <TextInput
        value={reportNote}
        onChangeText={setReportNote}
        placeholder="Tulis kesimpulan perkembangan kelas..."
        style={styles.textInput}
      />

      <View style={styles.exportRow}>
        <Pressable onPress={() => void exportExcel()} style={styles.exportButton}>
          <Ionicons name="grid-outline" size={20} color="#187F79" />
          <Text style={styles.exportText}>Export Excel (.xlsx)</Text>
        </Pressable>
        <Pressable onPress={() => void exportPdf()} style={styles.exportButton}>
          <Ionicons name="print-outline" size={20} color="#FF795C" />
          <Text style={styles.exportText}>Cetak / Export PDF</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.exportMessage}>{message}</Text> : null}

      <Text style={styles.sectionTitle}>Backup & Restore Data Lokal (Task 10.1 & 10.2)</Text>
      <View style={styles.exportRow}>
        <Pressable onPress={() => void createLocalBackup()} style={styles.exportButton}>
          <Ionicons name="archive-outline" size={20} color="#187F79" />
          <Text style={styles.exportText}>Buat Backup (Checksum)</Text>
        </Pressable>
        <Pressable onPress={() => void restoreLocalBackup()} style={styles.exportButton}>
          <Ionicons name="refresh-outline" size={20} color="#FF795C" />
          <Text style={styles.exportText}>Restore (Replace/Merge)</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function JournalScreen({
  db,
  classId,
  className,
  teacherName,
  activeSessionId,
  onDirtyChange,
  onNotify,
  onRegisterSave,
}: {
  db: SQLiteDatabase;
  classId: string;
  className: string;
  teacherName: string;
  activeSessionId: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onNotify: (msg: string) => void;
  onRegisterSave: (save: () => Promise<void>) => void;
}) {
  const [material, setMaterial] = useState('');
  const [objective, setObjective] = useState('');
  const [activity, setActivity] = useState('');
  const [method, setMethod] = useState('Diskusi & Latihan Terbimbing');
  const [note, setNote] = useState('');
  const [journalState, setJournalState] = useState<'draft' | 'submitted'>('draft');
  const [todaySessionId, setTodaySessionId] = useState<string | null>(activeSessionId);
  const [agendas, setAgendas] = useState<Awaited<ReturnType<typeof loadAgendas>>>([]);
  const [agendaModalVisible, setAgendaModalVisible] = useState(false);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaSubject, setAgendaSubject] = useState('Matematika');
  const [agendaDueDate, setAgendaDueDate] = useState(shiftDate(localDateKey(), 7));
  const [agendaNote, setAgendaNote] = useState('');
  const [isRemedial, setIsRemedial] = useState(false);

  useEffect(() => {
    if (!classId) return;
    Promise.all([loadJournal(db, classId), loadTeachingSessions(db, localDateKey(), classId)])
      .then(async ([row, sessions]) => {
        const sessionId = activeSessionId ?? sessions[0]?.id ?? null;
        setTodaySessionId(sessionId);
        const sessionJournal = sessionId ? await loadLessonJournal(db, sessionId) : null;
        setMaterial(sessionJournal?.material || row?.material || row?.content || '');
        setObjective(sessionJournal?.objective || row?.objective || '');
        setActivity(sessionJournal?.activity || row?.activity || '');
        setMethod(sessionJournal?.method || row?.method || 'Diskusi & Latihan Terbimbing');
        setNote(sessionJournal?.note || row?.note || '');
        const nextState =
          sessionJournal?.state === 'submitted' || row?.state === 'submitted'
            ? 'submitted'
            : 'draft';
        setJournalState(nextState);
      })
      .catch(() => undefined);
    loadAgendas(db, classId)
      .then(setAgendas)
      .catch(() => setAgendas([]));
  }, [activeSessionId, classId, db]);

  const saveJournalData = async (targetState: 'draft' | 'submitted') => {
    const combined = `${material} | Tujuan: ${objective} | Aktivitas: ${activity} | Metode: ${method} | Catatan: ${note}`;
    await saveJournal(db, classId, localDateKey(), combined, targetState);
    if (todaySessionId) {
      await saveLessonJournal(db, todaySessionId, material, targetState, {
        objective,
        activity,
        method,
        note,
      });
    }
    setJournalState(targetState);
    onDirtyChange(false);
    onNotify(
      targetState === 'submitted'
        ? `Jurnal pembelajaran ${className} berhasil diselesaikan.`
        : 'Draft jurnal tersimpan.',
    );
  };

  useEffect(() => {
    onRegisterSave(async () => saveJournalData('draft'));
  }, [classId, material, objective, activity, method, note]);

  const addTask = async () => {
    if (!agendaTitle.trim()) return;
    await addAgenda(db, classId, agendaTitle, agendaNote, agendaDueDate, {
      subject: agendaSubject,
      assignedDate: localDateKey(),
      maxScore: 100,
      isRemedial,
    });
    setAgendaTitle('');
    setAgendaNote('');
    setIsRemedial(false);
    setAgendaModalVisible(false);
    setAgendas(await loadAgendas(db, classId));
    onNotify(`Tugas "${agendaTitle}" ditambahkan.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Jurnal Pertemuan & Tugas Siswa</Text>
      <Text style={styles.date}>
        {className} · Guru: {teacherName} · Status:{' '}
        {journalState === 'submitted' ? 'Selesai' : 'Draft'}
      </Text>

      {/* Task 8.1: Jurnal Berbasis Pertemuan Terstruktur */}
      <View style={styles.journalCard}>
        <Text style={styles.fieldLabel}>Materi Pokok Pembelajaran</Text>
        <TextInput
          value={material}
          onChangeText={(v) => {
            setMaterial(v);
            onDirtyChange(true);
          }}
          placeholder="Contoh: Operasi Hitung Pecahan Campuran"
          style={styles.textInput}
        />
        <Text style={styles.fieldLabel}>Tujuan Pembelajaran</Text>
        <TextInput
          value={objective}
          onChangeText={(v) => {
            setObjective(v);
            onDirtyChange(true);
          }}
          placeholder="Siswa mampu menyelesaikan penjumlahan pecahan berpenyebut beda"
          style={styles.textInput}
        />
        <Text style={styles.fieldLabel}>Aktivitas Pembelajaran</Text>
        <TextInput
          value={activity}
          onChangeText={(v) => {
            setActivity(v);
            onDirtyChange(true);
          }}
          placeholder="Eksplorasi alat peraga, diskusi kelompok, latihan soal"
          style={styles.textInput}
        />
        <Text style={styles.fieldLabel}>Metode Mengajar</Text>
        <TextInput
          value={method}
          onChangeText={(v) => {
            setMethod(v);
            onDirtyChange(true);
          }}
          placeholder="Contoh: Problem Based Learning / Diskusi"
          style={styles.textInput}
        />
        <Text style={styles.fieldLabel}>Catatan / Refleksi Pertemuan</Text>
        <TextInput
          value={note}
          onChangeText={(v) => {
            setNote(v);
            onDirtyChange(true);
          }}
          multiline
          placeholder="Kendala atau siswa yang memerlukan pendampingan khusus..."
          style={styles.journalInputSmall}
        />
      </View>

      <View style={styles.exportRow}>
        <Pressable onPress={() => void saveJournalData('draft')} style={styles.exportButton}>
          <Text style={styles.exportText}>Simpan Draft</Text>
        </Pressable>
        <Pressable
          onPress={() => void saveJournalData('submitted')}
          style={[styles.exportButton, { backgroundColor: activePalette.accent }]}
        >
          <Text style={[styles.exportText, { color: '#FFFFFF' }]}>Tandai Jurnal Selesai</Text>
        </Pressable>
      </View>

      {/* Task 8.2: Tugas & Remedial */}
      <Text style={styles.sectionTitle}>Daftar Tugas & Remedial ({agendas.length})</Text>
      <Pressable onPress={() => setAgendaModalVisible(true)} style={styles.addStudentButton}>
        <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
        <Text style={styles.addStudentText}>Buat Tugas / Remedial Baru</Text>
      </Pressable>

      {agendas.map((agenda) => (
        <Pressable
          key={agenda.id}
          onPress={async () => {
            await completeAgenda(db, agenda.id, !agenda.completed_at);
            setAgendas(await loadAgendas(db, classId));
          }}
          style={styles.agendaRow}
        >
          <Ionicons
            name={agenda.completed_at ? 'checkmark-circle' : 'time-outline'}
            size={24}
            color={agenda.completed_at ? '#187F79' : '#FF795C'}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.studentName, agenda.completed_at && styles.completedAgenda]}>
              {agenda.title} {agenda.is_remedial ? '(Remedial)' : ''}
            </Text>
            <Text style={styles.quickSubtitle}>
              Mapel: {agenda.subject || 'Umum'} · Tenggat: {agenda.due_date} · Status:{' '}
              {agenda.completed_at ? 'Selesai dikumpulkan' : 'Menunggu pengumpulan'}
            </Text>
          </View>
        </Pressable>
      ))}

      <Modal visible={agendaModalVisible} transparent animationType="slide">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Tambah Tugas / Remedial</Text>
            <TextInput
              value={agendaTitle}
              onChangeText={setAgendaTitle}
              placeholder="Judul Tugas"
              style={styles.textInput}
            />
            <TextInput
              value={agendaSubject}
              onChangeText={setAgendaSubject}
              placeholder="Mata Pelajaran"
              style={styles.textInput}
            />
            <TextInput
              value={agendaDueDate}
              onChangeText={setAgendaDueDate}
              placeholder="Tenggat YYYY-MM-DD"
              style={styles.textInput}
            />
            <Pressable
              onPress={() => setIsRemedial((v) => !v)}
              style={[styles.reportCheckRow, { marginTop: 8 }]}
            >
              <Ionicons
                name={isRemedial ? 'checkbox' : 'square-outline'}
                size={22}
                color="#187F79"
              />
              <Text style={[styles.reportCheckText, { marginLeft: 8 }]}>
                Tandai sebagai Tugas Remedial / Susulan
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAgendaModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void addTask()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan Tugas</Text>
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
  className,
  teacherName,
  activeSessionId,
  students,
  onNotify,
}: {
  db: SQLiteDatabase;
  classId: string;
  className: string;
  teacherName: string;
  activeSessionId: string | null;
  students: Student[];
  onNotify: (msg: string) => void;
}) {
  const [components, setComponents] = useState<Awaited<ReturnType<typeof loadGradeComponents>>>([]);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof loadTeachingSessions>>>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreNotes, setScoreNotes] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [scoreError, setScoreError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [componentName, setComponentName] = useState('');
  const [subject, setSubject] = useState('Matematika');
  const [category, setCategory] = useState<string>('Tugas');
  const [maxScore, setMaxScore] = useState('100');
  const [weight, setWeight] = useState('1');
  const [kkm, setKkm] = useState('75');

  const refreshComponents = async () => {
    if (!classId) return;
    const rows = await loadGradeComponents(db, classId);
    setComponents(rows);
    if (rows.length && (!selectedId || !rows.some((row) => row.id === selectedId))) {
      setSelectedId(rows[0].id);
    }
  };

  useEffect(() => {
    refreshComponents().catch(() => undefined);
    if (classId) {
      loadTeachingSessions(db, localDateKey(), classId)
        .then(setSessions)
        .catch(() => setSessions([]));
    }
  }, [classId, db]);

  useEffect(() => {
    if (!selectedId) {
      setScores({});
      setScoreNotes({});
      return;
    }
    loadScores(db, selectedId)
      .then((rows) => {
        setScores(Object.fromEntries(rows.map((row) => [row.student_id, String(row.score ?? '')])));
        setScoreNotes(Object.fromEntries(rows.map((row) => [row.student_id, row.note ?? ''])));
      })
      .catch(() => undefined);
    setSaved(false);
  }, [db, selectedId]);

  const selected = components.find((item) => item.id === selectedId);
  const activeKkm = selected?.kkm ?? 75;

  const stats = useMemo(() => {
    const numeric = students.map((s) => {
      const raw = scores[s.id];
      return raw && raw.trim() !== '' ? Number(raw) : null;
    });
    return summarizeAssessmentScores(numeric, students.length, activeKkm);
  }, [scores, students, activeKkm]);

  const createComponent = async () => {
    const parsedMax = Number(maxScore);
    const parsedWeight = Number(weight);
    const parsedKkm = Number(kkm);
    if (!componentName.trim() || !subject.trim() || !category.trim()) return;
    const id = editingComponentId ?? `component-${Date.now()}`;
    if (editingComponentId) {
      await updateGradeComponent(db, id, {
        name: componentName,
        subject,
        category,
        maxScore: parsedMax || 100,
        weight: parsedWeight || 1,
        kkm: parsedKkm || 75,
      });
    } else {
      await addGradeComponent(db, {
        id,
        classId,
        name: componentName,
        subject,
        category,
        maxScore: parsedMax || 100,
        weight: parsedWeight || 1,
        kkm: parsedKkm || 75,
        sessionId: activeSessionId ?? sessions[0]?.id ?? null,
      });
    }
    await refreshComponents();
    setSelectedId(id);
    setModalVisible(false);
    onNotify(`Komponen penilaian "${componentName}" berhasil disimpan.`);
  };

  const saveAllScores = async (finalize = false) => {
    if (!selected) return;
    for (const [studentId, value] of Object.entries(scores)) {
      const validation = validateScore(value, selected.max_score);
      if (validation.valid) {
        await saveScore(db, selected.id, studentId, validation.value, scoreNotes[studentId] ?? '');
      }
    }
    if (finalize) {
      await updateGradeComponent(db, selected.id, {
        name: selected.name,
        subject: selected.subject ?? 'Matematika',
        category: selected.category ?? 'Tugas',
        maxScore: selected.max_score,
        weight: selected.weight ?? 1,
        kkm: selected.kkm ?? 75,
        state: 'final',
      });
      await refreshComponents();
    }
    setSaved(true);
    onNotify(
      finalize
        ? `Nilai ${selected.name} (${className}) berhasil difinalisasi.`
        : `Draft nilai ${selected.name} tersimpan.`,
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Penilaian Berbasis Pertemuan · {className}</Text>
      <Text style={styles.date}>
        Guru: {teacherName} · Otomatis menghitung Rata-rata, Nilai Akhir, Predikat & Capaian KKTP
      </Text>

      {/* Task 7.1: Ringkasan Penilaian */}
      <View style={styles.workflowSummaryCard}>
        <Text style={styles.sectionTitle}>
          {selected ? `${selected.name} (${selected.category})` : 'Belum ada penilaian'}
        </Text>
        <Text style={styles.quickSubtitle}>
          Mapel: {selected?.subject ?? '—'} · Tanggal: {selected?.assessment_date ?? '—'} · KKM:{' '}
          {activeKkm} · Bobot: {selected?.weight ?? 1}×
        </Text>
        <View style={styles.metricRow}>
          <MetricCard
            label="Rata-rata"
            value={stats.average === null ? '—' : String(stats.average)}
          />
          <MetricCard
            label="Tertinggi"
            value={stats.highest === null ? '—' : String(stats.highest)}
          />
          <MetricCard label="Terendah" value={stats.lowest === null ? '—' : String(stats.lowest)} />
          <MetricCard label="Belum Dinilai" value={`${stats.ungradedCount}/${students.length}`} />
        </View>
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
              {item.category} · KKM {item.kkm ?? 75}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setEditingComponentId(null);
            setComponentName('');
            setSubject(sessions[0]?.title ?? 'Matematika');
            setCategory('Tugas');
            setModalVisible(true);
          }}
          style={styles.classAddChip}
        >
          <Ionicons name="add" size={20} color="#187F79" />
        </Pressable>
      </ScrollView>

      {selected ? (
        students.map((student) => {
          const rawVal = scores[student.id] ?? '';
          const numVal = rawVal.trim() !== '' ? Number(rawVal) : null;
          const predikat = calculatePredicate(numVal, activeKkm);
          const capaian = buildCompetencyDescription(
            student.name,
            selected.subject ?? 'Mapel',
            numVal,
            activeKkm,
            selected.name,
          );
          return (
            <View key={student.id} style={styles.gradeRow}>
              <View style={styles.studentRowCopy}>
                <Text style={styles.studentName}>
                  {student.nis ? `NIS ${student.nis} · ` : ''}
                  {student.name}
                </Text>
                <Text style={styles.gradeDetail}>
                  Predikat: {predikat} · {capaian}
                </Text>
              </View>
              <TextInput
                value={rawVal}
                onChangeText={(value) => {
                  const normalized = value.replace(/[^0-9.]/g, '');
                  setScores((current) => ({ ...current, [student.id]: normalized }));
                  setSaved(false);
                }}
                keyboardType="decimal-pad"
                placeholder="0–100"
                style={styles.scoreInput}
              />
            </View>
          );
        })
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Belum ada komponen nilai</Text>
          <Text style={styles.placeholderText}>
            Tekan tombol + untuk membuat penilaian baru dari sesi pertemuan. Tanpa data dummy
            otomatis.
          </Text>
        </View>
      )}

      {selected ? (
        <View style={styles.exportRow}>
          <Pressable onPress={() => void saveAllScores(false)} style={styles.exportButton}>
            <Text style={styles.exportText}>Simpan Draft Nilai</Text>
          </Pressable>
          <Pressable
            onPress={() => void saveAllScores(true)}
            style={[styles.exportButton, { backgroundColor: activePalette.accent }]}
          >
            <Text style={[styles.exportText, { color: '#FFFFFF' }]}>Finalisasi Penilaian</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.screenTitle}>Tambah Penilaian dari Pertemuan</Text>
            <TextInput
              value={componentName}
              onChangeText={setComponentName}
              placeholder="Nama Penilaian (contoh: UH Bab 1)"
              style={styles.textInput}
            />
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Mata Pelajaran"
              style={styles.textInput}
            />
            <Text style={styles.fieldLabel}>Kategori Penilaian (Task 7.3)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.statusRow}>
                {ASSESSMENT_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[styles.statusChip, category === cat && styles.statusChipSelected]}
                  >
                    <Text
                      style={[styles.statusText, category === cat && styles.statusTextSelected]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View style={styles.scheduleInputRow}>
              <TextInput
                value={maxScore}
                onChangeText={setMaxScore}
                placeholder="Maks (100)"
                keyboardType="number-pad"
                style={styles.textInputHalf}
              />
              <TextInput
                value={weight}
                onChangeText={setWeight}
                placeholder="Bobot (1)"
                keyboardType="decimal-pad"
                style={styles.textInputHalf}
              />
              <TextInput
                value={kkm}
                onChangeText={setKkm}
                placeholder="KKM (75)"
                keyboardType="number-pad"
                style={styles.textInputHalf}
              />
            </View>
            {scoreError ? <Text style={styles.formError}>{scoreError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Batal</Text>
              </Pressable>
              <Pressable onPress={() => void createComponent()} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Simpan Penilaian</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function BottomNavigation({
  activeTab,
  onChange,
}: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  const tabs: Tab[] = [
    'Beranda',
    'Jadwal',
    'Absensi',
    'Nilai',
    'Jurnal',
    'Kelas',
    'Laporan',
    'Pengaturan',
  ];
  const icons: Record<Tab, keyof typeof Ionicons.glyphMap> = {
    Beranda: 'home-outline',
    Jadwal: 'calendar-outline',
    Absensi: 'checkbox-outline',
    Nilai: 'stats-chart-outline',
    Jurnal: 'book-outline',
    Kelas: 'people-outline',
    Laporan: 'document-text-outline',
    Pengaturan: 'settings-outline',
  };
  return (
    <View style={styles.bottomNavigation} accessibilityRole="tablist">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-around' }}
      >
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
            <Ionicons
              name={icons[tab]}
              size={20}
              color={activeTab === tab ? activePalette.accent : activePalette.muted}
            />
            <Text
              style={[styles.navText, activeTab === tab && styles.navTextActive]}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
      padding: 26,
    },
    wizardBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    wizardStepBadge: {
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    wizardStepBadgeActive: { backgroundColor: palette.primary },
    wizardStepText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
    wizardStepTextActive: { color: '#FFFFFF' },
    snackbarBanner: {
      alignItems: 'center',
      backgroundColor: '#187F79',
      borderRadius: 14,
      elevation: 6,
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    snackbarText: { color: '#FFFFFF', flex: 1, fontSize: 13, fontWeight: '700' },
    safeArea: { flex: 1, backgroundColor: palette.background },
    appShell: { flex: 1 },
    dashboardHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    settingsButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      elevation: 2,
      height: 46,
      justifyContent: 'center',
      width: 46,
    },
    settingsHeader: { alignItems: 'center', flexDirection: 'row', marginBottom: 12 },
    settingsBackButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      height: 46,
      justifyContent: 'center',
      marginRight: 12,
      width: 46,
    },
    settingsHeaderCopy: { flex: 1 },
    profileCard: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      elevation: 2,
      flexDirection: 'row',
      marginTop: 14,
      padding: 16,
    },
    profileAvatar: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 30,
      height: 56,
      justifyContent: 'center',
      width: 56,
    },
    profileCopy: { flex: 1, marginLeft: 12 },
    profileName: { color: palette.text, fontSize: 16, fontWeight: '800' },
    profileSchool: { color: palette.muted, fontSize: 13, marginTop: 4 },
    outlineAction: {
      borderColor: palette.accent,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    outlineActionText: { color: palette.accent, fontSize: 13, fontWeight: '800' },
    settingsInfoCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
    },
    primarySettingsAction: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 18,
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primarySettingsActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginLeft: 8 },
    content: {
      alignSelf: 'center',
      flexGrow: 1,
      paddingHorizontal: layoutWidth >= 768 ? 32 : 18,
      paddingTop: layoutLandscape ? 12 : 18,
      paddingBottom: layoutLandscape ? 96 : 32,
      width: layoutWidth >= 768 ? 780 : '100%',
    },
    brand: { color: palette.primary, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
    greeting: { color: palette.text, fontSize: 22, fontWeight: '800', marginTop: 16 },
    screenTitle: { color: palette.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    date: { color: palette.muted, fontSize: 13, marginTop: 4 },
    helpText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
    heroCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 20,
      borderWidth: 1,
      elevation: 2,
      marginTop: 16,
      padding: 18,
    },
    heroTitle: { color: palette.text, fontSize: 19, fontWeight: '800' },
    heroSubtitle: { color: palette.muted, fontSize: 13, marginTop: 4 },
    heroTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    heroIllustration: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 34,
      height: 68,
      justifyContent: 'center',
      width: 68,
    },
    heroInfo: { flex: 1, marginLeft: 14, minWidth: 0, paddingRight: 8 },
    progressRing: {
      alignItems: 'center',
      borderColor: palette.primary,
      borderRadius: 40,
      borderWidth: 6,
      height: 80,
      justifyContent: 'center',
      width: 80,
    },
    progressValue: { color: palette.text, fontSize: 16, fontWeight: '800' },
    progressLabel: { color: palette.muted, fontSize: 11, marginTop: 1 },
    sectionTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: '800',
      marginTop: 22,
      marginBottom: 10,
    },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    quickCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      elevation: 1,
      flexBasis: '30%',
      flexGrow: 1,
      minHeight: 90,
      padding: 12,
    },
    quickTitle: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 6 },
    quickSubtitle: { color: palette.muted, fontSize: 12, marginTop: 4 },
    sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    sectionLink: { color: palette.accent, fontSize: 13, fontWeight: '800', marginTop: 22 },
    scheduleCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      padding: 14,
    },
    scheduleTime: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 12,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    scheduleTimeText: { color: palette.primary, fontSize: 13, fontWeight: '800', marginLeft: 6 },
    scheduleTitle: {
      color: palette.text,
      flex: 1,
      fontSize: 15,
      fontWeight: '800',
      marginLeft: 12,
    },
    journalAlert: {
      alignItems: 'center',
      backgroundColor: palette.warningSurface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 16,
      padding: 14,
    },
    journalCompleteCard: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
      padding: 14,
    },
    sessionContextCard: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 12,
      padding: 12,
    },
    sessionContextTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    sessionContextText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
    alertCopy: { flex: 1, marginHorizontal: 10 },
    alertTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    alertSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
    alertAction: {
      borderColor: '#E58A23',
      borderRadius: 12,
      borderWidth: 1,
      color: palette.warningText,
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    attendanceToolbar: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'space-between',
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    attendanceDateToolbar: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 12,
      minHeight: 54,
      paddingHorizontal: 8,
    },
    dateStepButton: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    selectedDateButton: { alignItems: 'center', flex: 1, justifyContent: 'center' },
    selectedDateText: { color: palette.text, fontSize: 14, fontWeight: '800' },
    selectedDateHint: { color: palette.muted, fontSize: 11 },
    scheduleNotice: {
      alignItems: 'center',
      backgroundColor: palette.warningSurface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 10,
      padding: 12,
    },
    scheduleNoticeText: {
      color: palette.warningText,
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      marginLeft: 10,
    },
    attendanceAlertCard: {
      alignItems: 'flex-start',
      backgroundColor: palette.warningSurface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 14,
      padding: 14,
    },
    alertDetail: { color: palette.warningText, fontSize: 12, fontWeight: '700', marginTop: 3 },
    overrideButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.primary,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      marginTop: 10,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    overrideText: { color: palette.primary, fontSize: 13, fontWeight: '800' },
    toolbarAction: { paddingVertical: 6 },
    toolbarActionText: { color: palette.accent, fontSize: 13, fontWeight: '800' },
    countText: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    studentCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 10,
      padding: 14,
    },
    studentName: { color: palette.text, fontSize: 15, fontWeight: '700' },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    noteToggle: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 10 },
    noteToggleText: { color: palette.primary, fontSize: 12, fontWeight: '700' },
    noteInput: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.text,
      marginTop: 8,
      minHeight: 46,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    statusChip: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      minHeight: 38,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    statusChipSelected: { backgroundColor: palette.accent, borderRadius: 12 },
    statusText: { color: palette.text, fontSize: 12, fontWeight: '700' },
    statusTextSelected: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    saveButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderRadius: 16,
      justifyContent: 'center',
      marginTop: 18,
      minHeight: 52,
      overflow: 'hidden',
    },
    saveGradient: { alignItems: 'center', justifyContent: 'center', minHeight: 52, width: '100%' },
    savePressed: { opacity: 0.9 },
    saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    finalizeButton: {
      alignItems: 'center',
      borderColor: palette.primary,
      borderRadius: 16,
      borderWidth: 1.5,
      justifyContent: 'center',
      marginTop: 10,
      minHeight: 48,
    },
    finalizeButtonText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
    recapToggle: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 14,
      minHeight: 44,
    },
    recapToggleText: { color: palette.primary, fontSize: 14, fontWeight: '800', marginLeft: 6 },
    recapCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 8,
      padding: 14,
    },
    recapPeriodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    recapPeriod: {
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      flexGrow: 1,
      minHeight: 38,
      paddingHorizontal: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    recapPeriodSelected: { backgroundColor: palette.primary },
    recapPeriodText: { color: palette.text, fontSize: 12, fontWeight: '700' },
    recapPeriodTextSelected: { color: '#FFFFFF' },
    customRangeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    customRangeInput: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.text,
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 10,
    },
    recapRow: {
      alignItems: 'center',
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 40,
    },
    bottomNavigation: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      minHeight: 68,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    navItem: {
      alignItems: 'center',
      borderRadius: 14,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 68,
      paddingHorizontal: 8,
    },
    navItemActive: {
      backgroundColor: palette.primarySoft,
    },
    navText: { color: palette.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    navTextActive: { color: palette.primary, fontWeight: '800' },
    classPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    classPickerChip: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: 'row',
      minHeight: 40,
      paddingHorizontal: 12,
    },
    classPickerChipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    classPickerText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    classPickerTextSelected: { color: '#FFFFFF' },
    classChip: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    classChipSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    classChipText: { color: palette.text, fontSize: 12, fontWeight: '800' },
    classChipTextSelected: { color: '#FFFFFF' },
    classAddChip: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 14,
      justifyContent: 'center',
      minHeight: 40,
      width: 40,
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
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      marginBottom: 8,
      padding: 12,
    },
    avatar: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    avatarText: { color: palette.primary, fontSize: 18, fontWeight: '800' },
    studentRowCopy: { flex: 1, marginLeft: 10 },
    studentActions: { alignItems: 'center', flexDirection: 'row' },
    archivedToggle: { alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: 6 },
    restoreButton: {
      backgroundColor: palette.primarySoft,
      borderRadius: 12,
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    restoreText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    smallIconButton: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 38,
      minWidth: 38,
    },
    addStudentButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 12,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    addStudentText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginLeft: 8 },
    importButton: {
      alignItems: 'center',
      backgroundColor: palette.primarySoft,
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 10,
      minHeight: 48,
    },
    importText: { color: palette.primary, fontSize: 14, fontWeight: '800', marginLeft: 8 },
    templateButton: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 8,
      minHeight: 40,
    },
    templateText: { color: palette.muted, fontSize: 12, fontWeight: '700', marginLeft: 6 },
    modalScrim: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
    modalScrimCenter: {
      alignItems: 'center',
      backgroundColor: 'rgba(15,23,42,0.45)',
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 22,
    },
    datePickerCard: {
      backgroundColor: palette.surface,
      borderRadius: 22,
      padding: 18,
      width: '100%',
    },
    datePickerHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    datePickerNav: {
      alignItems: 'center',
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    datePickerMonth: { color: palette.text, fontSize: 15, fontWeight: '800' },
    calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    calendarWeekText: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'center',
      width: 38,
    },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    calendarDay: { alignItems: 'center', height: 40, justifyContent: 'center', width: '14.2857%' },
    calendarDaySelected: { backgroundColor: palette.primary, borderRadius: 12 },
    calendarDayText: { color: palette.text, fontSize: 13, fontWeight: '700' },
    calendarDayTextSelected: { color: '#FFFFFF' },
    reasonCard: {
      backgroundColor: palette.surface,
      borderRadius: 22,
      padding: 20,
      width: '100%',
    },
    promotionStudentRow: {
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      paddingVertical: 10,
    },
    contextSwitchButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
    },
    contextSwitchText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    reasonButton: {
      backgroundColor: palette.surfaceSoft,
      borderRadius: 12,
      marginTop: 8,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    reasonButtonText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
    modalHint: { color: palette.muted, fontSize: 13, marginTop: 6 },
    textInput: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      color: palette.text,
      fontSize: 15,
      marginTop: 12,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    scheduleInputRow: { flexDirection: 'row', gap: 8 },
    textInputHalf: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      color: palette.text,
      flex: 1,
      fontSize: 14,
      marginTop: 10,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    formError: { color: '#C94F3B', fontSize: 12, marginTop: 8, fontWeight: '700' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: {
      alignItems: 'center',
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    cancelText: { color: palette.muted, fontSize: 14, fontWeight: '800' },
    confirmButton: {
      alignItems: 'center',
      backgroundColor: palette.accent,
      borderRadius: 14,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
    },
    confirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    dayRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    dayChip: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
    },
    dayChipSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    dayChipText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
    dayChipTextSelected: { color: '#FFFFFF' },
    emptyCard: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 10,
      padding: 22,
    },
    emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
    journalCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 16,
    },
    journalInputSmall: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      color: palette.text,
      fontSize: 14,
      marginTop: 10,
      minHeight: 80,
      padding: 12,
    },
    gradeDetail: { color: palette.muted, fontSize: 11, marginTop: 3 },
    metricCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flexBasis: '46%',
      flexGrow: 1,
      padding: 10,
    },
    metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    workflowSummaryCard: {
      backgroundColor: palette.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      marginTop: 12,
    },
    hidden: { display: 'none' },
    metricValue: { color: palette.text, fontSize: 16, fontWeight: '800' },
    metricLabel: { color: palette.muted, fontSize: 11, marginTop: 2 },
    gradeRow: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
      padding: 12,
    },
    scoreInput: {
      backgroundColor: palette.surfaceSoft,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      color: palette.text,
      fontSize: 15,
      fontWeight: '800',
      minHeight: 44,
      paddingHorizontal: 10,
      textAlign: 'center',
      width: 72,
    },
    gradeComponentRow: { gap: 8, paddingVertical: 12 },
    gradeComponentChip: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    gradeComponentSelected: { backgroundColor: palette.accent, borderColor: palette.accent },
    gradeComponentText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    gradeComponentMeta: { color: palette.muted, fontSize: 11, marginTop: 2 },
    gradeComponentTextSelected: { color: '#FFFFFF' },
    fieldLabel: { color: palette.text, fontSize: 13, fontWeight: '800', marginTop: 12 },
    fieldHelp: { color: palette.muted, fontSize: 11, marginTop: 4 },
    agendaRow: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
      minHeight: 50,
      padding: 12,
    },
    completedAgenda: { color: palette.muted, textDecorationLine: 'line-through' },
    reportOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    reportOption: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      minHeight: 56,
      justifyContent: 'center',
    },
    reportOptionSelected: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
    reportOptionText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    reportCheckRow: { alignItems: 'center', flexDirection: 'row', marginTop: 12, minHeight: 44 },
    reportCheckText: { color: palette.text, fontSize: 13, fontWeight: '700' },
    previewStatus: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    exportRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    exportButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 10,
    },
    exportText: { color: palette.text, fontSize: 13, fontWeight: '800', marginLeft: 6 },
    exportMessage: {
      color: palette.primary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 10,
      textAlign: 'center',
    },
    placeholderText: { color: palette.muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
    pressed: { opacity: 0.85 },
  });
}
