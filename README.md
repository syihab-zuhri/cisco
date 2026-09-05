# OpenPacket (cisco-pocket-op)

Simulator jaringan komputer edukatif yang ringan, 100% offline, dan gratis — alternatif Cisco Packet Tracer. Dibangun dengan React 19 + TypeScript + `@xyflow/react` (kanvas topologi), engine simulasi ARP/ICMP deterministik di Web Worker, dan dibungkus Tauri v2 untuk desktop Windows.

## Fitur

- **Kanvas topologi drag-and-drop** (PC, Switch 8 port, Router 3 port) dengan kabel 1-port-1-kabel dan indikator link up/down
- **Simulasi protokol deterministik**: RFC 826 (ARP), RFC 791 (IPv4 subnetting & routing), RFC 792 (ICMP Echo) di Web Worker
- **Animasi paket** (amplop PDU meluncur di kabel, ARP vs ICMP berbeda warna) dengan kontrol kecepatan 0.5x/1x/2x + Pause/Resume
- **Konfigurasi dual-mode**: form GUI dan terminal Cisco IOS mini (10 perintah P0: `enable`, `configure terminal`, `hostname`, `interface`, `ip address`, `no shutdown`, `shutdown`, `show ip interface brief`, `show ip route`, `ping`) — tersinkronisasi dua arah
- **Template topologi siap pakai** (P2P, LAN switch, dual-LAN via router, dll.)
- **Save/Load topologi** JSON + Event Log panel untuk inspeksi PDU

## Menjalankan Secara Lokal

Prasyarat: **Node.js 20/22 LTS** dan npm.

```bash
npm install
npm run dev          # buka http://localhost:5173
```

Untuk build produksi web:

```bash
npm run build        # output di dist/
npm run preview
```

Untuk aplikasi desktop Windows (butuh Rust toolchain):

```bash
npm run tauri build  # installer/portable .exe di src-tauri/target/release/bundle/
```

## Verifikasi & Pengujian

```bash
npm run type-check   # tsc strict, harus 0 error
npm test             # unit test Vitest (engine, CLI, ipUtils, paritas)
npm run test:coverage # unit test + coverage (target engine > 90%)
npm run e2e          # E2E Playwright (butuh Microsoft Edge / chromium)
```

## Arsitektur Singkat

```
src/
├── engine/          # Headless simulation engine (murni TS, tanpa DOM — INV-001)
│   ├── simulationEngine.ts   # ARP, ICMP, routing L3, CAM table
│   ├── cli/cliEngine.ts      # State machine terminal Cisco IOS
│   └── worker.ts             # Web Worker: pacing animasi + jembatan IPC
├── components/      # Kanvas (React Flow), palet, toolbar, modal, terminal
├── store/           # Zustand — single source of truth (INV-006)
├── types/           # Kontrak IPC tagged-union (INV-002) & tipe jaringan
└── hooks/           # Bridge UI <-> Worker (singleton)
```

Aturan teknis non-negotiable (`INV-001`–`INV-008`) terdokumentasi di [AGENTS.md](AGENTS.md); blueprint lengkap ada di [PLANNING.md](PLANNING.md), [ARCHITECTURE.md](ARCHITECTURE.md), folder [PRD/](PRD/) dan [ADR/](ADR/). Riwayat perubahan: [CHANGELOG.md](CHANGELOG.md).

## Lisensi

ISC
