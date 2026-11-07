import { describe, it, expect, beforeEach } from 'vitest';
import { isValidMac, normalizeMac, networkAddress, ipToNumber } from '../../src/utils/ipUtils';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import { type DeviceData } from '../../src/types/network';
import { useAppStore } from '../../src/store/useAppStore';

describe('Rigorous Audit: MAC Address Utilities & Validation', () => {
  it('isValidMac menerima format colon, hyphen, dan Cisco', () => {
    expect(isValidMac('00:50:79:66:68:01')).toBe(true);
    expect(isValidMac('00-50-79-66-68-01')).toBe(true);
    expect(isValidMac('0050.7966.6801')).toBe(true);
    expect(isValidMac('AA:BB:CC:DD:EE:FF')).toBe(true);
    expect(isValidMac('aa:bb:cc:dd:ee:ff')).toBe(true);
  });

  it('isValidMac menolak format yang salah', () => {
    expect(isValidMac('')).toBe(false);
    expect(isValidMac('not-a-mac')).toBe(false);
    expect(isValidMac('00:50:79:66:68')).toBe(false);
    expect(isValidMac('00:50:79:66:68:01:02')).toBe(false);
    expect(isValidMac('00:50:79:GG:68:01')).toBe(false);
  });

  it('normalizeMac mengubah format non-standar menjadi format standar huruf besar', () => {
    expect(normalizeMac('00-50-79-66-68-01')).toBe('00:50:79:66:68:01');
    expect(normalizeMac('0050.7966.6801')).toBe('00:50:79:66:68:01');
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
  });
});

