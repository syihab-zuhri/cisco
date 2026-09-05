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

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentationModal({ isOpen, onClose }: DocsModalProps) {
  const [activeSection, setActiveSection] = useState<
    'features' | 'porting' | 'simulation' | 'cli' | 'architecture'
  >('features');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="flex h-[88vh] w-[92vw] max-w-5xl flex-col rounded-2xl border border-gray-700 bg-[#0F172A] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-800 bg-[#1E293B] px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600/20 p-2 border border-blue-500/40">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Dokumentasi Resmi & Panduan OpenPacket
              </h2>
              <p className="text-xs text-gray-400">
                Spesifikasi fitur, panduan porting multi-platform (Web/Desktop/Cloud), dan Cisco IOS syntax
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
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
              <span>Panduan Porting & Build</span>
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
                  OpenPacket adalah simulator jaringan komputer interaktif client-side yang dirancang sebagai alternatif ringan untuk media belajar praktikum jaringan komputer dan penelitian skripsi tanpa perlu menginstal aplikasi berat seperti Cisco Packet Tracer.
                </p>

                <div className="grid grid-cols-2 gap-3.5 pt-2">
                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2">
                      1. Manipulasi Topologi Interaktif
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li>Drag-and-drop perangkat: PC Host, Switch L2 (8 Port), dan Router L3 (3 Port).</li>
                      <li>Pengkabelan fisik otomatis dengan aturan ketat <b>Port Singularity (1 kabel per port)</b>.</li>
                      <li>Garis kabel berpendar neon dilengkapi label port interaktif di atas kabel.</li>
                      <li>Katalog template siap pakai untuk berbagai arsitektur topologi.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                      2. Simulasi Protokol Jaringan Riil
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>RFC 826 ARP:</b> Broadcast request resolusi MAC address dan unicast reply.</li>
                      <li><b>RFC 792 ICMP Ping:</b> Penghitungan RTT dan visualisasi alur paket echo request/reply.</li>
                      <li><b>Switch MAC Learning:</b> Switch secara dinamis mencatat port pengirim ke CAM Table.</li>
                      <li><b>Subnet Bitwise Matching:</b> Validasi otomatis komunikasi satu subnet vs gateway luar subnet.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                      3. Konfigurasi Perangkat Dual-Mode
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li><b>GUI Mode:</b> Formulir visual untuk mengubah IP, Subnet Mask, Gateway, dan status antarmuka.</li>
                      <li><b>Cisco CLI Mode:</b> Terminal konsol virtual mirip Cisco IOS dengan prompt bertingkat (<code>&gt;</code>, <code>#</code>, <code>(config)#</code>, <code>(config-if)#</code>).</li>
                      <li><b>Sinkronisasi Dua Arah:</b> Perubahan pada CLI otomatis langsung mengubah state GUI secara real-time.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4">
                    <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
                      4. Ekspor / Impor JSON & Pemeriksa Event
                    </h4>
                    <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside">
                      <li>Simpan seluruh desain topologi ke file lokal berekstensi <code>.json</code>.</li>
                      <li>Muat kembali topologi kapan saja untuk melanjutkan praktikum.</li>
                      <li>Panel inspeksi log event real-time yang membedakan paket INFO, ARP, ICMP, dan ERROR.</li>
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
                  Panduan Porting & Distribusi Aplikasi
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  OpenPacket dirancang dengan arsitektur <b>Monorepo Portabel</b>. Anda dapat melakukan porting dan hosting aplikasi ini ke berbagai target runtime berikut:
                </p>

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
                    Karena OpenPacket murni beroperasi di client-side (Web Worker), seluruh aplikasi dapat di-bundle menjadi file HTML/JS/CSS murni tanpa perlu server backend Node.js atau database.
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
                    Dibandingkan Electron yang berukuran &gt;150 MB, Tauri v2 menggunakan native webview Windows (WebView2) yang menghasilkan installer sangat kecil dan konsumsi RAM sangat hemat (~30 MB).
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
                  OpenPacket mengimplementasikan aturan standar IEEE & RFC murni tanpa manipulasi output fiktif, menjadikannya valid untuk instrumen penelitian komparasi dengan Cisco Packet Tracer:
                </p>

                <div className="space-y-3 text-xs text-gray-300">
                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-cyan-300 mb-1">1. Alur Resolusi ARP (RFC 826)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Sebelum frame ICMP dikirimkan, host memeriksa tabel ARP Cache miliknya. Jika kosong (ARP Miss), host menahan paket dan memancarkan frame broadcast ARP Request ke Switch. Switch menyebarkan (flooding) frame ke seluruh port. Node yang memiliki IP tujuan akan membalas dengan ARP Reply unicast. Setelah kedua belah pihak menyimpan pasangan IP-MAC ke dalam cache, transmisi ping baru dilanjutkan.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-emerald-300 mb-1">2. Pemelajaran Alamat Switch MAC (CAM Table Learning)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Switch layer 2 membaca frame masuk, mencatat <code>Source MAC</code> dan nomor port masuk ke memori CAM Table. Saat paket balasan datang, switch tidak lagi melakukan broadcast flooding melainkan langsung meneruskannya secara direct unicast ke port yang tercatat.
                    </p>
                  </div>

                  <div className="rounded-lg bg-[#1E293B] p-3.5 border border-gray-800">
                    <h4 className="font-bold text-amber-300 mb-1">3. Bitwise Subnet Masking (RFC 791)</h4>
                    <p className="leading-relaxed text-gray-300">
                      Host memeriksa apakah IP tujuan berada di subnet yang sama menggunakan operasi logika:
                      <code className="block my-2 bg-black/50 p-2 rounded text-amber-300 font-mono text-center">
                        (IP_Dest & Mask_Source) === (IP_Source & Mask_Source)
                      </code>
                      Jika hasilnya <b>false</b>, host mewajibkan alamat Default Gateway yang valid pada interface-nya agar paket dapat diteruskan ke router.
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
                  Terminal konsol bawaan OpenPacket mensimulasikan sintaks perintah Cisco IOS asli dengan mode bertingkat. Buka terminal dengan mengklik icon terminal hijau pada toolbar perangkat:
                </p>

                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1E293B] text-gray-300 border-b border-gray-800">
                      <tr>
                        <th className="p-2.5 font-bold">Mode Cisco</th>
                        <th className="p-2.5 font-bold">Perintah</th>
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
                        <td className="p-2.5 text-green-400">configure terminal / conf t</td>
                        <td className="p-2.5 text-gray-300 font-sans">Masuk ke mode konfigurasi global</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show ip interface brief</td>
                        <td className="p-2.5 text-gray-300 font-sans">Melihat daftar status IP dan interface</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show mac-address-table</td>
                        <td className="p-2.5 text-gray-300 font-sans">Melihat entri CAM table dinamis switch</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-amber-400">Privileged (#)</td>
                        <td className="p-2.5 text-green-400">show arp</td>
                        <td className="p-2.5 text-gray-300 font-sans">Melihat cache tabel resolusi ARP</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-400">Config ((config)#)</td>
                        <td className="p-2.5 text-green-400">hostname &lt;nama&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">Mengubah nama host perangkat secara live</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-purple-400">Config ((config)#)</td>
                        <td className="p-2.5 text-green-400">interface &lt;id_port&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">Masuk ke konfigurasi port (contoh: int fa0/0)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-emerald-400">Config-if</td>
                        <td className="p-2.5 text-green-400">ip address &lt;IP&gt; &lt;SUBNET&gt;</td>
                        <td className="p-2.5 text-gray-300 font-sans">Konfigurasi alamat IPv4 &amp; subnet mask</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-emerald-400">Config-if</td>
                        <td className="p-2.5 text-green-400">no shutdown</td>
                        <td className="p-2.5 text-gray-300 font-sans">Mengaktifkan port antarmuka (Link UP)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-gray-400">Semua Mode</td>
                        <td className="p-2.5 text-green-400">exit / end</td>
                        <td className="p-2.5 text-gray-300 font-sans">Kembali ke tingkatan prompt sebelumnya</td>
                      </tr>
                    </tbody>
                  </table>
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
                    <span className="font-bold text-emerald-400 block mb-1">Zero DOM in Simulation:</span>
                    Komputasi simulasi terisolasi di dalam Web Worker murni TypeScript tanpa menyentuh DOM, menjaga animasi canvas tetap fluid 60 FPS.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-amber-400 block mb-1">Clean-Room Implementation:</span>
                    Tidak ada kode proprietary Cisco yang disalin. Logika murni ditulis dari standar publik IETF RFC.
                  </div>
                  <div className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                    <span className="font-bold text-purple-400 block mb-1">100% Offline Capable:</span>
                    Aplikasi dapat berjalan mandiri di ruang laboratorium tanpa memerlukan koneksi internet aktif.
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
