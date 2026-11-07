import type {
  ClassSession,
  Participant,
  Exercise,
  Submission,
  ClassroomEvent,
  RoundHistory,
  SessionStatus,
  StarterTopology,
  StudentSessionEndReason,
} from './types';
import { clearExercisesStorage } from './exerciseParser';

const CHANNEL_NAME = 'openpacket_classroom_bus';
const STORAGE_KEY_SESSION = 'openpacket_class_session';
const STORAGE_KEY_PARTICIPANTS = 'openpacket_class_participants';
const STORAGE_KEY_SUBMISSIONS = 'openpacket_class_submissions';
const STORAGE_KEY_HISTORY = 'openpacket_class_history';
const STORAGE_KEY_ACTIVE_EXERCISE = 'openpacket_class_active_exercise';
const STORAGE_KEY_ACTIVE_EXERCISES = 'openpacket_class_active_exercises';
const STORAGE_KEY_CURRENT_PARTICIPANT = 'openpacket_current_participant';
const STORAGE_KEY_PARTICIPANT_TOKEN = 'openpacket_participant_token';
const STORAGE_KEY_LOCKED_ROLE = 'openpacket_locked_role';
const STORAGE_KEY_SELF_CHECK = 'openpacket_self_check_counts';
const STORAGE_KEY_SNAPSHOTS = 'openpacket_class_snapshots'; // snapshot topologi dari .opsub yang diimpor guru
const STORAGE_KEY_MY_SNAPSHOT = 'openpacket_my_snapshot'; // snapshot jawaban terakhir milik siswa (untuk pemulihan)
const RESTORE_COOLDOWN_MS = 10_000;
/** Setelah guru memulihkan kelas, siswa perlu beberapa detik untuk tersambung kembali: jangan kosongkan tabel guru dulu. */
const RESTORE_GRACE_MS = 30_000;
const RESTORE_MIN_AGE_MS = 5_000;
/** Jawaban yang baru dikirim dianggap masih di perjalanan selama ini; polling tidak boleh menghapusnya. */
const OWN_SUBMISSION_PENDING_MS = 15_000;
export const STORAGE_KEY_RELAY_URL = 'openpacket_relay_url';

const MAX_HISTORY_ROUNDS = 10;
const MAX_SELF_CHECK_KEYS = 200;
const AUTO_CODE_RETRIES = 3;

/** Event yang hanya berlaku lokal dan tidak boleh dikirim ke relay HTTP. */
const RELAY_EXCLUDED_EVENTS = new Set<string>([
  'SYNC_REQUEST',
  'SYNC_RESPONSE',
  'RELAY_REJECTED',
  'RELAY_RESTORED',
  'ROLE_CHANGED',
  'PARTICIPANT_CHANGED',
  'STUDENT_SESSION_ENDED',
]);

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ClassroomHubOptions {
  /** Penyimpanan persisten (default: window.localStorage, lalu memori). */
  localStorage?: KeyValueStore;
  /** Penyimpanan per-tab (default: window.sessionStorage + cermin memori). */
  sessionStorage?: KeyValueStore;
  /** Implementasi fetch (default: window.fetch). Berguna untuk pengujian. */
  fetch?: typeof fetch;
}

class InMemoryStorage implements KeyValueStore {
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

function getStorage(): KeyValueStore {
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

/** sessionStorage bila ada, selalu dicerminkan ke memori (perilaku asli hub). */
const defaultSessionStore: KeyValueStore = {
  getItem(key) {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem(key);
        if (raw !== null) return raw;
      }
    } catch {
      // Fallback
    }
    return memoryStore.getItem(key);
  },
  setItem(key, value) {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch {
      // Fallback
    }
    memoryStore.setItem(key, value);
  },
  removeItem(key) {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Fallback
    }
    memoryStore.removeItem(key);
  },
};

/** Kode kelas: huruf besar, angka, "-" dan "_"; spasi menjadi "-". Sama persis dengan aturan relay. */
export function normalizeClassCode(raw: string | undefined | null): string {
  return (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 32);
}

