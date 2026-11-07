# OpenPacket deployment — 25 Oktober 2026

- Situs: https://openpacket.zuhri.my.id/
- Release: `20261025T012131Z`.
- Source base: `ffa9a59` beserta perbaikan lokal 24–25 Oktober; belum dibuat commit baru.
- Versi produk tetap `2.3.0`; artefak ditelusuri lewat release ID dan hash.
- Web root: `/www/wwwroot/openpacket.zuhri.my.id`.
- Release tersimpan: `/var/lib/openpacket/releases/20261025T012131Z`.
- Backup sebelum perubahan: `/var/backups/openpacket/20261025T012131Z`.

## Perubahan

| Temuan audit 24 Oktober | Perbaikan |
|---|---|
| Refresh menghilangkan pekerjaan | Draft kanvas per tab, termasuk konfigurasi, anotasi dan status lab; reset juga dipertahankan. `write memory` menyimpan draft serta menjelaskan batasnya. |
| Nilai dua soal 100 tetapi pengumpulan 50 | Kanvas independen per soal. Penilaian dan verifikasi memakai snapshot masing-masing soal. |
| `.opsub` membawa nilai lama | Ekspor hanya pekerjaan tanpa nilai; impor guru menilai ulang snapshot aktual. Format lama tetap diterima dan dinilai ulang. |
| Ekspor melewati larangan Cek Mandiri | Ekspor tidak memanggil evaluator dan tidak membawa skor atau feedback. |
| Amplop terus berulang saat Jeda | Animasi satu kali per hop, mengikuti Jeda/Lanjutkan, Speed, Step dan preferensi pengurangan gerak. |

Nilai mandiri dibatalkan ketika konfigurasi berubah. HUD dibatasi tinggi area kanvas agar tombol ekspor tetap dapat diklik saat panel log terbuka.

**Batas penyimpanan:** draft memakai `sessionStorage`, bertahan setelah refresh di tab yang sama. Ekspor berkas diperlukan untuk penyimpanan di luar tab/perangkat. Penyimpanan yang diblokir/penuh menampilkan peringatan; pekerjaan per soal tetap dipertahankan di memori selama halaman berjalan. Tidak ada pemisahan running-config/startup-config atau NVRAM sungguhan yang ditambahkan.

## Verifikasi sebelum rilis

- `npm run test:coverage -- --reporter=dot`: **467/467**, 35 berkas. Line coverage protokol `src/engine` **91,1%**, `simulationEngine.ts` **90,96%**; keseluruhan berkas yang dicakup unit test **79,89%**.
- TypeScript, build produksi, pemeriksaan sintaks relay dan `git diff --check` lulus.
- Putaran E2E akhir: `npm run e2e -- --workers=1 --retries=1`, **22 passed**, seluruhnya pada percobaan pertama. Mencakup tujuh regresi audit baru, alur kelas, CLI, routing, WiFi, lab, dan Step.
- Percobaan awal mengalami `ERR_NETWORK_CHANGED` serta benturan folder artefak dua proses tes. Putaran akhir dijalankan berurutan dan bersih; hasil tersebut yang menjadi dasar deployment.

## Deployment

Arsip diunggah dan diverifikasi SHA-256. Seluruh web root lama disalin ke backup sebelum perubahan. Izin staged directory/file dinormalisasi ke 755/644. Aset lama dipertahankan untuk tab yang masih memakai versi sebelumnya; HTML baru dipasang lewat rename atomik.

Relay memerlukan pembaruan sanitizer agar menyimpan peta snapshot per soal pada endpoint privat guru. Autentikasi dan batas ukuran lama dipertahankan. Sebelum restart, dua pemeriksaan health mengonfirmasi `activeRooms: 0`. Proses PM2 milik root `openpacket-relay` direstart; PID berubah dari **141650** menjadi **194678**, lalu health kembali `ok`. Nginx dan sertifikat tidak diubah.

## Hash artefak

| Artefak | SHA-256 |
|---|---|
| Arsip build + relay core | `6138cc3d372106d884ffbb244b63f3383f6cdd7ff74208d43aefbb9442fbf8fa` |
| HTML publik/origin/lokal | `f55afc38295ae3689188dedc0c75e7e1141948a94153dd93ece5045d4660474d` |
| Relay core | `ad43e90b11577cfca54bc08e1735bb30085e8a220bc74c698042c055c551986c` |

## Pemeriksaan produksi

- HTML publik cocok dengan build lokal dan origin. Dua belas aset yang dirujuk HTML merespons HTTP 200; relay sehat.
- Kelas sintetis `FIX-1025-0121`: dua soal PC-1 dengan gateway `192.168.1.1` dan `192.168.1.254` dikerjakan pada kanvas terpisah. Pengumpulan menghasilkan **100/100**, verifikasi guru juga **100/100 Terverifikasi**. [Bukti](../../audit-output/2026-10-25/screenshots/production-teacher-verified100.png).
- Refresh mempertahankan pekerjaan dan pilihan soal. Kembali ke soal 1 memulihkan gateway `192.168.1.1`. [Bukti](../../audit-output/2026-10-25/screenshots/production-question1-gateway-restored.png).
- Guru mematikan Cek Mandiri. Ekspor asli browser menghasilkan [berkas pekerjaan](../../audit-output/2026-10-25/production-work.opsub) berformat `openpacket_work`, berisi kedua snapshot dan tanpa field nilai/evaluasi/feedback. Impor dan verifikasi berkas itu di portal guru menghasilkan **100/100 Terverifikasi**. [Bukti](../../audit-output/2026-10-25/screenshots/production-import-work-verified.png).
- Pada simulasi P2P yang dijeda, dua pengukuran posisi amplop berselang 300 ms identik. [Data](../../audit-output/2026-10-25/production-pause-positions.json), [tampilan](../../audit-output/2026-10-25/screenshots/production-paused-packet.png).
- Setelah Lanjutkan pada 2x, ping P2P selesai **4/4 echo reply, TTL 128**. [Bukti](../../audit-output/2026-10-25/screenshots/production-ping4of4.png).
- Kelas uji ditutup; API publik mengonfirmasi status `closed`. Health masih dapat menghitung satu entri kelas tertutup sampai TTL pembersihan relay. [Bukti](../../audit-output/2026-10-25/screenshots/production-class-closed.png).
- Tidak ada page error yang tercatat pada konteks guru dan siswa selama pemeriksaan produksi.

Guru dan siswa perlu memuat ulang halaman untuk menggunakan perilaku/format ekspor baru secara bersamaan.

## Rollback

```bash
ssh vps 'sudo -n /var/backups/openpacket/20261025T012131Z/rollback.sh'
```

Skrip memulihkan aset, relay core, dan HTML lama serta memeriksa hash sebelumnya dan health relay. Sintaks rollback dan keberadaan backup sudah diverifikasi; rollback tidak dijalankan karena rilis berhasil.
