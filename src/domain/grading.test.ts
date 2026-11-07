import {
  ASSESSMENT_CATEGORIES,
  buildCompetencyDescription,
  calculatePredicate,
  missingScoreIds,
  summarizeAssessmentScores,
  validateScore,
} from './grading';

describe('grading domain rules (Phase 7 & 12)', () => {
  it('validates score ranges and identifies missing student scores', () => {
    expect(validateScore('85', 100)).toEqual({ valid: true, value: 85 });
    expect(validateScore('', 100)).toEqual({ valid: false, reason: 'empty' });
    expect(validateScore('abc', 100)).toEqual({ valid: false, reason: 'not-a-number' });
    expect(validateScore('-1', 100)).toEqual({ valid: false, reason: 'out-of-range' });
    expect(validateScore('105', 100)).toEqual({ valid: false, reason: 'out-of-range' });
    expect(missingScoreIds(['s1', 's2', 's3'], { s1: '90', s2: '  ' })).toEqual(['s2', 's3']);
  });

  it('includes all 9 required assessment categories', () => {
    expect(ASSESSMENT_CATEGORIES).toEqual([
      'Tugas',
      'Kuis',
      'Ulangan harian',
      'Praktik',
      'Proyek',
      'UTS',
      'UAS',
      'Remedial',
      'Susulan',
    ]);
  });

  it('calculates predicates (A/B/C/D) and competency descriptions from KKM/KKTP', () => {
    expect(calculatePredicate(95, 75)).toBe('A');
    expect(calculatePredicate(85, 75)).toBe('B');
    expect(calculatePredicate(76, 75)).toBe('C');
    expect(calculatePredicate(60, 75)).toBe('D');
    expect(calculatePredicate(null, 75)).toBe('—');

    expect(
      buildCompetencyDescription('Alya', 'Matematika', 95, 75, 'Pecahan Senilai'),
    ).toContain('Tuntas sangat baik');
    expect(
      buildCompetencyDescription('Bima', 'Matematika', 60, 75, 'Pecahan Senilai'),
    ).toContain('Perlu bimbingan dan remedial');
  });

  it('summarizes assessment statistics accurately', () => {
    const stats = summarizeAssessmentScores([90, 80, 70, null], 4, 75);
    expect(stats).toEqual({
      average: 80,
      highest: 90,
      lowest: 70,
      gradedCount: 3,
      ungradedCount: 1,
      passedCount: 2,
      remedialCount: 1,
    });
  });
});
