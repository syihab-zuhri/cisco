import { useMemo, useState } from 'react';
import {
  BookOpen,
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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  GraduationCap,
  ScanLine,
  Globe,
  ShieldCheck,
  Zap,
  Square,
  X,
  Lock,
  Users,
  ArrowLeftRight,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  | 'classroom'
  | 'build'
  | 'architecture';

const NAV_GROUPS: Array<{ group: string; items: Array<{ id: SectionId; label: string; icon: React.ReactNode }> }> = [
  {
    group: 'Mulai',
    items: [
      { id: 'home', label: 'Beranda', icon: <Sparkles className="h-4 w-4 text-viz-blue" /> },
      { id: 'devices', label: 'Perangkat & Kanvas', icon: <Layers className="h-4 w-4 text-viz-blue" /> },
    ],
  },
  {
    group: 'Simulasi',
    items: [
      { id: 'protocols', label: 'Mesin Protokol (RFC)', icon: <Play className="h-4 w-4 text-viz-teal" /> },
      { id: 'simmode', label: 'Simulation Mode & PDU', icon: <ScanLine className="h-4 w-4 text-viz-violet" /> },
      { id: 'cli', label: 'Terminal Cisco IOS', icon: <Terminal className="h-4 w-4 text-viz-green" /> },
    ],
  },
  {
    group: 'Lanjutan',
    items: [
      { id: 'classroom', label: 'Ruang Kelas & Lab Ujian', icon: <GraduationCap className="h-4 w-4 text-viz-gold" /> },
      { id: 'build', label: 'Build & Porting', icon: <Download className="h-4 w-4 text-viz-green" /> },
      { id: 'architecture', label: 'Arsitektur & Keamanan', icon: <Cpu className="h-4 w-4 text-viz-violet" /> },
    ],
  },
];

const ALL_SECTIONS: Array<{ id: SectionId; label: string; group: string }> = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ id: item.id, label: item.label, group: g.group }))
);

const SEARCH_INDEX: Array<{ section: SectionId; label: string; keywords: string; accordion?: string }> = [
  { section: 'home', label: 'Beranda — mulai 3 langkah', keywords: 'beranda quick start cepat mulai ping template' },
  { section: 'devices', label: 'PC / Laptop / Server', keywords: 'end device host klien' },
  { section: 'devices', label: 'Switch / Hub / Access Point', keywords: 'l2 cam repeater wifi ssid' },
  { section: 'devices', label: 'Router & Cloud Internet', keywords: 'router l3 gateway cloud 8.8.8.8 wan' },
  { section: 'devices', label: 'Aturan kabel, port UP/DOWN & WiFi', keywords: 'port singularity status administratif up down no shutdown kabel 1-to-1 radio nirkabel ssid vlan' },
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
  { section: 'cli', label: 'Perintah Cisco IOS (Routing, VLAN, Sub-if)', keywords: 'cli perintah ios enable configure ping show ip route switchport access trunk encapsulation dot1q sh run wr write memory vlan' },
  { section: 'classroom', label: 'Ruang Kelas (Mode Guru & Siswa)', keywords: 'kelas classroom guru siswa student teacher ujian soal kuis lab template gembok terkunci ganti peran' },
  { section: 'classroom', label: 'Proteksi Ujian & Kunci Template', keywords: 'template terkunci gembok kuning mode siswa buka kunci ganti peran keluar kelas' },
  { section: 'build', label: 'Menjalankan lokal & Relay Kelas', keywords: 'dev lokal npm install relay preview server' },
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
        <code className="my-2 block rounded bg-background/60 p-2 text-center font-mono text-viz-gold">
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
  { icon: <Monitor className="h-3.5 w-3.5 text-viz-blue" />, name: 'PC', ports: '1 FE + WiFi', role: 'End device — sumber/tujuan ping' },
  { icon: <Laptop className="h-3.5 w-3.5 text-viz-teal" />, name: 'Laptop', ports: '1 FE + WiFi', role: 'End device — bisa pindah ke WiFi' },
  { icon: <Server className="h-3.5 w-3.5 text-viz-violet" />, name: 'Server', ports: '1 FE', role: 'End device kabel (file/web server)' },
  { icon: <Network className="h-3.5 w-3.5 text-viz-green" />, name: 'Switch L2', ports: '8 FE', role: 'CAM learning, VLAN access/trunk' },
  { icon: <Cable className="h-3.5 w-3.5 text-viz-orange" />, name: 'Hub', ports: '8 FE', role: 'Repeater murni — tanpa CAM' },
  { icon: <Wifi className="h-3.5 w-3.5 text-viz-plum" />, name: 'Access Point', ports: 'Radio + 1 FE', role: 'Bridge WiFi ↔ kabel (SSID)' },
  { icon: <Router className="h-3.5 w-3.5 text-viz-gold" />, name: 'Router L3', ports: '3 FE', role: 'Routing, DHCP server, NAT, sub-interface' },
  { icon: <Cloud className="h-3.5 w-3.5 text-viz-blue" />, name: 'Cloud Internet', ports: '2 WAN', role: 'IP publik 8.8.8.8 / 1.1.1.1 tersimulasi' },
];

