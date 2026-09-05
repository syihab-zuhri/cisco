# AGENTS: Handoff Instructions, Global Invariants & Context Packs

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-AGENTS-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Project Planning Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** All Blueprint Documents  
> **Supersedes:** None  

---

## 1. Tujuan Dokumen & Aturan Kolaborasi AI/Developer

Dokumen ini adalah instruksi operasional resmi (*Handoff Protocol*) untuk seluruh AI coding agent (Claude Code, Cursor, GitHub Copilot, Gemini CLI) dan software engineer spesialis yang akan mengeksekusi implementasi kode OpenPacket.

> [!CAUTION]
> **Aturan Eskalasi Konflik:** Jika Anda menemukan kontradiksi antara kode yang sudah ada dengan isi dokumen perencanaan, atau antara dua file perencanaan: **BERHENTI SEGERA**. Laporkan kontradiksi secara spesifik kepada pengguna dan minta arahan. **DILARANG BERIMPROVISASI ATAU MEMBUAT KEPUTUSAN ARSITEKTUR DIAM-DIAM**.

---

## 2. Global Technical Invariants (`INV-001` – `INV-008`)

Seluruh agen tanpa terkecuali terikat pada 8 hukum teknis non-negotiable berikut:

- `INV-001` **Zero DOM in Engine:** Seluruh file di `src/engine/` adalah murni TypeScript murni. Tidak boleh mengimpor React, CSS, mengakses DOM, atau objek `window`/`document`.
- `INV-002` **Typed Message IPC:** Komunikasi UI Thread dengan Web Worker wajib menggunakan tagged union interface bertipe ketat di `src/types/ipc.ts`. Dilarang mengirimkan objek ad-hoc tanpa kontrak tipe data.
- `INV-003` **Port Singularity:** Satu port fisik perangkat hanya dapat memiliki relasi ke tepat satu kabel (*Strict 1-to-1 connection*).
- `INV-004` **Deterministic Protocol Parity:** Simulasi ICMP Ping dan ARP harus menghasilkan urutan paket yang deterministik dan konsisten dengan RFC 826 dan RFC 792.
- `INV-005` **Clean-Room Implementation:** Dilarang menyalin atau mengekstrak binary/source code proprietary milik Cisco Systems. Semua kode ditulis dari nol berdasarkan standar publik RFC.
- `INV-006` **Single State of Config Truth:** State IP Address perangkat yang diubah melalui GUI wajib langsung terbaca oleh terminal CLI, dan sebaliknya (*Bi-directional Synchronization*).
- `INV-007` **No Hardcoded Secrets:** Tidak ada token API, password, atau credential yang ditulis ke file kode, log, atau repositori.
- `INV-008` **100% Offline Capability:** Tidak boleh ada fitur P0 yang mewajibkan request HTTP ke server internet eksternal saat simulasi dijalankan.

---

## 3. Document Reading Order Per Role

| Peran Agen | Dokumen Wajib Dibaca | Dokumen Sekunder | Dokumen yang Boleh Dilewati |
|---|---|---|---|
| **Frontend/Canvas Agent** | `AGENTS.md`, `PRD-001`, `DSD.md`, `ARCHITECTURE.md` | `SRS.md`, `ADR-002` | `PRD-002`, `TESTING.md` |
| **Engine/Protocol Agent** | `AGENTS.md`, `PRD-002`, `ARCHITECTURE.md`, `TESTING.md` | `SRS.md` | `DSD.md`, `ADR-001`, `PRD-001` |
| **CLI & Config Agent** | `AGENTS.md`, `PRD-003`, `DSD.md` | `ARCHITECTURE.md` | `ADR-001`, `ADR-002` |
| **Desktop/DevOps Agent** | `AGENTS.md`, `ENVIRONMENT.md`, `ADR-001`, `ARCHITECTURE.md` | `PLANNING.md` | `PRD-002`, `PRD-003`, `DSD.md` |
| **QA / Testing Agent** | `AGENTS.md`, `TESTING.md`, `SRS.md`, `TRACEABILITY.md` | Seluruh PRD | `DSD.md`, `ENVIRONMENT.md` |

