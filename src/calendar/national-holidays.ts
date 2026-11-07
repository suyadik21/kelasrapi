export type NationalHoliday = {
  date: string;
  title: string;
  kind: 'holiday';
};

export const WORKDAY_OVERRIDE_TITLE = '__KELASRAPI_WORKDAY_OVERRIDE__';

// Sumber resmi: SKB Libur Nasional dan Cuti Bersama Tahun 2026.
// Data lokal membuat kalender tetap berguna tanpa jaringan; tahun baru ditambahkan
// setelah SKB pemerintah diterbitkan.
const INDONESIA_2026: NationalHoliday[] = [
  ['2026-01-01', 'Tahun Baru 2026 Masehi'],
  ['2026-01-16', 'Isra Mikraj Nabi Muhammad SAW'],
  ['2026-02-17', 'Tahun Baru Imlek 2577 Kongzili'],
  ['2026-03-19', 'Hari Suci Nyepi (Tahun Baru Saka 1948)'],
  ['2026-03-21', 'Hari Raya Idul Fitri 1447 H'],
  ['2026-03-22', 'Hari Raya Idul Fitri 1447 H'],
  ['2026-04-03', 'Wafat Yesus Kristus'],
  ['2026-04-05', 'Hari Kebangkitan Yesus Kristus (Paskah)'],
  ['2026-05-01', 'Hari Buruh Internasional'],
  ['2026-05-14', 'Kenaikan Yesus Kristus'],
  ['2026-05-27', 'Hari Raya Idul Adha 1447 H'],
  ['2026-05-31', 'Hari Raya Waisak 2570 BE'],
  ['2026-06-01', 'Hari Lahir Pancasila'],
  ['2026-06-16', '1 Muharam 1448 H (Tahun Baru Islam)'],
  ['2026-08-17', 'Hari Proklamasi Kemerdekaan'],
  ['2026-08-25', 'Maulid Nabi Muhammad SAW'],
  ['2026-12-25', 'Kelahiran Yesus Kristus'],
].map(([date, title]) => ({ date, title, kind: 'holiday' as const }));

export function getNationalHoliday(date: string, year = Number(date.slice(0, 4))) {
  if (year !== 2026) return null;
  return INDONESIA_2026.find((holiday) => holiday.date === date) ?? null;
}

export function listNationalHolidays(year: number) {
  return year === 2026 ? INDONESIA_2026 : [];
}
