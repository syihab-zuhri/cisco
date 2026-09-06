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

## [2026-09-07] — Version 1.4.2 (Hotfix: Step Mode "Next" Tidak Berfungsi)

### Fixed
- **Klik Next di Step Mode tidak memutar event apa-apa** (dilaporkan pengguna): gerbang step di worker memakai `while (stepMode)` yang **re-arm sendiri** — stepMode tetap true setelah satu sinyal next, sehingga waiter baru langsung mengantre lagi dan event tidak pernah dilepas. Gerbang diganti tunggu-sekali-per-event (`if`) dan diekstrak ke modul teruji `src/engine/gates.ts` (pause gate ikut direfaktor ke sana).
- **5 unit test gerbang baru** (`tests/unit/gates.test.ts`) mengunci kontrak: satu next = tepat satu event; next() berlebih tidak bocor; menonaktifkan step melepas semua waiter; pause/resume semantics.
- **E2E baru**: aktifkan Step → Send Ping → klik Next → counter timeline "1/N event diputar" → Next lagi → "2/N".

### Status Gate
- `Gate C` — 80 unit test + 9 E2E hijau.

---

## [2026-09-06] — Version 1.4.1 (Katalog Template Tergrup + Topologi Klasik)

### Added
- **16 template dalam 5 grup berurutan** (kecil → enterprise) di tab Template: 1·Dasar (Klasik), 2·LAN & Kantor, 3·Nirkabel & Internet, 4·Routing & WAN, 5·Enterprise/Perusahaan — masing-masing dengan jumlah & keterangan.
- **4 template topologi klasik baru**: **Topologi Bus** (backbone bersama dimodelkan Hub, 4 PC), **Topologi Ring (Cincin)** (4 switch melingkar + 4 PC), **Topologi Daisy Chain** (3 switch seri tanpa loop + 3 PC), dan **Topologi Hybrid (Campuran)** (LAN Star + segmen Bus disatukan router — ping lintas subnet membuktikannya).
- Template lama disesuaikan namanya agar sesuai nomenklatur klasik: Peer-to-Peer → **Topologi Peer-to-Peer (Point-to-Point)**, Single LAN Star → **Topologi Star (Bintang)**, Hierarchical Campus → **Topologi Tree (Pohon / Hierarkis)**, Redundant Mesh → **Topologi Mesh (Jala)**.
- Template klasik dipisah ke modul `topologyTemplatesClassic.ts` agar berkas utama tetap ringan.

### Changed
- Palet tab Template kini merender **tergrup per kategori** dengan header + jumlah; kategori lanjutan (VLAN, RIP, WAN, nirkabel, internet) menjadi varian "sampai advanced" dari daftar topologi klasik.

### Status Gate
- `Gate C` — 75 unit test + 8 E2E hijau; uji integritas template dinaikkan ke ≥ 16.

---

---

## [2026-09-06] — Version 1.4.0 (Anotasi Kanvas: Square & Teks Custom)

### Added
- **Square anotasi di belakang perangkat** (`zIndex -1`): tombol baru di palet (bagian Anotasi) → muncul di tengah viewport → digeser bebas, **di-resize lewat handle kanan-bawah**, dan **warna isi/border dipilih dari 6 preset swatch** saat kotak dipilih. Untuk mengelompokkan/menandai area topologi.
- **Teks custom kanvas**: tombol **Teks** → dobel-klik untuk mengedit isi, kontrol **ukuran font (10-32px)** lewat tombol -/+ saat dipilih; dirender di atas perangkat agar selalu terbaca.
- **Anotasi ikut tersimpan & dimuat** di file JSON topologi (save/load otomatis karena berupa node React Flow).
- Perangkat & anotasi terpisah bersih: node anotasi **tidak pernah dikirim ke simulation engine** (filter `nodeKind` di semua jalur ping/DHCP/RIP) dan tidak masuk daftar sumber ping.
- Interaksi konsisten: anotasi memakai spawn tengah-viewport + kaskade yang sama dengan perangkat; terkunci saat Mode Lab.

