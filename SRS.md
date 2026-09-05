# SRS: Software Requirements Specification — OpenPacket

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-SRS-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Project Planning Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-PLANNING-001  
> **Supersedes:** None  

---

## 1. Pendahuluan

### 1.1 Tujuan Dokumen
Dokumen Spesifikasi Kebutuhan Perangkat Lunak (*Software Requirements Specification* — SRS) ini mendefinisikan seluruh kebutuhan fungsional (*Functional Requirements*), kebutuhan non-fungsional (*Non-Functional Requirements*), aturan bisnis (*Business Rules*), serta batasan teknis dari sistem **OpenPacket**. Dokumen ini menjadi acuan utama perancangan arsitektur, implementasi antarmuka, pembuatan pengujian unit/integrasi, serta penulisan laporan skripsi (khususnya Bab 3 Metodologi Penelitian).

### 1.2 Ruang Lingkup Sistem
OpenPacket adalah aplikasi simulasi jaringan berbasis web dan desktop yang memodelkan interaksi protokol Layer 2 (Data Link) dan Layer 3 (Network) secara deterministik. Sistem ini tidak memvirtualisasikan perangkat keras fisik atau menjalankan kernel sistem operasi asli, melainkan menyimulasikan algoritma protokol jaringan (RFC 826 ARP, RFC 792 ICMP, IPv4 Subnet Routing, dan Ethernet Switching) dalam lingkungan eksekusi JavaScript/TypeScript.

---

## 2. User Persona

### UP-001: Mahasiswa Jaringan Komputer / Siswa TKJ
- **Karakteristik:** Mempelajari konsep dasar IP addressing, subnetting, switching, dan static routing.
- **Kebutuhan:** Membutuhkan media latihan visual yang cepat, tidak memerlukan setup rumit di laptop pribadi, serta memiliki tampilan interaktif mirip Cisco Packet Tracer untuk mempersiapkan ujian/sertifikasi dasar.
- **Pain Point:** Kesulitan menjalankan Cisco Packet Tracer karena keterbatasan RAM laptop atau ketiadaan akun resmi Cisco NetAcad.

### UP-002: Dosen / Instruktur / Asisten Lab
- **Karakteristik:** Mengajar mata kuliah Jaringan Komputer dan memandu praktikum.
- **Kebutuhan:** Memerlukan alat peraga visual berbasis web untuk demonstrasi materi di proyektor tanpa kendala instalasi, serta kemampuan membagikan template skenario topologi via file konfigurasi.
- **Pain Point:** Menghabiskan waktu praktikum hanya untuk memandu instalasi software mahasiswa yang kerap gagal kompatibilitas.

---

## 3. Functional Requirements (FR)

### 3.1 Kategori 1: Topology Canvas & Device Palette

#### FR-001: Penambahan Perangkat ke Canvas
- **Prioritas:** P0
- **Sumber:** Kebutuhan Inti MVP
- **Deskripsi:** Sistem harus memungkinkan pengguna menambahkan perangkat virtual (Router, Switch, PC) ke canvas melalui aksi drag-and-drop dari panel palet perangkat atau klik ganda.
- **Metode Verifikasi:** Automated E2E Test & Manual UI Inspection.
- **Acceptance Criteria (AC-001):**
  - Node perangkat baru muncul di koordinat drop canvas dengan nama default unik (misal: `PC-1`, `Switch-1`, `Router-1`).
  - Setiap perangkat memiliki icon visual representatif dan status indikator power ON secara default.

#### FR-002: Manipulasi Posisi & Penghapusan Perangkat
- **Prioritas:** P0
- **Sumber:** Kebutuhan Inti MVP
- **Deskripsi:** Pengguna dapat menggeser posisi node di canvas (drag-to-move), memilih node, dan menghapus node beserta kabel yang terhubung.
- **Metode Verifikasi:** Automated E2E Test.
- **Acceptance Criteria (AC-002):**
  - Menghapus node otomatis menghapus seluruh link/kabel yang terhubung ke port perangkat tersebut.
  - Undo/Redo atau dialog konfirmasi mencegah penghapusan tidak disengaja.

