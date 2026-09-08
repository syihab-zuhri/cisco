# LAPORAN AUDIT — OpenPacket (cisco-pocket-op)
Tanggal audit: 07-09-2026 — metode: pembacaan kode menyeluruh + probe eksekusi nyata terhadap engine (bukan hanya membaca test).

Ringkasan metode: file inti dibaca penuh (simulationEngine.ts 1468 baris, worker.ts, eventQueue.ts, gates.ts,
cliEngine.ts, ipUtils.ts, network.ts, protocol.ts, ipc.ts, useSimulationEngine.ts, useAppStore.ts, labs.ts,
topologyTemplates*.ts, komponen UI utama). Test suite proyek DIJALANKAN (hijau) tetapi tidak dijadikan bukti;
semua temuan di bawah diverifikasi lewat probe runtime tsx/vitest terpisah terhadap HeadlessSimulationEngine
dengan topologi baru yang tidak ada di suite mana pun.

================================================================================
TEMUAN 1 [KRITIS — LOGIKA TERAS] Ping antar-subnet melalui ROUTER GAGAL — BFS tidak
menyeberangi router pada segmen tujuan (findL2Path, simulationEngine.ts:267-342)
================================================================================
Gejala (dieksekusi, bukan teoretis):
  Topologi: PC-A(192.168.1.10, gw 192.168.1.1) — swA — R1(fa0/0=192.168.1.1,
            fa0/1=192.168.2.1) — swB — PC-B(192.168.2.20, gw 192.168.2.1)
  executePing('pc-a','192.168.2.20') => success:false
  Error: "Tidak ada jalur fisik/Layer-2 antara r1 dan pc-b."

Akar masalah:
- findL2Path dengan fromPortId root di port sumber dan BFS hanya melanjutkan
  traversal pada peer yang isL2Intermediate (switch/hub/AP). Router TIDAK
  termasuk L2_INTERMEDIATE_TYPES. Akibatnya hop pertama dari router ke segmen
  tujuan TIDAK PERNAH DIJELAJAHI: BFS berhenti di r1 dan tidak pernah
  menemukan pc-b. Perilaku sama menimpa kasus 2-router hop pertama.
- Konsekuensi nyata: LAB-1 bawaan proyek ("gateway-salah", labs.ts:127-167)
  TIDAK BISA LULUS objektif ping-nya — PC-Staff ke Server-2 (192.168.2.20)
  melalui Router-1 yang terhubung LANGSUNG ke kedua host. Skenario yang sama
  ada di matriks Packet Tracer dan semua topologi routed. Test suite proyek
  tidak menangkap ini karena seluruh topologi routed di test memakai switch di
  antara router dan host TAPI router dihubungkan ke switch2 di segmen tujuan —
  dan pengujian ping-nya berhasil karena di topologi itu hop router -> switch2
  -> pc2 tetap ditempuh BFS (sw2 = L2 intermediate). (parity.test.ts
  buildDualLan, simulationEngine.test.ts buildRoutedTopology).
  => CELAH: host/switch yang MENEMPEL LANGSUNG ke router tujuan (LAB-1,
     topologi LAN-2-router, template Router-Direct) dijamin gagal.

Bukti tambahan: findL2Path('r-1','pc-b','fa0/1') => null,
  sedangkan findL2Path('r-1','pc-b') TANPA fromPortId => path ditemukan (lewat fa0/0 yang salah arah,
  tapi "ditemukan" — jadi hasil bergantung dari port mana BFS di-root, tidak konsisten).

Rekomendasi: BFS harus memperlakukan router sebagai node transit bila hop masuk
berasal dari port yang ipAddress-nya satu segmen dengan port keluar (routing),
atau — lebih sederhana dan aman — izinkan traversal melewati router yang bukan
tujuan final pada segmen yang sama (hanya switch/router di jalur fisik). Paling
tidak, jangan root BFS di port sumber SAJA ketika target di luar subnet: cari
jalur dari SEMUA port up router yang menuju segmen target.

================================================================================
TEMUAN 2 [TINGGI — INKONSISTENSI VLAN] Host tanpa VLAN (default 1) vs switch
port access vlan 99 => komunikasi terputus walau host lain se-VLAN 99
================================================================================
(vlanAllows, simulationEngine.ts:191-195; dipakai di findL2Path & broadcastPaths)

Perilaku saat ini: host PC tanpa properti vlanId (default 1) yang terhubung ke
switch port access vlanId 99 TIDAK bisa bicara dengan siapa pun di port vlan 99 —
BFS menolak link karena (1 === 99). Padahal di Packet Tracer, port access tanpa
vlanId = VLAN 1, host tanpa vlanId = VLAN 1: host di switch vlan-99 TIDAK akan
terhubung ke host vlan-1 — jadi separuh benar. TAPI:
- Saat UI/config modal TIDAK menulis vlanId ke host (host TIDAK punya konsep VLAN
  di modal; lihat DeviceConfigModal), host selalu default 1 dan switch access
  vlan-99 (dari template/CLI "switchport access vlan 99") => host tidak akan
  PERNAH bisa ping host lain di switch yang sama. Ini bisa menjadi celah "tidak
  terlihat" di lab: pengguna menyetel access vlan 99 di switch tetapi host tidak
  punya field vlan — satu-satunya cara host ikut VLAN 99 adalah dengan mengedit
  vlanId host secara manual (tidak ada di UI).