---

## 4. Context Packs Per Agent Role

### 4.1 Context Pack: Frontend & Canvas Agent
- **Tanggung Jawab:** Mengembangkan komponen React Flow kanvas (`@xyflow/react`), palet perangkat, custom handles port, dan custom edge SVG.
- **File Boleh Diubah:** `src/components/canvas/*`, `src/components/palette/*`, `src/components/toolbar/*`, `src/store/topologySlice.ts`.
- **File Dilarang Diubah:** `src/engine/*`, `src-tauri/*`.
- **Larangan Khusus:** Dilarang menempatkan logika kalkulasi rute atau subnetting di dalam komponen React.
- **Definition of Done:** Pengguna dapat men-drag node, menghubungkan kabel antar-port kosong, dan melihat garis kabel terupdate saat node digeser.

### 4.2 Context Pack: Simulation & Protocol Engine Agent
- **Tanggung Jawab:** Mengembangkan discrete-event simulator, L2 Switch CAM table learning, RFC 826 ARP state machine, RFC 791 IPv4 subnetting, dan RFC 792 ICMP Echo di Web Worker.
- **File Boleh Diubah:** `src/engine/*`, `src/types/protocol.ts`, `src/types/ipc.ts`, `tests/unit/*`.
- **File Dilarang Diubah:** `src/components/*`, `src-tauri/*`.
- **Larangan Khusus:** Pelanggaran terhadap `INV-001` (dilarang ada impor React/DOM di engine).
- **Definition of Done:** Seluruh unit test protokol di Vitest lulus dengan coverage > 90%, dan pesan IPC dipancarkan ke UI thread dengan benar.

### 4.3 Context Pack: Device Config & CLI Terminal Agent
- **Tanggung Jawab:** Mengembangkan modal konfigurasi dual-mode (form visual + terminal Cisco IOS emulasi).
- **File Boleh Diubah:** `src/components/modal/*`, `src/components/terminal/*`, `src/engine/cli/*`.
- **File Dilarang Diubah:** `src-tauri/*`, `src/engine/layers/*`.
- **Larangan Khusus:** Menambah perintah di luar 10 perintah P0 tanpa persetujuan arsitek.
- **Definition of Done:** Perintah `enable`, `conf t`, `int fa0/0`, `ip address`, `no shut`, `show ip int br`, dan `ping` dapat dieksekusi dengan feedback yang tepat dan tersinkronisasi dua arah dengan GUI.

### 4.4 Context Pack: Desktop & DevOps Agent
- **Tanggung Jawab:** Mengonfigurasi bundel Tauri v2 (`src-tauri/`), native file dialogs, dan GitHub Actions CI/CD workflows.
- **File Boleh Diubah:** `src-tauri/*`, `.github/workflows/*`, `package.json`.
- **Definition of Done:** `npm run tauri build` menghasilkan installer Windows `.exe` mandiri berukuran < 20 MB yang dapat dijalankan secara offline.

---

## 5. Pemetaan Tool Instructions

File panduan ini menjadi sumber tunggal kebenaran (*single source of truth*). Pengembang dapat mengarahkan tool instruksi AI spesifik ke dokumen ini:

| Tool IDE / Agent | File Pointer | Petunjuk Konfigurasi |
|---|---|---|
| **Claude Code** | `CLAUDE.md` | Buat pointer satu baris: `@file:DOC-AGENTS-001 AGENTS.md` |
| **Cursor** | `.cursor/rules` | Buat rule: `Ikuti seluruh aturan dan invariants di AGENTS.md` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Tautkan referensi ke `AGENTS.md` |
| **Gemini CLI** | `GEMINI.md` | Tautkan referensi ke `AGENTS.md` |
