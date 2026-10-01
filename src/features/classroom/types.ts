import type { Edge, Node } from '@xyflow/react';
import type { DeviceData, DeviceType } from '../../types/network';

export interface StarterTopology {
  nodes: Node<DeviceData>[];
  edges: Edge[];
}

export type SessionStatus = 'open' | 'locked' | 'closed';

export interface ClassSession {
  id: string;
  classCode: string;
  title: string;
  status: SessionStatus;
  hostToken: string;
  activeExerciseId: string | null;
  activeExercises?: Exercise[];
  allowSelfCheck?: boolean;
  /** Batas maksimal cek mandiri per soal (default 5). Guru dapat mengubahnya. */
  selfCheckLimit?: number;
  /** Nomor ronde ujian: naik setiap guru menyiarkan paket soal baru (EXERCISE_STARTED). */
  round?: number;
  /** Kelas lokal (latihan mandiri .oplab): tidak pernah dikirim ke relay. */
  local?: boolean;
  createdAt: number;
}

export type ParticipantStatus = 'not_started' | 'in_progress' | 'submitted' | 'left';

export interface Participant {
  id: string;
  nickname: string;
  joinedAt: number;
  status: ParticipantStatus;
  /** Peserta yang ditambahkan guru dari berkas .opsub (bukan dari relay). */
  imported?: boolean;
}

export type ExerciseTarget =
  | { id: string; title: string; type: 'device_config'; deviceId: string; address: string; prefix?: number; subnetMask?: string; gateway?: string }
  | { id: string; title: string; type: 'link_exists'; fromDeviceId: string; toDeviceId: string }
  | { id: string; title: string; type: 'reachability'; sourceDeviceId: string; destinationDeviceId: string }
  | { id: string; title: string; type: 'required_device_count'; deviceType: DeviceType; count: number }
  | { id: string; title: string; type: 'vlan_config'; deviceId: string; portId: string; vlanId: number; mode: 'access' | 'trunk' };

export interface Exercise {
  id: string;
  title: string;
  instructions: string;
  difficulty: 'Dasar' | 'Menengah' | 'Lanjutan';
  targets: ExerciseTarget[];
  starterTemplateId?: string;
  starterTopology?: StarterTopology;
}

export interface ExerciseCheck {
  targetId: string;
  title: string;
  passed: boolean;
  reason: string;
}

export interface ExerciseEvaluation {
  status: 'passed' | 'partial' | 'failed';
  score: number;
  checks: ExerciseCheck[];
  feedback: string;
  evaluatedAt: string;
}

export interface Submission {
  participantId: string;
  nickname: string;
  exerciseId: string;
  score: number;
  status: 'passed' | 'partial' | 'failed';
  evaluation: ExerciseEvaluation;
  evaluations?: Record<string, ExerciseEvaluation>;
  exerciseScores?: Record<string, number>;
  /** Ronde ujian saat jawaban dikirim (diberi cap oleh relay). */
  round?: number;
  /** Jawaban yang diimpor guru dari berkas .opsub (bukan dari relay). */
  imported?: boolean;
  submittedAt: number;
}

/** Arsip nilai satu ronde ujian yang sudah selesai (guru memulai soal baru). */
export interface RoundHistory {
  round: number;
  endedAt: number;
  exercises: Array<{ id: string; title: string }>;
  participants: Array<{ id: string; nickname: string }>;
  submissions: Record<string, Submission>;
}

export type ClassroomEvent =
  | { type: 'CLASS_CREATED'; session: ClassSession; restore?: boolean; history?: RoundHistory[] }
  | { type: 'PARTICIPANT_JOINED'; classCode: string; participant: Participant; participantToken?: string }
  | { type: 'PARTICIPANT_LEFT'; classCode: string; participantId: string; participantToken?: string }
  | { type: 'PARTICIPANT_KICKED'; classCode: string; participantId: string; hostToken?: string }
  | { type: 'EXERCISE_STARTED'; classCode: string; exercise?: Exercise; exercises?: Exercise[]; hostToken?: string }
  | { type: 'EXERCISES_UPDATED'; classCode: string; exercises: Exercise[]; hostToken?: string }
  | { type: 'SUBMISSION_RECEIVED'; classCode: string; submission: Submission; participantToken?: string }
  | { type: 'CLASS_STATUS_CHANGED'; classCode: string; status: SessionStatus; hostToken?: string }
  | {
      type: 'CLASS_SETTINGS_CHANGED';
      classCode: string;
      allowSelfCheck: boolean;
      selfCheckLimit?: number;
      hostToken?: string;
    }
  | { type: 'CLASS_CLOSED'; classCode: string; hostToken?: string }
  | { type: 'SYNC_REQUEST'; classCode: string }
  | {
      type: 'SYNC_RESPONSE';
      classCode: string;
      session: ClassSession;
      participants: Participant[];
      submissions: Record<string, Submission>;
      activeExercise: Exercise | null;
      activeExercises?: Exercise[];
      history?: RoundHistory[];
    }
  /** Hanya lokal: relay sempat kehilangan kelas (restart) dan perangkat ini memulihkannya otomatis. */
  | { type: 'RELAY_RESTORED'; classCode: string; role: 'host' | 'participant' }
  /** Hanya lokal: relay menolak sebuah event (403/404/413/...) sehingga UI dapat memberi tahu pengguna. */
  | { type: 'RELAY_REJECTED'; eventType: string; classCode: string; status: number; message: string }
  | { type: 'ROLE_CHANGED'; role: 'teacher' | 'student' | null }
  | { type: 'PARTICIPANT_CHANGED'; participant: Participant | null };
