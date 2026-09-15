import type { DeviceType } from '../../types/network';

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
  createdAt: number;
}

export type ParticipantStatus = 'not_started' | 'in_progress' | 'submitted';

export interface Participant {
  id: string;
  nickname: string;
  joinedAt: number;
  status: ParticipantStatus;
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
  starterTopology?: {
    nodes: any[];
    edges: any[];
  };
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
  submittedAt: number;
}

export type ClassroomEvent =
  | { type: 'CLASS_CREATED'; session: ClassSession }
  | { type: 'PARTICIPANT_JOINED'; classCode: string; participant: Participant }
  | { type: 'EXERCISE_STARTED'; classCode: string; exercise?: Exercise; exercises?: Exercise[] }
  | { type: 'EXERCISES_UPDATED'; classCode: string; exercises: Exercise[] }
  | { type: 'SUBMISSION_RECEIVED'; classCode: string; submission: Submission }
  | { type: 'CLASS_STATUS_CHANGED'; classCode: string; status: SessionStatus }
  | { type: 'CLASS_SETTINGS_CHANGED'; classCode: string; allowSelfCheck: boolean }
  | { type: 'CLASS_CLOSED'; classCode: string }
  | { type: 'SYNC_REQUEST'; classCode: string }
  | {
      type: 'SYNC_RESPONSE';
      classCode: string;
      session: ClassSession;
      participants: Participant[];
      submissions: Record<string, Submission>;
      activeExercise: Exercise | null;
      activeExercises?: Exercise[];
    };
