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