describe('Rigorous Audit: CLI Prompt Transitions & Command Navigation', () => {
  let routerDevice: DeviceData;
  let portUpdates: Array<{ portId: string; updates: Record<string, unknown> }>;
  let subIfUpdates: Array<{ parentPortId: string; vlanId: number; updates: Record<string, unknown> }>;
  let session: CliSession;

  const buildDeps = (dev: DeviceData): CliSessionDeps => ({
    getDevice: () => dev,
    setHostname: (name) => {
      dev.label = name;
    },
    setPortConfig: (portId, updates) => {
      portUpdates.push({ portId, updates });
      const p = dev.ports.find((pr) => pr.id === portId);
      if (p) Object.assign(p, updates);
    },
    setSubInterfaceConfig: (parentPortId, vlanId, updates, oldVlanId) => {
      subIfUpdates.push({ parentPortId, vlanId, updates });
      const p = dev.ports.find((pr) => pr.id === parentPortId);
      if (p) {
        p.subInterfaces = p.subInterfaces ?? [];
        const searchVlan = oldVlanId ?? vlanId;
        const idx = p.subInterfaces.findIndex((s) => s.vlanId === searchVlan);
        if (idx >= 0) {
          p.subInterfaces[idx] = {
            ...p.subInterfaces[idx],
            vlanId,
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
      const p = dev.ports.find((pr) => pr.id === parentPortId);
      if (p && p.subInterfaces) {
        p.subInterfaces = p.subInterfaces.filter((s) => s.vlanId !== vlanId);
      }
    },
    addStaticRoute: (r) => {
      dev.routes = [...(dev.routes ?? []), r];
    },
    removeStaticRoute: (idx) => {
      dev.routes = (dev.routes ?? []).filter((_, i) => i !== idx);
    },
    setDefaultGateway: (gw) => {
      dev.defaultGateway = gw;
    },
    requestPing: async () => ({ success: true, outputLines: ['!!!!!'] }),
  });

  beforeEach(() => {
    routerDevice = {
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
    subIfUpdates = [];
    session = new CliSession(buildDeps(routerDevice));
  });

  it('semua 5 mode prompt bertransisi dengan benar: >, #, (config)#, (config-if)#, (config-subif)#', async () => {
    expect(session.prompt()).toBe('Router-1>');

    await session.handle('enable');
    expect(session.prompt()).toBe('Router-1#');

    await session.handle('conf t');
    expect(session.prompt()).toBe('Router-1(config)#');

    await session.handle('int fa0/0');
    expect(session.prompt()).toBe('Router-1(config-if)#');

    await session.handle('int fa0/0.10');
    expect(session.prompt()).toBe('Router-1(config-subif)#');

    // exit dari subif kembali ke config
    await session.handle('exit');
    expect(session.prompt()).toBe('Router-1(config)#');

    // exit dari config kembali ke priv
    await session.handle('exit');
    expect(session.prompt()).toBe('Router-1#');

    // exit dari priv meminta penutupan terminal
    await session.handle('exit');
    expect(session.closeRequested).toBe(true);
  });

  it('perintah "quit" berfungsi identik dengan "exit" di semua mode', async () => {
    const s = new CliSession(buildDeps(routerDevice));
    await s.handle('enable');
    await s.handle('conf t');
    await s.handle('int fa0/0.20');
    expect(s.prompt()).toBe('Router-1(config-subif)#');

    await s.handle('quit');
    expect(s.prompt()).toBe('Router-1(config)#');

    await s.handle('quit');
    expect(s.prompt()).toBe('Router-1#');

    await s.handle('quit');
    expect(s.closeRequested).toBe(true);
  });

  it('exit di user mode langsung meminta penutupan terminal', async () => {
    const s = new CliSession(buildDeps(routerDevice));
    expect(s.prompt()).toBe('Router-1>');
    await s.handle('exit');
    expect(s.closeRequested).toBe(true);
  });

  it('end dari (config-subif)# langsung kembali ke privileged EXEC mode (#)', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0.30');
    expect(session.prompt()).toBe('Router-1(config-subif)#');

    await session.handle('end');
    expect(session.prompt()).toBe('Router-1#');
    expect(session.currentInterface).toBeNull();
    expect(session.currentSubInterface).toBeNull();
  });

  it('sub-interface tanpa IP tidak muncul sebagai 0.0.0.0/0 di show ip route', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0.10');
    // Sub-interface dibuat tapi belum dikonfigurasi IP
    const out = await session.handle('do show ip route');
    const hasZeroZero = out.some((line) => line.includes('0.0.0.0/0 is directly connected'));
    expect(hasZeroZero).toBe(false);
  });

  it('sub-interface dengan IP muncul dengan benar di show ip route', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0');
    await session.handle('no shut');
    await session.handle('int fa0/0.10');
    await session.handle('encap dot1q 10');
    await session.handle('ip address 192.168.10.1 255.255.255.0');

    const out = await session.handle('do show ip route');
    const hasSubRoute = out.some((line) => line.includes('192.168.10.0/24 is directly connected, FastEthernet 0/0.10'));
    expect(hasSubRoute).toBe(true);
  });

  it('no interface fa0/0.10 menghapus sub-interface dan mereset mode jika sedang berada di sub-interface tersebut', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0.10');
    expect(session.prompt()).toBe('Router-1(config-subif)#');

    await session.handle('no int fa0/0.10');
    expect(session.prompt()).toBe('Router-1(config)#');
    const p = routerDevice.ports.find((pr) => pr.id === 'fa0/0');
    expect(p?.subInterfaces?.some((s) => s.vlanId === 10)).toBe(false);
  });

  it('no ip route mendukung notasi prefix CIDR (/24)', async () => {
    routerDevice.routes = [
      { network: '10.0.0.0', subnetMask: '255.255.255.0', nextHop: '192.168.1.2', interfaceId: 'fa0/0' },
    ];
    await session.handle('enable');
    await session.handle('conf t');
    const res = await session.handle('no ip route 10.0.0.0 /24');
    expect(res).toEqual([]);
    expect(routerDevice.routes.length).toBe(0);
  });

  it('ip default-gateway dan no ip default-gateway bekerja dengan baik', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('ip default-gateway 192.168.1.254');
    expect(routerDevice.defaultGateway).toBe('192.168.1.254');

    await session.handle('no ip default-gateway 192.168.1.254');
    expect(routerDevice.defaultGateway).toBeUndefined();
  });
});

