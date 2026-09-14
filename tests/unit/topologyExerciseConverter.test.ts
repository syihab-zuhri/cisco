import { describe, it, expect } from 'vitest';
import {
  isTopologyJson,
  convertTopologyToExercise,
} from '../../src/features/classroom/topologyExerciseConverter';
import { parseExerciseJson } from '../../src/features/classroom/exerciseParser';

describe('Topology to Exercise Converter Suite', () => {
  // Mock data seperti file openpacket-topology-1789365223334.json milik user
  const sampleTeacherTopology = {
    nodes: [
      {
        id: 'pc-1',
        type: 'deviceNode',
        position: { x: 100, y: 100 },
        data: {
          id: 'pc-1',
          label: 'PC-1',
          type: 'pc',
          ports: [
            {
              id: 'fa0',
              name: 'FastEthernet 0',
              status: 'up',
            },
          ],
        },
      },
      {
        id: 'pc-2',
        type: 'deviceNode',
        position: { x: 300, y: 100 },
        data: {
          id: 'pc-2',
          label: 'PC-2',
          type: 'pc',
          ports: [
            {
              id: 'fa0',
              name: 'FastEthernet 0',
              status: 'up',
              ipAddress: '111.111.3.1',
              subnetMask: '255.255.255.0',
            },
          ],
        },
      },
      {
        id: 'pc-3',
        type: 'deviceNode',
        position: { x: 500, y: 100 },
        data: {
          id: 'pc-3',
          label: 'PC-3',
          type: 'pc',
          ports: [
            {
              id: 'fa0',
              name: 'FastEthernet 0',
              status: 'up',
            },
          ],
        },
      },
      {
        id: 'hub-1',
        type: 'deviceNode',
        position: { x: 300, y: 300 },
        data: {
          id: 'hub-1',
          label: 'Hub-1',
          type: 'hub',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up' },
          ],
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'pc-1',
        target: 'hub-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/1',
      },
      {
        id: 'edge-2',
        source: 'pc-2',
        target: 'hub-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/2',
      },
      {
        id: 'edge-3',
        source: 'pc-3',
        target: 'hub-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/3',
      },
    ],
  };

  it('mengidentifikasi format JSON topologi dengan benar', () => {
    expect(isTopologyJson(sampleTeacherTopology)).toBe(true);
    expect(isTopologyJson({ foo: 'bar' })).toBe(false);
    expect(isTopologyJson(null)).toBe(false);
  });

  it('mengonversi topologi guru menjadi objek Exercise lengkap dengan target', () => {
    const exercise = convertTopologyToExercise(sampleTeacherTopology);

    expect(exercise).toBeDefined();
    expect(exercise.title).toContain('Tantangan Topologi Guru');
    expect(exercise.starterTopology).toBeDefined();
    expect(exercise.starterTopology?.nodes.length).toBe(4);
    expect(exercise.starterTopology?.edges.length).toBe(3);

    // Harus mendeteksi 3 target kabel
    const linkTargets = exercise.targets.filter((t) => t.type === 'link_exists');
    expect(linkTargets.length).toBe(3);

    // Harus mendeteksi 1 target konfigurasi IP pada PC-2
    const ipTargets = exercise.targets.filter((t) => t.type === 'device_config');
    expect(ipTargets.length).toBe(1);
    if (ipTargets[0].type === 'device_config') {
      expect(ipTargets[0].deviceId).toBe('PC-2');
      expect(ipTargets[0].address).toBe('111.111.3.1');
      expect(ipTargets[0].subnetMask).toBe('255.255.255.0');
    }

    // Instruksi harus berisi panduan langkah praktikum
    expect(exercise.instructions).toContain('111.111.3.1');
    expect(exercise.instructions).toContain('Hub-1');
  });

  it('parseExerciseJson otomatis mengenali file openpacket-topology-*.json', () => {
    const jsonStr = JSON.stringify(sampleTeacherTopology);
    const result = parseExerciseJson(jsonStr);

    expect(result.success).toBe(true);
    expect(result.exercises.length).toBe(1);
    expect(result.exercises[0].starterTopology).toBeDefined();
    expect(result.exercises[0].targets.length).toBeGreaterThan(0);
  });
});
