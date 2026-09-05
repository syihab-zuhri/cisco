# CHANGELOG: Documentation Change Log — OpenPacket

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-CHANGELOG-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Project Planning Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** All Documents  
> **Supersedes:** None  

---

## [2026-09-05] — Version 1.0.1 (Perbaikan Inti Engine, CLI & Kontrak Tipe)

### Fixed
- **Routing L3 engine (`src/engine/simulationEngine.ts`)**: ping lintas subnet kini benar-benar diteruskan router ke subnet tujuan (sebelumnya berhenti di gateway sehingga ping "sukses" keliru). Router melakukan longest-prefix match atas connected network + static route, decrement TTL per router (drop "Time Exceeded" saat TTL habis), dan mendeteksi routing loop.
- **Kontrak IPC (`INV-002`)**: `SIMULATION_STEP` didaftarkan resmi di `src/types/ipc.ts` sebagai pesan internal engine→worker; pesan mati `STEP_ANIMATION_COMPLETE` dihapus (pacing animasi memakai delay worker, bukan handshake).
- **Reverse path ARP Reply / ICMP Reply**: arah hop balik kini benar (endpoint ditukar), memperbaiki CAM learning port dan arah animasi paket.
- **Type-check**: ~40 error TypeScript diselesaikan (constraint `Record<string, unknown>` pada `Node<T>` @xyflow/react v12, unused imports, implicit `any`, `vite-env.d.ts` baru untuk import CSS). `npm run type-check` kini 0 error.
- **CLI (`src/engine/cli/cliEngine.ts`)**: parser dipindah dari komponen React ke engine murni (INV-001), `ping` dan `show ip route` kini benar-benar berfungsi, dan `ip address` divalidasi (`isValidIp`/`isValidSubnetMask`) sebelum menyimpan.
- **Sinkronisasi `deviceCounters`** saat load topologi/template — device baru tidak lagi berpotensi bernama duplikat.

### Added
- **Multi-echo ping**: echo pertama dianimasikan penuh; echo berikutnya deterministik via cache (warm-cache tanpa ARP ulang).
- **Format output ping ganda**: `windows` (dari PC, 4 echo) dan `ios` (dari terminal, 5 echo) sesuai konteks — resolusi kontradiksi SRS FR-007 vs PRD-002 AC-SIM-001 (lihat Decisions).
- **Kontrol kecepatan simulasi** kini berfungsi: `SET_SIMULATION_SPEED` mengubah delay per hop worker (800ms ÷ speed).
- **Unit test**: 18 test (dari 2) mencakup routing L3 via router + TTL, warm cache ARP, no-route, tanpa gateway, subnetting (`ipUtils`), dan state machine CLI.

### Decisions (resolusi kontradiksi blueprint, disetujui pemilik project)
1. **Format output ping mengikuti perilaku Packet Tracer**: dari PC/Toolbar memakai format Windows (`Reply from ...: bytes=32 time<1ms TTL=128` — memenuhi AC-SIM-001 PRD-002); dari terminal IOS memakai format Cisco (`!!!!! Success rate is 100 percent (5/5)` — memenuhi FR-007 SRS).
2. **10 perintah CLI P0 kanonik**: `enable`, `configure terminal`, `hostname`, `interface`, `ip address`, `no shutdown`, `shutdown`, `show ip interface brief`, `show ip route`, `ping`; `exit`/`end` sebagai navigasi mode; `show mac-address-table` & `show arp` dipertahankan sebagai ekstensi yang sudah ada.
3. **Pacing animasi memakai delay worker** (800ms ÷ speed), bukan handshake `STEP_ANIMATION_COMPLETE` — deteksi selesai animasi SVG `animateMotion` deklaratif memerlukan timer yang setara dengan delay itu sendiri. Pesan handshake dihapus dari kontrak IPC.

### Status Gate
- `Gate C` — implementasi P0 berjalan; type-check & unit test hijau; benchmark paritas Packet Tracer (Sprint 7) belum dieksekusi.

---

