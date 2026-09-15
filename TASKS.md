# TASKS: Work Breakdown Structure & Implementation Roadmap

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-TASKS-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Technical Project Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-SRS-001, DOC-ARCH-001  
> **Supersedes:** None  

---

## 1. Roadmap & Sprint Overview

Pengembangan OpenPacket dipecah menjadi 7 sprint berurutan (alokasi total 10–12 minggu kerja dengan kapasitas 15–20 jam/minggu untuk solo developer):

```mermaid
gantt
    title Jadwal Pelaksanaan Proyek OpenPacket
    dateFormat  YYYY-MM-DD
    section Fondasi & Canvas
    Sprint 1: Setup & Design Tokens     :s1, 2026-09-08, 7d
    Sprint 2: React Flow Canvas & Link  :s2, after s1, 10d
    section Engine & Protokol
    Sprint 3: Headless Protocol Engine  :s3, after s2, 14d
    Sprint 4: Worker IPC & Animasi      :s4, after s3, 10d
    section Konfigurasi & Persistensi
    Sprint 5: Dual-Mode GUI & Mini CLI  :s5, after s4, 10d
    Sprint 6: Persistence & Tauri Build :s6, after s5, 10d
    section Evaluasi Skripsi
    Sprint 7: Uji Komparasi & UAT SUS   :s7, after s6, 14d
```

---

## 2. Sprint Task Breakdown

### Sprint 1: Project Setup, Tooling & Design Tokens
- **`TASK-P0-001` [Effort: S] Inisialisasi Vite Monorepo dengan React 19 & TypeScript**
  - *Dependencies:* None
  - *References:* `ARCHITECTURE.md` §5
  - *Definition of Done:* Project terinisialisasi dengan konfigurasi TypeScript ketat (`strict: true`), ESLint, Tailwind CSS v4, dan Vitest runner. Perintah `npm run dev` dan `npm run test` berjalan sukses.
- **`TASK-P0-002` [Effort: S] Inisialisasi Tauri v2 Desktop Wrapper**
  - *Dependencies:* `TASK-P0-001`
  - *References:* `ADR/ADR-001-TAURI-REACT-DESKTOP.md`
  - *Definition of Done:* `src-tauri` terkonfigurasi, window terbuka menampilkan halaman React, dan perintah `npm run tauri dev` berhasil memunculkan jendela native desktop di Windows.
- **`TASK-P0-003` [Effort: S] Implementasi Design Tokens & Layout Shell**
  - *Dependencies:* `TASK-P0-001`
  - *References:* `DSD.md` §2, §3
  - *Definition of Done:* Shell layout (Header Toolbar, Palette Sidebar, Main Workspace, Footer Status Bar) ter-render dengan palet Dark Mode sesuai spesifikasi `DSD.md`.

---

### Sprint 2: React Flow Canvas & Cable Management
- **`TASK-P0-004` [Effort: M] Integrasi `@xyflow/react` & Device Palette**
  - *Dependencies:* `TASK-P0-003`
  - *References:* `PRD/PRD-001-CANVAS-TOPOLOGY.md` §6, `FR-001`
  - *Definition of Done:* Pengguna dapat men-drag item Router, Switch, dan PC dari sidebar palet dan menjatuhkannya (*drop*) ke atas kanvas. Koordinat tersimpan di state.
- **`TASK-P0-005` [Effort: M] Implementasi Custom Node Components dengan Port Handles**
  - *Dependencies:* `TASK-P0-004`
  - *References:* `DSD.md` §4.1, `FR-001`
  - *Definition of Done:* Node Router (3 port), Switch (8 port), dan PC (1 port) ter-render dengan icon representatif, label nama, dan dot handle untuk setiap port fisik.
- **`TASK-P0-006` [Effort: M] Mekanisme Pengkabelan (Custom Edge & Port Binding)**
  - *Dependencies:* `TASK-P0-005`
  - *References:* `PRD/PRD-001-CANVAS-TOPOLOGY.md` §6.1, `FR-003`
  - *Definition of Done:* Menghubungkan dua port memunculkan modal mini pemilihan port kosong, membentuk sambungan kabel, dan mengunci port agar tidak dapat dihubungkan ke kabel lain (*1-to-1 binding*).

