import { missingScoreIds, validateScore } from './grading';

describe('grading domain rules', () => {
  it('accepts values within the configured range', () => {
    expect(validateScore('88', 100)).toEqual({ valid: true, value: 88 });
    expect(validateScore('0', 100)).toEqual({ valid: true, value: 0 });
  });

  it('rejects empty, non-numeric, and out-of-range values', () => {
    expect(validateScore('', 100)).toEqual({ valid: false, reason: 'empty' });
    expect(validateScore('abc', 100)).toEqual({ valid: false, reason: 'not-a-number' });
    expect(validateScore('101', 100)).toEqual({ valid: false, reason: 'out-of-range' });
  });

  it('finds incomplete score sets without changing existing values', () => {
    const scores = { a: '80', b: '', c: '  ' };
    expect(missingScoreIds(['a', 'b', 'c'], scores)).toEqual(['b', 'c']);
    expect(scores).toEqual({ a: '80', b: '', c: '  ' });
  });
});