### Status Gate
- `Gate C` — 75 unit test + 7 E2E hijau.

---

## [2026-09-06] — Version 1.3.0 (Hasil Audit UI/UX: Aksesibilitas & Polish)

### Added
- **Batch 1 (`8247068`):** hook `useModalA11y` (Escape + focus trap + scrim-click + restore fokus) untuk 4 modal dengan `role="dialog"`/`aria-modal`; `ToastHost` menggantikan `alert()` native dan menampilkan error koneksi kabel/asosiasi WiFi; `ConfirmDialog` untuk Reset Topologi & hapus perangkat; toolbar node hover/focus-only; spawn perangkat anti-tumpuk; tema gelap Controls & MiniMap React Flow; `lang="id"`.
- **Batch 2 (`06a12e3`):** fitView otomatis via `topologyVersion` setiap loadTopology; tab Tabel difilter per tipe perangkat (CAM=switch, ARP=ber-IP, Routing+NAT=router, hub diberi penjelasan L1); teks 9–10px → 11px; checkbox 16px; `prefers-reduced-motion` (CSS + gate confetti); toolbar responsif (wrap + ikon-only <1024px); favicon branded; CLI riwayat ArrowUp/Down; aria-label seluruh tombol ikon; label form terhubung `htmlFor`/`id` + `role="alert"`.

### Changed
- **Keputusan versi:** versi aplikasi diseragamkan ke **1.3.0** (package.json, tauri.conf.json, banner CLI, docs). Versi dengan sufiks non-numerik ("1.3.0-alpha") **ditolak bundler MSI Tauri** ("pre-release identifier must be numeric-only"), sehingga sufiks prerelease tidak digunakan pada versi app; label fase tetap terdokumentasi pada judul entri CHANGELOG ini.

---

## [2026-09-06] — Version 1.3.0-alpha (Mode Lab Praktikum + Perbaikan CI Desktop)

Pilar D (P1 blueprint) yang ditunda dari v1.2.0, kini terealisasi.

### Added
- **Mode Lab Praktikum** (`src/data/labs.ts` + `LabModal`): 3 skenario berpandu dengan **topologi terkunci** (tambah/hapus perangkat & kabel diblok, template ditolak) dan **verifikasi objektif otomatis** — checklist tercentang sendiri (monoton) dari evaluator murni `evaluateLab` saat ping/konfigurasi terdeteksi; konfetti saat semua objektif tercapai; petunjuk berjenjang per lab:
  1. *Perbaiki Gateway yang Salah* (contoh langsung blueprint PLANNING §5.2),
  2. *Nyalakan Internet dengan NAT* (aktifkan NAT → ping 8.8.8.8 → tabel translasi),
  3. *Hubungkan Dua VLAN* (lengkapi sub-interface router-on-a-stick).
- Tombol **Lab** di Toolbar (badge "Lab Aktif" saat berjalan); palet perangkat dinonaktifkan visual saat topologi terkunci.
- Pesan log per objektif tercapai; kanvas bebas kembali setelah keluar lab.

### Fixed
- **CI job Desktop (Tauri build) gagal di semua push sebelumnya**: `[lib] openpacket_lib` di `Cargo.toml` tanpa `src/lib.rs` membuat `cargo metadata` error ("can't find library") — bagian `[lib]` dihapus (aplikasi desktop-only, target binary tunggal).
- PDU Inspector kini menampilkan segmen **DHCP** (message type, yiaddr, server ID); hitungan template di dokumentasi dikoreksi (12); timeline auto-scroll mengikuti event yang diputar.

### Status Gate
- `Gate C` — 70 unit test + 6 E2E hijau. Tersisa manual: benchmark paritas Packet Tracer v8.2 (Sprint 7) & UAT SUS.

---

## [2026-09-06] — Version 1.2.0 (Fase 3: VLAN 802.1Q, Router-on-a-Stick, RIPv2)

Pilar C dari rencana v1.2.0 — rilis final.

