import { getNationalHoliday, listNationalHolidays } from './national-holidays';

describe('kalender nasional lokal', () => {
  it('recognizes the official 2026 Independence Day entry', () => {
    expect(getNationalHoliday('2026-08-17')?.title).toContain('Kemerdekaan');
    expect(getNationalHoliday('2026-08-18')).toBeNull();
  });

  it('does not invent dates for years without a bundled government list', () => {
    expect(listNationalHolidays(2027)).toEqual([]);
  });
});
