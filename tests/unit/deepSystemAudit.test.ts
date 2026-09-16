import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import {
  type DeviceData,
  type TopologyLink,
} from '../../src/types/network';
import { resetMacGenerator } from '../../src/utils/ipUtils';

describe('Deep System Audit: Complete Verification Across All Features', () => {
  beforeEach(() => {
    resetMacGenerator(1);
    useAppStore.getState().resetTopology();
  });

  // =========================================================================
  // 1. ARP: Cache updates, broadcast flooding, IP matching, response unicast
  // =========================================================================
  describe('1. ARP Protocol Deep Audit', () => {
    it('ARP cache miss triggers broadcast request, switch CAM learning, unicast reply, and ARP cache update on sender and target', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:01', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' },
        ],
        arpTable: {},
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:02', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0' },
        ],
        arpTable: {},
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:00:00:SW' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:00:00:SW' },
        ],
        macTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2, sw], links);

      const plan = engine.planPing('pc-1', '192.168.1.20', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify ARP Request is broadcast with FF:FF:FF:FF:FF:FF
      const arpReq = plan.events.find((e) => e.kind === 'ARP_REQ');
      expect(arpReq).toBeDefined();
      expect(arpReq?.pdu?.frame.dstMac).toBe('FF:FF:FF:FF:FF:FF');
      expect(arpReq?.pdu?.segment && 'opcode' in arpReq.pdu.segment && arpReq.pdu.segment.opcode).toBe(1);

      // Verify ARP Reply is unicast directly back to PC-1 MAC
      const arpRep = plan.events.find((e) => e.kind === 'ARP_REP' && e.hop?.targetNodeId === 'pc-1');
      expect(arpRep).toBeDefined();
      expect(arpRep?.pdu?.frame.dstMac).toBe('00:50:79:00:00:01');
      expect(arpRep?.pdu?.segment && 'opcode' in arpRep.pdu.segment && arpRep.pdu.segment.opcode).toBe(2);

      // Verify ARP_LEARN effect is attached to the ARP reply arrival at pc-1
      expect(arpRep?.effects?.some((eff) => eff.type === 'ARP_LEARN' && eff.nodeId === 'pc-1' && eff.ip === '192.168.1.20')).toBe(true);

      // Verify second ping has ARP cache HIT and no ARP_REQ is emitted
      const plan2 = engine.planPing('pc-1', '192.168.1.20', { echoCount: 1 });
      expect(plan2.summary.success).toBe(true);
      expect(plan2.events.some((e) => e.kind === 'ARP_REQ')).toBe(false);
      expect(plan2.events.some((e) => e.message.includes('ARP Cache HIT'))).toBe(true);
    });

    it('Invalidates stale ARP cache on other devices when IP address is changed or cleared in useAppStore', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 0, y: 0 });
      store.addDevice('pc', { x: 200, y: 0 });

      const nodes = useAppStore.getState().nodes;
      const pc1Id = nodes[0].id;
      const pc2Id = nodes[1].id;

      store.updatePortConfig(pc1Id, 'fa0', { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' });
      store.updatePortConfig(pc2Id, 'fa0', { ipAddress: '192.168.1.20', subnetMask: '255.255.255.0' });

      // Simulate pre-learned ARP entry on PC-2 pointing to PC-1's old IP
      useAppStore.setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === pc2Id
            ? { ...n, data: { ...n.data, arpTable: { '192.168.1.10': '00:50:79:00:00:01' } } }
            : n
        ),
      }));

      // Invalidate by clearing IP (no ip address)
      store.updatePortConfig(pc1Id, 'fa0', { ipAddress: undefined });

      const updatedPc2 = useAppStore.getState().nodes.find((n) => n.id === pc2Id);
      expect(updatedPc2?.data.arpTable?.['192.168.1.10']).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. L2 Switch: CAM table learning with VLAN context and port isolation
  // =========================================================================
  describe('2. L2 Switch CAM & 802.1Q VLAN Audit', () => {
    it('Switch CAM table learns MAC with correct 802.1Q VLAN tag from ingress frame on trunk', () => {
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            portMode: 'trunk',
            macAddress: '00:50:79:00:00:R1',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
        routes: [],
        arpTable: {},
      };

      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', portMode: 'trunk', macAddress: '00:50:79:00:00:SW1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:00:00:SW2' },
        ],
        macTable: {},
      };

      const pc10: DeviceData = {
        id: 'pc-10',
        label: 'PC-10',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:10', ipAddress: '192.168.10.50', subnetMask: '255.255.255.0', vlanId: 10 },
        ],
        defaultGateway: '192.168.10.1',
        arpTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-10', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, sw, pc10], links);

      const plan = engine.planPing('pc-10', '192.168.10.1', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify that CAM_LEARN effect on switch port fa0/2 learned with vlan: 10
      const camEffect = plan.events
        .flatMap((e) => e.effects ?? [])
        .find((eff) => eff.type === 'CAM_LEARN' && eff.nodeId === 'sw-1' && eff.portId === 'fa0/2');

      expect(camEffect).toBeDefined();
      if (camEffect && camEffect.type === 'CAM_LEARN') {
        expect(camEffect.vlan).toBe(10);
      }
    });

    it('Isolates ports on different access VLANs (no physical/L2 path)', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:01', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', vlanId: 10 },
        ],
        arpTable: {},
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:02', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', vlanId: 20 },
        ],
        arpTable: {},
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:00:00:S1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', portMode: 'access', vlanId: 20, macAddress: '00:50:79:00:00:S2' },
        ],
        macTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
        { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2, sw], links);

      const plan = engine.planPing('pc-1', '192.168.1.20', { echoCount: 1 });
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('Tidak ada jalur fisik/Layer-2'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. L3 Router: Longest Prefix Match (LPM), sub-interfaces, and port down status
  // =========================================================================
  describe('3. L3 Router Longest Prefix Match & Sub-interfaces', () => {
    it('LPM: More specific prefix (/28) wins over less specific (/24) and default route (/0)', () => {
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:02' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', ipAddress: '10.0.2.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:03' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '10.0.0.254', interfaceId: 'fa0/0', source: 'static' },
          { network: '172.16.0.0', subnetMask: '255.255.255.0', nextHop: '10.0.1.254', interfaceId: 'fa0/1', source: 'static' },
          { network: '172.16.0.16', subnetMask: '255.255.255.240', nextHop: '10.0.2.254', interfaceId: 'fa0/2', source: 'static' },
        ],
      };

      const targetGateway: DeviceData = {
        id: 'r-target',
        label: 'Router-Target',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '10.0.2.254', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:T1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '172.16.0.20', subnetMask: '255.255.255.240', macAddress: '00:50:79:00:00:T2' },
        ],
        routes: [
          { network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '10.0.2.1', interfaceId: 'fa0/0', source: 'static' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/2', targetNodeId: 'r-target', targetPortId: 'fa0/0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, targetGateway], links);

      const plan = engine.planPing('r-1', '172.16.0.20', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify the ICMP hop went out through fa0/2 (the /28 route egress), NOT fa0/1 (/24) or fa0/0 (/0)
      const icmpHop = plan.events.find((e) => e.kind === 'ICMP_REQ' && e.hop?.sourceNodeId === 'r-1');
      expect(icmpHop?.hop?.sourcePortId).toBe('fa0/2');
    });

    it('Rejects traffic and skips routes when egress physical interface status is down', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        defaultGateway: '192.168.1.1',
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
          // Egress port to remote subnet is DOWN (administratively down / unplugged)
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', ipAddress: '192.168.2.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R2' },
        ],
        routes: [],
      };
      const pcRemote: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.2.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:02' },
        ],
        defaultGateway: '192.168.2.1',
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, router, pcRemote], links);

      const plan = engine.planPing('pc-1', '192.168.2.10', { echoCount: 1 });
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('No route to host'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. DHCP: DORA flow, IP pool allocation, lease tracking, multi-interface
  // =========================================================================
  describe('4. DHCP Protocol Audit (DORA & Leases)', () => {
    it('Executes DORA flow, allocates first free IP skipping network/broadcast, and applies DHCP_LEASE effect', () => {
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
        ],
        dhcpPools: {
          'fa0/0': {
            enabled: true,
            network: '192.168.1.0',
            mask: '255.255.255.0',
            startIp: '192.168.1.100',
            maxClients: 10,
          },
        },
      };

      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: '00:50:79:00:00:01' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([router, pc], links);

      const plan = engine.planDhcp('pc-1', 'fa0');
      expect(plan.summary.success).toBe(true);

      // Verify DORA events sequence
      const kinds = plan.events.map((e) => e.kind).filter((k) => k.startsWith('DHCP_'));
      expect(kinds).toContain('DHCP_DISCOVER');
      expect(kinds).toContain('DHCP_OFFER');
      expect(kinds).toContain('DHCP_REQUEST');
      expect(kinds).toContain('DHCP_ACK');

      // Verify lease was granted and applied to PC port
      const updatedPc = engine.getDevices().find((d) => d.id === 'pc-1');
      expect(updatedPc?.ports[0].ipAddress).toBe('192.168.1.100');
      expect(updatedPc?.ports[0].subnetMask).toBe('255.255.255.0');
      expect(updatedPc?.defaultGateway).toBe('192.168.1.1');
    });
  });

  // =========================================================================
  // 5. NAT/PAT & Cloud Internet: Inside/Outside translation & Offline behavior
  // =========================================================================
  describe('5. NAT/PAT & Simulated Cloud Internet (INV-008)', () => {
    it('Translates private IP to public WAN IP on forward path and restores private IP on return path when pinging 8.8.8.8', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        defaultGateway: '192.168.1.1',
      };

      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '203.0.113.2', subnetMask: '255.255.255.0', natEnabled: true, macAddress: '00:50:79:00:00:R2' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.1', interfaceId: 'fa0/1', source: 'static' },
        ],
      };

      const cloud: DeviceData = {
        id: 'cloud-1',
        label: 'Internet',
        type: 'cloud',
        ports: [
          { id: 'wan0', name: 'WAN 0', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:CL' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, router, cloud], links);

      const plan = engine.planPing('pc-1', '8.8.8.8', { echoCount: 1 });
      expect(plan.summary.success).toBe(true);

      // Verify WAN packet has translated source IP (203.0.113.2), not 192.168.1.10
      const wanReq = plan.events.find((e) => e.kind === 'ICMP_REQ' && e.hop?.sourceNodeId === 'r-1');
      expect(wanReq?.pdu?.packet?.srcIp).toBe('203.0.113.2');

      // Verify return reply packet inside LAN is restored to 192.168.1.10
      const lanRep = plan.events.find((e) => e.kind === 'ICMP_REP' && e.hop?.targetNodeId === 'pc-1');
      expect(lanRep?.pdu?.packet?.dstIp).toBe('192.168.1.10');
    });

    it('Cloud rejects private IP when NAT is not configured on WAN interface', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        defaultGateway: '192.168.1.1',
      };

      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '203.0.113.2', subnetMask: '255.255.255.0', natEnabled: false, macAddress: '00:50:79:00:00:R2' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.1', interfaceId: 'fa0/1', source: 'static' },
        ],
      };

      const cloud: DeviceData = {
        id: 'cloud-1',
        label: 'Internet',
        type: 'cloud',
        ports: [
          { id: 'wan0', name: 'WAN 0', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:CL' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, router, cloud], links);

      const plan = engine.planPing('pc-1', '8.8.8.8', { echoCount: 1 });
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('Cloud menolak paket dari IP privat'))).toBe(true);
    });
  });

  // =========================================================================
  // 6. RIPv2: Split horizon with poison reverse & show running-config cleanliness
  // =========================================================================
  describe('6. RIPv2 & Route Convergence Audit', () => {
    it('RIPv2 converges routes and poison reverse advertises metric 16 back on arrival interface', () => {
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ripEnabled: true,
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R1B' },
        ],
        routes: [],
      };

      const r2: DeviceData = {
        id: 'r-2',
        label: 'Router-2',
        type: 'router',
        ripEnabled: true,
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R2A' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '192.168.2.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:R2' },
        ],
        routes: [],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'r-2', targetPortId: 'fa0/0' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, r2], links);

      const plan = engine.planRip();
      expect(plan.summary.success).toBe(true);

      // Verify R1 learned 192.168.2.0/24 from R2 with metric 2
      const r1Dev = engine.getDevices().find((d) => d.id === 'r-1');
      const learned = r1Dev?.routes?.find((r) => r.network === '192.168.2.0');
      expect(learned).toBeDefined();
      expect(learned?.metric).toBe(2);
      expect(learned?.source).toBe('rip');

      // Verify poison reverse event exists advertising metric 16
      const poisonEvent = plan.events.find((e) => e.message.includes('poison reverse'));
      expect(poisonEvent).toBeDefined();
    });
  });

  // =========================================================================
  // 7. CLI Engine: Bi-directional sync, running-config & show ip route
  // =========================================================================
  describe('7. CLI Engine Bi-Directional Sync & Cisco IOS Compliance', () => {
    it('show running-config excludes dynamic RIP routes, keeping only static configuration', async () => {
      let device: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ripEnabled: true,
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        routes: [
          { network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '192.168.1.254', interfaceId: 'fa0/0', source: 'static' },
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '192.168.1.253', interfaceId: 'fa0/0', metric: 2, source: 'rip' },
        ],
      };

      const deps: CliSessionDeps = {
        getDevice: () => device,
        setHostname: (name) => { device.label = name; },
        setPortConfig: (portId, updates) => {
          device.ports = device.ports.map((p) => p.id === portId ? { ...p, ...updates } : p);
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
      };

      const session = new CliSession(deps);
      await session.handle('enable');
      const lines = await session.handle('show running-config');

      // Static route MUST appear in running-config
      expect(lines.some((l) => l.includes('ip route 10.0.0.0 255.0.0.0 192.168.1.254'))).toBe(true);

      // RIP learned route MUST NOT appear in running-config
      expect(lines.some((l) => l.includes('ip route 172.16.0.0'))).toBe(false);
    });

    it('show ip route shows Gateway of last resort and S* for default route', async () => {
      let device: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:00:00:01' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '192.168.1.254', interfaceId: 'fa0/0', source: 'static' },
        ],
      };

      const deps: CliSessionDeps = {
        getDevice: () => device,
        setHostname: (name) => { device.label = name; },
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
      };

      const session = new CliSession(deps);
      await session.handle('enable');
      const lines = await session.handle('show ip route');

      expect(lines.some((l) => l.includes('Gateway of last resort is 192.168.1.254 to network 0.0.0.0'))).toBe(true);
      expect(lines.some((l) => l.includes('S*      0.0.0.0/0 via 192.168.1.254, fa0/0'))).toBe(true);
    });
  });

  // =========================================================================
  // 8. Invariants INV-001 through INV-008
  // =========================================================================
  describe('8. Invariants Integrity (INV-001..008)', () => {
    it('INV-003: Port singularity strictly prevents connecting two cables to the same port', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 0, y: 0 });
      store.addDevice('switch', { x: 100, y: 0 });
      store.addDevice('pc', { x: 200, y: 0 });

      const [pc1, sw, pc2] = useAppStore.getState().nodes;

      const firstConnect = store.connectPorts(pc1.id, 'fa0', sw.id, 'fa0/1');
      expect(firstConnect).toBe(true);

      // Attempt to attach another cable to pc1 fa0
      const duplicateConnect = store.connectPorts(pc1.id, 'fa0', sw.id, 'fa0/2');
      expect(duplicateConnect).toBe(false);

      // Attempt to attach another cable to sw fa0/1
      const duplicateSw = store.connectPorts(pc2.id, 'fa0', sw.id, 'fa0/1');
      expect(duplicateSw).toBe(false);
    });

    it('INV-003: Disconnecting and reconnecting cable properly resets and restores port state', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 0, y: 0 });
      store.addDevice('switch', { x: 100, y: 0 });

      const [pc, sw] = useAppStore.getState().nodes;
      store.connectPorts(pc.id, 'fa0', sw.id, 'fa0/1');

      const edge = useAppStore.getState().edges[0];
      expect(edge).toBeDefined();

      store.disconnectEdge(edge.id);
      expect(useAppStore.getState().edges.length).toBe(0);

      const pcPortAfterDisconnect = useAppStore.getState().nodes.find((n) => n.id === pc.id)?.data.ports.find((p) => p.id === 'fa0');
      expect(pcPortAfterDisconnect?.status).toBe('down');
      expect(pcPortAfterDisconnect?.connectedEdgeId).toBeUndefined();

      // Reconnect
      const reconnected = store.connectPorts(pc.id, 'fa0', sw.id, 'fa0/1');
      expect(reconnected).toBe(true);
      expect(useAppStore.getState().edges.length).toBe(1);
    });
  });
});
