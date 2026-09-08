# Catatan audit non-regresi OpenPacket — hasil probe eksekusi nyata (07-09-2026)
# Setiap kasus di bawah sudah DIEKSEKUSI terhadap engine saat ini; bukan spekulasi.

## KONFIRMASI 1 — host DENGAN default gateway HARUS melalui gateway (perilaku host normal)
- Topologi: PC-A(192.168.1.10, gw 192.168.1.1) — sw1 — R1(192.168.1.1/192.168.2.1) — sw1 — PC-B(192.168.2.20, gw 192.168.2.1)
- executePing('pc-a','192.168.2.20') => SUCCESS, TTL 127. (KONFIRMASI POSITIF)

## KONFIRMASI 2 — router-on-a-stick + VLAN: sub-interface LANGSUNG di port tujuan
- Topologi persis buildVlanLab (parity/labVerify menyalin ini):
  PC-1(192.168.10.10,vlan10,trunk-sw) — SW(trunk fa0/1; access vlan10 fa0/2; access vlan20 fa0/3) — PC-2(192.168.20.10,vlan20)
  Router(port fa0/0 TRUNK + sub-interfaces vlan10 192.168.10.1 & vlan20 192.168.20.1) terhubung trunk ke SW.fa0/1
- PING PC-1 192.168.20.10 => SUCCESS TTL127. KONFIRMASI POSITIF
- (Varian LAB3: host ditulis sebagai "192.168.20.10/24 vlan20" dsb — setara.)

## TERBUKTI GAGAL 1 — host tanpap gateway / gateway TIDAK ADA di topologi, host BEDA subnet, SWITCH TIDAK ADA
- Topologi: PC-A(192.168.1.10, gw 192.168.1.1) dan PC-B(192.168.2.20) TANPA kabel.
- executePing pc-a -> 192.168.2.20 => GAGAL "ARP Request timeout: Destination IP 192.168.1.1 tidak ditemukan di topologi."
  => BENAR (tidak ada segmen L2).

## TERBUKTI GAGAL 2 — host BER-gateway 192.168.1.1, host BEDA subnet (192.168.2.20), tapi GATEWAY & ROUTER TIDAK ADA; ada SWITCH
- Topologi: PC-A(192.168.1.10, gw 192.168.1.1) — sw — PC-B(192.168.2.20). Router TIDAK ADA.
- executePing pc-a -> 192.168.2.20 => GAGAL "ARP Request timeout: ...192.168.1.1 tidak ditemukan di topologi."
  => BENAR: gateway tak ada.

## TERBUKTI GAGAL 3 — [LAB-1 & AUDIT] host BER-gateway 192.168.1.1, host BEDA subnet 192.168.2.20, switch ADA, router ADA & TERHUBUNG
  (Router: fa0/0 192.168.1.1 UP, fa0/1 192.168.2.1 UP — TIDAK ADA static route / RIP.)
- Topologi: PC-A — sw1 — R1 — sw1 — PC-B (semua link up, R1 di segmen A & B).
- executePing pc-a -> 192.168.2.20 => GAGAL "Tidak ada jalur fisik/Layer-2 antara r1 dan pc-b."
  => BUG terkonfirmasi. Dengan router up di kedua segmen, aliran AKSES INTERNET / LAB-1
  = ARP 192.168.1.1 -> ICMP ke R1 -> ARP 192.168.2.20 -> ICMP — HARUS SUKSES.

## TERBUKTI GAGAL 4 — [LAB-1 'satu-kabel'] host di segmen sama (192.168.1.10 & 192.168.1.20) — LANGSUNG (tanpa switch)
- PC-A(192.168.1.10) — kabel — PC-B(192.168.1.20). Tidak ada gateway.
- executePing pc-a -> 192.168.1.20 => GAGAL "Tidak ada jalur fisik/Layer-2 antara pc-a dan pc-b."
  (karena BFS tidak traverses HOST non-L2, jadi jalan ke host lain butuh switch/router di antara.)

## TERBUKTI GAGAL 5 — [LAB-3 'akses beda VLAN' TANPA router sub-if di antara]
- PC-1 vlan10 192.168.10.10 — sw(access) — PC-2 vlan20 192.168.20.10 — TRUNK sw ke router sub-if TIDAK ADA di topologi ini
- executePing pc-1 -> 192.168.20.10 => GAGAL. BENAR (bedа VLAN butuh router; tanpa router gagal).

## TERBUKTI GAGAL 6 — semua port switch access vlanId 99 + host TANPA vlanId (default 1) — host di segmen berbeda -> GAGAL:
- sw semua port vlan 99 (access), PC-A(192.168.1.10) & PC-B(192.168.1.20) default vlan 1, router R1 di port vlan 99.
- executePing pc-a -> 192.168.1.20 => GAGAL (PC-A di vlan1, PC-B di vlan1; R1 di vlan99; BFS dari pc-a
  cuma capai sw, karena link pc-a->sw diblok vlan 1 vs 99; hasil error "Tidak ada jalur fisik/Layer-2").

## BUG BARU KONFIRMASI — ARP broadcast dikirim SEPANJANG PATH KE OWNER SAJA (broadcastPaths TIDAK DIPAKAI UNTUK PING)
- planPing pc-a->192.168.2.20 (topologi Dual-LAN): hanya 2 hop ARP_REQ (pc-a->sw1, sw1->r1).
  ARP_REQ TIDAK menjangkau pc-b di segmen lain — BENAR secara konsep (ARP tidak melewati router).
- TAPI: dengan switch di segmen yang sama (multi-host), ARP broadcast hanya di-flood ke jalur menuju
  pemilik ARP — TIDAK ke semua host. Efek CAM/ARP table yang lain tidak diisi. (Konsekuensi UI minor.)

## CATATAN: ARP table update di dalam planArp menulis sender->owner.owner->sender; switch CAM belajar. OK.
## CATATAN: findL2Path (fromPortId) = ROOT DI PORT SUMBER — segmen L2 hanya bisa dicapai dari port sumber.

## VERDICT FINDING UTAMA (BUTUH perhatian):
1. PING antar-segmen via ROUTER yang terhubung langsung di kedua segmen GAGAL — alur host -> router -> host rusak,
   walaupun semua test suite hijau. => root cause di findL2Path/sender traverse di ping loop (lihat code).
2. Host dengan defaultGateway ke router yang TIDAK terhubung (tidak ada path L2) => ARP timeout. BENAR.
3. VLAN access 1 vs 99 mismatch di switch: semua host default vlan1 -> tidak bisa saling ping walau di segmen sama.
   Di Packet Tracer, port access default = VLAN 1 — host di switch port default vlan1 akan terhubung;
   perilaku ini bisa jadi regresi dari aturan "port access vlanId harus sama".
