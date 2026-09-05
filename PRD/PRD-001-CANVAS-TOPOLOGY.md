# PRD: Interactive Topology Canvas & Cable Management

> **Feature ID:** FEAT-CANVAS  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Priority:** P0  
> **Owner:** Frontend & Simulation Architect  
> **Dependencies:** None  
> **Last Updated:** 2026-09-05  

---

## 1. Overview
Fitur ini menyediakan antarmuka visual utama bagi pengguna untuk merancang topologi jaringan komputer secara bebas. Pengguna dapat memilih perangkat dari palet (PC, Switch, Router), menaruhnya di canvas dengan mekanisme drag-and-drop, menghubungkan port fisik antarperangkat menggunakan kabel virtual, serta menyimpan dan memuat ulang file topologi berekstensi `.json`.

---

## 2. Goals & Non-Goals
- **Goals:**
  - Menyediakan workspace canvas berbasis React Flow dengan performa mulus (60 FPS).
  - Menyediakan palet perangkat: Router (3 FastEthernet ports), Switch (8 FastEthernet ports), PC (1 FastEthernet port).
  - Mengimplementasikan kabel interaktif yang menghubungkan dua port fisik spesifik.
  - Mendukung ekspor dan impor file topologi JSON lengkap beserta koordinat dan status port.
- **Non-Goals:**
  - Simulasi redaman kabel fisik atau panjang kabel (kabel dianggap lossless link pada P0).
  - Pilihan tipe kabel rumit (seperti Crossover vs Straight-through otomatis/Auto-MDIX diasumsikan aktif pada semua port).
  - Topologi multi-layer / multi-area diagram.

---

## 3. Actors & Permissions
- **Actor:** Single Local User (Mahasiswa/Dosen).
- **Permissions:** Akses penuh untuk membuat, mengedit, menghapus seluruh node dan kabel pada canvas lokal.

---

## 4. Preconditions
- Aplikasi telah terbuka di web browser modern atau jendela aplikasi desktop Tauri.
- Canvas dalam keadaan *idle* (siap menerima input mouse dan keyboard).

---

## 5. User Stories
- **US-CANVAS-001**: Sebagai mahasiswa, saya ingin menarik icon PC, Switch, dan Router dari toolbox ke canvas agar saya dapat membentuk topologi praktikum sesuai modul tugas.
- **US-CANVAS-002**: Sebagai mahasiswa, saya ingin menarik garis kabel dari port PC ke port Switch agar kedua perangkat terhubung secara fisik di simulasi.
- **US-CANVAS-003**: Sebagai mahasiswa, saya ingin menyimpan hasil topologi saya ke file `.json` di komputer saya agar dapat saya lanjutkan di pertemuan praktikum berikutnya.
- **US-CANVAS-004**: Sebagai dosen, saya ingin memuat file `.json` topologi yang sudah saya siapkan agar saya bisa langsung memulai demonstrasi di depan kelas.

---

## 6. Functional Flow

### 6.1 Happy Path: Menghubungkan Dua Perangkat dengan Kabel
1. Pengguna mengklik icon "Cable" pada toolbar palet perangkat.
2. Kursor mouse berubah menjadi mode penarikan kabel (*crosshair link mode*).
3. Pengguna mengklik perangkat sumber (misal: `PC-1`).
4. Muncul pop-up mini yang menampilkan daftar port yang tersedia (misal: `FastEthernet 0`).
5. Pengguna memilih port asal, lalu menarik garis kabel ke perangkat tujuan (misal: `Switch-1`).
6. Muncul pop-up mini port pada perangkat tujuan (menampilkan `FastEthernet 0/1` s.d. `0/8`).
7. Pengguna mengklik port tujuan yang masih kosong.
8. Kabel terpasang menghubungkan kedua perangkat; indikator lampu link port berubah menjadi hijau (`Link UP`).

### 6.2 Alternate Path: Penghapusan Node
1. Pengguna memilih satu perangkat pada canvas (node aktif diberi highlight border).
2. Pengguna menekan tombol `Delete` pada keyboard atau mengklik icon tempat sampah pada node toolbar.
3. Node perangkat terhapus dari canvas, dan seluruh kabel yang terhubung ke port-port perangkat tersebut otomatis terhapus dari memori dan canvas.

