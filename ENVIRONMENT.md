# ENVIRONMENT: Development Setup & Deployment Pipeline

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-ENV-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** DevOps Lead & Software Architect  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-ARCH-001  
> **Supersedes:** None  

---

## 1. Zero-Secret Architecture Policy

> [!NOTE]
> **Kebijakan Nol Kredensial:** OpenPacket adalah aplikasi simulator jaringan komputer lokal (*client-side only*). Sistem ini **TIDAK** membutuhkan file `.env`, tidak memerlukan token API rahasia pihak ketiga, tidak memerlukan koneksi basis data cloud berbayar, dan tidak menyimpan credential pengguna apa pun. Seluruh kode aman dipublikasikan secara terbuka di repository GitHub publik tanpa risiko kebocoran rahasia.

---

## 2. Prasyarat Sistem (*System Prerequisites*)

### 2.1 Pengembangan Versi Web (Wajib)
- **Node.js:** Versi 20.x LTS atau 22.x LTS (Unduh via https://nodejs.org)
- **Package Manager:** npm v10+ (bawaan Node.js)
- **Peramban Web Modern:** Google Chrome 120+, Microsoft Edge 120+, Firefox 120+, atau Safari 17+
- **Version Control:** Git 2.40+

### 2.2 Kompilasi Binary Desktop Native Tauri (Khusus Build `.exe`)
- **Sistem Operasi:** Windows 10/11 64-bit
- **Microsoft C++ Build Tools:** Termasuk Windows 10/11 SDK (dapat dipasang via Visual Studio Installer)
- **Rust Toolchain:** Versi stabil terbaru (Pasang via `rustup` dari https://rustup.rs)
- **Microsoft Edge WebView2 Runtime:** Terpasang secara bawaan di Windows 10 & 11

---

## 3. Panduan Instalasi & Eksekusi Lokal

### Langkah 1: Clone Repository & Pasang Dependensi
```bash
git clone https://github.com/username/openpacket.git
cd openpacket
npm install
```

### Langkah 2: Menjalankan Server Pengembangan Web (HMR)
```bash
npm run dev
```
Aplikasi web akan dapat diakses secara lokal melalui peramban pada alamat:  
`http://localhost:5173`

### Langkah 3: Menjalankan Versi Desktop Lokal (Tauri Dev Mode)
```bash
npm run tauri dev
```
Perintah ini akan mengompilasi backend Rust mikro, membuka jendela native desktop, dan menghubungkannya dengan server Vite React secara otomatis.

---

## 4. Pengujian & Verifikasi Kualitas Kode

```bash
# Menjalankan seluruh pengujian unit protokol jaringan (Vitest)
npm run test

# Menjalankan pengujian dalam mode interaktif (Watch mode)
npm run test:watch

# Memeriksa validitas tipe data TypeScript secara ketat
npm run type-check

# Memeriksa standard formatting dan linting kode
npm run lint
```

---

## 5. Kompilasi Produksi (*Production Build*)

### 5.1 Build Versi Web Statis
```bash
npm run build
```
- Menghasilkan direktori bundle statis di `./dist`.
- File dalam folder ini siap dideploy ke layanan hosting statis gratis mana pun (Vercel, Cloudflare Pages, GitHub Pages, Netlify).

### 5.2 Build Versi Desktop Windows Executable (`.exe`)
```bash
npm run tauri build
```
- Menghasilkan file installer Windows mandiri:  
  `./src-tauri/target/release/bundle/nsis/OpenPacket_1.0.0_x64-setup.exe`
- Serta file portable executable (tanpa instalasi):  
  `./src-tauri/target/release/openpacket.exe`

---

## 6. GitHub Actions CI/CD Pipeline

### 6.1 Workflow 1: Otomatisasi Deploy Web (`.github/workflows/web-deploy.yml`)
Dipicu pada setiap commit ke branch `main`:
1. Checkout repository.
2. Setup Node.js 20.x & `npm ci`.
3. Jalankan `npm run test` dan `npm run type-check`.
4. Jalankan `npm run build`.
5. Deploy artefak `./dist` secara otomatis ke GitHub Pages / Vercel.

### 6.2 Workflow 2: Otomatisasi Rilis Desktop Multi-OS (`.github/workflows/tauri-release.yml`)
Dipicu saat tag versi git dibuat (misal: `git tag v1.0.0`):
1. Menjalankan runner Windows `windows-latest`.
2. Menyiapkan Rust toolchain dan dependensi Tauri.
3. Mengompilasi `OpenPacket_1.0.0_x64-setup.exe`.
4. Mengunggah binary secara otomatis ke halaman **GitHub Releases** sehingga siap diunduh oleh publik dan dosen penguji.
