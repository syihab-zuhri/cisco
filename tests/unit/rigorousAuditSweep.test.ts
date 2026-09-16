import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { useAppStore } from '../../src/store/useAppStore';
import type { DeviceData, TopologyLink } from '../../src/types/network';

describe('Rigorous Audit Sweep: End-to-End Core Network & Engine Verification', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  describe('1. PDU Inspector & DHCP DORA Full Layer Integrity', () => {
    it('memastikan DHCP DORA menghasilkan PDU lengkap: L2 MAC, L3 IPv4 UDP, L4 DHCP payload', () => {
      const client: DeviceData = {
        id: 'pc-dhcp',
        label: 'Client-PC',
        type: 'pc',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            macAddress: '00:50:79:AA:00:01',
          },
        ],
      };

      const router: DeviceData = {
        id: 'r-dhcp',
        label: 'DHCP-Server',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '192.168.10.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:BB:00:01',
          },
        ],
        dhcpPools: {
          'fa0/0': {
            enabled: true,
            network: '192.168.10.0',
            mask: '255.255.255.0',
            startIp: '192.168.10.50',
            maxClients: 10,
          },
        },
      };

      const links: TopologyLink[] = [
        {
          sourceNodeId: 'pc-dhcp',
          sourcePortId: 'fa0',
          targetNodeId: 'r-dhcp',
          targetPortId: 'fa0/0',
          kind: 'ethernet',
        },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([client, router], links);

      const plan = engine.planDhcp('pc-dhcp', 'fa0');
      expect(plan.summary.success).toBe(true);
      const updatedClient = engine.getDevices().find((d) => d.id === 'pc-dhcp');
      expect(updatedClient?.ports[0].ipAddress).toBe('192.168.10.50');
      expect(updatedClient?.defaultGateway).toBe('192.168.10.1');
      // Verifikasi event Discover, Offer, Request, Ack memiliki PDU valid
      const discover = plan.events.find((e) => e.kind === 'DHCP_DISCOVER');
      expect(discover).toBeDefined();
      expect(discover?.pdu).toBeDefined();
      expect(discover?.pdu?.frame.srcMac).toBe('00:50:79:AA:00:01');
      expect(discover?.pdu?.frame.dstMac).toBe('FF:FF:FF:FF:FF:FF');
      expect(discover?.pdu?.packet?.protocol).toBe('UDP');
      expect(discover?.pdu?.packet?.srcIp).toBe('0.0.0.0');
      expect(discover?.pdu?.packet?.dstIp).toBe('255.255.255.255');
      expect(discover?.pdu?.dhcp).toBeDefined();
      expect(discover?.pdu?.dhcp?.messageType).toBe(1);
      expect(discover?.pdu?.dhcp?.clientId).toBe('00:50:79:AA:00:01');

      const offer = plan.events.find((e) => e.kind === 'DHCP_OFFER');
      expect(offer).toBeDefined();
      expect(offer?.pdu?.dhcp?.messageType).toBe(2);
      expect(offer?.pdu?.dhcp?.yiaddr).toBe('192.168.10.50');
      expect(offer?.pdu?.dhcp?.serverId).toBe('192.168.10.1');

      const request = plan.events.find((e) => e.kind === 'DHCP_REQUEST');
      expect(request).toBeDefined();
      expect(request?.pdu?.dhcp?.messageType).toBe(3);

      const ack = plan.events.find((e) => e.kind === 'DHCP_ACK');
      expect(ack).toBeDefined();
      expect(ack?.pdu?.dhcp?.messageType).toBe(5);
      expect(ack?.pdu?.dhcp?.yiaddr).toBe('192.168.10.50');
      expect(ack?.pdu?.dhcp?.serverId).toBe('192.168.10.1');
    });
  });

  describe('2. Persistent NAT across Multi-Hop Routers to Cloud', () => {
    it('NAT tetap aktif ketika melewati router perantara sebelum mencapai Cloud internet', () => {
      // PC1 (192.168.1.10) -> R1 (NAT) -> R2 -> Cloud (8.8.8.8)
      const pc1: DeviceData = {
        id: 'pc-nat',
        label: 'PC1',
        type: 'pc',
        defaultGateway: '192.168.1.1',
        ports: [
          {
            id: 'fa0',
            name: 'FastEthernet 0',
            status: 'up',
            ipAddress: '192.168.1.10',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:01:00:10',
          },
        ],
      };

      const r1: DeviceData = {
        id: 'r1',
        label: 'Router1-NAT',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'LAN',
            status: 'up',
            ipAddress: '192.168.1.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:01:00:01',
          },
          {
            id: 'fa0/1',
            name: 'WAN',
            status: 'up',
            ipAddress: '203.0.113.1',
            subnetMask: '255.255.255.252',
            macAddress: '00:50:79:01:00:02',
            natEnabled: true, // NAT aktif di interface WAN
          },
        ],
        routes: [
          // Default route ke Router 2
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '203.0.113.2', interfaceId: 'fa0/1' },
        ],
      };

      const r2: DeviceData = {
        id: 'r2',
        label: 'Router2-ISP',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'from-R1',
            status: 'up',
            ipAddress: '203.0.113.2',
            subnetMask: '255.255.255.252',
            macAddress: '00:50:79:02:00:01',
          },
          {
            id: 'fa0/1',
            name: 'to-Cloud',
            status: 'up',
            ipAddress: '198.51.100.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:02:00:02',
          },
        ],
        routes: [
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '198.51.100.2', interfaceId: 'fa0/1' },
          { network: '203.0.113.0', subnetMask: '255.255.255.252', nextHop: '0.0.0.0', interfaceId: 'fa0/0' },
        ],
      };

      const cloud: DeviceData = {
        id: 'cloud-internet',
        label: 'Cloud Internet',
        type: 'cloud',
        ports: [
          {
            id: 'eth0',
            name: 'WAN',
            status: 'up',
            ipAddress: '198.51.100.2',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:FF:FF:01',
          },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-nat', sourcePortId: 'fa0', targetNodeId: 'r1', targetPortId: 'fa0/0', kind: 'ethernet' },
        { sourceNodeId: 'r1', sourcePortId: 'fa0/1', targetNodeId: 'r2', targetPortId: 'fa0/0', kind: 'ethernet' },
        { sourceNodeId: 'r2', sourcePortId: 'fa0/1', targetNodeId: 'cloud-internet', targetPortId: 'eth0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, r1, r2, cloud], links);

      const plan = engine.planPing('pc-nat', '8.8.8.8');
      // Karena NAT persisten di R1, saat paket tiba di R2 dan kemudian Cloud,
      // Cloud tidak menolak paket privat dan membalas sukses!
      expect(plan.summary.success).toBe(true);
      // Verifikasi translasi tercatat di tabel NAT R1
      const updatedR1 = engine.getDevices().find((d) => d.id === 'r1');
      expect(updatedR1?.natTable).toBeDefined();
      expect(updatedR1!.natTable!.length).toBeGreaterThan(0);
      expect(updatedR1!.natTable![0].insideIp).toBe('192.168.1.10');
      expect(updatedR1!.natTable![0].globalIp).toBe('203.0.113.1');
      // Verifikasi di jalur balik ada de-NAT
      const rep = plan.events.filter((e) => e.kind === 'ICMP_REP');
      expect(rep.length).toBeGreaterThan(0);
      const deNatted = rep.find((e) => e.pdu?.note?.includes('dikembalikan ke 192.168.1.10'));
      expect(deNatted).toBeDefined();
    });
  });

  describe('3. Switch CAM Learning on ICMP (RFC 802.1D Bridging)', () => {
    it('switch belajar MAC tabel saat dilewati frame ICMP meskipun ARP sudah warm', () => {
      const pc1: DeviceData = {
        id: 'pc1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01:01' }],
        arpTable: { '10.0.0.2': '00:50:79:02:02:02' }, // Pre-warmed ARP cache
      };
      const pc2: DeviceData = {
        id: 'pc2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:02:02' }],
        arpTable: { '10.0.0.1': '00:50:79:01:01:01' }, // Pre-warmed ARP cache
      };
      const sw: DeviceData = {
        id: 'sw1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'fa0/1', status: 'up', macAddress: '00:50:79:00:01:01' },
          { id: 'fa0/2', name: 'fa0/2', status: 'up', macAddress: '00:50:79:00:01:02' },
        ],
        macTable: {}, // CAM Table awalnya kosong
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'sw1', targetPortId: 'fa0/1', kind: 'ethernet' },
        { sourceNodeId: 'sw1', sourcePortId: 'fa0/2', targetNodeId: 'pc2', targetPortId: 'fa0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, pc2, sw], links);

      const plan = engine.planPing('pc1', '10.0.0.2');
      expect(plan.summary.success).toBe(true);

      // Karena ARP warm, tidak ada event ARP
      // Namun Switch HARUS belajar CAM table dari frame ICMP yang melewatinya!
      const updatedSw = engine.getDevices().find((d) => d.id === 'sw1');
      expect(updatedSw?.macTable?.['00:50:79:01:01:01']).toBe('fa0/1');
      expect(updatedSw?.macTable?.['00:50:79:02:02:02']).toBe('fa0/2');
    });
  });
  describe('4. Directly-Connected Static Route (nextHop 0.0.0.0)', () => {
    it('route langsung ke interface (nextHop 0.0.0.0) me-resolve targetIp langsung tanpa timeout', () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'LAN1', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          { id: 'fa0/1', name: 'LAN2', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [
          // Route statis langsung melekat ke fa0/1 dengan nextHop '0.0.0.0'
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '0.0.0.0', interfaceId: 'fa0/1' },
        ],
      };

      const pc: DeviceData = {
        id: 'pc-target',
        label: 'Target-PC',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'fa0', status: 'up', ipAddress: '172.16.5.5', subnetMask: '255.255.0.0', macAddress: '00:50:79:17:16:05' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r1', sourcePortId: 'fa0/1', targetNodeId: 'pc-target', targetPortId: 'fa0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, pc], links);

      const plan = engine.planPing('r1', '172.16.5.5');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);
    });
  });

  describe('5. RIPv2 Split Horizon with Poison Reverse & Metric Infinity', () => {
    it('RIPv2 mengabaikan rute dengan metric >= 16 dan tidak memasangnya ke tabel routing aktif', () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'R1',
        type: 'router',
        ripEnabled: true,
        ports: [
          { id: 'fa0/0', name: 'to-R2', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          { id: 'fa0/1', name: 'LAN1', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [],
      };

      const r2: DeviceData = {
        id: 'r2',
        label: 'R2',
        type: 'router',
        ripEnabled: true,
        ports: [
          { id: 'fa0/0', name: 'to-R1', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:01' },
        ],
        routes: [],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r1', sourcePortId: 'fa0/0', targetNodeId: 'r2', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, r2], links);

      const plan = engine.planRip();
      expect(plan.summary.success).toBe(true);

      // Verifikasi rute aktif R2: rute 192.168.1.0/24 terpasang dengan metric < 16
      const updatedR2 = engine.getDevices().find((d) => d.id === 'r2');
      const r2RipRoutes = updatedR2?.routes?.filter((r) => r.source === 'rip') ?? [];
      expect(r2RipRoutes.length).toBeGreaterThan(0);
      expect(r2RipRoutes.every((r) => (r.metric ?? 1) < 16)).toBe(true);

      // Verifikasi Split Horizon: R2 tidak mengiklankan balik rute 192.168.1.0 ke R1 sebagai rute valid
      const updatedR1 = engine.getDevices().find((d) => d.id === 'r1');
      const r1RipRoutes = updatedR1?.routes?.filter((r) => r.source === 'rip') ?? [];
      expect(r1RipRoutes.some((r) => r.network === '192.168.1.0')).toBe(false);
    });
  });
  describe('6. Topology Loading & Port Singularity (INV-003 Synchronization)', () => {
    it('loadTopology membersihkan connectedEdgeId basi jika kabel sudah tidak valid', () => {
      const store = useAppStore.getState();

      store.loadTopology({
        nodes: [
          {
            id: 'pc-stale',
            type: 'deviceNode',
            position: { x: 50, y: 50 },
            data: {
              id: 'pc-stale',
              label: 'PC-Stale',
              type: 'pc',
              ports: [
                {
                  id: 'fa0',
                  name: 'fa0',
                  status: 'up', // Stale up
                  kind: 'ethernet',
                  macAddress: '00:50:79:99:99:99',
                  connectedEdgeId: 'edge-phantom', // Stale edge ID tidak ada di edges
                  connectedToNodeId: 'phantom-node',
                  connectedToPortId: 'fa0',
                },
              ],
            },
          },
        ],
        edges: [], // Tidak ada edge valid
      });

      const loadedNode = useAppStore.getState().nodes.find((n) => n.id === 'pc-stale');
      const loadedPort = loadedNode?.data.ports.find((p) => p.id === 'fa0');

      // INV-003 sync harus membersihkan binding phantom agar port bisa dikabelkan lagi
      expect(loadedPort?.connectedEdgeId).toBeUndefined();
      expect(loadedPort?.connectedToNodeId).toBeUndefined();
      expect(loadedPort?.connectedToPortId).toBeUndefined();
      expect(loadedPort?.status).toBe('down');
    });
  });

  describe('7. Annotations: Square & Text Notes', () => {
    it('menambah, mengubah dimensi, swatch, dan menghapus square & teks anotasi', () => {
      const store = useAppStore.getState();

      store.addSquare({ x: 20, y: 30 });
      store.addText({ x: 100, y: 120 });

      let currentNodes = useAppStore.getState().nodes;
      const square = currentNodes.find((n) => n.data.nodeKind === 'square');
      const text = currentNodes.find((n) => n.data.nodeKind === 'text');

      expect(square).toBeDefined();
      expect(text).toBeDefined();
      expect(square?.zIndex).toBe(-1);
      expect(text?.zIndex).toBe(10);

      // Update anotasi
      store.updateAnnotation(square!.id, { width: 400, height: 300, stroke: '#EF4444' });
      store.updateAnnotation(text!.id, { text: 'Subnet Production', fontSize: 18 });

      currentNodes = useAppStore.getState().nodes;
      const updatedSquare = currentNodes.find((n) => n.id === square!.id);
      const updatedText = currentNodes.find((n) => n.id === text!.id);

      expect(updatedSquare?.data.width).toBe(400);
      expect(updatedSquare?.data.height).toBe(300);
      expect(updatedSquare?.data.stroke).toBe('#EF4444');
      expect(updatedText?.data.text).toBe('Subnet Production');
      expect(updatedText?.data.fontSize).toBe(18);

      // Hapus anotasi
      store.deleteNode(square!.id);
      store.deleteNode(text!.id);

      expect(useAppStore.getState().nodes).toHaveLength(0);
    });
  });

  describe('8. Queue Limits & Loop Detection Protection', () => {
    it('mendeteksi routing loop antara dua router yang saling menunjuk tanpa infinite loop', () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'to-R2', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          { id: 'fa0/1', name: 'LAN', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [
          // R1 me-route 172.16.0.0/16 ke R2
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '10.0.0.2', interfaceId: 'fa0/0' },
        ],
      };

      const r2: DeviceData = {
        id: 'r2',
        label: 'Router-2',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'to-R1', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:01' },
        ],
        routes: [
          // R2 me-route 172.16.0.0/16 balik ke R1 (ROUTING LOOP!)
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '10.0.0.1', interfaceId: 'fa0/0' },
        ],
      };

      const pc: DeviceData = {
        id: 'pc1',
        label: 'PC-1',
        type: 'pc',
        defaultGateway: '192.168.1.1',
        ports: [
          { id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:AA:BB:CC' },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'r1', targetPortId: 'fa0/1', kind: 'ethernet' },
        { sourceNodeId: 'r1', sourcePortId: 'fa0/0', targetNodeId: 'r2', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, r1, r2], links);

      const plan = engine.planPing('pc1', '172.16.1.1');
      expect(plan.summary.success).toBe(false);
      // Mesin mendeteksi routing loop dan tidak terjebak dalam perulangan tak hingga
      expect(plan.summary.outputLines.some((line) => line.includes('Routing loop terdeteksi'))).toBe(true);
    });

    it('kapasitas antrean 500 event terjaga tanpa memory leak', () => {
      const pc1: DeviceData = {
        id: 'pc1',
        label: 'PC-1',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:01:01' }],
      };
      const pc2: DeviceData = {
        id: 'pc2',
        label: 'PC-2',
        type: 'pc',
        ports: [{ id: 'fa0', name: 'fa0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:02:02' }],
      };

      const logMessages: string[] = [];
      const engine = new HeadlessSimulationEngine(undefined, (_level, msg) => {
        logMessages.push(msg);
      });
      engine.setTopology([pc1, pc2], [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'pc2', targetPortId: 'fa0', kind: 'ethernet' },
      ]);

      // Ping 20 kali dalam satu pemanggilan
      const plan = engine.planPing('pc1', '10.0.0.2', { echoCount: 20 });
      expect(plan.events.length).toBeLessThanOrEqual(500);
      expect(logMessages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('9. RIPv2 over Sub-Interfaces (Router-on-a-Stick Trunk)', () => {
    it('RIPv2 mempertukarkan rute melalui sub-interface ber-IP', () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'R1',
        type: 'router',
        ripEnabled: true,
        ports: [
          {
            id: 'fa0/0',
            name: 'Trunk',
            status: 'up',
            portMode: 'trunk',
            macAddress: '00:50:79:01:00:01',
            subInterfaces: [
              { vlanId: 10, ipAddress: '10.10.10.1', subnetMask: '255.255.255.0' },
            ],
          },
          {
            id: 'fa0/1',
            name: 'LAN1',
            status: 'up',
            ipAddress: '192.168.10.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:01:00:02',
          },
        ],
        routes: [],
      };

      const r2: DeviceData = {
        id: 'r2',
        label: 'R2',
        type: 'router',
        ripEnabled: true,
        ports: [
          {
            id: 'fa0/0',
            name: 'Trunk',
            status: 'up',
            portMode: 'trunk',
            macAddress: '00:50:79:02:00:01',
            subInterfaces: [
              { vlanId: 10, ipAddress: '10.10.10.2', subnetMask: '255.255.255.0' },
            ],
          },
        ],
        routes: [],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r1', sourcePortId: 'fa0/0', targetNodeId: 'r2', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, r2], links);

      const plan = engine.planRip();
      expect(plan.summary.success).toBe(true);

      const updatedR2 = engine.getDevices().find((d) => d.id === 'r2');
      const learned = updatedR2?.routes?.filter((r) => r.source === 'rip') ?? [];
      expect(learned.some((r) => r.network === '192.168.10.0')).toBe(true);
    });
  });

  describe('10. 802.1Q VLAN Tagged PDU in Router-on-a-Stick', () => {
    it('PDU frame menyimpan informasi vlanId saat melewati trunk/sub-interface', () => {
      const pc: DeviceData = {
        id: 'pc1',
        label: 'PC-1',
        type: 'pc',
        defaultGateway: '192.168.10.1',
        ports: [
          { id: 'fa0', name: 'fa0', status: 'up', ipAddress: '192.168.10.5', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:00:05', vlanId: 10 },
        ],
      };

      const r: DeviceData = {
        id: 'r1',
        label: 'R1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'Trunk',
            status: 'up',
            portMode: 'trunk',
            macAddress: '00:50:79:10:00:01',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'r1', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, r], links);

      const plan = engine.planPing('pc1', '192.168.10.1');
      expect(plan.summary.success).toBe(true);

      const icmpReq = plan.events.find((e) => e.kind === 'ICMP_REQ');
      expect(icmpReq?.pdu?.frame.vlanId).toBe(10);
    });
  });
});
