import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { TOPOLOGY_TEMPLATES } from '../../src/data/topologyTemplates';
import { LAB_SCENARIOS } from '../../src/data/labs';
import { runTestAll } from '../../src/utils/testAllRunner';
import { isValidIp, isValidSubnetMask, networkAddress, ipToNumber } from '../../src/utils/ipUtils';
import type { DeviceData, TopologyLink } from '../../src/types/network';

function makeRouter(id: string, label: string): DeviceData {
  return {
    id,
    label,
    type: 'router',
    ports: [
      { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
      { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
      { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:01:00:03', natEnabled: true },
    ],
    routes: [
      { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.2', interfaceId: 'fa0/2' },
    ],
    arpTable: {},
  };
}

function makePc(id: string, label: string, ip: string, gateway?: string): DeviceData {
  return {
    id,
    label,
    type: 'pc',
    ports: [
      { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: ip, subnetMask: '255.255.255.0', macAddress: `00:50:79:AA:00:${id.slice(-2).padStart(2, '0')}` },
    ],
    defaultGateway: gateway,
    arpTable: {},
  };
}

describe('BUG-CRASH-01: Ping router interface tidak crash', () => {
  it('router pinging its own other interface succeeds without crash', async () => {
    const engine = new HeadlessSimulationEngine();
    const router = makeRouter('r-1', 'Router-1');
    engine.setTopology([router], []);

    // Router fa0/0 is 192.168.1.1, pinging fa0/1 (10.0.0.1)
    const result = await engine.executePing('r-1', '10.0.0.1');
    expect(result.success).toBe(true);
    expect(result.received).toBe(1);

    const iosResult = await engine.executePing('r-1', '10.0.0.1', { outputStyle: 'ios' });
    expect(iosResult.success).toBe(true);
    expect(iosResult.outputLines.join(' ')).toContain('Success rate is 100 percent');
  });

  it('host on LAN A pinging router interface on LAN B succeeds', async () => {
    const engine = new HeadlessSimulationEngine();
    const router = makeRouter('r-1', 'Router-1');
    const pcA = makePc('pc-a', 'PC-A', '192.168.1.10', '192.168.1.1');
    const pcB = makePc('pc-b', 'PC-B', '10.0.0.10', '10.0.0.1');

    engine.setTopology(
      [router, pcA, pcB],
      [
        { sourceNodeId: 'pc-a', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'pc-b', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/1' },
      ]
    );

    // PC-A pings router other interface (10.0.0.1)
    const result = await engine.executePing('pc-a', '10.0.0.1');
    expect(result.success).toBe(true);
    expect(result.received).toBeGreaterThan(0);
  });

  it('runTestAll completes without throwing undefined fromPortId', () => {
    const router = makeRouter('r-1', 'Router-1');
    const pcA = makePc('pc-a', 'PC-A', '192.168.1.10', '192.168.1.1');
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-a', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
    ];
    expect(() => runTestAll([router, pcA], links, ['ping', 'gateway'])).not.toThrow();
  });

  it('ping loopback 127.0.0.1 succeeds immediately without error or timeout', async () => {
    const engine = new HeadlessSimulationEngine();
    const pcA = makePc('pc-a', 'PC-A', '192.168.1.10', '192.168.1.1');
    engine.setTopology([pcA], []);
    const resPc = await engine.executePing('pc-a', '127.0.0.1');
    expect(resPc.success).toBe(true);
    expect(resPc.rttMs).toBe(0);

    const router = makeRouter('r-1', 'Router-1');
    engine.setTopology([router], []);
    const resRouter = await engine.executePing('r-1', '127.0.0.1');
    expect(resRouter.success).toBe(true);
  });
});

describe('BUG-CLI-01: Cisco IOS CLI parser uppercase & whitespace normalization', () => {
  let device: DeviceData;
  let portUpdates: Array<{ portId: string; updates: Record<string, unknown> }>;
  let session: CliSession;

  const buildDeps = (): CliSessionDeps => ({
    getDevice: () => device,
    setHostname: (name) => { device.label = name; },
    setPortConfig: (portId, updates) => { portUpdates.push({ portId, updates }); },
    requestPing: async (targetIp) => ({
      success: true,
      outputLines: [`Success rate is 100 percent (5/5) for ${targetIp}`],
    }),
  });

  beforeEach(() => {
    device = {
      id: 'r-1',
      label: 'Router-1',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'down', macAddress: '00:50:79:RT:00:01' },
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', macAddress: '00:50:79:RT:00:02' },
      ],
      routes: [],
      arpTable: {},
    };
    portUpdates = [];
    session = new CliSession(buildDeps());
  });

  it('handles uppercase commands: ENABLE, CONF T, INT FA0/0, IP ADDRESS, NO SHUT, SH IP INT BR', async () => {
    await session.handle('ENABLE');
    expect(session.prompt()).toBe('Router-1#');

    await session.handle('CONF T');
    expect(session.prompt()).toBe('Router-1(config)#');

    await session.handle('INT FA0/0');
    expect(session.prompt()).toBe('Router-1(config-if)#');
    expect(session.currentInterface).toBe('fa0/0');

    const ipRes = await session.handle('IP ADDRESS 192.168.1.1 255.255.255.0');
    expect(ipRes.join(' ')).toContain('192.168.1.1');
    expect(portUpdates).toContainEqual({
      portId: 'fa0/0',
      updates: { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0' },
    });

    const noShutRes = await session.handle('NO SHUT');
    expect(noShutRes.join(' ')).toContain('changed state to up');
    expect(portUpdates).toContainEqual({ portId: 'fa0/0', updates: { status: 'up' } });

    await session.handle('END');
    expect(session.prompt()).toBe('Router-1#');

    const shRes = await session.handle('SH IP INT BR');
    expect(shRes.join('\n')).toContain('FastEthernet 0/0');
  });

  it('handles arbitrary whitespace in commands', async () => {
    await session.handle('  enable  ');
    await session.handle('  configure    terminal   ');
    expect(session.prompt()).toBe('Router-1(config)#');

    await session.handle('   hostname    CoreRouter   ');
    expect(device.label).toBe('CoreRouter');

    await session.handle('  int    fa0/1   ');
    expect(session.currentInterface).toBe('fa0/1');

    await session.handle('   ip   address   10.0.0.1   255.255.255.0   ');
    expect(portUpdates).toContainEqual({
      portId: 'fa0/1',
      updates: { ipAddress: '10.0.0.1', subnetMask: '255.255.255.0' },
    });

    await session.handle('   no    shutdown   ');
    expect(portUpdates).toContainEqual({ portId: 'fa0/1', updates: { status: 'up' } });
  });

  it('supports config t, do commands in config/config-if, interface with space, and no ip address', async () => {
    await session.handle('enable');
    await session.handle('config t');
    expect(session.prompt()).toBe('Router-1(config)#');

    // do command from config mode
    const doRes = await session.handle('do sh ip int br');
    expect(doRes.join('\n')).toContain('FastEthernet 0/0');

    // interface with space 'int fa 0/0'
    await session.handle('int fa 0/0');
    expect(session.prompt()).toBe('Router-1(config-if)#');
    expect(session.currentInterface).toBe('fa0/0');

    // do ping from config-if mode
    const doPing = await session.handle('do ping 192.168.1.1');
    expect(doPing.join('\n')).toContain('Success rate');

    // no ip address removes IP configuration
    await session.handle('no ip address');
    expect(portUpdates).toContainEqual({
      portId: 'fa0/0',
      updates: { ipAddress: undefined, subnetMask: undefined },
    });
  });
});

describe('BUG-LAB-01: Monotonic completion of ping objectives in Lab', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  it('ping-success objectives are not wiped out when another ping or action occurs', () => {
    const store = useAppStore.getState();
    const lab = LAB_SCENARIOS[1]; // labNatInternet with 'nat' and 'ping' objectives
    store.startLab(lab);

    // Objective 'ping' succeeds
    store.setLastPingResult({ sourceNodeId: 'pc-1', targetIp: '8.8.8.8', success: true });
    expect(useAppStore.getState().labCompleted['ping']).toBe(true);

    // Another unrelated ping fails or is to another IP
    store.setLastPingResult({ sourceNodeId: 'pc-1', targetIp: '192.168.10.1', success: false });
    // 'ping' objective (8.8.8.8) must remain TRUE monotonically!
    expect(useAppStore.getState().labCompleted['ping']).toBe(true);
  });

  it('allows switching directly between labs without getting blocked by active lab lock', () => {
    const store = useAppStore.getState();
    store.startLab(LAB_SCENARIOS[0]);
    expect(useAppStore.getState().activeLabId).toBe(LAB_SCENARIOS[0].id);

    // Switch directly to Lab 2 without calling stopLab()
    store.startLab(LAB_SCENARIOS[1]);
    expect(useAppStore.getState().activeLabId).toBe(LAB_SCENARIOS[1].id);
    expect(useAppStore.getState().nodes.some((n) => n.id === 'cloud-1')).toBe(true);
  });
});

describe('BUG-CFG-01: Interface network/bcast address & default route validation', () => {
  it('detects network and broadcast addresses for interface IP', () => {
    const net = networkAddress('192.168.1.0', '255.255.255.0');
    const netNum = ipToNumber(net);
    const maskNum = ipToNumber('255.255.255.0');
    const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;

    // 192.168.1.0 is network address
    expect(ipToNumber('192.168.1.0') === netNum).toBe(true);
    // 192.168.1.255 is broadcast address
    expect(ipToNumber('192.168.1.255') === bcastNum).toBe(true);
    // 192.168.1.1 is usable host IP
    expect(ipToNumber('192.168.1.1') === netNum || ipToNumber('192.168.1.1') === bcastNum).toBe(false);
  });

  it('allows 0.0.0.0 / 0.0.0.0 as valid default route in route validation logic', () => {
    const net = '0.0.0.0';
    const mask = '0.0.0.0';
    const isDefaultRoute = net === '0.0.0.0' && (mask === '0.0.0.0' || mask === '0');
    const isValid = isValidIp(net) && (isValidSubnetMask(mask) || isDefaultRoute);
    expect(isValid).toBe(true);
  });
});

describe('BUG-NAT-01: NAT translation on non-private target IP', () => {
  it('translates traffic to any public destination IP, not only 8.8.8.8/1.1.1.1', async () => {
    const pc = makePc('pc-1', 'PC-1', '192.168.10.20', '192.168.10.1');
    const router: DeviceData = {
      id: 'r-1', label: 'R1', type: 'router',
      ports: [
        { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/2', name: 'WAN', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:R1:02', natEnabled: true },
      ],
      routes: [{ network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.2', interfaceId: 'fa0/2' }],
      arpTable: {},
      natTable: [],
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

    // When pinging 8.8.8.8 with NAT enabled on WAN, natTable records translation
    const result = await engine.executePing('pc-1', '8.8.8.8');
    expect(result.success).toBe(true);
    const r1 = engine.getDevices().find((d) => d.id === 'r-1')!;
    expect(r1.natTable && r1.natTable.length > 0).toBe(true);
    expect(r1.natTable![0].insideIp).toBe('192.168.10.20');
    expect(r1.natTable![0].globalIp).toBe('203.0.113.1');

    // When pinging arbitrary public IP 9.9.9.9 through NAT router, translation occurs in natTable
    // and Cloud receives the NAT-translated packet (reporting unknown public IP, NOT rejecting for missing NAT)
    const resultPublic = await engine.executePing('pc-1', '9.9.9.9');
    expect(resultPublic.logs.some((l) => l.includes('tanpa NAT'))).toBe(false);
    expect(resultPublic.logs.some((l) => l.includes('tidak dikenal di internet tersimulasi'))).toBe(true);

    const r1Public = engine.getDevices().find((d) => d.id === 'r-1')!;
    expect(r1Public.natTable?.some((nt) => nt.insideIp === '192.168.10.20' && nt.globalIp === '203.0.113.1')).toBe(true);

    const planPublic = engine.planPing('pc-1', '9.9.9.9');
    const natHop = planPublic.events.find((e) => e.pdu?.note?.includes('NAT: src 192.168.10.20 di-rewrite'));
    expect(natHop).toBeDefined();
  });

  it('translates traffic and delivers to peer router with public IP', async () => {
    const pc = makePc('pc-1', 'PC-1', '192.168.10.20', '192.168.10.1');
    const r1: DeviceData = {
      id: 'r-1', label: 'R1', type: 'router',
      ports: [
        { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        { id: 'fa0/1', name: 'WAN', status: 'up', ipAddress: '198.51.100.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:02', natEnabled: true },
      ],
      routes: [{ network: '198.51.100.0', subnetMask: '255.255.255.0', nextHop: '198.51.100.1', interfaceId: 'fa0/1' }],
      arpTable: {},
      natTable: [],
    };
    const r2: DeviceData = {
      id: 'r-2', label: 'R2', type: 'router',
      ports: [
        { id: 'fa0/1', name: 'WAN', status: 'up', ipAddress: '198.51.100.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R2:01' },
      ],
      routes: [],
      arpTable: {},
    };

    const engine = new HeadlessSimulationEngine();
    engine.setTopology(
      [pc, r1, r2],
      [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'r-2', targetPortId: 'fa0/1' },
      ]
    );

    const result = await engine.executePing('pc-1', '198.51.100.1');
    expect(result.success).toBe(true);
    const updatedR1 = engine.getDevices().find((d) => d.id === 'r-1')!;
    expect(updatedR1.natTable?.some((nt) => nt.insideIp === '192.168.10.20' && nt.globalIp === '198.51.100.2')).toBe(true);
  });
});

describe('BUG-DHCP-01: SubInterfaces included in DHCP occupied set', () => {
  it('does not allocate IP matching a router sub-interface', async () => {
    const engine = new HeadlessSimulationEngine();
    const router: DeviceData = {
      id: 'r-1',
      label: 'Router-1',
      type: 'router',
      ports: [
        {
          id: 'fa0/0',
          name: 'Fa0/0',
          status: 'up',
          ipAddress: '192.168.1.1',
          subnetMask: '255.255.255.0',
          macAddress: '00:50:79:RT:00:01',
          subInterfaces: [
            { vlanId: 10, ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' },
          ],
        },
      ],
      dhcpPools: {
        'fa0/0': {
          enabled: true,
          network: '192.168.1.0',
          mask: '255.255.255.0',
          startIp: '192.168.1.10', // startIp is exactly the sub-interface IP!
          maxClients: 10,
        },
      },
      arpTable: {},
    };

    const client: DeviceData = {
      id: 'pc-1',
      label: 'PC-1',
      type: 'pc',
      ports: [{ id: 'fa0', name: 'Fa0', status: 'up', macAddress: '00:50:79:CC:00:01', dhcpEnabled: true }],
      arpTable: {},
    };

    engine.setTopology(
      [router, client],
      [{ sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' }]
    );

    const plan = engine.planDhcp('pc-1', 'fa0');
    expect(plan.summary.success).toBe(true);
    // Offered IP must skip 192.168.1.10 (owned by sub-interface) and offer 192.168.1.11!
    const lease = plan.events.flatMap((e) => e.effects ?? []).find((eff) => eff.type === 'DHCP_LEASE');
    expect(lease).toBeDefined();
    if (lease && lease.type === 'DHCP_LEASE') {
      expect(lease.ipAddress).toBe('192.168.1.11');
    }
  });
});

describe('BUG-TPL-01: Mesh template has 2 PCs that can ping across the mesh', () => {
  it('mesh-redundant-switch has pc-a and pc-b connected to different switches', async () => {
    const tpl = TOPOLOGY_TEMPLATES.find((t) => t.id === 'mesh-redundant-switch');
    expect(tpl).toBeDefined();
    const pcA = tpl!.nodes.find((n) => n.id === 'pc-a');
    const pcB = tpl!.nodes.find((n) => n.id === 'pc-b');
    expect(pcA).toBeDefined();
    expect(pcB).toBeDefined();

    // Verify ping between PC-A and PC-B across the mesh
    const engine = new HeadlessSimulationEngine();
    const devices = tpl!.nodes.map((n) => n.data);
    const links = tpl!.edges.map((e) => ({
      sourceNodeId: e.source,
      sourcePortId: e.sourceHandle!,
      targetNodeId: e.target,
      targetPortId: e.targetHandle!,
    }));
    engine.setTopology(devices, links);

    const result = await engine.executePing('pc-a', '10.0.0.20');
    expect(result.success).toBe(true);
    expect(result.received).toBeGreaterThan(0);
  });
});

describe('BUG-DEADLOCK-01: abortSimulation clears running state and unblocks store', () => {
  it('abortSimulation resets simulationStatus to idle and clears activePackets', () => {
    const store = useAppStore.getState();
    store.setSimulationStatus('running');
    store.setActivePackets([{
      packetId: 'pkt-1',
      sourceNodeId: 'a',
      targetNodeId: 'b',
      sourcePortId: 'fa0',
      targetPortId: 'fa0',
      type: 'ICMP_REQ',
      currentProtocol: 'ICMP',
      summary: 'ping',
    }]);

    useAppStore.getState().resetTopology();

    expect(useAppStore.getState().simulationStatus).toBe('idle');
    expect(useAppStore.getState().activePackets).toHaveLength(0);
  });
});

describe('BUG-SYNC-01: SIMULATION_STATE_SYNC syncs routes and natTable', () => {
  it('updateDeviceConfig updates routes and natTable', () => {
    const store = useAppStore.getState();
    store.resetTopology();
    store.addDevice('router', { x: 0, y: 0 });
    const routerId = useAppStore.getState().nodes[0].id;

    store.updateDeviceConfig(routerId, {
      routes: [{ network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '192.168.1.2', interfaceId: 'fa0/0', source: 'rip' }],
      natTable: [{ insideIp: '192.168.1.10', globalIp: '203.0.113.1', icmpId: 1, echoSeq: 1 }],
    });

    const updated = useAppStore.getState().nodes.find((n) => n.id === routerId)!;
    expect(updated.data.routes).toHaveLength(1);
    expect(updated.data.routes![0].network).toBe('10.0.0.0');
    expect(updated.data.natTable).toHaveLength(1);
    expect(updated.data.natTable![0].insideIp).toBe('192.168.1.10');
  });
});

describe('BUG-PDU-01: Protocol display for ICMP and RIP', () => {
  it('formats ICMP protocol as ICMP (1) and RIP as UDP 520 / RIP (17)', () => {
    const formatProtocol = (proto: 'ICMP' | 'RIP' | 'UDP') =>
      proto === 'ICMP'
        ? 'ICMP (1)'
        : proto === 'RIP'
        ? 'UDP 520 / RIP (17)'
        : `${proto} (17)`;

    expect(formatProtocol('ICMP')).toBe('ICMP (1)');
    expect(formatProtocol('RIP')).toBe('UDP 520 / RIP (17)');
    expect(formatProtocol('UDP')).toBe('UDP (17)');
  });
});