Perilaku yang diharapkan (konsisten INV-004/Packet Tracer):
- port ACCESS switch yang TIDAK punya vlanId eksplisit harus diperlakukan
  sebagai anggota VLAN 1 (default), BUKAN vlan "undefined".
- Bila host punya vlanId eksplisit (vlan 99) dan switch access port vlan 99,
  harus terhubung.
- Bila host vlan 1 (default) dan port access vlan 99 => TIDAK terhubung (benar).

Kontradiksi dengan LAB3: di labs.ts host PC-1 & PC-2 diberi vlanId eksplisit
(10 & 20) dan switch access port vlan 10 & 20. Konsisten. Namun template/topologi
lain (topologyTemplates.ts, topologyTemplatesClassic.ts) TIDAK memberi vlanId ke
host dan TIDAK memberi vlanId default di switch — hanya beberapa port trunk.
Maka mengubah switch access vlan di CLI (perintah "switchport access vlan N")
membuat host2 di port itu tidak terjangkau: UI tidak menyediakan cara menyetel
vlan host, jadi satu-satunya efek "switchport access vlan N" adalah MEMUTUS
host yang tadinya terhubung (default 1). Efek samping: ping antar host di switch
yang semua portnya di-set vlan 99 gagal (lihat probe AUDIT-2). Ini "logic tidak
berjalan seperti semestinya" dari sisi pengguna: akses vlan yang di-set di switch
tidak bisa "diikuti" host karena host tidak punya kontrol vlan.

Rekomendasi:
- Defaultkan vlanId = 1 pada port access switch dan host saat setTopology,
  ATAU perlakukan undefined sebagai 1 di vlanAllows (saat ini (a.vlanId ?? 1)
  SUDAH default 1 untuk akses, TAPI host tanpa vlan vs switch vlan 99 => 1 vs 99
  tetap mismatch — perlu diputuskan: host TANPA vlanId eksplisit dianggap "ikut
  VLAN port access lawan" (seperti access port tanpa vlan = VLAN1 default hanya
  untuk SWITCH; host end-device tidak punya tag).
- Untuk host end-device (pc/laptop/server) sebaiknya jangan menegakkan vlanId
  sama sekali (host tidak tag 802.1Q; access port switch yang menentukan).
- Beri kontrol VLAN pada host di UI bila ingin mempertahankan model saat ini.

================================================================================
TEMUAN 3 [TINGGI — ARP/IP SALAH] ARP Request untuk IP di luar subnet dikirim
ke SUBNET SENDIRI sebagai broadcast dengan IP target di luar segmen
================================================================================
planArp (simulationEngine.ts:443-590) dipanggil dengan owner = resolveOwner
dari nextHopIp. Untuk host tujuan langsung di segmen yang sama tidak masalah.
TAPI bila owner berada di SEGMEN LAIN (host tujuan di subnet lain via router),
nextHopIp = gateway router, owner = router. ARP Request:
  "Who has 192.168.2.1? Tell 192.168.1.10" dikirim sepanjang jalur L2 dari
  pc-a ke R1 — benar.
Namun pada transit router (hop kedua dst pc-b): ARP Request "Who has
192.168.2.20?" dikirim dari port router (fa0/1) sebagai BROADCAST L2 di segmen
tujuan — di Packet Tracer ARP Request untuk IP yang TIDAK ADA akan timeout,
tapi di engine ini resolveOwner mengembalikan null dan error langsung:
"ARP Request timeout: Destination IP 192.168.2.20 tidak ditemukan di topologi."
=> Tidak masalah besar untuk host yang ADA. Untuk host yang TIDAK ADA di segmen,
engine mengembalikan error cepat (benar) — TAPI perilaku "broadcast tidak
dibalas" tidak disimulasikan (tidak ada mekanisme timeout/retry). Minor.

Lebih penting: resolveOwner MENCARI IP GLOBAL di seluruh topologi (line 344-362),
tidak peduli SEGMEN. Jika ada dua host berbeda subnet dengan IP sama (duplikat
IP lintas segmen, misal 192.168.1.10 di segmen A dan B), ARP dari segmen A bisa
dibalas pemilik di segmen B (salah) atau BFS path gagal karena owner di segmen
lain => ping gagal padahal host segmen sendiri ada. Tidak ada pemeriksaan bahwa
owner berada di segmen L2 yang sama dengan sender. Pada realita, ARP hanya
dibalas host di broadcast domain sama; engine menyelesaikan owner GLOBAL.

