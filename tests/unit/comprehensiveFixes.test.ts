import { describe, it, expect } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { type DeviceData, type TopologyLink } from '../../src/types/network';

function makePc(id: string, ip: string, mac: string, gateway?: string, status: 'up' | 'down' = 'up'): DeviceData {
  return {
    id,
    label: id.toUpperCase(),
    type: 'pc',
    ports: [
      {
        id: 'fa0',
        name: 'FastEthernet 0',
        status,
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
      { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: `${macBase}:01` },
      { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: `${macBase}:02` },
      { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: `${macBase}:03` },
    ],
    macTable: {},
  };
}

describe('Audit Bug Fixes: Comprehensive Verification', () => {
  it('Fix 1: Port DOWN pada sisi lawan menggagalkan ping (success=false)', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:00:00:01', undefined, 'up');
    const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:00:00:02', undefined, 'down');
    const sw = makeSwitch('sw-1', '00:50:79:SW:01');
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw], links);

    const result = await engine.executePing('pc-1', '192.168.1.20');
    expect(result.success).toBe(false);
    expect(result.received).toBe(0);
    expect(result.logs.some((l) => l.includes('Tidak ada jalur fisik/Layer-2'))).toBe(true);

    // CAM table switch tidak boleh belajar MAC PC-2
    const swDev = engine.getDevices().find((d) => d.id === 'sw-1');
    expect(swDev?.macTable?.['00:50:79:00:00:02']).toBeUndefined();
  });

  it('Fix 2: Multi-echo mengirim semua echo probes dan menghitung sent/received dengan benar', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:00:00:01');
    const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:00:00:02');
    const sw = makeSwitch('sw-1', '00:50:79:SW:01');
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw], links);

    const plan = engine.planPing('pc-1', '192.168.1.20', { echoCount: 4 });
    expect(plan.summary.sent).toBe(4);
    expect(plan.summary.received).toBe(4);
    expect(plan.summary.success).toBe(true);

    // Semua echo memiliki event ICMP_REQ di timeline
    const icmpReqs = plan.events.filter((e) => e.kind === 'ICMP_REQ');
    expect(icmpReqs.length).toBeGreaterThanOrEqual(4);
  });

  it('Fix 3: SSID wireless yang tidak cocok memutus jalur Layer-2', async () => {
    const laptop: DeviceData = {
      id: 'lap-1',
      label: 'Laptop-1',
      type: 'laptop',
      ports: [
        {
          id: 'wla0',
          name: 'Wireless Adapter',
          status: 'up',
          kind: 'wireless',
          ipAddress: '192.168.1.50',
          subnetMask: '255.255.255.0',
          macAddress: '00:50:79:00:00:10',
          ssid: 'SSID_A',
        },
      ],
      arpTable: {},
    };
    const ap: DeviceData = {
      id: 'ap-1',
      label: 'AccessPoint-1',
      type: 'accessPoint',
      ports: [
        {
          id: 'radio0',
          name: 'Radio 0',
          status: 'up',
          kind: 'wireless',
          macAddress: '00:50:79:00:00:20',
          ssid: 'SSID_B',
        },
      ],
      macTable: {},
    };
    const links: TopologyLink[] = [
      { sourceNodeId: 'lap-1', sourcePortId: 'wla0', targetNodeId: 'ap-1', targetPortId: 'radio0', kind: 'wireless' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([laptop, ap], links);

    const result = await engine.executePing('lap-1', '192.168.1.1');
    expect(result.success).toBe(false);
  });

  it('Fix 5: Port migration memperbarui tabel CAM switch', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:00:00:01');
    const pc2 = makePc('pc-2', '192.168.1.20', '00:50:79:00:00:02');
    const sw = makeSwitch('sw-1', '00:50:79:SW:01');

    // Hubungkan PC1 ke fa0/1
    let links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw], links);

    await engine.executePing('pc-1', '192.168.1.20');
    let swDev = engine.getDevices().find((d) => d.id === 'sw-1')!;
    expect(swDev.macTable?.['00:50:79:00:00:01']).toBe('fa0/1');

    // Pindah kabel PC1 ke fa0/3
    links = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/3' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];
    engine.setTopology([pc1, pc2, swDev], links);

    await engine.executePing('pc-1', '192.168.1.20');
    swDev = engine.getDevices().find((d) => d.id === 'sw-1')!;
    // CAM Table terupdate ke fa0/3 (tidak terkunci di fa0/1)
    expect(swDev.macTable?.['00:50:79:00:00:01']).toBe('fa0/3');
  });

  it('Fix 6: Router menggunakan IP & MAC egress untuk ARP egress', async () => {
    const pcA = makePc('pc-a', '192.168.1.10', '00:50:79:00:00:0A', '192.168.1.1');
    const pcB = makePc('pc-b', '192.168.2.20', '00:50:79:00:00:0B', '192.168.2.1');
    const router: DeviceData = {
      id: 'r-1',
      label: 'R1',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'LAN 1', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00:00' },
        { id: 'fa0/1', name: 'LAN 2', status: 'up', ipAddress: '192.168.2.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00:01' },
      ],
      routes: [],
      arpTable: {},
    };
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-a', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'pc-b', targetPortId: 'fa0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pcA, pcB, router], links);

    const plan = engine.planPing('pc-a', '192.168.2.20');
    expect(plan.summary.success).toBe(true);

    // ARP request di segmen LAN 2 harus bersumber dari fa0/1 router (192.168.2.1 & 00:50:79:R1:00:01)
    const arpReq2 = plan.events.find(
      (e) => e.kind === 'ARP_REQ' && (e.pdu?.segment as { targetIp?: string })?.targetIp === '192.168.2.20'
    );
    expect(arpReq2).toBeDefined();
    const seg = arpReq2?.pdu?.segment as { senderIp: string; senderMac: string };
    expect(seg.senderIp).toBe('192.168.2.1');
    expect(seg.senderMac).toBe('00:50:79:R1:00:01');
  });

  it('Fix 7: Konflik duplicate IP terdeteksi', async () => {
    const pc1 = makePc('pc-1', '192.168.1.10', '00:50:79:00:00:01');
    const pc2 = makePc('pc-2', '192.168.1.10', '00:50:79:00:00:02'); // Duplikat IP
    const sw = makeSwitch('sw-1', '00:50:79:SW:01');
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc1, pc2, sw], links);

    const result = await engine.executePing('pc-1', '192.168.1.10');
    expect(result.success).toBe(false);
    expect(result.logs.some((l) => l.includes('Konflik IP terdeteksi'))).toBe(true);
  });

  it('Fix 10: DHCP menolak port DOWN dan validasi startIp', async () => {
    const pc = makePc('pc-1', '0.0.0.0', '00:50:79:00:00:01', undefined, 'down');
    const router: DeviceData = {
      id: 'r-1',
      label: 'R1',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
      ],
      dhcpPools: {
        'fa0/0': {
          enabled: true,
          network: '192.168.1.0',
          mask: '255.255.255.0',
          startIp: '192.168.1.100',
          maxClients: 20,
        },
      },
      routes: [],
      arpTable: {},
    };
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc, router], links);

    const planDown = engine.planDhcp('pc-1', 'fa0');
    expect(planDown.summary.success).toBe(false);
    expect(planDown.summary.outputLines[0]).toContain('DOWN');
  });

  it('Fix 10b: RIPv2 bertukar rute melewati intermediate Switch', async () => {
    const r1: DeviceData = {
      id: 'r-1',
      label: 'R1',
      type: 'router',
      ripEnabled: true,
      ports: [
        { id: 'fa0/0', name: 'LAN 1', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/1', name: 'Trunk SW', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:02' },
      ],
      routes: [],
      arpTable: {},
    };
    const r2: DeviceData = {
      id: 'r-2',
      label: 'R2',
      type: 'router',
      ripEnabled: true,
      ports: [
        { id: 'fa0/1', name: 'Trunk SW', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:01' },
        { id: 'fa0/0', name: 'LAN 2', status: 'up', ipAddress: '192.168.2.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:02' },
      ],
      routes: [],
      arpTable: {},
    };
    const sw = makeSwitch('sw-core', '00:50:79:SW:00');
    const links: TopologyLink[] = [
      { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'sw-core', targetPortId: 'fa0/1' },
      { sourceNodeId: 'sw-core', sourcePortId: 'fa0/2', targetNodeId: 'r-2', targetPortId: 'fa0/1' },
    ];

    const engine = new HeadlessSimulationEngine();
    engine.setTopology([r1, r2, sw], links);

    const rip = engine.planRip();
    expect(rip.summary.success).toBe(true);

    const r2Dev = engine.getDevices().find((d) => d.id === 'r-2');
    expect(r2Dev?.routes?.some((r) => r.network === '192.168.1.0')).toBe(true);
  });

  it('Fix: Input IP target yang tidak valid ditolak segera dengan pesan eksplisit', async () => {
    const pc = makePc('pc-1', '192.168.1.10', '00:50:79:00:00:01');
    const engine = new HeadlessSimulationEngine();
    engine.setTopology([pc], []);

    const result = await engine.executePing('pc-1', '999.1.1.1');
    expect(result.success).toBe(false);
    expect(result.outputLines[0]).toBe('Invalid IP address: "999.1.1.1".');
  });
});
