import * as XLSX from 'xlsx';

export type ReportExportRow = Record<string, string | number>;

export type AttendanceAccumulationExportRow = {
  name: string;
  nis?: string | null;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  terlambat: number;
};

export function createReportWorkbook(sheetName: string, rows: ReportExportRow[]) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Data: 'Tidak ada data' }]);
  sheet['!cols'] = Object.keys(rows[0] ?? { Data: '' }).map((key) => ({
    wch: Math.min(34, Math.max(12, key.length + 4)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
}

export function buildReportHtml(options: {
  title: string;
  period: string;
  headers: string[];
  rows: string[][];
  extraHtml?: string;
  summary?: string;
}) {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const header = options.headers.map((value) => `<th>${escape(value)}</th>`).join('');
  const body = options.rows
    .map(
      (row, index) =>
        `<tr><td class="number">${index + 1}</td>${row.map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:17mm 15mm 18mm}body{font-family:Arial,sans-serif;color:#24354D;font-size:11px;line-height:1.45}
    .brand{color:#187F79;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase}
    h1{font-size:22px;margin:5px 0 2px;color:#24354D}p{margin:3px 0;color:#687B91}.meta{border-bottom:2px solid #2BB7A9;padding-bottom:10px;margin-bottom:16px}
    .summary{background:#EAF4FF;border-left:4px solid #FF795C;padding:9px 12px;margin:0 0 16px;font-weight:bold}
    table{border-collapse:collapse;width:100%;font-size:10.5px}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border-bottom:1px solid #D7E3EF;padding:7px 8px;text-align:left}th{background:#24354D;color:#FFFFFF;font-size:10px;text-transform:uppercase;letter-spacing:.3px}.number{width:28px;text-align:center;color:#687B91}tbody tr:nth-child(even){background:#F5F9FD}
    .footer{border-top:1px solid #D7E3EF;margin-top:22px;padding-top:8px;color:#687B91;font-size:9px;text-align:right}
  </style></head><body><div class="meta"><div class="brand">KelasRapi · Administrasi Kelas</div><h1>${escape(options.title)}</h1><p>Periode: ${escape(options.period)}</p><p>Dibuat: ${escape(new Date().toLocaleString('id-ID'))}</p></div>${options.summary ? `<div class="summary">${escape(options.summary)}</div>` : ''}<table><thead><tr><th>No.</th>${header}</tr></thead><tbody>${body || '<tr><td colspan="99">Tidak ada data untuk periode ini.</td></tr>'}</tbody></table>${options.extraHtml ?? ''}<div class="footer">Dokumen dibuat offline oleh KelasRapi · Periksa kembali sebelum dibagikan</div></body></html>`;
}

export function buildAttendanceAccumulationHtml(rows: AttendanceAccumulationExportRow[]) {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ranking = (
    field: Exclude<keyof AttendanceAccumulationExportRow, 'name' | 'nis'>,
    label: string,
  ) => {
    const ranked = rows
      .filter((row) => row[field] > 0)
      .sort((left, right) => Number(right[field]) - Number(left[field]))
      .slice(0, 5);
    return `<h2>${label}</h2><ol>${ranked.map((row) => `<li>${escape(row.name)} — ${row[field]} hari</li>`).join('') || '<li>Tidak ada data</li>'}</ol>`;
  };
  return `<section class="accumulation"><h2>Rekap akumulasi bulan berjalan</h2><table><thead><tr><th>Siswa</th><th>NIS</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Terlambat</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escape(row.name)}</td><td>${escape(row.nis ?? 'Belum diisi')}</td><td>${row.hadir}</td><td>${row.sakit}</td><td>${row.izin}</td><td>${row.alpa}</td><td>${row.terlambat}</td></tr>`).join('')}</tbody></table>${ranking('terlambat', 'Siswa paling sering terlambat')}${ranking('sakit', 'Siswa paling sering sakit')}${ranking('izin', 'Siswa paling sering izin')}${ranking('alpa', 'Siswa paling sering alpa')}</section>`;
}
