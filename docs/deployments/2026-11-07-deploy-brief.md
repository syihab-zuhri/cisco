# Brief deploy produksi — 7 November 2026

> Untuk agent deploy. Dokumen ini instruksi kerja, bukan catatan hasil. Setelah selesai, tulis catatan hasil
> di `docs/deployments/2026-11-07-openpacket.md` dengan format yang sama seperti `2026-10-25-openpacket.md`.

## 1. Target

| Item | Nilai |
|---|---|
| Situs | https://openpacket.zuhri.my.id/ |
| Commit sumber | `a2baed9` (branch `feat/audit-improvements`) |
| Rilis terakhir di produksi | `20261025T012131Z` (lihat `2026-10-25-openpacket.md`) |
| Yang berubah | Frontend (`dist/`) **dan** relay core (`scripts/classroom-relay-core.mjs`) |
| Tidak berubah | `scripts/classroom-relay.mjs` (SHA-256 `be4a74c0…aceb30`), nginx, sertifikat, header HTTP |
| SHA-256 relay core di `a2baed9` | `94b2f3fe556a9d2443825f4bbd7276f0841af132cee4cbed3e6edbfaa9cfa478` |
| SHA-256 relay core rilis 25 Okt | `ad43e90b11577cfca54bc08e1735bb30085e8a220bc74c698042c055c551986c` |

Akses server memakai alias SSH `vps` (akun `zuhri`, `sudo -n`) seperti rilis sebelumnya. Host, port, dan kredensial
**tidak boleh** ditulis ke repo, log, atau catatan (INV-007). Jika alias tidak tersedia, berhenti dan tanyakan pemilik proyek.

## 2. Isi rilis

1. **Kirim jawaban satu kali per ronde.** Tombol Kirim Jawaban membuka dialog konfirmasi. Setelah terkirim, tombol
   menjadi "Jawaban Terkirim" dan terkunci. Relay menolak kiriman kedua pada ronde yang sama dengan **409**. Ronde
   baru (guru menyiarkan soal) membuka kembali kesempatan kirim.
2. **Jawaban yang gagal terkirim** (galat jaringan) tidak mengunci siswa. Siswa diberi tahu dan dapat mengirim lagi.
3. **Kode kelas dipakai ulang guru lain.** Tampilan anonim `GET /state` kini memuat `session.id` (bukan rahasia).
   Siswa dari kelas lama tidak lagi ikut masuk ke kelas baru dengan kode yang sama.
4. Relay menolak (**422**) jawaban untuk soal yang tidak aktif di kelas itu.
5. Form Buat Kelas memeriksa kode kustom ke relay sebelum membuka kelas.

## 3. Risiko dan kompatibilitas

- **Deploy dua fase.** Fase A (frontend + backup) boleh berjalan walau ada kelas aktif. Fase B (relay core + restart)
  hanya berjalan bila tidak ada kelas nyata. Fase B boleh dilakukan pada sesi terpisah, misalnya malam hari.
- **Relay harus direstart** agar aturan 409/422 dan `session.id` aktif. Room disimpan di memori, sehingga restart
  menghapus semua kelas. Klien guru memulihkan kelasnya otomatis, tetapi tetap ada jeda.
  Restart **hanya** jika tidak ada kelas selain kelas uji `DEPLOY-1107-*` milik agent sendiri (lihat langkah 7),
  atau jika pemilik proyek menyetujuinya. Kelas yang ditinggalkan terhapus otomatis 24 jam setelah event terakhirnya;
  kelas tertutup terhapus 2 jam setelah ditutup (pembersihan berjalan tiap 30 menit).
- **Frontend baru dengan relay lama:** aman. Pengecekan `session.id` tidak aktif (tidak ada id), dan batas satu kali kirim
  tetap berlaku di sisi klien.
- **Tab lama dengan relay baru:** kirim kedua mendapat pesan error dari relay. Ini diharapkan; tidak ada data yang rusak.
- Pertahankan aset lama di `assets/` (jangan `rsync --delete`) agar tab yang masih terbuka tetap dapat memuat dependensinya.

## 4. Aturan untuk agent

- Ikuti `AGENTS.md` (INV-001–INV-008). Jika menemukan kontradiksi antara brief ini, kode, dan keadaan server: **berhenti dan
  laporkan**, jangan berimprovisasi.
- Hanya sentuh berkas OpenPacket. VPS yang sama menjalankan situs lain.
- Jangan ubah nginx, sertifikat, atau header HTTP.
- Jangan `git push` atau merge ke `main` tanpa persetujuan pemilik proyek.
- Jangan menjalankan rollback tanpa persetujuan, kecuali produksi jelas rusak (HTML/aset gagal dimuat atau relay mati) dan
  pemilik proyek tidak dapat dihubungi. Laporkan segera setelahnya.
