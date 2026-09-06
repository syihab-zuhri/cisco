export type DeviceType =
  | 'pc'
  | 'laptop'
  | 'server'
  | 'switch'
  | 'hub'
  | 'router'
  | 'accessPoint'
  | 'cloud';

/** Perangkat end-host yang berperilaku seperti PC (host L3 biasa). */
export const HOST_DEVICE_TYPES: DeviceType[] = ['pc', 'laptop', 'server'];

/** Perangkat L2 yang bisa menjadi perantara jalur (switch/AP belajar CAM; hub murni repeater). */
export const L2_INTERMEDIATE_TYPES: DeviceType[] = ['switch', 'hub', 'accessPoint'];

/** Tipe perangkat yang melakukan CAM learning (jembatan L2). */
export const CAM_LEARNING_TYPES: DeviceType[] = ['switch', 'accessPoint'];

export function isHostType(type: DeviceType): boolean {
  return HOST_DEVICE_TYPES.includes(type);
}

export function isL2Intermediate(type: DeviceType): boolean {
  return L2_INTERMEDIATE_TYPES.includes(type);
}

export function learnsCam(type: DeviceType): boolean {
  return CAM_LEARNING_TYPES.includes(type);
}

export type PortKind = 'ethernet' | 'wireless';

/** Pool DHCP pada interface router (blueprint P1: router sebagai DHCP server). */
export interface DhcpPool {
  enabled: boolean;
  network: string; // e.g. "192.168.1.0"
  mask: string; // e.g. "255.255.255.0"
  startIp: string; // awal rentang alokasi
  maxClients: number;
}

/** Entri translasi NAT/PAT untuk ICMP (router dengan port natEnabled). */
export interface NatTranslation {
  insideIp: string; // IP host lokal
  globalIp: string; // IP WAN router
  icmpId: number;
  echoSeq: number;
}

export interface PhysicalPort {
  id: string; // e.g. "fa0", "fa0/0", "wla0", "radio0"
  name: string; // e.g. "FastEthernet 0", "Wireless Adapter"
  status: 'up' | 'down';
  kind?: PortKind; // default 'ethernet' — port radio/klien WiFi memakai 'wireless'
  ipAddress?: string; // e.g. "192.168.1.10"
  subnetMask?: string; // e.g. "255.255.255.0"
  macAddress: string; // e.g. "00:50:79:66:68:01"
  connectedEdgeId?: string;
  connectedToNodeId?: string;
  connectedToPortId?: string;
  ssid?: string; // hanya port wireless: SSID yang di-broadcast (AP) atau dituju (klien)
  dhcpEnabled?: boolean; // klien: minta IP via DHCP (DORA)
  natEnabled?: boolean; // router: NAT/PAT keluar pada interface ini
  vlanId?: number; // VLAN access port (default 1); trunk membawa semua VLAN
  portMode?: 'access' | 'trunk';
  /** Router-on-a-stick: sub-interface tagged per VLAN pada port trunk router. */
  subInterfaces?: Array<{ vlanId: number; ipAddress: string; subnetMask: string }>;
}

export interface RoutingEntry {
  network: string; // e.g. "192.168.2.0"
  subnetMask: string; // e.g. "255.255.255.0"
  nextHop: string; // e.g. "192.168.1.1" or "Directly Connected"
  interfaceId: string; // e.g. "fa0/0"
  metric?: number; // RIP hop count (connected = 1)
  source?: 'static' | 'rip' | 'connected';
}

// Type alias (bukan interface) agar memenuhi constraint Record<string, unknown>
// pada generic Node<T> milik @xyflow/react v12.
export type DeviceData = {
  id: string;
  label: string;
  type: DeviceType;
  ports: PhysicalPort[];
  defaultGateway?: string; // for PC
  routes?: RoutingEntry[]; // for Router
  dhcpPools?: Record<string, DhcpPool>; // for Router: portId → pool
  natTable?: NatTranslation[]; // for Router: translasi aktif (ICMP)
  ripEnabled?: boolean; // for Router: ikut serta RIPv2
  macTable?: Record<string, string>; // for Switch: MAC -> portId
  arpTable?: Record<string, string>; // IP -> MAC

  // ---- Anotasi kanvas (v1.4.0): square & teks custom di belakang perangkat ----
  /** 'device' (default) | 'square' | 'text' — pembeda node anotasi vs perangkat. */
  nodeKind?: 'device' | 'square' | 'text';
  /** Square: warna isi (rgba semi-transparan) & border. */
  fill?: string;
  stroke?: string;
  /** Square: ukuran dalam px. */
  width?: number;
  height?: number;
  /** Teks custom: konten & ukuran font. */
  text?: string;
  fontSize?: number;
};

// Kontrak kabel fisik / asosiasi nirkabel yang dikirim ke simulation engine (INV-002).
export interface TopologyLink {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  kind?: 'ethernet' | 'wireless';
}

export interface CableConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export type SimulationSpeed = 0.5 | 1 | 2;
export type SimulationStatus = 'idle' | 'running' | 'paused';

export interface PacketHopPayload {
  packetId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string;
  targetPortId: string;
  type:
    | 'ARP_REQ'
    | 'ARP_REP'
    | 'ICMP_REQ'
    | 'ICMP_REP'
    | 'DHCP_DISCOVER'
    | 'DHCP_OFFER'
    | 'DHCP_REQUEST'
    | 'DHCP_ACK'
    | 'RIP_UPDATE';
  currentProtocol: 'ARP' | 'ICMP' | 'DHCP' | 'RIP';
  summary: string;
  details?: Record<string, any>;
}

export interface PingSimulationRequest {
  sourceNodeId: string;
  targetIp: string;
}

export interface SimulationEventLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'ARP' | 'ICMP' | 'ERROR' | 'SUCCESS';
  message: string;
}
