export const ASSESSMENT_CATEGORIES = [
  'Tugas',
  'Kuis',
  'Ulangan harian',
  'Praktik',
  'Proyek',
  'UTS',
  'UAS',
  'Remedial',
  'Susulan',
] as const;

export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number];

export type ScoreValidation =
  | { valid: true; value: number }
  | { valid: false; reason: 'empty' | 'not-a-number' | 'out-of-range' };

export function validateScore(raw: string, maxScore: number): ScoreValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, reason: 'empty' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { valid: false, reason: 'not-a-number' };
  if (value < 0 || value > maxScore) return { valid: false, reason: 'out-of-range' };
  return { valid: true, value };
}

export function missingScoreIds(
  studentIds: string[],
  scores: Record<string, string | undefined>,
): string[] {
  return studentIds.filter((id) => !scores[id]?.trim());
}

export type GradePredicate = 'A' | 'B' | 'C' | 'D';

export function calculatePredicate(score: number | null, kkm = 75): GradePredicate | '—' {
  if (score === null || !Number.isFinite(score)) return '—';
  const interval = Math.max(1, (100 - kkm) / 3);
  if (score >= 100 - interval) return 'A';
  if (score >= kkm + interval) return 'B';
  if (score >= kkm) return 'C';
  return 'D';
}

export function buildCompetencyDescription(
  studentName: string,
  subjectName: string,
  score: number | null,
  kkm = 75,
  componentName = 'materi pembelajaran',
): string {
  if (score === null || !Number.isFinite(score)) {
    return `${studentName} belum memiliki nilai pada ${componentName}.`;
  }
  const predikat = calculatePredicate(score, kkm);
  if (predikat === 'A') {
    return `Tuntas sangat baik (${score.toFixed(0)}). Menunjukkan penguasaan sangat tinggi pada ${componentName} (${subjectName}).`;
  }
  if (predikat === 'B') {
    return `Tuntas baik (${score.toFixed(0)}). Menguasai kompetensi inti ${componentName} (${subjectName}) dengan baik.`;
  }
  if (predikat === 'C') {
    return `Tuntas cukup (${score.toFixed(0)}). Memenuhi KKTP/KKM (${kkm}) pada ${componentName}, dapat ditingkatkan melalui latihan pengayaan.`;
  }
  return `Belum tuntas (${score.toFixed(0)} < KKM ${kkm}). Perlu bimbingan dan remedial pada ${componentName} (${subjectName}).`;
}

export function summarizeAssessmentScores(
  scores: Array<number | null | undefined>,
  totalStudents: number,
  kkm = 75,
) {
  const valid = scores.filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
  if (!valid.length) {
    return {
      average: null,
      highest: null,
      lowest: null,
      gradedCount: 0,
      ungradedCount: totalStudents,
      passedCount: 0,
      remedialCount: 0,
    };
  }
  const sum = valid.reduce((acc, item) => acc + item, 0);
  const average = Number((sum / valid.length).toFixed(1));
  const highest = Math.max(...valid);
  const lowest = Math.min(...valid);
  const passedCount = valid.filter((val) => val >= kkm).length;
  const remedialCount = valid.filter((val) => val < kkm).length;
  return {
    average,
    highest,
    lowest,
    gradedCount: valid.length,
    ungradedCount: Math.max(0, totalStudents - valid.length),
    passedCount,
    remedialCount,
  };
}