- Jangan memakai kode kelas yang mungkin dipakai guru sungguhan untuk uji produksi. Gunakan awalan `DEPLOY-1107-`.

## 5. Langkah

Ikuti pola rilis `20261025T012131Z` (lihat `2026-10-25-openpacket.md`).

1. **Verifikasi lokal pada `a2baed9`** (working tree bersih kecuali `audit-output/` dan `Laporan OpenPacket Zuhri.md`):
   `npm ci` (jika perlu), `npm run type-check`, `npm test` (harapan: 480 lulus), `npm run build`,
   `node --check scripts/classroom-relay-core.mjs`, `npm run e2e -- --workers=1` (harapan: 24 lulus).
   Jika ada yang gagal, berhenti dan laporkan.
2. **Periksa keadaan server sebelum mengubah apa pun:**
   - HTML produksi masih rilis 25 Okt (`f55afc38…` di catatan sebelumnya) atau catat hash-nya bila berbeda.
   - Lokasi skrip relay yang dijalankan PM2: `pm2 describe openpacket-relay`. Bandingkan SHA-256 relay core di server
     dengan `ad43e90b…986c`. Jika berbeda, **berhenti dan laporkan** (ada perubahan di server yang tidak tercatat).
   - `curl -s https://openpacket.zuhri.my.id/api/classroom/health` → catat `activeRooms`.
   - Catat `uptime -s` serta uptime dan jumlah restart proses PM2 (PID relay berubah dari 194678 pada 25 Okt).
   - Cari backup rilis sebelumnya **dengan `sudo -n`** (bisa jadi hanya tidak terbaca tanpa root):
     `sudo -n ls -la /var/backups/ /var/backups/openpacket /var/lib/openpacket /var/lib/openpacket/releases`.
     Ini **hanya temuan untuk dilaporkan**, bukan syarat deploy. Backup lama tidak diperlukan karena langkah 5
     membuat backup baru dari keadaan produksi sekarang, yang sudah terverifikasi identik dengan rilis 25 Okt.
     Jangan memperbaiki atau membuat ulang backup lama.
3. **Kemas dan unggah:** `dist/` + `scripts/classroom-relay-core.mjs` dari `a2baed9`. Hitung SHA-256 arsip lokal, unggah,
   dan cocokkan di server sebelum ekstraksi.
4. **Release ID:** stempel waktu UTC `YYYYMMDDTHHMMSSZ`. Ekstrak ke `/var/lib/openpacket/releases/<ID>`.
5. **Backup (wajib, sebelum mengubah apa pun):** buat `/var/backups/openpacket/<ID>/` (`sudo -n mkdir -p`, mode 700).
   Salin seluruh web root (`webroot/`) dan relay core yang sedang dijalankan PM2 (`relay/classroom-relay-core.mjs`).
   Tulis `SHA256SUMS` untuk `index.html` dan relay core yang dibackup. Pastikan isi backup terbaca ulang dan hash-nya cocok.
   Tulis `rollback.sh` sendiri (tidak ada templat lama). Skrip harus:
   - `set -euo pipefail`;
   - mengembalikan `index.html` lama via salin ke berkas sementara lalu `mv` atomik; aset lama tidak perlu dipulihkan
     karena deploy tidak menghapusnya;
   - bila relay core sudah diganti: memulihkan berkas lama dari backup lalu `pm2 restart openpacket-relay`;
   - memeriksa hash `index.html` dan relay core terhadap `SHA256SUMS` serta health relay `ok`, dan keluar non-zero bila gagal.
   Periksa sintaksnya (`bash -n`), tetapi jangan dijalankan.
6. **Pasang frontend:** normalisasi izin (direktori 755, berkas 644, pemilik sama dengan web root yang ada). Salin aset baru
   terlebih dahulu, lalu ganti `index.html` dengan rename atomik.
   Fase A selesai di sini. Jalankan pemeriksaan produksi Fase A (bagian 6.1 dan 6.3).
7. **Fase B — pasang relay (hanya bila aman).** Periksa `/health` dua kali dengan jeda ±1 menit.
   Restart aman bila `activeRooms` = 0, **atau** `activeRooms` sama dengan jumlah kelas uji `DEPLOY-1107-*` yang dibuat
   agent sendiri dan semuanya berstatus `closed` (cek tiap kode lewat `GET /api/classroom/state?code=…`).
   - Aman: ganti relay core di lokasi PM2 dengan versi `a2baed9` (cocokkan SHA-256 `94b2f3fe…a478`), jalankan
     `pm2 restart openpacket-relay`, catat PID sebelum dan sesudah, pastikan health `ok`, lalu jalankan pemeriksaan 6.2.
   - Tidak aman: **jangan ganti berkas dan jangan restart**. Laporkan bahwa Fase A terpasang dan Fase B tertunda,
     beserta `activeRooms` terakhir. Fase B dijalankan kemudian sebagai sesi terpisah, mulai lagi dari langkah 7,
     setelah memeriksa ulang bahwa relay core di server masih `ad43e90b…986c`.

