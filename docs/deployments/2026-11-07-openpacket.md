# OpenPacket deployment — 7 November 2026

- Situs: https://openpacket.zuhri.my.id/.
- Release: `20261107T073714Z`.
- Source commit: `a2baed9` pada branch `feat/audit-improvements`.
- Commit brief yang digunakan: `6fd208b`.
- Status: **Fase A terpasang; Fase B tertunda.**
- Web root: `/www/wwwroot/openpacket.zuhri.my.id`.
- Release tersimpan: `/var/lib/openpacket/releases/20261107T073714Z`.
- Backup sebelum perubahan: `/var/backups/openpacket/20261107T073714Z`.
- Backup rilis lama: `/var/backups/openpacket` tidak ditemukan. Pencarian `sudo -n ls -la /var/backups/ /var/backups/openpacket /var/lib/openpacket /var/lib/openpacket/releases` keluar 2 karena path backup OpenPacket tidak ada; release lama tetap ada di `/var/lib/openpacket/releases/`.

## Verifikasi lokal

Working tree bersih untuk perubahan non-dokumentasi terhadap `a2baed9` (`git diff --stat a2baed9 HEAD -- . ':!docs'` kosong), sehingga bukti verifikasi percobaan pertama digunakan sesuai brief. Bukti tersimpan di `../../audit-output/2026-11-07/`:

- Type-check: lulus.
- Unit test: **480/480**, 35 berkas.
- Build produksi: lulus.
- `node --check scripts/classroom-relay-core.mjs`: lulus.
- E2E: **24/24** lulus.
- SHA-256 relay core sumber: `94b2f3fe556a9d2443825f4bbd7276f0841af132cee4cbed3e6edbfaa9cfa478`.
- SHA-256 entry relay sumber yang tidak berubah: `be4a74c09f60a4254f4f4eec92e3dbefffa6eb0bbd6e5cbe72f5bf2b53aceb30`.

## Keadaan produksi sebelum perubahan

- HTML live sama dengan rilis 25 Oktober: SHA-256 `f55afc38295ae3689188dedc0c75e7e1141948a94153dd93ece5045d4660474d`.
- Relay core live cocok dengan hash yang diharapkan dari rilis 25 Oktober: `ad43e90b11577cfca54bc08e1735bb30085e8a220bc74c698042c055c551986c`.
- PM2 `openpacket-relay`: status `online`, PID **321**, restart count **0**. Uptime host sejak `2026-10-27 01:33:10`.
- Health sebelum perubahan: `ok`, `activeRooms: 1`.
- Backup lama di `/var/backups/openpacket` tidak ditemukan; dilaporkan sebagai temuan, bukan penghalang, sesuai revisi brief.

## Deployment

Arsip `dist/` dan `scripts/classroom-relay-core.mjs` dibuat serta diunggah ke release. SHA-256 arsip lokal dan server cocok: `848b32abbe1564e0cddb6429d4f69fd0780a51c5fa085064d9e63c2226bb9862`. Isi arsip diekstrak ke release terisolasi dan hash artefak staged diverifikasi.

Sebelum perubahan dibuat backup baru, termasuk seluruh web root dan relay core, di `/var/backups/openpacket/20261107T073714Z/`. `SHA256SUMS` dibuat, dibaca ulang dan lolos `sha256sum -c`. Skrip rollback dibuat sendiri, dipasang di backup dan lolos `bash -n`; skrip tidak dijalankan.

### Fase A — frontend

**Terpasang.** Aset baru disalin tanpa menghapus aset lama; `index.html` diganti secara atomik. Tidak ada perubahan pada entry relay, relay core, PM2, nginx, sertifikat, atau header HTTP.

- SHA-256 HTML build lokal / origin / publik sesudah deploy: `60af587997ddd7a6dc25fbb6f365fab9c7f540b77fa115d1f5fa98249290e042`.
- Dua belas aset yang dirujuk HTML publik merespons HTTP 200.
- Health relay setelah Fase A: `ok`.
- SHA-256 relay core tetap `ad43e90b11577cfca54bc08e1735bb30085e8a220bc74c698042c055c551986c`.

### Pemeriksaan browser produksi

Aplikasi terbuka di tiga konteks browser (guru, siswa, guru kedua) tanpa JavaScript/page/console error yang tertangkap. Guru membuat kelas sintetis `DEPLOY-1107-B` dan `DEPLOY-1107-C`. Guru kedua mencoba kode `DEPLOY-1107-C` yang sedang aktif dan mendapat pesan penolakan “sedang dipakai kelas lain”; tidak ada toast sukses dan form tetap terbuka.

