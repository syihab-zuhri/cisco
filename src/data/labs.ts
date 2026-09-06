import { type Node, type Edge } from '@xyflow/react';
import { type DeviceData } from '../types/network';

/**
 * Mode Lab Praktikum (blueprint P1, PLANNING.md §5.2): skenario latihan
 * pre-built dengan topologi terkunci dan kriteria verifikasi otomatis.
 */

export type LabCheck =
  | { type: 'ping-success'; sourceNodeId: string; targetIp: string }
  | { type: 'gateway'; deviceId: string; gateway: string }
  | { type: 'device-ip'; deviceId: string; ipPrefix: string }
  | { type: 'nat-entry'; deviceId: string }
  | { type: 'route-learned'; deviceId: string; network: string };

export interface LabObjective {
  id: string;
  description: string;
  check: LabCheck;
}

export interface LabScenario {
  id: string;
  title: string;
  story: string;
  difficulty: 'Dasar' | 'Menengah';
  nodes: Node<DeviceData>[];
  edges: Edge[];
  objectives: LabObjective[];
  hints: string[];
}

export interface LabEvalInput {
  nodes: Node<DeviceData>[];
  lastPing?: { sourceNodeId: string; targetIp: string; success: boolean } | null;
}

/** Evaluator murni (tanpa DOM) — objektif dianggap terpenuhi secara monoton. */
export function evaluateLab(lab: LabScenario, input: LabEvalInput): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const objective of lab.objectives) {
    result[objective.id] = checkObjective(objective.check, input);
  }
  return result;
}

function checkObjective(check: LabCheck, input: LabEvalInput): boolean {
  const deviceId = 'deviceId' in check ? check.deviceId : '';
  const device = input.nodes.find((n) => n.id === deviceId)?.data;
  switch (check.type) {
    case 'ping-success':
      return (
        !!input.lastPing &&
        input.lastPing.sourceNodeId === check.sourceNodeId &&
        input.lastPing.targetIp === check.targetIp &&
        input.lastPing.success
      );
    case 'gateway':
      return device?.defaultGateway === check.gateway;
    case 'device-ip':
      return !!device?.ports.some((p) => p.ipAddress?.startsWith(check.ipPrefix));
    case 'nat-entry':
      return (device?.natTable?.length ?? 0) > 0;
    case 'route-learned':
      return !!device?.routes?.some(
        (r) => r.network === check.network && r.source === 'rip'
      );
  }
}

// ---------------------------------------------------------------------------
// Skenario lab
// ---------------------------------------------------------------------------

const pc = (
  id: string,
  label: string,
  ip: string,
  gateway: string,
  mac: string,
  x: number,
  y: number,
  linkedEdge?: string,
  linkedNode?: string
): Node<DeviceData> => ({
  id,
  type: 'deviceNode',
  position: { x, y },
  data: {
    id,
    label,
    type: 'pc',
    defaultGateway: gateway,
    ports: [
      {
        id: 'fa0',
        name: 'FastEthernet 0',
        status: 'up',
        kind: 'ethernet',
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        macAddress: mac,
        ...(linkedEdge ? { connectedEdgeId: linkedEdge, connectedToNodeId: linkedNode, connectedToPortId: 'fa0/0' } : {}),
      },
      { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: `${mac}:W`, ssid: '' },
    ],
    arpTable: {},
  },
});

const routerInterface = (id: string, label: string, ip: string, mac: string) => ({
  id,
  name: label,
  status: 'up' as const,
  kind: 'ethernet' as const,
  ipAddress: ip,
  subnetMask: '255.255.255.0',
  macAddress: mac,
});

