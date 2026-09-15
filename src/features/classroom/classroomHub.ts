import type {
  ClassSession,
  Participant,
  Exercise,
  Submission,
  ClassroomEvent,
  SessionStatus,
} from './types';
import { DEFAULT_EXERCISES } from './defaultExercises';

const CHANNEL_NAME = 'openpacket_classroom_bus';
const STORAGE_KEY_SESSION = 'openpacket_class_session';
const STORAGE_KEY_PARTICIPANTS = 'openpacket_class_participants';
const STORAGE_KEY_SUBMISSIONS = 'openpacket_class_submissions';
const STORAGE_KEY_ACTIVE_EXERCISE = 'openpacket_class_active_exercise';
const STORAGE_KEY_ACTIVE_EXERCISES = 'openpacket_class_active_exercises';
const STORAGE_KEY_CURRENT_PARTICIPANT = 'openpacket_current_participant';
const STORAGE_KEY_LOCKED_ROLE = 'openpacket_locked_role';

class InMemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const memoryStore = new InMemoryStorage();

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Fallback if security restrictions block localStorage
  }
  return memoryStore;
}

type EventListener = (event: ClassroomEvent) => void;

class ClassroomHub {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<EventListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (ev) => {
          if (ev.data && typeof ev.data === 'object') {
            this.handleIncomingEvent(ev.data as ClassroomEvent);
          }
        };
      } catch (err) {
        console.warn('[ClassroomHub] BroadcastChannel init fallback:', err);
      }
    }
  }

  public subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public broadcast(event: ClassroomEvent): void {
    this.handleIncomingEvent(event);
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.warn('[ClassroomHub] postMessage error:', err);
      }
    }
  }

  private handleIncomingEvent(event: ClassroomEvent): void {
    // Sinkronisasi local state berdasarkan event yang masuk
    switch (event.type) {
      case 'CLASS_CREATED':
        this.saveSession(event.session);
        this.saveParticipants([]);
        this.saveSubmissions({});
        break;

      case 'PARTICIPANT_JOINED': {
        const list = this.getParticipants();
        if (!list.some((p) => p.id === event.participant.id)) {
          this.saveParticipants([...list, event.participant]);
        }
        break;
      }

      case 'EXERCISE_STARTED':
        this.saveActiveExercise(event.exercise);
        if (event.exercises && Array.isArray(event.exercises) && event.exercises.length > 0) {
          this.saveActiveExercises(event.exercises);
        } else {
          this.saveActiveExercises([event.exercise]);
        }
        break;

      case 'SUBMISSION_RECEIVED': {
        const subs = this.getSubmissions();
        subs[event.submission.participantId] = event.submission;
        this.saveSubmissions(subs);

        // Update status participant
        const list = this.getParticipants();
        const updated = list.map((p) =>
          p.id === event.submission.participantId
            ? { ...p, status: 'submitted' as const }
            : p
        );
        this.saveParticipants(updated);
        break;
      }

      case 'CLASS_STATUS_CHANGED': {
        const session = this.getSession();
        if (session && session.classCode === event.classCode) {
          session.status = event.status;
          this.saveSession(session);
        }
        break;
      }

      case 'CLASS_CLOSED': {
        const session = this.getSession();
        if (session && session.classCode === event.classCode) {
          session.status = 'closed';
          this.saveSession(session);
        }
        break;
      }

      case 'SYNC_REQUEST': {
        const session = this.getSession();
        if (session && session.classCode === event.classCode) {
          this.broadcast({
            type: 'SYNC_RESPONSE',
            classCode: session.classCode,
            session,
            participants: this.getParticipants(),
            submissions: this.getSubmissions(),
            activeExercise: this.getActiveExercise(),
            activeExercises: this.getActiveExercises(),
          });
        }
        break;
      }

      case 'SYNC_RESPONSE':
        this.saveSession(event.session);
        this.saveParticipants(event.participants);
        this.saveSubmissions(event.submissions);
        if (event.activeExercise) {
          this.saveActiveExercise(event.activeExercise);
        }
        if (event.activeExercises && event.activeExercises.length > 0) {
          this.saveActiveExercises(event.activeExercises);
        }
        break;
    }

    // Panggil seluruh listener lokal secara asinkron (microtask) agar React menyelesaikan siklus render saat ini
    queueMicrotask(() => {
      this.listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (e) {
          console.error('[ClassroomHub] listener error:', e);
        }
      });
    });
  }

  // --- API Methods ---

  public createClass(
    title: string,
    customCode?: string,
    hostToken?: string,
    initialExercises?: Exercise[]
  ): ClassSession {
    const code =
      customCode?.trim().toUpperCase() ||
      `NET-${Math.floor(1000 + Math.random() * 9000)}`;
    const exercisesList: Exercise[] =
      initialExercises && initialExercises.length > 0
        ? JSON.parse(JSON.stringify(initialExercises))
        : [DEFAULT_EXERCISES[0]];

    const session: ClassSession = {
      id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      classCode: code,
      title: title.trim() || 'Kelas Jaringan Komputer',
      status: 'open',
      hostToken: hostToken || `token-${Math.random().toString(36).slice(2, 10)}`,
      activeExerciseId: exercisesList[0].id,
      activeExercises: exercisesList,
      createdAt: Date.now(),
    };

    this.saveSession(session);
    this.saveParticipants([]);
    this.saveSubmissions({});
    this.saveActiveExercise(exercisesList[0]);
    this.saveActiveExercises(exercisesList);

    this.broadcast({ type: 'CLASS_CREATED', session });
    this.broadcast({
      type: 'EXERCISE_STARTED',
      classCode: code,
      exercise: exercisesList[0],
      exercises: exercisesList,
    });

    return session;
  }

  public joinClass(classCode: string, nickname: string): Participant | null {
    const session = this.getSession();
    const cleanCode = classCode.trim().toUpperCase();

    if (!session || session.classCode !== cleanCode) {
      // Minta sync dari host jika session belum ada di tab ini
      this.broadcast({ type: 'SYNC_REQUEST', classCode: cleanCode });
    }

    const participant: Participant = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nickname: nickname.trim() || `Siswa-${Math.floor(10 + Math.random() * 90)}`,
      joinedAt: Date.now(),
      status: 'in_progress',
    };

    const participants = this.getParticipants();
    this.saveParticipants([...participants, participant]);

    this.broadcast({
      type: 'PARTICIPANT_JOINED',
      classCode: cleanCode,
      participant,
    });

    this.setCurrentParticipant(participant);

    return participant;
  }

  public startExercises(classCode: string, exercises: Exercise[]): void {
    if (!exercises || exercises.length === 0) return;
    const frozenList: Exercise[] = JSON.parse(JSON.stringify(exercises));
    const session = this.getSession();
    if (session) {
      session.activeExerciseId = frozenList[0].id;
      session.activeExercises = frozenList;
      this.saveSession(session);
    }
    this.saveActiveExercise(frozenList[0]);
    this.saveActiveExercises(frozenList);

    // Reset status pengerjaan peserta untuk soal baru
    const participants = this.getParticipants().map((p) => ({
      ...p,
      status: 'in_progress' as const,
    }));
    this.saveParticipants(participants);

    this.broadcast({
      type: 'EXERCISE_STARTED',
      classCode: classCode.trim().toUpperCase(),
      exercise: frozenList[0],
      exercises: frozenList,
    });
  }

  public startExercise(classCode: string, exercise: Exercise): void {
    this.startExercises(classCode, [exercise]);
  }

  public submitWork(classCode: string, submission: Submission): void {
    const subs = this.getSubmissions();
    subs[submission.participantId] = submission;
    this.saveSubmissions(subs);

    this.broadcast({
      type: 'SUBMISSION_RECEIVED',
      classCode: classCode.trim().toUpperCase(),
      submission,
    });
  }

  public setStatus(classCode: string, status: SessionStatus): void {
    const session = this.getSession();
    if (session) {
      session.status = status;
      this.saveSession(session);
    }
    this.broadcast({
      type: 'CLASS_STATUS_CHANGED',
      classCode: classCode.trim().toUpperCase(),
      status,
    });
  }

  public closeClass(classCode: string): void {
    this.setStatus(classCode, 'closed');
    this.broadcast({
      type: 'CLASS_CLOSED',
      classCode: classCode.trim().toUpperCase(),
    });
  }

  // --- Storage Helpers ---
  public getSession(): ClassSession | null {
    try {
      const raw = getStorage().getItem(STORAGE_KEY_SESSION);
      return raw ? (JSON.parse(raw) as ClassSession) : null;
    } catch {
      return null;
    }
  }

  public saveSession(session: ClassSession | null): void {
    if (!session) {
      getStorage().removeItem(STORAGE_KEY_SESSION);
      return;
    }
    getStorage().setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  }

  public getParticipants(): Participant[] {
    try {
      const raw = getStorage().getItem(STORAGE_KEY_PARTICIPANTS);
      return raw ? (JSON.parse(raw) as Participant[]) : [];
    } catch {
      return [];
    }
  }

  public saveParticipants(list: Participant[]): void {
    getStorage().setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(list));
  }

  public getSubmissions(): Record<string, Submission> {
    try {
      const raw = getStorage().getItem(STORAGE_KEY_SUBMISSIONS);
      return raw ? (JSON.parse(raw) as Record<string, Submission>) : {};
    } catch {
      return {};
    }
  }

  public saveSubmissions(subs: Record<string, Submission>): void {
    getStorage().setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(subs));
  }

  public getActiveExercise(): Exercise | null {
    try {
      const raw = getStorage().getItem(STORAGE_KEY_ACTIVE_EXERCISE);
      return raw ? (JSON.parse(raw) as Exercise) : DEFAULT_EXERCISES[0];
    } catch {
      return DEFAULT_EXERCISES[0];
    }
  }

  public saveActiveExercise(exercise: Exercise | null): void {
    if (!exercise) {
      getStorage().removeItem(STORAGE_KEY_ACTIVE_EXERCISE);
      return;
    }
    getStorage().setItem(STORAGE_KEY_ACTIVE_EXERCISE, JSON.stringify(exercise));
  }

  public getActiveExercises(): Exercise[] {
    try {
      const raw = getStorage().getItem(STORAGE_KEY_ACTIVE_EXERCISES);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) return list as Exercise[];
      }
    } catch {
      // Fallback
    }
    const single = this.getActiveExercise();
    return single ? [single] : [DEFAULT_EXERCISES[0]];
  }

  public saveActiveExercises(exercises: Exercise[]): void {
    if (!exercises || exercises.length === 0) {
      getStorage().removeItem(STORAGE_KEY_ACTIVE_EXERCISES);
      return;
    }
    getStorage().setItem(STORAGE_KEY_ACTIVE_EXERCISES, JSON.stringify(exercises));
  }

  public getCurrentParticipant(): Participant | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(STORAGE_KEY_CURRENT_PARTICIPANT);
        if (raw) return JSON.parse(raw) as Participant;
      }
    } catch {
      // Fallback
    }
    const mem = memoryStore.getItem(STORAGE_KEY_CURRENT_PARTICIPANT);
    return mem ? (JSON.parse(mem) as Participant) : null;
  }

  public setCurrentParticipant(participant: Participant | null): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (participant) {
          window.sessionStorage.setItem(
            STORAGE_KEY_CURRENT_PARTICIPANT,
            JSON.stringify(participant)
          );
        } else {
          window.sessionStorage.removeItem(STORAGE_KEY_CURRENT_PARTICIPANT);
        }
      }
    } catch {
      // Fallback
    }
    if (participant) {
      memoryStore.setItem(
        STORAGE_KEY_CURRENT_PARTICIPANT,
        JSON.stringify(participant)
      );
    } else {
      memoryStore.removeItem(STORAGE_KEY_CURRENT_PARTICIPANT);
    }
  }

  public getLockedRole(): 'teacher' | 'student' | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(STORAGE_KEY_LOCKED_ROLE);
        if (raw === 'teacher' || raw === 'student') return raw;
      }
    } catch {
      // Fallback
    }
    const mem = memoryStore.getItem(STORAGE_KEY_LOCKED_ROLE);
    if (mem === 'teacher' || mem === 'student') return mem;
    return null;
  }

  public setLockedRole(role: 'teacher' | 'student' | null): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (role) {
          window.sessionStorage.setItem(STORAGE_KEY_LOCKED_ROLE, role);
        } else {
          window.sessionStorage.removeItem(STORAGE_KEY_LOCKED_ROLE);
        }
      }
    } catch {
      // Fallback
    }

    if (role) {
      memoryStore.setItem(STORAGE_KEY_LOCKED_ROLE, role);
      if (role === 'teacher') {
        // Mode guru: lepas status sebagai siswa
        this.setCurrentParticipant(null);
      }
    } else {
      memoryStore.removeItem(STORAGE_KEY_LOCKED_ROLE);
    }
  }

  public clearAll(): void {
    const storage = getStorage();
    storage.removeItem(STORAGE_KEY_SESSION);
    storage.removeItem(STORAGE_KEY_PARTICIPANTS);
    storage.removeItem(STORAGE_KEY_SUBMISSIONS);
    storage.removeItem(STORAGE_KEY_ACTIVE_EXERCISE);
    storage.removeItem(STORAGE_KEY_ACTIVE_EXERCISES);
    this.setCurrentParticipant(null);
    this.setLockedRole(null);
  }
}

export const classroomHub = new ClassroomHub();
