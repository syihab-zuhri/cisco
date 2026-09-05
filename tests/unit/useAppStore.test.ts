import { beforeEach, describe, it, expect } from 'vitest';
import { useAppStore } from '../../src/store/useAppStore';
import { type Node } from '@xyflow/react';
import { type DeviceData } from '../../src/types/network';

/**
 * Regresi: menghapus satu dari dua perangkat yang terkabel harus menurunkan
 * port perangkat yang TERSISA ke 'down'. Bug lama: deleteNode memakai snapshot
 * `nodes` lama sehingga reset status port tertimpa dan port tetap 'up'.
 */
describe('useAppStore — integritas status port saat penghapusan perangkat', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  function addLabeledLaptops(): [Node<DeviceData>, Node<DeviceData>] {
    const store = useAppStore.getState();
    store.addDevice('laptop', { x: 0, y: 0 });
    store.addDevice('laptop', { x: 200, y: 0 });
    const { nodes } = useAppStore.getState();
    return nodes as [Node<DeviceData>, Node<DeviceData>];
  }

  it('port perangkat tersisa kembali DOWN ketika tetangganya dihapus', () => {
    const [a, b] = addLabeledLaptops();

    expect(useAppStore.getState().connectPorts(a.id, 'fa0', b.id, 'fa0')).toBe(true);
    expect(useAppStore.getState().nodes.find((n) => n.id === a.id)!.data.ports[0].status).toBe('up');

    useAppStore.getState().deleteNode(b.id);

    const remaining = useAppStore.getState().nodes.find((n) => n.id === a.id)!;
    expect(remaining.data.ports[0].status).toBe('down');
    expect(remaining.data.ports[0].connectedEdgeId).toBeUndefined();
    expect(remaining.data.ports[0].connectedToNodeId).toBeUndefined();
    expect(useAppStore.getState().edges).toHaveLength(0);
  });

  it('menghapus node terakhir dari dua kabel tetap menurunkan semua port lawan', () => {
    const [a, b] = addLabeledLaptops();
    expect(useAppStore.getState().connectPorts(a.id, 'fa0', b.id, 'fa0')).toBe(true);

    useAppStore.getState().deleteNode(a.id);

    const remaining = useAppStore.getState().nodes.find((n) => n.id === b.id)!;
    expect(remaining.data.ports[0].status).toBe('down');
    expect(useAppStore.getState().edges).toHaveLength(0);
  });

  it('menghapus perangkat tanpa kabel tidak mengubah perangkat lain', () => {
    const [a, b] = addLabeledLaptops();
    // kabel A-B, lalu tambah C yang tidak terkabel
    useAppStore.getState().connectPorts(a.id, 'fa0', b.id, 'fa0');
    useAppStore.getState().addDevice('laptop', { x: 400, y: 0 });
    const c = useAppStore.getState().nodes[2];

    useAppStore.getState().deleteNode(c.id);

    const nodeA = useAppStore.getState().nodes.find((n) => n.id === a.id)!;
    expect(nodeA.data.ports[0].status).toBe('up');
    expect(useAppStore.getState().nodes).toHaveLength(2);
  });
});