#### FR-003: Pengkabelan Port (Link Connection)
- **Prioritas:** P0
- **Sumber:** Kebutuhan Inti MVP
- **Deskripsi:** Pengguna dapat menghubungkan dua perangkat menggunakan kabel virtual dengan memilih port asal dan port tujuan yang tersedia.
- **Metode Verifikasi:** Unit Test & E2E Test.
- **Acceptance Criteria (AC-003):**
  - Sistem menampilkan daftar port kosong pada perangkat saat ujung kabel dihubungkan.
  - Port yang sudah terpakai berstatus `Occupied` dan tidak dapat dihubungkan ke kabel lain.
  - Hubungan kabel memicu pembentukan interface pair pada model topologi dan merender garis penghubung interaktif.

#### FR-004: Navigasi Canvas (Pan, Zoom, & Reset View)
- **Prioritas:** P0
- **Sumber:** Usability
- **Deskripsi:** Canvas harus mendukung navigasi pan (geser canvas), zoom-in, zoom-out, serta tombol fit-to-view.
- **Metode Verifikasi:** Manual UI Test.
- **Acceptance Criteria (AC-004):**
  - Zoom bekerja mulus menggunakan mouse wheel pada rentang 25% hingga 200%.

---

### 3.2 Kategori 2: Konfigurasi Perangkat (Dual-Mode: GUI & CLI)

#### FR-005: Antarmuka Konfigurasi GUI Modal
- **Prioritas:** P0
- **Sumber:** Klarifikasi Tanya-Jawab Discovery (Pilihan A)
- **Deskripsi:** Mengklik dua kali pada perangkat akan membuka modal dialog yang menyediakan form GUI untuk pengaturan konfigurasi IP, subnet mask, default gateway, dan status administrative port.
- **Metode Verifikasi:** Unit Test Component & Manual Test.
- **Acceptance Criteria (AC-005):**
  - Pengguna dapat mengetikkan IPv4 (contoh: `192.168.1.10`) dan Subnet Mask (contoh: `255.255.255.0`).
  - Sistem melakukan validasi sintaks IPv4 dan format desimal bertitik (dotted decimal).
  - Terdapat tombol toggle status port `Administrative Status: UP / DOWN`.

#### FR-006: Terminal Mini Emulasi Cisco IOS CLI
- **Prioritas:** P0
- **Sumber:** Klarifikasi Tanya-Jawab Discovery (Pilihan A)
- **Deskripsi:** Modal dialog perangkat menyediakan tab "CLI" berupa terminal interaktif yang meniru hirarki command prompt Cisco IOS.
- **Metode Verifikasi:** Unit Test Parser CLI.
- **Acceptance Criteria (AC-006):**
  - Mendukung hirarki prompt:
    - User EXEC mode: `Router>` atau `Switch>`
    - Privileged EXEC mode: `Router#` (diakses via perintah `enable`)
    - Global Configuration mode: `Router(config)#` (diakses via `configure terminal`)
    - Interface Configuration mode: `Router(config-if)#` (diakses via `interface <interface_name>`)
  - Mendukung perintah: `exit`, `end`, `ip address <ip> <mask>`, `no shutdown`, `shutdown`.
  - Mengabaikan whitespace berlebih dan case-insensitive untuk keyword perintah.

#### FR-007: Perintah Diagnostik & Monitoring CLI
- **Prioritas:** P0
- **Sumber:** Kebutuhan Praktikum
- **Deskripsi:** Terminal CLI menyediakan output untuk perintah verifikasi jaringan dasar.
- **Metode Verifikasi:** Unit Test CLI Output.
- **Acceptance Criteria (AC-007):**
  - Perintah `show ip interface brief` menampilkan tabel daftar interface, alamat IP, dan status (UP/DOWN).
  - Perintah `show ip route` menampilkan tabel routing (connected routes).
  - Perintah `ping <ip_tujuan>` dari terminal memicu proses ping simulasi dan mencetak laporan persentase sukses (misal: `Success rate is 100 percent (5/5)`).

---

### 3.3 Kategori 3: Simulation Engine & Protokol Jaringan

#### FR-008: Ethernet Switching & MAC Address Learning (Layer 2)
- **Prioritas:** P0
- **Sumber:** Standar IEEE 802.3
- **Deskripsi:** Perangkat Switch harus mengimplementasikan pemelajaran alamat MAC dinamis (CAM Table).
- **Metode Verifikasi:** Automated Unit Test Engine.
- **Acceptance Criteria (AC-008):**
  - Saat menerima frame Ethernet, switch mencatat pasangan `[Source MAC Address, Ingress Port]` ke dalam MAC Table.
  - Jika `Destination MAC Address` belum ada dalam tabel (unknown unicast), switch melakukan flooding (broadcast) ke seluruh port kecuali port asal.
  - Jika `Destination MAC Address` sudah ada, switch meneruskan frame hanya ke port yang terdaftar.

