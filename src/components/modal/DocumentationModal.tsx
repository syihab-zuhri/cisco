import { useState } from 'react';
import {
  BookOpen,
  X,
  Layers,
  Terminal,
  Play,
  Cpu,
  Download,
} from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentationModal({ isOpen, onClose }: DocsModalProps) {
  const [activeSection, setActiveSection] = useState<
    'features' | 'porting' | 'simulation' | 'cli' | 'architecture'
  >('features');
  const dialogRef = useModalA11y({ onClose, enabled: isOpen });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-modal-title"
        className="flex h-[88vh] w-[92vw] max-w-5xl flex-col rounded-2xl border border-gray-700 bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-800 bg-[#1E293B] px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600/20 p-2 border border-blue-500/40">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 id="docs-modal-title" className="text-base font-bold text-white tracking-wide">
                Dokumentasi Resmi & Panduan OpenPacket
              </h2>
              <p className="text-xs text-gray-400">
                Spesifikasi fitur, panduan build multi-platform (Web/Desktop/Mobile), dan Cisco IOS syntax
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
              <span className="rounded bg-blue-950/60 px-2 py-0.5 text-[10px] text-blue-300 border border-blue-800/50 font-mono">
                Dokumentasi v1.3.0
              </span>
            <button
              onClick={onClose}
              aria-label="Tutup dokumentasi"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Nav */}
          <nav className="flex w-60 flex-col border-r border-gray-800 bg-[#0B132B] p-3 gap-1">
            <button
              onClick={() => setActiveSection('features')}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                activeSection === 'features'
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Kemampuan Sistem</span>
            </button>

            <button
              onClick={() => setActiveSection('porting')}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                activeSection === 'porting'
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <Download className="h-4 w-4 text-emerald-400" />
              <span>Panduan Build & Porting</span>
            </button>

            <button
              onClick={() => setActiveSection('simulation')}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                activeSection === 'simulation'
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <Play className="h-4 w-4 text-cyan-400" />
              <span>Simulasi Protokol (RFC)</span>
            </button>

            <button
              onClick={() => setActiveSection('cli')}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                activeSection === 'cli'
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <Terminal className="h-4 w-4 text-green-400" />
              <span>Cisco IOS CLI Emulator</span>
            </button>

            <button
              onClick={() => setActiveSection('architecture')}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                activeSection === 'architecture'
                  ? 'bg-blue-600 text-white font-bold shadow-md'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
              }`}
            >
              <Cpu className="h-4 w-4 text-purple-400" />
              <span>Arsitektur & Zero-Secret</span>
            </button>
          </nav>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 text-gray-200 space-y-6">
            {/* 1. FEATURES */}
            {activeSection === 'features' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-400" />
                  Apa Saja yang Bisa Dilakukan oleh Web Ini?
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  OpenPacket adalah simulator jaringan komputer interaktif client-side yang dirancang sebagai alternatif ringan untuk media belajar praktikum jaringan komputer dan penelitian skripsi tanpa perlu menginstal aplikasi berat seperti Cisco Packet Tracer. Dokumentasi ini mencerminkan kondisi implementasi versi <b>1.0.3</b>.
                </p>

                <div className="grid grid-cols-2 gap-3.5 pt-2">
                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2">
                      1. Manipulasi Topologi Interaktif
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li>Drag-and-drop 8 jenis perangkat: PC, Laptop, Server, Switch L2, Hub, <b>Access Point</b>, Router L3, dan <b>Cloud Internet</b>.</li>
                      <li>Pengkabelan fisik dengan aturan <b>Port Singularity</b> + <b>asosiasi WiFi via SSID</b> (satu radio AP melayani banyak klien).</li>
                      <li>Garis kabel & asosiasi nirkabel (garis putus-putus ungu ber-SSID) dengan label port interaktif.</li>
                      <li>12 katalog template siap pakai: P2P, LAN, routing, nirkabel+internet, VLAN, dan RIP.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                      2. Simulasi Protokol Jaringan Riil
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>RFC 826 ARP:</b> Broadcast request resolusi MAC; hanya pemilik IP yang membalas unicast reply; cache IP-MAC tersimpan dua arah.</li>
                      <li><b>RFC 791 IPv4 Routing:</b> Ping lintas subnet benar-benar diteruskan router ke subnet tujuan (longest-prefix match atas interface connected + static route).</li>
                      <li><b>RFC 792 ICMP Ping:</b> TTL berkurang 1 per router yang dilalui; paket di-drop dengan alasan eksplisit (No route, Time Exceeded, ARP timeout).</li>
                      <li><b>Switch MAC Learning:</b> CAM Table mencatat MAC sumber ke port ingress secara dinamis.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                      3. Konfigurasi Perangkat Dual-Mode
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>GUI Mode:</b> Formulir visual untuk mengubah IP, Subnet Mask, Gateway, dan status antarmuka — dengan validasi format IPv4/subnet.</li>
                      <li><b>Cisco CLI Mode:</b> Terminal konsol virtual mirip Cisco IOS dengan prompt bertingkat (<code>&gt;</code>, <code>#</code>, <code>(config)#</code>, <code>(config-if)#</code>) dan validasi IP ala IOS (<code>% Invalid IP address</code>).</li>
                      <li><b>Sinkronisasi Dua Arah:</b> Perubahan pada CLI otomatis langsung mengubah state GUI secara real-time, dan sebaliknya.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
                      4. Ekspor / Impor JSON & Pemeriksa Event
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li>Simpan seluruh desain topologi ke file lokal berekstensi <code>.json</code>.</li>
                      <li>Muat kembali topologi kapan saja untuk melanjutkan praktikum (penamaan perangkat baru otomatis tidak duplikat).</li>
                      <li>Panel inspeksi log event real-time yang membedakan paket INFO, ARP, ICMP, ERROR, dan SUCCESS.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">
                      5. Kontrol Simulasi & Animasi Paket
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>Kecepatan 0.5x / 1x / 2x</b> mengubah durasi animasi per hop paket di kabel.</li>
                      <li><b>Pause / Resume</b> saat simulasi berjalan — engine berhenti di antara hop, bukan membatalkan ping.</li>
                      <li>Animasi amplop PDU meluncur sepanjang kabel: <b>hijau = ARP</b>, <b>biru = ICMP</b>, dengan arah maju/mundur yang benar.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">
                      6. Kualitas yang Terukur (Quality Gates)
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>66 unit test</b> Vitest — coverage engine <b>&gt; 94% lines</b> (target skripsi &gt; 90%).</li>
                      <li><b>4 skenario E2E</b> Playwright: tambah perangkat, ping beranimasi, konfigurasi GUI, dan CLI — tanpa console error.</li>
                      <li><b>CI GitHub Actions</b> menjalankan type-check, coverage, build web, E2E, dan build installer Tauri di setiap push.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* 2. PORTING & DEPLOYMENT */}
            {activeSection === 'porting' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Download className="h-5 w-5 text-emerald-400" />
                  Panduan Build & Distribusi Aplikasi
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  OpenPacket dirancang dengan arsitektur <b>Monorepo Portabel</b>. Anda dapat menjalankan dan mem-porting aplikasi ini ke berbagai target runtime berikut:
                </p>

                {/* Target 0: Local Dev */}
                <div className="rounded-xl border border-gray-800 bg-[#1E293B]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wide">
                      Target 0: Menjalankan Lokal (Development & Testing)
                    </h4>
                    <span className="rounded bg-blue-950/70 px-2 py-0.5 text-[10px] text-blue-400 border border-blue-800">
                      Node.js 20/22 LTS
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3">
                    Prasyarat hanya Node.js dan npm — tidak ada dependensi native untuk mode web:
                  </p>
                  <pre className="rounded-lg bg-black/60 p-3 text-xs font-mono text-blue-300 border border-gray-800 overflow-x-auto">
{`git clone https://github.com/syihab-zuhri/cisco.git
cd cisco
npm install
npm run dev            # buka http://localhost:5173

