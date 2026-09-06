import { useMemo, useState } from 'react';
import {
  BookOpen,
  X,
  Layers,
  Terminal,
  Play,
  Cpu,
  Download,
  Wifi,
  Cloud,
  Search,
  Route,
  Server,
  Network,
  Monitor,
  Cable,
  Laptop,
  Router,
  ChevronDown,
  Sparkles,
  GraduationCap,
  ScanLine,
  Globe,
  ShieldCheck,
  Zap,
  Square,
} from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SectionId =
  | 'home'
  | 'devices'
  | 'protocols'
  | 'simmode'
  | 'cli'
  | 'build'
  | 'architecture';

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: SectionId; label: string; icon: React.ReactNode }> }> = [
  {
    group: 'Mulai',
    items: [
      { id: 'home', label: 'Beranda', icon: <Sparkles className="h-4 w-4 text-blue-400" /> },
      { id: 'devices', label: 'Perangkat & Kanvas', icon: <Layers className="h-4 w-4 text-sky-400" /> },
    ],
  },
  {
    group: 'Simulasi',
    items: [
      { id: 'protocols', label: 'Mesin Protokol (RFC)', icon: <Play className="h-4 w-4 text-cyan-400" /> },
      { id: 'simmode', label: 'Simulation Mode & PDU', icon: <ScanLine className="h-4 w-4 text-violet-400" /> },
      { id: 'cli', label: 'Terminal Cisco IOS', icon: <Terminal className="h-4 w-4 text-green-400" /> },
    ],
  },
  {
    group: 'Lanjutan',
    items: [
      { id: 'build', label: 'Build & Porting', icon: <Download className="h-4 w-4 text-emerald-400" /> },
      { id: 'architecture', label: 'Arsitektur & Keamanan', icon: <Cpu className="h-4 w-4 text-purple-400" /> },
    ],
  },
];

const SEARCH_INDEX: Array<{ section: SectionId; label: string; keywords: string; accordion?: string }> = [
  { section: 'home', label: 'Beranda — mulai 3 langkah', keywords: 'beranda quick start cepat mulai ping template' },
  { section: 'devices', label: 'PC / Laptop / Server', keywords: 'end device host klien' },
  { section: 'devices', label: 'Switch / Hub / Access Point', keywords: 'l2 cam repeater wifi ssid' },
  { section: 'devices', label: 'Router & Cloud Internet', keywords: 'router l3 gateway cloud 8.8.8.8 wan' },
  { section: 'devices', label: 'Aturan kabel & asosiasi WiFi', keywords: 'port singularity kabel 1-to-1 radio nirkabel ssid vlan' },
  { section: 'protocols', label: 'ARP (RFC 826)', keywords: 'arp broadcast mac cache rfc 826', accordion: 'arp' },
  { section: 'protocols', label: 'CAM Table Switch', keywords: 'cam mac learning switch', accordion: 'cam' },
  { section: 'protocols', label: 'Subnetting bitwise (RFC 791)', keywords: 'subnet mask bitwise gateway rfc 791', accordion: 'subnet' },
  { section: 'protocols', label: 'Routing antar subnet & TTL', keywords: 'routing router ttl longest prefix static', accordion: 'routing' },
  { section: 'protocols', label: 'Cloud Internet tersimulasi', keywords: 'cloud internet 8.8.8.8 publik offline', accordion: 'cloud' },
  { section: 'protocols', label: 'Nirkabel / WiFi (SSID)', keywords: 'wifi wireless ap ssid asosiasi', accordion: 'wifi' },
  { section: 'protocols', label: 'DHCP (DORA)', keywords: 'dhcp dora discover offer request ack pool', accordion: 'dhcp' },
  { section: 'protocols', label: 'NAT/PAT', keywords: 'nat pat translate wan translasi', accordion: 'nat' },
  { section: 'protocols', label: 'VLAN 802.1Q & RIPv2', keywords: 'vlan trunk router on a stick rip konvergensi', accordion: 'vlan-rip' },
  { section: 'simmode', label: 'Step Mode & Timeline', keywords: 'step mode timeline event simulasi jeda' },
  { section: 'simmode', label: 'PDU Inspector', keywords: 'pdu inspector header l2 l3 l4 ethernet ipv4' },
  { section: 'simmode', label: 'Table Viewer (CAM/ARP/Routing/NAT)', keywords: 'tabel viewer cam arp routing nat' },
  { section: 'cli', label: '10 perintah P0 + alias', keywords: 'cli perintah ios enable configure ping show' },
  { section: 'build', label: 'Menjalankan lokal', keywords: 'dev lokal npm install' },
  { section: 'build', label: 'Web statis / Vercel / Pages', keywords: 'web statis vercel netlify pages' },
  { section: 'build', label: 'Desktop Windows (.exe Tauri)', keywords: 'tauri desktop exe installer windows' },
  { section: 'build', label: 'Android (Capacitor)', keywords: 'android capacitor apk mobile' },
  { section: 'architecture', label: 'Invariants INV-001..008', keywords: 'inv invariants keamanan offline clean room' },
  { section: 'architecture', label: 'Quality gates (test & CI)', keywords: 'test coverage ci github actions kualitas' },
];

