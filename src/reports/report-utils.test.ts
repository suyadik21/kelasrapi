import * as XLSX from 'xlsx';
import {
  buildAttendanceAccumulationHtml,
  buildReportHtml,
  createReportWorkbook,
} from './report-utils';

describe('report export golden structure', () => {
  it('keeps headers, Indonesian characters, long names, empty fallback, and column widths', () => {
    const rows = [
      { No: 1, Siswa: 'Siti Nur Aisyah é — nama panjang untuk uji laporan', Status: 'Hadir' },
      ...Array.from({ length: 60 }, (_, index) => ({
        No: index + 2,
        Siswa: `Siswa ${index + 2}`,
        Status: index % 2 ? 'Izin' : 'Hadir',
      })),
    ];
    const workbook = createReportWorkbook('Absensi', rows);
    const sheet = workbook.Sheets.Absensi;
    const decoded = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);
    expect(decoded).toHaveLength(61);
    expect(decoded[0].Siswa).toContain('Aisyah é');
    expect(sheet['!cols']).toHaveLength(3);

    const emptySheet = createReportWorkbook('Kosong', []);
    expect(XLSX.utils.sheet_to_json(emptySheet.Sheets.Kosong)).toEqual([
      { Data: 'Tidak ada data' },
    ]);
  });

  it('builds printable HTML with pagination-safe table styles and escaped cells', () => {
    const html = buildReportHtml({
      title: 'Laporan “Kelas 1A”',
      period: 'Bulan ini',
      headers: ['Siswa', 'Status'],
      rows: [['<Nama>', 'Hadir']],
    });
    expect(html).toContain('@page');
    expect(html).toContain('page-break-inside:avoid');
    expect(html).toContain('&lt;Nama&gt;');
    expect(html).toContain('Bulan ini');
  });

  it('builds a per-student attendance accumulation section with rankings', () => {
    const html = buildAttendanceAccumulationHtml([
      { name: 'Siti <A>', hadir: 18, sakit: 1, izin: 2, alpa: 0, terlambat: 3 },
      { name: 'Budi', hadir: 16, sakit: 0, izin: 0, alpa: 2, terlambat: 1 },
    ]);
    expect(html).toContain('Rekap akumulasi bulan berjalan');
    expect(html).toContain('Siti &lt;A&gt;');
    expect(html).toContain('Siswa paling sering terlambat');
    expect(html).toContain('<td>18</td>');
  });
});
