# OpenPacket deployment — 24 Oktober 2026

- Release: `20261024T151549Z`.
- Situs: https://openpacket.zuhri.my.id/
- Target: VPS melalui alias SSH `vps` (akun `zuhri`).
- Web root: `/www/wwwroot/openpacket.zuhri.my.id`.
- Staging build: `/var/lib/openpacket/releases/20261024T151549Z`.
- Backup: `/var/backups/openpacket/20261024T151549Z`.
- Source base: `ffa9a59`, beserta perubahan lokal perbaikan laporan Zuhri; belum dibuat commit baru.
- Versi produk tetap `2.3.0`; release ditelusuri melalui ID dan hash artefak di bawah.

## Perubahan yang dirilis

Diagnostik ADMIN DOWN, konfirmasi penggantian template, peringatan IP duplikat pada segmen L2 yang sama, connected route bersama untuk CLI/panel TABEL, alasan akhir sesi siswa, dan penjelasan cakupan rubrik penilaian.

## Cara deployment

Build `dist/` dikemas, diunggah melalui SSH, dan diverifikasi checksum-nya sebelum ekstraksi. Seluruh web root lama serta konfigurasi Nginx situs disalin ke direktori backup. Aset baru disalin terlebih dahulu, kemudian `index.html` diganti dengan rename atomik. Aset lama dipertahankan agar tab yang masih memakai versi sebelumnya tetap dapat memuat dependensinya.

Relay Classroom berjalan sebagai proses PM2 `openpacket-relay`, memakai port loopback `127.0.0.1:5174`. Kedua skrip relay di server identik dengan kode lokal; tidak ada restart relay. PID tetap `141650` sebelum dan sesudah deployment. Konfigurasi Nginx, header HTTP, dan sertifikat tidak diubah.

## Hash artefak

| Artefak | SHA-256 |
|---|---|
| Arsip build | `189f58002f9e312ab7b1258457cd68268481ddee4d6bb02d957c7a8a09f21103` |
| HTML sebelum deployment | `c9682490eb2ec816ef410089490d243f770df17341d2804db194a55f16b25ec8` |
| HTML sesudah deployment | `91e23fe7cd88428dc149173284a4e171891af2d52f33d8169658cfb578f297e9` |

HTML yang diambil dari URL publik memiliki hash yang sama dengan hasil build lokal dan HTML pada origin.

## Verifikasi

- Sebelum deployment: 455 unit test/32 berkas dan 15 E2E lulus; TypeScript dan build produksi lulus.
- Staging: seluruh aset yang dirujuk HTML tersedia; checksum arsip dan HTML cocok.
- URL publik dan origin: respons sukses; HTML publik sesuai release baru.
- Endpoint publik `/api/classroom`: `status: ok`; relay tetap online.
- Browser produksi: dialog penggantian template muncul; Batal mempertahankan satu perangkat; konfirmasi memuat template dua PC.
- Browser produksi: ping PC-1 ke `192.168.1.20` berhasil 4/4; penyimpanan IP duplikat memunculkan peringatan konflik.
- Tidak ada error JavaScript atau respons aset gagal yang tercatat selama pemeriksaan browser produksi.

## Rollback

Jalankan dari workstation yang memiliki alias SSH yang sama:

```bash
ssh vps 'sudo -n /var/backups/openpacket/20261024T151549Z/rollback.sh'
```

Skrip mengembalikan file statis sebelumnya dan mengganti HTML secara atomik, mempertahankan direktori relay serta aset tambahan. Setelah itu skrip memeriksa checksum HTML lama dan health endpoint. Sintaks skrip dan checksum salinan backup sudah diverifikasi; rollback tidak dijalankan karena deployment berhasil.

Metadata deployment juga disimpan pada `/var/backups/openpacket/20261024T151549Z/deployment.json` di VPS.
