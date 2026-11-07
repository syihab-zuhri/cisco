import { describe, expect, it } from 'vitest';
import type { DeviceData, PhysicalPort, TopologyLink } from '../../src/types/network';
import { findIpConflicts } from '../../src/utils/ipConflicts';

const port = (id: string, updates: Partial<PhysicalPort> = {}): PhysicalPort => ({
  id, name: id, status: 'up', kind: 'ethernet', macAddress: '00:50:79:00:00:01', ...updates,
});
const pc = (id: string, updates: Partial<PhysicalPort> = {}): DeviceData => ({
  id, label: id, type: 'pc', ports: [port('fa0', { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', ...updates })],
});
const link = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string): TopologyLink => ({ sourceNodeId, sourcePortId, targetNodeId, targetPortId });

describe('Konflik IP dibatasi segmen Layer 2', () => {
  it('mendeteksi duplikat pada kabel langsung walaupun salah satu interface sedang dimatikan', () => {
    const result = findIpConflicts([pc('a'), pc('b', { status: 'down' })], [link('a', 'fa0', 'b', 'fa0')]);
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('192.168.1.10');
    expect([result[0].first.nodeId, result[0].second.nodeId].sort()).toEqual(['a', 'b']);
  });

  it('dua jaringan terpisah boleh menggunakan alamat yang sama', () => {
    expect(findIpConflicts([pc('a'), pc('b')], [])).toEqual([]);
  });

  it('router tidak meneruskan domain broadcast di antara dua interface', () => {
    const router: DeviceData = { id: 'r', label: 'R', type: 'router', ports: [port('p1'), port('p2')] };
    expect(findIpConflicts([pc('a'), pc('b'), router], [link('a', 'fa0', 'r', 'p1'), link('b', 'fa0', 'r', 'p2')])).toEqual([]);
  });

  it('switch mendeteksi dua host untagged pada VLAN access yang sama', () => {
    const sw: DeviceData = { id: 'sw', label: 'Switch', type: 'switch', ports: [port('p1', { vlanId: 20 }), port('p2', { vlanId: 20 })] };
    expect(findIpConflicts([pc('a'), pc('b'), sw], [link('a', 'fa0', 'sw', 'p1'), link('b', 'fa0', 'sw', 'p2')])).toHaveLength(1);
  });

  it('alamat identik pada VLAN access yang berbeda tidak dianggap konflik', () => {
    const sw: DeviceData = { id: 'sw', label: 'Switch', type: 'switch', ports: [port('p1', { vlanId: 10 }), port('p2', { vlanId: 20 })] };
    expect(findIpConflicts([pc('a'), pc('b'), sw], [link('a', 'fa0', 'sw', 'p1'), link('b', 'fa0', 'sw', 'p2')])).toEqual([]);
  });

  it('IP sub-interface router hanya dibandingkan dengan host di VLAN sub-interface tersebut', () => {
    const router: DeviceData = { id: 'r', label: 'R', type: 'router', ports: [port('trunk', {
      portMode: 'trunk', subInterfaces: [{ vlanId: 10, ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' }],
    })] };
    const sw: DeviceData = { id: 'sw', label: 'Switch', type: 'switch', ports: [port('p1', { vlanId: 10 }), port('p2', { vlanId: 20 }), port('p3', { portMode: 'trunk' })] };
    const result = findIpConflicts([pc('a'), pc('b'), router, sw], [link('a', 'fa0', 'sw', 'p1'), link('b', 'fa0', 'sw', 'p2'), link('r', 'trunk', 'sw', 'p3')]);
    expect(result).toHaveLength(1);
    expect([result[0].first.nodeId, result[0].second.nodeId].sort()).toEqual(['a', 'r']);
  });

  it('radio AP satu-ke-banyak tetap mendeteksi konflik antarklien', () => {
    const ap: DeviceData = { id: 'ap', label: 'AP', type: 'accessPoint', ports: [port('radio0', { kind: 'wireless', ssid: 'Lab' })] };
    const clients = [pc('a', { kind: 'wireless', ssid: 'Lab' }), pc('b', { kind: 'wireless', ssid: 'Lab' })];
    const links = [link('a', 'fa0', 'ap', 'radio0'), link('b', 'fa0', 'ap', 'radio0')].map((l) => ({ ...l, kind: 'wireless' as const }));
    expect(findIpConflicts([...clients, ap], links)).toHaveLength(1);
  });
});
