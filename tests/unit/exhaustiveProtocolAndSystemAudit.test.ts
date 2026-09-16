import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { type DeviceData, type TopologyLink, type RoutingEntry } from '../../src/types/network';
import { useAppStore } from '../../src/store/useAppStore';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';

describe('Exhaustive Line-by-Line Protocol and System Audit', () => {
  beforeEach(() => {
    useAppStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      activeLabId: null,
      simulationLogs: [],
    });
  });

  describe('1. simulationEngine: Layer 2 Switching, MAC Preservation, and 802.1Q', () => {
    it('L2 intermediate switches preserve source and destination MAC addresses across multi-switch path', () => {
      // PC1 -> SW1 -> SW2 -> SW3 -> PC2
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:01:01' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC-2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:02:02' }],
      };
      const sw1: DeviceData = {
        id: 'sw-1', label: 'SW-1', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:11:11:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:11:11:02' },
        ],
        macTable: {},
      };
      const sw2: DeviceData = {
        id: 'sw-2', label: 'SW-2', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:22:22:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:22:22:02' },
        ],
        macTable: {},
      };
      const sw3: DeviceData = {
        id: 'sw-3', label: 'SW-3', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:33:33:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:33:33:02' },
        ],
        macTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'sw-2', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-2', sourcePortId: 'fa0/2', targetNodeId: 'sw-3', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-3', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2, sw1, sw2, sw3], links);

      const plan = engine.planPing('pc-1', '192.168.1.20', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify ICMP_REQ hops: all 4 hops (PC1->SW1, SW1->SW2, SW2->SW3, SW3->PC2)
      // must preserve srcMac = PC1's MAC and dstMac = PC2's MAC
      const icmpReqs = plan.events.filter((e) => e.kind === 'ICMP_REQ');
      expect(icmpReqs.length).toBe(4);
      for (const req of icmpReqs) {
        expect(req.pdu?.frame.srcMac).toBe('00:50:79:00:01:01');
        expect(req.pdu?.frame.dstMac).toBe('00:50:79:00:02:02');
      }

      // Verify ICMP_REP hops: all 4 return hops must preserve srcMac = PC2's MAC and dstMac = PC1's MAC
      const icmpReps = plan.events.filter((e) => e.kind === 'ICMP_REP');
      expect(icmpReps.length).toBe(4);
      for (const rep of icmpReps) {
        expect(rep.pdu?.frame.srcMac).toBe('00:50:79:00:02:02');
        expect(rep.pdu?.frame.dstMac).toBe('00:50:79:00:01:01');
      }

      // Verify CAM learning across all 3 intermediate switches
      const updatedDevices = engine.getDevices();
      const s1 = updatedDevices.find((d) => d.id === 'sw-1')!;
      const s2 = updatedDevices.find((d) => d.id === 'sw-2')!;
      const s3 = updatedDevices.find((d) => d.id === 'sw-3')!;

      // SW1 learns PC1 on fa0/1 and PC2 on fa0/2
      expect(s1.macTable?.[pc1.ports[0].macAddress]).toBe('fa0/1');
      expect(s1.macTable?.[pc2.ports[0].macAddress]).toBe('fa0/2');

      // SW2 learns PC1 on fa0/1 and PC2 on fa0/2
      expect(s2.macTable?.[pc1.ports[0].macAddress]).toBe('fa0/1');
      expect(s2.macTable?.[pc2.ports[0].macAddress]).toBe('fa0/2');

      // SW3 learns PC1 on fa0/1 and PC2 on fa0/2
      expect(s3.macTable?.[pc1.ports[0].macAddress]).toBe('fa0/1');
      expect(s3.macTable?.[pc2.ports[0].macAddress]).toBe('fa0/2');
    });

    it('VLAN isolation: access ports with different VLAN IDs strictly isolate traffic', () => {
      // PC1 (access vlan 10) and PC2 (access vlan 20) on same switch cannot communicate
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:01:01', vlanId: 10 }],
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC-2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:02:02', vlanId: 20 }],
      };
      const sw: DeviceData = {
        id: 'sw-1', label: 'SW-1', type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:11:11:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', portMode: 'access', vlanId: 20, macAddress: '00:50:79:11:11:02' },
        ],
        macTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2, sw], links);

      const plan = engine.planPing('pc-1', '192.168.1.20');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.received).toBe(0);
    });
  });

  describe('2. simulationEngine: Layer 3 Routing (LPM, Direct Static Routes, Status UP)', () => {
    it('Longest Prefix Match: chooses /30 over /24 and /24 over default route 0.0.0.0/0', () => {
      // Router with 3 routes matching 10.1.1.1:
      // Default route 0.0.0.0/0 via 192.168.0.1 (fa0/0)
      // Route 10.1.0.0/16 via 192.168.16.1 (fa0/1)
      // Route 10.1.1.0/24 via 192.168.24.1 (fa0/2)
      // Route 10.1.1.0/30 via 192.168.30.1 (fa0/3)
      const router: DeviceData = {
        id: 'r-1', label: 'R1', type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.0.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:00' },
          { id: 'fa0/1', name: 'fa0/1', status: 'up', ipAddress: '192.168.16.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:16' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', ipAddress: '192.168.24.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:24' },
          { id: 'fa0/3', name: 'fa0/3', status: 'up', ipAddress: '192.168.30.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:30' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '192.168.0.1', interfaceId: 'fa0/0', source: 'static' },
          { network: '10.1.0.0', subnetMask: '255.255.0.0', nextHop: '192.168.16.1', interfaceId: 'fa0/1', source: 'static' },
          { network: '10.1.1.0', subnetMask: '255.255.255.0', nextHop: '192.168.24.1', interfaceId: 'fa0/2', source: 'static' },
          { network: '10.1.1.0', subnetMask: '255.255.255.252', nextHop: '192.168.30.1', interfaceId: 'fa0/3', source: 'static' },
        ],
      };

      const nextHopDev30: DeviceData = {
        id: 'r-30', label: 'R-30', type: 'router',
        ports: [{ id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.30.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:30:00:01' }],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/3', targetNodeId: 'r-30', targetPortId: 'fa0/0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, nextHopDev30], links);

      // Ping towards 10.1.1.1 should route via 192.168.30.1 out of fa0/3 (LPM /30 wins!)
      const plan = engine.planPing('r-1', '10.1.1.1');
      const firstHop = plan.events.find((e) => e.hop);
      expect(firstHop?.hop?.sourcePortId).toBe('fa0/3');
      expect(firstHop?.hop?.targetNodeId).toBe('r-30');
    });

    it('Status UP enforcement: routes through administratively DOWN interfaces are ignored', () => {
      // R1 has fa0/0 (connected to PC1, UP) and fa0/1 (connected to PC2, DOWN)
      const router: DeviceData = {
        id: 'r-1', label: 'R1', type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
          { id: 'fa0/1', name: 'fa0/1', status: 'down', ipAddress: '10.1.1.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:02' },
        ],
      };
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:10' }],
        defaultGateway: '192.168.1.1',
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC-2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.1.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:20' }],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, pc1, pc2], links);

      // 1. Ping from router when its own egress interface is DOWN fails with Link DOWN
      const rPing = engine.planPing('r-1', '10.1.1.10');
      expect(rPing.summary.success).toBe(false);
      expect(rPing.summary.outputLines.join('\n')).toContain('No route to host');

      // 2. Ping from PC-1 through router fails because router has no UP route to 10.1.1.10
      const pcPing = engine.planPing('pc-1', '10.1.1.10');
      expect(pcPing.summary.success).toBe(false);
      expect(pcPing.events.some((e) => e.level === 'ERROR' && e.message.includes('No route to host'))).toBe(true);
    });

    it('Directly attached static route with interface name resolves correctly', () => {
      const router: DeviceData = {
        id: 'r-1', label: 'R1', type: 'router',
        ports: [
          { id: 'gi0/0', name: 'GigabitEthernet0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:01:01' },
        ],
        routes: [
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: 'GigabitEthernet0/0', interfaceId: 'gi0/0', source: 'static' },
        ],
      };
      const targetPc: DeviceData = {
        id: 'pc-target', label: 'PC-Target', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '172.16.5.5', subnetMask: '255.255.0.0', macAddress: '00:50:79:17:16:05' }],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'gi0/0', targetNodeId: 'pc-target', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, targetPc], links);

      const plan = engine.planPing('r-1', '172.16.5.5');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(plan.summary.sent);
    });
  });

  describe('3. Multi-Interface Devices and NAT/PAT Multi-Hop Traversal', () => {
    it('Multi-interface host selects the matching subnet port for direct traffic', () => {
      // Server with eth0 (192.168.1.100/24) and eth1 (10.0.0.100/24)
      const server: DeviceData = {
        id: 'srv-1', label: 'SRV-1', type: 'server',
        ports: [
          { id: 'eth0', name: 'eth0', status: 'up', ipAddress: '192.168.1.100', subnetMask: '255.255.255.0', macAddress: '00:50:79:AA:01:00' },
          { id: 'eth1', name: 'eth1', status: 'up', ipAddress: '10.0.0.100', subnetMask: '255.255.255.0', macAddress: '00:50:79:AA:02:00' },
        ],
      };
      const pc1: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:BB:01:10' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2', label: 'PC-2', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:BB:02:20' }],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'srv-1', sourcePortId: 'eth0', targetNodeId: 'pc-1', targetPortId: 'fa0' },
        { sourceNodeId: 'srv-1', sourcePortId: 'eth1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([server, pc1, pc2], links);

      // Ping to PC1 uses eth0
      const plan1 = engine.planPing('srv-1', '192.168.1.10');
      expect(plan1.summary.success).toBe(true);
      expect(plan1.events.find((e) => e.hop)?.hop?.sourcePortId).toBe('eth0');

      // Ping to PC2 uses eth1
      const plan2 = engine.planPing('srv-1', '10.0.0.20');
      expect(plan2.summary.success).toBe(true);
      expect(plan2.events.find((e) => e.hop)?.hop?.sourcePortId).toBe('eth1');
    });

    it('Multi-hop NAT/PAT: private packet traversing internal router and NAT edge router to Cloud Internet (8.8.8.8)', () => {
      // PC1 (192.168.1.10) -> R1 (Internal) -> R2 (Edge NAT) -> Cloud (8.8.8.8)
      const pc: DeviceData = {
        id: 'pc-1', label: 'PC-1', type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' }],
        defaultGateway: '192.168.1.1',
      };
      const r1: DeviceData = {
        id: 'r-1', label: 'R1-Internal', type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          { id: 'fa0/1', name: 'fa0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '10.0.0.2', interfaceId: 'fa0/1', source: 'static' },
        ],
      };
      const r2: DeviceData = {
        id: 'r-2', label: 'R2-EdgeNAT', type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.252', macAddress: '00:50:79:02:00:01' },
          { id: 'fa0/1', name: 'fa0/1', status: 'up', ipAddress: '203.0.113.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:02', natEnabled: true },
        ],
        routes: [
          { network: '192.168.1.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.1', interfaceId: 'fa0/0', source: 'static' },
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.1', interfaceId: 'fa0/1', source: 'static' },
        ],
        natTable: [],
      };
      const cloud: DeviceData = {
        id: 'cloud-1', label: 'Internet', type: 'cloud',
        ports: [{ id: 'wan0', name: 'wan0', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:CC:CC:01' }],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'r-2', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-2', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, r1, r2, cloud], links);

      const plan = engine.planPing('pc-1', '8.8.8.8', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify NAT occurred at R2 (out of fa0/1)
      const natHop = plan.events.find(
        (e) => e.hop?.sourceNodeId === 'r-2' && e.hop?.targetNodeId === 'cloud-1' && e.kind === 'ICMP_REQ'
      );
      expect(natHop?.pdu?.packet?.srcIp).toBe('203.0.113.10');
      expect(natHop?.effects?.some((eff) => eff.type === 'NAT_TRANSLATE')).toBe(true);

      // Verify de-NATting on return path
      const deNatHop = plan.events.find(
        (e) => e.hop?.sourceNodeId === 'r-2' && e.hop?.targetNodeId === 'r-1' && e.kind === 'ICMP_REP'
      );
      expect(deNatHop?.pdu?.packet?.dstIp).toBe('192.168.1.10');
    });
  });

  describe('4. Store & Canvas Invariants (INV-003, Admin Down, Deletion Cleanup)', () => {
    it('Admin Down state toggle updates router port and reflects in CLI and ping simulation', async () => {
      const store = useAppStore.getState();
      store.addDevice('router', { x: 100, y: 100 });
      store.addDevice('pc', { x: 300, y: 100 });

      const rNode = useAppStore.getState().nodes.find((n) => n.data.type === 'router')!;
      const pcNode = useAppStore.getState().nodes.find((n) => n.data.type === 'pc')!;
      const rPort = rNode.data.ports[0];
      const pcPort = pcNode.data.ports[0];

      // Configure IPs
      store.updatePortConfig(rNode.id, rPort.id, { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0' });
      store.updatePortConfig(pcNode.id, pcPort.id, { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' });

      // Connect cable: router port defaults to down
      store.connectPorts(rNode.id, rPort.id, pcNode.id, pcPort.id);

      const rPortAfterConnect = useAppStore.getState().nodes.find((n) => n.id === rNode.id)!.data.ports[0];
      expect(rPortAfterConnect.status).toBe('down'); // Administratively down

      // CLI session on router: no shutdown
      const deps: CliSessionDeps = {
        getDevice: () => useAppStore.getState().nodes.find((n) => n.id === rNode.id)!.data,
        setHostname: (name) => store.updateDeviceConfig(rNode.id, { label: name }),
        setPortConfig: (pId, upd) => store.updatePortConfig(rNode.id, pId, upd),
        requestPing: async () => ({ success: true, outputLines: [] }),
      };
      const session = new CliSession(deps);
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle(`int ${rPort.id}`);
      await session.handle('no shutdown');

      // Now port status is up
      const rPortUp = useAppStore.getState().nodes.find((n) => n.id === rNode.id)!.data.ports[0];
      expect(rPortUp.status).toBe('up');

      // Turn shutdown in CLI
      await session.handle('shutdown');
      const rPortDown = useAppStore.getState().nodes.find((n) => n.id === rNode.id)!.data.ports[0];
      expect(rPortDown.status).toBe('down');
    });

    it('Device deletion cleans up peer port status, ARP entries, and CAM table entries', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });

      const pc = useAppStore.getState().nodes.find((n) => n.data.type === 'pc')!;
      const sw = useAppStore.getState().nodes.find((n) => n.data.type === 'switch')!;

      store.connectPorts(pc.id, pc.data.ports[0].id, sw.id, sw.data.ports[0].id);

      // Add dummy ARP and CAM entry
      store.updateDeviceConfig(sw.id, {
        macTable: { [pc.data.ports[0].macAddress]: sw.data.ports[0].id },
      });

      expect(useAppStore.getState().edges.length).toBe(1);

      // Delete PC
      store.deleteNode(pc.id);

      const swAfter = useAppStore.getState().nodes.find((n) => n.id === sw.id)!;
      // Peer port status returned to down and unlinked
      expect(swAfter.data.ports[0].status).toBe('down');
      expect(swAfter.data.ports[0].connectedEdgeId).toBeUndefined();

      // CAM entry for deleted PC's MAC removed
      expect(swAfter.data.macTable?.[pc.data.ports[0].macAddress]).toBeUndefined();
      // Edges cleared
      expect(useAppStore.getState().edges.length).toBe(0);
    });
  });

  describe('5. CLI Engine Parity: Commands and Bi-directional Synchronization', () => {
    it('CLI parses show mac address-table (with spaces) and dynamic alias', async () => {
      const dev: DeviceData = {
        id: 'sw-1', label: 'SW1', type: 'switch',
        ports: [{ id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:00:00:01' }],
        macTable: { '00:50:79:aa:bb:cc': 'fa0/1' },
      };
      const session = new CliSession({
        getDevice: () => dev,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
      });

      await session.handle('enable');
      const out1 = await session.handle('show mac address-table');
      expect(out1.join('\n')).toContain('00:50:79:aa:bb:cc');

      const out2 = await session.handle('sh mac address-table dynamic');
      expect(out2.join('\n')).toContain('00:50:79:aa:bb:cc');
    });

    it('CLI resolves sub-interface for nextHop IP in ip route command', async () => {
      let addedRoute: RoutingEntry | null = null;
      const router: DeviceData = {
        id: 'r-1', label: 'R1', type: 'router',
        ports: [
          {
            id: 'gi0/0', name: 'GigabitEthernet0/0', status: 'up', macAddress: '00:50:79:00:00:01',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.254', subnetMask: '255.255.255.0' },
            ],
          },
        ],
      };
      const session = new CliSession({
        getDevice: () => router,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
        addStaticRoute: (r) => { addedRoute = r; },
      });

      await session.handle('enable');
      await session.handle('conf t');
      // Next hop 192.168.10.1 belongs to subinterface gi0/0.10!
      await session.handle('ip route 172.16.0.0 255.255.0.0 192.168.10.1');

      expect(addedRoute).not.toBeNull();
      const route = addedRoute!;
      expect(route.network).toBe('172.16.0.0');
      expect(route.interfaceId).toBe('gi0/0.10');
    });
  });
});