const PROTOCOL_ITEMS: Array<{ id: string; title: string; tag: string; body: React.ReactNode }> = [
  {
    id: 'arp',
    title: '1. Resolusi ARP',
    tag: 'RFC 826',
    body: (
      <>
        Sebelum ICMP dikirim, host memeriksa ARP Cache-nya. Jika <b>MISS</b>, ia memancarkan frame broadcast <b>ARP Request</b> (MAC tujuan <code>FF:FF:FF:FF:FF:FF</code>) yang merambat sepanjang jalur Layer-2. Hanya pemilik IP yang membalas <b>ARP Reply unicast</b>, lalu kedua sisi menyimpan pasangan IP-MAC. Ping berikutnya <b>warm cache</b> — tanpa ARP lagi, persis Packet Tracer.
      </>
    ),
  },
  {
    id: 'cam',
    title: '2. CAM Table Switch & AP',
    tag: 'L2 Learning',
    body: (
      <>
        Switch dan Access Point membaca frame ARP yang melintas dan mencatat pasangan <code>Source MAC → port ingress</code>. Hub adalah pengecualian: ia repeater murni dan <b>tidak pernah belajar</b>. Isi tabel bisa dilihat lewat <code>show mac-address-table</code> atau tab <b>Tabel</b> di panel bawah.
      </>
    ),
  },
  {
    id: 'subnet',
    title: '3. Subnetting Bitwise',
    tag: 'RFC 791',
    body: (
      <>
        Host memutuskan lokal vs luar subnet dengan operasi:
        <code className="block my-2 bg-black/50 p-2 rounded text-amber-300 font-mono text-center">
          (IP_Dest &amp; Mask) === (IP_Src &amp; Mask)
        </code>
        Jika <b>false</b>, paket wajib diarahkan ke Default Gateway — tanpa gateway, ping gagal dengan pesan eksplisit.
      </>
    ),
  },
  {
    id: 'routing',
    title: '4. Routing Antar Subnet & TTL',
    tag: 'Longest Prefix',
    body: (
      <>
        Router memilih interface tujuan dengan <b>longest-prefix match</b> atas jaringan connected + static route (termasuk default route <code>0.0.0.0/0</code>), lalu benar-benar meneruskan paket ke host tujuan. <b>TTL berkurang 1 di setiap router</b> (mulai 128) — reply yang tiba menunjukkan <code>128 − jumlah router</code>. Tanpa rute → <i>No route</i>; TTL habis → <i>Time Exceeded</i>; loop antar router terdeteksi otomatis.
      </>
    ),
  },
  {
    id: 'cloud',
    title: '5. Cloud Internet Tersimulasi',
    tag: 'INV-008 · Offline',
    body: (
      <>
        Perangkat <b>Cloud</b> mewakili dunia luar tanpa satu pun request jaringan nyata. Ia "memiliki" IP publik <code>8.8.8.8</code> dan <code>1.1.1.1</code> — ping ke IP publik dijawab deterministik (TTL = 128 − router − 1 hop WAN). IP publik lain ditolak dengan pesan jelas.
      </>
    ),
  },
  {
    id: 'wifi',
    title: '6. Nirkabel (Asosiasi SSID)',
    tag: '802.11-style',
    body: (
      <>
        PC & Laptop punya adapter <code>wla0</code>; Access Point mem-broadcast SSID lewat <code>radio0</code> dan menjembatani WiFi ↔ kabel sebagai bridge L2. Asosiasi terbentuk otomatis saat SSID klien <b>sama persis</b> dengan AP (atau drag dari port WiFi ke radio). Satu radio melayani banyak klien; tiap klien hanya satu AP.
      </>
    ),
  },
  {
    id: 'dhcp',
    title: '7. DHCP',
    tag: 'DORA · UDP 67/68',
    body: (
      <>
        Router sebagai DHCP server (pool per interface di form konfigurasi). Klien dengan opsi <b>"Obtain IP via DHCP"</b> menjalani <b>Discover → Offer → Request → Ack</b> beranimasi; alokasi deterministik melewati IP terpakai. Lease mengisi IP, mask, dan gateway otomatis — lihat paketnya di PDU Inspector (segmen DHCP).
      </>
    ),
  },
  {
    id: 'nat',
    title: '8. NAT/PAT',
    tag: 'WAN → Cloud',
    body: (
      <>
        Aktifkan NAT pada interface WAN router. Ping menuju IP publik akan <b>me-rewrite src IP ke IP WAN</b> (terlihat di PDU Inspector), mencatat <b>tabel translasi</b>, dan membaliknya kembali di jalur balik. Tabel NAT tampil di tab <b>Tabel</b> saat router dipilih.
      </>
    ),
  },
  {
    id: 'vlan-rip',
    title: '9. VLAN 802.1Q & RIPv2',
    tag: 'Enterprise',
    body: (
      <>
        <b>VLAN</b>: port switch <code>access</code> hanya bicara dengan port se-VLAN; port <code>trunk</code> membawa semua VLAN. Inter-VLAN lewat <b>router-on-a-stick</b> (sub-interface per VLAN di port trunk router) — frame ter-tag terlihat di PDU. <b>RIPv2</b>: aktifkan di ≥ 2 router lalu tekan "Jalankan Konvergensi RIP" — rute dipelajari deterministik (metric = hop) dengan animasi update di timeline.
      </>
    ),
  },
];

