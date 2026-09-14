import type { Exercise, ExerciseTarget, Submission } from './types';
import { DEFAULT_EXERCISES } from './defaultExercises';
import type { DeviceType } from '../../types/network';
import { isTopologyJson, convertTopologyToExercise } from './topologyExerciseConverter';

const STORAGE_KEY_EXERCISES = 'openpacket_classroom_exercises';

export interface ParseExerciseResult {
  success: boolean;
  exercises: Exercise[];
  errors: string[];
}

export interface ParseSubmissionResult {
  success: boolean;
  submission?: Submission;
  topology?: { nodes: any[]; edges: any[] };
  error?: string;
}

/**
 * Validasi dan parse satu objek target latihan
 */
export function validateExerciseTarget(target: unknown, index: number): { target?: ExerciseTarget; error?: string } {
  if (!target || typeof target !== 'object') {
    return { error: `Target #${index + 1}: format harus berupa objek JSON.` };
  }

  const t = target as Record<string, unknown>;
  const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `tgt-${Date.now()}-${index}`;
  const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : `Kriteria #${index + 1}`;
  const type = t.type as ExerciseTarget['type'];

  const validTypes: ExerciseTarget['type'][] = [
    'device_config',
    'link_exists',
    'reachability',
    'required_device_count',
    'vlan_config',
  ];

  if (!validTypes.includes(type)) {
    return {
      error: `Target #${index + 1} ("${title}"): tipe "${String(type)}" tidak valid. Harus salah satu dari: ${validTypes.join(', ')}`,
    };
  }

  switch (type) {
    case 'device_config': {
      const devId = (t.deviceId || t.deviceLabel) as string;
      const addr = (t.address || t.expectedIp || t.ipAddress) as string;
      if (!devId || typeof devId !== 'string') {
        return { error: `Target "${title}": field "deviceId" wajib diisi string (mis. "PC-1").` };
      }
      if (!addr || typeof addr !== 'string') {
        return { error: `Target "${title}": field "address" wajib diisi IP valid (mis. "192.168.1.10").` };
      }
      return {
        target: {
          id,
          title,
          type: 'device_config',
          deviceId: devId,
          address: addr,
          subnetMask: typeof t.subnetMask === 'string' ? t.subnetMask : (typeof t.expectedMask === 'string' ? t.expectedMask : undefined),
          prefix: typeof t.prefix === 'number' ? t.prefix : undefined,
          gateway: typeof t.gateway === 'string' ? t.gateway : (typeof t.defaultGateway === 'string' ? t.defaultGateway : undefined),
        },
      };
    }

    case 'link_exists': {
      const from = (t.fromDeviceId || t.deviceA || t.sourceDevice) as string;
      const to = (t.toDeviceId || t.deviceB || t.targetDevice) as string;
      if (!from || !to) {
        return {
          error: `Target "${title}": field "fromDeviceId" dan "toDeviceId" wajib diisi (mis. "PC-1" & "Switch-1").`,
        };
      }
      return {
        target: {
          id,
          title,
          type: 'link_exists',
          fromDeviceId: String(from),
          toDeviceId: String(to),
        },
      };
    }

    case 'reachability': {
      const src = (t.sourceDeviceId || t.fromDeviceId || t.sourceDevice) as string;
      const dst = (t.destinationDeviceId || t.targetDeviceId || t.toDeviceId || t.destinationDevice) as string;
      if (!src || !dst) {
        return {
          error: `Target "${title}": field "sourceDeviceId" dan "destinationDeviceId" wajib diisi (mis. "PC-1" & "Server-1").`,
        };
      }
      return {
        target: {
          id,
          title,
          type: 'reachability',
          sourceDeviceId: String(src),
          destinationDeviceId: String(dst),
        },
      };
    }

    case 'required_device_count': {
      const count = Number(t.count);
      const validDeviceTypes: DeviceType[] = ['router', 'switch', 'pc', 'laptop', 'server', 'accessPoint', 'hub', 'cloud'];
      const rawType = t.deviceType === 'access_point' ? 'accessPoint' : (t.deviceType as DeviceType);
      if (!rawType || !validDeviceTypes.includes(rawType) || isNaN(count) || count <= 0) {
        return {
          error: `Target "${title}": field "deviceType" (${validDeviceTypes.join('/')}) dan "count" (> 0) wajib diisi.`,
        };
      }
      return {
        target: {
          id,
          title,
          type: 'required_device_count',
          deviceType: rawType,
          count,
        },
      };
    }

    case 'vlan_config': {
      const vlanId = Number(t.vlanId);
      if (!t.deviceId || !t.portId || isNaN(vlanId)) {
        return {
          error: `Target "${title}": field "deviceId", "portId", dan "vlanId" (angka) wajib diisi.`,
        };
      }
      return {
        target: {
          id,
          title,
          type: 'vlan_config',
          deviceId: String(t.deviceId),
          portId: String(t.portId),
          vlanId,
          mode: t.mode === 'trunk' ? 'trunk' : 'access',
        },
      };
    }
  }
}

