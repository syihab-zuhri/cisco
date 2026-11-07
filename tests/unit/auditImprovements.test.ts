import { describe, it, expect, beforeEach } from 'vitest';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import { useAppStore } from '../../src/store/useAppStore';
import { classroomHub } from '../../src/features/classroom/classroomHub';
import type { DeviceData, RoutingEntry } from '../../src/types/network';

describe('Audit Improvements: Cisco IOS CLI Extensions & Port Status Parity', () => {
  let routerDevice: DeviceData;
  let switchDevice: DeviceData;
  let addedRoutes: RoutingEntry[];
  let removedRouteIndexes: number[];
  let savedConfigCount: number;
  let subIfConfigs: Array<{ parentPortId: string; vlanId: number; updates: { ipAddress?: string; subnetMask?: string } }>;

  beforeEach(() => {
    addedRoutes = [];
    removedRouteIndexes = [];
    savedConfigCount = 0;
    subIfConfigs = [];

    routerDevice = {
      id: 'r-1',
      label: 'Router-1',
      type: 'router',
      ports: [
        { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'down', macAddress: '00:50:79:RT:00:01' },
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'down', macAddress: '00:50:79:RT:00:02' },
      ],
      routes: [
        { network: '10.0.0.0', subnetMask: '255.0.0.0', nextHop: '192.168.1.254', interfaceId: 'fa0/0', source: 'static' },
      ],
      arpTable: {},
    };

    switchDevice = {
      id: 'sw-1',
      label: 'Switch-1',
      type: 'switch',
      ports: [
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:00:01', portMode: 'access', vlanId: 1 },
        { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:SW:00:02', portMode: 'access', vlanId: 10 },
        { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:SW:00:03', portMode: 'trunk' },
      ],
      macTable: {},
      arpTable: {},
    };
  });

  const createRouterSession = (): CliSession => {
    const deps: CliSessionDeps = {
      getDevice: () => routerDevice,
      setHostname: (name) => {
        routerDevice.label = name;
      },
      setPortConfig: (portId, updates) => {
        const p = routerDevice.ports.find((port) => port.id === portId);
        if (p) Object.assign(p, updates);
      },
      requestPing: async (targetIp) => ({
        success: true,
        outputLines: [`Success rate is 100 percent (5/5) to ${targetIp}`],
      }),
      addStaticRoute: (route) => {
        addedRoutes.push(route);
        routerDevice.routes = [...(routerDevice.routes || []), route];
      },
      removeStaticRoute: (index) => {
        removedRouteIndexes.push(index);
        const current = [...(routerDevice.routes || [])];
        current.splice(index, 1);
        routerDevice.routes = current;
      },
      setDefaultGateway: (gw) => {
        routerDevice.defaultGateway = gw;
      },
      saveConfig: () => {
        savedConfigCount++;
      },
      setSubInterfaceConfig: (parentPortId, vlanId, updates) => {
        subIfConfigs.push({ parentPortId, vlanId, updates });
        const p = routerDevice.ports.find((port) => port.id === parentPortId);
        if (p) {
          const subs = [...(p.subInterfaces || [])];
          const existing = subs.find((s) => s.vlanId === vlanId);
          if (existing) {
            Object.assign(existing, updates);
          } else {
            subs.push({
              vlanId,
              ipAddress: updates.ipAddress || '',
              subnetMask: updates.subnetMask || '255.255.255.0',
            });
          }
          p.subInterfaces = subs;
        }
      },
    };
    return new CliSession(deps);
  };

  const createSwitchSession = (): CliSession => {
    const deps: CliSessionDeps = {
      getDevice: () => switchDevice,
      setHostname: (name) => {
        switchDevice.label = name;
      },
      setPortConfig: (portId, updates) => {
        const p = switchDevice.ports.find((port) => port.id === portId);
        if (p) Object.assign(p, updates);
      },
      requestPing: async () => ({ success: true, outputLines: [] }),
      setDefaultGateway: (gw) => {
        switchDevice.defaultGateway = gw;
      },
      saveConfig: () => {
        savedConfigCount++;
      },
    };
    return new CliSession(deps);
  };

  describe('Static Routing via CLI (ip route & no ip route)', () => {
    it('mengonfigurasi static route dengan subnet mask eksplisit', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');

      const res = await session.handle('ip route 192.168.2.0 255.255.255.0 192.168.1.2');
      expect(res).toEqual([]);
      expect(addedRoutes).toHaveLength(1);
      expect(addedRoutes[0]).toMatchObject({
        network: '192.168.2.0',
        subnetMask: '255.255.255.0',
        nextHop: '192.168.1.2',
        source: 'static',
      });
    });

    it('mendukung konfigurasi static route dengan notasi prefix /24', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');

      await session.handle('ip route 172.16.0.0 /16 10.0.0.2');
      expect(addedRoutes).toHaveLength(1);
      expect(addedRoutes[0].subnetMask).toBe('255.255.0.0');
    });

    it('menghapus static route via perintah "no ip route"', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');

      const res = await session.handle('no ip route 10.0.0.0 255.0.0.0');
      expect(res).toEqual([]);
      expect(removedRouteIndexes).toContain(0);
    });

    it('menolak konfigurasi ip route pada Switch', async () => {
      const session = createSwitchSession();
      await session.handle('enable');
      await session.handle('conf t');

      const res = await session.handle('ip route 192.168.2.0 255.255.255.0 192.168.1.2');
      expect(res[0]).toContain('IP routing hanya dapat dikonfigurasi pada router');
    });
  });

  describe('Switchport Configuration via CLI (mode, access vlan, trunk)', () => {
    it('mengonfigurasi switchport mode access dan switchport access vlan', async () => {
      const session = createSwitchSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/1');

      await session.handle('switchport mode access');
      expect(switchDevice.ports[0].portMode).toBe('access');

      await session.handle('switchport access vlan 20');
      expect(switchDevice.ports[0].vlanId).toBe(20);
      expect(switchDevice.ports[0].portMode).toBe('access');
    });

    it('mengonfigurasi switchport mode trunk', async () => {
      const session = createSwitchSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/2');

      await session.handle('switchport mode trunk');
      expect(switchDevice.ports[1].portMode).toBe('trunk');
    });

    it('menolak konfigurasi switchport pada Router', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');
      await session.handle('int fa0/0');

      const res = await session.handle('switchport mode access');
      expect(res[0]).toContain('Perintah switchport hanya berlaku pada Switch');
    });
  });

  describe('Sub-interface & 802.1Q Encapsulation on Router', () => {
    it('masuk ke sub-interface dan menampilkan prompt (config-subif)#', async () => {
      const session = createRouterSession();
      await session.handle('enable');
      await session.handle('conf t');

      await session.handle('int fa0/0.10');
      expect(session.prompt()).toBe('Router-1(config-subif)#');

      await session.handle('encapsulation dot1q 10');
      await session.handle('ip address 192.168.10.1 255.255.255.0');
      expect(subIfConfigs).toHaveLength(3);
      expect(subIfConfigs[2].updates).toEqual({
        ipAddress: '192.168.10.1',
        subnetMask: '255.255.255.0',
      });
    });
  });

  describe('Configuration Inspection & Persistence (show run, write memory, show vlan)', () => {
    it('menampilkan running-config lengkap dengan hostname, interface, dan route', async () => {
      const session = createRouterSession();
      await session.handle('enable');

      const lines = await session.handle('show running-config');
      const text = lines.join('\n');
      expect(text).toContain('Building configuration...');
      expect(text).toContain('hostname Router-1');
      expect(text).toContain('interface FastEthernet 0/0');
      expect(text).toContain('ip route 10.0.0.0 255.0.0.0 192.168.1.254');
      expect(text).toContain('end');
    });

    it('mendukung alias "sh run"', async () => {
      const session = createRouterSession();
      await session.handle('enable');

      const lines = await session.handle('sh run');
      expect(lines.join('\n')).toContain('hostname Router-1');
    });

    it('menyimpan konfigurasi dengan perintah "write memory" dan alias "wr"', async () => {
      const session = createRouterSession();
      await session.handle('enable');

      const res1 = await session.handle('write memory');
      expect(res1).toContain('[OK]');
      expect(savedConfigCount).toBe(1);

      const res2 = await session.handle('wr');
      expect(res2).toContain('[OK]');
      expect(savedConfigCount).toBe(2);
    });

    it('menampilkan tabel VLAN pada switch dengan show vlan brief', async () => {
      const session = createSwitchSession();
      await session.handle('enable');

      const lines = await session.handle('show vlan brief');
      const text = lines.join('\n');
      expect(text).toContain('VLAN Name');
      expect(text).toContain('default');
      expect(text).toContain('VLAN0010');
      expect(text).toContain('FastEthernet 0/2');
    });
  });

  describe('Default Gateway Configuration', () => {
    it('mengatur default-gateway pada switch via CLI', async () => {
      const session = createSwitchSession();
      await session.handle('enable');
      await session.handle('conf t');

      await session.handle('ip default-gateway 192.168.1.1');
      expect(switchDevice.defaultGateway).toBe('192.168.1.1');

      await session.handle('no ip default-gateway');
      expect(switchDevice.defaultGateway).toBeUndefined();
    });
  });

  describe('Router Port Connection Parity in useAppStore', () => {
    it('mempertahankan status administratif down saat router dicolokkan kabel pertama kali', () => {
      const store = useAppStore.getState();
      store.resetTopology();

      // Tambah router dan switch
      store.addDevice('router', { x: 100, y: 100 });
      store.addDevice('switch', { x: 300, y: 100 });

      const nodes = useAppStore.getState().nodes;
      const routerNode = nodes.find((n) => n.data.type === 'router')!;
      const switchNode = nodes.find((n) => n.data.type === 'switch')!;

      // Pastikan port router masih down
      expect(routerNode.data.ports[0].status).toBe('down');

      // Hubungkan kabel dari router fa0/0 ke switch fa0/1
      const connected = useAppStore.getState().connectPorts(
        routerNode.id,
        'fa0/0',
        switchNode.id,
        'fa0/1'
      );
      expect(connected).toBe(true);

      const updatedRouter = useAppStore.getState().nodes.find((n) => n.id === routerNode.id)!;
      const updatedSwitch = useAppStore.getState().nodes.find((n) => n.id === switchNode.id)!;

      // Switch port menjadi up
      expect(updatedSwitch.data.ports[0].status).toBe('up');
      // Router port tetap down secara administratif sampai no shutdown
      expect(updatedRouter.data.ports[0].status).toBe('down');

      // Aktifkan port router secara manual (misal via no shutdown atau toggle GUI)
      store.updatePortConfig(routerNode.id, 'fa0/0', { status: 'up' });
      const finalRouter = useAppStore.getState().nodes.find((n) => n.id === routerNode.id)!;
      expect(finalRouter.data.ports[0].status).toBe('up');
    });
  });

  describe('Classroom Role Switching & Template Lock Parity', () => {
    it('mengunci mode siswa dan membuka kembali saat ganti peran ke guru atau keluar kelas', async () => {
      classroomHub.clearAll();

      // Awal: Tidak ada peran, siswa tidak aktif -> template terbuka
      expect(classroomHub.isStudentActive()).toBe(false);

      let lastEventRole: string | null | undefined;
      const unsub = classroomHub.subscribe((ev) => {
        if (ev.type === 'ROLE_CHANGED') {
          lastEventRole = ev.role;
        }
      });

      // 1. Masuk ke Mode Siswa -> isStudentActive = true (template terkunci)
      classroomHub.setLockedRole('student');
      expect(classroomHub.getLockedRole()).toBe('student');
      expect(classroomHub.isStudentActive()).toBe(true);

      await Promise.resolve();
      expect(lastEventRole).toBe('student');

      // 2. Ganti peran ke Guru -> isStudentActive = false (template terbuka kembali)
      classroomHub.setLockedRole('teacher');
      expect(classroomHub.getLockedRole()).toBe('teacher');
      expect(classroomHub.isStudentActive()).toBe(false);

      await Promise.resolve();
      expect(lastEventRole).toBe('teacher');

      // 3. Masuk lagi ke Mode Siswa dan join participant
      classroomHub.setLockedRole('student');
      classroomHub.setCurrentParticipant({
        id: 'p-1',
        nickname: 'Budi',
        joinedAt: Date.now(),
        status: 'in_progress',
      });
      expect(classroomHub.isStudentActive()).toBe(true);

      // 4. Keluar dari mode siswa via leaveClass() -> isStudentActive = false (template terbuka)
      classroomHub.leaveClass();
      expect(classroomHub.getLockedRole()).toBeNull();
      expect(classroomHub.getCurrentParticipant()).toBeNull();
      expect(classroomHub.isStudentActive()).toBe(false);

      await Promise.resolve();
      expect(lastEventRole).toBeNull();

      unsub();
    });
  });
});
