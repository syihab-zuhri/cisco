/**
 * Model PDU berlapis (PRD-002 §9): EthernetFrame (L2) → IPv4Packet (L3) →
 * ArpPacket/IcmpPacket (L4). Dipakai oleh PDU Inspector untuk menampilkan
 * header tiap lapisan pada setiap hop — MAC frame ditulis ulang per hop,
 * sedangkan IP/TTL milik paket end-to-end.
 */

export interface EthernetFrame {
  srcMac: string;
  dstMac: string;
  ethertype: 'ARP' | 'IPv4';
}

export interface ArpPacket {
  opcode: 1 | 2; // 1 = request (broadcast), 2 = reply (unicast)
  senderIp: string;
  senderMac: string;
  targetIp: string;
  targetMac?: string;
}

export interface IPv4Packet {
  srcIp: string;
  dstIp: string;
  ttl: number;
  protocol: 'ICMP';
  id: number;
}

export interface IcmpPacket {
  type: 0 | 8; // 8 = echo request, 0 = echo reply
  code: 0;
  identifier: number;
  sequence: number;
  payloadBytes: number;
}

export interface PduSnapshot {
  frame: EthernetFrame;
  packet?: IPv4Packet;
  segment?: ArpPacket | IcmpPacket;
  dhcp?: DhcpPacket;
  /** Catatan edukatif tambahan (mis. "VLAN 10", "NAT: src di-rewrite", "UDP 67→68"). */
  note?: string;
}

/** Paket DHCP (UDP 67/68) — messageType 1=Discover 2=Offer 3=Request 5=Ack. */
export interface DhcpPacket {
  messageType: 1 | 2 | 3 | 5;
  clientId: string; // MAC klien
  yiaddr?: string; // IP yang ditawarkan/diberikan
  serverId?: string; // IP interface DHCP server
}

/** Mutasi tabel terjadwal agar GUI (Table Viewer) hidup selama playback. */
export type SimEffect =
  | { type: 'CAM_LEARN'; nodeId: string; mac: string; portId: string; vlan: number }
  | { type: 'ARP_LEARN'; nodeId: string; ip: string; mac: string }
  | {
      type: 'DHCP_LEASE';
      nodeId: string;
      portId: string;
      ipAddress: string;
      subnetMask: string;
      gateway: string;
    }
  | { type: 'NAT_TRANSLATE'; nodeId: string; insideIp: string; globalIp: string; icmpId: number; echoSeq: number };

/** Satu langkah terjadwal dalam aliran simulasi (deterministik, INV-004). */
export interface SimEvent {
  seq: number;
  simTimeMs: number;
  kind:
    | 'ARP_REQ'
    | 'ARP_REP'
    | 'ICMP_REQ'
    | 'ICMP_REP'
    | 'DHCP_DISCOVER'
    | 'DHCP_OFFER'
    | 'DHCP_REQUEST'
    | 'DHCP_ACK'
    | 'LOG';
  level: 'INFO' | 'ARP' | 'ICMP' | 'ERROR' | 'SUCCESS' | 'DHCP';
  message: string;
  hop?: {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    kind: 'ethernet' | 'wireless';
  };
  pdu?: PduSnapshot;
  effects?: SimEffect[];
}
