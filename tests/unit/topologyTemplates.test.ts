import { describe, it, expect } from 'vitest';
import { TOPOLOGY_TEMPLATES } from '../../src/data/topologyTemplates';

/**
 * Uji integritas data template: setiap edge harus merujuk node & port yang
 * benar-benar ada, port terkait harus UP, dan referensi connectedEdgeId
 * harus konsisten dua arah — agar template selalu langsung bisa diping.
 */
describe('Integritas template topologi', () => {
  it('setiap edge merujuk node & port yang ada, port UP, binding konsisten', () => {
    expect(TOPOLOGY_TEMPLATES.length).toBeGreaterThanOrEqual(16);

    for (const tpl of TOPOLOGY_TEMPLATES) {
      const byId = new Map(tpl.nodes.map((n) => [n.id, n]));

      for (const edge of tpl.edges) {
        const ctx = `${tpl.id} / edge ${edge.id}`;
        const src = byId.get(edge.source);
        const tgt = byId.get(edge.target);
        expect(src, `${ctx}: node sumber ada`).toBeDefined();
        expect(tgt, `${ctx}: node target ada`).toBeDefined();

        const srcPort = src!.data.ports.find((p) => p.id === edge.sourceHandle);
        const tgtPort = tgt!.data.ports.find((p) => p.id === edge.targetHandle);
        expect(srcPort, `${ctx}: port sumber ${edge.sourceHandle} ada`).toBeDefined();
        expect(tgtPort, `${ctx}: port target ${edge.targetHandle} ada`).toBeDefined();

        expect(srcPort!.status, `${ctx}: port sumber UP`).toBe('up');
        expect(tgtPort!.status, `${ctx}: port target UP`).toBe('up');

        // INV-003 + amandemen nirkabel: port ethernet wajib terikat 1-to-1;
        // port wireless boleh tak terikat (radio AP 1-ke-N), tapi bila terikat harus konsisten.
        const checkBinding = (
          side: 'sumber' | 'target',
          port: NonNullable<typeof srcPort>,
          peerId: string
        ) => {
          if (port.kind !== 'wireless') {
            expect(port.connectedEdgeId, `${ctx}: binding ${side} konsisten`).toBe(edge.id);
          } else if (port.connectedEdgeId !== undefined) {
            expect(port.connectedEdgeId, `${ctx}: binding wireless ${side} konsisten`).toBe(edge.id);
          }
          if (port.connectedToNodeId !== undefined) {
            expect(port.connectedToNodeId, `${ctx}: peer ${side} konsisten`).toBe(peerId);
          }
        };
        checkBinding('sumber', srcPort!, tgt!.id);
        checkBinding('target', tgtPort!, src!.id);
      }
    }
  });

  it('id template unik dan kategori valid', () => {
    const ids = TOPOLOGY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const validCategories = ['Dasar', 'LAN', 'Routing L3', 'Enterprise', 'Nirkabel'];
    for (const t of TOPOLOGY_TEMPLATES) {
      expect(validCategories).toContain(t.category);
    }
  });

  it('template dual-router memiliki static route agar ping antar-site berfungsi', () => {
    const tpl = TOPOLOGY_TEMPLATES.find((t) => t.id === 'two-routers-wan');
    expect(tpl).toBeDefined();
    const r1 = tpl!.nodes.find((n) => n.id === 'r1-sitea');
    const r2 = tpl!.nodes.find((n) => n.id === 'r2-siteb');
    expect(r1!.data.routes?.length ?? 0).toBeGreaterThan(0);
    expect(r2!.data.routes?.length ?? 0).toBeGreaterThan(0);
  });
});
