import type { Edge, Node } from '@xyflow/react';
import type { DeviceData, TopologyLink } from '../../types/network';
import { evaluateExercise } from './exerciseEvaluator';
import type { Exercise, ExerciseEvaluation, Participant, Submission } from './types';

/**
 * Ubah edge React Flow menjadi kontrak kabel engine — identik dengan yang dipakai simulasi
 * (useSimulationEngine): menyertakan `kind` agar asosiasi WiFi dinilai sebagai nirkabel.
 */
export function edgesToLinks(edges: Edge[]): TopologyLink[] {
  return edges.map((e) => ({
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle ?? 'fa0',
    targetNodeId: e.target,
    targetPortId: e.targetHandle ?? 'fa0',
    kind: e.type === 'wirelessLink' ? ('wireless' as const) : ('ethernet' as const),
  }));
}

export interface PacketResult {
  evaluations: Record<string, ExerciseEvaluation>;
  exerciseScores: Record<string, number>;
  averageScore: number;
  status: Submission['status'];
}

/** Nilai seluruh soal dalam paket ujian terhadap topologi kanvas siswa. */
export async function evaluatePacket(
  exercises: Exercise[],
  nodes: Node<DeviceData>[],
  edges: Edge[],
  previous: Record<string, ExerciseEvaluation> = {}
): Promise<PacketResult> {
  const devices = nodes.map((n) => n.data);
  const links = edgesToLinks(edges);
  const evaluations: Record<string, ExerciseEvaluation> = { ...previous };
  const exerciseScores: Record<string, number> = {};

  for (const ex of exercises) {
    const res = await evaluateExercise(ex, devices, links);
    evaluations[ex.id] = res;
    exerciseScores[ex.id] = res.score;
  }

  const scores = Object.values(exerciseScores);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const status: Submission['status'] = averageScore === 100 ? 'passed' : averageScore > 0 ? 'partial' : 'failed';
  return { evaluations, exerciseScores, averageScore, status };
}

/** Susun lembar jawaban resmi dari hasil penilaian paket. */
export function buildPacketSubmission(
  participant: Participant,
  exercises: Exercise[],
  selectedExerciseId: string | undefined,
  packet: PacketResult
): Submission {
  const focusId = selectedExerciseId ?? exercises[0]?.id ?? '';
  const focusEval = packet.evaluations[focusId] ?? Object.values(packet.evaluations)[0];
  return {
    participantId: participant.id,
    nickname: participant.nickname,
    exerciseId: focusId,
    score: packet.averageScore,
    status: packet.status,
    evaluation:
      focusEval ?? {
        status: packet.status,
        score: packet.averageScore,
        feedback: `Pengerjaan selesai dengan skor rata-rata ${packet.averageScore}/100.`,
        evaluatedAt: new Date().toLocaleTimeString(),
        checks: [],
      },
    evaluations: packet.evaluations,
    exerciseScores: packet.exerciseScores,
    submittedAt: Date.now(),
  };
}
