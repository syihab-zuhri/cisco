import { describe, it, expect } from 'vitest';
import { HeadlessSimulationEngine, type PingSummary } from '../../src/engine/simulationEngine';
import { type DeviceData, type PacketHopPayload } from '../../src/types/network';

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

function makeSwitch(id: string, macBase: string): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'switch',
    ports: [
      {
        id: 'fa0/1',
        name: 'FastEthernet 0/1',
        status: 'up',
        macAddress: `${macBase}:01`,
      },
      {
        id: 'fa0/2',
        name: 'FastEthernet 0/2',
        status: 'up',
        macAddress: `${macBase}:02`,
      },
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
        macAddress: '00:50:79:RT:00:01',
      },
      {
        id: 'fa0/1',
        name: 'FastEthernet 0/1',
        status: 'up',
        ipAddress: '192.168.2.1',
        subnetMask: '255.255.255.0',
        macAddress: '00:50:79:RT:00:02',
      },
    ],
    routes: [],
    arpTable: {},
  };
}

/** Topologi: PC1 - Switch1 - Router - Switch2 - PC2 (dual-LAN via 1 router). */
function buildRoutedTopology() {
  const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01', '192.168.1.1');
  const pc2 = makePc('pc-2', '192.168.2.20', '00:50:79:AA:BB:02', '192.168.2.1');
  const sw1 = makeSwitch('sw-1', '00:50:79:SW:01');
  const sw2 = makeSwitch('sw-2', '00:50:79:SW:02');
  const router = makeRouter('r-1');

  const links = [
    { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
    { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'sw-2', targetPortId: 'fa0/1' },
    { sourceNodeId: 'sw-2', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
  ];

  return { devices: [pc1, pc2, sw1, sw2, router], links, router, pc2 };
}

describe('HeadlessSimulationEngine (RFC 826 ARP & RFC 792 ICMP)', () => {
  it('berhasil melakukan simulasi ARP learning & Ping antar 2 PC via Switch L2', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:AA:BB:02');
    const sw1 = makeSwitch('sw-1', '00:50:79:SW:00');

    const links = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'pc-2', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw1], links);

    const result = await engine.executePing('pc-1', '192.168.1.20');

    expect(result.success).toBe(true);
    expect(result.ttl).toBe(128); // satu subnet, tanpa router

    const updatedDevices = engine.getDevices();
    const updatedPc1 = updatedDevices.find((d) => d.id === 'pc-1');
    const updatedSw1 = updatedDevices.find((d) => d.id === 'sw-1');

    expect(updatedPc1?.arpTable?.['192.168.1.20']).toBe('00:50:79:AA:BB:02');
    expect(updatedSw1?.macTable?.['00:50:79:AA:BB:01']).toBe('fa0/1');
    expect(updatedSw1?.macTable?.['00:50:79:AA:BB:02']).toBe('fa0/2');
  });

  it('gagal ping jika target IP tidak dapat ditemukan (ARP timeout)', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    const sw1 = makeSwitch('sw-1', '00:50:79:SW:00');

    const links = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, sw1], links);

    const result = await engine.executePing('pc-1', '192.168.1.99');
    expect(result.success).toBe(false);
  });

  it('merouting ping lintas subnet melalui router: TTL berkurang & paket sampai ke host tujuan', async () => {
    const { devices, links, router } = buildRoutedTopology();
    const hops: PacketHopPayload[] = [];
    const engine = new HeadlessSimulationEngine(async (event) => {
      if (event.type === 'SIMULATION_STEP') hops.push(event.payload);
    });
    engine.setTopology(devices, links);

    const result: PingSummary = await engine.executePing('pc-1', '192.168.2.20');

    // Ping sukses dengan TTL 127 (128 - 1 router) dan rtt 1ms (deterministik)
    expect(result.success).toBe(true);
    expect(result.ttl).toBe(127);
    expect(result.rttMs).toBe(1);

    // Urutan paket deterministik: ARP REQ -> ARP REP -> ICMP REQ -> ICMP REP
    const protocols = hops.map((h) => h.currentProtocol);
    expect(protocols.indexOf('ARP')).toBeLessThan(protocols.indexOf('ICMP'));

    // Bukti router benar-benar meneruskan paket ke subnet tujuan:
    // ada ICMP_REQ yang keluar dari router ke arah Switch-2.
    expect(
      hops.some(
        (h) =>
          h.type === 'ICMP_REQ' &&
          h.sourceNodeId === router.id &&
          h.targetNodeId === 'sw-2'
      )
    ).toBe(true);

    // Reply kembali melewati router ke arah Switch-1.
    expect(
      hops.some(
        (h) => h.type === 'ICMP_REP' && h.sourceNodeId === router.id && h.targetNodeId === 'sw-1'
      )
    ).toBe(true);

    // Output gaya Windows sesuai AC-SIM-002
    expect(result.outputLines[1]).toBe('Reply from 192.168.2.20: bytes=32 time=1ms TTL=127');

    // Tabel L2/L3 terisi di masing-masing perangkat
    const updated = engine.getDevices();
    const pc1 = updated.find((d) => d.id === 'pc-1');
    const updatedRouter = updated.find((d) => d.id === router.id);
    expect(pc1?.arpTable?.['192.168.1.1']).toBe('00:50:79:RT:00:01');
    expect(updatedRouter?.arpTable?.['192.168.2.20']).toBe('00:50:79:AA:BB:02');
  });

  it('gagal dengan "No route" jika router tidak punya rute ke subnet tujuan', async () => {
    const { devices, links } = buildRoutedTopology();
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '10.0.0.99');

    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('No route to host 10.0.0.99');
    expect(result.outputLines.some((l) => l.includes('Request timed out'))).toBe(true);
  });

  it('gagal jika target di luar subnet dan default gateway belum dikonfigurasi', async () => {
    const { devices, links } = buildRoutedTopology();
    const pc1 = devices.find((d) => d.id === 'pc-1')!;
    pc1.defaultGateway = undefined;

    const engine = new HeadlessSimulationEngine();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '192.168.2.20');

    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('Default Gateway belum dikonfigurasi');
  });

  it('ping kedua memakai warm cache: tidak ada paket ARP lagi', async () => {
    const { devices, links } = buildRoutedTopology();
    let capturing = false;
    const secondHops: PacketHopPayload[] = [];
    const engine = new HeadlessSimulationEngine(async (event) => {
      if (capturing && event.type === 'SIMULATION_STEP') secondHops.push(event.payload);
    });
    engine.setTopology(devices, links);

    await engine.executePing('pc-1', '192.168.2.20'); // cold: isi ARP cache & CAM

    capturing = true;
    await engine.executePing('pc-1', '192.168.2.20'); // warm: cache hit

    expect(secondHops.length).toBeGreaterThan(0);
    expect(secondHops.every((h) => h.currentProtocol === 'ICMP')).toBe(true);
  });
});