#### FR-009: Resolusi Alamat ARP (Address Resolution Protocol - RFC 826)
- **Prioritas:** P0
- **Sumber:** Standar IETF RFC 826
- **Deskripsi:** Node pengirim yang belum mengetahui alamat MAC tujuan wajib mengirimkan paket ARP Request secara broadcast sebelum mengirimkan paket IP.
- **Metode Verifikasi:** Automated Unit Test Engine.
- **Acceptance Criteria (AC-009):**
  - ARP Request dikirimkan dengan format broadcast L2 (`FF:FF:FF:FF:FF:FF`).
  - Node pemilik IP yang cocok menjawab dengan ARP Reply secara unicast.
  - Node pengirim memperbarui tabel ARP Cache lokalnya dengan entri `[Target IP, Target MAC]`.

#### FR-010: Perutean IPv4 & Subnet Masking (Layer 3)
- **Prioritas:** P0
- **Sumber:** Standar IETF RFC 791
- **Deskripsi:** Perangkat Host (PC) dan Router harus mengevaluasi apakah alamat IP tujuan berada pada subnet yang sama atau memerlukan gateway perantara.
- **Metode Verifikasi:** Automated Unit Test Engine.
- **Acceptance Criteria (AC-010):**
  - Jika IP tujuan berada dalam satu subnet (hasil bitwise AND IP dan Subnet Mask sama), frame dikirim langsung ke MAC tujuan.
  - Jika IP tujuan berada di luar subnet, paket diarahkan ke alamat MAC Default Gateway yang terkonfigurasi.
  - Router melakukan *forwarding* paket antar-interface yang terhubung langsung (*directly connected networks*).

#### FR-011: Simulasi ICMP Echo Request / Reply (Ping - RFC 792)
- **Prioritas:** P0
- **Sumber:** Standar IETF RFC 792
- **Deskripsi:** Sistem harus mampu mengeksekusi siklus lengkap ICMP Ping dari host asal ke host tujuan.
- **Metode Verifikasi:** Automated Unit & Integration Test.
- **Acceptance Criteria (AC-011):**
  - Host asal mengirimkan ICMP Type 8 (Echo Request).
  - Host tujuan membalas dengan ICMP Type 0 (Echo Reply).
  - Siklus menghitung RTT dan menampilkan status sukses jika reply diterima, atau `Request timed out` / `Destination Host Unreachable` jika rute atau ARP gagal.

---

### 3.4 Kategori 4: Visualisasi & Animasi Paket

#### FR-012: Visualisasi Aliran Paket Data (PDU Flight)
- **Prioritas:** P0
- **Sumber:** Kebutuhan Edukasi
- **Deskripsi:** Saat paket bergerak dari satu node ke node berikutnya, sistem harus merender elemen animasi visual (amplop/partikel paket) yang bergerak menyusuri garis kabel.
- **Metode Verifikasi:** Visual UI Inspection.
- **Acceptance Criteria (AC-012):**
  - Paket berwarna membedakan tipe protokol (misal: Hijau untuk ARP, Biru untuk ICMP).
  - Animasi bergerak dengan kecepatan yang dapat disesuaikan (Real-time vs Simulation Step).
  - Paket yang di-drop (misal karena kabel putus atau port down) menampilkan animasi silang merah (*Packet Dropped*).

#### FR-013: Kontrol Simulasi (Play, Pause, Speed Slider)
- **Prioritas:** P0
- **Sumber:** Kebutuhan Demonstrasi
- **Deskripsi:** Pengguna dapat menjeda (pause) simulasi, melanjutkan (play), dan mengatur kecepatan animasi.
- **Metode Verifikasi:** UI Integration Test.
- **Acceptance Criteria (AC-013):**
  - Penggeser kecepatan mendukung rentang 0.5x hingga 3x.
  - Tombol reset menghapus antrian paket simulasi yang sedang berjalan dan mengembalikan canvas ke kondisi *idle*.

