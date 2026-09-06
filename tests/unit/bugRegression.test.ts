import { describe, it, expect } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { isPrivateIp } from '../../src/utils/ipUtils';
import { evaluateLab, type LabScenario } from '../../src/data/labs';
import { type DeviceData, type PacketHopPayload } from '../../src/types/network';
import { type Node } from '@xyflow/react';

/** Regresi untuk temuan audit bug (BUG-1..5). */

function makePc(id: string, ip: string, mac: string, gateway?: string): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'pc',
    ports: [
      { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: ip, subnetMask: '255.255.255.0', macAddress: mac },
    ],
    defaultGateway: gateway,
    arpTable: {},
  };
}

function makeSwitch(id: string): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'switch',
    ports: [
      { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: `00:50:79:${id}:01` },
      { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: `00:50:79:${id}:02` },
    ],
    macTable: {},
  };
}

describe('BUG-2: cloud menolak IP privat tanpa NAT', () => {
  const setup = () => {
    const pc = makePc('pc-1', '192.168.10.20', '00:50:79:AA:BB:01', '192.168.10.1');
    const router: DeviceData = {
      id: 'r-1', label: 'R1', type: 'router',
      ports: [
        { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/2', name: 'WAN', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:R1:02' },
      ],
      routes: [{ network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.2', interfaceId: 'fa0/2' }],
      arpTable: {},
    };
    const cloud: DeviceData = {
      id: 'cloud-1', label: 'Cloud', type: 'cloud',
      ports: [{ id: 'wan0', name: 'WAN 0', status: 'up', ipAddress: '203.0.113.2', subnetMask: '255.255.255.252', macAddress: '00:50:79:CL:01' }],
      arpTable: {},
    };
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(
      [pc, router, cloud],
      [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/2', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
      ]
    );
    return engine;
  };

  it('tanpa NAT: ping 8.8.8.8 DITOLAK dengan pesan eksplisit (premis Lab 2 kini benar)', async () => {
    const result = await setup().executePing('pc-1', '8.8.8.8');
    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('tanpa NAT');
  });

  it('dengan NAT: ping 8.8.8.8 sukses (TTL 126)', async () => {
    const engine = setup();
    // Aktifkan NAT pada WAN router (seperti yang dilabukan siswa)
    const r = engine.getDevices().find((d) => d.id === 'r-1')!;
    r.ports.find((p) => p.id === 'fa0/2')!.natEnabled = true;

    const result = await engine.executePing('pc-1', '8.8.8.8');
    expect(result.success).toBe(true);
    expect(result.ttl).toBe(126);
  });
});

describe('BUG-4: frame keluar dari port sumber yang benar', () => {
  it('dual-homed laptop: hop pertama keluar dari port yang subnet-nya cocok (srcMac konsisten)', async () => {
    const laptop: DeviceData = {
      id: 'lap-1', label: 'Laptop-1', type: 'laptop',
      ports: [
        { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.99.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:LP:04:01' },
        { id: 'wla0', name: 'Wireless Adapter', status: 'up', kind: 'wireless', ipAddress: '192.168.10.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:LP:04:02', ssid: 'KantorWiFi' },
      ],
      arpTable: {},
    };
    const swA = makeSwitch('sw-a');
    const swB = makeSwitch('sw-b');
    const pcX = makePc('pc-x', '192.168.10.30', '00:50:79:XX:01:01');
    const links = [
      { sourceNodeId: 'lap-1', sourcePortId: 'fa0', targetNodeId: 'sw-a', targetPortId: 'fa0/1' },
      { sourceNodeId: 'lap-1', sourcePortId: 'wla0', targetNodeId: 'sw-b', targetPortId: 'fa0/1', kind: 'wireless' as const },
      { sourceNodeId: 'sw-a', sourcePortId: 'fa0/2', targetNodeId: 'pc-x', targetPortId: 'fa0' },
      { sourceNodeId: 'sw-b', sourcePortId: 'fa0/2', targetNodeId: 'pc-x', targetPortId: 'fa0' },
    ];
    const hops: PacketHopPayload[] = [];
    const engine = new HeadlessSimulationEngine(async (e) => {
      if (e.type === 'SIMULATION_STEP') hops.push(e.payload);
    });
    engine.setTopology([laptop, swA, swB, pcX], links);

    const result = await engine.executePing('lap-1', '192.168.10.30');
    expect(result.success).toBe(true);

    // Hop pertama keluar dari wla0 (bukan fa0) — srcMac = pemilik srcIp
    const firstHop = hops.find((h) => h.sourceNodeId === 'lap-1')!;
    expect(firstHop.sourcePortId).toBe('wla0');
  });
});

describe('BUG-3: DHCP tidak menawarkan alamat broadcast / luar subnet', () => {
  const setup = (startIp: string) => {
    const pc = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    const sw = makeSwitch('sw-1');
    const router: DeviceData = {
      id: 'r-1', label: 'R1', type: 'router',
      ports: [{ id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' }],
      dhcpPools: {
        'fa0/0': { enabled: true, network: '192.168.1.0', mask: '255.255.255.0', startIp, maxClients: 50 },
      },
      routes: [],
      arpTable: {},
    };
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(
      [pc, sw, router],
      [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      ]
    );
    return engine;
  };

  it('startIp .253 dengan .253-.254 terisi → kandidat .255 (broadcast) & luar subnet di-skip → pool penuh', () => {
    const engine = setup('192.168.1.253');
    // Isi .253 dan .254 dengan perangkat statis (via ARP-like lease langsung)
    const r = engine.getDevices().find((d) => d.id === 'r-1')!;
    r.arpTable = {};
    const pc1 = engine.getDevices().find((d) => d.id === 'pc-1')!;
    pc1.ports[0].ipAddress = '192.168.1.253';
    const extra: DeviceData = {
      id: 'pc-extra', label: 'PC-X', type: 'pc',
      ports: [{ id: 'fa0', name: 'fa0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:XX:99:01' }],
      arpTable: {},
    };
    engine.setTopology(
      [pc1, extra, engine.getDevices().find((d) => d.id === 'sw-1')!, r],
      [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      ]
    );

    const plan = engine.planDhcp('pc-1', 'fa0');
    const lease = plan.events.flatMap((e) => e.effects ?? []).find((e) => e.type === 'DHCP_LEASE');
    // .255 = broadcast dan .256+ = luar subnet — TIDAK BOLEH ditawarkan
    expect(lease).toBeUndefined();
    expect(plan.summary.success).toBe(false);
  });

  it('startIp .254 masih menawarkan host valid terakhir (.254, bukan .255)', () => {
    const plan = setup('192.168.1.254').planDhcp('pc-1', 'fa0');
    const lease = plan.events.flatMap((e) => e.effects ?? []).find((e) => e.type === 'DHCP_LEASE');
    expect(lease?.ipAddress).toBe('192.168.1.254');
  });
});

describe('BUG-1: objektif lab device-ip membaca sub-interface', () => {
  it('sub-interface VLAN 10 (192.168.10.1) terdeteksi pada port router', () => {
    const lab: LabScenario = {
      id: 't', title: 't', story: '', difficulty: 'Dasar', nodes: [], edges: [], hints: [],
      objectives: [
        { id: 'subif', description: '', check: { type: 'device-ip', deviceId: 'r-1', ipPrefix: '192.168.10.1' } },
      ],
    };
    const nodes: Node<DeviceData>[] = [
      {
        id: 'r-1', type: 'deviceNode', position: { x: 0, y: 0 },
        data: {
          id: 'r-1', label: 'R1', type: 'router',
          ports: [
            {
              id: 'fa0/0', name: 'trunk', status: 'up', kind: 'ethernet', portMode: 'trunk', macAddress: '00:50:79:VR:01',
              subInterfaces: [
                { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
                { vlanId: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' },
              ],
            },
          ],
          arpTable: {},
        },
      },
    ];
    const result = evaluateLab(lab, { nodes });
    expect(result.subif).toBe(true); // BUG-1: sebelumnya false selamanya
  });
});

describe('isPrivateIp (RFC 1918)', () => {
  it('mengenali rentang privat dan menolak publik', () => {
    expect(isPrivateIp('192.168.1.10')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('203.0.113.1')).toBe(false);
  });
});
