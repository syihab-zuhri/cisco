# ADR-002: Pemilihan React Flow (@xyflow/react) untuk Canvas Topologi Jaringan

- **Status:** Accepted  
- **Date:** 2026-09-05  
- **Owners:** Software Architect & Frontend Lead  
- **Decision Class:** Type-1 (Keputusan Komponen Interaksi Inti)  
- **Related Requirements:** `FR-001`, `FR-002`, `FR-003`, `FR-004`, `NFR-001`  

---

## 1. Context & Problem Statement
Inti interaksi visual dari OpenPacket adalah kanvas diagram jaringan interaktif tempat pengguna dapat menambahkan perangkat, menggeser posisinya, menarik kabel koneksi antar-port fisik, serta menyaksikan animasi paket data bergerak di sepanjang kabel.

Membangun kanvas grafik dari nol menggunakan Canvas 2D API murni akan memakan 40–50% waktu pengembangan skripsi hanya untuk menyelesaikan urusan matematika koordinat viewport, penanganan drag-and-drop, bounding-box hit testing, zooming, dan panning. Diperlukan library diagramming yang dapat diintegrasikan secara deklaratif dengan React, mendukung komponen kustom (*custom nodes and handles*), dan memiliki performa tinggi.

---

## 2. Decision Drivers
- **Kecepatan Pengembangan MVP:** Memaksimalkan fokus pada logika simulasi jaringan daripada membuat ulang infrastruktur canvas dari nol.
- **Dukungan Custom Handles (Port Fisik):** Kemampuan mendefinisikan port fisik spesifik (`Fa0/0`, `Fa0/1`) dengan koordinat titik koneksi yang presisi pada setiap perangkat.
- **Kustomisasi Animasi Edge (Kabel):** Kemudahan merender custom SVG edge dengan partikel/amplop animasi di atas kabel.
- **Lisensi Open-Source Murni:** Harus berlisensi MIT atau permissive serupa tanpa pembatasan watermark komersial.

---

## 3. Considered Options

### Opsi A: React Flow (`@xyflow/react` v12)
Library diagramming reaktif khusus untuk React berbasis DOM/SVG. Menyediakan hook built-in (`useNodesState`, `useEdgesState`), minimap, controls, dan dukungan kustomisasi node/edge tanpa batas.

### Opsi B: Konva.js / React-Konva (HTML5 Canvas 2D)
Framework grafis 2D berbasis elemen `<canvas>`. Menawarkan performa tinggi untuk ribuan objek visual bergerak.

### Opsi C: JointJS (Open Source Core)
Library diagramming berbasis SVG yang sangat matang untuk pemodelan sistem jaringan dan alur kerja.

---

## 4. Tech Selection Matrix

| Kriteria Evaluasi | Bobot | Opsi A: React Flow | Opsi B: Konva.js | Opsi C: JointJS |
|---|---|---|---|---|
| **Dukungan Node & Port Kustom** | 30% | **5** (Sangat intuitif via JSX & Handle) | **3** (Manual kalkulasi koordinat shape) | **4** (Mendukung port, tapi API imperatif) |
| **Kecepatan Implementasi Solo** | 25% | **5** (Deklaratif React state) | **2** (Banyak boilerplate imperative) | **3** (Kurva belajar curam) |
| **Dukungan Animasi Aliran Kabel**| 20% | **4** (Custom edge SVG path interpolation) | **5** (Sangat fleksibel di canvas 2D) | **3** (Terbatas) |
| **Model Lisensi FOSS** | 15% | **5** (MIT License murni) | **5** (MIT License murni) | **3** (Fitur lengkap berbayar) |
| **Kompatibilitas Ekosistem React**| 10% | **5** (Dibuat spesifik untuk React) | **3** (Wrapper di atas canvas canvas) | **2** (Wrapper di atas jQuery/Backbone heritage) |
| **Total Skor Terbobot** | 100% | **4.80** | **3.40** | **3.25** |

---

## 5. Decision
Memilih **Opsi A: React Flow (`@xyflow/react`)**.
- Node perangkat (Router, Switch, PC) diimplementasikan sebagai React Custom Nodes dengan komponen Handle yang merepresentasikan port fisik FastEthernet.
- Kabel penghubung diimplementasikan sebagai Custom Edge yang mendukung injeksi elemen SVG animasi untuk visualisasi paket data.

---

## 6. Consequences

### Dampak Positif
- **Efisiensi Waktu Signifikan:** Fitur dasar canvas (multi-select, bounding box, pan, zoom, fit-view, minimap) sudah tersedia *out-of-the-box*, menghemat setidaknya 3–4 minggu waktu pengembangan.
- **Keterbacaan Kode:** State koordinat topologi dapat langsung diserialisasi menjadi array JSON `nodes` dan `edges` standar yang bersih.
- **Aksesibilitas DOM:** Teks label perangkat dan status port tetap berupa elemen HTML/SVG semantik yang mudah diakses dan di-style menggunakan Tailwind CSS.

### Dampak Negatif & Trade-off
- Performa rendering berbasis DOM/SVG akan mulai menurun jika jumlah node melebihi 100–200 node (namun batas skripsi dibatasi maksimal 30 node, sehingga trade-off ini sepenuhnya dapat diterima).

---

## 7. Revisit Triggers
Keputusan ini akan dievaluasi ulang jika kebutuhan skripsi bergeser ke simulasi topologi jaringan berskala ISP/Internet dengan lebih dari 500 router aktif secara simultan.

---

## 8. References
- Dokumentasi Resmi React Flow: https://reactflow.dev
- Repository GitHub xyflow: https://github.com/xyflow/web