const CLI_ROWS: Array<{ mode: string; modeColor: string; cmd: string; desc: string }> = [
  { mode: 'User (>)', modeColor: 'text-viz-blue', cmd: 'enable', desc: 'Masuk privileged EXEC' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'configure terminal (conf t)', desc: 'Global configuration mode' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'ping <ip>', desc: 'ICMP 5 echo via engine penuh — output gaya Cisco (!!!!!)' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'show ip interface brief (sh ip int br)', desc: 'Status ringkas semua interface' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'show ip route', desc: 'Tabel routing (C connected, S static, R rip)' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'show running-config (sh run)', desc: 'Tampilkan konfigurasi aktif lengkap (hostname, port, route, sub-if)' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'write memory (wr / copy run start)', desc: 'Simpan running-config ke memori perangkat' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'show vlan brief (sh vlan)', desc: 'Tampilkan tabel VLAN dan port access pada Switch' },
  { mode: 'Privileged (#)', modeColor: 'text-viz-gold', cmd: 'show mac-address-table · show arp', desc: 'Ekstensi: CAM table & cache ARP' },
  { mode: 'Config (config)#', modeColor: 'text-viz-violet', cmd: 'hostname <nama>', desc: 'Ubah hostname (tersinkron ke GUI)' },
  { mode: 'Config (config)#', modeColor: 'text-viz-violet', cmd: 'ip route <net> <mask|/cidr> <nextHop>', desc: 'Tambah static route (hapus: no ip route ...)' },
  { mode: 'Config (config)#', modeColor: 'text-viz-violet', cmd: 'ip default-gateway <ip>', desc: 'Atur gateway default switch L2 (hapus: no ip default-gateway)' },
  { mode: 'Config (config)#', modeColor: 'text-viz-violet', cmd: 'interface <id> (int)', desc: 'Masuk konfigurasi port fisik, contoh: int fa0/0' },
  { mode: 'Config (config)#', modeColor: 'text-viz-violet', cmd: 'interface <id>.<subif>', desc: 'Masuk/buat sub-interface router, contoh: int fa0/0.10' },
  { mode: 'Config-if', modeColor: 'text-viz-green', cmd: 'ip address <ip> <mask|/cidr>', desc: 'IPv4 + subnet mask port (hapus: no ip address)' },
  { mode: 'Config-if', modeColor: 'text-viz-green', cmd: 'no shutdown (no shut) · shutdown', desc: 'Naikkan / turunkan status administratif port' },
  { mode: 'Config-if (Switch)', modeColor: 'text-viz-green', cmd: 'switchport mode <access|trunk>', desc: 'Set mode port access atau trunk 802.1Q' },
  { mode: 'Config-if (Switch)', modeColor: 'text-viz-green', cmd: 'switchport access vlan <vlanId>', desc: 'Tetapkan nomor VLAN pada port mode access' },
  { mode: 'Config-subif (Router)', modeColor: 'text-viz-teal', cmd: 'encapsulation dot1q <vlanId>', desc: 'Enkapsulasi IEEE 802.1Q untuk Router-on-a-stick' },
  { mode: 'Semua mode', modeColor: 'text-muted-foreground', cmd: 'exit / end', desc: 'Navigasi antar mode (end → langsung #)' },
];

const TEMPLATE_NAMES = [
  'P2P', 'Star', 'Bus', 'Ring', 'Daisy Chain', 'Lab Hub',
  'Kantor Server+Laptop', 'Hotspot Rumah+Internet', 'Kantor Nirkabel',
  'Dual LAN Routed', 'Dual Router WAN', 'Dual Router RIP',
  'Tree Hierarkis', 'Mesh Jala', 'Kantor 2 VLAN', 'Hybrid Campuran',
];