---

### Sprint 3: Headless Protocol Engine (L2 & L3)
- **`TASK-P0-007` [Effort: M] Model Data State Jaringan & Port Interfaces**
  - *Dependencies:* `TASK-P0-001`
  - *References:* `ARCHITECTURE.md` §6 (`INV-001`), `PRD-001` §10
  - *Definition of Done:* Interface TypeScript untuk `DevicePort`, `NetworkNodeData`, dan `EthernetFrame` didefinisikan secara murni di `src/engine/types.ts` tanpa ketergantungan DOM.
- **`TASK-P0-008` [Effort: L] Implementasi Switch CAM Learning & Flooding (Layer 2)**
  - *Dependencies:* `TASK-P0-007`
  - *References:* `PRD/PRD-002-SIMULATION-ENGINE.md` §7.1, `FR-008`
  - *Definition of Done:* Logika Switch mencatat source MAC ke CAM table, mem-flood frame unknown unicast/broadcast, dan meneruskan frame secara unicast jika MAC tujuan terdaftar. Seluruh test di `test_switch.ts` lulus.
- **`TASK-P0-009` [Effort: L] Implementasi Protokol ARP (RFC 826)**
  - *Dependencies:* `TASK-P0-007`
  - *References:* `PRD/PRD-002-SIMULATION-ENGINE.md` §7.2, `FR-009`
  - *Definition of Done:* Mesin ARP mampu memancarkan ARP Request broadcast saat cache miss, membalas ARP Reply unicast dari target IP, dan memperbarui ARP cache. Seluruh test di `test_arp.ts` lulus.
- **`TASK-P0-010` [Effort: L] Implementasi IPv4 Subnetting & ICMP Ping (RFC 791 & 792)**
  - *Dependencies:* `TASK-P0-008`, `TASK-P0-009`
  - *References:* `PRD/PRD-002-SIMULATION-ENGINE.md` §7.3, `FR-010`, `FR-011`
  - *Definition of Done:* Logika kalkulator subnetting menentukan gateway/hop lokal. Siklus ICMP Request Type 8 dan Reply Type 0 berhasil dengan dekrementasi TTL router. Seluruh test di `test_ipv4.ts` dan `test_icmp.ts` lulus.

---

### Sprint 4: Web Worker Integration & Packet Animation
- **`TASK-P0-011` [Effort: M] Setup Web Worker & IPC Typed Message Protocol**
  - *Dependencies:* `TASK-P0-010`
  - *References:* `ARCHITECTURE.md` §4.2, `PRD-002` §10
  - *Definition of Done:* Simulasi dipindahkan ke Web Worker terpisah. UI thread mengirimkan pesan `INIT_TOPOLOGY` dan `TRIGGER_PING` serta menerima event hop paket tanpa freeze UI.
- **`TASK-P0-012` [Effort: L] Animasi Aliran Paket pada Custom Edge SVG**
  - *Dependencies:* `TASK-P0-011`, `TASK-P0-006`
  - *References:* `DSD.md` §4.2, `FR-012`
  - *Definition of Done:* Partikel visual amplop (hijau untuk ARP, biru untuk ICMP) bergerak mulus di atas garis kabel React Flow dari node asal ke node tujuan sesuai durasi simulasi.
- **`TASK-P0-013` [Effort: S] Kontrol Simulasi (Play, Pause, Speed Slider, Step)**
  - *Dependencies:* `TASK-P0-012`
  - *References:* `PRD/PRD-002-SIMULATION-ENGINE.md` §2, `FR-013`
  - *Definition of Done:* Pengguna dapat mengatur kecepatan animasi (0.5x s.d. 3x), menjeda simulasi, dan memajukan langkah hop satu demi satu (*Step Mode*).

---

### Sprint 5: Dual-Mode Device Configuration (GUI & CLI)
- **`TASK-P0-014` [Effort: M] Modal Form Konfigurasi Visual (Fast Config)**
  - *Dependencies:* `TASK-P0-005`
  - *References:* `PRD/PRD-003-DEVICE-CONFIG-CLI.md` §9.1, `FR-005`
  - *Definition of Done:* Double-click perangkat membuka modal form untuk mengisi IP, Subnet Mask, Gateway, dan toggle Administrative Status (UP/DOWN) dengan validasi format IP real-time.
