# ADR-001: Pemilihan Tauri v2 + React untuk Arsitektur Multi-Platform (Web & Desktop)

- **Status:** Accepted  
- **Date:** 2026-09-05  
- **Owners:** Software Architect & Lead Developer  
- **Decision Class:** Type-1 (Keputusan Arsitektur Fundamental)  
- **Related Requirements:** `FR-016`, `NFR-003`, `NFR-004`, `NFR-005`  

---

## 1. Context & Problem Statement
Sistem OpenPacket membutuhkan strategi distribusi ganda:
1. Versi Web yang dapat diakses secara instan oleh dosen dan mahasiswa via peramban tanpa instalasi apa pun.
2. Versi Desktop yang dapat diunduh (*downloadable executable*) untuk penggunaan offline di komputer laboratorium tanpa koneksi internet.

Sebagai proyek skripsi dengan pengembang tunggal (*solo developer*), mengembangkan dua basis kode terpisah (misal: C#/WPF untuk desktop dan React untuk web) akan melipatgandakan waktu pengerjaan, risiko desinkronisasi logika simulasi, dan kompleksitas pengujian. Diperlukan arsitektur *Single Codebase* yang dapat dikompilasi menjadi aplikasi web statis sekaligus binary desktop native berkinerja tinggi.

---

## 2. Decision Drivers
- **Ukuran Bundel Installer (Footprint):** Installer desktop harus ringan (target < 20 MB) agar mudah dibagikan antarmahasiswa via flashdisk atau kuota terbatas.
- **Konsumsi Memori RAM:** Aplikasi harus hemat RAM saat dijalankan di laptop berspesifikasi rendah di laboratorium kampus.
- **Single Source of Truth:** Logika simulasi protokol jaringan (TypeScript) harus 100% dipakai bersama antara web dan desktop tanpa modifikasi.
- **Akses Native File System:** Desktop harus mendukung dialog native OS untuk operasi simpan dan buka file topologi JSON.

---

## 3. Considered Options

### Opsi A: React 19 + Vite + Tauri v2 (Rust Wrapper)
Menggunakan web stack standar (React/TypeScript) yang dibungkus dengan Tauri v2. Tauri menggunakan sistem Webview bawaan OS (WebView2 di Windows) dan backend Rust berukuran mikro.

### Opsi B: React 19 + Vite + Electron
Menggunakan bundel Chromium dan runtime Node.js lengkap yang dikemas bersama kode web.

### Opsi C: Progressive Web App (PWA) Saja
Murni aplikasi web dengan Service Worker dan Web App Manifest tanpa wrapper binary native.

---

## 4. Tech Selection Matrix

| Kriteria Evaluasi | Bobot | Opsi A: Tauri v2 | Opsi B: Electron | Opsi C: PWA Saja |
|---|---|---|---|---|
| **Ukuran Installer Binary** | 25% | **5** (~12–15 MB) | **2** (~120–180 MB) | **4** (0 MB, tapi bukan standalone exe) |
| **Konsumsi Memori RAM** | 25% | **5** (~30–50 MB) | **2** (~180–300 MB) | **4** (~60 MB di tab browser) |
| **Kemudahan Integrasi Native OS** | 20% | **5** (Rust IPC cepat & aman) | **5** (Node.js API lengkap) | **2** (Sandbox web browser terbatas) |
| **Kesesuaian Nilai Tambah Skripsi**| 15% | **5** (Teknologi modern, kebaruan tinggi) | **3** (Konvensional) | **3** (Kurang berkesan "aplikasi desktop") |
| **Kecepatan Build Pipeline** | 15% | **4** (Cross-compile via GitHub Actions) | **4** (Ekosistem mature) | **5** (Instan static build) |
| **Total Skor Terbobot** | 100% | **4.85** | **3.05** | **3.55** |

---

## 5. Decision
Memilih **Opsi A: React 19 + Vite + Tauri v2**.
- Frontend web dibangun murni menggunakan React 19, TypeScript, dan Vite.
- Untuk versi web: Hasil build `dist/` dideploy langsung ke Vercel atau GitHub Pages.
- Untuk versi desktop: Direktori `src-tauri/` membungkus hasil build `dist/` yang sama, menghasilkan file instalasi Windows `OpenPacket-Setup.exe` dan versi portabel.

---

## 6. Consequences

### Dampak Positif
- **Efisiensi Ekstrem:** Ukuran installer Windows berkurang drastis dari ~150 MB (jika memakai Electron) menjadi ~15 MB, dan konsumsi RAM laptop penguji saat demonstrasi sidang hanya ~40 MB.
- **Logika Bersama 100%:** Mesin simulasi protokol, parser CLI, dan canvas React Flow identik persis antara web dan desktop.
- **Kemudahan Persistensi:** Pada desktop, penyimpanan file menggunakan dialog native Windows (`SaveFileDialog`), sedangkan pada web menggunakan blob browser download.

### Dampak Negatif & Trade-off
- Memerlukan instalasi *Rust toolchain* pada lingkungan pengembangan lokal untuk mengompilasi binary desktop (dapat dimitigasi dengan memanfaatkan GitHub Actions CI/CD untuk otomatisasi build).
- Pada Windows versi lama (Windows 7/8), pengguna harus memiliki Microsoft Edge WebView2 runtime (di Windows 10 dan 11 sudah terpasang secara bawaan).

---

## 7. Risks & Mitigations
- **Risiko:** Ketergantungan pada runtime WebView2 Windows.
- **Mitigasi:** Konfigurasi `tauri.conf.json` diset untuk menggunakan opsi *embed bootstrapper* yang secara otomatis mengunduh WebView2 jika belum ada di OS target.

---

## 8. Revisit Triggers
Keputusan ini akan dievaluasi ulang hanya jika:
1. Target pengguna di masa depan mewajibkan dukungan sistem operasi lawas yang tidak memiliki WebView2.
2. Terdapat kebutuhan akses raw socket Layer 2 hardware fisik yang memerlukan driver kernel NDIS/WinPcap (yang saat ini berstatus *Out of Scope*).

---

## 9. References
- Dokumentasi Resmi Tauri v2: https://v2.tauri.app
- Spesifikasi Microsoft Edge WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