/**
 * Validasi satu objek Exercise
 */
export function validateExercise(item: unknown, itemIndex: number = 0): { exercise?: Exercise; error?: string } {
  if (!item || typeof item !== 'object') {
    return { error: `Item #${itemIndex + 1}: bukan objek JSON yang valid.` };
  }

  const ex = item as Record<string, unknown>;

  if (!ex.title || typeof ex.title !== 'string' || !ex.title.trim()) {
    return { error: `Item #${itemIndex + 1}: "title" soal tidak boleh kosong.` };
  }

  if (!ex.instructions || typeof ex.instructions !== 'string') {
    return { error: `Soal "${ex.title}": "instructions" materi soal tidak boleh kosong.` };
  }

  const id = typeof ex.id === 'string' && ex.id.trim() ? ex.id.trim() : `ex-${Date.now()}-${itemIndex}`;
  const difficulty: Exercise['difficulty'] =
    ex.difficulty === 'Dasar' || ex.difficulty === 'Menengah' || ex.difficulty === 'Lanjutan'
      ? ex.difficulty
      : 'Menengah';

  if (!Array.isArray(ex.targets) || ex.targets.length === 0) {
    return { error: `Soal "${ex.title}": wajib memiliki minimal 1 kriteria target di array "targets".` };
  }

  const validTargets: ExerciseTarget[] = [];
  for (let i = 0; i < ex.targets.length; i++) {
    const res = validateExerciseTarget(ex.targets[i], i);
    if (res.error) {
      return { error: `Soal "${ex.title}" -> ${res.error}` };
    }
    if (res.target) {
      validTargets.push(res.target);
    }
  }

  return {
    exercise: {
      id,
      title: ex.title.trim(),
      instructions: ex.instructions.trim(),
      difficulty,
      targets: validTargets,
      starterTemplateId: typeof ex.starterTemplateId === 'string' ? ex.starterTemplateId : undefined,
      starterTopology:
        ex.starterTopology && typeof ex.starterTopology === 'object'
          ? (ex.starterTopology as { nodes: any[]; edges: any[] })
          : undefined,
    },
  };
}

/**
 * Parse string JSON yang diunggah oleh guru.
 * Mendukung format single object `{ ... }` atau array `[ { ... }, { ... } ]`.
 */
