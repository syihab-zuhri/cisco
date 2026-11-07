import type { Edge, Node } from '@xyflow/react';
import type { DeviceData } from '../../types/network';
import { evaluatePacket, buildPacketSubmission } from './submissionBuilder';
import type { Exercise, StarterTopology, Submission } from './types';

/**
 * Salinan ringkas topologi kanvas untuk disertakan pada jawaban siswa: hanya yang dibutuhkan
 * penilaian (id, tipe, data perangkat, kabel). Posisi dan state UI dibuang agar ukurannya kecil.
 */
export function compactTopology(nodes: Node<DeviceData>[], edges: Edge[]): StarterTopology {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })) as unknown as Node<DeviceData>[],
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type,
    })) as Edge[],
  };
}

export interface VerificationResult {
  /** match = nilai klaim siswa sama dengan hasil penilaian ulang; mismatch = berbeda; unavailable = tak bisa diverifikasi. */
  status: 'match' | 'mismatch' | 'unavailable';
  claimedScore: number;
  verifiedScore?: number;
  /** Cap waktu submission yang diverifikasi; hasil dianggap usang bila siswa mengirim ulang. */
  submittedAt: number;
  reason?: string;
}

/**
 * Nilai ulang topologi siswa di perangkat guru dan bandingkan dengan skor yang diklaim.
 * Penilaian deterministik, jadi selisih berarti skor dimanipulasi (atau soal berubah).
 */
export async function verifySubmission(
  submission: Submission,
  snapshot: StarterTopology | null,
  availableExercises: Exercise[]
): Promise<VerificationResult> {
  const base = { claimedScore: submission.score, submittedAt: submission.submittedAt };
  if (!snapshot) {
    return { ...base, status: 'unavailable', reason: 'Snapshot topologi siswa tidak tersedia (dikirim tanpa snapshot atau sudah dibersihkan).' };
  }

  const byId = new Map(availableExercises.map((e) => [e.id, e]));
  const wantedIds =
    submission.exerciseScores && Object.keys(submission.exerciseScores).length > 0
      ? Object.keys(submission.exerciseScores)
      : submission.exerciseId
      ? [submission.exerciseId]
      : [];
  const exercises = wantedIds.map((id) => byId.get(id)).filter((e): e is Exercise => Boolean(e));
  if (wantedIds.length === 0 || exercises.length !== wantedIds.length) {
    return { ...base, status: 'unavailable', reason: 'Definisi soal untuk jawaban ini sudah tidak tersedia (mis. ronde sudah berganti).' };
  }

  try {
    if (snapshot.exerciseTopologies && wantedIds.some((id) => !snapshot.exerciseTopologies?.[id])) {
      return { ...base, status: 'unavailable', reason: 'Snapshot salah satu soal tidak tersedia.' };
    }
    const packet = await evaluatePacket(exercises, snapshot.nodes as Node<DeviceData>[], snapshot.edges as Edge[], {}, snapshot.exerciseTopologies);
    return {
      ...base,
      status: packet.averageScore === submission.score ? 'match' : 'mismatch',
      verifiedScore: packet.averageScore,
    };
  } catch (err) {
    return { ...base, status: 'unavailable', reason: `Penilaian ulang gagal: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Import legacy score claims and work-only files through the same actual-snapshot grader. */
export async function gradeImportedWork(submission: Submission, snapshot: StarterTopology | null, availableExercises: Exercise[]): Promise<Submission> {
  const ids = submission.exerciseScores && Object.keys(submission.exerciseScores).length ? Object.keys(submission.exerciseScores) : [submission.exerciseId];
  const byId = new Map(availableExercises.map((ex) => [ex.id, ex]));
  const exercises = ids.map((id) => byId.get(id)).filter((e): e is Exercise => Boolean(e));
  if (!snapshot || !ids.length || exercises.length !== ids.length ||
      (snapshot.exerciseTopologies && ids.some((id) => !snapshot.exerciseTopologies?.[id]))) {
    return { ...submission, ungraded: true };
  }
  const packet = await evaluatePacket(exercises, snapshot.nodes, snapshot.edges, {}, snapshot.exerciseTopologies);
  return { ...buildPacketSubmission({ id: submission.participantId, nickname: submission.nickname, joinedAt: 0, status: 'submitted' }, exercises, submission.exerciseId, packet), submittedAt: submission.submittedAt, ungraded: false };
}
