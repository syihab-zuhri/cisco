import { describe, expect, it } from 'vitest';
import { runTestAll } from '../../src/utils/testAllRunner';
import type { DeviceData, TopologyLink } from '../../src/types/network';

function pc(id: string, label: string, ip: string, gateway?: string): DeviceData {
  return {
    id,
    label,
    type: 'pc',
    ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', macAddress: `00:50:79:00:00:${id.slice(-2)}`, ipAddress: ip, subnetMask: '255.255.255.0' }],
    defaultGateway: gateway,
    arpTable: {},
  };
}

function sw(id: string, label: string): DeviceData {
  return {
    id,
    label,
    type: 'switch',
    ports: [
      { id: 'fa0/1', name: 'Fa0/1', status: 'up', macAddress: '00:50:79:AA:AA:A1' },
      { id: 'fa0/2', name: 'Fa0/2', status: 'up', macAddress: '00:50:79:AA:AA:A2' },
    ],
    macTable: {},
    arpTable: {},
  };
}

describe('testAllRunner', () => {
  it('ping matrix lolos semua pada LAN sehat', () => {
    const devices = [pc('pc-1', 'PC-1', '192.168.1.10'), pc('pc-2', 'PC-2', '192.168.1.20'), sw('sw-1', 'SW-1')];
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'pc-2', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
    ];
    const res = runTestAll(devices, links, ['ping']);
    expect(res.pingFail).toBe(0);
    expect(res.pingPass).toBeGreaterThan(0);
    expect(res.pingRows.length).toBe(res.pingPass);
  });

  it('ping matrix gagal bila kabel putus (port DOWN)', () => {
    const a = pc('pc-1', 'PC-1', '192.168.1.10');
    const b = pc('pc-2', 'PC-2', '192.168.1.20');
    b.ports[0].status = 'down';
    const devices = [a, b, sw('sw-1', 'SW-1')];
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'pc-2', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
    ];
    const res = runTestAll(devices, links, ['ping']);
    expect(res.pingFail).toBeGreaterThan(0);
    expect(res.pingRows.some((r) => !r.success && r.error)).toBe(true);
  });

  it('gateway & dhcp & rip suite berjalan', () => {
    const devices = [
      pc('pc-1', 'PC-1', '192.168.1.10', '192.168.1.1'),
      {
        id: 'r-1', label: 'R-1', type: 'router' as const, ripEnabled: true,
        ports: [{ id: 'fa0/0', name: 'Fa0/0', status: 'up' as const, macAddress: '00:50:79:BB:BB:B1', ipAddress: '192.168.1.1', subnetMask: '255.255.255.0' }],
        routes: [], arpTable: {},
      },
      sw('sw-1', 'SW-1'),
    ];
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
      { sourceNodeId: 'r-1', sourcePortId: 'fa0/0', targetNodeId: 'sw-1', targetPortId: 'fa0/2' },
    ];
    const res = runTestAll(devices, links, ['gateway', 'dhcp', 'rip']);
    expect(res.gatewayRows.length).toBe(1);
    expect(res.gatewayRows[0].success).toBe(true);
    expect(res.ripOutput.length).toBeGreaterThan(0);
  });

  it('tidak memutasi topologi input', () => {
    const devices = [pc('pc-1', 'PC-1', '192.168.1.10'), pc('pc-2', 'PC-2', '192.168.1.20'), sw('sw-1', 'SW-1')];
    const links: TopologyLink[] = [
      { sourceNodeId: 'pc-1', sourcePortId: 'fa0', targetNodeId: 'sw-1', targetPortId: 'fa0/1' },
    ];
    const before = JSON.stringify(devices);
    runTestAll(devices, links, ['ping', 'rip']);
    expect(JSON.stringify(devices)).toBe(before);
  });
});
