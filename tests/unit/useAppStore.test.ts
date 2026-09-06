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

describe('useAppStore — asosiasi WiFi (INV-003 amandemen: radio 1-ke-N)', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  function addClientAndAp(clientSsid = 'OpenPacket-WiFi') {
    const store = useAppStore.getState();
    store.addDevice('laptop', { x: 0, y: 0 });
    store.addDevice('accessPoint', { x: 200, y: 0 });
    const { nodes } = useAppStore.getState();
    const laptop = nodes.find((n) => n.data.type === 'laptop')!;
    const ap = nodes.find((n) => n.data.type === 'accessPoint')!;
    if (clientSsid !== undefined) {
      store.updatePortConfig(laptop.id, 'wla0', { ssid: clientSsid });
    }
    return { laptop, ap };
  }

  it('SSID cocok → asosiasi terbentuk, wla0 UP, edge wirelessLink dibuat', () => {
    const { laptop, ap } = addClientAndAp();
    const ok = useAppStore.getState().associateWireless(laptop.id, 'wla0', ap.id, 'radio0');
    expect(ok).toBe(true);

    const state = useAppStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0].type).toBe('wirelessLink');
    const wla0 = state.nodes.find((n) => n.id === laptop.id)!.data.ports.find((p) => p.id === 'wla0')!;
    expect(wla0.status).toBe('up');
    expect(wla0.connectedEdgeId).toBe(state.edges[0].id);
    // Radio AP tidak menyimpan binding (1-ke-N)
    const radio = state.nodes.find((n) => n.id === ap.id)!.data.ports.find((p) => p.id === 'radio0')!;
    expect(radio.connectedEdgeId).toBeUndefined();
    expect(radio.status).toBe('up');
  });

  it('SSID tidak cocok → asosiasi ditolak', () => {
    const { laptop, ap } = addClientAndAp('SsidLain');
    const ok = useAppStore.getState().associateWireless(laptop.id, 'wla0', ap.id, 'radio0');
    expect(ok).toBe(false);
    expect(useAppStore.getState().edges).toHaveLength(0);
  });

  it('radio AP melayani banyak klien sekaligus (1-ke-N)', () => {
    const store = useAppStore.getState();
    store.addDevice('accessPoint', { x: 200, y: 0 });
    store.addDevice('laptop', { x: 0, y: 0 });
    store.addDevice('laptop', { x: 0, y: 100 });
    const nodes = useAppStore.getState().nodes;
    const ap = nodes.find((n) => n.data.type === 'accessPoint')!;
    const laptops = nodes.filter((n) => n.data.type === 'laptop');
    for (const lap of laptops) {
      store.updatePortConfig(lap.id, 'wla0', { ssid: 'OpenPacket-WiFi' });
      expect(store.associateWireless(lap.id, 'wla0', ap.id, 'radio0')).toBe(true);
    }
    expect(useAppStore.getState().edges.filter((e) => e.type === 'wirelessLink')).toHaveLength(2);
  });

  it('disconnectEdge asosiasi hanya menurunkan sisi klien; radio AP tetap up', () => {
    const { laptop, ap } = addClientAndAp();
    useAppStore.getState().associateWireless(laptop.id, 'wla0', ap.id, 'radio0');
    const edgeId = useAppStore.getState().edges[0].id;

    useAppStore.getState().disconnectEdge(edgeId);

    const state = useAppStore.getState();
    const wla0 = state.nodes.find((n) => n.id === laptop.id)!.data.ports.find((p) => p.id === 'wla0')!;
    const radio = state.nodes.find((n) => n.id === ap.id)!.data.ports.find((p) => p.id === 'radio0')!;
    expect(wla0.status).toBe('down');
    expect(radio.status).toBe('up'); // radio tetap menyala
    expect(state.edges).toHaveLength(0);
  });

  it('syncWirelessAssociation: SSID baru memindahkan klien; SSID kosong memutus', () => {
    const { laptop, ap } = addClientAndAp();
    useAppStore.getState().associateWireless(laptop.id, 'wla0', ap.id, 'radio0');
    expect(useAppStore.getState().edges).toHaveLength(1);

    // SSID dikosongkan → asosiasi diputus
    useAppStore.getState().updatePortConfig(laptop.id, 'wla0', { ssid: '' });
    useAppStore.getState().syncWirelessAssociation(laptop.id, 'wla0');
    expect(useAppStore.getState().edges).toHaveLength(0);

    // SSID cocok lagi → asosiasi terbentuk kembali
    useAppStore.getState().updatePortConfig(laptop.id, 'wla0', { ssid: 'OpenPacket-WiFi' });
    useAppStore.getState().syncWirelessAssociation(laptop.id, 'wla0');
    expect(useAppStore.getState().edges).toHaveLength(1);
  });

  it('connectPorts menolak port nirkabel', () => {
    const { laptop, ap } = addClientAndAp();
    expect(useAppStore.getState().connectPorts(laptop.id, 'wla0', ap.id, 'radio0')).toBe(false);
    expect(useAppStore.getState().edges).toHaveLength(0);
  });
});

describe('useAppStore — anotasi kanvas (square & teks, v1.4.0)', () => {
  beforeEach(() => {
    useAppStore.getState().resetTopology();
  });

  it('addSquare membuat node anotasi dengan zIndex -1 (di belakang perangkat)', () => {
    useAppStore.getState().addSquare({ x: 100, y: 100 });
    const sq = useAppStore.getState().nodes[0];
    expect(sq.type).toBe('squareNode');
    expect(sq.zIndex).toBe(-1);
    expect(sq.data.nodeKind).toBe('square');
    expect(sq.data.ports).toHaveLength(0); // bukan perangkat — tanpa port
    expect(sq.data.width).toBeGreaterThan(0);
  });

  it('updateAnnotation mengubah warna & ukuran square', () => {
    useAppStore.getState().addSquare({ x: 0, y: 0 });
    const id = useAppStore.getState().nodes[0].id;
    useAppStore.getState().updateAnnotation(id, {
      fill: 'rgba(239,68,68,0.14)',
      stroke: '#EF4444',
      width: 420,
      height: 300,
    });
    const sq = useAppStore.getState().nodes[0].data;
    expect(sq.fill).toBe('rgba(239,68,68,0.14)');
    expect(sq.stroke).toBe('#EF4444');
    expect(sq.width).toBe(420);
    expect(sq.height).toBe(300);
  });

  it('addText membuat teks default; updateAnnotation mengubah isi & font', () => {
    useAppStore.getState().addText({ x: 0, y: 0 });
    const textNode = useAppStore.getState().nodes[0];
    expect(textNode.type).toBe('textNoteNode');
    expect(textNode.data.nodeKind).toBe('text');
    expect(textNode.data.text).toBe('Catatan');
    expect(textNode.data.fontSize).toBe(14);

    useAppStore.getState().updateAnnotation(textNode.id, { text: 'LAN A', fontSize: 22 });
    const updated = useAppStore.getState().nodes[0].data;
    expect(updated.text).toBe('LAN A');
    expect(updated.fontSize).toBe(22);
  });
});
