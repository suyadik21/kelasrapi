# KelasRapi Data Inventory

KelasRapi V1 berjalan offline-first. Tidak ada Firebase, Google Drive, login,
atau analytics yang diperlukan untuk alur inti.

| Data              | Tujuan                           | Wajib                  | Lokasi V1      | Cloud default |
| ----------------- | -------------------------------- | ---------------------- | -------------- | ------------- |
| Profil guru lokal | Preferensi dan identitas laporan | Tidak                  | Database lokal | Tidak         |
| Kelas             | Pengelompokan siswa dan laporan  | Ya                     | Database lokal | Tidak         |
| Siswa             | Absensi, nilai, dan laporan      | Ya                     | Database lokal | Tidak         |
| Jadwal            | Menentukan pekerjaan hari ini    | Tidak                  | Database lokal | Tidak         |
| Agenda/jurnal     | Dokumentasi kegiatan mengajar    | Tidak                  | Database lokal | Tidak         |
| Absensi           | Rekap kehadiran                  | Ya untuk modul absensi | Database lokal | Tidak         |
| Komponen/nilai    | Buku nilai dan laporan           | Tidak                  | Database lokal | Tidak         |
| Draft/autosave    | Pemulihan input                  | Otomatis               | Database lokal | Tidak         |
| Backup metadata   | Validasi dan pemulihan           | Otomatis saat backup   | Arsip lokal    | Tidak         |

Cloud hanya boleh ditambahkan melalui change terpisah dengan persetujuan eksplisit
dan penjelasan data, tujuan, akun, retensi, serta dampak biaya.