## [2026-09-06] — Version 1.0.4 (Hotfix: Status Port Setelah Hapus Perangkat)

### Fixed
- **`deleteNode` memakai snapshot state basi**: menghapus salah satu dari dua perangkat yang terkabel membuat port perangkat **tersisa** tetap tampil `up` (reset Link DOWN oleh `disconnectEdge` tertimpa data lama). Kini node dihapus dari state terkini via updater Zustand. Dilaporkan pengguna saat uji coba 2 laptop; ditutup dengan 3 test regresi (`tests/unit/useAppStore.test.ts`). Log penghapusan kini menampilkan label perangkat, bukan ID teknis.

### Status Gate
- `Gate C` — implementasi P0 berjalan; type-check & unit test hijau (43 test); benchmark paritas Packet Tracer (Sprint 7) belum dieksekusi.

---

## [2026-09-06] — Version 1.0.3 (Komponen Baru & Perluasan Template)

### Added
- **3 tipe perangkat baru**: `laptop` dan `server` (end device, perilaku host sama dengan PC) serta `hub` (repeater murni 8 port — tidak pernah belajar CAM table, untuk demo collision domain). Palet kini menampilkan 6 jenis perangkat dengan ikon & warna masing-masing.
- **2 template topologi baru**: "Kantor Kecil: Server + Laptop + PC" (LAN satu subnet 3 host) dan "Lab Hub (Repeater Murni)" (3 PC via hub, pembanding switch). Total 8 template.
- **Uji integritas template** (`tests/unit/topologyTemplates.test.ts`): setiap edge harus merujuk node/port yang ada, port UP, binding `connectedEdgeId` konsisten dua arah, id unik, dan kategori valid.

### Fixed
- **Template "Dual Router Point-to-Point (WAN Link)"**: ditambahkan static route dua arah (192.168.20.0/24 via 10.0.0.2 dan sebaliknya) — sebelumnya ping antar-site pasti gagal "No route" karena kedua router tidak punya rute ke LAN site lawan. Deskripsi template mesh disesuaikan (engine memakai jalur terpendek BFS, bukan STP).
- Ping dari Toolbar kini bisa dipancarkan dari semua host ber-IP (PC, Laptop, Server, router) — sebelumnya hanya PC.

### Status Gate
- `Gate C` — implementasi P0 berjalan; type-check & unit test hijau (40 test); benchmark paritas Packet Tracer (Sprint 7) belum dieksekusi.

---

## [2026-09-05] — Version 1.0.2 (Infrastruktur QA: Pause/Resume, Paritas, E2E, CI, Ikon)

### Added
- **Pause/Resume simulasi**: pesan IPC `PAUSE_SIMULATION`/`RESUME_SIMULATION`, gerbang `pauseGate` di worker sebelum tiap hop, tombol Pause/Resume di Toolbar (status store `paused`).
- **Test paritas packet-order** (`tests/unit/parity.test.ts`): mirror baris otomatis matriks TESTING.md §4 — urutan cold-start ARP→ICMP, warm-cache tanpa ARP, CAM learning, bad-gateway unreachable, TTL decrement (TEST-ARP/IP/L2/ICMP-*).
- **Coverage**: `npm run test:coverage` (@vitest/coverage-v8). `src/engine/` kini **96,7% lines / 94,6% stmts** — target TESTING.md (>90%) tercapai. Total 35 unit test.
- **E2E Playwright** (`e2e/app.spec.ts` + `playwright.config.ts`): 4 skenario happy path (tambah perangkat, template + ping beranimasi, modal konfigurasi GUI, terminal CLI + ping IOS) dengan asersi zero console-error. Memakai channel `msedge` karena CDN Playwright tidak terjangkau di jaringan lokal.
- **Ikon Tauri lengkap** (`src-tauri/icons/`): ico/icns/png + logo Windows Store, digenerasi `tauri icon` dari `src-tauri/icon-source.png` (script `scripts/generate-icon.mjs`, tanpa dependensi). `npm run tauri build` tidak lagi gagal karena ikon hilang.
- **CI workflow** (`.github/workflows/ci.yml`): job `web` (type-check → coverage → build → E2E) dan job `desktop` (Tauri build Windows + Rust stable).
- Script npm baru: `test:coverage`, `tauri`, `e2e`.

