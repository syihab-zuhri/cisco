import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { type DeviceData } from '../../src/types/network';

describe('Rigorous Line-by-Line Code Audit & Protocol Verification', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  // =========================================================================
  // 1. ARP (RFC 826) & L2 CAM Table Learning
  // =========================================================================
  describe('1. ARP (RFC 826) & L2 CAM Table Learning', () => {
    it('ARP cache miss triggers broadcast ARP request and unicast ARP reply, updating CAM and ARP caches', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:AA:00:01' }],
        arpTable: {},
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:SW:00:01' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:SW:00:02' },
        ],
        macTable: {},
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:BB:00:02' }],
        arpTable: {},
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, sw, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
        ]
      );

      const plan = engine.planPing('pc-1', '192.168.1.20');
      expect(plan.summary.success).toBe(true);

      // Verify ARP Request & Reply events exist
      const arpReq = plan.events.find((e) => e.kind === 'ARP_REQ');
      const arpRep = plan.events.find((e) => e.kind === 'ARP_REP');
      expect(arpReq).toBeDefined();
      expect(arpRep).toBeDefined();
      expect(arpReq?.pdu?.frame.dstMac).toBe('FF:FF:FF:FF:FF:FF');
      expect(arpRep?.pdu?.frame.dstMac).toBe('00:50:79:AA:00:01');

      // Verify Switch CAM table learned both MAC addresses
      const updatedDevices = engine.getDevices();
      const updatedSw = updatedDevices.find((d) => d.id === 'sw-1');
      expect(updatedSw?.macTable?.['00:50:79:AA:00:01']).toBe('fa0/1');
      expect(updatedSw?.macTable?.['00:50:79:BB:00:02']).toBe('fa0/2');

      // Verify ARP table updated on PC-1
      const updatedPc1 = updatedDevices.find((d) => d.id === 'pc-1');
      expect(updatedPc1?.arpTable?.['192.168.1.20']).toBe('00:50:79:BB:00:02');
    });

    it('Second ping hits ARP cache and does not emit ARP requests', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' }],
        arpTable: { '10.0.0.2': '00:50:79:02:00:02' },
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:02' }],
        arpTable: { '10.0.0.1': '00:50:79:01:00:01' },
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, pc2],
        [{ sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'pc-2', targetPortId: 'fa0' }]
      );

      const plan = engine.planPing('pc-1', '10.0.0.2');
      expect(plan.summary.success).toBe(true);
      const arpReq = plan.events.find((e) => e.kind === 'ARP_REQ');
      expect(arpReq).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. ICMP Echo & Loopback / RFC 1122
  // =========================================================================
  describe('2. ICMP Echo & Loopback / RFC 1122', () => {
    it('Ping to loopback 127.0.0.1 succeeds even without configured physical IP or UP cable', () => {
      const pc1: DeviceData = {
        id: 'pc-unconfigured',
        label: 'PC-Blank',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'down', kind: 'ethernet', macAddress: '00:50:79:CC:00:01' }],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1], []);

      const plan = engine.planPing('pc-unconfigured', '127.0.0.1');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.ttl).toBe(128);
      expect(plan.summary.rttMs).toBe(0);
      expect(plan.summary.outputLines.some((l) => l.includes('Reply from 127.0.0.1'))).toBe(true);
    });

    it('Detects IP duplicate conflict when pinging own IP that is also configured on another node', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' }],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:02' }],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2], []);

      const plan = engine.planPing('pc-1', '192.168.1.10');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('Konflik IP'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. L2 Switch 802.1Q VLAN & Port Isolation
  // =========================================================================
  describe('3. L2 Switch 802.1Q VLAN & Port Isolation', () => {
    it('Blocks traffic between access ports on different VLANs', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-VLAN10',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' }],
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:SW:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', portMode: 'access', vlanId: 20, macAddress: '00:50:79:SW:02' },
        ],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-VLAN20',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:02' }],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, sw, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
        ]
      );

      const plan = engine.planPing('pc-1', '192.168.1.20');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('Tidak ada jalur fisik/Layer-2'))).toBe(true);
    });

    it('Allows traffic across trunk ports connecting same VLANs', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.10.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:01' }],
      };
      const sw1: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:S1:01' },
          { id: 'fa0/24', name: 'fa0/24', status: 'up', portMode: 'trunk', macAddress: '00:50:79:S1:24' },
        ],
      };
      const sw2: DeviceData = {
        id: 'sw-2',
        label: 'Switch-2',
        type: 'switch',
        ports: [
          { id: 'fa0/24', name: 'fa0/24', status: 'up', portMode: 'trunk', macAddress: '00:50:79:S2:24' },
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:S2:01' },
        ],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.10.10.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:02' }],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, sw1, sw2, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/24', targetNodeId: 'sw-2', targetPortId: 'fa0/24' },
          { sourceNodeId: 'sw-2', sourcePortId: 'fa0/1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
        ]
      );

      const plan = engine.planPing('pc-1', '10.10.10.2');
      expect(plan.summary.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. L3 Routing: LPM, Sub-interfaces & Port Status
  // =========================================================================
  describe('4. L3 Routing: LPM, Sub-interfaces & Port Status', () => {
    it('Prefers more specific prefix over default route (0.0.0.0/0)', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01' }],
        defaultGateway: '192.168.1.1',
      };
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00' },
          { id: 'fa0/1', name: 'fa0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', ipAddress: '172.16.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:02' },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '172.16.0.2', interfaceId: 'fa0/2', source: 'static' },
          { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: 'Directly Connected', interfaceId: 'fa0/1', source: 'connected' },
        ],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.50', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:50' }],
        defaultGateway: '10.0.0.1',
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, r1, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
          { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
        ]
      );

      const plan = engine.planPing('pc-1', '10.0.0.50');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.ttl).toBe(127); // 128 - 1 router hop
    });

    it('Drops packets when egress interface is administratively DOWN', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01' }],
        defaultGateway: '192.168.1.1',
      };
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'fa0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00' },
          // fa0/1 is down!
          { id: 'fa0/1', name: 'fa0/1', status: 'down', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01' },
        ],
        routes: [],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:02' }],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, r1, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
          { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'pc-2', targetPortId: 'fa0' },
        ]
      );

      const plan = engine.planPing('pc-1', '10.0.0.2');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('No route to host'))).toBe(true);
    });

    it('Router-on-a-stick sub-interfaces correctly route inter-VLAN traffic', () => {
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC-VLAN10',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:10' }],
        defaultGateway: '192.168.10.1',
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:SW:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', portMode: 'access', vlanId: 20, macAddress: '00:50:79:SW:02' },
          { id: 'fa0/24', name: 'fa0/24', status: 'up', portMode: 'trunk', macAddress: '00:50:79:SW:24' },
        ],
      };
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'fa0/0',
            status: 'up',
            macAddress: '00:50:79:R1:00',
            portMode: 'trunk',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
              { vlanId: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
      };
      const pc2: DeviceData = {
        id: 'pc-2',
        label: 'PC-VLAN20',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.20.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:20:20' }],
        defaultGateway: '192.168.20.1',
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, sw, r1, pc2],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/2', targetNodeId: 'pc-2', targetPortId: 'fa0' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/24', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        ]
      );

      const plan = engine.planPing('pc-1', '192.168.20.20');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.ttl).toBe(127);
    });
  });

  // =========================================================================
  // 5. DHCP Server & Sub-interface Support
  // =========================================================================
  describe('5. DHCP Server & Sub-interface Support', () => {
    it('Allocates IP from DHCP pool on router-on-a-stick sub-interface', () => {
      const pc1: DeviceData = {
        id: 'pc-dhcp',
        label: 'PC-Client',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DH:CP:01' }],
      };
      const sw: DeviceData = {
        id: 'sw-1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', portMode: 'access', vlanId: 10, macAddress: '00:50:79:SW:01' },
          { id: 'fa0/24', name: 'fa0/24', status: 'up', portMode: 'trunk', macAddress: '00:50:79:SW:24' },
        ],
      };
      const r1: DeviceData = {
        id: 'r-1',
        label: 'Router-DHCP',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'fa0/0',
            status: 'up',
            macAddress: '00:50:79:R1:00',
            subInterfaces: [{ vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' }],
          },
        ],
        dhcpPools: {
          'fa0/0': {
            enabled: true,
            network: '192.168.10.0',
            mask: '255.255.255.0',
            startIp: '192.168.10.100',
            maxClients: 50,
          },
        },
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc1, sw, r1],
        [
          { sourceNodeId: 'pc-dhcp', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
          { sourceNodeId: 'sw-1', sourcePortId: 'fa0/24', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
        ]
      );

      const plan = engine.planDhcp('pc-dhcp', 'fa0');
      expect(plan.summary.success).toBe(true);
      const lease = plan.events.flatMap((e) => e.effects ?? []).find((e) => e.type === 'DHCP_LEASE');
      expect(lease).toBeDefined();
      if (lease?.type === 'DHCP_LEASE') {
        expect(lease.ipAddress).toBe('192.168.10.100');
        expect(lease.gateway).toBe('192.168.10.1');
      }
    });
  });

  // =========================================================================
  // 6. NAT/PAT & Simulated Cloud Internet (RFC / Offline INV-008)
  // =========================================================================
  describe('6. NAT/PAT & Simulated Cloud Internet (INV-008)', () => {
    it('Rejects ping from private IP to public cloud 8.8.8.8 when NAT is disabled', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01' }],
        defaultGateway: '192.168.1.1',
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-WAN',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00' },
          { id: 'fa0/1', name: 'WAN', status: 'up', ipAddress: '203.0.113.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01', natEnabled: false },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.1', interfaceId: 'fa0/1', source: 'static' },
        ],
      };
      const cloud: DeviceData = {
        id: 'cloud-1',
        label: 'Internet Cloud',
        type: 'cloud',
        ports: [
          { id: 'wan0', name: 'WAN 0', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:CL:01' },
        ],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc, router, cloud],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
          { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
        ]
      );

      const plan = engine.planPing('pc-1', '8.8.8.8');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.some((l) => l.includes('Cloud menolak paket dari IP privat') && l.includes('tanpa NAT'))).toBe(true);
    });

    it('Translates source IP to WAN IP and succeeds when NAT is enabled on WAN port', () => {
      const pc: DeviceData = {
        id: 'pc-1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01' }],
        defaultGateway: '192.168.1.1',
      };
      const router: DeviceData = {
        id: 'r-1',
        label: 'Router-WAN',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'LAN', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:00' },
          { id: 'fa0/1', name: 'WAN', status: 'up', ipAddress: '203.0.113.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:R1:01', natEnabled: true },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.1', interfaceId: 'fa0/1', source: 'static' },
        ],
      };
      const cloud: DeviceData = {
        id: 'cloud-1',
        label: 'Internet Cloud',
        type: 'cloud',
        ports: [
          { id: 'wan0', name: 'WAN 0', status: 'up', ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:CL:01' },
        ],
      };

      const engine = new HeadlessSimulationEngine();
      engine.setTopology(
        [pc, router, cloud],
        [
          { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'r-1', targetPortId: 'fa0/0' },
          { sourceNodeId: 'r-1', sourcePortId: 'fa0/1', targetNodeId: 'cloud-1', targetPortId: 'wan0' },
        ]
      );

      const plan = engine.planPing('pc-1', '8.8.8.8');
      expect(plan.summary.success).toBe(true);

      // Verify NAT translation effect was generated
      const natHop = plan.events.find((e) => e.hop?.sourceNodeId === 'r-1' && e.kind === 'ICMP_REQ');
      expect(natHop?.pdu?.packet?.srcIp).toBe('203.0.113.2');
      const natEffect = natHop?.effects?.find((e) => e.type === 'NAT_TRANSLATE');
      expect(natEffect).toBeDefined();
    });
  });

  // =========================================================================
  // 7. RIPv2 & useAppStore ROUTE_LEARN Protection
  // =========================================================================
  describe('7. RIPv2 & ROUTE_LEARN Protection in Store', () => {
    it('ROUTE_LEARN effect does not overwrite static routes and removes poisoned routes (metric 16)', () => {
      const store = useAppStore.getState();
      store.addDevice('router', { x: 100, y: 100 });
      const routerNode = useAppStore.getState().nodes[0];

      // Add a static route to the router
      store.addStaticRoute(routerNode.id, {
        network: '192.168.50.0',
        subnetMask: '255.255.255.0',
        nextHop: '10.0.0.2',
        interfaceId: 'fa0/1',
        source: 'static',
      });

      // Play a ROUTE_LEARN effect for the same network
      store.markSimEventPlayed({
        seq: 1,
        simTimeMs: 1,
        kind: 'RIP_UPDATE',
        level: 'RIP',
        message: 'RIP update',
        effects: [
          {
            type: 'ROUTE_LEARN',
            nodeId: routerNode.id,
            network: '192.168.50.0',
            subnetMask: '255.255.255.0',
            nextHop: '10.0.0.5',
            interfaceId: 'fa0/1',
            metric: 2,
          },
        ],
      });

      // Static route must remain intact with source: 'static'
      const nodeAfterRip = useAppStore.getState().nodes.find((n) => n.id === routerNode.id);
      const staticRoute = nodeAfterRip?.data.routes?.find((r) => r.network === '192.168.50.0' && r.source === 'static');
      expect(staticRoute).toBeDefined();
      expect(staticRoute?.nextHop).toBe('10.0.0.2');

      // Now add a dynamic RIP route
      store.markSimEventPlayed({
        seq: 2,
        simTimeMs: 2,
        kind: 'RIP_UPDATE',
        level: 'RIP',
        message: 'RIP update',
        effects: [
          {
            type: 'ROUTE_LEARN',
            nodeId: routerNode.id,
            network: '192.168.99.0',
            subnetMask: '255.255.255.0',
            nextHop: '10.0.0.5',
            interfaceId: 'fa0/1',
            metric: 3,
          },
        ],
      });

      let nodeWithDynamic = useAppStore.getState().nodes.find((n) => n.id === routerNode.id);
      expect(nodeWithDynamic?.data.routes?.some((r) => r.network === '192.168.99.0' && r.source === 'rip')).toBe(true);

      // Poison the route with metric 16
      store.markSimEventPlayed({
        seq: 3,
        simTimeMs: 3,
        kind: 'RIP_UPDATE',
        level: 'RIP',
        message: 'RIP poison reverse',
        effects: [
          {
            type: 'ROUTE_LEARN',
            nodeId: routerNode.id,
            network: '192.168.99.0',
            subnetMask: '255.255.255.0',
            nextHop: '10.0.0.5',
            interfaceId: 'fa0/1',
            metric: 16,
          },
        ],
      });

      // The poisoned route must be pruned
      nodeWithDynamic = useAppStore.getState().nodes.find((n) => n.id === routerNode.id);
      expect(nodeWithDynamic?.data.routes?.some((r) => r.network === '192.168.99.0')).toBe(false);
    });
  });

  // =========================================================================
  // 8. CLI Engine & Bi-directional Sync (INV-006)
  // =========================================================================
  describe('8. CLI Engine & Bi-directional Sync (INV-006)', () => {
    it('CLI supports ping and show ip interface brief in User EXEC mode (>)' , async () => {
      let pingTarget = '';
      const deps: CliSessionDeps = {
        getDevice: () => ({
          id: 'r1',
          label: 'Router-1',
          type: 'router',
          ports: [{ id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01' }],
        }),
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async (target) => {
          pingTarget = target;
          return { success: true, outputLines: ['!!!!!', 'Success rate is 100 percent'] };
        },
      };

      const cli = new CliSession(deps);
      expect(cli.prompt()).toBe('Router-1>');

      // Ping in user mode
      const pingOut = await cli.handle('ping 192.168.1.20');
      expect(pingTarget).toBe('192.168.1.20');
      expect(pingOut[0]).toBe('!!!!!');

      // show ip int br in user mode
      const shOut = await cli.handle('show ip interface brief');
      expect(shOut.some((l) => l.includes('FastEthernet 0/0') && l.includes('192.168.1.1'))).toBe(true);
    });

    it('CLI accepts ip addr abbreviation in interface configuration mode', async () => {
      let configuredIp = '';
      let configuredMask = '';
      const deps: CliSessionDeps = {
        getDevice: () => ({
          id: 'r1',
          label: 'Router-1',
          type: 'router',
          ports: [{ id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:01:01' }],
        }),
        setHostname: () => {},
        setPortConfig: (_p, updates) => {
          if (updates.ipAddress) configuredIp = updates.ipAddress;
          if (updates.subnetMask) configuredMask = updates.subnetMask;
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
      };

      const cli = new CliSession(deps);
      await cli.handle('enable');
      await cli.handle('configure terminal');
      await cli.handle('interface fa0/0');
      expect(cli.prompt()).toBe('Router-1(config-if)#');

      const out = await cli.handle('ip addr 10.10.10.1 255.255.255.0');
      expect(out.some((l) => l.includes('10.10.10.1') && l.includes('255.255.255.0'))).toBe(true);
      expect(configuredIp).toBe('10.10.10.1');
      expect(configuredMask).toBe('255.255.255.0');
    });

    it('Bi-directional sync: CLI hostname, no shutdown, and ip address immediately sync to store', async () => {
      const store = useAppStore.getState();
      store.addDevice('router', { x: 200, y: 200 });
      const deviceId = useAppStore.getState().nodes[0].id;

      const deps: CliSessionDeps = {
        getDevice: () => useAppStore.getState().nodes.find((n) => n.id === deviceId)!.data,
        setHostname: (name) => store.updateDeviceConfig(deviceId, { label: name }),
        setPortConfig: (pId, upd) => store.updatePortConfig(deviceId, pId, upd),
        requestPing: async () => ({ success: true, outputLines: [] }),
      };

      const cli = new CliSession(deps);
      await cli.handle('enable');
      await cli.handle('conf t');
      await cli.handle('hostname Core-Rtr');

      // Check store updated
      expect(useAppStore.getState().nodes[0].data.label).toBe('Core-Rtr');
      expect(cli.prompt()).toBe('Core-Rtr(config)#');

      await cli.handle('int fa0/0');
      await cli.handle('no shut');
      await cli.handle('ip address 172.16.1.1 255.255.255.0');

      const port = useAppStore.getState().nodes[0].data.ports.find((p) => p.id === 'fa0/0');
      expect(port?.status).toBe('up');
      expect(port?.ipAddress).toBe('172.16.1.1');
      expect(port?.subnetMask).toBe('255.255.255.0');
    });
  });
});
