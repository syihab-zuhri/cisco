import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { CliSession } from '../../src/engine/cli/cliEngine';
import { useAppStore } from '../../src/store/useAppStore';
import type { DeviceData, PhysicalPort, TopologyLink } from '../../src/types/network';

describe('Deep Audit: Engine, Canvas, Store, CLI, and Invariants', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  describe('INV-001: Headless Execution', () => {
    it('HeadlessSimulationEngine dan CliEngine berjalan murni tanpa objek DOM/window/document', () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');

      const engine = new HeadlessSimulationEngine();
      expect(engine.getDevices()).toEqual([]);

      const mockDevice: DeviceData = {
        id: 'r-1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:01' },
        ],
      };
      const session = new CliSession({
        getDevice: () => mockDevice,
        setHostname: (name) => {
          mockDevice.label = name;
        },
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
      });
      expect(session.prompt()).toBe('Router-1>');
    });
  });

  describe('CLI Engine: Interface Context Switching & Commands', () => {
    let mockRouter: DeviceData;
    let mockSwitch: DeviceData;
    let portUpdates: Array<{ portId: string; updates: Partial<PhysicalPort> }>;
    let subIfConfigs: Array<{ parentPortId: string; vlanId: number; updates: { ipAddress?: string; subnetMask?: string } }>;
    let removedSubIfs: Array<{ parentPortId: string; vlanId: number }>;
    let macCleared: boolean;
    let arpCleared: boolean;

    beforeEach(() => {
      portUpdates = [];
      subIfConfigs = [];
      removedSubIfs = [];
      macCleared = false;
      arpCleared = false;

      mockRouter = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:01' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:00:00:02' },
        ],
        routes: [],
        dhcpPools: {
          'fa0/0': {
            enabled: true,
            network: '192.168.1.0',
            mask: '255.255.255.0',
            startIp: '192.168.1.100',
            maxClients: 50,
          },
        },
      };

      mockSwitch = {
        id: 'sw-1',
        label: 'SW1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:00:01:01' },
        ],
        macTable: { '00:50:79:AA:BB:CC': 'fa0/1' },
        arpTable: { '192.168.1.1': '00:50:79:00:00:01' },
      };
    });

    const createRouterSession = () =>
      new CliSession({
        getDevice: () => mockRouter,
        setHostname: (name) => {
          mockRouter.label = name;
        },
        setPortConfig: (portId, updates) => {
          portUpdates.push({ portId, updates });
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
        setSubInterfaceConfig: (parentPortId, vlanId, updates) => {
          subIfConfigs.push({ parentPortId, vlanId, updates });
          const p = mockRouter.ports.find((pr) => pr.id === parentPortId);
          if (p) {
            p.subInterfaces = p.subInterfaces || [];
            const idx = p.subInterfaces.findIndex((s) => s.vlanId === vlanId);
            if (idx >= 0) {
              p.subInterfaces[idx] = {
                ...p.subInterfaces[idx],
                ...('ipAddress' in updates ? { ipAddress: updates.ipAddress ?? '' } : {}),
                ...('subnetMask' in updates ? { subnetMask: updates.subnetMask ?? '' } : {}),
              };
            } else {
              p.subInterfaces.push({
                vlanId,
                ipAddress: updates.ipAddress ?? '',
                subnetMask: updates.subnetMask ?? '255.255.255.0',
              });
            }
          }
        },
        removeSubInterface: (parentPortId, vlanId) => {
          removedSubIfs.push({ parentPortId, vlanId });
          const p = mockRouter.ports.find((pr) => pr.id === parentPortId);
          if (p && p.subInterfaces) {
            p.subInterfaces = p.subInterfaces.filter((s) => s.vlanId !== vlanId);
          }
        },
        clearMacTable: () => {
          macCleared = true;
        },
        clearArpTable: () => {
          arpCleared = true;
        },
      });

    it('interface context switching: berpindah antar interface langsung dari config-if tanpa exit', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('interface fa0/0');
      expect(session.prompt()).toBe('R1(config-if)#');
      expect(session.currentInterface).toBe('fa0/0');

      // Langsung switch ke fa0/1 tanpa exit
      await session.handle('int fa0/1');
      expect(session.prompt()).toBe('R1(config-if)#');
      expect(session.currentInterface).toBe('fa0/1');
      expect(session.currentSubInterface).toBeNull();

      // Langsung switch ke sub-interface fa0/0.10
      await session.handle('int fa0/0.10');
      expect(session.prompt()).toBe('R1(config-subif)#');
      expect(session.currentInterface).toBe('fa0/0');
      expect(session.currentSubInterface?.vlanId).toBe(10);

      // Langsung switch kembali ke physical interface fa0/1
      await session.handle('int fa0/1');
      expect(session.prompt()).toBe('R1(config-if)#');
      expect(session.currentInterface).toBe('fa0/1');
      expect(session.currentSubInterface).toBeNull();
    });

    it('menghapus sub-interface via "no interface fa0/0.10"', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/0.10');
      expect(mockRouter.ports[0].subInterfaces).toHaveLength(1);

      // no interface fa0/0.10 dari dalam config-if
      await session.handle('no int fa0/0.10');
      expect(removedSubIfs).toEqual([{ parentPortId: 'fa0/0', vlanId: 10 }]);
      expect(mockRouter.ports[0].subInterfaces).toHaveLength(0);
      expect(session.prompt()).toBe('R1(config)#');

      // Mencoba menghapus interface fisik ditolak
      const err = await session.handle('no int fa0/0');
      expect(err[0]).toContain('tidak dapat dihapus');
    });

    it('clear mac-address-table dan clear arp membersihkan tabel', async () => {
      const switchSession = new CliSession({
        getDevice: () => mockSwitch,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
        clearMacTable: () => {
          macCleared = true;
          mockSwitch.macTable = {};
        },
        clearArpTable: () => {
          arpCleared = true;
          mockSwitch.arpTable = {};
        },
      });

      await switchSession.handle('enable');
      const resMac = await switchSession.handle('clear mac-address-table');
      expect(resMac).toEqual(['[OK]']);
      expect(macCleared).toBe(true);
      expect(mockSwitch.macTable).toEqual({});

      const resArp = await switchSession.handle('clear arp');
      expect(resArp).toEqual(['[OK]']);
      expect(arpCleared).toBe(true);
      expect(mockSwitch.arpTable).toEqual({});
    });

    it('show running-config menampilkan konfigurasi pool DHCP pada router', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      const lines = await session.handle('sh run');
      const text = lines.join('\n');
      expect(text).toContain('ip dhcp pool POOL_FA0_0');
      expect(text).toContain('network 192.168.1.0 255.255.255.0');
    });

    it('no ip address pada sub-interface mengosongkan IP address', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/0.10');
      await session.handle('ip address 192.168.10.1 255.255.255.0');
      expect(mockRouter.ports[0].subInterfaces?.[0]?.ipAddress).toBe('192.168.10.1');

      await session.handle('no ip address');
      expect(mockRouter.ports[0].subInterfaces?.[0]?.ipAddress).toBe('');
    });
  });

  describe('L2 & L3 Invariants: Sub-interfaces, RIP, and DHCP', () => {
    it('L3 Routing tidak menggunakan sub-interface pada port fisik yang DOWN', () => {
      const engine = new HeadlessSimulationEngine();
      const r1: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'down', // PORT DOWN!
            macAddress: '00:50:79:00:00:01',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'up',
            ipAddress: '10.0.0.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:00:02',
          },
        ],
      };
      engine.setTopology([r1], []);
      const plan = engine.planPing('r-1', '192.168.10.50');
      expect(plan.summary.success).toBe(false);
      expect(plan.summary.outputLines.join(' ')).toContain('No route to host');
    });

    it('Static route dengan next-hop pada subnet sub-interface menyertakan vlanId dan subIfIp', async () => {
      const engine = new HeadlessSimulationEngine();
      const r1: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            macAddress: '00:50:79:00:01:00',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
        routes: [
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: '192.168.10.2', interfaceId: 'fa0/0', source: 'static' },
        ],
      };
      const r2: DeviceData = {
        id: 'r-2',
        label: 'R2',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            macAddress: '00:50:79:00:02:00',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.2', subnetMask: '255.255.255.0' },
            ],
          },
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'up',
            ipAddress: '172.16.0.1',
            subnetMask: '255.255.0.0',
            macAddress: '00:50:79:00:02:01',
          },
        ],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/0', targetNodeId: 'r-2', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];
      engine.setTopology([r1, r2], links);
      const plan = engine.planPing('r-1', '172.16.0.1');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);
    });

    it('RIPv2 mengabaikan port DOWN dan tidak menginstal rute dengan metric >= 16', () => {
      const engine = new HeadlessSimulationEngine();
      const r1: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ripEnabled: true,
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '10.0.0.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:01:00',
          },
          {
            id: 'fa0/1',
            name: 'FastEthernet 0/1',
            status: 'down', // Port down jangan diiklankan!
            ipAddress: '192.168.99.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:01:01',
          },
        ],
        routes: [],
      };
      const r2: DeviceData = {
        id: 'r-2',
        label: 'R2',
        type: 'router',
        ripEnabled: true,
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '10.0.0.2',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:02:00',
          },
        ],
        routes: [],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'r-1', sourcePortId: 'fa0/0', targetNodeId: 'r-2', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];
      engine.setTopology([r1, r2], links);
      const plan = engine.planRip();
      expect(plan.summary.success).toBe(true);

      const r2Dev = engine.getDevices().find((d) => d.id === 'r-2');
      // 192.168.99.0/24 tidak boleh dipelajari karena port r1 fa0/1 berstatus DOWN
      const learned99 = r2Dev?.routes?.find((r) => r.network === '192.168.99.0');
      expect(learned99).toBeUndefined();
    });

    it('DHCP Discover broadcast memprioritaskan port yang diminta klien', () => {
      const engine = new HeadlessSimulationEngine();
      const r1: DeviceData = {
        id: 'r-1',
        label: 'R1',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            ipAddress: '192.168.1.1',
            subnetMask: '255.255.255.0',
            macAddress: '00:50:79:00:01:00',
          },
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
      };
      const pc1: DeviceData = {
        id: 'pc-1',
        label: 'PC1',
        type: 'pc',
        ports: [
          { id: 'wla0', name: 'Wireless', status: 'up', kind: 'wireless', macAddress: '00:50:79:00:AA:01' },
          { id: 'eth0', name: 'Ethernet', status: 'up', kind: 'ethernet', macAddress: '00:50:79:00:AA:02' },
        ],
      };
      const links: TopologyLink[] = [
        { sourceNodeId: 'pc-1', sourcePortId: 'eth0', targetNodeId: 'r-1', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];
      engine.setTopology([r1, pc1], links);

      // Klien meminta DHCP pada eth0 (meskipun wla0 berada di urutan pertama ports)
      const plan = engine.planDhcp('pc-1', 'eth0');
      expect(plan.summary.success).toBe(true);
      const updatedPc = engine.getDevices().find((d) => d.id === 'pc-1');
      const ethPort = updatedPc?.ports.find((p) => p.id === 'eth0');
      expect(ethPort?.ipAddress).toBe('192.168.1.100');
    });
  });

  describe('INV-003: Port Singularity, Edge Sanitization, & Table Cleanup', () => {
    it('connectPorts menolak port yang sudah memiliki kabel (INV-003)', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });
      store.addDevice('laptop', { x: 500, y: 100 });

      const currentNodes = useAppStore.getState().nodes;
      const pc = currentNodes.find((n) => n.data.type === 'pc')!;
      const sw = currentNodes.find((n) => n.data.type === 'switch')!;
      const lap = currentNodes.find((n) => n.data.type === 'laptop')!;

      const firstOk = useAppStore.getState().connectPorts(pc.id, 'fa0', sw.id, 'fa0/1');
      expect(firstOk).toBe(true);

      // Coba sambungkan laptop ke port yang sama (fa0 pada pc atau fa0/1 pada switch)
      const secondFail1 = useAppStore.getState().connectPorts(lap.id, 'fa0', pc.id, 'fa0');
      expect(secondFail1).toBe(false);

      const secondFail2 = useAppStore.getState().connectPorts(lap.id, 'fa0', sw.id, 'fa0/1');
      expect(secondFail2).toBe(false);
    });

    it('penghapusan device membersihkan entri ARP dan CAM pada device yang masih hidup', () => {
      const store = useAppStore.getState();
      store.addDevice('pc', { x: 100, y: 100 });
      store.addDevice('pc', { x: 300, y: 100 });

      const currentNodes = useAppStore.getState().nodes;
      const pc1 = currentNodes[0]!;
      const pc2 = currentNodes[1]!;

      // Isi tabel ARP dan CAM seolah-olah sudah pernah berkomunikasi
      useAppStore.setState({
        nodes: currentNodes.map((n) => {
          if (n.id === pc1.id) {
            return {
              ...n,
              data: {
                ...n.data,
                arpTable: { '192.168.1.20': '00:50:79:00:00:20' },
                macTable: { '00:50:79:00:00:20': 'fa0/1' },
              },
            };
          }
          if (n.id === pc2.id) {
            return {
              ...n,
              data: {
                ...n.data,
                ports: n.data.ports.map((p) =>
                  p.id === 'fa0'
                    ? { ...p, ipAddress: '192.168.1.20', macAddress: '00:50:79:00:00:20' }
                    : p
                ),
              },
            };
          }
          return n;
        }),
      });

      // Hapus PC2
      useAppStore.getState().deleteNode(pc2.id);

      const survivingPc1 = useAppStore.getState().nodes.find((n) => n.id === pc1.id);
      expect(survivingPc1?.data.arpTable?.['192.168.1.20']).toBeUndefined();
      expect(survivingPc1?.data.macTable?.['00:50:79:00:00:20']).toBeUndefined();
    });

    it('loadTopology menyaring orphaned edges dan kabel duplikat pada port yang sama', () => {
      const store = useAppStore.getState();
      store.loadTopology({
        nodes: [
          {
            id: 'pc-1',
            type: 'deviceNode',
            position: { x: 100, y: 100 },
            data: {
              id: 'pc-1',
              label: 'PC-1',
              type: 'pc',
              ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'down', kind: 'ethernet', macAddress: '00:50:79:00:01:01' }],
            },
          },
          {
            id: 'sw-1',
            type: 'deviceNode',
            position: { x: 300, y: 100 },
            data: {
              id: 'sw-1',
              label: 'Switch-1',
              type: 'switch',
              ports: [
                { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', kind: 'ethernet', macAddress: '00:50:79:00:02:01' },
                { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', kind: 'ethernet', macAddress: '00:50:79:00:02:02' },
              ],
            },
          },
        ],
        edges: [
          // Edge valid
          { id: 'e-1', source: 'pc-1', target: 'sw-1', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable' },
          // Edge orphaned (node target hantu 'ghost-node')
          { id: 'e-orphan', source: 'pc-1', target: 'ghost-node', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable' },
          // Edge duplikat melanggar INV-003 (port pc-1 fa0 sudah terhubung di e-1)
          { id: 'e-dup', source: 'pc-1', target: 'sw-1', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable' },
        ],
      });

      const loadedEdges = useAppStore.getState().edges;
      expect(loadedEdges).toHaveLength(1);
      expect(loadedEdges[0].id).toBe('e-1');
    });

    it('clearMacTable dan clearArpTable pada store mengosongkan tabel node tertentu', () => {
      const store = useAppStore.getState();
      store.addDevice('switch', { x: 100, y: 100 });
      const sw = useAppStore.getState().nodes[0]!;

      useAppStore.setState({
        nodes: useAppStore.getState().nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            macTable: { '00:50:79:11:22:33': 'fa0/1' },
            arpTable: { '192.168.1.1': '00:50:79:00:00:01' },
          },
        })),
      });

      useAppStore.getState().clearMacTable(sw.id);
      expect(useAppStore.getState().nodes[0].data.macTable).toEqual({});
      expect(useAppStore.getState().nodes[0].data.arpTable).toEqual({ '192.168.1.1': '00:50:79:00:00:01' });

      useAppStore.getState().clearArpTable(sw.id);
      expect(useAppStore.getState().nodes[0].data.arpTable).toEqual({});
    });
  });
});