const DEVICE_ROWS: Array<{ icon: React.ReactNode; name: string; ports: string; role: string }> = [
  { icon: <Monitor className="h-3.5 w-3.5 text-sky-400" />, name: 'PC', ports: '1 FE + WiFi', role: 'End device — sumber/tujuan ping' },
  { icon: <Laptop className="h-3.5 w-3.5 text-cyan-400" />, name: 'Laptop', ports: '1 FE + WiFi', role: 'End device — bisa pindah ke WiFi' },
  { icon: <Server className="h-3.5 w-3.5 text-violet-400" />, name: 'Server', ports: '1 FE', role: 'End device kabel (file/web server)' },
  { icon: <Network className="h-3.5 w-3.5 text-emerald-400" />, name: 'Switch L2', ports: '8 FE', role: 'CAM learning, VLAN access/trunk' },
  { icon: <Cable className="h-3.5 w-3.5 text-orange-400" />, name: 'Hub', ports: '8 FE', role: 'Repeater murni — tanpa CAM' },
  { icon: <Wifi className="h-3.5 w-3.5 text-fuchsia-400" />, name: 'Access Point', ports: 'Radio + 1 FE', role: 'Bridge WiFi ↔ kabel (SSID)' },
  { icon: <Router className="h-3.5 w-3.5 text-amber-400" />, name: 'Router L3', ports: '3 FE', role: 'Routing, DHCP server, NAT, sub-interface' },
  { icon: <Cloud className="h-3.5 w-3.5 text-sky-300" />, name: 'Cloud Internet', ports: '2 WAN', role: 'IP publik 8.8.8.8 / 1.1.1.1 tersimulasi' },
];

