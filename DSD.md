# DSD: Design System & User Experience Specifications

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-DSD-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Lead UI/UX Designer & Frontend Architect  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-PRD-INDEX-001, DOC-ARCH-001  
> **Supersedes:** None  

---

## 1. Visual Principles
1. **Engineered Precision**: Antarmuka bersih, fungsional, dan bernuansa alat laboratorium modern (*technical workstation aesthetics*).
2. **High-Contrast Signal Clarity**: Status jaringan, konektivitas kabel, dan pergerakan paket data harus langsung terbaca secara visual melalui warna sinyal yang distingtif (hijau, biru, kuning, merah).
3. **Familiarity for Networking Students**: Elemen diagram, simbol perangkat, dan terminal dirancang familiar bagi pengguna yang pernah melihat Cisco Packet Tracer, namun dengan sentuhan modern UI (Dark Mode bawaan, rounded corners, dan tipografi tajam).

---

## 2. Design Tokens & Color Palette

### 2.1 Theme Palette (Sleek Dark Mode Primary)
Aplikasi menggunakan Dark Mode sebagai tema default untuk kenyamanan mata saat praktikum jangka panjang di ruangan lab.

```css
:root {
  /* Surface & Backgrounds */
  --bg-app: #0B0F19;           /* Kanvas luar & latar aplikasi */
  --bg-surface: #111827;       /* Panel toolbar, sidebar palet */
  --bg-card: #1F2937;          /* Node box & modal dialog card */
  --bg-card-hover: #374151;    /* State hover */
  --border-subtle: #374151;    /* Garis pemisah panel & tepi node */
  --border-focus: #3B82F6;     /* Highlight saat node/input dipilih */

  /* Text & Typography */
  --text-primary: #F9FAFB;     /* Teks utama, judul */
  --text-secondary: #9CA3AF;   /* Keterangan, label port, info kecil */
  --text-muted: #6B7280;       /* Placeholder, disabled text */

  /* Brand & Status Accents */
  --accent-primary: #3B82F6;   /* Blue 500 - Aksi utama, tombol simpan */
  --status-success: #10B981;   /* Emerald 500 - Port Link UP, Ping 100% OK */
  --status-warning: #F59E0B;   /* Amber 500 - Port belum dikonfigurasi */
  --status-danger: #EF4444;    /* Red 500 - Port DOWN, Packet Dropped */

  /* Network Protocol Packet Colors */
  --pkt-arp: #10B981;          /* Emerald - Paket ARP (Broadcast/Reply) */
  --pkt-icmp: #06B6D4;         /* Cyan - Paket ICMP Ping Echo */
  --pkt-ip: #8B5CF6;           /* Violet - Paket data IPv4 umum */

  /* Terminal Console Specific */
  --term-bg: #050505;          /* Latar hitam pekat konsol terminal */
  --term-text: #00FF66;        /* Teks phosphor green terminal */
  --term-prompt: #38BDF8;      /* Sky blue untuk nama prompt 'Router(config)#' */
}
```