### 6.3 Failure Path: Mencoba Menghubungkan ke Port yang Sudah Terisi
1. Pengguna menarik kabel dari `PC-2` ke `PC-1`.
2. Sistem mendeteksi `PC-1` hanya memiliki 1 port (`FastEthernet 0`) dan port tersebut sudah terhubung ke `Switch-1`.
3. Pop-up mini menampilkan pesan: *"No available ports on this device"*.
4. Operasi penarikan kabel dibatalkan otomatis; kabel sementara menghilang tanpa error runtime.

---

## 7. Business Rules
- `BR-CANVAS-001`: Setiap node baru otomatis memiliki `id` UUID unik dan `label` default bertambah (misal `PC-1`, `PC-2`, `Switch-1`, `Router-1`).
- `BR-CANVAS-002`: Port fisik tidak dapat menerima lebih dari 1 sambungan kabel (*Strict 1-to-1 physical port binding*).
- `BR-CANVAS-003`: Kabel tidak dapat dihubungkan ke port perangkat yang sama (*Self-loop disabled*).
- `BR-CANVAS-004`: Menghapus kabel mengubah status link kedua port terkait kembali menjadi `Link DOWN`.

---

## 8. Acceptance Criteria

### AC-CANVAS-001: Drag and Drop Node
- **Given** palet perangkat terbuka di sisi samping/atas canvas,
- **When** pengguna melakukan drag pada icon "Router" lalu drop di koordinat canvas (300, 200),
- **Then** node Router baru harus muncul di koordinat tersebut, terdaftar di state topologi dengan 3 port bawaan (`FastEthernet 0/0`, `FastEthernet 0/1`, `FastEthernet 0/2`), dan tidak terjadi error pada console browser.

### AC-CANVAS-002: Save and Load JSON Topology
- **Given** topologi terdiri dari 2 PC dan 1 Switch yang saling terhubung dengan kabel,
- **When** pengguna mengklik tombol "Export JSON",
- **Then** file bernama `topology.json` terunduh berisi array `nodes` dan `edges` yang valid.
- **When** file tersebut di-import kembali ke canvas kosong,
- **Then** seluruh posisi node, nama perangkat, dan sambungan kabel ter-render persis sama.

---

## 9. UI/UX Specifications
- **Canvas Framework:** `@xyflow/react` (React Flow v12).
- **Styling:** Dark/Light theme mode dengan grid background dot pattern.
- **Custom Node Component:**
  - Kotak rounded dengan icon representatif: Router (silinder berpanah), Switch (persegi bertanda panah silang), PC (desktop monitor).
  - Status LED: Hijau bulat jika ada kabel aktif, Abu-abu jika kabel tidak terpasang, Merah jika port administratif `shutdown`.
- **Edge Component:** Custom animated SVG line. Saat simulasi aktif, partikel animasi bergerak di atas garis ini.

---

## 10. Data Model Reference (TypeScript Interface)

```typescript
export interface DevicePort {
  id: string; // misal "fa0/0"
  name: string; // misal "FastEthernet 0/0"
  macAddress: string; // format "00:1A:2B:3C:4D:5E"
  ipAddress?: string; // misal "192.168.1.1"
  subnetMask?: string; // misal "255.255.255.0"
  adminStatus: 'UP' | 'DOWN';
  connectedEdgeId?: string; // ID kabel yang terpasang
}

export interface NetworkNodeData {
  id: string;
  name: string;
  type: 'ROUTER' | 'SWITCH' | 'PC';
  ports: DevicePort[];
  defaultGateway?: string; // Khusus PC
  routingTable?: RouteEntry[]; // Khusus Router
  macTable?: MacTableEntry[]; // Khusus Switch
  arpTable: ArpEntry[]; // PC & Router
}

export interface NetworkEdgeData {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  status: 'ACTIVE' | 'DOWN';
}
```

---

## 11. Edge Cases & Error Handling
1. **Invalid JSON File Load:** Jika pengguna mengunggah file bukan JSON atau JSON yang tidak memiliki skema node valid, tampilkan toast peringatan: *"Format file topologi tidak valid atau rusak"*, dan biarkan canvas tetap pada kondisi sebelumnya.
2. **Dragging Outside Boundary:** Node dibatasi tidak dapat ditarik ke koordinat negatif tak terbatas.
3. **High Node Count:** Jika pengguna menaruh lebih dari 50 perangkat, tampilkan notifikasi informasi performa rendering.
