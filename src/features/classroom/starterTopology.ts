import type { Edge, Node } from '@xyflow/react';
import { TOPOLOGY_TEMPLATES } from '../../data/topologyTemplates';
import type { DeviceData } from '../../types/network';
import { cleanNodesForStarterTopology } from './topologyExerciseConverter';
import type { Exercise } from './types';

export interface PreparedStarterTopology {
  nodes: Node<DeviceData>[];
  edges: Edge[];
  /** Keterangan sumber untuk pesan ke siswa. */
  source: { kind: 'topology' } | { kind: 'template'; name: string };
}

/**
 * Topologi awal yang dimuat siswa ke kanvas. SELALU dibersihkan: konfigurasi IP, rute, dan
 * VLAN yang menjadi sasaran penilaian tidak boleh ikut terbawa dari "kunci jawaban" guru.
 * Satu-satunya pintu masuk (HUD dan modal) agar keduanya tidak berbeda perilaku.
 */
export function prepareStarterTopology(exercise: Exercise): PreparedStarterTopology | null {
  if (exercise.starterTopology) {
    return {
      nodes: cleanNodesForStarterTopology(exercise.starterTopology.nodes, exercise.targets),
      edges: exercise.starterTopology.edges,
      source: { kind: 'topology' },
    };
  }
  if (exercise.starterTemplateId) {
    const tpl = TOPOLOGY_TEMPLATES.find((t) => t.id === exercise.starterTemplateId);
    if (tpl) {
      return {
        nodes: cleanNodesForStarterTopology(tpl.nodes, exercise.targets),
        edges: tpl.edges,
        source: { kind: 'template', name: tpl.name },
      };
    }
  }
  return null;
}