---

### 3.5 Kategori 5: File Persistence & Multi-Platform Packaging

#### FR-014: Ekspor Topologi ke File JSON
- **Prioritas:** P0
- **Sumber:** Usability
- **Deskripsi:** Pengguna dapat mengunduh/menyimpan kondisi topologi saat ini ke dalam file lokal berekstensi `.json`.
- **Metode Verifikasi:** Automated File Serialization Test.
- **Acceptance Criteria (AC-014):**
  - File JSON menyimpan daftar semua node, koordinat (x, y), konfigurasi interface (IP, mask, MAC), kabel penghubung, dan riwayat konfigurasi.
  - Menghasilkan payload JSON valid sesuai skema data topologi yang ditentukan.

#### FR-015: Impor Topologi dari File JSON
- **Prioritas:** P0
- **Sumber:** Usability
- **Deskripsi:** Pengguna dapat membuka/memuat file JSON topologi yang tersimpan sebelumnya ke dalam canvas.
- **Metode Verifikasi:** Automated File Deserialization Test.
- **Acceptance Criteria (AC-015):**
  - Sistem memvalidasi integritas file JSON sebelum dimuat.
  - Seluruh node dan kabel ter-render ulang persis di posisi semula dengan seluruh parameter IP yang tersimpan.

#### FR-016: Standalone Desktop Windows Executable Build
- **Prioritas:** P0
- **Sumber:** Klarifikasi Tanya-Jawab Discovery (Pilihan A)
- **Deskripsi:** Sistem harus dapat dibundle menjadi installer Windows `.exe` mandiri menggunakan Tauri v2.
- **Metode Verifikasi:** Desktop Installation & Offline Run Test.
- **Acceptance Criteria (AC-016):**
  - Installer `.exe` dapat dipasang di Windows 10/11 64-bit tanpa memerlukan instalasi Node.js, Python, atau browser eksternal.
  - Aplikasi desktop dapat dijalankan 100% tanpa sambungan internet (*offline mode*).

---

## 4. Non-Functional Requirements (NFR)

| ID | Kategori | Target Kebutuhan | Indikator Pengukuran |
|---|---|---|---|
| `NFR-001` | **Performance** | Antarmuka canvas harus tetap responsif dan lancar | Frame rate konsisten ≥ 60 FPS pada topologi hingga 30 perangkat & 50 koneksi |
| `NFR-002` | **Simulation Latency** | Kalkulasi hop paket di Web Worker tidak boleh memblokir thread UI | Waktu proses per hop < 20 ms |
| `NFR-003` | **Footprint / Size** | Ukuran bundel aplikasi harus seringan mungkin | Ukuran installer desktop Windows `.exe` ≤ 20 MB; web initial bundle < 2 MB (gzipped) |
| `NFR-004` | **Reliability** | Operasi lokal 100% mandiri tanpa ketergantungan jaringan | Nol network request eksternal untuk menjalankan simulasi dasar |
| `NFR-005` | **Portability** | Multi-lingkungan berbasis single codebase | Berjalan identik di Google Chrome, MS Edge, Firefox, dan native Tauri Webview Windows |
| `NFR-006` | **Academic Correctness** | Kepatuhan terhadap RFC standar jaringan | 100% kesesuaian alur paket ARP (RFC 826) dan ICMP (RFC 792) pada topologi valid |
| `NFR-007` | **Usability** | Kemudahan penggunaan bagi mahasiswa pemula | Rata-rata skor System Usability Scale (SUS) ≥ 75 |

---

## 5. Business Rules (BR)

- `BR-001` **IP Uniqueness Per Subnet:** Dua perangkat di dalam satu segmen jaringan yang sama tidak boleh memiliki alamat IPv4 yang identik (*IP Conflict Prevention*).
- `BR-002` **Port Single Cable Limitation:** Satu port fisik perangkat hanya dapat dihubungkan ke tepat satu kabel (*No Port Over-subscription*).
- `BR-003` **Router Inter-VLAN / Subnet Requirement:** Dua interface berbeda pada satu Router wajib memiliki subnet jaringan yang berbeda.
- `BR-004` **Switch Layer 2 Non-IP Requirement:** Interface switch Layer 2 standar bertindak transparan murni berdasarkan MAC address dan tidak memiliki konfigurasi IPv4 host (pada scope P0).