/** LAB 1 — contoh langsung dari blueprint: "perbaiki gateway yang salah". */
const labGatewaySalah: LabScenario = {
  id: 'gateway-salah',
  title: 'Lab 1 · Perbaiki Gateway yang Salah',
  story:
    'PC-Staff (192.168.1.10) mengeluh tidak bisa menjangkau server di subnet lain (192.168.2.20). Konfigurasi kabel dan IP sudah benar — tapi ada satu kesalahan konfigurasi yang harus Anda temukan dan perbaiki.',
  difficulty: 'Dasar',
  nodes: [
    pc('pc-1', 'PC-Staff', '192.168.1.10', '192.168.1.99', '00:50:79:L1:01:01', 120, 320, 'edge-l1-pc1', 'r-1'),
    {
      id: 'r-1',
      type: 'deviceNode',
      position: { x: 380, y: 160 },
      data: {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { ...routerInterface('fa0/0', 'FastEthernet 0/0 (LAN A)', '192.168.1.1', '00:50:79:L1:RT:01'), connectedEdgeId: 'edge-l1-pc1', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
          { ...routerInterface('fa0/1', 'FastEthernet 0/1 (LAN B)', '192.168.2.1', '00:50:79:L1:RT:02'), connectedEdgeId: 'edge-l1-pc2', connectedToNodeId: 'pc-2', connectedToPortId: 'fa0' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L1:RT:03' },
        ],
        routes: [],
        arpTable: {},
      },
    },
    pc('pc-2', 'Server-2', '192.168.2.20', '192.168.2.1', '00:50:79:L1:02:01', 660, 320, 'edge-l1-pc2', 'r-1'),
  ],
  edges: [
    { id: 'edge-l1-pc1', source: 'pc-1', target: 'r-1', sourceHandle: 'fa0', targetHandle: 'fa0/0', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/0 (LAN A)' } },
    { id: 'edge-l1-pc2', source: 'pc-2', target: 'r-1', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1 (LAN B)' } },
  ],
  objectives: [
    { id: 'gw', description: 'Perbaiki Default Gateway PC-Staff menjadi 192.168.1.1', check: { type: 'gateway', deviceId: 'pc-1', gateway: '192.168.1.1' } },
    { id: 'ping', description: 'Ping dari PC-Staff ke 192.168.2.20 berhasil', check: { type: 'ping-success', sourceNodeId: 'pc-1', targetIp: '192.168.2.20' } },
  ],
  hints: [
    'Cek konfigurasi PC-Staff (ikon gear) — bandingkan Default Gateway dengan IP LAN-A router.',
    'Default gateway yang benar adalah alamat interface router di subnet yang sama: 192.168.1.1.',
    'Setelah disimpan, kirim ping dari Toolbar: pilih PC-Staff, tujuan 192.168.2.20.',
  ],
};

/** LAB 2 — NAT ke cloud internet. */
const labNatInternet: LabScenario = {
  id: 'nat-internet',
  title: 'Lab 2 · Nyalakan Internet dengan NAT',
  story:
    'Router sudah punya default route ke Cloud, tapi host lokal belum bisa menjangkau 8.8.8.8. Aktifkan NAT pada interface WAN, buktikan dengan ping, dan amati tabel translasinya.',
  difficulty: 'Menengah',
  nodes: [
    pc('pc-1', 'PC-Rumah', '192.168.10.20', '192.168.10.1', '00:50:79:L2:01:01', 120, 300, 'edge-l2-pc', 'r-1'),
    {
      id: 'r-1',
      type: 'deviceNode',
      position: { x: 400, y: 150 },
      data: {
        id: 'r-1',
        label: 'Router-Rumah',
        type: 'router',
        ports: [
          { ...routerInterface('fa0/0', 'FastEthernet 0/0 (LAN)', '192.168.10.1', '00:50:79:L2:RT:01'), connectedEdgeId: 'edge-l2-pc', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L2:RT:02' },
          {
            id: 'fa0/2', name: 'FastEthernet 0/2 (WAN)', status: 'up', kind: 'ethernet',
            ipAddress: '203.0.113.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:L2:RT:03',
            connectedEdgeId: 'edge-l2-cloud', connectedToNodeId: 'cloud-1', connectedToPortId: 'wan0',
          },
        ],
        routes: [{ network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.2', interfaceId: 'fa0/2' }],
        arpTable: {},
      },
    },
    {
      id: 'cloud-1',
      type: 'deviceNode',
      position: { x: 680, y: 150 },
      data: {
        id: 'cloud-1',
        label: 'Cloud',
        type: 'cloud',
        ports: [
          { id: 'wan0', name: 'WAN 0', status: 'up', kind: 'ethernet', ipAddress: '203.0.113.2', subnetMask: '255.255.255.252', macAddress: '00:50:79:L2:CL:01', connectedEdgeId: 'edge-l2-cloud', connectedToNodeId: 'r-1', connectedToPortId: 'fa0/2' },
          { id: 'wan1', name: 'WAN 1', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L2:CL:02' },
        ],
        arpTable: {},
      },
    },
  ],
  edges: [
    { id: 'edge-l2-pc', source: 'pc-1', target: 'r-1', sourceHandle: 'fa0', targetHandle: 'fa0/0', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/0 (LAN)' } },
    { id: 'edge-l2-cloud', source: 'r-1', target: 'cloud-1', sourceHandle: 'fa0/2', targetHandle: 'wan0', type: 'networkCable', data: { sourcePortName: 'fa0/2 (WAN)', targetPortName: 'WAN 0' } },
  ],
  objectives: [
    { id: 'nat', description: 'Aktifkan NAT pada interface WAN router dan catat translasi (ping 8.8.8.8)', check: { type: 'nat-entry', deviceId: 'r-1' } },
    { id: 'ping', description: 'Ping dari PC-Rumah ke 8.8.8.8 berhasil', check: { type: 'ping-success', sourceNodeId: 'pc-1', targetIp: '8.8.8.8' } },
  ],
  hints: [
    'Ping 8.8.8.8 dulu untuk melihat gejalanya sebelum mengubah apa pun.',
    'Buka konfigurasi Router-Rumah → pilih port fa0/2 (WAN) → centang "NAT/PAT keluar pada interface ini".',
    'Ping ulang 8.8.8.8, lalu buka tab Tabel (pilih router) untuk melihat tabel translasi NAT.',
  ],
};

/** LAB 3 — inter-VLAN routing (router-on-a-stick). */
const labVlan: LabScenario = {
  id: 'hubungkan-vlan',
  title: 'Lab 3 · Hubungkan Dua VLAN',
  story:
    'Switch sudah benar: fa0/2 untuk VLAN 10 (Staff), fa0/3 untuk VLAN 20 (Guest), fa0/1 trunk ke router. Tapi PC-Staff tetap tidak bisa menjangkau PC-Guest — router belum punya sub-interface. Lengkapi dia.',
  difficulty: 'Menengah',
  nodes: [
    {
      id: 'r-1',
      type: 'deviceNode',
      position: { x: 380, y: 90 },
      data: {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0 (Trunk)', status: 'up', kind: 'ethernet', portMode: 'trunk', macAddress: '00:50:79:L3:RT:01', connectedEdgeId: 'edge-l3-r-sw', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:RT:02' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:RT:03' },
        ],
        routes: [],
        arpTable: {},
      },
    },
    {
      id: 'sw-1',
      type: 'deviceNode',
      position: { x: 380, y: 250 },
      data: {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', portMode: 'trunk', macAddress: '00:50:79:L3:SW:01', connectedEdgeId: 'edge-l3-r-sw', connectedToNodeId: 'r-1', connectedToPortId: 'fa0/0' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', portMode: 'access', vlanId: 10, macAddress: '00:50:79:L3:SW:02', connectedEdgeId: 'edge-l3-pc1', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', portMode: 'access', vlanId: 20, macAddress: '00:50:79:L3:SW:03', connectedEdgeId: 'edge-l3-pc2', connectedToNodeId: 'pc-2', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:SW:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:SW:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:SW:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:SW:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:L3:SW:08' },
        ],
        macTable: {},
      },
    },
    {
      id: 'pc-1',
      type: 'deviceNode',
      position: { x: 120, y: 400 },
      data: {
        id: 'pc-1',
        label: 'PC-Staff',
        type: 'pc',
        defaultGateway: '192.168.10.1',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', vlanId: 10, ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:L3:P1:01', connectedEdgeId: 'edge-l3-pc1', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/2' },
          { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:L3:P1:02', ssid: '' },
        ],
        arpTable: {},
      },
    },
    {
      id: 'pc-2',
      type: 'deviceNode',
      position: { x: 660, y: 400 },
      data: {
        id: 'pc-2',
        label: 'PC-Guest',
        type: 'pc',
        defaultGateway: '192.168.20.1',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', vlanId: 20, ipAddress: '192.168.20.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:L3:P2:01', connectedEdgeId: 'edge-l3-pc2', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/3' },
          { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:L3:P2:02', ssid: '' },
        ],
        arpTable: {},
      },
    },
  ],
  edges: [
    { id: 'edge-l3-r-sw', source: 'r-1', target: 'sw-1', sourceHandle: 'fa0/0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/0 (Trunk)', targetPortName: 'fa0/1 (Trunk)' } },
    { id: 'edge-l3-pc1', source: 'pc-1', target: 'sw-1', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0 (VLAN 10)', targetPortName: 'fa0/2 (VLAN 10)' } },
    { id: 'edge-l3-pc2', source: 'pc-2', target: 'sw-1', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0 (VLAN 20)', targetPortName: 'fa0/3 (VLAN 20)' } },
  ],
  objectives: [
    { id: 'subif', description: 'Router punya sub-interface VLAN 10 (192.168.10.1/24) & VLAN 20 (192.168.20.1/24)', check: { type: 'device-ip', deviceId: 'r-1', ipPrefix: '192.168.10.1' } },
    { id: 'ping', description: 'Ping dari PC-Staff ke PC-Guest (192.168.20.10) berhasil', check: { type: 'ping-success', sourceNodeId: 'pc-1', targetIp: '192.168.20.10' } },
  ],
  hints: [
    'Tanpa sub-interface, router tidak punya IP di VLAN mana pun — gateway PC tidak terjawab.',
    'Buka konfigurasi Router-1 → port fa0/0 (Trunk) → tambah Sub-interface VLAN 10 (192.168.10.1/24) dan VLAN 20 (192.168.20.1/24).',
    'Ping lintas VLAN kini melewati router — TTL turun 1 (lihat PDU Inspector!).',
  ],
};

export const LAB_SCENARIOS: LabScenario[] = [labGatewaySalah, labNatInternet, labVlan];
