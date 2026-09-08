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

  it('semua template dapat dimuat ke simulation engine dan diping tanpa error', async () => {
    const { HeadlessSimulationEngine } = await import('../../src/engine/simulationEngine');
    const { runTestAll } = await import('../../src/utils/testAllRunner');
    expect(TOPOLOGY_TEMPLATES.length).toBeGreaterThanOrEqual(16);

    for (const tpl of TOPOLOGY_TEMPLATES) {
      const engine = new HeadlessSimulationEngine();
      const devices = tpl.nodes.map((n) => n.data);
      const links = tpl.edges.map((e) => ({
        sourceNodeId: e.source,
        sourcePortId: e.sourceHandle!,
        targetNodeId: e.target,
        targetPortId: e.targetHandle!,
      }));

      expect(() => engine.setTopology(devices, links)).not.toThrow();

      // Verify runTestAll runs cleanly across every template without crash
      expect(() => runTestAll(devices, links, ['ping', 'gateway'])).not.toThrow();

      const hosts = devices.filter((d) => d.ports.some((p) => p.ipAddress && p.status === 'up'));
      if (hosts.length >= 2) {
        const src = hosts[0];
        const dst = hosts[1];
        const targetIp = dst.ports.find((p) => p.ipAddress && p.status === 'up')?.ipAddress;
        if (targetIp) {
          const res = await engine.executePing(src.id, targetIp);
          expect(res).toBeDefined();
          expect(res.outputLines.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('semua skenario lab (3 lab) dapat dimuat ke engine dan dievaluasi tanpa error', async () => {
    const { LAB_SCENARIOS, evaluateLab } = await import('../../src/data/labs');
    const { HeadlessSimulationEngine } = await import('../../src/engine/simulationEngine');
    expect(LAB_SCENARIOS.length).toBeGreaterThanOrEqual(3);

    for (const lab of LAB_SCENARIOS) {
      const engine = new HeadlessSimulationEngine();
      const devices = lab.nodes.map((n) => n.data);
      const links = lab.edges.map((e) => ({
        sourceNodeId: e.source,
        sourcePortId: e.sourceHandle!,
        targetNodeId: e.target,
        targetPortId: e.targetHandle!,
      }));

      expect(() => engine.setTopology(devices, links)).not.toThrow();
      const evalResult = evaluateLab(lab, { nodes: lab.nodes, lastPing: null });
      expect(evalResult).toBeDefined();
      for (const obj of lab.objectives) {
        expect(typeof evalResult[obj.id]).toBe('boolean');
      }
    }
  });
});