const CLI_ROWS: Array<{ mode: string; modeColor: string; cmd: string; desc: string }> = [
  { mode: 'User (>)', modeColor: 'text-sky-400', cmd: 'enable', desc: 'Masuk privileged EXEC' },
  { mode: 'Privileged (#)', modeColor: 'text-amber-400', cmd: 'configure terminal (conf t)', desc: 'Global configuration mode' },
  { mode: 'Privileged (#)', modeColor: 'text-amber-400', cmd: 'ping <ip>', desc: 'ICMP 5 echo via engine penuh — output gaya Cisco (!!!!!)' },
  { mode: 'Privileged (#)', modeColor: 'text-amber-400', cmd: 'show ip interface brief (sh ip int br)', desc: 'Status ringkas semua interface' },
  { mode: 'Privileged (#)', modeColor: 'text-amber-400', cmd: 'show ip route', desc: 'Tabel routing (C connected, S static, R rip)' },
  { mode: 'Privileged (#)', modeColor: 'text-amber-400', cmd: 'show mac-address-table · show arp', desc: 'Ekstensi: CAM table & cache ARP' },
  { mode: 'Config (config)#', modeColor: 'text-purple-400', cmd: 'hostname <nama>', desc: 'Ubah hostname (tersinkron ke GUI)' },
  { mode: 'Config (config)#', modeColor: 'text-purple-400', cmd: 'interface <id> (int)', desc: 'Masuk konfigurasi port, contoh: int fa0/0' },
  { mode: 'Config-if', modeColor: 'text-emerald-400', cmd: 'ip address <ip> <mask>', desc: 'IPv4 + mask (divalidasi ala IOS)' },
  { mode: 'Config-if', modeColor: 'text-emerald-400', cmd: 'no shutdown (no shut) · shutdown', desc: 'Naikkan / turunkan interface' },
  { mode: 'Semua mode', modeColor: 'text-gray-400', cmd: 'exit / end', desc: 'Navigasi antar mode (end → langsung #)' },
];

const TEMPLATE_NAMES = [
  'P2P', 'Star', 'Bus', 'Ring', 'Daisy Chain', 'Lab Hub',
  'Kantor Server+Laptop', 'Hotspot Rumah+Internet', 'Kantor Nirkabel',
  'Dual LAN Routed', 'Dual Router WAN', 'Dual Router RIP',
  'Tree Hierarkis', 'Mesh Jala', 'Kantor 2 VLAN', 'Hybrid Campuran',
];