### 2.2 Typography Scale
- **UI Font Family:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`
- **Code/Terminal Font:** `JetBrains Mono`, `Fira Code`, `Consolas`, `monospace`
- **Hierarchy:**
  - `Display / H1`: 20px / Line-height: 28px / Semi-bold (Header Modal & App Title)
  - `Subheading / H2`: 16px / Line-height: 24px / Medium (Nama Perangkat, Tab Header)
  - `Body Text`: 14px / Line-height: 20px / Regular (Label form, info status)
  - `Caption / Micro`: 12px / Line-height: 16px / Regular (Label port Fa0/0, status bar)
  - `Terminal Monospace`: 13px / Line-height: 18px / Regular (Input & output konsol CLI)

---

## 3. Layout Grid & Workspace Structure

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  HEADER TOOLBAR: [Logo] | [New] [Open] [Save] | [Play/Pause] [Speed] | [Help]│
├──────────────┬───────────────────────────────────────────────────────────────┤
│ PALETTE      │                                                               │
│ (120px)      │                       MAIN CANVAS                             │
│              │                                                               │
│ [PC]         │              [PC-1] ───(kabel)─── [Switch-1]                  │
│ [Switch]     │                                       │                       │
│ [Router]     │                                    (kabel)                    │
│              │                                       │                       │
│ [Kabel Link] │                                   [Router-1]                  │
│              │                                                               │
│ [Minimap]    │                                                               │
├──────────────┴───────────────────────────────────────────────────────────────┤
│  STATUS BAR: Nodes: 3 | Active Links: 2 | Sim Status: IDLE | Ver: 1.0.0 (Web)│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Inventory & Styling Rules

### 4.1 Topology Node Component (Perangkat)
- **Visual Container:** Persegi berujung melengkung (*border-radius: 12px*), lebar 130px, tinggi 90px.
- **Header:** Icon perangkat SVG (Router biru-cyan, Switch ungu, PC hijau-emerald) + Nama perangkat (`PC-1`).
- **Port Handles:** Titik lingkaran kecil (*dot handle*) berdiameter 10px yang terletak di sisi tepi node:
  - Titik abu-abu: Port kosong (*Available*).
  - Titik hijau menyala: Port terpasang kabel (*Connected & Link UP*).
  - Titik merah: Port dinonaktifkan secara administratif (*Shutdown*).
- **Interaksi:**
  - Klik 1x: Node terpilih (border menyala biru `--border-focus`).
  - Klik 2x: Membuka Modal Konfigurasi Perangkat (GUI/CLI).
  - Drag: Menggeser posisi node di kanvas (kabel otomatis mengikuti koordinat baru).

### 4.2 Custom Edge Component (Kabel Koneksi)
- **Visual Line:** Garis SVG halus (ketebalan 2px, warna `--border-subtle`).
- **Animasi Paket:** Elemen partikel amplop meluncur di atas kurva SVG:
  - Amplop berputar/berkedip sesuai warna protokol (Hijau = ARP, Biru = ICMP).
  - Kecepatan meluncur: 600ms per hop (dapat dipercepat/diperlambat via Speed Slider).
- **Status Link:** Jika port pada salah satu ujung kabel di-*shutdown*, kabel berubah menjadi garis putus-putus merah (*Dashed Red Line*).

### 4.3 Modal Konfigurasi Perangkat (Dual-Mode)
- **Tab Bar:**
  - Tab 1: **"Quick Config"** (Form visual input IP, Mask, Gateway, On/Off Switch).
  - Tab 2: **"CLI Terminal"** (Layar hitam bergaya CRT retro-modern).
  - Tab 3: **"Port Table"** (Tabel ringkas semua port dan MAC Address).
- **Form Input Behavior:**
  - Validasi IPv4 desimal bertitik real-time. Jika input salah (misal: `192.168.1.300`), border input menjadi merah dengan teks bantuan: *"Nilai oktet harus berada di antara 0 dan 255"*.
- **Terminal Behavior:**
  - Prompt aktif berkedip (*blinking cursor*).
  - Tekan `Enter`: Perintah dieksekusi, hasil dicetak di baris berikutnya.
  - Tekan `ArrowUp` / `ArrowDown`: Mengakses riwayat perintah sebelumnya.
  - Tekan `Tab`: Melengkapi otomatis perintah (misal: `conf` + `Tab` -> `configure terminal`).

---

## 5. UI States Management

| State | Indikator Visual | Perilaku Interaksi |
|---|---|---|
| **Empty Canvas** | Watermark teks halus di tengah: *"Tarik perangkat dari panel kiri untuk mulai membuat topologi"* | Drag-and-drop aktif |
| **Connecting Cable** | Kursor mouse berubah menjadi `crosshair`, port yang valid menyala berkedip | Klik node pertama -> klik node kedua |
| **Sim Running** | Tombol Play berubah jadi Pause, status bar menampilkan *"Simulating..."* | Node tetap dapat dilihat, drag node diizinkan |
| **Sim Paused** | Status bar menampilkan *"Paused (Step Mode Active)"*, tombol Step (Langkah Maju) aktif | Pengguna dapat klik "Step" untuk memajukan paket 1 hop |
| **Offline Mode** | Status bar menampilkan badge hijau: *"Offline Ready (Local Engine)"* | Semua fungsi berjalan normal 100% |

---

## 6. Aksesibilitas (WCAG 2.2 AA) & Pintasan Keyboard

- **Keyboard Navigation:**
  - `Delete` atau `Backspace`: Menghapus perangkat atau kabel yang sedang dipilih.
  - `Escape`: Menutup modal konfigurasi yang sedang terbuka, atau membatalkan mode penarikan kabel.
  - `Space + Drag`: Pan/menggeser kanvas (*hand tool navigation*).
  - `Ctrl + S` / `Cmd + S`: Ekspor dan simpan file topologi JSON.
  - `Ctrl + O` / `Cmd + O`: Buka dialog muat file JSON.
- **Color Contrast:** Seluruh teks memiliki rasio kontras minimal 4.5:1 terhadap latar belakang (memenuhi kriteria WCAG 2.2 Level AA).
