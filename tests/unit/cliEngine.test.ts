import { describe, it, expect, beforeEach } from 'vitest';
import { CliSession, type CliSessionDeps } from '../../src/engine/cli/cliEngine';
import { type DeviceData } from '../../src/types/network';

describe('CliSession (Mini Cisco IOS, 10 perintah P0)', () => {
  let device: DeviceData;
  let portUpdates: Array<{ portId: string; updates: Record<string, unknown> }>;
  let session: CliSession;

  const buildDeps = (): CliSessionDeps => ({
    getDevice: () => device,
    setHostname: (name) => {
      device.label = name;
    },
    setPortConfig: (portId, updates) => {
      portUpdates.push({ portId, updates });
    },
    requestPing: async (targetIp) => ({
      success: true,
      outputLines: [
        'Type escape sequence to abort.',
        `Sending 5, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:`,
        '!!!!!',
        'Success rate is 100 percent (5/5)',
      ],
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

  it('transisi mode: user -> priv -> config -> config-if -> end', async () => {
    expect(session.prompt()).toBe('Router-1>');

    await session.handle('enable');
    expect(session.prompt()).toBe('Router-1#');

    await session.handle('conf t');
    expect(session.prompt()).toBe('Router-1(config)#');

    await session.handle('int fa0/0');
    expect(session.prompt()).toBe('Router-1(config-if)#');
    expect(session.currentInterface).toBe('fa0/0');

    await session.handle('end');
    expect(session.prompt()).toBe('Router-1#');
  });

  it('hostname mengubah label perangkat (sinkron dengan store)', async () => {
    await session.handle('enable');
    await session.handle('configure terminal');
    const lines = await session.handle('hostname R1');
    expect(device.label).toBe('R1');
    expect(lines.join(' ')).toContain('R1');
  });

  it('ip address memvalidasi format sebelum menyimpan', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0');

    const badIp = await session.handle('ip address 999.1.1.1 255.255.255.0');
    expect(badIp.join(' ')).toContain('Invalid IP address');
    expect(portUpdates).toHaveLength(0);

    const badMask = await session.handle('ip address 192.168.1.1 255.0.255.0');
    expect(badMask.join(' ')).toContain('Invalid subnet mask');
    expect(portUpdates).toHaveLength(0);

    const ok = await session.handle('ip address 192.168.1.1 255.255.255.0');
    expect(ok.join(' ')).toContain('192.168.1.1');
    expect(portUpdates).toEqual([
      { portId: 'fa0/0', updates: { ipAddress: '192.168.1.1', subnetMask: '255.255.255.0' } },
    ]);

    await session.handle('no shut');
    expect(portUpdates[1]).toEqual({ portId: 'fa0/0', updates: { status: 'up' } });
  });

  it('show ip interface brief menampilkan status semua port', async () => {
    await session.handle('enable');
    const lines = await session.handle('sh ip int br');
    const text = lines.join('\n');
    expect(text).toContain('FastEthernet 0/0');
    expect(text).toContain('unassigned');
    expect(text).toContain('administratively down');
  });

  it('show ip route hanya aktif pada router', async () => {
    await session.handle('enable');
    device.ports[0] = { ...device.ports[0], ipAddress: '192.168.1.1', subnetMask: '255.255.255.0' };

    const routerLines = await session.handle('show ip route');
    expect(routerLines.join('\n')).toContain('192.168.1.0\/24 is directly connected');

    device.type = 'pc';
    const pcLines = await session.handle('show ip route');
    expect(pcLines.join(' ')).toContain('IP routing not enabled');
  });

  it('ping meneruskan eksekusi ke simulation engine dan mencetak output IOS', async () => {
    await session.handle('enable');
    const lines = await session.handle('ping 192.168.1.20');
    expect(lines[0]).toBe('Type escape sequence to abort.');
    expect(lines.join('\n')).toContain('192.168.1.20');
    expect(lines.join('\n')).toContain('Success rate is 100 percent (5/5)');

    const invalid = await session.handle('ping bukan-ip');
    expect(invalid.join(' ')).toContain('Invalid IP address');

    const incomplete = await session.handle('ping');
    expect(incomplete.join(' ')).toContain('Incomplete command');
  });

  it('exit bertingkat dan menutup sesi dari user mode', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    await session.handle('int fa0/0');
    await session.handle('exit');
    expect(session.prompt()).toBe('Router-1(config)#');
    await session.handle('exit');
    expect(session.prompt()).toBe('Router-1#');
    await session.handle('exit');
    expect(session.prompt()).toBe('Router-1>');
    await session.handle('exit');
    expect(session.closeRequested).toBe(true);
  });
});

describe('CliSession tambahan', () => {
  let device: DeviceData;
  let session: CliSession;

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
    session = new CliSession({
      getDevice: () => device,
      setHostname: (name) => {
        device.label = name;
      },
      setPortConfig: () => {},
      requestPing: async () => ({ success: true, outputLines: [] }),
    });
  });

  it('show mac-address-table & show arp menampilkan isi tabel', async () => {
    device.macTable = { '00:50:79:AA:BB:01': 'fa0/1' };
    device.arpTable = { '192.168.1.10': '00:50:79:AA:BB:01' };
    await session.handle('enable');
    const macLines = await session.handle('sh mac');
    expect(macLines.join('\n')).toContain('00:50:79:aa:bb:01');
    expect(macLines.join('\n')).toContain('fa0/1');

    const arpLines = await session.handle('show arp');
    expect(arpLines.join('\n')).toContain('192.168.1.10');
    expect(arpLines.join('\n')).toContain('ARPA');
  });

  it('interface tidak valid menampilkan daftar port yang tersedia', async () => {
    await session.handle('enable');
    await session.handle('conf t');
    const lines = await session.handle('int fa9/9');
    expect(lines.join(' ')).toContain('Invalid interface "fa9/9"');
    expect(lines.join(' ')).toContain('fa0/0, fa0/1');
  });

  it('perintah tidak dikenal memberi pesan IOS-style', async () => {
    await session.handle('enable');
    const lines = await session.handle('reload');
    expect(lines[0]).toMatch(/^%/);
  });
});