### Added
- **VLAN 802.1Q**: port switch dapat dikonfigurasi `access`/`trunk` + VLAN ID (1–4094) di form konfigurasi. `findL2Path` & cakupan broadcast hanya melewati port se-VLAN; trunk membawa semua VLAN — segmentasi broadcast domain benar-benar berpengaruh pada konektivitas.
- **Inter-VLAN routing (router-on-a-stick)**: port router dapat memiliki **sub-interface VLAN** (IP per VLAN); connected-network matching mencakup sub-interface, PDU di trunk hop menampilkan catatan "802.1Q: frame ter-tag di trunk".
- **RIPv2 sederhana**: router dapat mengaktifkan RIP + tombol **"Jalankan Konvergensi RIP"**. Algoritma distance-vector deterministik (connected metric 1, learned = metric pengirim + 1, split-horizon sederhana, maks 8 ronde) menghasilkan event `RIP_UPDATE` beranimasi di timeline; rute RIP tercatat (kolom metric/sumber) dan tersinkron ke Table Viewer. Pesan IPC `START_RIP`/`RIP_RESULT`.
- **2 template baru** (total 12): "Kantor 2 VLAN (Router-on-a-Stick)" dan "Dual Router + RIPv2".
- Test baru: segmentasi VLAN (diblok/tanpa router), inter-VLAN via router (TTL 127), konvergensi RIP + ping lintas site sesudahnya (TTL 126). Total **66 unit test + 5 E2E**, coverage engine **94,2% lines**.

### Status Gate
- `Gate C` — v1.2.0 lengkap (3 pilar); benchmark paritas Packet Tracer (Sprint 7) & Mode Lab Praktikum (P1, v1.3) belum dieksekusi.

---

## [2026-09-06] — Version 1.2.0-beta (Fase 2: DHCP DORA + NAT/PAT)

Pilar B dari rencana v1.2.0.

### Added
- **DHCP (P1 blueprint — router sebagai server)**: pool per-interface di form konfigurasi router (network/mask/start IP/max client) dan toggle **"Obtain IP via DHCP"** di form klien. Aliran **DORA penuh beranimasi** di timeline (Discover → Offer → Request → Ack, UDP 67/68 pada PDU), alokasi deterministik melewati IP terpakai, lease diterapkan live via effect `DHCP_LEASE` (IP/mask/gateway klien terisi otomatis).
- **NAT/PAT**: checkbox NAT per interface router WAN. Saat ping menuju IP publik lewat interface NAT, src IP di-rewrite ke IP WAN pada PDU (note edukatif), **tabel translasi** terisi (effect `NAT_TRANSLATE`), dan jalur balik menampilkan pembalikan dst ke IP host internal. Tabel NAT tampil di Table Viewer.
- Pesan IPC baru `START_DHCP`/`DHCP_RESULT`; warna paket DHCP (amber) pada kabel & asosiasi nirkabel.

### Status Gate
- `Gate C` — 63 unit test + 5 E2E hijau; Fase 3 (VLAN + RIPv2) menyusul.

---

## [2026-09-06] — Version 1.2.0-alpha (Fase 1: Mesin Event, Simulation Mode, PDU Inspector, Table Viewer)

Pilar A dari rencana v1.2.0 (disetujui pemilik project). Fase 2 (DHCP + NAT) dan Fase 3 (VLAN + RIPv2) menyusul.

