# KelasRapi low-fidelity wireframes

These wireframes define the information architecture before visual styling. `[]` is an action, `()` is a selectable chip, and `{}` is editable content.

## Beranda

```text
KELASRAPI                         [menu]
Selamat pagi, {teacher}
{date} · {active class}
-----------------------------------------
Panduan tugas hari ini                 [x]
Pilih kelas dan lanjutkan tugas utama.
-----------------------------------------
Jadwal hari ini          [Lihat jadwal]
{time} {subject} {class}
-----------------------------------------
Aksi cepat
[Absensi] [Nilai]
[Jurnal]  [Laporan]
-----------------------------------------
[Beranda] [Absensi] [Kelas] [Jadwal] [Laporan]
```

## Kelas dan siswa

```text
Kelas saya                         [+]
{help text}
({class 1}) ({class 2})
-----------------------------------------
{class name} · {group} · {count} siswa
-----------------------------------------
Daftar siswa                         [arsip]
{avatar} {student name}       [↑] [↓] [...]
{avatar} {student name}       [↑] [↓] [...]
[Tambah siswa] [Import spreadsheet]
[Unduh template XLSX]
```

## Absensi

```text
Absensi {class} · {date}
[Semua hadir] [Ubah status semua] [Urungkan]
-----------------------------------------
{student}  (Hadir) (Sakit) (Izin)
           (Alpa)  (Terlambat)
           [Tambah catatan] {note}
-----------------------------------------
[Simpan absensi]
Draft lokal tersimpan otomatis.
[Lihat rekap]  (Hari) (Bulan) (Semester)
```

## Nilai

```text
Nilai {class}                         [+]
[panduan komponen]
(component A) (component B)
Nama · kategori · bobot · maksimum
-----------------------------------------
{student}             {score}/{max}
Catatan: {note}
{student}             Belum dinilai
-----------------------------------------
[Simpan nilai]
```

## Jurnal

```text
Jurnal {class} · {date}
[panduan]
Materi / kegiatan
{multiline editor}
Agenda terkait
{agenda rows}
[Simpan draft] [Kirim jurnal]
```

## Jadwal

```text
Jadwal {class}                         [+]
(Sen) (Sel) (Rab) (Kam) (Jum)
-----------------------------------------
{time} {title} {repeat}             [...]
{time} {title} {repeat}             [...]
```

## Laporan

```text
Laporan {class}
(Absensi) (Data siswa) (Nilai) (Jurnal)
(Hari) (Bulan) (Semester)
Preview · {period}
-----------------------------------------
{summary}
{rows with pagination}
-----------------------------------------
[Excel] [PDF] [Cetak]
```

## Backup / restore

```text
Cadangan lokal
Data tersimpan di perangkat.
[Buat backup] [Pulihkan backup]
-----------------------------------------
Backup terakhir: {date} · {size}
Pulihkan akan mengganti data berikut:
{table counts}
[Batal] [Pulihkan]
```

The clickable attendance path is: Beranda → Absensi → select a status → Simpan → Lihat rekap. The recovery path is: edit a note/status → leave or restart → reopen Absensi → confirm the draft is present.