- **`TASK-P0-015` [Effort: L] Parser & Tokenizer Mini Cisco IOS CLI**
  - *Dependencies:* `TASK-P0-007`
  - *References:* `PRD/PRD-003-DEVICE-CONFIG-CLI.md` §6, `FR-006`, `FR-007`
  - *Definition of Done:* Parser FSM mendukung hirarki prompt `>`, `#`, `(config)#`, `(config-if)#` dan mengeksekusi perintah: `enable`, `conf t`, `interface`, `ip address`, `no shut`, `show ip int br`, `show ip route`, dan `ping`.
- **`TASK-P0-016` [Effort: M] Komponen Terminal Emulasi & Sinkronisasi Dua Arah**
  - *Dependencies:* `TASK-P0-014`, `TASK-P0-015`
  - *References:* `PRD/PRD-003-DEVICE-CONFIG-CLI.md` §7, `DSD.md` §4.3
  - *Definition of Done:* Antarmuka terminal CRT bergaya monospaced dengan riwayat panah atas/bawah. Perubahan nilai pada form GUI langsung memperbarui terminal dan sebaliknya (*Two-Way Sync*).

---

### Sprint 6: File Persistence & Multi-Platform Packaging
- **`TASK-P0-017` [Effort: M] Ekspor dan Impor File Topologi JSON**
  - *Dependencies:* `TASK-P0-006`, `TASK-P0-014`
  - *References:* `PRD/PRD-001-CANVAS-TOPOLOGY.md` §8 (AC-002), `FR-014`, `FR-015`
  - *Definition of Done:* Tombol Export mengunduh file `.json` berisi seluruh state node, kabel, dan konfigurasi IP. Tombol Import mampu memulihkan kanvas persis ke kondisi tersimpan.
- **`TASK-P0-018` [Effort: M] Integrasi File Dialog Native via Tauri v2 API**
  - *Dependencies:* `TASK-P0-017`, `TASK-P0-002`
  - *References:* `ADR/ADR-001-TAURI-REACT-DESKTOP.md` §5
  - *Definition of Done:* Pada versi desktop, tombol Save/Open memicu dialog native OS Windows (`tauri-plugin-dialog`) dan menulis langsung ke filesystem lokal.
- **`TASK-P0-019` [Effort: M] Setup GitHub Actions CI/CD Pipeline (Web & Windows Executable)**
  - *Dependencies:* `TASK-P0-018`
  - *References:* `ENVIRONMENT.md` §3
  - *Definition of Done:* Workflow GitHub Actions otomatis mendeploy web ke Vercel/GitHub Pages dan mengompilasi rilis `OpenPacket-Setup.exe` pada setiap tag rilis.

---

### Sprint 7: Evaluasi Skripsi (Benchmarking & UAT)
- **`TASK-P0-020` [Effort: L] Eksekusi Pengujian Komparasi vs Cisco Packet Tracer**
  - *Dependencies:* `TASK-P0-013`, `TASK-P0-016`
  - *References:* `TESTING.md` §4
  - *Definition of Done:* 3 skenario topologi standar diuji pada OpenPacket dan Packet Tracer; data paritas urutan paket dan MAC learning dicatat rapi untuk Bab 4 skripsi.
- **`TASK-P0-021` [Effort: M] Pelaksanaan Kuesioner UAT System Usability Scale (SUS)**
  - *Dependencies:* `TASK-P0-019`
  - *References:* `TESTING.md` §5
  - *Definition of Done:* Aplikasi diujikan ke 20–30 mahasiswa; hasil kuesioner 10 instrumen SUS direkapitulasi dan dihitung menghasilkan nilai rata-rata skor SUS.
- **`TASK-P0-022` [Effort: M] Penyusunan Naskah Bab 3 & 4 Skripsi / Seminar Proposal**
  - *Dependencies:* `TASK-P0-020`, `TASK-P0-021`
  - *References:* Seluruh dokumen blueprint
  - *Definition of Done:* Bab Metodologi Penelitian (arsitektur, model protokol RFC) dan Bab Hasil & Pembahasan (tabel komparasi & skor SUS) selesai disusun.

