import { describe, it, expect } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { type DeviceData, type PacketHopPayload } from '../../src/types/network';

/**
 * Paritas urutan paket vs Cisco Packet Tracer v8.2 (matriks TESTING.md §4):
 * urutan yang diharapkan pada cold-start dan warm-cache harus identik.
 * Baris matriks yang memerlukan Packet Tracer secara manual (Sprint 7)
 * divalidasi otomatis di sini dari sisi simulator.
 */

function makePc(id: string, ip: string, mac: string, gateway?: string): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'pc',
    ports: [
      {
        id: 'fa0',
        name: 'FastEthernet 0',
        status: 'up',
        ipAddress: ip,
        subnetMask: '255.255.255.0',
        macAddress: mac,
      },
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
      { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: `00:50:79:${id}:01` },
      { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: `00:50:79:${id}:02` },
    ],
    macTable: {},
  };
}

function makeRouter(id: string): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'router',
    ports: [
      {
        id: 'fa0/0',
        name: 'FastEthernet 0/0',
        status: 'up',
        ipAddress: '192.168.1.1',
        subnetMask: '255.255.255.0',
        macAddress: `00:50:79:${id}:01`,
      },
      {
        id: 'fa0/1',
        name: 'FastEthernet 0/1',
        status: 'up',
        ipAddress: '192.168.2.1',
        subnetMask: '255.255.255.0',
        macAddress: `00:50:79:${id}:02`,
      },
    ],
    routes: [],
    arpTable: {},
  };
}

/** Topologi 2 (TESTING.md): Switch + 3 PC satu LAN. */
function buildSingleLan() {
  const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
  const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:AA:BB:02');
  const pc3 = makePc('pc-3', '192.168.1.30', '00:50:79:AA:BB:03');
  const sw = makeSwitch('sw-1');
  const links = [
    { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    { sourceNodeId: 'pc-2', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
    { sourceNodeId: 'pc-3', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
  ];
  return { devices: [pc1, pc2, pc3, sw], links };
}

/** Topologi 3 (TESTING.md): Routed Dual-LAN 192.168.1.0/24 <-> 192.168.2.0/24. */
function buildDualLan() {
  const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01', '192.168.1.1');
  const pc2 = makePc('pc-2', '192.168.2.20', '00:50:79:AA:BB:02', '192.168.2.1');
  const sw1 = makeSwitch('sw-1');
  const sw2 = makeSwitch('sw-2');
  const r1 = makeRouter('r-1');
  const links = [
    { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
    { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'sw-2', targetPortId: 'fa0/1' },
    { sourceNodeId: 'sw-2', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
  ];
  return { devices: [pc1, pc2, sw1, sw2, r1], links };
}

function collectHops(): { hops: PacketHopPayload[]; engine: HeadlessSimulationEngine } {
  const hops: PacketHopPayload[] = [];
  const engine = new HeadlessSimulationEngine(async (event) => {
    if (event.type === 'SIMULATION_STEP') hops.push(event.payload);
  });
  return { hops, engine };
}

describe('Paritas urutan paket vs Packet Tracer (TESTING.md §4)', () => {
  it('TEST-ARP-001 (cold-start, single LAN): ARP Req -> ARP Rep -> ICMP Req -> ICMP Rep', async () => {
    const { devices, links } = buildSingleLan();
    const { hops, engine } = collectHops();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '192.168.1.20');
    expect(result.success).toBe(true);

    const types = hops.map((h) => h.type);
    const firstOf = (t: PacketHopPayload['type']) => types.indexOf(t);
    expect(firstOf('ARP_REQ')).toBeLessThan(firstOf('ARP_REP'));
    expect(firstOf('ARP_REP')).toBeLessThan(firstOf('ICMP_REQ'));
    expect(firstOf('ICMP_REQ')).toBeLessThan(firstOf('ICMP_REP'));
  });

  it('TEST-IP-001 (cold-start, dual-LAN via router): urutan identik + forwarding router', async () => {
    const { devices, links } = buildDualLan();
    const { hops, engine } = collectHops();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '192.168.2.20');
    expect(result.success).toBe(true);
    expect(result.ttl).toBe(127); // TEST-IP-003: TTL berkurang 1 per router

    const types = hops.map((h) => h.type);
    const firstOf = (t: PacketHopPayload['type']) => types.indexOf(t);
    expect(firstOf('ARP_REQ')).toBeLessThan(firstOf('ARP_REP'));
    expect(firstOf('ARP_REP')).toBeLessThan(firstOf('ICMP_REQ'));
    expect(firstOf('ICMP_REQ')).toBeLessThan(firstOf('ICMP_REP'));
  });

  it('TEST-ARP-002 (warm-cache): ping kedua tanpa ARP sama sekali', async () => {
    const { devices, links } = buildDualLan();
    let capturing = false;
    const warmHops: PacketHopPayload[] = [];
    const engine = new HeadlessSimulationEngine(async (event) => {
      if (capturing && event.type === 'SIMULATION_STEP') warmHops.push(event.payload);
    });
    engine.setTopology(devices, links);

    await engine.executePing('pc-1', '192.168.2.20');
    capturing = true;
    await engine.executePing('pc-1', '192.168.2.20');

    expect(warmHops.length).toBeGreaterThan(0);
    expect(warmHops.every((h) => h.currentProtocol === 'ICMP')).toBe(true);
  });

  it('TEST-L2-001 (CAM learning): switch belajar MAC sumber pada port ingress', async () => {
    const { devices, links } = buildSingleLan();
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(devices, links);

    await engine.executePing('pc-1', '192.168.1.20');

    const sw = engine.getDevices().find((d) => d.id === 'sw-1');
    expect(sw?.macTable?.['00:50:79:AA:BB:01']).toBe('fa0/1'); // PC-1 masuk lewat port 1
    expect(sw?.macTable?.['00:50:79:AA:BB:02']).toBe('fa0/2'); // PC-2 (ARP Reply) port 2
  });

  it('TEST-IP-004 (bad gateway): gateway yang tidak ada -> ARP timeout / unreachable', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01', '192.168.1.254');
    const sw1 = makeSwitch('sw-1');
    const { devices, links } = { devices: [pc1, sw1], links: [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    ] };
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '192.168.2.20');

    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('ARP Request timeout');
  });
});