function CodeBlock({ children, color = 'text-blue-300' }: { children: string; color?: string }) {
  return (
    <pre className={`rounded-lg bg-black/60 p-3 text-xs font-mono ${color} border border-gray-800 overflow-x-auto leading-relaxed`}>
      {children}
    </pre>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4 ${className}`}>{children}</div>;
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">{icon}{title}</h3>
      <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

function Accordion({
  items,
  openId,
  onToggle,
}: {
  items: Array<{ id: string; title: string; tag: string; body: React.ReactNode }>;
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div
            key={item.id}
            className={`rounded-lg border bg-[#1E293B] transition-colors ${open ? 'border-blue-600/60' : 'border-gray-800'}`}
          >
            <button onClick={() => onToggle(item.id)} className="w-full flex items-center justify-between gap-2 p-3.5 text-left">
              <span className="text-xs font-bold text-gray-100">{item.title}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-400 border border-gray-700">
                  {item.tag}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {open && <div className="px-3.5 pb-3.5 text-xs text-gray-300 leading-relaxed">{item.body}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function DocumentationModal({ isOpen, onClose }: DocsModalProps) {
  const dialogRef = useModalA11y({ onClose, enabled: isOpen });
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [query, setQuery] = useState<string>('');
  const [openProto, setOpenProto] = useState<string | null>('arp');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return SEARCH_INDEX.filter(
      (entry) => entry.label.toLowerCase().includes(q) || entry.keywords.toLowerCase().includes(q)
    );
  }, [query]);

  const goTo = (section: SectionId, accordion?: string) => {
    setActiveSection(section);
    if (section === 'protocols' && accordion) setOpenProto(accordion);
    setQuery('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pusat Bantuan OpenPacket"
        className="flex h-[88vh] w-[92vw] max-w-5xl flex-col rounded-2xl border border-gray-700 bg-[#0F172A] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-800 bg-[#1E293B] px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-600/20 p-2 border border-blue-500/40">
              <BookOpen className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Pusat Bantuan OpenPacket</h2>
              <p className="text-xs text-gray-400">Referensi fitur, protokol, dan panduan build — v1.4.0</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <nav className="flex w-64 shrink-0 flex-col border-r border-gray-800 bg-[#0B132B]">
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari topik…"
                  className="w-full rounded-lg bg-black/40 border border-gray-800 pl-8 pr-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {results ? (
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
                <div className="text-[10px] font-bold uppercase text-gray-500 px-1 mb-1">{results.length} hasil</div>
                {results.length === 0 && (
                  <div className="text-xs text-gray-600 italic px-1">Tidak ada topik cocok.</div>
                )}
                {results.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(entry.section, entry.accordion)}
                    className="w-full text-left rounded-lg px-3 py-2 text-xs text-gray-300 hover:bg-gray-800/60 hover:text-white"
                  >
                    {entry.label}
                    <span className="block text-[10px] text-gray-600">
                      {NAV_GROUPS.flatMap((g) => g.items).find((it) => it.id === entry.section)?.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {NAV_GROUPS.map((group) => (
                  <div key={group.group} className="mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-600 px-2 mb-1">
                      {group.group}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-left transition-all ${
                            activeSection === item.id
                              ? 'bg-blue-600 text-white font-bold shadow-md'
                              : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                          }`}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-gray-800 p-3">
              <div className="rounded-lg bg-blue-950/40 border border-blue-900/60 p-2.5">
                <div className="text-[10px] font-bold text-blue-300 mb-0.5">Butuh tantangan?</div>
                <div className="text-[10px] text-gray-400 leading-relaxed">
                  Coba <b>Mode Lab</b> di toolbar — misi berpandu dengan verifikasi otomatis.
                </div>
              </div>
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 text-gray-200">
            {/* ============ BERANDA ============ */}
            {activeSection === 'home' && (
              <div className="space-y-5">
                <SectionTitle
                  icon={<Sparkles className="h-5 w-5 text-blue-400" />}
                  title="Mulai di Sini"
                  subtitle="Tiga langkah dari kanvas kosong menjadi jaringan yang berfungsi."
                />
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { n: '1', title: 'Bangun topologi', body: 'Klik perangkat di palet, atau buka tab Template dan terapkan topologi siap pakai (16 katalog, 5 grup).' },
                    { n: '2', title: 'Konfigurasi', body: 'Klik perangkat → ikon gear untuk form GUI, atau ikon terminal untuk CLI Cisco IOS. Keduanya tersinkron dua arah.' },
                    { n: '3', title: 'Simulasikan', body: 'Kirim ping dari Toolbar, amati animasi paket, telusuri event di timeline, bongkar headernya di PDU Inspector.' },
                  ].map((s) => (
                    <Card key={s.n}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{s.n}</span>
                        <span className="text-xs font-bold text-gray-100">{s.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{s.body}</p>
                    </Card>
                  ))}
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Yang bisa kamu lakukan
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: <Layers className="h-3.5 w-3.5" />, text: '8 jenis perangkat + 16 template topologi' },
                      { icon: <Zap className="h-3.5 w-3.5" />, text: 'ARP/ICMP deterministik + warm cache' },
                      { icon: <Cloud className="h-3.5 w-3.5" />, text: 'Cloud Internet: ping 8.8.8.8 (100% offline)' },
                      { icon: <Server className="h-3.5 w-3.5" />, text: 'DHCP otomatis (DORA) oleh router' },
                      { icon: <Globe className="h-3.5 w-3.5" />, text: 'NAT/PAT dengan tabel translasi' },
                      { icon: <Route className="h-3.5 w-3.5" />, text: 'VLAN 802.1Q + inter-VLAN + RIPv2' },
                      { icon: <Wifi className="h-3.5 w-3.5" />, text: 'Nirkabel via SSID (AP + adapter WiFi)' },
                      { icon: <ScanLine className="h-3.5 w-3.5" />, text: 'Step Mode, timeline & PDU Inspector' },
                      { icon: <Square className="h-3.5 w-3.5" />, text: 'Anotasi: square & teks custom di belakang perangkat' },
                    ].map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-300">
                        <span className="text-blue-400">{f.icon}</span>
                        {f.text}
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="border-amber-800/50 bg-amber-950/20">
                  <div className="flex items-center gap-2 mb-1.5">
                    <GraduationCap className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-200">Cara tercepat belajar: Mode Lab</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Klik tombol <b>Lab</b> di toolbar — misi berpandu dengan topologi terkunci,
                    petunjuk bertahap, dan verifikasi otomatis. Tiga lab tersedia: perbaiki gateway,
                    nyalakan internet dengan NAT, dan hubungkan dua VLAN.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ PERANGKAT & KANVAS ============ */}
            {activeSection === 'devices' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<Layers className="h-5 w-5 text-sky-400" />}
                  title="Perangkat & Kanvas"
                  subtitle="Referensi 8 jenis perangkat dan aturan penyambungannya."
                />

                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1E293B] text-gray-300 border-b border-gray-800">
                      <tr>
                        <th className="p-2.5 font-bold">Perangkat</th>
                        <th className="p-2.5 font-bold">Port</th>
                        <th className="p-2.5 font-bold">Peran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-black/40">
                      {DEVICE_ROWS.map((d) => (
                        <tr key={d.name} className="hover:bg-gray-900/40">
                          <td className="p-2.5">
                            <span className="flex items-center gap-2 font-semibold text-gray-100">
                              {d.icon}
                              {d.name}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-gray-400">{d.ports}</td>
                          <td className="p-2.5 text-gray-300">{d.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Card>
                  <div className="text-xs font-bold text-gray-100 mb-2">Aturan penyambungan</div>
                  <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li><b>Port Singularity</b>: satu port ethernet hanya satu kabel; melepas kabel menurunkan kedua port ke DOWN.</li>
                    <li><b>Radio WiFi 1-ke-N</b>: satu radio AP melayani banyak klien; tiap klien hanya satu AP (SSID harus sama persis).</li>
                    <li><b>Drag-to-connect</b>: tarik dari titik port ke port tujuan — kabel ethernet atau asosiasi WiFi terdeteksi otomatis.</li>
                    <li><b>VLAN</b>: port switch access hanya bicara dengan port se-VLAN; trunk membawa semuanya.</li>
                  </ul>
                </Card>

                <Card>
                  <div className="text-xs font-bold text-gray-100 mb-2">Anotasi kanvas (square & teks)</div>
                  <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside leading-relaxed">
                    <li>Tombol <b>Square</b> &amp; <b>Teks</b> di palet (bagian Anotasi) → muncul di tengah layar, digeser bebas.</li>
                    <li><b>Square</b> berada di belakang perangkat (untuk menandai area): klik → pilih warna, tarik handle kanan-bawah untuk resize.</li>
                    <li><b>Teks</b>: dobel-klik untuk mengedit isi; saat dipilih, atur ukuran font lewat tombol −/+.</li>
                    <li>Keduanya ikut tersimpan &amp; dimuat di file JSON topologi.</li>
                  </ul>
                </Card>

                <Card>
                  <div className="text-xs font-bold text-gray-100 mb-2">16 Template siap pakai (5 grup)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_NAMES.map((t) => (
                      <span key={t} className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 text-[10px] text-gray-300">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    Buka tab <b>Template</b> di palet kiri → tekan <b>Terapkan</b>. Beberapa template
                    sudah terkonfigurasi penuh (IP, route, SSID) dan bisa langsung di-ping.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ MESIN PROTOKOL ============ */}
            {activeSection === 'protocols' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<Play className="h-5 w-5 text-cyan-400" />}
                  title="Mesin Protokol (RFC)"
                  subtitle="Klik topik untuk membuka penjelasan — semua alur dikunci unit test deterministik."
                />
                <Accordion
                  items={PROTOCOL_ITEMS}
                  openId={openProto}
                  onToggle={(id) => setOpenProto(openProto === id ? null : id)}
                />
              </div>
            )}

            {/* ============ SIMULATION MODE & PDU ============ */}
            {activeSection === 'simmode' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<ScanLine className="h-5 w-5 text-violet-400" />}
                  title="Simulation Mode & PDU Inspector"
                  subtitle="Alat inspeksi ala Packet Tracer — aliran simulasi direncanakan sebagai event deterministik."
                />
                <div className="space-y-3">
                  <Card>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Play className="h-4 w-4 text-violet-400" />
                      <span className="text-xs font-bold text-gray-100">Step Mode & Timeline</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Tekan <b>Step</b> di toolbar lalu kirim ping: seluruh aliran direncanakan lebih
                      dulu dan tampil di tab <b>Simulasi</b> (panel bawah) — event mendatang tampil
                      redup. Tombol <b>Next</b> memutar tepat satu event per klik; kecepatan 0.5x–2x
                      mengatur animasi saat tidak stepping.
                    </p>
                  </Card>
                  <Card>
                    <div className="flex items-center gap-2 mb-1.5">
                      <ScanLine className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs font-bold text-gray-100">PDU Inspector (drawer kanan)</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Klik event mana pun di timeline untuk membongkar header berlapisnya:
                      <span className="block mt-2 space-y-1">
                        <span className="flex items-center gap-2 text-emerald-300"><b className="w-8">L2</b> Ethernet Frame — src/dst MAC (ditulis ulang per hop!), ethertype</span>
                        <span className="flex items-center gap-2 text-violet-300"><b className="w-8">L3</b> IPv4 Packet — src/dst IP end-to-end, TTL menurun di router</span>
                        <span className="flex items-center gap-2 text-cyan-300"><b className="w-8">L4</b> ARP / ICMP / DHCP — opcode, type, sequence, yiaddr</span>
                      </span>
                      Mode <b>auto-follow</b> (ikon pin) mengikuti paket yang sedang berjalan.
                    </p>
                  </Card>
                  <Card>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Layers className="h-4 w-4 text-sky-400" />
                      <span className="text-xs font-bold text-gray-100">Table Viewer (tab Tabel)</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Pilih perangkat di kanvas, buka tab <b>Tabel</b>: CAM Table (switch/AP),
                      ARP Cache (host), Routing (router, lengkap metric/sumber RIP), dan NAT
                      Translations — semuanya update live mengikuti playback simulasi.
                    </p>
                  </Card>
                </div>
              </div>
            )}

            {/* ============ TERMINAL IOS ============ */}
            {activeSection === 'cli' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<Terminal className="h-5 w-5 text-green-400" />}
                  title="Terminal Cisco IOS"
                  subtitle="Klik ikon terminal pada hover perangkat. Sepuluh perintah P0 kanonik + alias."
                />
                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1E293B] text-gray-300 border-b border-gray-800">
                      <tr>
                        <th className="p-2.5 font-bold w-36">Mode</th>
                        <th className="p-2.5 font-bold">Perintah (alias)</th>
                        <th className="p-2.5 font-bold">Fungsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-black/40 font-mono">
                      {CLI_ROWS.map((row) => (
                        <tr key={row.cmd} className="hover:bg-gray-900/40">
                          <td className={`p-2.5 ${row.modeColor}`}>{row.mode}</td>
                          <td className="p-2.5 text-green-400">{row.cmd}</td>
                          <td className="p-2.5 text-gray-300 font-sans">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Card className="border-green-800/50 bg-green-950/20">
                  <span className="font-bold text-green-300 text-xs block mb-1">Format output ping</span>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Dari terminal IOS: gaya Cisco — <code>!!!!! Success rate is 100 percent (5/5)</code>.
                    Dari Toolbar (PC): gaya Windows — <code>Reply from x.x.x.x: bytes=32 time&lt;1ms TTL=128</code>.
                    Keduanya dijalankan engine penuh, bukan teks fiktif.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ BUILD & PORTING ============ */}
            {activeSection === 'build' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<Download className="h-5 w-5 text-emerald-400" />}
                  title="Build & Porting"
                  subtitle="Dari mode development sampai installer Windows — semuanya client-side."
                />
                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wide">Menjalankan Lokal</h4>
                    <span className="rounded bg-blue-950/70 px-2 py-0.5 text-[10px] text-blue-400 border border-blue-800">Node 20/22</span>
                  </div>
                  <CodeBlock>{`git clone https://github.com/syihab-zuhri/cisco.git
cd cisco && npm install
npm run dev          # http://localhost:5173

npm run type-check   # tsc strict, 0 error
npm test             # unit test (70)
npm run e2e          # E2E Playwright (Edge/Chromium)`}</CodeBlock>
                </Card>
                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wide">Web Statis (Vercel / Pages)</h4>
                    <span className="rounded bg-emerald-950/70 px-2 py-0.5 text-[10px] text-emerald-400 border border-emerald-800">~139 KB gzip</span>
                  </div>
                  <CodeBlock color="text-emerald-400">{`npm run build   # output: ./dist — unggah ke hosting statis apa pun`}</CodeBlock>
                </Card>
                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wide">Desktop Windows (.exe via Tauri v2)</h4>
                    <span className="rounded bg-sky-950/70 px-2 py-0.5 text-[10px] text-sky-400 border border-sky-800">CI membangun otomatis</span>
                  </div>
                  <CodeBlock color="text-sky-400">{`npm run tauri build
# installer: src-tauri/target/release/bundle/nsis/*.exe
# GitHub Actions job "desktop" membangun ini di setiap push`}</CodeBlock>
                </Card>
                <Card>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">Android (Capacitor)</h4>
                    <span className="rounded bg-amber-950/70 px-2 py-0.5 text-[10px] text-amber-400 border border-amber-800">Opsional</span>
                  </div>
                  <CodeBlock color="text-amber-400">{`npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init OpenPacket com.openpacket.app --web-dir dist
npm run build && npx cap add android`}</CodeBlock>
                </Card>
              </div>
            )}

            {/* ============ ARSITEKTUR ============ */}
            {activeSection === 'architecture' && (
              <div className="space-y-4">
                <SectionTitle
                  icon={<Cpu className="h-5 w-5 text-purple-400" />}
                  title="Arsitektur & Keamanan"
                  subtitle="Delapan invariants non-negotiable dan kualitas yang terukur."
                />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    { t: 'Zero DOM in Engine', c: 'text-emerald-400', b: 'Engine murni TypeScript di Web Worker — tanpa React/DOM (INV-001).' },
                    { t: 'Typed IPC (INV-002)', c: 'text-cyan-400', b: 'Semua pesan UI ↔ Worker adalah tagged union di src/types/ipc.ts.' },
                    { t: 'Port Cardinality (INV-003)', c: 'text-amber-400', b: 'Ethernet 1-kabel-1-port; radio WiFi 1-ke-N (amandemen v1.1.0).' },
                    { t: 'Deterministik (INV-004)', c: 'text-sky-400', b: 'Urutan paket selalu sama — dikunci test paritas otomatis.' },
                    { t: 'Clean-Room (INV-005)', c: 'text-purple-400', b: 'Tanpa kode proprietary Cisco — murni dari RFC publik IETF.' },
                    { t: 'Single State (INV-006)', c: 'text-blue-400', b: 'Satu store Zustand untuk GUI, CLI, dan engine — sinkron dua arah.' },
                    { t: 'No Secrets (INV-007)', c: 'text-rose-400', b: 'Tanpa API key/credential — aman di-push publik.' },
                    { t: '100% Offline (INV-008)', c: 'text-orange-400', b: 'Nol request jaringan eksternal — internet disimulasikan oleh Cloud.' },
                  ].map((inv) => (
                    <div key={inv.t} className="rounded-lg bg-[#1E293B] p-3 border border-gray-800">
                      <span className={`font-bold block mb-1 ${inv.c}`}>{inv.t}</span>
                      <span className="text-gray-400 leading-relaxed">{inv.b}</span>
                    </div>
                  ))}
                </div>
                <Card className="border-emerald-800/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-gray-100">Quality Gates (terverifikasi CI)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    {[
                      { v: '70', l: 'unit test' },
                      { v: '94%+', l: 'coverage engine' },
                      { v: '6', l: 'E2E scenarios' },
                      { v: '2', l: 'CI jobs hijau' },
                    ].map((s) => (
                      <div key={s.l} className="rounded bg-black/40 border border-gray-800 py-2">
                        <div className="text-lg font-bold text-white font-mono">{s.v}</div>
                        <div className="text-[10px] text-gray-500">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
