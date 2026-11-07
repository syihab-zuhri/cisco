import { isWorkTopology, workTopology, type DraftStorage } from '../workspace/draft';
import type { StarterTopology } from './types';

export interface StudentWork {
  selectedExerciseId?: string;
  topologies: Record<string, StarterTopology>;
}

export function createStudentWorkspace(storage: DraftStorage) {
  const key = 'openpacket_student_work_v1';
  let memory: { scope: string; work: StudentWork } | null = null;
  const read = (scope: string): StudentWork => {
    if (memory?.scope === scope) return memory.work;
    try {
      const raw = JSON.parse(storage.getItem(key) ?? 'null');
      if (raw?.version !== 1 || raw.scope !== scope) return { topologies: {} };
      const topologies: Record<string, StarterTopology> = {};
      for (const [id, topology] of Object.entries(raw.topologies ?? {})) if (isWorkTopology(topology)) topologies[id] = topology;
      return {
        selectedExerciseId: typeof raw.selectedExerciseId === 'string' ? raw.selectedExerciseId : undefined,
        topologies,
      };
    } catch { return { topologies: {} }; }
  };
  return {
    read,
    save(scope: string, exerciseId: string, topology: StarterTopology) {
      const work = read(scope);
      const next = { selectedExerciseId: exerciseId, topologies: { ...work.topologies, [exerciseId]: workTopology(topology) } };
      memory = { scope, work: next };
      try {
        storage.setItem(key, JSON.stringify({ version: 1, scope, ...next }));
        return true;
      } catch { return false; }
    },
  };
}

export const studentWorkspace = createStudentWorkspace({
  getItem: (key) => typeof window === 'undefined' ? null : window.sessionStorage.getItem(key),
  setItem: (key, value) => { if (typeof window !== 'undefined') window.sessionStorage.setItem(key, value); },
});

/** Only configuration/connectivity affects grading; dragging/selection and learned tables do not. */
export function gradingKey(topology: StarterTopology): string {
  return JSON.stringify({
    nodes: topology.nodes.map(({ id, data }) => {
      const { arpTable: _arp, macTable: _mac, natTable: _nat, ...config } = data;
      return { id, data: config };
    }),
    edges: topology.edges.map(({ id, source, target, sourceHandle, targetHandle, type }) => ({ id, source, target, sourceHandle, targetHandle, type })),
  });
}