### Notes
- Benchmark komparasi manual vs Packet Tracer v8.2 (Sprint 7) tetap penugasan manusia; sisi simulator sudah terkunci oleh test paritas otomatis.
- E2E butuh Microsoft Edge (standar di Windows 10/11) atau jalankan `npx playwright install chromium` bila jaringan mengizinkan.

### Status Gate
- `Gate C` — implementasi P0 berjalan; type-check & unit test hijau; benchmark paritas Packet Tracer (Sprint 7) belum dieksekusi.

---

## [2026-09-05] — Version 1.0.0 (Initial Blueprint Package)

### Added
- **`PROJECT_MANIFEST.md`**: Inisialisasi registry dokumen proyek, pelacakan batch plan, dan tata kelola artefak.
- **`PLANNING.md`**: Definisi visi produk, problem statement skripsi, North Star metric (akurasi protokol RFC), target persona, milestone M1–M5, dan kriteria sukses MVP.
- **`SRS.md`**: Spesifikasi lengkap 16 Functional Requirements (`FR-001` s.d. `FR-016`), 7 Non-Functional Requirements, dan Business Rules.
- **`PRD/_INDEX.md`**: Registry fitur PRD dan aturan domain bersama.
- **`PRD/PRD-001-CANVAS-TOPOLOGY.md`**: Kebutuhan detail workspace kanvas React Flow, palet perangkat, port binding kabel, dan serialisasi file JSON.
- **`PRD/PRD-002-SIMULATION-ENGINE.md`**: Kebutuhan detail discrete-event simulation engine (Switch MAC learning, RFC 826 ARP, RFC 791 IPv4, RFC 792 ICMP) dan protokol IPC Web Worker.
- **`PRD/PRD-003-DEVICE-CONFIG-CLI.md`**: Kebutuhan detail antarmuka konfigurasi dual-mode (Modal GUI Form & Mini Cisco IOS Terminal CLI).
- **`ARCHITECTURE.md`**: Arsitektur C4 Level 1 & 2, struktur direktori monorepo, 8 Global Technical Invariants (`INV-001` s.d. `INV-008`), dan kebijakan complexity budget.
- **`ADR/ADR-001-TAURI-REACT-DESKTOP.md`**: Keputusan Type-1 arsitektur desktop: memilih Tauri v2 + React 19 berbasis Tech Selection Matrix.
- **`ADR/ADR-002-REACT-FLOW-CANVAS.md`**: Keputusan Type-1 library kanvas: memilih `@xyflow/react` berbasis Tech Selection Matrix.
- **`DSD.md`**: Design tokens, palet Dark Mode, komponen custom node/edge, styling terminal CRT, dan pemenuhan WCAG 2.2 AA.
- **`TESTING.md`**: Strategi pengujian unit protokol jaringan di Vitest, matriks pengujian komparasi vs Cisco Packet Tracer v8.2, dan instrumen kuesioner UAT System Usability Scale (SUS) untuk Bab 3 & 4 skripsi.
- **`TASKS.md`**: Work Breakdown Structure (WBS) terinci ke dalam 7 sprint pengembangan dan 22 task berprioritas P0.
- **`ENVIRONMENT.md`**: Prasyarat instalasi lokal, instruksi build web statis, kompilasi binary Windows `.exe`, deklarasi Zero-Secret Policy, dan pipeline GitHub Actions.
- **`AGENTS.md`**: Handoff instructions standar industri, panduan eksekusi per peran agen (Context Packs), aturan eskalasi konflik, dan pemetaan tool instructions.
- **`TRACEABILITY.md`**: Matriks penelusuran kebutuhan lengkap dengan pencapaian 100% P0 coverage.

### Status Gate
- Transisi status: `Gate A (Discovery)` → `Gate B (Ready for Blueprint)` → `Gate C (Blueprint Generated, Awaiting Review)`.