**Verifikasi alur guru-siswa belum lulus.** Siswa masuk ke `DEPLOY-1107-C`, tetapi lembar soal tidak muncul dan UI menyatakan “Menunggu Soal dari Guru”. Dialog konfirmasi kirim dan tombol “Jawaban Terkirim” teramati, termasuk terkunci setelah refresh, namun pemeriksaan state dilakukan melalui akses anonim yang tidak menampilkan data privat guru. Karena itu hasil Batal/tidak ada submission, tepat satu submission diterima, ronda baru membuka kembali pengiriman, dan penutupan kelas tidak dapat diverifikasi. Dua kelas uji buatan agent, `DEPLOY-1107-B` dan `DEPLOY-1107-C`, masih berstatus `open` dan belum ditutup. Bukti tidak menyimpan token host.

Bukti produksi dan hasil yang teramati ada di `../../audit-output/2026-11-07/`. Fase B tidak dijalankan: health terakhir `ok`, `activeRooms: 3`, dan kedua room uji masih `open`; PM2 tidak direstart.

## Fase B — relay

**Tertunda, tidak ada file relay yang diganti dan tidak ada restart.** Setelah uji Fase A, health menunjukkan `activeRooms: 3`; kode sintetis `DEPLOY-1107-B` dan `DEPLOY-1107-C` berstatus `open`, ditambah satu room yang sudah terhitung sebelum uji. Syarat langkah 7 tidak terpenuhi karena kelas uji belum tertutup dan ada satu room pra-uji yang tidak dapat dipastikan aman untuk dihentikan.

PID sebelum/sesudah: **321 / 321**. Health terakhir yang tercatat: `ok`, `activeRooms: 3`. Relay core live tetap hash rilis 25 Oktober. Tidak ada restart karena berpotensi memutus room yang bukan milik agent.

## Hash artefak

| Artefak | SHA-256 |
|---|---|
| Arsip release | `848b32abbe1564e0cddb6429d4f69fd0780a51c5fa085064d9e63c2226bb9862` |
| HTML sebelum deploy | `f55afc38295ae3689188dedc0c75e7e1141948a94153dd93ece5045d4660474d` |
| HTML build / origin / publik sesudah Fase A | `60af587997ddd7a6dc25fbb6f365fab9c7f540b77fa115d1f5fa98249290e042` |
| Relay core live (belum diganti) | `ad43e90b11577cfca54bc08e1735bb30085e8a220bc74c698042c055c551986c` |
| Relay core target Fase B | `94b2f3fe556a9d2443825f4bbd7276f0841af132cee4cbed3e6edbfaa9cfa478` |

## Rollback

```bash
ssh vps 'sudo -n /var/backups/openpacket/20261107T073714Z/rollback.sh'
```

Rollback mengembalikan `index.html` dari backup lewat rename atomik. Karena relay core belum diganti, rollback tidak akan me-restart PM2. Sintaks skrip diperiksa, rollback tidak dijalankan.

## Adendum — verifikasi kompatibilitas Fase A (lokal, setelah deploy)

Ditambahkan setelah laporan agent untuk menutup butir yang belum terverifikasi di produksi. Produksi saat ini menjalankan
**frontend `a2baed9` dengan relay core rilis 25 Oktober**.

- Relay core rilis 25 Oktober direkonstruksi dari `a2baed9` (perubahan relay 7 November dibalik). SHA-256 hasilnya
  `ad43e90b…986c`, **identik** dengan relay yang berjalan di produksi.
- E2E `report-fixes.spec.ts` + `audit-followup.spec.ts` dengan dev server baru (port 5199) yang memuat relay lama tersebut:
  **15/15 lulus**. Cakupannya: siswa bergabung dan melihat soal, konfirmasi dua langkah, tepat satu jawaban tercatat di sisi
  guru (dibaca dengan token host), tombol tetap terkunci setelah polling, penolakan kode kustom, serta alasan kelas
  ditutup/dikeluarkan.
- Unit test integrasi hub "Kirim Jawaban hanya satu kali per ronde" dengan relay lama: 4/5 lulus (kiriman kedua diabaikan,
  ronde baru membuka kembali, kiriman gagal jaringan, kiriman masih di perjalanan). Satu-satunya yang gagal adalah penolakan
  422 untuk soal yang sudah diganti, fitur relay Fase B yang memang belum terpasang.
- "Menunggu Soal dari Guru" pada uji produksi tidak terulang secara lokal. Penyebab yang paling mungkin: bank soal guru
  kosong secara default, sehingga kelas yang dibuat lewat form tanpa memilih soal berjalan dengan 0 soal sampai guru
  menyiarkannya. Ini belum dibuktikan.
- Kelas uji `DEPLOY-1107-B`/`-C` tidak dapat ditutup karena token host tidak disimpan. Keduanya terhapus otomatis oleh relay
  24 jam setelah event terakhirnya (pembersihan tiap 30 menit), atau saat relay direstart pada Fase B.
