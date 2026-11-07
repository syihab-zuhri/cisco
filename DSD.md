# DSD: Design System & User Experience Specifications

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-DSD-001  
> **Version:** 1.1.0  
> **Status:** Draft  
> **Owner:** Lead UI/UX Designer & Frontend Architect  
> **Last Updated:** 2026-10-01  
> **Depends On:** DOC-PRD-INDEX-001, DOC-ARCH-001  
> **Supersedes:** None  

---

## 1. Visual Principles
1. **Engineered Precision**: Antarmuka bersih, fungsional, dan bernuansa alat laboratorium modern (*technical workstation aesthetics*).
2. **High-Contrast Signal Clarity**: Status jaringan, konektivitas kabel, dan pergerakan paket data harus langsung terbaca secara visual melalui warna sinyal yang distingtif (hijau, biru, kuning, merah).
3. **Familiarity for Networking Students**: Elemen diagram, simbol perangkat, dan terminal dirancang familiar bagi pengguna yang pernah melihat Cisco Packet Tracer, namun dengan sentuhan modern UI (tema Terang/Gelap/Ikuti Sistem, rounded corners, dan tipografi tajam).

---

## 2. Design Tokens & Color Palette

> **Revisi 1.1.0 (2026-10-01):** identitas visual diganti mengikuti sistem desain DiagramForge (krem · navy · emas) dan aplikasi kini mendukung tiga mode tema. Sebelumnya dokumen ini menetapkan *Dark Mode* tunggal berpalet Tailwind (`--bg-app #0B0F19`, terminal phosphor hijau, font Inter).
> Sumber kebenaran token adalah `src/index.css`; tabel di bawah mencerminkannya.

### 2.1 Sistem Tema (Terang · Gelap · Ikuti Sistem)

| Mode | Perilaku |
|---|---|
| **Terang** | Kanvas krem, teks navy. |
| **Gelap** | Kanvas navy gelap, teks krem. Turunan palet DiagramForge; aksen emas tidak berubah. |
| **Ikuti Sistem** *(default)* | Mengikuti `prefers-color-scheme` sistem operasi dan berubah langsung saat OS berganti tema. |

- **Mekanisme:** kelas `dark` pada `<html>` (+ `color-scheme`). Preferensi disimpan di `localStorage` kunci `openpacket-theme` (`light` / `dark` / `system`; nilai tak dikenal dianggap `system`). Tetap 100 % offline (INV-008).
- **Anti-kedip:** skrip inline kecil di `index.html` memasang kelas `dark` sebelum CSS dimuat. Logikanya wajib identik dengan `parseThemePreference` + `resolveTheme` di `src/lib/theme.ts` (dijaga `tests/unit/theme.test.ts`).
- **Kontrol:** tombol ikon (matahari / bulan / monitor) di Toolbar, di sebelah menu *Alat*, membuka menu **Terang / Gelap / Ikuti Sistem**. Di layar mobile pilihan yang sama ada di menu samping (*Tema Tampilan*). Preferensi tersinkron antar-tab.
- **Aturan pemakaian:** komponen hanya boleh memakai token semantik (utilitas Tailwind seperti `bg-card`, `text-foreground`, `text-viz-green`, atau `var(--token)`), bukan nilai hex mentah. Satu-satunya pengecualian adalah warna yang disimpan ke JSON topologi (preset zona *Square*).

#### Token inti

| Token | Terang | Gelap | Peran |
|---|---|---|---|
| `--canvas` | `#F2F0EB` krem | `#0E1626` | Latar halaman & kanvas |
| `--surface` | `#FFFFFF` | `#16223B` | Kartu, panel, dialog, node |
| `--surface-muted` | `#E5E2DC` | `#1F2E4F` | Hover, chip, area sekunder |
| `--inverse` | `#1B2A4A` navy | `#1B2A4A` | Top bar, terminal (selalu navy) |
| `--fg-primary` | `#1B2A4A` | `#F2F0EB` | Teks utama |
| `--fg-secondary` | `#2E4676` | `#B9C2D6` | Keterangan, label |
| `--fg-gold` | `#8A5D00` | `#E8B93F` | Teks beraksen emas |
| `--gold` | `#D4A024` | `#D4A024` | Aksen: tombol emas, logo, cincin fokus |
| `--line` | `#D7D3D2` | `#2C3C5E` | Garis dekoratif |
| `--line-control` | `#66748F` | `#7686A6` | Batas kontrol form (≥ 3 : 1) |
| `--danger` | `#B91C1C` | `#F87171` | Aksi/teks destruktif |
| `--primary` *(shadcn)* | navy `#1B2A4A` | krem `#F2F0EB` | Tombol primer (satu per layar) |

Umpan balik (`--success-*`, `--danger-*`, `--warning-*`, `--info-*` masing-masing `fg` / `bg` / `border`) memakai pasangan hijau, merah, emas, dan navy-krem yang kontrasnya sudah diperiksa di kedua mode.

#### Warna kategori (`--viz-*`)
Simulator butuh warna yang tetap bisa dibedakan untuk jenis perangkat, protokol, dan status. Delapan warna: `blue`, `teal`, `green`, `gold`, `orange`, `red`, `violet`, `plum`. Mode terang memakai nada gelap (≥ 4.5 : 1 di atas putih/krem); mode gelap dan area navy (`.df-inverse`) memakai nada pastel (≥ 4.7 : 1 di atas navy). Teks di atas fill `viz` solid memakai `--on-viz`.

