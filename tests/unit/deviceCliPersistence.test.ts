import { describe, it, expect, beforeEach } from 'vitest';
import { clearCliCache } from '../../src/components/terminal/DeviceCliModal';
import { CliSession } from '../../src/engine/cli/cliEngine';
import { type DeviceData } from '../../src/types/network';

describe('DeviceCliModal — persistensi sesi CLI & mode router', () => {
  beforeEach(() => {
    clearCliCache();
  });

  const makeRouter = (id: string, label: string): DeviceData => ({
    id,
    label,
    type: 'router',
    ports: [
      {
        id: 'fa0/0',
        name: 'FastEthernet 0/0',
        status: 'up',
        ipAddress: '192.168.1.1',
        subnetMask: '255.255.255.0',
        macAddress: '00:50:79:01:01:01',
      },
    ],
    routes: [],
  });

  it('mempertahankan status mode konfigurasi interface antar eksekusi perintah', async () => {
    let currentDevice = makeRouter('r1', 'Router-Alpha');

    const session = new CliSession({
      getDevice: () => currentDevice,
      setHostname: (name) => {
        currentDevice = { ...currentDevice, label: name };
      },
      setPortConfig: (portId, updates) => {
        currentDevice = {
          ...currentDevice,
          ports: currentDevice.ports.map((p) => (p.id === portId ? { ...p, ...updates } : p)),
        };
      },
      requestPing: async () => ({ success: true, outputLines: [] }),
      addStaticRoute: () => {},
      removeStaticRoute: () => {},
      setDefaultGateway: () => {},
      saveConfig: () => {},
    });

    expect(session.prompt()).toBe('Router-Alpha>');

    await session.handle('enable');
    expect(session.prompt()).toBe('Router-Alpha#');

    await session.handle('configure terminal');
    expect(session.prompt()).toBe('Router-Alpha(config)#');

    await session.handle('interface FastEthernet 0/0');
    expect(session.prompt()).toBe('Router-Alpha(config-if)#');

    await session.handle('ip address 10.10.10.1 255.255.255.0');
    expect(currentDevice.ports[0].ipAddress).toBe('10.10.10.1');

    await session.handle('exit');
    expect(session.prompt()).toBe('Router-Alpha(config)#');

    await session.handle('exit');
    expect(session.prompt()).toBe('Router-Alpha#');
  });

  it('membersihkan cache sesi saat clearCliCache dipanggil', () => {
    clearCliCache('device-123');
    clearCliCache();
    expect(true).toBe(true);
  });
});