### Added
- **Arsitektur "plan-then-playback"** (`src/engine/simulationEngine.ts` + `eventQueue.ts` baru): seluruh aliran ping direncanakan lebih dulu menjadi daftar `SimEvent` deterministik (seq + sim clock +1ms/hop, antrean dibatasi 500 event sesuai blueprint), lalu diputar worker dengan pacing/pause. `executePing` dipertahankan sebagai jalur kompatibel — seluruh 53 test lama lulus tanpa perubahan.
- **Simulation Mode**: tombol **Step** di Toolbar + **Next** per event (mewujudkan TASK-P0-013 "Step" & DSD §5 "advances 1 hop"); pesan IPC baru `ENABLE_STEP_MODE`/`SIM_STEP_NEXT`/`SIM_PLAN`/`EVENT_PLAYED` (INV-002).
- **Timeline event** di panel bawah (tab **Simulasi**): event mendatang tampil redup sebelum diputar, klik event membuka inspector.
- **PDU Inspector Drawer**: header berlapis **L2 Ethernet Frame → L3 IPv4 Packet → L4 ARP/ICMP** per hop (`src/types/protocol.ts`), dengan **MAC frame ditulis-ulang per hop** dan TTL menurun di router — mode auto-follow mengikuti paket berjalan.
- **Table Viewer** (tab **Tabel**): CAM/ARP/Routing perangkat terpilih secara live, diperbarui oleh `effects` (CAM_LEARN/ARP_LEARN) yang ditempel pada event.

### Status Gate
- `Gate C` — 59 unit test + 5 E2E hijau; coverage engine 93,8% lines.

---

## [2026-09-06] — Version 1.1.0 (Jaringan Nirkabel & Cloud Internet)

### Added
- **Jaringan nirkabel**: perangkat baru **Access Point** (port `radio0` ber-SSID + uplink kabel) dan **adapter WiFi `wla0`** di PC/Laptop. Asosiasi otomatis saat SSID klien = SSID AP (via form konfigurasi) atau drag-to-connect tervalidasi SSID. AP menjembatani WiFi ↔ kabel sebagai bridge L2 dengan CAM learning. Edge nirkabel baru `wirelessLink` (garis putus-putus ungu ber-SSID) dengan animasi paket penuh.
- **Cloud Internet tersimulasi**: perangkat **Cloud** "memiliki" IP publik `8.8.8.8` & `1.1.1.1`. Ping ke IP publik dijawab cloud secara deterministik (TTL = 128 − jumlah router − 1 hop WAN; RTT = router + 1 ms). Router diarahkan ke cloud lewat **default route `0.0.0.0/0`** — tanpa route, ping publik gagal "No route" (perilaku router nyata). 100% offline (INV-008 terjaga).
- **Editor Static Route di form konfigurasi router** — aksi `addStaticRoute`/`removeStaticRoute` yang sebelumnya tanpa UI kini dapat dipakai, termasuk untuk default route.
- **2 template baru (kategori "Nirkabel")**: "WiFi Hotspot Rumah + Internet" (cloud—router—AP—laptop WiFi + PC kabel, ping 8.8.8.8 langsung jalan) dan "Kantor Nirkabel" (router—switch—AP—laptop WiFi + server). Total 10 template.
- Test baru: AP bridge + CAM lintas WiFi/kabel, ping cloud (sukses/tanpa route/IP tak dikenal), asosiasi WiFi store (SSID cocok/tolak/1-ke-N/disconnect klien-saja/sync), integritas template wireless-aware, dan E2E "template hotspot → ping 8.8.8.8 dari laptop". Total **53 unit test + 5 E2E**.

### Decisions (disetujui pemilik project lewat rencana v1.1.0)
1. **INV-003 (amandemen)**: port ethernet tetap 1-kabel-1-port; **port radio bersifat 1-ke-N** — hanya sisi klien yang menyimpan binding, radio AP tidak. `disconnectEdge` pada asosiasi hanya menurunkan sisi klien (radio AP tetap menyala).
2. **Internet = cloud tersimulasi**, bukan request jaringan nyata — menjaga INV-008 (graceful offline) & NFR-004 (nol request eksternal). Server web/DNS tersimulasi & Wireless Router rumahan = kandidat iterasi berikutnya; radius sinyal & DHCP (P1) ditunda.
3. Migrasi otomatis: topologi lama yang di-load mendapat port `wla0` pada PC/Laptop yang belum memilikinya.

### Status Gate
- `Gate C` — implementasi P0 berjalan; type-check & unit test hijau (53 test, 5 E2E); benchmark paritas Packet Tracer (Sprint 7) belum dieksekusi.

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