#### Warna paket & terminal
```css
--pkt-arp:  var(--viz-green);   /* ARP  */
--pkt-icmp: var(--viz-teal);    /* ICMP */
--pkt-dhcp: var(--viz-gold);    /* DHCP */
--pkt-rip:  var(--viz-violet);  /* RIP  */
--pkt-ip:   var(--viz-violet);  /* IPv4 umum */

--term-bg:     var(--inverse);  /* terminal selalu navy, di kedua mode */
--term-text:   #F2F0EB;
--term-prompt: var(--gold);     /* prompt 'Router(config)#' */
```

#### Area navy (`.df-inverse`)
Top bar dan modal terminal memakai kelas `.df-inverse`, yang membalik variabel shadcn (`--background`, `--foreground`, `--primary` menjadi emas, dst.) serta `--viz-*` ke varian terang. Seluruh Button/Input/Select di dalamnya otomatis terbaca di atas navy. Popup yang di-*portal* ke `<body>` sengaja mengikuti tema aktif.

### 2.2 Tipografi, Bentuk & Fokus
- **UI Font Family:** `Plus Jakarta Sans Variable`, `Inter`, `ui-sans-serif`, `system-ui`, `sans-serif`
- **Code/Terminal Font:** `JetBrains Mono`, `ui-monospace`, `SFMono-Regular`, `Menlo`, `monospace`
- Kedua font dibundel lokal lewat `@fontsource` (tanpa CDN). Maksimal dua keluarga font.
- **Radius:** `4px` (badge, chip), `6px` (tombol, input, menu), `10px` (kartu, dialog, node). Ukuran lebih besar dipadatkan ke 10px agar satu hierarki tidak mencampur sudut.
- **Bayangan:** tipis dan bernuansa navy (`shadow-raised` untuk kartu, `shadow-overlay` untuk dialog/menu). Tidak ada gradien dekoratif atau efek kaca (*glassmorphism*).
- **Fokus & seleksi:** cincin ganda: navy/gelap di dalam, emas di luar, sehingga minimal satu cincin selalu ≥ 3 : 1 terhadap latar mana pun. Node terpilih memakai cincin ganda yang sama (`.df-node-selected`).
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
- **Visual Container:** Kartu `--surface` berujung melengkung (*radius 10px*), batas `--line`, bayangan `shadow-raised`.
- **Header:** Ikon perangkat pada petak `--surface-muted`, diwarnai token kategori (PC biru, Laptop teal, Server violet, Switch hijau, Hub oranye, Access Point plum, Router emas, Cloud biru) + Nama perangkat (`PC-1`) dan tipe dalam `JetBrains Mono`.
- **Port Handles:** Titik lingkaran kecil (*dot handle*) berdiameter 10px yang terletak di sisi tepi node:
  - Titik hijau (`--viz-green`): Port *Link UP*.
  - Titik emas (`--gold-hover`): Port *Link DOWN* / belum terpasang.
  - Titik violet (`--viz-violet`): Port nirkabel (WiFi).
- **Interaksi:**
  - Klik 1x: Node terpilih (cincin ganda `--line-focus-inner` + `--line-focus` emas).
  - Klik 2x: Membuka Modal Konfigurasi Perangkat (GUI/CLI).
  - Drag: Menggeser posisi node di kanvas (kabel otomatis mengikuti koordinat baru).

### 4.2 Custom Edge Component (Kabel Koneksi)
- **Visual Line:** Garis SVG putus-putus (ketebalan 3px, warna `--fg-secondary`); kabel terpilih berwarna emas (`--gold-hover`).
- **Animasi Paket:** Elemen partikel amplop meluncur di atas kurva SVG:
  - Amplop berputar/berkedip sesuai warna protokol (`--pkt-arp` hijau, `--pkt-icmp` teal, `--pkt-dhcp` emas, `--pkt-rip` violet).
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
- **Color Contrast:** Seluruh teks memiliki rasio kontras minimal 4.5:1 terhadap latar belakang (WCAG 2.2 Level AA) di **kedua mode tema**; batas kontrol form dan cincin fokus minimal 3:1. Contoh terukur: teks utama 12.5 : 1 (terang, di atas krem) dan 13.9 : 1 (gelap, di atas `--surface`); teks emas 5.1 : 1 (terang) dan 8.6 : 1 (gelap); teks tombol emas navy-di-atas-emas 6.0 : 1.

---

## 7. Catatan Sinkronisasi (2026-10-01)

Revisi 1.1.0 hanya menyelaraskan bagian **visual dan tema** (§1, §2, warna pada §4.1–4.2, dan kontras pada §6) dengan implementasi. Bagian non-visual berikut belum ditinjau ulang dan dapat berbeda dari perilaku aplikasi saat ini: tata letak ASCII §3 (lebar palet, status bar), tab modal konfigurasi §4.3 (aplikasi kini memakai modal GUI dan modal terminal terpisah), tabel *UI States* §5, dan pintasan keyboard §6.