---

### Sprint 8: Classroom Sessions & Automated Exercise Evaluator (v1.6.0)
- **`TASK-P0-023` [Effort: L] Modul Domain & Realtime Hub Sesi Kelas (`src/features/classroom/`)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-013`
  - *Definition of Done:* Pembuatan sesi kelas tanpa akun (`ClassSession`), kode kelas unik, hub komunikasi antar-tab via `BroadcastChannel` browser (`openpacket_classroom_bus`) dengan fallback memory/storage, serta generator simulasi siswa.
- **`TASK-P0-024` [Effort: L] Automated Exercise Evaluator Berbasis Engine Simulasi**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-023`, `TASK-P0-007`
  - *Definition of Done:* Mesin penilaian deterministik mengevaluasi konfigurasi IP, sambungan kabel, kuota perangkat, VLAN access/trunk, serta pengujian reachability ICMP via `HeadlessSimulationEngine` (skor 0–100 dan umpan balik detail).
- **`TASK-P0-025` [Effort: M] Antarmuka Portal Kelas shadcn/ui (Mode Guru & Mode Siswa)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-023`, `TASK-P0-024`
  - *Definition of Done:* Komponen `ClassroomModal.tsx` dengan Base UI Lyra, kontrol guru (buka/kunci/tutup kelas, siarkan materi, live monitoring skor), dan antarmuka pengerjaan siswa (gabung, muat template, submit otomatis).
- **`TASK-P0-026` [Effort: M] Manajemen Soal Berbasis File JSON & Editor Interaktif Guru**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-024`, `TASK-P0-025`
  - *Definition of Done:* Parser & validator JSON toleran alias (`exerciseParser.ts`), modal editor visual soal praktikum guru (`ExerciseEditorModal.tsx`) untuk menyunting teks instruksi & kriteria target, impor/ekspor file `.json`, dan persistensi penyimpanan lokal.

---

### Sprint 9: Multi-Exercise Exam, Frozen Snapshot & Student HUD (v1.8.0)
- **`TASK-P0-027` [Effort: M] Frozen Immutable Exam Snapshot Engine (`src/features/classroom/classroomHub.ts`)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-023`
  - *Definition of Done:* Sesi kelas membekukan deep-clone snapshot (`session.activeExercises`) saat ujian dimulai atau disiarkan. Mutasi bank soal katalog oleh guru di tengah ujian tidak memutasi lembar kerja aktif siswa.
- **`TASK-P0-028` [Effort: M] Fleksibilitas Seleksi Multi-Soal di Panel Guru (`ClassroomModal.tsx`)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-025`, `TASK-P0-027`
  - *Definition of Done:* Checkbox seleksi per-soal, aksi "Pilih Semua", aksi "Hanya Ini" (uji tunggal instan), dan aksi "Siarkan Paket Ujian (N Soal)" dengan counter jumlah soal terpilih.
- **`TASK-P0-029` [Effort: L] Student Canvas HUD Multi-Exercise Switcher & Layout Alignment (`ClassroomStudentHUD.tsx`)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-027`, `TASK-P0-028`
  - *Definition of Done:* Segmented tab/pill switcher antar-soal pada floating Canvas HUD; checklist, checklist evaluation, dan muat starter topology dinamis per-soal; penyerahan semua jawaban dengan skor rata-rata; dan HUD otomatis bergeser ke kiri saat PDU Inspector Drawer aktif.
- **`TASK-P0-030` [Effort: S] Anti-Cheat Template Lock pada Palet Perangkat (`DevicePalette.tsx`)**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-023`
  - *Definition of Done:* Tab template topologi dinonaktifkan otomatis saat siswa tergabung dalam kelas aktif dengan pesan edukasi perakitan mandiri.