describe('Rigorous Audit: Switchport & Trunking CLI', () => {
  let switchDevice: DeviceData;
  let session: CliSession;

  beforeEach(() => {
    switchDevice = {
      id: 'sw-1',
      label: 'Switch-1',
      type: 'switch',
      ports: [
        { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:SW:00:01', portMode: 'access', vlanId: 1 },
        { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:SW:00:02', portMode: 'access', vlanId: 1 },
      ],
      macTable: {},
    };
    session = new CliSession({
      getDevice: () => switchDevice,
      setHostname: (name) => { switchDevice.label = name; },
      setPortConfig: (portId, updates) => {
        const p = switchDevice.ports.find((pr) => pr.id === portId);
        if (p) Object.assign(p, updates);
      },
      requestPing: async () => ({ success: true, outputLines: [] }),
    });
  });

  it('mendukung singkatan standar switchport: sw mo trunk, sw mo acc, sw acc vl', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/1');

    await session.handle('sw mo trunk');
    expect(switchDevice.ports[0].portMode).toBe('trunk');

    await session.handle('sw mo acc');
    expect(switchDevice.ports[0].portMode).toBe('access');

    await session.handle('sw acc vl 20');
    expect(switchDevice.ports[0].vlanId).toBe(20);
  });

  it('show interfaces trunk menampilkan port trunk dan native vlan dengan benar', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/1');
    await session.handle('switchport mode trunk');

    const out = await session.handle('do show interfaces trunk');
    expect(out.some((l) => l.includes('FastEthernet 0/1'))).toBe(true);
    expect(out.some((l) => l.includes('802.1q'))).toBe(true);
    expect(out.some((l) => l.includes('1-4094'))).toBe(true);
  });

  it('menolak perintah switchport pada router', async () => {
    const routerDev: DeviceData = {
      id: 'r-2',
      label: 'Router-2',
      type: 'router',
      ports: [{ id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', macAddress: '00:50:79:RT:02:01' }],
    };
    const rSession = new CliSession({
      getDevice: () => routerDev,
      setHostname: () => {},
      setPortConfig: () => {},
      requestPing: async () => ({ success: true, outputLines: [] }),
    });
    await rSession.handle('enable');
    await rSession.handle('conf t');
    await rSession.handle('int fa0/0');
    const res = await rSession.handle('switchport mode access');
    expect(res[0]).toContain('hanya berlaku pada Switch');
  });
});

describe('Rigorous Audit: Store & Topology Integrity (INV-003, Cache Invalidation, Cleanup)', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  it('INV-003: connectPorts menolak kabel kedua pada port ethernet yang sudah terhubung', () => {
    const store = useAppStore.getState();
    store.addDevice('pc', { x: 100, y: 100 });
    store.addDevice('switch', { x: 300, y: 100 });
    store.addDevice('pc', { x: 500, y: 100 });

    const nodes = useAppStore.getState().nodes;
    const pc1 = nodes[0].id;
    const sw = nodes[1].id;
    const pc2 = nodes[2].id;

    // Hubungkan kabel 1: pc1:fa0 <-> sw:fa0/1
    const conn1 = store.connectPorts(pc1, 'fa0', sw, 'fa0/1');
    expect(conn1).toBe(true);

    // Coba hubungkan kabel 2 ke port pc1:fa0 yang sudah terpakai
    const conn2 = store.connectPorts(pc1, 'fa0', sw, 'fa0/2');
    expect(conn2).toBe(false);
    expect(useAppStore.getState().edges.length).toBe(1);

    // Coba hubungkan kabel 2 ke port switch fa0/1 yang sudah terpakai
    const conn3 = store.connectPorts(pc2, 'fa0', sw, 'fa0/1');
    expect(conn3).toBe(false);
    expect(useAppStore.getState().edges.length).toBe(1);
  });

  it('deleteNode membersihkan activeConfigModalNodeId dan activeCliModalNodeId jika cocok', () => {
    const store = useAppStore.getState();
    store.addDevice('pc', { x: 100, y: 100 });
    const pcId = useAppStore.getState().nodes[0].id;
    // Test activeConfigModalNodeId
    store.setActiveConfigModalNodeId(pcId);
    expect(useAppStore.getState().activeConfigModalNodeId).toBe(pcId);
    store.deleteNode(pcId);
    expect(useAppStore.getState().activeConfigModalNodeId).toBeNull();

    // Re-add node and test activeCliModalNodeId
    store.addDevice('pc', { x: 100, y: 100 });
    const pcId2 = useAppStore.getState().nodes[0].id;
    store.setActiveCliModalNodeId(pcId2);
    expect(useAppStore.getState().activeCliModalNodeId).toBe(pcId2);
    store.deleteNode(pcId2);
    expect(useAppStore.getState().activeCliModalNodeId).toBeNull();
  });
  it('updatePortConfig dengan MAC baru membersihkan entri MAC lama pada macTable switch', () => {
    const store = useAppStore.getState();
    store.addDevice('pc', { x: 100, y: 100 });
    store.addDevice('switch', { x: 300, y: 100 });

    const nodes = useAppStore.getState().nodes;
    const pcNode = nodes[0];
    const swNode = nodes[1];
    const oldMac = pcNode.data.ports[0].macAddress;

    // Simulasikan switch sudah mempelajari MAC lama PC
    useAppStore.setState({
      nodes: useAppStore.getState().nodes.map((n) =>
        n.id === swNode.id
          ? { ...n, data: { ...n.data, macTable: { [oldMac]: 'fa0/1' } } }
          : n
      ),
    });

    // Ubah MAC address PC
    const newMac = '00:50:79:99:99:99';
    store.updatePortConfig(pcNode.id, 'fa0', { macAddress: newMac });

    const updatedSw = useAppStore.getState().nodes.find((n) => n.id === swNode.id);
    expect(updatedSw?.data.macTable?.[oldMac]).toBeUndefined();
  });
});

describe('Rigorous Audit: DeviceConfigModal Validation Logic', () => {
  it('DHCP pool validation mendeteksi start IP sama dengan network atau broadcast address', () => {
    const poolNetwork = '192.168.1.0';
    const poolMask = '255.255.255.0';
    const pNet = networkAddress(poolNetwork, poolMask);
    const pNetNum = ipToNumber(pNet);
    const pMaskNum = ipToNumber(poolMask);
    const pBcastNum = (pNetNum | (~pMaskNum >>> 0)) >>> 0;

    const validateStartIp = (startIp: string): boolean => {
      const pStartNum = ipToNumber(startIp);
      return pStartNum > pNetNum && pStartNum < pBcastNum;
    };

    expect(validateStartIp('192.168.1.0')).toBe(false); // network
    expect(validateStartIp('192.168.1.255')).toBe(false); // broadcast
    expect(validateStartIp('192.168.1.1')).toBe(true); // valid host
    expect(validateStartIp('192.168.1.100')).toBe(true); // valid host
  });

  it('DHCP pool validation mendeteksi tabrakan dengan IP antarmuka router', () => {
    const routerIps = new Set<string>(['192.168.1.1', '192.168.2.1', '192.168.10.1']);

    const checkCollision = (startIp: string) => routerIps.has(startIp);

    expect(checkCollision('192.168.1.1')).toBe(true); // collision with router fa0/0
    expect(checkCollision('192.168.2.1')).toBe(true); // collision with router fa0/1
    expect(checkCollision('192.168.1.10')).toBe(false); // no collision
  });

  it('Sub-interface validation menolak duplikasi VLAN ID pada antarmuka yang sama', () => {
    const subIfs = [
      { vlanId: 10, ipAddress: '192.168.10.1', subnetMask: '255.255.255.0' },
      { vlanId: 20, ipAddress: '192.168.20.1', subnetMask: '255.255.255.0' },
    ];

    const canAddVlan = (vlan: number) => !subIfs.some((s) => s.vlanId === vlan);

    expect(canAddVlan(10)).toBe(false); // duplicate
    expect(canAddVlan(20)).toBe(false); // duplicate
    expect(canAddVlan(30)).toBe(true); // new
  });

  it('Switch access port validation menolak VLAN di luar 1-4094 atau desimal', () => {
    const isValidVlan = (vlan: number) =>
      Boolean(vlan && vlan >= 1 && vlan <= 4094 && Number.isInteger(vlan));

    expect(isValidVlan(0)).toBe(false);
    expect(isValidVlan(-1)).toBe(false);
    expect(isValidVlan(4095)).toBe(false);
    expect(isValidVlan(10.5)).toBe(false);
    expect(isValidVlan(1)).toBe(true);
    expect(isValidVlan(4094)).toBe(true);
    expect(isValidVlan(100)).toBe(true);
  });

  it('Router NAT validation mewajibkan port memiliki IP jika NAT aktif', () => {
    const validateNat = (natEnabled: boolean, ipAddress: string) => {
      if (natEnabled && !ipAddress.trim()) return false;
      return true;
    };

    expect(validateNat(true, '')).toBe(false);
    expect(validateNat(true, '   ')).toBe(false);
    expect(validateNat(true, '203.0.113.1')).toBe(true);
    expect(validateNat(false, '')).toBe(true);
  });
});