export function parseExerciseJson(rawJson: string): ParseExerciseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      success: false,
      exercises: [],
      errors: [`Format JSON tidak valid: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // 0. Deteksi format paket lab (.oplab)
  if (
    parsed &&
    typeof parsed === 'object' &&
    'format' in parsed &&
    (parsed as Record<string, unknown>).format === 'openpacket_lab_package' &&
    'exercise' in parsed
  ) {
    parsed = (parsed as Record<string, unknown>).exercise;
  }

  // 1. Deteksi Cerdas: Jika file berupa topologi OpenPacket (memiliki "nodes" dan "edges")
  if (isTopologyJson(parsed)) {
    try {
      const converted = convertTopologyToExercise(parsed);
      return {
        success: true,
        exercises: [converted],
        errors: [],
      };
    } catch (err) {
      return {
        success: false,
        exercises: [],
        errors: [`Gagal mengonversi file topologi: ${err instanceof Error ? err.message : String(err)}`],
      };
    }
  }

  const listToValidate = Array.isArray(parsed) ? parsed : [parsed];
  const validatedExercises: Exercise[] = [];
  const errors: string[] = [];

  listToValidate.forEach((item, idx) => {
    const res = validateExercise(item, idx);
    if (res.error) {
      errors.push(res.error);
    } else if (res.exercise) {
      validatedExercises.push(res.exercise);
    }
  });

  if (errors.length > 0 && validatedExercises.length === 0) {
    return {
      success: false,
      exercises: [],
      errors,
    };
  }

  return {
    success: true,
    exercises: validatedExercises,
    errors,
  };
}

/**
 * Ekspor soal ke file JSON dan unduh di browser
 */
export function exportExercisesToJsonFile(data: Exercise | Exercise[], defaultFilename?: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  let filename = defaultFilename;
  if (!filename) {
    if (Array.isArray(data)) {
      filename = `bank-soal-openpacket-${Date.now()}.json`;
    } else {
      const safeTitle = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      filename = `soal-${safeTitle || 'latihan'}.json`;
    }
  }

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Ekspor paket praktikum mandiri (.oplab) berisi soal dan topologi awal
 */
export function exportLabPackageFile(exercise: Exercise, defaultFilename?: string): void {
  const payload = {
    format: 'openpacket_lab_package',
    version: '1.0',
    createdAt: Date.now(),
    exercise,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeTitle = exercise.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const filename = defaultFilename || `paket-soal-${safeTitle || 'praktikum'}.oplab`;

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Ekspor berkas lembar jawaban siswa (.opsub) untuk diserahkan ke guru
 */
export function exportSubmissionPackageFile(
  submission: Submission,
  topology: { nodes: any[]; edges: any[] },
  defaultFilename?: string
): void {
  const payload = {
    format: 'openpacket_submission',
    version: '1.0',
    submittedAt: Date.now(),
    studentNickname: submission.nickname,
    exerciseId: submission.exerciseId,
    submission,
    topology,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeName = submission.nickname.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
  const filename = defaultFilename || `jawaban-${safeName || 'siswa'}-${Date.now()}.opsub`;

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse file berkas lembar jawaban siswa (.opsub)
 */
export function parseSubmissionJson(rawJson: string): ParseSubmissionResult {
  try {
    const data = JSON.parse(rawJson) as Record<string, unknown>;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'File lembar jawaban bukan objek JSON valid.' };
    }

    if (data.format === 'openpacket_submission' && data.submission) {
      return {
        success: true,
        submission: data.submission as Submission,
        topology: data.topology as { nodes: any[]; edges: any[] } | undefined,
      };
    }

    // Toleransi jika user mengunggah raw submission object
    if (data.participantId && data.nickname && typeof data.score === 'number' && data.evaluation) {
      return {
        success: true,
        submission: data as unknown as Submission,
        topology: data.topology as { nodes: any[]; edges: any[] } | undefined,
      };
    }

    return {
      success: false,
      error: 'Format berkas tidak dikenali sebagai file lembar jawaban (.opsub) OpenPacket.',
    };
  } catch (err) {
    return {
      success: false,
      error: `Gagal membaca file lembar jawaban: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
    // Fallback if blocked
  }
  return memoryStore;
}

/**
 * Persistent storage helper untuk daftar soal guru
 */
export function loadExercises(): Exercise[] {
  try {
    const raw = getStorage().getItem(STORAGE_KEY_EXERCISES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as Exercise[];
      }
    }
  } catch (err) {
    console.warn('[ExerciseParser] Gagal membaca storage soal:', err);
  }
  return DEFAULT_EXERCISES;
}

export function saveExercises(list: Exercise[]): void {
  try {
    getStorage().setItem(STORAGE_KEY_EXERCISES, JSON.stringify(list));
  } catch (err) {
    console.warn('[ExerciseParser] Gagal menyimpan storage soal:', err);
  }
}

export function clearExercisesStorage(): void {
  getStorage().removeItem(STORAGE_KEY_EXERCISES);
}
