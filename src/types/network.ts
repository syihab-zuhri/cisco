export type DeviceType = 'pc' | 'switch' | 'router';

export interface PhysicalPort {
  id: string; // e.g. "fa0", "fa0/0"
  name: string; // e.g. "FastEthernet 0", "FastEthernet 0/1"
  status: 'up' | 'down';
  ipAddress?: string; // e.g. "192.168.1.10"
  subnetMask?: string; // e.g. "255.255.255.0"
  macAddress: string; // e.g. "00:50:79:66:68:01"
  connectedEdgeId?: string;
  connectedToNodeId?: string;
  connectedToPortId?: string;
}

export interface RoutingEntry {
  network: string; // e.g. "192.168.2.0"
  subnetMask: string; // e.g. "255.255.255.0"
  nextHop: string; // e.g. "192.168.1.1" or "Directly Connected"
  interfaceId: string; // e.g. "fa0/0"
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
  macTable?: Record<string, string>; // for Switch: MAC -> portId
  arpTable?: Record<string, string>; // IP -> MAC
};

// Kontrak kabel fisik yang dikirim ke simulation engine (INV-002).
export interface TopologyLink {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
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
  type: 'ARP_REQ' | 'ARP_REP' | 'ICMP_REQ' | 'ICMP_REP';
  currentProtocol: 'ARP' | 'ICMP';
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