function CodeBlock({ children, color = 'text-viz-blue' }: { children: string; color?: string }) {
  return (
    <pre className={`overflow-x-auto rounded-lg border bg-background/60 p-3 font-mono text-xs leading-relaxed ${color}`}>
      {children}
    </pre>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-muted/40 p-4 ${className}`}>{children}</div>;
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
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
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div
            key={item.id}
            className={`rounded-lg border bg-muted/40 transition-colors ${open ? 'border-viz-blue/60' : 'border-border'}`}
          >
            <button onClick={() => onToggle(item.id)} className="flex w-full items-center justify-between gap-2 p-3.5 text-left">
              <span className="text-xs font-bold">{item.title}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded border bg-background/60 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {item.tag}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {open && <div className="px-3.5 pb-3.5 text-xs leading-relaxed text-foreground/90">{item.body}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function DocumentationModal({ isOpen, onClose }: DocsModalProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [query, setQuery] = useState<string>('');
  const [openProto, setOpenProto] = useState<string | null>('arp');
  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);

  const currentIndex = ALL_SECTIONS.findIndex((s) => s.id === activeSection);
  const prevSection = currentIndex > 0 ? ALL_SECTIONS[currentIndex - 1] : null;
  const nextSection = currentIndex < ALL_SECTIONS.length - 1 ? ALL_SECTIONS[currentIndex + 1] : null;

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
    setMobileSearchOpen(false);
    const container = document.getElementById('docs-content-scroll');
    if (container) container.scrollTop = 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] sm:h-[88vh] w-[96vw] sm:w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between border-b px-4 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center gap-2.5 sm:gap-3 truncate">
            <div className="rounded-lg border border-viz-blue/40 bg-viz-blue/20 p-1.5 sm:p-2 shrink-0">
              <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-viz-blue" />
            </div>
            <div className="truncate">
              <DialogTitle className="text-sm sm:text-base font-bold tracking-wide truncate">Pusat Bantuan OpenPacket</DialogTitle>
              <DialogDescription className="text-[11px] sm:text-xs truncate">
                Panduan fitur, protokol jaringan, &amp; build — v2.3.0
              </DialogDescription>
            </div>
          </div>
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Tutup pusat bantuan" className="shrink-0" />}>
            <X className="h-5 w-5" />
          </DialogClose>
        </DialogHeader>

        {/* Mobile Topic Selector Bar (Lega di HP, menggantikan sidebar bertumpuk) */}
        <div className="sm:hidden border-b bg-muted/60 px-3 py-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!prevSection}
              onClick={() => {
                if (prevSection) {
                  setActiveSection(prevSection.id);
                  const c = document.getElementById('docs-content-scroll');
                  if (c) c.scrollTop = 0;
                }
              }}
              className="h-8 w-8 shrink-0"
              title="Bab Sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="relative flex-1 min-w-0">
              <select
                value={activeSection}
                onChange={(e) => {
                  setActiveSection(e.target.value as SectionId);
                  setQuery('');
                  setMobileSearchOpen(false);
                  const c = document.getElementById('docs-content-scroll');
                  if (c) c.scrollTop = 0;
                }}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-semibold text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary truncate cursor-pointer shadow-xs"
              >
                {NAV_GROUPS.map((group) => (
                  <optgroup key={group.group} label={`── ${group.group} ──`}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="icon-sm"
              disabled={!nextSection}
              onClick={() => {
                if (nextSection) {
                  setActiveSection(nextSection.id);
                  const c = document.getElementById('docs-content-scroll');
                  if (c) c.scrollTop = 0;
                }
              }}
              className="h-8 w-8 shrink-0"
              title="Bab Berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant={mobileSearchOpen ? 'secondary' : 'outline'}
              size="icon-sm"
              onClick={() => setMobileSearchOpen((prev) => !prev)}
              className="h-8 w-8 shrink-0"
              title="Cari Topik"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Search Bar Popup */}
          {mobileSearchOpen && (
            <div className="relative pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
              <Search className="absolute top-3.5 left-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari topik (cth: arp, routing, vlan, cli)..."
                className="h-8 pl-8 text-xs bg-background"
                autoFocus
              />
              {results && (
                <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                    {results.length} hasil pencarian
                  </div>
                  {results.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs italic text-muted-foreground">Tidak ada topik cocok.</div>
                  ) : (
                    results.map((entry, i) => (
                      <button
                        key={i}
                        onClick={() => goTo(entry.section, entry.accordion)}
                        className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <div className="font-medium text-foreground">{entry.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {NAV_GROUPS.flatMap((g) => g.items).find((it) => it.id === entry.section)?.label}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1">
          {/* Desktop Sidebar (Hanya tampil di sm:flex, tidak menghimpit mobile) */}
          <nav className="hidden sm:flex sm:w-64 shrink-0 flex-col sm:border-r bg-background/40 overflow-y-auto">
            <div className="p-3">
              <div className="relative">
                <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari topik…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            {results ? (
              <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase text-muted-foreground/70">{results.length} hasil</div>
                {results.length === 0 && (
                  <div className="px-1 text-xs italic text-muted-foreground/60">Tidak ada topik cocok.</div>
                )}
                {results.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(entry.section, entry.accordion)}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-foreground/90 hover:bg-muted hover:text-foreground"
                  >
                    {entry.label}
                    <span className="block text-[10px] text-muted-foreground/60">
                      {NAV_GROUPS.flatMap((g) => g.items).find((it) => it.id === entry.section)?.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 pb-3">
                {NAV_GROUPS.map((group) => (
                  <div key={group.group} className="mb-3">
                    <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      {group.group}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-all ${
                            activeSection === item.id
                              ? 'bg-primary font-bold text-primary-foreground shadow-md'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

            <div className="border-t p-3">
              <div className="rounded-lg border border-viz-blue/40 bg-viz-blue/10 p-2.5">
                <div className="mb-0.5 text-[10px] font-bold text-viz-blue">Butuh tantangan?</div>
                <div className="text-[10px] leading-relaxed text-muted-foreground">
                  Coba <b>Mode Lab</b> di toolbar — misi berpandu dengan verifikasi otomatis.
                </div>
              </div>
            </div>
          </nav>

          {/* Content */}
          <div id="docs-content-scroll" className="min-w-0 flex-1 overflow-y-auto p-3.5 sm:p-6 flex flex-col justify-between">
            {/* ============ BERANDA ============ */}
            {activeSection === 'home' && (
              <div className="flex flex-col gap-5">
                <SectionTitle
                  icon={<Sparkles className="h-5 w-5 text-viz-blue" />}
                  title="Mulai di Sini"
                  subtitle="Tiga langkah dari kanvas kosong menjadi jaringan yang berfungsi."
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { n: '1', title: 'Bangun topologi', body: 'Klik perangkat di palet, atau buka tab Template dan terapkan topologi siap pakai (16 katalog, 5 grup).' },
                    { n: '2', title: 'Konfigurasi', body: 'Klik perangkat → ikon gear untuk form GUI, atau ikon terminal untuk CLI Cisco IOS. Keduanya tersinkron dua arah.' },
                    { n: '3', title: 'Simulasikan', body: 'Kirim ping dari Toolbar, amati animasi paket, telusuri event di timeline, bongkar headernya di PDU Inspector.' },
                  ].map((s) => (
                    <Card key={s.n}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{s.n}</span>
                        <span className="text-xs font-bold">{s.title}</span>
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                    </Card>
                  ))}
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    Yang bisa Anda lakukan
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      <div key={i} className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs text-foreground/90">
                        <span className="text-viz-blue">{f.icon}</span>
                        {f.text}
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="border-viz-gold/40 bg-viz-gold/10">
                  <div className="mb-1.5 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-viz-gold" />
                    <span className="text-xs font-bold text-viz-gold">Cara tercepat belajar: Mode Lab</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Klik tombol <b>Lab</b> di toolbar — misi berpandu dengan topologi terkunci,
                    petunjuk bertahap, dan verifikasi otomatis. Tiga lab tersedia: perbaiki gateway,
                    nyalakan internet dengan NAT, dan hubungkan dua VLAN.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ PERANGKAT & KANVAS ============ */}
            {activeSection === 'devices' && (
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<Layers className="h-5 w-5 text-viz-blue" />}
                  title="Perangkat & Kanvas"
                  subtitle="Referensi 8 jenis perangkat dan aturan penyambungannya."
                />

                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60">
                      <tr>
                        <th className="p-2.5 font-bold">Perangkat</th>
                        <th className="p-2.5 font-bold">Port</th>
                        <th className="p-2.5 font-bold">Peran</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background/60">
                      {DEVICE_ROWS.map((d) => (
                        <tr key={d.name} className="hover:bg-muted/40">
                          <td className="p-2.5">
                            <span className="flex items-center gap-2 font-semibold">
                              {d.icon}
                              {d.name}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-muted-foreground">{d.ports}</td>
                          <td className="p-2.5 text-foreground/90">{d.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Card>
                  <div className="mb-2 text-xs font-bold">Aturan penyambungan &amp; Status Port</div>
                  <ul className="flex flex-col gap-1.5 list-inside list-disc text-xs leading-relaxed text-muted-foreground">
                    <li><b>Port Singularity</b>: satu port ethernet hanya satu kabel; melepas kabel menurunkan kedua port ke DOWN.</li>
                    <li><b>Radio WiFi 1-ke-N</b>: satu radio AP melayani banyak klien; tiap klien hanya satu AP (SSID harus sama persis).</li>
                    <li><b>Drag-to-connect</b>: tarik dari titik port ke port tujuan — kabel ethernet atau asosiasi WiFi terdeteksi otomatis.</li>
                    <li><b>VLAN</b>: port switch access hanya bicara dengan port se-VLAN; trunk membawa semuanya.</li>
                    <li>
                      <b>Status Administratif Port (UP vs ADMIN DOWN)</b>: Port Router secara realistis berstatus <code>administratively down</code> saat baru dibuat.
                      Mencolokkan kabel ke router tidak langsung meng-UP-kan port sampai Anda mengaktifkannya via perintah CLI <code>no shutdown</code> atau toggle switch <b>Status Administratif</b> pada modal konfigurasi perangkat. Port Switch dan Host otomatis UP saat kabel terpasang.
                    </li>
                  </ul>
                </Card>

                <Card>
                  <div className="mb-2 text-xs font-bold">Anotasi kanvas (square & teks)</div>
                  <ul className="flex flex-col gap-1.5 list-inside list-disc text-xs leading-relaxed text-muted-foreground">
                    <li>Tombol <b>Square</b> &amp; <b>Teks</b> di palet (bagian Anotasi) → muncul di tengah layar, digeser bebas.</li>
                    <li><b>Square</b> berada di belakang perangkat (untuk menandai area): klik → pilih warna, tarik handle kanan-bawah untuk mengubah ukuran.</li>
                    <li><b>Teks</b>: dobel-klik untuk mengedit isi; saat dipilih, atur ukuran font lewat tombol −/+.</li>
                    <li>Keduanya ikut tersimpan &amp; dimuat di file JSON topologi.</li>
                  </ul>
                </Card>

                <Card>
                  <div className="mb-2 text-xs font-bold">16 Template siap pakai (5 grup)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_NAMES.map((t) => (
                      <span key={t} className="rounded border bg-background/60 px-2 py-0.5 text-[10px] text-foreground/80">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/80">
                    Buka tab <b>Template</b> di palet kiri → tekan <b>Terapkan</b>. Beberapa template
                    sudah terkonfigurasi penuh (IP, route, SSID) dan bisa langsung di-ping.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ MESIN PROTOKOL ============ */}
            {activeSection === 'protocols' && (
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<Play className="h-5 w-5 text-viz-teal" />}
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
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<ScanLine className="h-5 w-5 text-viz-violet" />}
                  title="Simulation Mode & PDU Inspector"
                  subtitle="Alat inspeksi ala Packet Tracer — aliran simulasi direncanakan sebagai event deterministik."
                />
                <div className="flex flex-col gap-3">
                  <Card>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Play className="h-4 w-4 text-viz-violet" />
                      <span className="text-xs font-bold">Step Mode & Timeline</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Tekan <b>Step</b> di toolbar lalu kirim ping: seluruh aliran direncanakan lebih
                      dulu dan tampil di tab <b>Simulasi</b> (panel bawah) — event mendatang tampil
                      redup. Tombol <b>Next</b> memutar tepat satu event per klik; kecepatan 0.5x–2x
                      mengatur animasi saat tidak stepping.
                    </p>
                  </Card>
                  <Card>
                    <div className="mb-1.5 flex items-center gap-2">
                      <ScanLine className="h-4 w-4 text-viz-teal" />
                      <span className="text-xs font-bold">PDU Inspector (drawer kanan)</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Klik event mana pun di timeline untuk membongkar header berlapisnya:
                      <span className="mt-2 flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-viz-green"><b className="w-8">L2</b> Ethernet Frame — src/dst MAC (ditulis ulang per hop!), ethertype</span>
                        <span className="flex items-center gap-2 text-viz-violet"><b className="w-8">L3</b> IPv4 Packet — src/dst IP end-to-end, TTL menurun di router</span>
                        <span className="flex items-center gap-2 text-viz-teal"><b className="w-8">L4</b> ARP / ICMP / DHCP — opcode, type, sequence, yiaddr</span>
                      </span>
                      Mode <b>auto-follow</b> (ikon pin) mengikuti paket yang sedang berjalan.
                    </p>
                  </Card>
                  <Card>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-viz-blue" />
                      <span className="text-xs font-bold">Table Viewer (tab Tabel)</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
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
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<Terminal className="h-5 w-5 text-viz-green" />}
                  title="Terminal Cisco IOS"
                  subtitle="Klik ikon terminal pada hover perangkat atau tombol Terminal CLI. Perintah Cisco IOS kanonik + konfigurasi L2/L3 lengkap."
                />
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/60">
                      <tr>
                        <th className="w-36 p-2.5 font-bold">Mode</th>
                        <th className="p-2.5 font-bold">Perintah (alias)</th>
                        <th className="p-2.5 font-bold">Fungsi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background/60 font-mono">
                      {CLI_ROWS.map((row) => (
                        <tr key={row.cmd} className="hover:bg-muted/40">
                          <td className={`p-2.5 ${row.modeColor}`}>{row.mode}</td>
                          <td className="p-2.5 text-viz-green">{row.cmd}</td>
                          <td className="p-2.5 font-sans text-foreground/90">{row.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Card className="border-viz-green/40 bg-viz-green/10">
                  <span className="mb-1 block text-xs font-bold text-viz-green">Format output ping</span>
                  <p className="text-xs leading-relaxed text-foreground/90">
                    Dari terminal IOS: gaya Cisco — <code>!!!!! Success rate is 100 percent (5/5)</code>.
                    Dari Toolbar (PC): gaya Windows — <code>Reply from x.x.x.x: bytes=32 time&lt;1ms TTL=128</code>.
                    Keduanya dijalankan engine penuh, bukan teks fiktif.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ RUANG KELAS & LAB UJIAN ============ */}
            {activeSection === 'classroom' && (
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<GraduationCap className="h-5 w-5 text-viz-gold" />}
                  title="Ruang Kelas & Lab Ujian"
                  subtitle="Platform evaluasi praktikum: sesi kelas guru, pengerjaan siswa, proteksi anti-cheat template, dan evaluasi otomatis."
                />

                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-gold">
                      Prinsip Independensi Peran (Role Isolation)
                    </h4>
                    <span className="rounded border border-viz-gold/40 bg-viz-gold/10 px-2 py-0.5 text-[10px] text-viz-gold">
                      Multi-Role
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/90">
                    Untuk menjaga keaslian proses ujian dan mencegah kecurangan, satu perangkat komputer atau peramban hanya dapat memegang <b>satu peran aktif</b> (sebagai <b>Guru</b> atau sebagai <b>Siswa</b>) dalam satu waktu.
                  </p>
                </Card>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card className="border-viz-blue/40 bg-viz-blue/10">
                    <div className="mb-2 flex items-center gap-2 font-bold text-viz-blue text-xs">
                      <Users className="h-4 w-4" />
                      Mode Guru (Pengajar)
                    </div>
                    <ul className="flex flex-col gap-1.5 list-inside list-disc text-xs leading-relaxed text-muted-foreground">
                      <li><b>Buat Sesi Kelas</b>: Menghasilkan kode kelas unik (contoh: <code>NET-5021</code>) untuk dibagikan ke siswa.</li>
                      <li><b>Pilih &amp; Rancang Soal</b>: Pilih tantangan dari bank soal bawaan atau buat soal kustom dengan target IP, link kabel, reachability, dan VLAN.</li>
                      <li><b>Siarkan Soal &amp; Topologi Awal</b>: Distribusikan instruksi soal dan starter topology ke seluruh layar siswa secara real-time.</li>
                      <li><b>Pantau Live Submisi</b>: Awasi daftar siswa yang bergabung, nilai skor otomatis (0–100), dan detail checklist kelulusan tiap target.</li>
                    </ul>
                  </Card>

                  <Card className="border-viz-green/40 bg-viz-green/10">
                    <div className="mb-2 flex items-center gap-2 font-bold text-viz-green text-xs">
                      <GraduationCap className="h-4 w-4" />
                      Mode Siswa (Peserta)
                    </div>
                    <ul className="flex flex-col gap-1.5 list-inside list-disc text-xs leading-relaxed text-muted-foreground">
                      <li><b>Gabung Kelas</b>: Masukkan kode kelas dan nama/nickname Anda.</li>
                      <li><b>Classroom Student HUD</b>: Panel mengambang di pojok kanan atas kanvas menampilkan instruksi tugas aktif, target konfigurasi, dan tombol aksi.</li>
                      <li><b>Self-Check Mandiri</b>: Siswa dapat menguji validitas jaringan kapan saja sebelum mengumpulkan tugas.</li>
                      <li><b>Submit Jawaban</b>: Kirim konfigurasi topologi ke guru dengan satu klik setelah semua target tercapai.</li>
                    </ul>
                  </Card>
                </div>

                <Card className="border-viz-gold/40 bg-viz-gold/10">
                  <div className="mb-2 flex items-center gap-2 text-xs font-bold text-viz-gold">
                    <Lock className="h-4 w-4 text-viz-gold" />
                    Proteksi Ujian: Sistem Kunci Template Jaringan (Anti-Cheat)
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/90 mb-3">
                    Saat berada dalam <b>Mode Siswa</b> atau sedang mengikuti kelas praktikum aktif, tab <b>Template</b> pada palet perangkat sebelah kiri akan otomatis <b>terkunci</b> (<span className="inline-flex items-center gap-1 font-mono text-[11px] text-viz-gold"><Lock className="inline h-3 w-3" /> Template</span>).
                  </p>
                  <ul className="flex flex-col gap-1.5 list-inside list-disc text-xs leading-relaxed text-muted-foreground">
                    <li><b>Mencegah Jalan Pintas</b>: Siswa diwajibkan menyusun dan menghubungkan perangkat dari nol sesuai spesifikasi soal ujian, bukan dengan memuat topologi template yang sudah jadi.</li>
                    <li><b>Cara Membuka Kunci Template</b>:
                      <ul className="mt-1 ml-4 list-disc space-y-1 text-foreground/90">
                        <li>Buka modal <b>Kelas</b> di toolbar atas.</li>
                        <li>Tekan tombol <span className="inline-flex items-center gap-1 font-semibold text-foreground"><ArrowLeftRight className="h-3 w-3" /> Ganti Peran</span> pada header modal atau tombol <b>"Keluar Mode Siswa"</b> / <b>"Keluar Kelas"</b>.</li>
                        <li>Beralih ke <b>Mode Guru</b> atau kembali ke mode normal: tab Template akan <b>langsung terbuka kembali secara reaktif</b> tanpa perlu me-refresh halaman!</li>
                      </ul>
                    </li>
                  </ul>
                </Card>

                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-teal">
                      Relay Server Mandiri &amp; Mode Offline
                    </h4>
                    <span className="rounded border border-viz-teal/40 bg-viz-teal/10 px-2 py-0.5 text-[10px] text-viz-teal">
                      100% Offline LAN
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground mb-2">
                    OpenPacket mendukung sinkronisasi real-time antar-laptop di lab komputer sekolah tanpa memerlukan akses internet ke cloud luar:
                  </p>
                  <CodeBlock color="text-viz-teal">{`# Cara termudah — relay sudah menyatu dengan server aplikasi:
npm run dev           # relay aktif di port 5173 (satu alamat dengan aplikasi)
npm run preview       # build produksi + relay di port 4173

# Relay terpisah (port 5174) — arahkan aplikasi ke alamatnya:
npm run relay
#   a) saat build/dev:  VITE_CLASSROOM_RELAY_URL=http://192.168.1.10:5174
#   b) atau per perangkat (konsol browser):
#      localStorage.setItem('openpacket_relay_url', 'http://192.168.1.10:5174')`}</CodeBlock>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Laptop siswa cukup membuka alamat IP lokal laptop guru (contoh: <code>http://192.168.1.10:5173</code>) dan memasukkan kode kelas yang sama.
                    Tanpa relay (mis. hosting statis), kelas hanya berjalan antar-tab di browser yang sama.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Keamanan: token guru tidak pernah dikirim ke siswa; setiap siswa punya token sendiri; <b>Kunci Sesi</b> menolak peserta baru,
                    dan soal baru memulai <b>ronde</b> baru (nilai ronde lama diarsipkan dan ikut di CSV).
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <b>Verifikasi skor:</b> jawaban siswa menyertakan salinan topologinya. Tombol <b>Verifikasi</b> / <b>Verifikasi Semua</b> di
                    tabel peserta menilai ulang topologi itu di perangkat guru dan menandai skor yang tidak cocok
                    (&quot;Sebenarnya N&quot;). <b>Pemulihan otomatis:</b> bila server relay restart, kelas guru didaftarkan ulang dan siswa
                    tersambung kembali sendiri (jawaban dikirim ulang) tanpa perlu membuka kelas baru.
                  </p>
                </Card>
              </div>
            )}

            {/* ============ BUILD & PORTING ============ */}
            {activeSection === 'build' && (
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<Download className="h-5 w-5 text-viz-green" />}
                  title="Build & Porting"
                  subtitle="Dari mode development sampai installer Windows — semuanya client-side."
                />
                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-blue">Menjalankan Lokal</h4>
                    <span className="rounded border border-viz-blue/40 bg-viz-blue/10 px-2 py-0.5 text-[10px] text-viz-blue">Node 20/22</span>
                  </div>
                  <CodeBlock>{`git clone https://github.com/syihab-zuhri/cisco.git
cd cisco && npm install
npm run dev          # http://localhost:5173

npm run type-check   # tsc strict, 0 error
npm test             # unit test (168 test, 16 files lulus)
npm run relay        # server relay kelas mandiri lokal (port 5174)
npm run preview      # preview build produksi + relay (port 4173)
npm run e2e          # E2E Playwright (Edge/Chromium)`}</CodeBlock>
                </Card>
                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-green">Web Statis (Vercel / Pages)</h4>
                    <span className="rounded border border-viz-green/40 bg-viz-green/10 px-2 py-0.5 text-[10px] text-viz-green">~139 KB gzip</span>
                  </div>
                  <CodeBlock color="text-viz-green">{`npm run build   # output: ./dist — unggah ke hosting statis apa pun`}</CodeBlock>
                </Card>
                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-blue">Desktop Windows (.exe via Tauri v2)</h4>
                    <span className="rounded border border-viz-blue/40 bg-viz-blue/10 px-2 py-0.5 text-[10px] text-viz-blue">CI membangun otomatis</span>
                  </div>
                  <CodeBlock color="text-viz-blue">{`npm run tauri build
# installer: src-tauri/target/release/bundle/nsis/*.exe
# GitHub Actions job "desktop" membangun ini di setiap push`}</CodeBlock>
                </Card>
                <Card>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-viz-gold">Android (Capacitor)</h4>
                    <span className="rounded border border-viz-gold/40 bg-viz-gold/10 px-2 py-0.5 text-[10px] text-viz-gold">Opsional</span>
                  </div>
                  <CodeBlock color="text-viz-gold">{`npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init OpenPacket com.openpacket.app --web-dir dist
npm run build && npx cap add android`}</CodeBlock>
                </Card>
              </div>
            )}

            {/* ============ ARSITEKTUR ============ */}
            {activeSection === 'architecture' && (
              <div className="flex flex-col gap-4">
                <SectionTitle
                  icon={<Cpu className="h-5 w-5 text-viz-violet" />}
                  title="Arsitektur & Keamanan"
                  subtitle="Delapan invariants non-negotiable dan kualitas yang terukur."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { t: 'Zero DOM in Engine', c: 'text-viz-green', b: 'Engine murni TypeScript di Web Worker — tanpa React/DOM (INV-001).' },
                    { t: 'Typed IPC (INV-002)', c: 'text-viz-teal', b: 'Semua pesan UI ↔ Worker adalah tagged union di src/types/ipc.ts.' },
                    { t: 'Port Cardinality (INV-003)', c: 'text-viz-gold', b: 'Ethernet 1-kabel-1-port; radio WiFi 1-ke-N (amandemen v1.1.0).' },
                    { t: 'Deterministik (INV-004)', c: 'text-viz-blue', b: 'Urutan paket selalu sama — dikunci test paritas otomatis.' },
                    { t: 'Clean-Room (INV-005)', c: 'text-viz-violet', b: 'Tanpa kode proprietary Cisco — murni dari RFC publik IETF.' },
                    { t: 'Single State (INV-006)', c: 'text-viz-blue', b: 'Satu store Zustand untuk GUI, CLI, dan engine — sinkron dua arah.' },
                    { t: 'No Secrets (INV-007)', c: 'text-viz-red', b: 'Tanpa API key/credential — aman di-push publik.' },
                    { t: '100% Offline (INV-008)', c: 'text-viz-orange', b: 'Nol request jaringan eksternal — internet disimulasikan oleh Cloud.' },
                  ].map((inv) => (
                    <div key={inv.t} className="rounded-lg border bg-muted/40 p-3">
                      <span className={`mb-1 block font-bold ${inv.c}`}>{inv.t}</span>
                      <span className="leading-relaxed text-muted-foreground">{inv.b}</span>
                    </div>
                  ))}
                </div>
                <Card className="border-viz-green/40">
                  <div className="mb-1.5 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-viz-green" />
                    <span className="text-xs font-bold">Quality Gates (terverifikasi CI)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    {[
                      { v: '70', l: 'unit test' },
                      { v: '94%+', l: 'coverage engine' },
                      { v: '6', l: 'E2E scenarios' },
                      { v: '2', l: 'CI jobs hijau' },
                    ].map((s) => (
                      <div key={s.l} className="rounded border bg-background/60 py-2">
                        <div className="font-mono text-lg font-bold">{s.v}</div>
                        <div className="text-[10px] text-muted-foreground">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Bottom Chapter Navigation */}
            <div className="mt-8 border-t border-border/60 pt-4 flex items-center justify-between gap-2">
              {prevSection ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveSection(prevSection.id);
                    const c = document.getElementById('docs-content-scroll');
                    if (c) c.scrollTop = 0;
                  }}
                  className="gap-1.5 text-xs h-8"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[130px] sm:max-w-none">{prevSection.label}</span>
                </Button>
              ) : (
                <div />
              )}

              {nextSection ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setActiveSection(nextSection.id);
                    const c = document.getElementById('docs-content-scroll');
                    if (c) c.scrollTop = 0;
                  }}
                  className="gap-1.5 text-xs h-8 ml-auto"
                >
                  <span className="truncate max-w-[130px] sm:max-w-none">{nextSection.label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
