import { describe, it, expect, beforeEach } from 'vitest';
import { HeadlessSimulationEngine } from '../../src/engine/simulationEngine';
import { CliSession } from '../../src/engine/cli/cliEngine';
import { useAppStore } from '../../src/store/useAppStore';
import type { DeviceData, TopologyLink } from '../../src/types/network';

describe('Rigorous Audit Regression: Deep Line-by-Line Fixes Verification', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  describe('1. Directly Attached Static Route with Interface Name', () => {
    it('menggunakan interface name (fa0/1) sebagai nextHop dan me-resolve target IP tanpa timeout', async () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [
          // Konfigurasi static route khas Cisco: "ip route 172.16.0.0 255.255.0.0 fa0/1"
          { network: '172.16.0.0', subnetMask: '255.255.0.0', nextHop: 'fa0/1', interfaceId: 'fa0/1', source: 'static' },
        ],
        arpTable: {},
      };

      const pc: DeviceData = {
        id: 'pc-target',
        label: 'Target-PC',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.10.50', subnetMask: '255.255.0.0', macAddress: '00:50:79:17:16:50' },
        ],
        arpTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r1', sourcePortId: 'fa0/1', targetNodeId: 'pc-target', targetPortId: 'fa0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, pc], links);

      const plan = engine.planPing('r1', '172.16.10.50');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);

      // Verifikasi bahwa ARP me-resolve targetIp langsung, bukan string 'fa0/1'
      const arpReq = plan.events.find((e) => e.kind === 'ARP_REQ');
      expect(arpReq).toBeDefined();
      expect(arpReq?.pdu?.segment).toMatchObject({
        targetIp: '172.16.10.50',
      });
    });

    it('melewati static route yang mengarah ke interface yang DOWN dan fallback ke default route aktif', async () => {
      const r1: DeviceData = {
        id: 'r1',
        label: 'Router-1',
        type: 'router',
        ports: [
          // fa0/0 menuju backup router / default gateway (status UP)
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:01' },
          // fa0/1 menuju specific destination (status DOWN / link down)
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:01:00:02' },
        ],
        routes: [
          // Route spesifik /24 mengarah ke fa0/1 (DOWN)
          { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: 'fa0/1', interfaceId: 'fa0/1', source: 'static' },
          // Default route 0.0.0.0/0 mengarah ke fa0/0 (UP)
          { network: '0.0.0.0', subnetMask: '0.0.0.0', nextHop: '192.168.1.2', interfaceId: 'fa0/0', source: 'static' },
        ],
        arpTable: {},
      };

      const r2: DeviceData = {
        id: 'r2',
        label: 'Router-2',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '192.168.1.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:01' },
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.0', macAddress: '00:50:79:02:00:02' },
        ],
        routes: [
          { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: 'fa0/1', interfaceId: 'fa0/1', source: 'static' },
        ],
        arpTable: {},
      };

      const pc: DeviceData = {
        id: 'pc',
        label: 'PC',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '10.0.0.99', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:00:99' },
        ],
        defaultGateway: '10.0.0.2',
        arpTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'r1', sourcePortId: 'fa0/0', targetNodeId: 'r2', targetPortId: 'fa0/0', kind: 'ethernet' },
        { sourceNodeId: 'r2', sourcePortId: 'fa0/1', targetNodeId: 'pc', targetPortId: 'fa0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([r1, r2, pc], links);

      // Ping dari R1 ke 10.0.0.99 harus fallback ke r2 via fa0/0 karena fa0/1 di R1 berstatus DOWN!
      const plan = engine.planPing('r1', '10.0.0.99');
      expect(plan.summary.success).toBe(true);
      expect(plan.summary.received).toBe(1);

      // Hop pertama harus keluar dari fa0/0 R1
      const firstIcmp = plan.events.find((e) => e.kind === 'ICMP_REQ');
      expect(firstIcmp?.hop?.sourcePortId).toBe('fa0/0');
    });
  });

  describe('2. Layer 2 Switch Source MAC Preservation across Multiple Switches', () => {
    it('memastikan switch L2 tidak me-rewrite MAC frame sumber dan CAM table belajar MAC asli pengirim', () => {
      // PC1 -> Switch1 -> Switch2 -> PC2
      const pc1: DeviceData = {
        id: 'pc1',
        label: 'PC-1',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:AA:00:01' },
        ],
        arpTable: {},
      };

      const sw1: DeviceData = {
        id: 'sw1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:01:01' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:SW:01:02' },
        ],
        macTable: {},
      };

      const sw2: DeviceData = {
        id: 'sw2',
        label: 'Switch-2',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:02:01' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:SW:02:02' },
        ],
        macTable: {},
      };

      const pc2: DeviceData = {
        id: 'pc2',
        label: 'PC-2',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:BB:00:02' },
        ],
        arpTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'sw1', targetPortId: 'fa0/1', kind: 'ethernet' },
        { sourceNodeId: 'sw1', sourcePortId: 'fa0/2', targetNodeId: 'sw2', targetPortId: 'fa0/1', kind: 'ethernet' },
        { sourceNodeId: 'sw2', sourcePortId: 'fa0/2', targetNodeId: 'pc2', targetPortId: 'fa0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc1, sw1, sw2, pc2], links);

      const plan = engine.planPing('pc1', '192.168.1.20');
      expect(plan.summary.success).toBe(true);

      // Verifikasi seluruh hop ICMP_REQ mempertahankan srcMac PC-1 dan dstMac PC-2
      const reqHops = plan.events.filter((e) => e.kind === 'ICMP_REQ');
      expect(reqHops.length).toBe(3);
      for (const h of reqHops) {
        expect(h.pdu?.frame.srcMac).toBe('00:50:79:AA:00:01');
        expect(h.pdu?.frame.dstMac).toBe('00:50:79:BB:00:02');
      }

      // Verifikasi seluruh hop ICMP_REP mempertahankan srcMac PC-2 dan dstMac PC-1
      const repHops = plan.events.filter((e) => e.kind === 'ICMP_REP');
      expect(repHops.length).toBe(3);
      for (const h of repHops) {
        expect(h.pdu?.frame.srcMac).toBe('00:50:79:BB:00:02');
        expect(h.pdu?.frame.dstMac).toBe('00:50:79:AA:00:01');
      }

      // Verifikasi CAM learning pada Switch 2:
      // Harus belajar MAC PC-1 pada fa0/1 (bukan MAC port switch-1 fa0/2)
      const devices = engine.getDevices();
      const sw2Updated = devices.find((d) => d.id === 'sw2');
      expect(sw2Updated?.macTable?.['00:50:79:AA:00:01']).toBe('fa0/1');
      expect(sw2Updated?.macTable?.['00:50:79:BB:00:02']).toBe('fa0/2');
    });
  });

  describe('3. Router-on-a-Stick Subinterface ARP and Reply VLAN Preservation', () => {
    it('memastikan ARP reply dan ICMP reply dari router subinterface membawa tag 802.1Q vlanId yang benar', () => {
      // PC (VLAN 10) -> Switch (Trunk) -> Router fa0/0.10 (VLAN 10)
      const pc: DeviceData = {
        id: 'pc1',
        label: 'PC-VLAN10',
        type: 'pc',
        ports: [
          { id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:00:10', vlanId: 10 },
        ],
        defaultGateway: '192.168.10.1',
        arpTable: {},
      };

      const sw: DeviceData = {
        id: 'sw1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', vlanId: 10, portMode: 'access', macAddress: '00:50:79:SW:00:01' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', portMode: 'trunk', macAddress: '00:50:79:SW:00:02' },
        ],
      };

      const router: DeviceData = {
        id: 'r1',
        label: 'Router-ROAS',
        type: 'router',
        ports: [
          {
            id: 'fa0/0',
            name: 'FastEthernet 0/0',
            status: 'up',
            macAddress: '00:50:79:RT:00:01',
            portMode: 'trunk',
            subInterfaces: [
              { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
            ],
          },
        ],
        arpTable: {},
      };

      const links: TopologyLink[] = [
        { sourceNodeId: 'pc1', sourcePortId: 'fa0', targetNodeId: 'sw1', targetPortId: 'fa0/1', kind: 'ethernet' },
        { sourceNodeId: 'sw1', sourcePortId: 'fa0/2', targetNodeId: 'r1', targetPortId: 'fa0/0', kind: 'ethernet' },
      ];

      const engine = new HeadlessSimulationEngine();
      engine.setTopology([pc, sw, router], links);

      const plan = engine.planPing('pc1', '192.168.10.1');
      expect(plan.summary.success).toBe(true);

      // Verifikasi ARP Reply dari subinterface membawa vlanId 10
      const arpRep = plan.events.find((e) => e.kind === 'ARP_REP');
      expect(arpRep).toBeDefined();
      expect(arpRep?.pdu?.frame.vlanId).toBe(10);

      // Verifikasi ICMP Reply dari subinterface membawa vlanId 10
      const icmpRep = plan.events.find((e) => e.kind === 'ICMP_REP' && e.hop?.sourceNodeId === 'r1');
      expect(icmpRep).toBeDefined();
      expect(icmpRep?.pdu?.frame.vlanId).toBe(10);
    });
  });

  describe('4. Cisco IOS CLI: Shorthand Commands and Subinterface Updates', () => {
    it('mendukung perintah shorthand "sh vlan brief", "show vlan br", dan "sh vlan br"', async () => {
      const sw: DeviceData = {
        id: 'sw1',
        label: 'Switch-1',
        type: 'switch',
        ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', vlanId: 10, macAddress: '00:50:79:00:00:01' },
        ],
      };

      const session = new CliSession({
        getDevice: () => sw,
        setHostname: () => {},
        setPortConfig: () => {},
        requestPing: async () => ({ success: true, outputLines: [] }),
      });

      await session.handle('enable');

      const out1 = await session.handle('sh vlan brief');
      expect(out1.join('\n')).toContain('VLAN Name');

      const out2 = await session.handle('show vlan br');
      expect(out2.join('\n')).toContain('VLAN Name');

      const out3 = await session.handle('sh vlan br');
      expect(out3.join('\n')).toContain('VLAN Name');
    });

    it('mengubah encapsulation dot1q pada subinterface memperbarui subinterface yang ada (tanpa duplikasi)', async () => {
      const router: DeviceData = {
        id: 'r1',
        label: 'Router-1',
        type: 'router',
        ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:00:00:01', subInterfaces: [] },
        ],
      };

      let subInterfaces: Array<{ vlanId: number; ipAddress: string; subnetMask: string }> = [];

      const session = new CliSession({
        getDevice: () => ({
          ...router,
          ports: [{ ...router.ports[0], subInterfaces }],
        }),
        setHostname: () => {},
        setPortConfig: () => {},
        setSubInterfaceConfig: (_parentPortId, vlanId, updates, oldVlanId) => {
          const searchVlan = oldVlanId ?? vlanId;
          const idx = subInterfaces.findIndex((s) => s.vlanId === searchVlan);
          if (idx >= 0) {
            subInterfaces[idx] = {
              ...subInterfaces[idx],
              vlanId,
              ...('ipAddress' in updates ? { ipAddress: updates.ipAddress ?? '' } : {}),
              ...('subnetMask' in updates ? { subnetMask: updates.subnetMask ?? '' } : {}),
            };
          } else {
            subInterfaces.push({
              vlanId,
              ipAddress: updates.ipAddress ?? '',
              subnetMask: updates.subnetMask ?? '255.255.255.0',
            });
          }
        },
        requestPing: async () => ({ success: true, outputLines: [] }),
      });

      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/0.10');
      expect(subInterfaces).toHaveLength(1);
      expect(subInterfaces[0].vlanId).toBe(10);

      // Ubah VLAN ID subinterface menjadi 20
      await session.handle('encapsulation dot1q 20');
      expect(subInterfaces).toHaveLength(1);
      expect(subInterfaces[0].vlanId).toBe(20);

      // Konfigurasi IP
      await session.handle('ip address 192.168.20.1 255.255.255.0');
      expect(subInterfaces).toHaveLength(1);
      expect(subInterfaces[0].ipAddress).toBe('192.168.20.1');
    });
  });
});