describe('HeadlessSimulationEngine (kasus tepi & static route)', () => {
  it('gagal jika source tidak punya konfigurasi IP', async () => {
    const pc = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    delete pc.ports[0].ipAddress;
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc], []);
    const result = await engine.executePing('pc-1', '192.168.1.20');
    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('Port belum memiliki konfigurasi IP/Subnet');
  });

  it('gagal jika port source Link DOWN', async () => {
    const pc = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    pc.ports[0].status = 'down';
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc], []);
    const result = await engine.executePing('pc-1', '192.168.1.20');
    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('Link DOWN');
  });

  it('ping ke IP sendiri (loopback) langsung sukses tanpa hop', async () => {
    const pc = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    const { devices, links } = buildRoutedTopology();
    devices.push(pc);
    const hops: PacketHopPayload[] = [];
    const engine = new HeadlessSimulationEngine(async (e) => {
      if (e.type === 'SIMULATION_STEP') hops.push(e.payload);
    });
    engine.setTopology([pc], []);
    const result = await engine.executePing('pc-1', '192.168.1.10');
    expect(result.success).toBe(true);
    expect(result.ttl).toBe(128);
    expect(hops).toHaveLength(0);
    void links; void devices;
  });

  it('gagal jika tidak ada jalur Layer-2 antar perangkat', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01');
    const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:AA:BB:02');
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2], []); // tanpa kabel
    const result = await engine.executePing('pc-1', '192.168.1.20');
    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('Tidak ada jalur fisik/Layer-2');
  });

  it('static route: ping ke subnet jauh via next-hop router lain (TTL -2)', async () => {
    // PC1 -- sw1 -- r1(192.168.1.1 & 172.16.0.1) -- sw3 -- r2(172.16.0.2 & 10.0.0.1) -- sw4 -- PC2
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01', '192.168.1.1');
    const pc2: DeviceData = {
      ...makePc('pc-2', '10.0.0.20', '00:50:79:AA:BB:02', '10.0.0.1'),
    };
    const sw1 = makeSwitch('sw-1', '00:50:79:SW:01');
    const sw3 = makeSwitch('sw-3', '00:50:79:SW:03');
    const sw4 = makeSwitch('sw-4', '00:50:79:SW:04');
    const r1: DeviceData = {
      id: 'r-1',
      label: 'R1',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '172.16.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:02' },
      ],
      routes: [{ network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.0.2', interfaceId: 'fa0/1' }],
      arpTable: {},
    };
    const r2: DeviceData = {
      id: 'r-2',
      label: 'R2',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '172.16.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:01' },
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:02' },
      ],
      routes: [],
      arpTable: {},
    };
    const links = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'sw-3', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-3', sourcePortId: 'fa0/2', targetNodeId: 'r-2', targetPortId: 'fa0/0' },
      { sourceNodeId: 'r-2', sourcePortId: 'fa0/1', targetNodeId: 'sw-4', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-4', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw1, sw3, sw4, r1, r2], links);

    const result = await engine.executePing('pc-1', '10.0.0.20');

    expect(result.success).toBe(true);
    expect(result.ttl).toBe(126); // 128 - 2 router
    expect(result.rttMs).toBe(2);
  });

  it('deteksi routing loop antar dua router yang saling menunjuk', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:AA:BB:01', '192.168.1.1');
    const r1: DeviceData = {
      id: 'r-1', label: 'R1', type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '172.16.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:02' },
      ],
      routes: [{ network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '172.16.0.2', interfaceId: 'fa0/1' }],
      arpTable: {},
    };
    const r2: DeviceData = {
      id: 'r-2', label: 'R2', type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '172.16.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:01' },
      ],
      routes: [{ network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '192.168.1.1', interfaceId: 'fa0/0' }],
      arpTable: {},
    };
    const links = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'r-2', targetPortId: 'fa0/0' },
    ];
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, r1, r2], links);

    const result = await engine.executePing('pc-1', '10.0.0.99');

    expect(result.success).toBe(false);
    expect(result.logs.join('\n')).toContain('Routing loop terdeteksi');
  });

  it('format output ios: header, tanda "!", dan success rate', async () => {
    const { devices, links } = buildRoutedTopology();
    const engine = new HeadlessSimulationEngine();
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-1', '192.168.2.20', {
      echoCount: 5,
      outputStyle: 'ios',
    });

    expect(result.outputLines[0]).toBe('Type escape sequence to abort.');
    expect(result.outputLines[2]).toBe('!!!!!');
    expect(result.outputLines[3]).toContain('Success rate is 100 percent (5/5)');
    expect(result.sent).toBe(5);
    expect(result.received).toBe(5);
  });
});