## 6. Pemeriksaan produksi

Simpan bukti (tangkapan layar/JSON) di `audit-output/2026-11-07/` dan rujuk dari catatan hasil.

1. **(Fase A) Artefak:** HTML publik = HTML origin = build lokal. Semua aset yang dirujuk HTML merespons 200. Health relay `ok`.
2. **(Fase B, setelah restart relay) Relay (curl, kelas sintetis).** Buat token uji acak dengan `openssl rand -hex 16`.
   Jangan tulis token ke catatan.
   - `POST /api/classroom/event` `CLASS_CREATED` untuk `DEPLOY-1107-A` dengan `session.id` sintetis dan satu soal `ex-a`.
   - `GET /api/classroom/state?code=DEPLOY-1107-A` (tanpa header) memuat `session.id` dan **tidak** memuat `hostToken`.
   - `PARTICIPANT_JOINED` (id dan token peserta sintetis), lalu `SUBMISSION_RECEIVED` untuk `ex-a` → 200.
   - Kirim kedua untuk peserta yang sama → **409**, dan skor pertama tetap.
   - Peserta kedua mengirim untuk `exerciseId` yang tidak aktif → **422**.
   - `CLASS_CLOSED` dengan token host → kelas berstatus `closed`.
   Bentuk event persis dapat dilihat di `tests/unit/classroomRelayHardening.test.ts` (fungsi `createClass`, `join`, `submit`).
3. **(Fase A; perilaku klien, berlaku juga dengan relay lama) Browser, dua konteks (guru dan siswa):**
   - Guru membuka kelas `DEPLOY-1107-B` dengan satu soal. Konteks guru kedua mencoba kode yang sama dari form Buat Kelas
     → error *"sedang dipakai kelas lain"* dan **tanpa** toast "Kelas dibuka".
   - Siswa bergabung. Klik **Kirim Jawaban** → dialog muncul. **Batal** → guru tidak menerima jawaban. Klik lagi →
     **Ya, Kirim Jawaban** → tombol menjadi **Jawaban Terkirim** (nonaktif). Tetap terkunci setelah ±3 detik dan setelah refresh.
     Guru melihat tepat satu jawaban.
   - Guru menyiarkan soal baru (ronde baru) → tombol siswa aktif kembali.
   - Tutup kelas `DEPLOY-1107-B`; siswa menerima pesan kelas ditutup.
4. Tidak ada page error JavaScript pada kedua konteks.
5. Skenario "kode kelas dipakai ulang setelah relay restart" **tidak** perlu diuji di produksi; sudah dicakup unit test
   integrasi (`classroomHubRelay.test.ts`).

## 7. Catatan hasil dan laporan

- Tulis `docs/deployments/2026-11-07-openpacket.md`: release ID, commit sumber `a2baed9`, lokasi release dan backup,
  hash (arsip, HTML sebelum/sesudah, relay core), PID PM2 sebelum/sesudah (atau alasan tidak direstart), hasil setiap
  pemeriksaan, perintah rollback, status Fase A/B, dan temuan backup rilis sebelumnya.
- Bila Fase B dijalankan pada sesi terpisah, tambahkan bagian "Fase B" ke berkas catatan yang sama.
- Commit catatan hasil ke `feat/audit-improvements` (tanpa push). `audit-output/` tetap tidak di-commit.
- Laporkan ke pemilik proyek: berhasil/gagal per langkah, apakah relay sudah direstart, temuan di luar rencana, dan
  perintah rollback.

## 8. Rollback

```bash
ssh vps 'sudo -n /var/backups/openpacket/<ID>/rollback.sh'
```

Rollback mengembalikan HTML dan (bila sudah diganti) relay core rilis `20261025T012131Z` dari backup yang dibuat pada
langkah 5. Relay lama tidak mengenal aturan 409/422, tetapi frontend baru tetap kompatibel dengannya. Bila hanya frontend
yang perlu dikembalikan, cukup pulihkan `index.html` lama (aset lama masih ada).

## 9. Riwayat brief

- Revisi 1 (7 Nov): percobaan pertama berhenti dengan benar sebelum mengubah produksi, karena backup
  `/var/backups/openpacket/20261025T012131Z` yang dirujuk sebagai templat `rollback.sh` tidak ditemukan dan `activeRooms` = 1.
  Brief diubah agar tidak bergantung pada backup lama, deploy dibagi Fase A/B, dan pencarian backup lama memakai `sudo -n`
  sebagai temuan saja.