# Verifikasi kualitas (opsional):
npm run type-check     # tsc strict, harus 0 error
npm test               # unit test (35 test)
npm run test:coverage  # unit test + coverage engine
npm run e2e            # E2E Playwright (butuh Microsoft Edge/chromium)`}
                  </pre>
                </div>

                {/* Target 1: Static Web */}
                <div className="rounded-xl border border-gray-800 bg-[#1E293B]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide">
                      Target 1: Web Statis (GitHub Pages, Cloudflare Pages, Vercel)
                    </h4>
                    <span className="rounded bg-emerald-950/70 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-800">
                      Zero Cost / Serverless
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3">
                    Karena OpenPacket murni beroperasi di client-side (Web Worker), seluruh aplikasi dapat di-bundle menjadi file HTML/JS/CSS murni (~139 KB gzip) tanpa perlu server backend Node.js atau database.
                  </p>
                  <pre className="rounded-lg bg-black/60 p-3 text-xs font-mono text-emerald-400 border border-gray-800 overflow-x-auto">
{`# 1. Kompilasi bundle produksi web statis
npm run build

# 2. Output tersedia di direktori: ./dist
# Folder ./dist dapat langsung diunggah ke Vercel, Netlify, atau Cloudflare Pages.`}
                  </pre>
                </div>

                {/* Target 2: Windows Native Desktop (.exe via Tauri) */}
                <div className="rounded-xl border border-gray-800 bg-[#1E293B]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wide">
                      Target 2: Desktop Executable Windows (.exe mandiri via Tauri v2)
                    </h4>
                    <span className="rounded bg-sky-950/70 px-2 py-0.5 text-[10px] text-sky-400 border border-sky-800">
                      Ukuran Sangat Ringan (~15 MB)
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3">
                    Dibandingkan Electron yang berukuran &gt;150 MB, Tauri v2 menggunakan native webview Windows (WebView2) yang menghasilkan installer sangat kecil dan konsumsi RAM sangat hemat (~30 MB). Ikon aplikasi untuk semua platform sudah tersedia di <code>src-tauri/icons/</code>, dan CI GitHub Actions (job <code>desktop</code>) membangun installer ini otomatis di setiap push.
                  </p>
                  <pre className="rounded-lg bg-black/60 p-3 text-xs font-mono text-sky-400 border border-gray-800 overflow-x-auto">
{`# Prasyarat di Windows: Rust toolchain (rustup) & C++ Build Tools
# 1. Jalankan development mode jendela desktop
npm run tauri dev

# 2. Build installer mandiri (.exe)
npm run tauri build

# Hasil installer tersimpan di:
# ./src-tauri/target/release/bundle/nsis/OpenPacket_1.0.0_x64-setup.exe`}
                  </pre>
                </div>

                {/* Target 3: Android APK (Capacitor Porting) */}
                <div className="rounded-xl border border-gray-800 bg-[#1E293B]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                      Target 3: Porting ke Mobile Android APK (via Capacitor)
                    </h4>
                    <span className="rounded bg-amber-950/70 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-800">
                      Opsional Tablet / Mobile
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3">
                    Aplikasi ini dapat dibungkus langsung ke Android WebView untuk pembelajaran di tablet menggunakan Capacitor:
                  </p>
                  <pre className="rounded-lg bg-black/60 p-3 text-xs font-mono text-amber-400 border border-gray-800 overflow-x-auto">
{`npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init OpenPacket com.openpacket.app --web-dir dist
npm run build
npx cap add android
npx cap open android`}
                  </pre>
                </div>
              </div>
            )}

            {/* 3. SIMULATION RFC */}
            {activeSection === 'simulation' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Play className="h-5 w-5 text-cyan-400" />
                  Logika Simulasi Protokol & Validitas Ilmiah (Skripsi)
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  OpenPacket mengimplementasikan aturan standar IEEE & RFC murni tanpa manipulasi output fiktif, menjadikannya valid untuk instrumen penelitian komparasi dengan Cisco Packet Tracer. Seluruh urutan paket di bawah ini juga dikunci oleh <b>unit test paritas otomatis</b>.
                </p>

                <div className="space-y-3 text-xs text-gray-300">
                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-cyan-300 mb-1">1. Alur Resolusi ARP (RFC 826)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Sebelum frame ICMP dikirimkan, host memeriksa ARP Cache miliknya. Jika kosong (cache MISS), host memancarkan frame broadcast <b>ARP Request</b> yang merambat sepanjang jalur Layer-2 melewati switch-switch. Hanya perangkat pemilik IP tujuan yang membalas dengan <b>ARP Reply unicast</b>. Setelah kedua belah pihak menyimpan pasangan IP-MAC, transmisi ping dilanjutkan. Pada ping berikutnya (warm cache) tidak ada paket ARP lagi — persis perilaku Packet Tracer.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-emerald-300 mb-1">2. Pemelajaran Alamat Switch (CAM Table)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Switch Layer 2 membaca frame ARP yang melintas dan mencatat pasangan <code>Source MAC - port ingress</code> ke CAM Table. Tabel ini dapat diperiksa kapan saja via perintah <code>show mac-address-table</code> dan tersinkron balik ke state aplikasi setiap simulasi selesai.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-amber-300 mb-1">3. Bitwise Subnet Masking (RFC 791)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Host memeriksa apakah IP tujuan berada di subnet yang sama menggunakan operasi logika:
                      <code className="block my-2 bg-black/50 p-2 rounded text-amber-300 font-mono text-center">
                        (IP_Dest &amp; Mask_Source) === (IP_Source &amp; Mask_Source)
                      </code>
                      Jika hasilnya <b>false</b>, host mewajibkan alamat Default Gateway yang valid pada interface-nya agar paket dapat diteruskan ke router — tanpa gateway, ping gagal dengan pesan eksplisit.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-sky-300 mb-1">4. Routing Lintas Subnet via Router (RFC 791/792)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Paket untuk subnet lain dikirim ke gateway, lalu router <b>benar-benar meneruskannya</b>: router mencari interface tujuan dengan <b>longest-prefix match</b> atas jaringan connected dan static route, melakukan ARP untuk hop berikutnya, dan mengirim ulang paket hingga sampai ke host tujuan. <b>TTL berkurang 1</b> di setiap router (mulai 128); reply yang tiba di host sumber menunjukkan TTL = 128 − jumlah router yang dilalui. Router dapat men-drop paket dengan alasan jelas: <i>No route</i> (tidak ada rute), <i>Time Exceeded</i> (TTL habis), dan <i>routing loop</i> terdeteksi.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-rose-300 mb-1">5. Determinisme & Paritas Packet Tracer</h4>
                    <p className="leading-relaxed text-gray-300">
                      Urutan paket selalu deterministik: <b>ARP Request → ARP Reply → ICMP Echo Request → ICMP Echo Reply</b>. Echo pertama dianimasikan penuh hop-per-hop; echo berikutnya memakai cache (cepat, tanpa animasi). Format output mengikuti Packet Tracer: dari PC/Toolbar memakai gaya Windows (<code>Reply from x.x.x.x: bytes=32 time&lt;1ms TTL=128</code>, 4 echo), dari terminal IOS memakai gaya Cisco (<code>!!!!! Success rate is 100 percent (5/5)</code>).
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-fuchsia-300 mb-1">6. Jaringan Nirkabel (Asosiasi SSID)</h4>
                    <p className="leading-relaxed text-gray-300">
                      PC & Laptop memiliki adapter wireless (<code>wla0</code>). Access Point mem-broadcast SSID lewat port <code>radio0</code> dan menjembatani lalu lintas nirkabel ↔ kabel seperti bridge L2 (dengan CAM learning). Asosiasi terbentuk otomatis saat SSID klien <b>sama persis</b> dengan SSID AP — cukup isi SSID di form konfigurasi dan simpan, atau tarik dari port WiFi ke radio AP. Satu radio AP melayani banyak klien (1-ke-N); setiap klien hanya boleh terasosiasi ke satu AP.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-sky-300 mb-1">7. Internet Cloud Tersimulasi (INV-008)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Perangkat <b>Cloud Internet</b> mewakili dunia luar secara 100% offline — tidak ada request jaringan sungguhan. Cloud " memiliki" IP publik <code>8.8.8.8</code> dan <code>1.1.1.1</code>: arahkan router ke cloud dengan <b>default route</b> <code>0.0.0.0/0</code> (bisa ditambahkan lewat form konfigurasi router, bagian Static Route), lalu ping ke IP publik tersebut akan dijawab dengan TTL & RTT deterministik (TTL = 128 − jumlah router − 1 hop WAN). Tanpa default route, ping publik gagal "No route" — persis perilaku router nyata.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-blue-300 mb-1">8. Simulation Mode, PDU Inspector & Table Viewer</h4>
                    <p className="leading-relaxed text-gray-300">
                      Seluruh aliran simulasi direncanakan lebih dulu sebagai <b>daftar event deterministik</b> (maks 500, sim clock per hop) lalu diputar: tombol <b>Step</b> memutar satu event per klik, tab <b>Simulasi</b> menampilkan timeline (event mendatang redup), dan <b>PDU Inspector</b> membongkar header berlapis <b>L2 Ethernet → L3 IPv4 → L4 ARP/ICMP/DHCP</b> per hop — MAC frame ditulis ulang di setiap hop, IP/TTL end-to-end. Tab <b>Tabel</b> menampilkan CAM/ARP/Routing/NAT perangkat terpilih secara live.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-amber-300 mb-1">9. DHCP, NAT/PAT, VLAN & RIPv2</h4>
                    <p className="leading-relaxed text-gray-300">
                      <b>DHCP</b>: router sebagai server (pool per interface); klien dengan opsi "Obtain IP via DHCP" menjalani Discover → Offer → Request → Ack beranimasi sampai IP/gateway terisi. <b>NAT/PAT</b>: aktifkan pada interface WAN router — src IP di-rewrite ke IP WAN saat menuju cloud, tabel translasi tercatat, dan dibalik kembali di jalur balik. <b>VLAN 802.1Q</b>: port switch access/trunk memisahkan broadcast domain; inter-VLAN lewat <b>router-on-a-stick</b> (sub-interface per VLAN). <b>RIPv2</b>: aktifkan di ≥2 router lalu "Jalankan Konvergensi RIP" — rute dipelajari secara deterministik dengan animasi update di timeline.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. CISCO CLI */}
            {activeSection === 'cli' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-green-400" />
                  Daftar Perintah Cisco IOS Terminal Virtual
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Terminal konsol bawaan OpenPacket mensimulasikan sintaks perintah Cisco IOS asli dengan mode bertingkat. Buka terminal dengan mengklik ikon terminal pada hover perangkat di kanvas. Sepuluh perintah di bawah ini adalah perintah P0 kanonik:
                </p>

                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1E293B] text-gray-300 border-b border-gray-800">
                      <tr>
                        <th className="p-2.5 font-bold">Mode Cisco</th>
                        <th className="p-2.5 font-bold">Perintah (alias)</th>
                        <th className="p-2.5 font-bold">Fungsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-black/40 font-mono">
                      <tr>
                        <td className="p-2.5 text-sky-400">User Mode (&gt;)</td>
                        <td className="p-2.5 text-green-400">enable</td>
                        <td className="p-2.5 text-gray-300 font-sans">Masuk ke Privileged EXEC mode</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">configure terminal (conf t)</td>
                        <td className="p-2.5 text-gray-300 font-sans">Masuk ke mode konfigurasi global</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">ping &lt;ip&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">ICMP echo 5 paket via engine penuh, output gaya Cisco (!!!!!)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show ip interface brief (sh ip int br)</td>
                        <td className="p-2.5 text-gray-300 font-sans">Melihat daftar status IP dan interface</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show ip route</td>
                        <td className="p-2.5 text-gray-300 font-sans">Melihat tabel routing (connected C + static S) pada router</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show mac-address-table / show arp</td>
                        <td className="p-2.5 text-gray-300 font-sans">Ekstensi: melihat CAM table switch dan cache ARP</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-400">Config ((config)#)</td>
                        <td className="p-2.5 text-green-400">hostname &lt;nama&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">Mengubah nama host perangkat secara live</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-400">Config ((config)#)</td>
                        <td className="p-2.5 text-green-400">interface &lt;id&gt; (int)</td>
                        <td className="p-2.5 text-gray-300 font-sans">Masuk ke konfigurasi port (contoh: int fa0/0)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-emerald-400">Config-if</td>
                        <td className="p-2.5 text-green-400">ip address &lt;IP&gt; &lt;SUBNET&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">Konfigurasi IPv4 &amp; subnet mask (divalidasi formatnya)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-emerald-400">Config-if</td>
                        <td className="p-2.5 text-green-400">no shutdown (no shut)</td>
                        <td className="p-2.5 text-gray-300 font-sans">Mengaktifkan port antarmuka (Link UP)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-emerald-400">Config-if</td>
                        <td className="p-2.5 text-green-400">shutdown (shut)</td>
                        <td className="p-2.5 text-gray-300 font-sans">Menonaktifkan port antarmuka (administratively down)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-gray-400">Semua Mode</td>
                        <td className="p-2.5 text-green-400">exit / end</td>
                        <td className="p-2.5 text-gray-300 font-sans">Navigasi antar tingkatan prompt (end langsung ke #)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800 text-xs text-gray-300">
                  <span className="font-bold text-green-400 block mb-1">Catatan ping & sinkronisasi:</span>
                  <code>ping</code> dari terminal dijalankan oleh simulation engine penuh (bukan output fiktif) — memancarkan ARP bila cache kosong, melewati router lintas subnet, dan menghasilkan statistik ala IOS: <code>Success rate is X percent (n/5), round-trip min/avg/max</code>. Sementara tombol <b>Send Ping</b> di Toolbar memakai format Windows 4 echo (<code>Reply from ... TTL=128</code>). Semua perubahan konfigurasi via CLI langsung tersinkron dengan form GUI dan sebaliknya.
                </div>
              </div>
            )}

            {/* 5. ARCHITECTURE */}
            {activeSection === 'architecture' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-purple-400" />
                  Arsitektur Sistem & Kebijakan Zero-Secret
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  OpenPacket dibangun mengutamakan keamanan dan portabilitas penuh dengan 8 aturan teknis invariabel (<code>INV-001</code> s.d. <code>INV-008</code>):
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-blue-400 block mb-1">Zero-Secret Policy:</span>
                    Aplikasi 100% tidak membutuhkan API key, database rahasia, atau kredensial. Seluruh source code aman di-push secara publik di GitHub.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-emerald-400 block mb-1">Zero DOM in Simulation (INV-001):</span>
                    Komputasi simulasi terisolasi di dalam Web Worker murni TypeScript tanpa menyentuh DOM, menjaga animasi canvas tetap fluid 60 FPS.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-amber-400 block mb-1">Clean-Room Implementation (INV-005):</span>
                    Tidak ada kode proprietary Cisco yang disalin. Logika murni ditulis dari standar publik IETF RFC.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-purple-400 block mb-1">100% Offline Capable (INV-008):</span>
                    Aplikasi dapat berjalan mandiri di ruang laboratorium tanpa memerlukan koneksi internet aktif.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-cyan-400 block mb-1">Typed IPC Contract (INV-002):</span>
                    Seluruh pesan UI ↔ Worker adalah tagged union bertipe ketat di <code>src/types/ipc.ts</code> — tidak ada objek ad-hoc antar thread.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-rose-400 block mb-1">Single State of Truth (INV-006):</span>
                    Satu store Zustand dipakai GUI, CLI, dan engine: konfigurasi via form maupun terminal selalu terbaca dua arah secara real-time.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
