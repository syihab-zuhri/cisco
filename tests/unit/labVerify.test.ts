import { describe, it, expect } from 'vitest';
import { evaluateLab, LAB_SCENARIOS, type LabScenario } from '../../src/data/labs';
import { type Node } from '@xyflow/react';
import { type DeviceData } from '../../src/types/network';

function nodeWith(id: string, data: Partial<DeviceData>): Node<DeviceData> {
  return {
    id,
    type: 'deviceNode',
    position: { x: 0, y: 0 },
    data: {
      id,
      label: id,
      type: 'pc',
      ports: [],
      arpTable: {},
      ...data,
    } as DeviceData,
  };
}

function labWith(checks: LabScenario['objectives']): LabScenario {
  return {
    id: 'test-lab',
    title: 'Test',
    story: '',
    difficulty: 'Dasar',
    nodes: [],
    edges: [],
    objectives: checks,
    hints: [],
  };
}

describe('evaluateLab (verifikasi otomatis Mode Lab)', () => {
  it('LAB_SCENARIOS punya 3 lab dengan objektif & topologi valid', () => {
    expect(LAB_SCENARIOS).toHaveLength(3);
    for (const lab of LAB_SCENARIOS) {
      expect(lab.objectives.length).toBeGreaterThan(0);
      expect(lab.hints.length).toBeGreaterThan(0);
      const ids = new Set(lab.nodes.map((n) => n.id));
      for (const o of lab.objectives) {
        if ('deviceId' in o.check) {
          expect(ids.has(o.check.deviceId), `${lab.id}: deviceId objektif ada`).toBe(true);
        }
        if (o.check.type === 'ping-success') {
          expect(ids.has(o.check.sourceNodeId), `${lab.id}: source ping ada`).toBe(true);
        }
      }
      for (const e of lab.edges) {
        expect(ids.has(e.source) && ids.has(e.target), `${lab.id}: edge ${e.id} merujuk node ada`).toBe(true);
      }
    }
  });

  it('gateway: terverifikasi hanya bila nilainya persis', () => {
    const lab = labWith([
      { id: 'gw', description: '', check: { type: 'gateway', deviceId: 'pc-1', gateway: '192.168.1.1' } },
    ]);
    const wrong = evaluateLab(lab, {
      nodes: [nodeWith('pc-1', { defaultGateway: '192.168.1.99' })],
    });
    expect(wrong.gw).toBe(false);

    const fixed = evaluateLab(lab, {
      nodes: [nodeWith('pc-1', { defaultGateway: '192.168.1.1' })],
    });
    expect(fixed.gw).toBe(true);
  });

  it('ping-success: butuh source, target, dan status sukses yang cocok', () => {
    const lab = labWith([
      { id: 'p', description: '', check: { type: 'ping-success', sourceNodeId: 'pc-1', targetIp: '8.8.8.8' } },
    ]);
    const nodes = [nodeWith('pc-1', {})];
    expect(evaluateLab(lab, { nodes, lastPing: null }).p).toBe(false);
    expect(
      evaluateLab(lab, { nodes, lastPing: { sourceNodeId: 'pc-1', targetIp: '8.8.8.8', success: false } }).p
    ).toBe(false);
    expect(
      evaluateLab(lab, { nodes, lastPing: { sourceNodeId: 'pc-2', targetIp: '8.8.8.8', success: true } }).p
    ).toBe(false);
    expect(
      evaluateLab(lab, { nodes, lastPing: { sourceNodeId: 'pc-1', targetIp: '8.8.8.8', success: true } }).p
    ).toBe(true);
  });

  it('nat-entry & route-learned membaca tabel perangkat', () => {
    const lab = labWith([
      { id: 'nat', description: '', check: { type: 'nat-entry', deviceId: 'r-1' } },
      { id: 'rip', description: '', check: { type: 'route-learned', deviceId: 'r-1', network: '192.168.20.0' } },
    ]);
    const empty = evaluateLab(lab, { nodes: [nodeWith('r-1', { type: 'router' })] });
    expect(empty.nat).toBe(false);
    expect(empty.rip).toBe(false);

    const filled = evaluateLab(lab, {
      nodes: [
        nodeWith('r-1', {
          type: 'router',
          natTable: [{ insideIp: '192.168.10.20', globalIp: '203.0.113.1', icmpId: 1, echoSeq: 1 }],
          routes: [
            { network: '192.168.20.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2', interfaceId: 'fa0/1', metric: 2, source: 'rip' },
          ],
        }),
      ],
    });
    expect(filled.nat).toBe(true);
    expect(filled.rip).toBe(true);
  });
});