================================================================================
TEMUAN 4 [SEDANG] countInteriorRouters menghitung SWITCH yang salah karena
menggunakan Set pada hop.toNodeId tanpa memeriksa tipe saat iterasi hop
================================================================================
countInteriorRouters (line 871-882):
  for (let i = 0; i < path.length - 1; i++) interiors.add(path[i].toNodeId);
  ...lalu count bila dev.type === 'router'.
Path hop berisi toNodeId = switch/hub/AP + router; router dihitung. TAPI TTL
reply di emitReplyHops (line 825-869) menurunkan ttlReply UNTUK SETIAP ARRIVAL
ke node router — termasuk saat hop.toNodeId = switch? Tidak: emitReplyHops cek
arrivedDev?.type === 'router', jadi switch TIDAK menurunkan TTL — konsisten.
TAPI hop yang melalui SWITCH LALU ROUTER yang sama (path: pc-a->sw1->r1->sw2)
di-set interiors = {sw1, r1} — sw1 bukan router, tidak dihitung — OK.
Namun bila router dilewati DUA KALI dalam path yang sama (loop fisik lewat
switch tidak mungkin di BFS karena visited). Secara umum hitungan aman untuk
topologi sederhana; berpotensi salah hitung bila jalur melewati switch yang juga
router? Tidak ada device hybrid. => Rendah. Dicatat sebagai potensi off-by-one
bila path berisi device non-L2 (host) di tengah — BFS tidak menaruh host di
tengah, aman.

================================================================================
TEMUAN 5 [SEDANG — KONSISTENSI] TTL reply di emitReplyHops TIDAK simetris
dengan TTL request di planEchoOnce
================================================================================
Request: ttl dimulai 128; tiap transit router ttl -= 1 sebelum hop keluar
(ttlAtHop). Reply: ttlReply = 128, diturunkan SETELAH hop melewati router
(arrivedDev router). Karena reply path = request path dibalik, urutan penurunan
berbeda: request menurunkan SEBELUM hop keluar router; reply menurunkan SETELAH
masuk router. Pada jalur r1->sw2->pc-b (reply), ttlReply tetap 128 sampai tiba
di sw2/pc-b — tidak pernah turun di r1 karena r1 adalah hop PERTAMA (fromNode)
di return path dan penurunan hanya terjadi pada arrivedDev (toNode). Hasil:
paket reply yang ditampilkan di PDU Inspector memiliki TTL 128 di hop keluar r1,
padahal TTL reply yang benar setelah 1 router = 127. Test hanya memeriksa
result.ttl (127) via summary (yang dihitung countInteriorRouters — benar),
tetapi PDU Inspector menampilkan TTL hop reply yang salah (128) — inkonsistensi
visual/edukatif INV-004 (deterministic parity dengan Packet Tracer).

================================================================================
TEMUAN 6 [SEDANG — UI] Worker: pesan ping hanya SEDIKIT yang dipakai; error
planning tidak sampai ke UI
================================================================================
(worker.ts & useSimulationEngine.ts sudah dibaca; perlu verifikasi alur persis
saat implement — lihat catatan bawah.)

================================================================================
TEMUAN 7 [RENDAH — LOGIKA] runPing echo #2+ menganimasikan ulang ARP Request
setelah ARP cache penuh (warm) — tidak masalah.
runPing break setelah echo gagal — bila echo #1 gagal karena ARP timeout,
echo #2+ TIDAK dicoba (break) padahal di Packet Tracer 5 echo dikirim dan
semua timeout => UI menampilkan 1 paket, bukan 5. Minor parity.

================================================================================
TEMUAN 8 [RENDAH — NAT] Translasi NAT dicatat saat PING ke IP publik cloud,
TAPI tabel NAT tidak pernah dibersihkan dan translasi dicatat untuk SETIAP echo
(ICMP id sama, seq beda). natTable max 50 (slice(-49)). Minor.

================================================================================
TEMUAN 9 [RENDAH — CAM] CAM learning di planArp menulis macTable[senderMac] =
hop.toPortId — untuk switch yang sama dengan beberapa link (kasus multipath
tidak mungkin karena BFS path tunggal). TAPI: saat ARP Reply melewati switch,
belajar owner MAC dari hop.toPortId yang merupakan port MENUJU SENDER (arah
reply) — benar. Di jalur request, belajar sender MAC dari hop.toPortId yang
merupakan port ke arah owner — benar. OK.

================================================================================
TEMUAN 10 [RENDAH — MODEL] broadcastPaths TIDAK dipakai untuk ping; ARP
broadcast disimulasikan hanya sepanjang jalur menuju owner. Akibat: switch
TIDAK mempelajari MAC host lain di segmen yang sama (yang tidak dilalui jalur),
dan tabel CAM/ARP UI tidak menunjukkan flooding. Konsekuensi edukatif: siswa
tidak melihat switch flood ke semua port. Minor parity vs Packet Tracer.