/** Rahasia acak kriptografis (hostToken / participantToken). */
export function generateSecret(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Alamat dasar server relay. Urutan: localStorage `openpacket_relay_url`, lalu
 * `VITE_CLASSROOM_RELAY_URL`, lalu kosong (relay satu origin dengan aplikasi).
 */
export function getRelayBaseUrl(store: KeyValueStore = getStorage()): string {
  let url = '';
  try {
    url = store.getItem(STORAGE_KEY_RELAY_URL) ?? '';
  } catch {
    // abaikan
  }
  if (!url) {
    url = (import.meta.env?.VITE_CLASSROOM_RELAY_URL as string | undefined) ?? '';
  }
  return url.trim().replace(/\/+$/, '');
}

type EventListener = (event: ClassroomEvent) => void;

export interface RelayRejection {
  status: number;
  message: string;
}

export interface BroadcastOptions {
  /** Dipanggil bila relay menolak event. Kembalikan true bila sudah ditangani (tanpa rollback/notifikasi bawaan). */
  onRelayReject?: (info: RelayRejection) => boolean | void;
  /** Dipanggil bila relay menerima event. */
  onRelayOk?: () => void;
  /** Dipanggil bila relay tidak dapat dihubungi (galat jaringan); event mungkin belum tercatat. */
  onRelayError?: () => void;
  /** Field tambahan yang hanya dikirim ke relay (tidak ke event lokal/BroadcastChannel), mis. snapshot topologi. */
  relayExtra?: Record<string, unknown>;
}

export type ClassCheckResult =
  | { status: 'found'; classStatus: SessionStatus; title: string }
  | { status: 'not_found' }
  | { status: 'unreachable' };

function eventClassCode(event: ClassroomEvent): string {
  if ('classCode' in event && typeof event.classCode === 'string') {
    return normalizeClassCode(event.classCode);
  }
  if (event.type === 'CLASS_CREATED') return normalizeClassCode(event.session?.classCode ?? '');
  return '';
}

export class ClassroomHub {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<EventListener> = new Set();
  private opts: ClassroomHubOptions;
  /** classCode terakhir yang digunakan join/create — agar auto-sync
   *  tetap berjalan meskipun session belum tersimpan dari relay. */
  private pendingClassCode: string | null = null;
  /** Antrean pengiriman ke relay: event satu klien harus tiba berurutan (CLASS_CREATED sebelum EXERCISE_STARTED, dst.). */
  private relayChain: Promise<void> = Promise.resolve();
  /** Revisi relay terakhir yang diterima (untuk polling `since`, hemat bandwidth). */
  private lastRev: number | null = null;
  private lastRevKey: string | null = null;
  /** Waktu pemulihan otomatis terakhir (dibatasi agar tidak membanjiri relay). */
  private lastRestoreAt = 0;
  private lastMismatchAt = 0;
  private restoreGraceUntil = 0;
  /** Status pengiriman jawaban milik siswa di perangkat ini (hanya memori; relay tetap sumber kebenaran). */
  private ownSubmission: { submittedAt: number; state: 'pending' | 'confirmed' | 'failed'; since: number } | null = null;

  constructor(opts: ClassroomHubOptions = {}) {
    this.opts = opts;
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
    if (!this.getSession()) {
      clearExercisesStorage();
    }
  }

  // --- Penyimpanan ---

  private store(): KeyValueStore {
    return this.opts.localStorage ?? getStorage();
  }

  private sess(): KeyValueStore {
    return this.opts.sessionStorage ?? defaultSessionStore;
  }

  private readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
    try {
      const raw = store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  public subscribe(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  // --- Siaran event ---

  public broadcast(event: ClassroomEvent, options: BroadcastOptions = {}): void {
    this.handleIncomingEvent(event);
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.warn('[ClassroomHub] postMessage error:', err);
      }
    }
    // Teruskan ke server relay HTTP jika ada koneksi
    this.postToRelay(event, options);
  }

  private getFetch(): typeof fetch | null {
    if (this.opts.fetch) return this.opts.fetch;
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch.bind(window);
    }
    return null;
  }

  private relayUrl(path: string): string {
    return `${getRelayBaseUrl(this.store())}/api/classroom${path}`;
  }

  private isLocalClassCode(code: string): boolean {
    const session = this.getSession();
    return Boolean(session?.local && session.classCode === code);
  }

  /** Menambahkan rahasia peserta pada event siswa; dihitung sinkron sebelum state dibersihkan. */
  private withRelayAuth(event: ClassroomEvent): ClassroomEvent {
    switch (event.type) {
      case 'PARTICIPANT_JOINED':
      case 'PARTICIPANT_LEFT':
      case 'SUBMISSION_RECEIVED': {
        const token = this.getParticipantToken();
        return token ? { ...event, participantToken: token } : event;
      }
      default:
        return event;
    }
  }

  private postToRelay(event: ClassroomEvent, options: BroadcastOptions): void {
    if (RELAY_EXCLUDED_EVENTS.has(event.type)) return;
    const code = eventClassCode(event);
    if (!code || this.isLocalClassCode(code)) return;
    const doFetch = this.getFetch();
    if (!doFetch) return;

    let body: string;
    try {
      body = JSON.stringify({ ...this.withRelayAuth(event), ...options.relayExtra });
    } catch {
      return;
    }

    const send = () =>
      doFetch(this.relayUrl('/event'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then(async (resp) => {
          if (resp.ok) {
            options.onRelayOk?.();
            return;
          }
          let data: { success?: unknown; error?: unknown } | null = null;
          try {
            data = (await resp.json()) as { success?: unknown; error?: unknown };
          } catch {
            return; // bukan relay OpenPacket (mis. hosting statis): abaikan, mode lokal
          }
          if (!data || typeof data.success !== 'boolean' || data.success) return;
          const message =
            typeof data.error === 'string' ? data.error : `Server relay menolak event (HTTP ${resp.status}).`;
          this.handleRelayRejection(event, code, resp.status, message, options);
        })
        .catch(() => {
          // Offline / relay tidak ada: tetap berjalan lokal.
          options.onRelayError?.();
        });
    // Berurutan: satu event baru dikirim setelah event sebelumnya selesai (kegagalan tidak memutus antrean).
    this.relayChain = this.relayChain.then(send, send);
  }

  private handleRelayRejection(
    event: ClassroomEvent,
    code: string,
    status: number,
    message: string,
    options: BroadcastOptions
  ): void {
    if (options.onRelayReject?.({ status, message }) === true) return;
    this.rollbackRejectedEvent(event, status);
    this.notifyListeners({ type: 'RELAY_REJECTED', eventType: event.type, classCode: code, status, message });
  }

  /** Batalkan efek lokal dari event yang ditolak relay agar UI tidak berbohong. */
  private rollbackRejectedEvent(event: ClassroomEvent, status = 0): void {
    if (event.type === 'CLASS_CREATED') {
      const cur = this.getSession();
      if (cur && cur.id === event.session.id) {
        this.saveSession(null);
        this.saveParticipants([]);
        this.saveSubmissions({});
        this.saveHistory([]);
        this.saveActiveExercises([]);
        this.saveActiveExercise(null);
        this.pendingClassCode = null;
        this.resetRev();
      }
    } else if (event.type === 'PARTICIPANT_JOINED') {
      const me = this.getCurrentParticipant();
      if (me && me.id === event.participant.id) {
        this.saveParticipants(this.getParticipants().filter((p) => p.id !== me.id));
        const cur = this.getSession();
        if (cur && cur.id.startsWith('pending-') && cur.classCode === eventClassCode(event)) {
          this.saveSession(null);
        }
        this.saveActiveExercises([]);
        this.saveActiveExercise(null);
        this.pendingClassCode = null;
        this.setParticipantToken(null);
        this.resetRev();
        this.setCurrentParticipant(null);
      }
    } else if (event.type === 'SUBMISSION_RECEIVED') {
      const sentAt = event.submission.submittedAt;
      if (this.ownSubmission?.submittedAt === sentAt) this.ownSubmission = null;
      // 409 = relay sudah memegang jawaban siswa ini pada ronde ini: pertahankan, sinkronisasi membawa versi resmi.
      if (status === 409) return;
      const me = this.getCurrentParticipant();
      const subs = this.getSubmissions();
      if (me && me.id === event.submission.participantId && subs[me.id]?.submittedAt === sentAt) {
        delete subs[me.id];
        this.saveSubmissions(subs);
      }
    }
  }

  private resetRev(): void {
    this.lastRev = null;
    this.lastRevKey = null;
  }

  // --- Penanganan event masuk ---

  private handleIncomingEvent(event: ClassroomEvent): void {
    // Sinkronisasi local state berdasarkan event yang masuk
    switch (event.type) {
      case 'CLASS_CREATED':
        this.saveSession(event.session);
        this.saveParticipants([]);
        this.saveSubmissions({});
        this.saveHistory([]);
        if (event.session?.activeExercises) {
          this.saveActiveExercises(event.session.activeExercises);
          if (event.session.activeExercises[0]) {
            this.saveActiveExercise(event.session.activeExercises[0]);
          }
        }
        break;

      case 'PARTICIPANT_JOINED': {
        const list = this.getParticipants();
        if (!list.some((p) => p.id === event.participant.id)) {
          this.saveParticipants([...list, event.participant]);
        }
        break;
      }

      case 'PARTICIPANT_LEFT': {
        const list = this.getParticipants();
        const hasSubmission = Boolean(this.getSubmissions()[event.participantId]);
        this.saveParticipants(
          hasSubmission
            ? list.map((p) => (p.id === event.participantId ? { ...p, status: 'left' as const } : p))
            : list.filter((p) => p.id !== event.participantId)
        );
        break;
      }

      case 'PARTICIPANT_KICKED': {
        // Selalu hapus dari daftar peserta (baik di perangkat guru maupun siswa lain)
        const list = this.getParticipants();
        this.saveParticipants(list.filter((p) => p.id !== event.participantId));

        // Jika yang di-kick adalah diri sendiri: bersihkan sesi dari perangkat ini
        const current = this.getCurrentParticipant();
        if (current && current.id === event.participantId && this.getSession()?.classCode === event.classCode) {
          this.finishStudentSession('kicked');
        }
        break;
      }

      case 'EXERCISES_UPDATED': {
        const session = this.getSession();
        if (session && (!event.classCode || session.classCode === event.classCode)) {
          session.activeExercises = event.exercises;
          session.activeExerciseId =
            event.exercises && event.exercises.length > 0 ? event.exercises[0].id : null;
          this.saveSession(session);
        }
        if (event.exercises && event.exercises.length > 0) {
          this.saveActiveExercises(event.exercises);
          if (!this.getActiveExercise()) {
            this.saveActiveExercise(event.exercises[0]);
          }
        } else {
          this.saveActiveExercises([]);
          this.saveActiveExercise(null);
        }
        break;
      }

      case 'EXERCISE_STARTED':
        if (event.exercise) {
          this.saveActiveExercise(event.exercise);
        }
        if (event.exercises && Array.isArray(event.exercises) && event.exercises.length > 0) {
          this.saveActiveExercises(event.exercises);
          if (!event.exercise) {
            this.saveActiveExercise(event.exercises[0]);
          }
        } else if (event.exercise) {
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

      case 'CLASS_SETTINGS_CHANGED': {
        const session = this.getSession();
        if (session && session.classCode === event.classCode) {
          session.allowSelfCheck = event.allowSelfCheck;
          if (event.selfCheckLimit !== undefined) {
            session.selfCheckLimit = event.selfCheckLimit;
          }
          this.saveSession(session);
        }
        break;
      }

      case 'CLASS_CLOSED': {
        const session = this.getSession();
        if (session && event.classCode && session.classCode !== event.classCode) break;
        if (session && (!event.classCode || session.classCode === event.classCode)) {
          session.status = 'closed';
          session.activeExercises = [];
          session.activeExerciseId = null;
          this.saveSession(session);
        }
        this.saveActiveExercises([]);
        this.saveActiveExercise(null);
        clearExercisesStorage();
        this.finishStudentSession('closed');
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
            history: this.getHistory(),
          });
        }
        break;
      }

      case 'SYNC_RESPONSE':
        if (event.session.status === 'closed' && this.getCurrentParticipant() && this.getSession()?.classCode === event.classCode) {
          this.finishStudentSession('closed');
          break;
        }
        this.saveSession(event.session);
        this.saveParticipants(event.participants);
        this.saveSubmissions(event.submissions);
        if (event.history) this.saveHistory(event.history);
        if (event.activeExercise) {
          this.saveActiveExercise(event.activeExercise);
        } else {
          this.saveActiveExercise(null);
        }
        if (event.activeExercises && event.activeExercises.length > 0) {
          this.saveActiveExercises(event.activeExercises);
        } else {
          this.saveActiveExercises([]);
        }
        break;
    }

    this.notifyListeners(event);
  }

  public notifyListeners(event: ClassroomEvent): void {
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

  /** Akhir sesi dari guru: simpan alasan sebelum identitas siswa dibersihkan. */
  private finishStudentSession(reason: StudentSessionEndReason): void {
    const participant = this.getCurrentParticipant();
    const session = this.getSession();
    if (!participant || !session || this.getLockedRole() === 'teacher') return;
    const event: ClassroomEvent = {
      type: 'STUDENT_SESSION_ENDED', classCode: session.classCode, participantId: participant.id, reason,
    };
    this.saveActiveExercises([]);
    this.saveActiveExercise(null);
    clearExercisesStorage();
    this.setParticipantToken(null);
    this.saveMySnapshot(null);
    this.setCurrentParticipant(null);
    this.setLockedRole(null);
    this.saveSession(null);
    this.saveParticipants([]);
    this.saveSubmissions({});
    this.pendingClassCode = null;
    this.resetRev();
    this.notifyListeners(event);
  }

  // --- Sinkronisasi dengan relay ---

  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncWatchersCount = 0;

  public startAutoSync(): () => void {
    this.syncWatchersCount++;
    if (this.syncWatchersCount === 1) {
      this.initAutoSyncTimer();
    }
    return () => {
      this.syncWatchersCount = Math.max(0, this.syncWatchersCount - 1);
      if (this.syncWatchersCount === 0 && this.syncTimer !== null) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
    };
  }

  private initAutoSyncTimer(): void {
    if (typeof window === 'undefined' && !this.opts.fetch) return;
    if (this.syncTimer !== null) clearInterval(this.syncTimer);
    this.syncTimer = setInterval(() => {
      const cur = this.getSession();
      const code =
        cur?.classCode && cur.status !== 'closed' ? cur.classCode : this.pendingClassCode;
      if (code) {
        void this.syncWithServer(code);
      }
    }, 2000);
  }

  /** Header autentikasi untuk GET /state: guru (token host) atau peserta (id + token). */
  private syncHeaders(code: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const session = this.getSession();
    const participant = this.getCurrentParticipant();
    const token = this.getParticipantToken();
    const isTeacher = this.getLockedRole() === 'teacher';
    if (!isTeacher && participant && token) {
      headers['X-Participant-Id'] = participant.id;
      headers['X-Participant-Token'] = token;
    } else if (session && session.classCode === code && session.hostToken) {
      headers['X-Host-Token'] = session.hostToken;
    }
    return headers;
  }

  /**
   * Pra-pemeriksaan sebelum siswa bergabung: apakah kelas ada, terkunci, atau ditutup.
   * `unreachable` = relay tidak ada/terjangkau (mode lokal satu browser tetap boleh).
   */
  public async checkClass(classCode: string): Promise<ClassCheckResult> {
    const code = normalizeClassCode(classCode);
    if (!code) return { status: 'not_found' };
    const doFetch = this.getFetch();
    if (doFetch) {
      try {
        const resp = await doFetch(this.relayUrl(`/state?code=${encodeURIComponent(code)}`));
        if (resp.ok) {
          const data = (await resp.json()) as {
            success?: unknown;
            session?: { status?: SessionStatus; title?: string } | null;
          };
          if (typeof data?.success === 'boolean') {
            if (!data.success) return { status: 'not_found' };
            return {
              status: 'found',
              classStatus: data.session?.status ?? 'open',
              title: data.session?.title ?? '',
            };
          }
        }
      } catch {
        // jatuh ke pemeriksaan lokal
      }
    }
    // Kelas guru di browser yang sama (BroadcastChannel/localStorage) tanpa relay.
    const local = this.getSession();
    if (local && local.classCode === code && !local.id.startsWith('pending-') && this.getLockedRole() !== 'student') {
      return { status: 'found', classStatus: local.status, title: local.title };
    }
    return { status: 'unreachable' };
  }

  public async syncWithServer(classCode?: string): Promise<boolean> {
    const code = normalizeClassCode(classCode || this.getSession()?.classCode || '');
    const doFetch = this.getFetch();
    if (!code || !doFetch) return false;
    const local = this.getSession();
    // Latihan mandiri (.oplab) murni lokal: tidak pernah menyinkronkan ke relay.
    if (local?.local && local.classCode === code) return false;

    const headers = this.syncHeaders(code);
    const authKey = headers['X-Participant-Id'] ?? (headers['X-Host-Token'] ? 'host' : 'anon');
    const key = `${code}|${authKey}`;
    // Jawaban siswa belum dikonfirmasi relay: minta tampilan penuh. Bila kiriman gagal, rev relay tidak
    // berubah sehingga respons "unchanged" akan menyembunyikan bahwa jawabannya tidak tercatat.
    const ownUnsettled = this.ownSubmission !== null && this.ownSubmission.state !== 'confirmed';
    const since =
      this.lastRevKey === key && this.lastRev !== null && !ownUnsettled ? `&since=${this.lastRev}` : '';

    try {
      const resp = await doFetch(
        this.relayUrl(`/state?code=${encodeURIComponent(code)}${since}`),
        { headers }
      );
      if (!resp.ok) return false;
      const data = await resp.json();
      if (!data || typeof data.success !== 'boolean') return false;
      if (!data.success) {
        // Relay hidup tetapi tidak mengenal kelas ini (mis. relay restart): guru mendaftarkannya kembali.
        this.maybeRestoreHost(code);
        return false;
      }

      const me = this.getCurrentParticipant();
      // Kode sama tetapi sesi berbeda: kelas siswa ini sudah hilang dan kodenya dipakai kelas lain
      // (mis. setelah relay restart). Jangan bergabung ulang atau mengirim jawaban ke kelas orang lain.
      if (me && this.isOtherClassSession(local, code, data.session)) {
        this.finishStudentSession('replaced');
        return true;
      }
      // Guru mengeluarkan siswa ini: relay hanya memberi tahu pemilik token tersebut.
      if (me && data.me?.status === 'kicked') {
        this.handleIncomingEvent({ type: 'PARTICIPANT_KICKED', classCode: code, participantId: me.id });
        return true;
      }
      if (me && data.session?.status === 'closed') {
        this.handleIncomingEvent({ type: 'CLASS_CLOSED', classCode: code });
        return true;
      }
      // Kelas ada tetapi relay tidak mengenal siswa ini (relay baru dipulihkan guru): daftar ulang otomatis.
      if (me && data.me?.status === 'unknown' && data.session?.status === 'open') {
        this.maybeRestoreParticipant(code, me);
      }

      if (data.unchanged) {
        this.lastRev = typeof data.rev === 'number' ? data.rev : this.lastRev;
        this.lastRevKey = key;
        return true;
      }

      const role: string = data.role ?? 'anonymous';
      let changed = false;

      // Perangkat memegang token host tetapi relay hanya memberi tampilan anonim: kode ini kini dimiliki
      // guru lain (mis. setelah relay restart). Jangan gabungkan data apa pun; beri tahu guru sekali.
      if (headers['X-Host-Token'] && role === 'anonymous') {
        if (Date.now() - this.lastMismatchAt > 60_000) {
          this.lastMismatchAt = Date.now();
          this.notifyListeners({
            type: 'RELAY_REJECTED',
            eventType: 'CLASS_CREATED',
            classCode: code,
            status: 403,
            message: `Kode kelas ${code} kini dipakai guru lain di server relay. Kelas Anda hanya berjalan lokal; buat kelas baru dengan kode lain agar siswa dapat bergabung.`,
          });
        }
        return true;
      }

      if (data.session) {
        const cur = this.getSession();
        let next: ClassSession | null = null;
        if (role === 'host' || role === 'participant') {
          if (!cur) {
            // Hanya perangkat yang sedang bergabung (bukan guru) yang boleh mengadopsi sesi relay.
            if (this.pendingClassCode === code && this.getLockedRole() !== 'teacher') {
              next = { ...data.session, hostToken: '' } as ClassSession;
            }
          } else if (cur.classCode === code) {
            // Relay tidak pernah mengirim hostToken: pertahankan milik perangkat ini.
            next = {
              ...data.session,
              hostToken: cur.hostToken,
              ...(cur.local ? { local: true } : {}),
            } as ClassSession;
          }
        } else if (cur && cur.classCode === code) {
          // Tampilan anonim hanya memuat info publik: jangan hapus data lokal lain.
          next = { ...cur, title: data.session.title ?? cur.title, status: data.session.status ?? cur.status };
        }
        if (next && JSON.stringify(cur) !== JSON.stringify(next)) {
          this.saveSession(next);
          changed = true;
        }
      }

      if (role === 'host' && Array.isArray(data.participants)) {
        // Relay adalah sumber kebenaran; hanya peserta hasil impor .opsub yang dipertahankan.
        const current = this.getParticipants();
        const relayIds = new Set<string>(data.participants.map((p: Participant) => p.id));
        const inGrace = Date.now() < this.restoreGraceUntil;
        // Normal: hanya data impor yang dipertahankan. Masa tenggang pemulihan: semua data lokal dipertahankan.
        const keepLocal = current.filter((p) => (p.imported || inGrace) && !relayIds.has(p.id));
        const merged = [...data.participants, ...keepLocal];
        if (JSON.stringify(merged) !== JSON.stringify(current)) {
          this.saveParticipants(merged);
          changed = true;
        }
      }

      if ((role === 'host' || role === 'participant') && data.submissions && typeof data.submissions === 'object') {
        const curSubs = this.getSubmissions();
        const merged: Record<string, Submission> = { ...data.submissions };
        if (role === 'host') {
          const inGrace = Date.now() < this.restoreGraceUntil;
          for (const [pid, sub] of Object.entries(curSubs)) {
            if ((sub.imported || inGrace) && !(pid in merged)) merged[pid] = sub;
          }
        } else if (me && curSubs[me.id] && !merged[me.id]) {
          this.reconcileOwnSubmission(code, curSubs[me.id], merged, me.id);
        }
        if (JSON.stringify(curSubs) !== JSON.stringify(merged)) {
          this.saveSubmissions(merged);
          changed = true;
        }
      }

      if (role === 'host' && Array.isArray(data.history)) {
        if (JSON.stringify(this.getHistory()) !== JSON.stringify(data.history)) {
          this.saveHistory(data.history);
          changed = true;
        }
      }

      if ((role === 'host' || role === 'participant') && Array.isArray(data.activeExercises)) {
        const curEx = this.getActiveExercises();
        if (JSON.stringify(data.activeExercises) !== JSON.stringify(curEx)) {
          this.saveActiveExercises(data.activeExercises);
          this.saveActiveExercise(data.activeExercise ?? data.activeExercises[0] ?? null);
          changed = true;
        }
      }

      if (typeof data.rev === 'number') {
        this.lastRev = data.rev;
        this.lastRevKey = key;
      }

      if (changed) {
        queueMicrotask(() => {
          const session = this.getSession();
          if (!session) return;
          const syncEvent: ClassroomEvent = {
            type: 'SYNC_RESPONSE',
            classCode: code,
            session,
            participants: this.getParticipants(),
            submissions: this.getSubmissions(),
            activeExercise: this.getActiveExercise(),
            activeExercises: this.getActiveExercises(),
            history: this.getHistory(),
          };
          this.listeners.forEach((fn) => {
            try {
              fn(syncEvent);
            } catch (e) {
              console.error(e);
            }
          });
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Relay tidak memegang jawaban yang tersimpan lokal. Masih di perjalanan → pertahankan.
   * Pernah diterima relay → ronde baru dimulai, lepaskan diam-diam. Belum pernah diterima → beri tahu
   * siswa bahwa jawabannya tidak sampai, agar ia dapat mengirim lagi (tombol kirim aktif kembali).
   */
  private reconcileOwnSubmission(
    code: string,
    local: Submission,
    merged: Record<string, Submission>,
    myId: string
  ): void {
    const own = this.ownSubmission;
    if (!own || own.submittedAt !== local.submittedAt) return;
    if (own.state === 'pending' && Date.now() - own.since < OWN_SUBMISSION_PENDING_MS) {
      merged[myId] = local;
      return;
    }
    this.ownSubmission = null;
    if (own.state === 'confirmed') return;
    this.notifyListeners({
      type: 'RELAY_REJECTED',
      eventType: 'SUBMISSION_RECEIVED',
      classCode: code,
      status: 0,
      message: 'Jawaban Anda belum diterima server (koneksi sempat terputus). Silakan klik Kirim Jawaban lagi.',
    });
  }

  /**
   * True bila relay melaporkan sesi dengan id berbeda untuk kode kelas yang sama dengan sesi lokal.
   * Sesi placeholder (`pending-`) dan relay lama yang tidak mengirim id tidak dapat dibandingkan → false.
   */
  private isOtherClassSession(
    local: ClassSession | null,
    code: string,
    remote: { id?: unknown } | null | undefined
  ): boolean {
    if (!local || local.classCode !== code || typeof local.id !== 'string' || local.id.startsWith('pending-')) {
      return false;
    }
    return typeof remote?.id === 'string' && remote.id !== '' && remote.id !== local.id;
  }

  // --- Pemulihan otomatis setelah relay restart ---

  private canRestoreNow(): boolean {
    const now = Date.now();
    if (now - this.lastRestoreAt < RESTORE_COOLDOWN_MS) return false;
    this.lastRestoreAt = now;
    return true;
  }

  /** Guru: daftarkan ulang kelas (ronde, status, soal, arsip nilai) tanpa mereset data lokal. */
  private maybeRestoreHost(code: string): void {
    const session = this.getSession();
    if (!session || session.classCode !== code || session.local || !session.hostToken || session.status === 'closed') return;
    if (this.getCurrentParticipant()) return;
    if (!this.canRestoreNow()) return;
    // Sengaja lewat postToRelay (bukan broadcast): broadcast akan mereset peserta/nilai lokal.
    this.postToRelay(
      { type: 'CLASS_CREATED', session, restore: true, history: this.getHistory() },
      {
        onRelayOk: () => {
          this.resetRev();
          this.restoreGraceUntil = Date.now() + RESTORE_GRACE_MS;
          this.notifyListeners({ type: 'RELAY_RESTORED', classCode: code, role: 'host' });
        },
        onRelayReject: (info) => {
          this.notifyListeners({
            type: 'RELAY_REJECTED',
            eventType: 'CLASS_CREATED',
            classCode: code,
            status: info.status,
            message: `Server relay kehilangan kelas ini dan tidak dapat memulihkannya: ${info.message}`,
          });
          return true;
        },
      }
    );
  }

  /** Siswa: bergabung kembali dengan id & token yang sama, lalu kirim ulang jawaban terakhir (jika ada). */
  private maybeRestoreParticipant(code: string, me: Participant): void {
    const session = this.getSession();
    if (!session || session.classCode !== code || session.local) return;
    if (!this.getParticipantToken()) return;
    // Join yang baru berjalan belum sempat diproses relay: jangan dianggap hilang.
    if (Date.now() - me.joinedAt < RESTORE_MIN_AGE_MS) return;
    if (!this.canRestoreNow()) return;

    this.postToRelay(
      { type: 'PARTICIPANT_JOINED', classCode: code, participant: { ...me, status: 'in_progress' } },
      {
        onRelayOk: () => this.notifyListeners({ type: 'RELAY_RESTORED', classCode: code, role: 'participant' }),
        onRelayReject: (info) => {
          this.notifyListeners({
            type: 'RELAY_REJECTED',
            eventType: 'PARTICIPANT_JOINED',
            classCode: code,
            status: info.status,
            message: `Gagal tersambung kembali ke kelas: ${info.message}`,
          });
          return true;
        },
      }
    );
    const submission = this.getSubmissions()[me.id];
    if (submission) {
      const snapshot = this.getMySnapshot();
      this.postToRelay(
        { type: 'SUBMISSION_RECEIVED', classCode: code, submission },
        { relayExtra: snapshot ? { snapshot } : undefined, onRelayReject: () => true }
      );
    }
  }

  // --- API Methods ---

  public createClass(
    title: string,
    customCode?: string,
    hostToken?: string,
    initialExercises?: Exercise[],
    options: { local?: boolean } = {}
  ): ClassSession {
    return this.createClassInternal(title, customCode, hostToken, initialExercises, options, AUTO_CODE_RETRIES);
  }

  private createClassInternal(
    title: string,
    customCode: string | undefined,
    hostToken: string | undefined,
    initialExercises: Exercise[] | undefined,
    options: { local?: boolean },
    retriesLeft: number
  ): ClassSession {
    const customNormalized = normalizeClassCode(customCode);
    const autoCode = !customNormalized;
    const code = customNormalized || `NET-${Math.floor(1000 + Math.random() * 9000)}`;
    this.pendingClassCode = code;
    this.resetRev();
    const exercisesList: Exercise[] =
      initialExercises && initialExercises.length > 0
        ? JSON.parse(JSON.stringify(initialExercises))
        : [];

    const session: ClassSession = {
      id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      classCode: code,
      title: title.trim() || 'Kelas Jaringan Komputer',
      status: 'open',
      hostToken: hostToken || generateSecret(),
      activeExerciseId: exercisesList.length > 0 ? exercisesList[0].id : null,
      activeExercises: exercisesList,
      allowSelfCheck: true,
      selfCheckLimit: 5,
      round: exercisesList.length > 0 ? 1 : 0,
      ...(options.local ? { local: true } : {}),
      createdAt: Date.now(),
    };

    this.saveSession(session);
    this.saveParticipants([]);
    this.saveSubmissions({});
    this.saveHistory([]);
    this.store().removeItem(STORAGE_KEY_SNAPSHOTS);
    if (exercisesList.length > 0) {
      this.saveActiveExercise(exercisesList[0]);
    } else {
      this.store().removeItem(STORAGE_KEY_ACTIVE_EXERCISE);
    }
    this.saveActiveExercises(exercisesList);

    this.broadcast(
      { type: 'CLASS_CREATED', session },
      {
        onRelayReject: (info) => {
          // Kode otomatis bentrok dengan kelas lain: coba kode baru secara diam-diam.
          if (autoCode && retriesLeft > 0 && info.status === 403) {
            this.rollbackRejectedEvent({ type: 'CLASS_CREATED', session });
            this.createClassInternal(title, undefined, hostToken, initialExercises, options, retriesLeft - 1);
            return true;
          }
          return false;
        },
      }
    );
    if (exercisesList.length > 0) {
      this.broadcast({
        type: 'EXERCISE_STARTED',
        classCode: code,
        exercise: exercisesList[0],
        exercises: exercisesList,
        hostToken: session.hostToken,
      });
    }

    return session;
  }

  public updateClassExercises(classCode: string, exercises: Exercise[]): void {
    const cleanCode = normalizeClassCode(classCode);
    const frozenList: Exercise[] = JSON.parse(JSON.stringify(exercises));
    const session = this.getSession();
    if (session && session.classCode === cleanCode) {
      session.activeExercises = frozenList;
      session.activeExerciseId = frozenList.length > 0 ? frozenList[0].id : null;
      this.saveSession(session);
    }
    if (frozenList.length > 0) {
      this.saveActiveExercise(frozenList[0]);
    } else {
      this.saveActiveExercise(null);
    }
    this.saveActiveExercises(frozenList);

    this.broadcast({
      type: 'EXERCISES_UPDATED',
      classCode: cleanCode,
      exercises: frozenList,
      hostToken: session?.hostToken,
    });
  }

  public toggleSelfCheck(classCode: string, allow: boolean): void {
    const cleanCode = normalizeClassCode(classCode);
    const session = this.getSession();
    if (session && session.classCode === cleanCode) {
      session.allowSelfCheck = allow;
      this.saveSession(session);
    }
    this.broadcast({
      type: 'CLASS_SETTINGS_CHANGED',
      classCode: cleanCode,
      allowSelfCheck: allow,
      selfCheckLimit: session?.selfCheckLimit,
      hostToken: session?.hostToken,
    });
  }

  /** Atur batas maksimal cek mandiri per soal. */
  public setSelfCheckLimit(classCode: string, limit: number): void {
    const cleanCode = normalizeClassCode(classCode);
    const safeLimit = Math.max(1, Math.min(99, Math.floor(limit)));
    const session = this.getSession();
    if (session && session.classCode === cleanCode) {
      session.selfCheckLimit = safeLimit;
      this.saveSession(session);
    }
    this.broadcast({
      type: 'CLASS_SETTINGS_CHANGED',
      classCode: cleanCode,
      allowSelfCheck: session?.allowSelfCheck ?? true,
      selfCheckLimit: safeLimit,
      hostToken: session?.hostToken,
    });
  }

  public joinClass(classCode: string, nickname: string): Participant | null {
    const cleanCode = normalizeClassCode(classCode);
    this.pendingClassCode = cleanCode;
    this.resetRev();
    let session = this.getSession();

    if (!session || session.classCode !== cleanCode) {
      // Minta sync dari host jika session belum ada di tab ini
      this.broadcast({ type: 'SYNC_REQUEST', classCode: cleanCode });
      // Buat session placeholder lokal agar HUD dan auto-sync langsung berfungsi.
      // Data lengkap akan ditimpa oleh state dari relay berikutnya.
      session = this.getSession();
      if (!session || session.classCode !== cleanCode) {
        session = {
          id: `pending-${Date.now()}`,
          classCode: cleanCode,
          title: '',
          status: 'open',
          hostToken: '',
          activeExerciseId: null,
          activeExercises: [],
          allowSelfCheck: true,
          createdAt: Date.now(),
        };
        this.saveSession(session);
      }
    }

    const participant: Participant = {
      id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nickname: nickname.trim() || `Siswa-${Math.floor(10 + Math.random() * 90)}`,
      joinedAt: Date.now(),
      status: 'in_progress',
    };

    this.setParticipantToken(generateSecret());
    const participants = this.getParticipants();
    this.saveParticipants([...participants, participant]);
    this.setCurrentParticipant(participant);

    this.broadcast({
      type: 'PARTICIPANT_JOINED',
      classCode: cleanCode,
      participant,
    });
    // Setelah join terkirim, tarik state penuh (soal aktif) tanpa menunggu siklus polling.
    void this.syncWithServer(cleanCode);

    return participant;
  }

  public startExercises(classCode: string, exercises: Exercise[]): void {
    if (!exercises || exercises.length === 0) {
      this.updateClassExercises(classCode, []);
      return;
    }
    const frozenList: Exercise[] = JSON.parse(JSON.stringify(exercises));
    const session = this.getSession();
    if (session) {
      this.archiveRound(session);
      session.activeExerciseId = frozenList[0].id;
      session.activeExercises = frozenList;
      session.round = (session.round ?? 0) + 1;
      this.saveSession(session);
    }
    this.saveActiveExercise(frozenList[0]);
    this.saveActiveExercises(frozenList);

    // Ronde baru: nilai lama sudah diarsipkan, status pengerjaan peserta dimulai ulang
    this.saveSubmissions({});
    this.store().removeItem(STORAGE_KEY_SNAPSHOTS);
    const participants = this.getParticipants().map((p) => ({
      ...p,
      status: p.status === 'left' ? p.status : ('in_progress' as const),
    }));
    this.saveParticipants(participants);

    this.broadcast({
      type: 'EXERCISE_STARTED',
      classCode: normalizeClassCode(classCode),
      exercise: frozenList[0],
      exercises: frozenList,
      hostToken: session?.hostToken,
    });
  }

  /** Arsipkan nilai ronde berjalan sebelum guru memulai soal baru (agar tidak hilang). */
  private archiveRound(session: ClassSession): void {
    const submissions = this.getSubmissions();
    if (Object.keys(submissions).length === 0) return;
    const entry: RoundHistory = {
      round: session.round ?? 0,
      endedAt: Date.now(),
      exercises: (session.activeExercises ?? []).map((ex) => ({ id: ex.id, title: ex.title })),
      participants: this.getParticipants().map((p) => ({ id: p.id, nickname: p.nickname })),
      submissions,
    };
    this.saveHistory([...this.getHistory(), entry]);
  }

  public startExercise(classCode: string, exercise: Exercise): void {
    this.startExercises(classCode, [exercise]);
  }

  /**
   * Kirim jawaban. `snapshot` (salinan ringkas topologi) hanya dikirim ke relay supaya guru dapat
   * menilai ulang dan memastikan skor yang diklaim memang hasil topologi itu.
   */
  /** Jawaban resmi milik siswa di perangkat ini untuk ronde berjalan (null = belum mengirim). */
  public getMySubmission(): Submission | null {
    const me = this.getCurrentParticipant();
    return me ? this.getSubmissions()[me.id] ?? null : null;
  }

  /**
   * Kirim jawaban resmi. Siswa hanya boleh mengirim SATU KALI per ronde: kiriman kedua diabaikan
   * (false) di sini dan ditolak relay (409). Ronde baru dari guru mengosongkan jawaban sehingga boleh kirim lagi.
   */
  public submitWork(classCode: string, submission: Submission, snapshot?: StarterTopology): boolean {
    const me = this.getCurrentParticipant();
    const isOwn = Boolean(me && me.id === submission.participantId);
    if (isOwn && this.getSubmissions()[submission.participantId]) return false;

    const subs = this.getSubmissions();
    subs[submission.participantId] = submission;
    this.saveSubmissions(subs);
    if (snapshot) this.saveMySnapshot(snapshot);

    const sentAt = submission.submittedAt;
    this.ownSubmission = isOwn ? { submittedAt: sentAt, state: 'pending', since: Date.now() } : null;
    const mark = (state: 'confirmed' | 'failed') => {
      if (this.ownSubmission?.submittedAt === sentAt) this.ownSubmission.state = state;
    };

    this.broadcast(
      {
        type: 'SUBMISSION_RECEIVED',
        classCode: normalizeClassCode(classCode),
        submission,
      },
      {
        relayExtra: snapshot ? { snapshot } : undefined,
        onRelayOk: () => mark('confirmed'),
        onRelayError: () => mark('failed'),
      }
    );
    return true;
  }

  private getMySnapshot(): StarterTopology | null {
    return this.readJson<StarterTopology | null>(this.sess(), STORAGE_KEY_MY_SNAPSHOT, null);
  }

  private saveMySnapshot(snapshot: StarterTopology | null): void {
    try {
      if (snapshot) this.sess().setItem(STORAGE_KEY_MY_SNAPSHOT, JSON.stringify(snapshot));
      else this.sess().removeItem(STORAGE_KEY_MY_SNAPSHOT);
    } catch {
      // kuota penyimpanan penuh: pemulihan akan mengirim jawaban tanpa snapshot
    }
  }

  /** Guru: ambil snapshot topologi seorang siswa (dari .opsub yang diimpor, atau dari relay dengan token host). */
  public async fetchSnapshot(classCode: string, participantId: string): Promise<StarterTopology | null> {
    const imported = this.readJson<Record<string, StarterTopology>>(this.store(), STORAGE_KEY_SNAPSHOTS, {});
    if (imported[participantId]) return imported[participantId];
    const code = normalizeClassCode(classCode);
    const doFetch = this.getFetch();
    const session = this.getSession();
    if (!code || !doFetch || !session?.hostToken || this.isLocalClassCode(code)) return null;
    try {
      const resp = await doFetch(
        this.relayUrl(`/snapshot?code=${encodeURIComponent(code)}&participantId=${encodeURIComponent(participantId)}`),
        { headers: { 'X-Host-Token': session.hostToken } }
      );
      const data = await resp.json();
      return data?.success && data.snapshot ? (data.snapshot as StarterTopology) : null;
    } catch {
      return null;
    }
  }

  /**
   * Guru mengimpor berkas jawaban (.opsub). Peserta dicocokkan hanya lewat id (nickname
   * yang sama tidak digabung) dan ditandai `imported` agar tidak terhapus oleh sinkronisasi relay.
   */
  public importSubmissions(items: Array<Submission | { submission: Submission; topology?: StarterTopology }>): number {
    const participants = this.getParticipants();
    const subs = this.getSubmissions();
    const snapshots = this.readJson<Record<string, StarterTopology>>(this.store(), STORAGE_KEY_SNAPSHOTS, {});
    let count = 0;
    for (const item of items) {
      const raw = 'submission' in item ? item.submission : item;
      const topology = 'submission' in item ? item.topology : undefined;
      const id =
        typeof raw.participantId === 'string' && raw.participantId.trim()
          ? raw.participantId
          : `stu-imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const existing = participants.find((p) => p.id === id);
      if (existing) {
        existing.status = 'submitted';
      } else {
        participants.push({
          id,
          nickname: raw.nickname,
          joinedAt: raw.submittedAt || Date.now(),
          status: 'submitted',
          imported: true,
        });
      }
      subs[id] = { ...raw, participantId: id, imported: true };
      if (topology && Array.isArray(topology.nodes) && Array.isArray(topology.edges)) {
        snapshots[id] = topology;
      }
      count++;
    }
    this.saveParticipants(participants);
    this.saveSubmissions(subs);
    try {
      if (Object.keys(snapshots).length > 0) this.store().setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots));
    } catch {
      // kuota penyimpanan penuh: jawaban tetap diimpor, hanya tanpa snapshot untuk verifikasi
    }
    return count;
  }

  public setStatus(classCode: string, status: SessionStatus): void {
    const session = this.getSession();
    if (session) {
      session.status = status;
      this.saveSession(session);
    }
    this.broadcast({
      type: 'CLASS_STATUS_CHANGED',
      classCode: normalizeClassCode(classCode),
      status,
      hostToken: session?.hostToken,
    });
  }

  public closeClass(classCode: string): void {
    const cleanCode = normalizeClassCode(classCode);
    const session = this.getSession();
    if (session && session.classCode === cleanCode) {
      session.status = 'closed';
      session.activeExercises = [];
      session.activeExerciseId = null;
      this.saveSession(session);
    }
    this.saveActiveExercises([]);
    this.saveActiveExercise(null);
    clearExercisesStorage();
    this.broadcast({
      type: 'CLASS_CLOSED',
      classCode: cleanCode,
      hostToken: session?.hostToken,
    });
    this.broadcast({
      type: 'EXERCISES_UPDATED',
      classCode: cleanCode,
      exercises: [],
      hostToken: session?.hostToken,
    });
  }

  // --- Storage Helpers ---
  public getSession(): ClassSession | null {
    return this.readJson<ClassSession | null>(this.store(), STORAGE_KEY_SESSION, null);
  }

  public saveSession(session: ClassSession | null): void {
    if (!session) {
      this.store().removeItem(STORAGE_KEY_SESSION);
      return;
    }
    this.store().setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  }

  public getParticipants(): Participant[] {
    return this.readJson<Participant[]>(this.store(), STORAGE_KEY_PARTICIPANTS, []);
  }

  public saveParticipants(list: Participant[]): void {
    this.store().setItem(STORAGE_KEY_PARTICIPANTS, JSON.stringify(list));
  }

  public getSubmissions(): Record<string, Submission> {
    return this.readJson<Record<string, Submission>>(this.store(), STORAGE_KEY_SUBMISSIONS, {});
  }

  public saveSubmissions(subs: Record<string, Submission>): void {
    this.store().setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(subs));
  }

  public getHistory(): RoundHistory[] {
    const list = this.readJson<RoundHistory[]>(this.store(), STORAGE_KEY_HISTORY, []);
    return Array.isArray(list) ? list : [];
  }

  public saveHistory(history: RoundHistory[]): void {
    if (!history || history.length === 0) {
      this.store().removeItem(STORAGE_KEY_HISTORY);
      return;
    }
    this.store().setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(-MAX_HISTORY_ROUNDS)));
  }

  public getActiveExercise(): Exercise | null {
    return this.readJson<Exercise | null>(this.store(), STORAGE_KEY_ACTIVE_EXERCISE, null);
  }

  public saveActiveExercise(exercise: Exercise | null): void {
    if (!exercise) {
      this.store().removeItem(STORAGE_KEY_ACTIVE_EXERCISE);
      return;
    }
    this.store().setItem(STORAGE_KEY_ACTIVE_EXERCISE, JSON.stringify(exercise));
  }

  public getActiveExercises(): Exercise[] {
    try {
      const raw = this.store().getItem(STORAGE_KEY_ACTIVE_EXERCISES);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list as Exercise[];
      }
    } catch {
      // Fallback
    }
    const single = this.getActiveExercise();
    return single ? [single] : [];
  }

  public saveActiveExercises(exercises: Exercise[]): void {
    if (!exercises || exercises.length === 0) {
      this.store().removeItem(STORAGE_KEY_ACTIVE_EXERCISES);
      return;
    }
    this.store().setItem(STORAGE_KEY_ACTIVE_EXERCISES, JSON.stringify(exercises));
  }

  public getCurrentParticipant(): Participant | null {
    return this.readJson<Participant | null>(this.sess(), STORAGE_KEY_CURRENT_PARTICIPANT, null);
  }

  public setCurrentParticipant(participant: Participant | null): void {
    if (participant) {
      this.sess().setItem(STORAGE_KEY_CURRENT_PARTICIPANT, JSON.stringify(participant));
    } else {
      this.sess().removeItem(STORAGE_KEY_CURRENT_PARTICIPANT);
    }
    this.notifyListeners({ type: 'PARTICIPANT_CHANGED', participant });
  }

  /** Rahasia peserta di perangkat ini (per tab); tidak pernah dikirim ke peserta lain. */
  public getParticipantToken(): string | null {
    try {
      return this.sess().getItem(STORAGE_KEY_PARTICIPANT_TOKEN) || null;
    } catch {
      return null;
    }
  }

  private setParticipantToken(token: string | null): void {
    if (token) {
      this.sess().setItem(STORAGE_KEY_PARTICIPANT_TOKEN, token);
    } else {
      this.sess().removeItem(STORAGE_KEY_PARTICIPANT_TOKEN);
    }
  }

  // --- Kuota cek mandiri (bertahan saat refresh, di-reset otomatis tiap ronde baru) ---

  private selfCheckKey(exerciseId: string): string | null {
    const session = this.getSession();
    if (!session) return null;
    const participant = this.getCurrentParticipant();
    return `${session.classCode}|${participant?.id ?? 'anon'}|${session.round ?? 0}|${exerciseId}`;
  }

  public getSelfCheckCount(exerciseId: string): number {
    const key = this.selfCheckKey(exerciseId);
    if (!key) return 0;
    const map = this.readJson<Record<string, number>>(this.sess(), STORAGE_KEY_SELF_CHECK, {});
    return map[key] ?? 0;
  }

  public incrementSelfCheckCount(exerciseId: string): number {
    const key = this.selfCheckKey(exerciseId);
    if (!key) return 0;
    const map = this.readJson<Record<string, number>>(this.sess(), STORAGE_KEY_SELF_CHECK, {});
    map[key] = (map[key] ?? 0) + 1;
    const keys = Object.keys(map);
    if (keys.length > MAX_SELF_CHECK_KEYS) {
      for (const old of keys.slice(0, keys.length - MAX_SELF_CHECK_KEYS)) delete map[old];
    }
    this.sess().setItem(STORAGE_KEY_SELF_CHECK, JSON.stringify(map));
    return map[key];
  }

  public getLockedRole(): 'teacher' | 'student' | null {
    try {
      const raw = this.sess().getItem(STORAGE_KEY_LOCKED_ROLE);
      if (raw === 'teacher' || raw === 'student') return raw;
    } catch {
      // Fallback
    }
    return null;
  }

  public setLockedRole(role: 'teacher' | 'student' | null): void {
    const prevRole = this.getLockedRole();

    if (role) {
      this.sess().setItem(STORAGE_KEY_LOCKED_ROLE, role);
      if (role === 'teacher') {
        // Mode guru: lepas status sebagai siswa
        this.setCurrentParticipant(null);
      } else if (role === 'student' && prevRole === 'teacher') {
        // Keluar dari mode guru: bersihkan soal aktif, bank soal, dan sesi kelas
        this.handleTeacherExitCleanup();
      }
    } else {
      this.sess().removeItem(STORAGE_KEY_LOCKED_ROLE);
      if (prevRole === 'teacher') {
        // Keluar dari mode guru: bersihkan soal aktif, bank soal, dan sesi kelas
        this.handleTeacherExitCleanup();
      }
    }
    this.notifyListeners({ type: 'ROLE_CHANGED', role });
  }

  private handleTeacherExitCleanup(): void {
    const session = this.getSession();
    const classCode = session?.classCode || '';
    if (session && session.status !== 'closed') {
      this.closeClass(session.classCode);
    } else {
      if (session) {
        session.status = 'closed';
        session.activeExercises = [];
        session.activeExerciseId = null;
        this.saveSession(session);
      }
      this.saveActiveExercises([]);
      this.saveActiveExercise(null);
      clearExercisesStorage();
      this.broadcast({
        type: 'CLASS_CLOSED',
        classCode,
        hostToken: session?.hostToken,
      });
      this.broadcast({
        type: 'EXERCISES_UPDATED',
        classCode,
        exercises: [],
        hostToken: session?.hostToken,
      });
    }
  }

  public isStudentActive(): boolean {
    const role = this.getLockedRole();
    if (role === 'teacher') return false;
    return role === 'student' || this.getCurrentParticipant() !== null;
  }

  public kickParticipant(classCode: string, participantId: string): void {
    const session = this.getSession();
    this.broadcast({
      type: 'PARTICIPANT_KICKED',
      classCode: normalizeClassCode(classCode),
      participantId,
      hostToken: session?.hostToken,
    });
  }

  /**
   * Siswa meninggalkan kelas tetapi tetap berada di Mode Siswa (dapat bergabung ke kelas lain).
   * Guru diberi tahu lewat PARTICIPANT_LEFT dan polling dihentikan.
   */
  public leaveCurrentClass(): void {
    const session = this.getSession();
    const participant = this.getCurrentParticipant();

    if (participant && session) {
      // Kirim event ke relay agar guru tahu siswa sudah keluar (token dihitung sinkron di broadcast)
      this.broadcast({
        type: 'PARTICIPANT_LEFT',
        classCode: session.classCode,
        participantId: participant.id,
      });
    }

    this.saveActiveExercises([]);
    this.saveActiveExercise(null);
    clearExercisesStorage();
    this.setParticipantToken(null);
    this.saveMySnapshot(null);
    this.setCurrentParticipant(null);

    if (session && this.getLockedRole() !== 'teacher') {
      // Hentikan polling kelas lama dan jangan tinggalkan sesi basi di perangkat siswa
      this.saveSession(null);
      this.saveParticipants([]);
      this.saveSubmissions({});
      this.pendingClassCode = null;
      this.resetRev();
    }
  }

  public leaveClass(): void {
    const role = this.getLockedRole();

    if (role === 'teacher') {
      this.handleTeacherExitCleanup();
    }

    this.leaveCurrentClass();
    this.setLockedRole(null);
  }

  public clearAll(): void {
    const curSession = this.getSession();
    const classCode = curSession?.classCode || '';
    const store = this.store();
    store.removeItem(STORAGE_KEY_SESSION);
    store.removeItem(STORAGE_KEY_PARTICIPANTS);
    store.removeItem(STORAGE_KEY_SUBMISSIONS);
    store.removeItem(STORAGE_KEY_HISTORY);
    store.removeItem(STORAGE_KEY_SNAPSHOTS);
    this.saveMySnapshot(null);
    store.removeItem(STORAGE_KEY_ACTIVE_EXERCISE);
    store.removeItem(STORAGE_KEY_ACTIVE_EXERCISES);
    this.sess().removeItem(STORAGE_KEY_SELF_CHECK);
    clearExercisesStorage();
    this.saveActiveExercises([]);
    this.saveActiveExercise(null);
    this.setParticipantToken(null);
    this.setCurrentParticipant(null);
    this.setLockedRole(null);
    this.pendingClassCode = null;
    this.resetRev();
    this.broadcast({
      type: 'CLASS_CLOSED',
      classCode,
      hostToken: curSession?.hostToken,
    });
    this.broadcast({
      type: 'EXERCISES_UPDATED',
      classCode,
      exercises: [],
      hostToken: curSession?.hostToken,
    });
  }
}

export const classroomHub = new ClassroomHub();
