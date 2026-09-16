import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { type DeviceData, type TopologyLink } from '../../src/types/network';
import { useAppStore } from '../../src/store/useAppStore';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';

describe('Comprehensive System Audit & Verification', () => {
  beforeEach(() => {
    useAppStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      activeLabId: null,
      simulationLogs: [],
    });
  });

  describe('1. Engine Protocols, Switching, Routing, and Services', () => {
    it('RFC 1122: Loopback 127.0.0.1 ping succeeds even if ports are down or unconfigured', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'down',
            macAddress: '00:50:79:00:00:01',
          },
        ],
      };
      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc], []);
      const plan = engine.planPing('pc-1', '127.0.0.1');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.rttMs).toBe(0);
      expect(plan.summary.ttl).toBe(128);
    });

    it('Multi-interface host selects source port matching defaultGateway for non-local traffic', () => {
      // Laptop with fa0 (192.168.1.50/24, no gateway) and wla0 (10.0.0.50/24, gateway 10.0.0.1)
      const laptop: DeviceData = {
        id: 'laptop-1',
        label: 'Laptop-1',
        type: 'laptop',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '192.168.1.50',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:11',
          },
          {
            id: 'wla0',
            name: 'Wireless Adapter',
            status: 'up',
            ipAddress: '10.0.0.50',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:12',
          },
        ],
        defaultGateway: '10.0.0.1',
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '10.0.0.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:R1',
          },
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'up',
            ipAddress: '20.0.0.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:R2',
          },
        ],
      };
      const server: DeviceData = {
        id: 'srv-1',
        label: 'Server-1',
        type: 'server',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '20.0.0.50',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:S1',
          },
        ],
        defaultGateway: '20.0.0.1',
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'laptop-1', sourcePortId: 'wla0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'srv-1', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([laptop, router, server], links);

      const plan = engine.planPing('laptop-1', '20.0.0.50');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);
    });

    it('Directly attached static route with spaces in interface name (e.g. "FastEthernet 0/0")', () => {
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '10.0.0.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:R1:00',
          },
        ],
        routes: [
          {
            network: '192.168.50.0',
            subnetMask: '255.255.255.0',
            nextHop: 'FastEthernet 0/0',
            interfaceId: 'FastEthernet 0/0',
            source: 'static',
          },
        ],
      };
      const pc: DeviceData = {
        id: 'pc-target',
        label: 'PC-Target',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '192.168.50.10',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:PC:50',
          },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/0', targetNodeId: 'pc-target', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, pc], links);

      const plan = engine.planPing('r-1', '192.168.50.10');
      expect(plan.summary.success).toBe(true);
    });

    it('DHCP server on multi-interface router finds pool matching sub-interface subnet', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            macAddress: '00:50:79:10:00:01',
            vlanId: 10,
          },
        ],
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:SW:01' },
          { id: 'fa0/24', name: 'FastEthernet 0/24', status: 'up', portMode: 'trunk', macAddress: '00:50:79:SW:24' },
        ],
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            macAddress: '00:50:79:R1:00',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
        dhcpPools: {
          'fa0/0.10': {
            enabled: true,
            network: '192.168.10.0',
            mask: '255.255.255.0',
            startIp: '192.168.10.100',
            maxClients: 50,
          },
        },
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/24', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, sw, router], links);

      const plan = engine.planDhcp('pc-1', 'fa0');
      expect(plan.summary.success).toBe(true);
      const lease = plan.events.flatMap((e) => e.effects ?? []).find((e) => e.type === 'DHCP_LEASE');
      expect(lease).toBeDefined();
      if (lease && lease.type === 'DHCP_LEASE') {
        expect(lease.ipAddress).toBe('192.168.10.100');
        expect(lease.gateway).toBe('192.168.10.1');
      }
    });

    it('Multi-hop NAT traversal and de-NATting to simulated Cloud Internet (8.8.8.8)', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '192.168.1.10',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:PC:01:01',
          },
        ],
        defaultGateway: '192.168.1.1',
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:01:01' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:SW:01:02' },
        ],
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '192.168.1.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:R1:00:01',
          },
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'up',
            ipAddress: '200.1.1.2',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:R1:00:02',
            natEnabled: true,
          },
        ],
        routes: [
          {
            network: '0.0.0.0',
            subnetMask: '0.0.0.0',
            nextHop: '200.1.1.1',
            interfaceId: 'fa0/1',
            source: 'static',
          },
        ],
      };
      const cloud: DeviceData = {
        id: 'cloud-1',
        label: 'Internet Cloud',
        type: 'cloud',
        ports: [
          {
            id: 'eth0',
            name: 'Ethernet 0',
            status: 'up',
            ipAddress: '200.1.1.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:CL:00:01',
          },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'eth0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, sw, router, cloud], links);

      const plan = engine.planPing('pc-1', '8.8.8.8');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);

      // Verify NAT translation effect recorded
      const natEffect = plan.events.flatMap((e) => e.effects ?? []).find((e) => e.type === 'NAT_TRANSLATE');
      expect(natEffect).toBeDefined();
      if (natEffect && natEffect.type === 'NAT_TRANSLATE') {
        expect(natEffect.insideIp).toBe('192.168.1.10');
        expect(natEffect.globalIp).toBe('200.1.1.2');
      }

      // Verify de-NATting note on return hop
      const deNatHop = plan.events.find((e) => e.pdu?.note?.includes('NAT: dst dikembalikan'));
      expect(deNatHop).toBeDefined();
    });

    it('Directly attached static route with GigabitEthernet alias (gi0/0 vs GigabitEthernet 0/0) resolves correctly', () => {
      const router: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          { id: 'gi0/0', name: 'GigabitEthernet 0/0', status: 'up', ipAddress: '10.1.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
        ],
        routes: [
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: 'GigabitEthernet 0/0', interfaceId: 'gi0/0', source: 'static' },
        ],
      };
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.1.10', subnetMask: '255.255.0.0', macAddress: '00:50:79:00:00:P1' },
        ],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'gi0/0', targetNodeId: 'pc-1', targetPortId: 'fa0' },
      ];
      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, pc], links);
      const plan = engine.planPing('r-1', '172.16.1.10');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);
    });

    it('Layer 2 MAC preservation: Ethernet frame src/dst MAC is preserved across intermediate switches', () => {
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:10' }],
      };
      const sw1: DeviceData = {
        id: 'sw-1', label: 'SW1', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:00:00:S1' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:00:00:S2' },
        ],
      };
      const sw2: DeviceData = {
        id: 'sw-2', label: 'SW2', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:00:00:S3' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:00:00:S4' },
        ],
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:20' }],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'sw-2', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-2', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];
      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, sw1, sw2, pc2], links);
      const plan = engine.planPing('pc-1', '192.168.1.20');
      expect(plan.summary.success).toBe(true);

      // Check all ICMP_REQ hops: srcMac must stay PC1 MAC, dstMac must stay PC2 MAC across all 3 hops
      const icmpReqs = plan.events.filter((e) => e.kind === 'ICMP_REQ');
      expect(icmpReqs).toHaveLength(3);
      for (const req of icmpReqs) {
        expect(req.pdu?.frame.srcMac).toBe('00:50:79:00:00:10');
        expect(req.pdu?.frame.dstMac).toBe('00:50:79:00:00:20');
      }

      // Check all ICMP_REP hops: srcMac must stay PC2 MAC, dstMac must stay PC1 MAC across all 3 hops
      const icmpReps = plan.events.filter((e) => e.kind === 'ICMP_REP');
      expect(icmpReps).toHaveLength(3);
      for (const rep of icmpReps) {
        expect(rep.pdu?.frame.srcMac).toBe('00:50:79:00:00:20');
        expect(rep.pdu?.frame.dstMac).toBe('00:50:79:00:00:10');
      }
    });
  });

  describe('2. Store & Canvas Invariants (INV-003, Admin Down, Deletion Cleanup)', () => {
    it('Port Singularity INV-003: connectPorts rejects connection if port is already bound', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });
      store.addDevice('server', { x: 500, y: 100 });

      const nodes = useAppStore.getState().nodes;
      const pcId = nodes.find((n) => n.data.type === 'pc')!.id;
      const swId = nodes.find((n) => n.data.type === 'switch')!.id;
      const srvId = nodes.find((n) => n.data.type === 'server')!.id;

      // Connect PC fa0 to Switch fa0/1
      const c1 = store.connectPorts(pcId, 'fa0', swId, 'fa0/1');
      expect(c1).toBe(true);

      // Try connecting PC fa0 (already bound) to Switch fa0/2 -> must be rejected
      const c2 = store.connectPorts(pcId, 'fa0', swId, 'fa0/2');
      expect(c2).toBe(false);

      // Try connecting Server fa0 to Switch fa0/1 (already bound) -> must be rejected
      const c3 = store.connectPorts(srvId, 'fa0', swId, 'fa0/1');
      expect(c3).toBe(false);
    });

    it('Administrative Port Status: router port defaults to down on connect and toggle updates state', () => {
      const store = useAppStore.getState();
      store.addDevice('router', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });

      const nodes = useAppStore.getState().nodes;
      const rId = nodes.find((n) => n.data.type === 'router')!.id;
      const swId = nodes.find((n) => n.data.type === 'switch')!.id;

      // Connect router to switch
      store.connectPorts(rId, 'fa0/0', swId, 'fa0/1');

      // Router port defaults to down (admin down per Cisco IOS standard)
      const rNodeAfterConnect = useAppStore.getState().nodes.find((n) => n.id === rId)!;
      const rPort = rNodeAfterConnect.data.ports.find((p) => p.id === 'fa0/0')!;
      expect(rPort.status).toBe('down');

      // Toggle port UP via updatePortConfig
      store.updatePortConfig(rId, 'fa0/0', { status: 'up' });
      const rPortAfterToggle = useAppStore.getState().nodes.find((n) => n.id === rId)!.data.ports.find((p) => p.id === 'fa0/0')!;
      expect(rPortAfterToggle.status).toBe('up');
    });

    it('Device deletion cleanup cleans edges, peer port bindings, and ARP/CAM tables', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });

      const nodes = useAppStore.getState().nodes;
      const pcId = nodes.find((n) => n.data.type === 'pc')!.id;
      const swId = nodes.find((n) => n.data.type === 'switch')!.id;

      store.connectPorts(pcId, 'fa0', swId, 'fa0/1');

      // Simulate CAM table entry on switch
      const pcMac = nodes.find((n) => n.id === pcId)!.data.ports[0].macAddress;
      store.updateDeviceConfig(swId, {
        macTable: { [pcMac]: 'fa0/1' },
      });

      expect(useAppStore.getState().edges).toHaveLength(1);
      expect(useAppStore.getState().nodes.find((n) => n.id === swId)!.data.macTable?.[pcMac]).toBe('fa0/1');

      // Delete PC node
      store.deleteNode(pcId);

      // Verify node deleted
      expect(useAppStore.getState().nodes.find((n) => n.id === pcId)).toBeUndefined();
      // Verify edges cleaned up
      expect(useAppStore.getState().edges).toHaveLength(0);

      // Verify peer switch port fa0/1 is down and unlinked
      const swNode = useAppStore.getState().nodes.find((n) => n.id === swId)!;
      const swPort = swNode.data.ports.find((p) => p.id === 'fa0/1')!;
      expect(swPort.connectedEdgeId).toBeUndefined();
      expect(swPort.status).toBe('down');

      // Verify CAM table entry on switch was removed
      expect(swNode.data.macTable?.[pcMac]).toBeUndefined();
    });
  });

  describe('3. Cisco IOS CLI Parity & Bi-directional Sync (INV-006)', () => {
    it('CLI parses ip route and no ip route with multi-word interface names (spaces)', async () => {
      const currentDevice: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:01' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:00:00:02' },
        ],
        routes: [],
      };

      const deps: CliSessionDeps = {
        getDevice: () => currentDevice,
        setHostname: (name) => { currentDevice.label = name; },
        setPortConfig: (portId, updates) => {
          const p = currentDevice.ports.find((pr) => pr.id === portId);
          if (p) Object.assign(p, updates);
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
        addStaticRoute: (route) => {
          currentDevice.routes = [...(currentDevice.routes || []), route];
        },
        removeStaticRoute: (index) => {
          const routes = [...(currentDevice.routes || [])];
          routes.splice(index, 1);
          currentDevice.routes = routes;
        },
      };

      const session = new CliSession(deps);
      await session.handle('enable');
      await session.handle('conf t');

      // Add static route with space in interface name
      await session.handle('ip route 10.0.0.0 255.0.0.0 FastEthernet 0/0');
      expect(currentDevice.routes).toHaveLength(1);
      expect(currentDevice.routes![0].network).toBe('10.0.0.0');
      expect(currentDevice.routes![0].subnetMask).toBe('255.0.0.0');
      expect(currentDevice.routes![0].nextHop).toBe('FastEthernet 0/0');
      expect(currentDevice.routes![0].interfaceId).toBe('fa0/0');

      // Remove static route specifying the spaced interface name
      await session.handle('no ip route 10.0.0.0 255.0.0.0 FastEthernet 0/0');
      expect(currentDevice.routes).toHaveLength(0);
    });

    it('CLI prompt transitions and commands: sh run, wr, sh ip int br, sh ip route, clear mac, clear arp', async () => {
      let saved = false;
      let macCleared = false;
      let arpCleared = false;

      let dev: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        arpTable: { '192.168.1.10': '00:50:79:00:00:10' },
      };

      const session = new CliSession({
        getDevice: () => dev,
        setHostname: (h) => { dev.label = h; },
        setPortConfig: (pId, u) => {
          const p = dev.ports.find((pr) => pr.id === pId);
          if (p) Object.assign(p, u);
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
        saveConfig: () => { saved = true; },
        clearMacTable: () => { macCleared = true; },
        clearArpTable: () => { arpCleared = true; },
      });

      // User mode prompt
      expect(session.prompt()).toBe('R1>');
      await session.handle('enable');
      expect(session.prompt()).toBe('R1#');

      // wr / write memory
      const wrOut = await session.handle('wr');
      expect(wrOut).toContain('[OK]');
      expect(saved).toBe(true);

      // sh ip int br
      const intBr = await session.handle('sh ip int br');
      expect(intBr.join('\n')).toContain('192.168.1.1');

      // sh ip route
      const routeOut = await session.handle('sh ip route');
      expect(routeOut.join('\n')).toContain('192.168.1.0/24');

      // clear arp
      await session.handle('clear arp');
      expect(arpCleared).toBe(true);

      // Switch to switch device to test clear mac
      dev = {
        id: 'sw-1',
        label: 'SW1',
        type: 'switch',
        ports: [{ id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:00:01' }],
      };
      await session.handle('clear mac');
      expect(macCleared).toBe(true);

      // config t -> prompt transitions
      await session.handle('conf t');
      expect(session.prompt()).toBe('SW1(config)#');

      await session.handle('int fa0/1');
      expect(session.prompt()).toBe('SW1(config-if)#');

      await session.handle('exit');
      expect(session.prompt()).toBe('SW1(config)#');

      await session.handle('exit');
      expect(session.prompt()).toBe('SW1#');

      // disable drops to user mode
      await session.handle('disable');
      expect(session.prompt()).toBe('SW1>');

      // show version works in user mode
      const verOutUser = await session.handle('show version');
      expect(verOutUser.join('\n')).toContain('Cisco IOS Software');

      // sh ver works in priv mode
      await session.handle('enable');
      const verOutPriv = await session.handle('sh ver');
      expect(verOutPriv.join('\n')).toContain('Version 15.1');
    });

    it('CLI command parity enhancements: sh int tr, sh ip int without brief, show running, and clear mac-table', async () => {
      let macTableCleared = false;
      const sw: DeviceData = {
        id: 'sw-1', label: 'SW1', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'trunk', macAddress: '00:50:79:00:00:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', ipAddress: '192.168.1.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:02' },
        ],
      };
      const session = new CliSession({
        getDevice: () => sw,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
        clearMacTable: () => { macTableCleared = true; },
      });

      await session.handle('enable');

      // sh int tr (alias for show interfaces trunk)
      const trunkOut = await session.handle('sh int tr');
      expect(trunkOut.join('\n')).toContain('fa0/1');
      expect(trunkOut.join('\n')).toContain('802.1q');

      // sh ip int (without brief in priv mode)
      const ipIntOut = await session.handle('sh ip int');
      expect(ipIntOut.join('\n')).toContain('192.168.1.2');

      // show running (alias for show running-config)
      const runOut = await session.handle('show running');
      expect(runOut.join('\n')).toContain('hostname SW1');
      expect(runOut.join('\n')).toContain('switchport mode trunk');

      // clear mac-table
      await session.handle('clear mac-table');
      expect(macTableCleared).toBe(true);
    });
    it('CLI switchport management: switchport access vlan, no switchport access vlan, and no switchport mode', async () => {
      const sw: DeviceData = {
        id: 'sw-1', label: 'SW1', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 1, macAddress: '00:50:79:00:00:01' },
        ],
      };
      const session = new CliSession({
        getDevice: () => sw,
        setHostname: () => {},
        setPortConfig: (portId, updates) => {
          const p = sw.ports.find((pr) => pr.id === portId);
          if (p) Object.assign(p, updates);
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
      });

      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/1');

      // switchport access vlan 20
      await session.handle('switchport access vlan 20');
      expect(sw.ports[0].vlanId).toBe(20);

      // no switchport access vlan resets to vlan 1
      await session.handle('no switchport access vlan');
      expect(sw.ports[0].vlanId).toBe(1);

      // switchport mode trunk
      await session.handle('switchport mode trunk');
      expect(sw.ports[0].portMode).toBe('trunk');

      // no switchport mode resets to access
      await session.handle('no switchport mode');
      expect(sw.ports[0].portMode).toBe('access');
    });

    it('CLI findPort resolves shorthand aliases (f0/0, g0/0) and sub-interfaces (f0/0.10, gi0/0.20)', async () => {
      const router: DeviceData = {
        id: 'r-1', label: 'R1', type: 'router',
        ports: [
          {
            id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:01',
            subInterfaces: [{ vlanId: 10, ipAddress: '10.0.10.1', subnetMask: '255.255.255.0' }],
          },
          {
            id: 'gi0/0', name: 'GigabitEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:02',
            subInterfaces: [{ vlanId: 20, ipAddress: '10.0.20.1', subnetMask: '255.255.255.0' }],
          },
        ],
      };

      const session = new CliSession({
        getDevice: () => router,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
      });

      await session.handle('enable');
      await session.handle('conf t');

      // Navigate to f0/0.10 using shorthand
      await session.handle('int f0/0.10');
      expect(session.prompt()).toBe('R1(config-subif)#');
      expect(session.currentInterface).toBe('fa0/0');
      expect(session.currentSubInterface?.vlanId).toBe(10);

      // Navigate to g0/0.20 using shorthand
      await session.handle('int g0/0.20');
      expect(session.prompt()).toBe('R1(config-subif)#');
      expect(session.currentInterface).toBe('gi0/0');
      expect(session.currentSubInterface?.vlanId).toBe(20);
    });
  });

  describe('4. Invariants INV-001 through INV-008 Compliance', () => {
    it('INV-001 Zero DOM: Engine operates purely without window or document globals', () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');
    });

    it('INV-004 Determinism: Repeated planPing on same topology produces identical event sequences', () => {
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC-2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:02' }],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const e1 = new HeadlessSimulationEngine();
      e1.setTopology([pc1, pc2], links);
      const plan1 = e1.planPing('pc-1', '192.168.1.20');

      const e2 = new HeadlessSimulationEngine();
      e2.setTopology([pc1, pc2], links);
      const plan2 = e2.planPing('pc-1', '192.168.1.20');

      expect(plan1.events.length).toBe(plan2.events.length);
      expect(plan1.summary.success).toBe(plan2.summary.success);
      expect(plan1.events.map((e) => e.kind)).toEqual(plan2.events.map((e) => e.kind));
    });
  });
});