- **`TASK-P0-031` [Effort: S] Pembersihan UI Guru & Asynchronous Event Dispatch**
  - *Status:* Completed (2026-09-14)
  - *Dependencies:* `TASK-P0-025`
  - *Definition of Done:* Tombol dan generator simulasi bot dihapus dari antarmuka guru; sinkronisasi event bus lokal dideferensialkan menggunakan `queueMicrotask` guna mencegah benturan render React 19.

---

### Sprint 10: Role Gate Portal & Single-Role Exclusivity (v1.9.0)
- **`TASK-P0-032` [Effort: M] Single-Role Exclusivity & Storage Persistence (`src/features/classroom/classroomHub.ts`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-023`
  - *Definition of Done:* Penambahan getter/setter `lockedRole` dengan persistensi `sessionStorage`, reset otomatis partisipan siswa saat beralih ke peran Guru, dan pengosongan menyeluruh saat `clearAll()`.
- **`TASK-P0-033` [Effort: M] Role Gate Portal UI & Safe Role Switching (`ClassroomModal.tsx`, `Toolbar.tsx`, `ClassroomStudentHUD.tsx`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-032`, `TASK-P0-025`
  - *Definition of Done:* Menghilangkan tab switcher bebas di modal kelas; menyuguhkan menu gerbang 2 kartu besar (Guru vs Siswa); menampilkan badge peran aktif di header modal dan toolbar; serta aksi "Ganti Peran" aman dengan dialog konfirmasi.

---

### Sprint 11: Multi-Device Responsive UI/UX Overhaul (v2.0.0)
- **`TASK-P0-034` [Effort: L] Responsive Layout Architecture & Mobile Sheet Menu (`Toolbar.tsx`, `DevicePalette.tsx`, `EventLogPanel.tsx`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-004`, `TASK-P0-013`
  - *Definition of Done:* Header toolbar ramping anti-wrap di mobile dengan laci menu samping (`Sheet`) dan bar ping lipat; palet alat adaptif sebagai overlay drawer di HP dengan floating trigger button; serta penyembunyian MiniMap dan auto-collapse Event Log di mobile.
- **`TASK-P0-035` [Effort: M] Modal & Floating Overlay Boundary Normalization (`ClassroomStudentHUD.tsx`, `PduInspectorDrawer.tsx`, Modals)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-029`, `TASK-P0-014`
  - *Definition of Done:* Normalisasi lebar floating HUD dan PDU Drawer (`w-[calc(100vw-1rem)]`), HUD mobile auto-minimized, serta adaptasi seluruh dialog modal (`DeviceConfig`, `CLI Terminal`, `Lab`, `Classroom`, `Documentation`) bebas horizontal overflow.

---

### Sprint 12: Realtime Multi-Device Relay & Multi-Exercise Dynamic Flow (v2.1.0)
- **`TASK-P0-036` [Effort: L] Multi-Device Realtime Relay Server & Client Sync (`vite.config.ts`, `classroomHub.ts`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-027`, `TASK-P0-032`
  - *Definition of Done:* Middleware in-memory relay pada `/api/classroom/event` dan `/api/classroom/state` untuk sinkronisasi antar perangkat fisik (Laptop, Tablet, HP); klien melakukan broadcast HTTP dan background polling berkala (`syncWithServer`); menyelesaikan isu "0 murid" saat diakses dari perangkat berbeda.
- **`TASK-P0-037` [Effort: M] Zero-Exercise Start & Non-Destructive Class Update (`exerciseParser.ts`, `ClassroomModal.tsx`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-036`
  - *Definition of Done:* Bank soal default kosong saat pertama kali masuk; guru dapat membuka kelas dengan 0 soal; tombol "Perbarui Soal Kelas" untuk menyiarkan soal baru tanpa menghapus lembar kerja atau skor pengerjaan siswa yang sudah ada.
- **`TASK-P0-038` [Effort: M] Student Autonomous Multi-Exercise Navigation (`ClassroomStudentHUD.tsx`)**
  - *Status:* Completed (2026-09-15)
  - *Dependencies:* `TASK-P0-029`, `TASK-P0-037`
  - *Definition of Done:* Siswa bebas memilih soal yang ingin dikerjakan melalui pill interaktif dan navigasi Previous/Next; status menunggu soal saat kelas dimulai tanpa soal.





