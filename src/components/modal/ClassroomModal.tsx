import { useState, useEffect, useRef } from 'react';
import {
  Users,
  GraduationCap,
  Play,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Copy,
  Check,
  Send,
  Sparkles,
  Eye,
  LogOut,
  HelpCircle,
  FileCheck2,
  Upload,
  Download,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  BookOpen,
  CheckCheck,
  UserMinus,
  Hash,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  classroomHub,
  normalizeClassCode,
} from '../../features/classroom/classroomHub';
import { evaluatePacket, buildPacketSubmission } from '../../features/classroom/submissionBuilder';
import { prepareStarterTopology } from '../../features/classroom/starterTopology';
import { csvCell } from '../../features/classroom/csv';
import { verifySubmission, gradeImportedWork, compactTopology, type VerificationResult } from '../../features/classroom/verification';
import { studentWorkspace } from '../../features/classroom/studentWorkspace';
import {
  loadExercises,
  saveExercises,
  clearExercisesStorage,
  parseExerciseJson,
  exportExercisesToJsonFile,
  exportLabPackageFile,
  parseSubmissionJson,
} from '../../features/classroom/exerciseParser';
import { convertTopologyToExercise } from '../../features/classroom/topologyExerciseConverter';
import { ExerciseEditorModal } from './ExerciseEditorModal';
import { ClassroomRoleGate } from '../classroom/ClassroomRoleGate';
import type {
  ClassSession,
  Participant,
  Exercise,
  Submission,
  ExerciseEvaluation,
  RoundHistory,
  StarterTopology,
} from '../../features/classroom/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface ClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Salin teks; `navigator.clipboard` tidak ada di http:// non-localhost (kasus LAN kelas), jadi ada cadangan. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // jatuh ke cadangan
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const exerciseKey = (list: Array<{ id: string }>) => list.map((x) => x.id).join('|');

export function ClassroomModal({ isOpen, onClose }: ClassroomModalProps) {
  const { nodes, edges, loadTopology, pushToast, requestConfirm } = useAppStore();

  const [lockedRole, setLockedRole] = useState<'teacher' | 'student' | null>(() => {
    const role = classroomHub.getLockedRole();
    if (role) return role;
    if (classroomHub.getCurrentParticipant()) return 'student';
    const sess = classroomHub.getSession();
    if (sess && sess.status !== 'closed') return 'teacher';
    return null;
  });
  const handleSelectRole = (role: 'teacher' | 'student') => {
    if (role === 'student') {
      // Switching to student: clear any lingering teacher active exercises
      classroomHub.saveActiveExercises([]);
      classroomHub.saveActiveExercise(null);
      clearExercisesStorage();
      setExercises([]);
      setSelectedExercise(null);
      setActiveExercise(null);
      setSelectedExamExerciseIds([]);
    }
    classroomHub.setLockedRole(role);
    setLockedRole(role);
    if (role === 'teacher') {
      pushToast('info', 'Mode Guru aktif. Akses siswa dinonaktifkan di perangkat ini.');
    } else {
      pushToast('info', 'Mode Siswa aktif. Akses administrasi guru dinonaktifkan di perangkat ini.');
    }
  };

  // Teacher State
  const [session, setSession] = useState<ClassSession | null>(null);
  const [classTitle, setClassTitle] = useState('Praktikum Jaringan Komputer');
  const [customCode, setCustomCode] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [history, setHistory] = useState<RoundHistory[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  // Hasil verifikasi ulang skor siswa (dinilai ulang dari snapshot topologi, hanya di memori perangkat guru).
  const [verification, setVerification] = useState<Record<string, VerificationResult>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  // Penanda paket soal aktif terakhir: seleksi centang guru hanya direset bila paket aktif benar-benar berubah.
  const lastActiveKeyRef = useRef<string>('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [reviewedSubmission, setReviewedSubmission] = useState<Submission | null>(null);
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  // Editor Soal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const oplabInputRef = useRef<HTMLInputElement>(null);
  const opsubInputRef = useRef<HTMLInputElement>(null);

  // Student State
  const [studentClassCode, setStudentClassCode] = useState('');
  const [studentNickname, setStudentNickname] = useState('');
  const [joinedParticipant, setJoinedParticipant] = useState<Participant | null>(null);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);
  const [myEvaluation, setMyEvaluation] = useState<ExerciseEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Seleksi Multi-Soal untuk Paket Ujian
  const [selectedExamExerciseIds, setSelectedExamExerciseIds] = useState<string[]>([]);

  // Helper eliminasi total seluruh data guru, soal, dan storage
  const purgeAllTeacherData = () => {
    const curSess = session || classroomHub.getSession();
    const code = (curSess?.classCode || '').trim();
    // closeClass sudah menyiarkan CLASS_CLOSED + EXERCISES_UPDATED lengkap dengan token host.
    if (code) classroomHub.closeClass(code);
    classroomHub.saveActiveExercises([]);
    classroomHub.saveActiveExercise(null);
    clearExercisesStorage();
    setExercises([]);
    setSelectedExercise(null);
    setActiveExercise(null);
    setSelectedExamExerciseIds([]);
    lastActiveKeyRef.current = '';
    setSession(null);
    setParticipants([]);
    setSubmissions({});
    setHistory([]);
    setJoinedParticipant(null);
    setMyEvaluation(null);
    classroomHub.leaveClass();
    classroomHub.setLockedRole(null);
    setLockedRole(null);
  };

  // Handler Guru: Keluar Mode Guru
  const handleExitTeacherMode = () => {
    requestConfirm({
      title: 'Keluar Mode Guru?',
      message:
        'Keluar Mode Guru? Sesi kelas (jika aktif) akan dihentikan, seluruh bank soal serta soal aktif akan sepenuhnya dihapus dari perangkat ini.',
      confirmLabel: 'Keluar Mode Guru',
      onConfirm: () => {
        purgeAllTeacherData();
        pushToast('info', 'Berhasil keluar dari Mode Guru. Seluruh soal dan sesi telah dibersihkan.');
      },
    });
  };

  // Handler Siswa: Keluar Mode Siswa
  const handleExitStudentMode = () => {
    requestConfirm({
      title: 'Keluar Mode Siswa?',
      message: 'Keluar Mode Siswa? Anda akan keluar dari peran siswa dan sesi praktikum kelas.',
      confirmLabel: 'Keluar Mode Siswa',
      onConfirm: () => {
        classroomHub.leaveClass();
        classroomHub.setLockedRole(null);
        setLockedRole(null);
        setJoinedParticipant(null);
        setActiveExercise(null);
        setSession(null);
        setParticipants([]);
        setSubmissions({});
        setMyEvaluation(null);
        pushToast('info', 'Berhasil keluar dari Mode Siswa.');
      },
    });
  };

  // Handler tutup modal: menutup modal tanpa menghapus sesi atau peran aktif
  const handleModalClose = () => {
    onClose();
  };

  // Inisialisasi state dari storage saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;

    const role = classroomHub.getLockedRole();
    if (role) {
      setLockedRole(role);
    }

    const existingSession = classroomHub.getSession();
    if (existingSession) {
      setSession(existingSession);
      setParticipants(classroomHub.getParticipants());
      setSubmissions(classroomHub.getSubmissions());
      setHistory(classroomHub.getHistory());
      void classroomHub.syncWithServer(existingSession.classCode);
    }

    const curParticipant = classroomHub.getCurrentParticipant();
    if (curParticipant) {
      setJoinedParticipant(curParticipant);
    }

    const activeEx = classroomHub.getActiveExercise();
    if (activeEx) {
      setSelectedExercise(activeEx);
      setActiveExercise(activeEx);
    }

    const activeList = classroomHub.getActiveExercises();
    lastActiveKeyRef.current = exerciseKey(activeList);
    if (activeList && activeList.length > 0) {
      setSelectedExamExerciseIds(activeList.map((x) => x.id));
    }

    const loaded = loadExercises();
    if (loaded.length > 0) {
      setExercises(loaded);
      if (!activeEx) {
        setSelectedExercise((prev) => prev || loaded[0]);
      }
    }
  }, [isOpen]);

  // Sinkronisasi berkala dengan server relay selama modal aktif
  useEffect(() => {
    if (!isOpen) return;
    const unsub = classroomHub.startAutoSync();
    return unsub;
  }, [isOpen]);

  // Langganan event realtime BroadcastChannel
  useEffect(() => {
    const unsubscribe = classroomHub.subscribe((event) => {
      switch (event.type) {
        case 'CLASS_CREATED':
          setSession(event.session);
          setParticipants([]);
          setSubmissions({});
          setHistory([]);
          lastActiveKeyRef.current = exerciseKey(event.session.activeExercises ?? []);
          if (event.session.activeExercises && event.session.activeExercises.length > 0) {
            setSelectedExamExerciseIds(event.session.activeExercises.map((x) => x.id));
          }
          break;

        case 'PARTICIPANT_JOINED':
          setParticipants((prev) => {
            if (prev.some((p) => p.id === event.participant.id)) return prev;
            return [...prev, event.participant];
          });
          break;

        case 'PARTICIPANT_LEFT':
        case 'PARTICIPANT_KICKED':
          // Hub sudah memperbarui storage (siswa yang sudah mengumpulkan ditandai "left", lainnya dihapus).
          setParticipants(classroomHub.getParticipants());
          break;

        case 'RELAY_REJECTED':
          // Penolakan saat PEMULIHAN otomatis tidak menghapus kelas lokal guru; hanya penolakan pembuatan awal.
          if (event.eventType === 'CLASS_CREATED' && !classroomHub.getSession()) {
            setSession(null);
            setParticipants([]);
            setSubmissions({});
          }
          // Jawaban siswa ditolak/tidak sampai: hub sudah membatalkannya, tombol kirim aktif kembali.
          if (event.eventType === 'SUBMISSION_RECEIVED') setSubmissions(classroomHub.getSubmissions());
          pushToast('error', event.message);
          break;

        case 'RELAY_RESTORED':
          pushToast(
            'info',
            event.role === 'host'
              ? 'Server relay sempat restart. Kelas dipulihkan otomatis; siswa akan tersambung kembali dalam beberapa detik.'
              : 'Server kelas sempat restart — Anda tersambung kembali otomatis.'
          );
          break;

        case 'EXERCISES_UPDATED':
          lastActiveKeyRef.current = exerciseKey(event.exercises ?? []);
          if (event.exercises && event.exercises.length > 0) {
            setSelectedExercise(event.exercises[0]);
            setActiveExercise(event.exercises[0]);
            setSelectedExamExerciseIds(event.exercises.map((x) => x.id));
          } else {
            setSelectedExercise(null);
            setActiveExercise(null);
            setSelectedExamExerciseIds([]);
          }
          break;

        case 'EXERCISE_STARTED':
          if (event.exercise) {
            setSelectedExercise(event.exercise);
            setActiveExercise(event.exercise);
          }
          setMyEvaluation(null);
          // Ronde baru: nilai ronde lama pindah ke riwayat, tabel berjalan dimulai ulang.
          setHistory(classroomHub.getHistory());
          setSubmissions(classroomHub.getSubmissions());
          setParticipants(classroomHub.getParticipants());
          setSession(classroomHub.getSession());
          if (event.exercises && event.exercises.length > 0) {
            lastActiveKeyRef.current = exerciseKey(event.exercises);
            setSelectedExamExerciseIds(event.exercises.map((x) => x.id));
          }
          break;

        case 'SUBMISSION_RECEIVED':
          setSubmissions((prev) => ({
            ...prev,
            [event.submission.participantId]: event.submission,
          }));
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === event.submission.participantId
                ? { ...p, status: 'submitted' as const }
                : p
            )
          );
          break;

        case 'CLASS_STATUS_CHANGED':
          setSession((prev) => (prev ? { ...prev, status: event.status } : null));
          break;

        case 'CLASS_SETTINGS_CHANGED':
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  allowSelfCheck: event.allowSelfCheck,
                  ...(event.selfCheckLimit !== undefined
                    ? { selfCheckLimit: event.selfCheckLimit }
                    : {}),
                }
              : null
          );
          break;

        case 'CLASS_CLOSED':
          setSession((prev) => (prev ? { ...prev, status: 'closed' } : null));
          setExercises([]);
          clearExercisesStorage();
          setSelectedExercise(null);
          setActiveExercise(null);
          setSelectedExamExerciseIds([]);
          break;

        case 'ROLE_CHANGED':
          setLockedRole(event.role);
          if (event.role !== 'teacher') {
            setExercises([]);
            clearExercisesStorage();
            setSelectedExercise(null);
            setActiveExercise(null);
            setSelectedExamExerciseIds([]);
          }
          break;

        case 'PARTICIPANT_CHANGED':
          setJoinedParticipant(event.participant);
          if (!event.participant) {
            setActiveExercise(null);
          }
          break;

        case 'SYNC_RESPONSE': {
          setSession(event.session);
          setParticipants(event.participants);
          setSubmissions(event.submissions);
          if (event.history) setHistory(event.history);
          // Polling terjadi tiap ada siswa bergabung/mengumpulkan. Centang soal yang sedang disiapkan
          // guru TIDAK boleh ikut ter-reset; hanya sinkronkan bila paket aktif benar-benar berubah.
          const nextKey = exerciseKey(event.activeExercises ?? []);
          if (nextKey !== lastActiveKeyRef.current) {
            lastActiveKeyRef.current = nextKey;
            if (event.activeExercise) {
              setSelectedExercise(event.activeExercise);
              setActiveExercise(event.activeExercise);
            } else {
              setSelectedExercise(null);
              setActiveExercise(null);
            }
            if (event.activeExercises && event.activeExercises.length > 0) {
              setSelectedExamExerciseIds(event.activeExercises.map((x) => x.id));
            } else {
              setSelectedExamExerciseIds([]);
            }
          }
          break;
        }
      }
    });

    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      unsubscribe();
    };
  }, []);

  // Handler Guru: Toggle Soal Masuk ke Paket Ujian
  const handleToggleSelectExerciseForExam = (id: string) => {
    setSelectedExamExerciseIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) {
          pushToast('warning', 'Minimal harus ada 1 soal terpilih untuk ujian.');
          return prev;
        }
        return prev.filter((x) => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Handler Guru: Pilih Semua Soal untuk Ujian
  const handleSelectAllForExam = () => {
    setSelectedExamExerciseIds(exercises.map((e) => e.id));
    pushToast('info', `Seluruh (${exercises.length}) soal ditandai untuk paket ujian.`);
  };

  // Handler Guru: Uji Soal Ini Saja (Single Exercise)
  const handleSelectOnlyThisForExam = (ex: Exercise, autoBroadcast = false) => {
    setSelectedExercise(ex);
    setSelectedExamExerciseIds([ex.id]);
    if (autoBroadcast && session) {
      if (rejectUnscorable([ex])) return;
      classroomHub.startExercises(session.classCode, [ex]);
      pushToast('success', `Tantangan "${ex.title}" disiarkan sebagai satu-satunya soal ujian.`);
    } else {
      pushToast('info', `Soal "${ex.title}" dipilih untuk ujian.`);
    }
  };

  /** Soal tanpa target tidak bisa dinilai; jangan sampai tersiar ke siswa. */
  const rejectUnscorable = (chosen: Exercise[]): boolean => {
    const empty = chosen.find((e) => e.targets.length === 0);
    if (!empty) return false;
    pushToast('warning', `Soal "${empty.title}" belum memiliki target penilaian. Tambahkan minimal satu target di editor soal.`);
    return true;
  };

  // Handler Guru: Siarkan Paket Ujian Terpilih (Multi atau Single)
  const handleBroadcastExamPacket = () => {
    if (!session) return;
    const chosen = exercises.filter((e) => selectedExamExerciseIds.includes(e.id));
    if (chosen.length === 0) {
      pushToast('warning', 'Pilih minimal 1 soal untuk diujikan.');
      return;
    }
    if (rejectUnscorable(chosen)) return;
    classroomHub.startExercises(session.classCode, chosen);
    setSelectedExercise(chosen[0]);
    pushToast(
      'success',
      `Paket ujian dengan ${chosen.length} soal berhasil disiarkan ke seluruh siswa!`
    );
  };

  // Handler Guru: Perbarui Soal Kelas (Kirim soal baru/tambahan tanpa mereset pengerjaan murid yang sudah berjalan)
  const handleUpdateClassExercises = () => {
    if (!session) return;
    const chosen = exercises.filter((e) => selectedExamExerciseIds.includes(e.id));
    if (chosen.length === 0) {
      pushToast('warning', 'Pilih minimal 1 soal dari Bank Soal untuk disiarkan ke kelas.');
      return;
    }
    if (rejectUnscorable(chosen)) return;
    classroomHub.updateClassExercises(session.classCode, chosen);
    setSelectedExercise(chosen[0]);
    pushToast(
      'success',
      `Paket soal kelas berhasil diperbarui (${chosen.length} soal aktif disiarkan). Pengerjaan siswa tetap aman.`
    );
  };
  // Handler Guru: Kosongkan / Tarik Soal Aktif dari Kelas
  const handleClearActiveExercises = () => {
    if (!session) return;
    requestConfirm({
      title: 'Kosongkan Soal Aktif Kelas?',
      message:
        'Soal aktif yang sedang disiarkan ke siswa akan ditiadakan. Siswa tidak akan melihat soal aktif sampai Anda menyiarkan soal baru.',
      confirmLabel: 'Kosongkan Soal',
      onConfirm: () => {
        classroomHub.updateClassExercises(session.classCode, []);
        classroomHub.saveActiveExercises([]);
        classroomHub.saveActiveExercise(null);
        setSelectedExamExerciseIds([]);
        setSelectedExercise(null);
        setActiveExercise(null);
        pushToast('info', 'Seluruh soal aktif berhasil ditarik dan dikosongkan dari kelas.');
      },
    });
  };
  // Handler Guru: Kosongkan Seluruh Bank Soal
  const handleClearExerciseBank = () => {
    requestConfirm({
      title: 'Kosongkan Seluruh Bank Soal?',
      message:
        'Seluruh soal dalam Bank Soal di perangkat ini akan segera dihapus permanen. Lanjutkan?',
      confirmLabel: 'Kosongkan Bank Soal',
      onConfirm: () => {
        clearExercisesStorage();
        setExercises([]);
        setSelectedExercise(null);
        setActiveExercise(null);
        setSelectedExamExerciseIds([]);
        classroomHub.saveActiveExercises([]);
        classroomHub.saveActiveExercise(null);
        const curSess = session || classroomHub.getSession();
        if (curSess) {
          classroomHub.broadcast({
            type: 'EXERCISES_UPDATED',
            classCode: curSess.classCode,
            exercises: [],
          });
        }
        pushToast('info', 'Seluruh soal di Bank Soal berhasil dikosongkan.');
      },
    });
  };



  // Handler Guru: Buat Kelas Baru
  const handleCreateClass = async () => {
    if (isCreatingClass) return;
    const chosen = exercises.filter((e) => selectedExamExerciseIds.includes(e.id));
    if (rejectUnscorable(chosen)) return;
    const toUse = chosen.length > 0 ? chosen : [];
    // Kode kustom: periksa dulu di relay agar guru tidak melihat "Kelas dibuka" lalu langsung ditolak.
    // Kode otomatis tidak perlu: bentrokannya sudah dicoba ulang diam-diam oleh hub.
    const wantedCode = normalizeClassCode(customCode);
    if (wantedCode) {
      setIsCreatingClass(true);
      let check: Awaited<ReturnType<typeof classroomHub.checkClass>>;
      try {
        check = await classroomHub.checkClass(wantedCode);
      } finally {
        setIsCreatingClass(false);
      }
      if (check.status === 'found' && check.classStatus !== 'closed') {
        pushToast(
          'error',
          `Kode kelas ${wantedCode} sedang dipakai kelas lain yang masih aktif. Gunakan kode lain, atau kosongkan agar kode dibuat otomatis.`
        );
        return;
      }
    }
    const newSession = classroomHub.createClass(
      classTitle,
      customCode,
      undefined,
      toUse
    );
    setSession(newSession);
    setParticipants([]);
    setSubmissions({});
    setSelectedExercise(toUse[0] || null);
    pushToast(
      'success',
      toUse.length > 0
        ? `Kelas dibuka dengan ${toUse.length} soal aktif! Kode Kelas: ${newSession.classCode}.`
        : `Kelas dibuka (0 soal aktif)! Kode Kelas: ${newSession.classCode}. Anda dapat menambahkan dan menyiarkan soal kapan saja.`
    );
  };

  // Handler Import File JSON Soal
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const parseResult = parseExerciseJson(content);
      if (!parseResult.success) {
        pushToast('error', `Gagal mengimpor JSON: ${parseResult.errors.join('; ')}`);
        return;
      }

      const newItems = parseResult.exercises;
      const merged = [...exercises];
      let added = 0;
      let updated = 0;

      for (const item of newItems) {
        const existingIdx = merged.findIndex((x) => x.id === item.id);
        if (existingIdx >= 0) {
          merged[existingIdx] = item;
          updated++;
        } else {
          merged.push(item);
          added++;
        }
      }

      setExercises(merged);
      saveExercises(merged);

      if (newItems.length > 0) {
        setSelectedExercise(newItems[0]);
        // Jangan otomatis ubah ujian yang sedang berlangsung siswa
        setEditingExercise(newItems[0]);
        setIsEditorOpen(true);
      }

      pushToast(
        'success',
        `Sukses mengimpor: ${added} soal baru ditambahkan${updated > 0 ? `, ${updated} soal diperbarui` : ''}. Silakan sesuaikan teks panduan.`
      );
    };

    reader.onerror = () => {
      pushToast('error', 'Gagal membaca file dari sistem.');
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  // Handler Guru: Buat Soal Langsung dari Topologi Kanvas Aktif
  const handleCreateFromCanvas = () => {
    if (nodes.length === 0) {
      pushToast('warning', 'Kanvas masih kosong! Tambahkan perangkat ke kanvas terlebih dahulu.');
      return;
    }
    const converted = convertTopologyToExercise({
      nodes,
      edges,
    });
    setEditingExercise(converted);
    setIsEditorOpen(true);
    pushToast('info', 'Topologi kanvas aktif berhasil dikonversi menjadi soal praktikum!');
  };

  // Handler Simpan Soal dari Editor
  const handleSaveExercise = (savedExercise: Exercise) => {
    const idx = exercises.findIndex((x) => x.id === savedExercise.id);
    let updatedList: Exercise[];
    if (idx >= 0) {
      updatedList = [...exercises];
      updatedList[idx] = savedExercise;
    } else {
      updatedList = [...exercises, savedExercise];
    }

    setExercises(updatedList);
    saveExercises(updatedList);
    setSelectedExercise(savedExercise);
    // CATATAN: Menyimpan ke katalog bank soal tidak otomatis mengubah sesi ujian aktif siswa!
    pushToast('success', `Soal "${savedExercise.title}" berhasil disimpan di bank soal.`);
  };

  // Handler Hapus Soal
  const handleDeleteExercise = (e: React.MouseEvent, exId: string) => {
    e.stopPropagation();
    const updated = exercises.filter((x) => x.id !== exId);
    setExercises(updated);
    saveExercises(updated);
    setSelectedExamExerciseIds((prev) => prev.filter((id) => id !== exId));
    if (selectedExercise?.id === exId) {
      setSelectedExercise(updated.length > 0 ? updated[0] : null);
    }
    if (activeExercise?.id === exId) {
      setActiveExercise(null);
    }
    if (updated.length === 0) {
      clearExercisesStorage();
      setSelectedExercise(null);
      setActiveExercise(null);
      setSelectedExamExerciseIds([]);
      classroomHub.saveActiveExercises([]);
      classroomHub.saveActiveExercise(null);
      const curSess = session || classroomHub.getSession();
      if (curSess) {
        classroomHub.broadcast({
          type: 'EXERCISES_UPDATED',
          classCode: curSess.classCode,
          exercises: [],
        });
      }
    }
    pushToast('info', 'Soal telah dihapus dari bank soal.');
  };

  // Handler Buka Editor untuk Edit Soal
  const handleEditExercise = (e: React.MouseEvent, ex: Exercise) => {
    e.stopPropagation();
    setEditingExercise(ex);
    setIsEditorOpen(true);
  };

  // Handler Buka Editor untuk Buat Soal Baru
  const handleCreateNewExercise = () => {
    setEditingExercise(null);
    setIsEditorOpen(true);
  };

  // Handler Ekspor Semua Soal ke JSON
  const handleExportAllExercises = () => {
    exportExercisesToJsonFile(exercises, `bank-soal-${session ? session.classCode : 'praktikum'}.json`);
    pushToast('success', 'File bank soal (.json) berhasil diunduh.');
  };

  // Handler Guru: Toggle Izin Cek Mandiri Siswa (Mode Latihan vs Mode Ujian)
  const handleToggleSelfCheck = () => {
    if (!session) return;
    const nextVal = session.allowSelfCheck === false;
    classroomHub.toggleSelfCheck(session.classCode, nextVal);
    setSession({ ...session, allowSelfCheck: nextVal });
    pushToast(
      'info',
      nextVal
        ? 'Cek mandiri diaktifkan: Siswa dapat mengecek target praktikum mandiri.'
        : 'Cek mandiri dinonaktifkan: Mode ujian aktif — siswa tidak bisa melihat checklist evaluasi sebelum submit.'
    );
  };

  // Handler Guru: Toggle Kunci Kelas
  const handleToggleLock = () => {
    if (!session) return;
    const newStatus = session.status === 'open' ? 'locked' : 'open';
    classroomHub.setStatus(session.classCode, newStatus);
    setSession({ ...session, status: newStatus });
    pushToast(
      'info',
      newStatus === 'locked'
        ? 'Kelas dikunci. Peserta baru tidak dapat bergabung.'
        : 'Kelas dibuka kembali untuk peserta.'
    );
  };

  // Handler Guru: Tutup Kelas
  const handleCloseClass = () => {
    const graded = Object.keys(submissions).length;
    requestConfirm({
      title: 'Tutup Kelas?',
      message:
        `Sesi kelas akan diakhiri untuk semua siswa, seluruh bank soal dihapus dari perangkat ini, dan Anda keluar dari Mode Guru.` +
        (participants.length > 0
          ? ` Rekap nilai (${participants.length} peserta, ${graded} jawaban) tidak tersimpan — unduh CSV lebih dulu bila masih diperlukan.`
          : ''),
      confirmLabel: 'Tutup & Hapus',
      onConfirm: () => {
        purgeAllTeacherData();
        pushToast('info', 'Sesi kelas telah diakhiri dan seluruh soal telah dibersihkan.');
      },
    });
  };

  // Handler Siswa: Gabung Kelas
  const handleJoinClass = async () => {
    if (!studentClassCode.trim()) {
      pushToast('warning', 'Masukkan kode kelas yang diberikan oleh guru.');
      return;
    }
    if (isJoining) return;
    setIsJoining(true);
    try {
      // Periksa dulu apakah kelas ada / terkunci / sudah ditutup, supaya siswa tidak "terhubung" ke kelas kosong.
      const check = await classroomHub.checkClass(studentClassCode);
      if (check.status === 'not_found') {
        pushToast('error', 'Kode kelas tidak ditemukan. Periksa kembali kode dari guru.');
        return;
      }
      if (check.status === 'found' && check.classStatus === 'closed') {
        pushToast('error', 'Kelas ini sudah ditutup oleh guru.');
        return;
      }
      if (check.status === 'found' && check.classStatus === 'locked') {
        pushToast('warning', 'Kelas sedang dikunci oleh guru. Minta guru membuka sesi agar Anda dapat bergabung.');
        return;
      }
      if (check.status === 'unreachable') {
        pushToast('info', 'Server relay tidak terjangkau — bergabung dalam mode lokal (hanya perangkat/browser yang sama dengan guru).');
      }

      const participant = classroomHub.joinClass(
        studentClassCode,
        studentNickname || 'Siswa'
      );
      if (participant) {
        setJoinedParticipant(participant);
        const activeEx = classroomHub.getActiveExercise();
        setActiveExercise(activeEx);
        pushToast('success', `Selamat datang, ${participant.nickname}! Lembar kerja interaktif disematkan di pojok kanan kanvas.`);
        handleModalClose(); // Tutup modal agar siswa langsung melihat kanvas dan HUD
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Handler Siswa: Buka Paket Tugas Mandiri (.oplab)
  const handleImportOplab = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const res = parseExerciseJson(content);
      if (!res.success || res.exercises.length === 0) {
        pushToast('error', res.errors[0] || 'Gagal membaca berkas tugas .oplab');
        return;
      }

      const exercise = res.exercises[0];
      const nickname = studentNickname.trim() || 'Siswa Mandiri';
      const code = 'MANDIRI';

      // Tugas mandiri adalah sesi LOKAL: tidak dikirim ke relay, sehingga siswa lain yang juga
      // membuka .oplab tidak saling menimpa soal di ruang "MANDIRI" bersama.
      const existing = classroomHub.getSession();
      if (existing && !existing.local && classroomHub.getCurrentParticipant()) {
        pushToast('warning', 'Anda sedang mengikuti kelas guru. Keluar dari kelas lebih dulu sebelum membuka tugas mandiri.');
        return;
      }
      if (existing) classroomHub.leaveCurrentClass(); // buang sesi basi / latihan mandiri sebelumnya
      const sess = classroomHub.createClass('Praktikum Mandiri', code, undefined, undefined, { local: true });
      setSession(sess);

      // Mulai soal dan join sebagai peserta
      classroomHub.startExercise(code, exercise);
      const participant = classroomHub.joinClass(code, nickname);
      if (participant) {
        setJoinedParticipant(participant);
        setActiveExercise(exercise);
        pushToast('success', `Paket tugas "${exercise.title}" berhasil dimuat! Lembar kerja aktif di kanvas.`);
        handleModalClose();
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // Handler Guru: Impor Massal Berkas Jawaban Siswa (.opsub)
  const handleImportOpsub = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const valid: Array<{ submission: Submission; topology?: StarterTopology }> = [];
    const problems: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const res = parseSubmissionJson(text);
        if (res.success && res.submission) {
          const submission = await gradeImportedWork(res.submission, res.topology ?? null, [...exercises, ...currentRoundExercises()]);
          valid.push({ submission, topology: res.topology });
        } else {
          problems.push(`${file.name}: ${res.error ?? 'format tidak dikenali'}`);
        }
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof Error ? err.message : 'gagal dibaca'}`);
      }
    }

    if (valid.length > 0) {
      // Hub menandai data impor agar tidak terhapus oleh sinkronisasi relay berikutnya.
      const count = classroomHub.importSubmissions(valid);
      setParticipants(classroomHub.getParticipants());
      setSubmissions(classroomHub.getSubmissions());
      pushToast('success', `${count} berkas lembar jawaban siswa (.opsub) berhasil diimpor.`);
    } else {
      pushToast('error', 'Tidak ada berkas lembar jawaban .opsub yang valid.');
    }
    if (problems.length > 0) {
      pushToast('warning', `${problems.length} berkas dilewati: ${problems.slice(0, 2).join('; ')}${problems.length > 2 ? '; …' : ''}`);
    }

    if (e.target) e.target.value = '';
  };

  /** Soal yang berlaku pada ronde berjalan (dipakai untuk menilai ulang jawaban ronde ini). */
  const currentRoundExercises = (): Exercise[] => {
    const seen = new Map<string, Exercise>();
    for (const ex of [...(session?.activeExercises ?? []), ...classroomHub.getActiveExercises()]) seen.set(ex.id, ex);
    return [...seen.values()];
  };

  const verifyOne = async (participantId: string): Promise<VerificationResult | null> => {
    const sub = classroomHub.getSubmissions()[participantId];
    if (!sub || !session) return null;
    const snapshot = await classroomHub.fetchSnapshot(session.classCode, participantId);
    const result = await verifySubmission(sub, snapshot, currentRoundExercises());
    setVerification((prev) => ({ ...prev, [participantId]: result }));
    return result;
  };

  const handleVerifyOne = async (participantId: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    try {
      const r = await verifyOne(participantId);
      if (!r) return;
      if (r.status === 'match') pushToast('success', `Skor terverifikasi: penilaian ulang menghasilkan ${r.verifiedScore}/100, sama dengan yang diklaim.`);
      else if (r.status === 'mismatch') pushToast('warning', `Skor TIDAK cocok: diklaim ${r.claimedScore}, hasil penilaian ulang ${r.verifiedScore}.`);
      else pushToast('info', r.reason ?? 'Jawaban ini tidak dapat diverifikasi.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyAll = async () => {
    if (isVerifying) return;
    const ids = Object.keys(classroomHub.getSubmissions());
    if (ids.length === 0) {
      pushToast('info', 'Belum ada jawaban untuk diverifikasi.');
      return;
    }
    setIsVerifying(true);
    let match = 0;
    let mismatch = 0;
    let unavailable = 0;
    try {
      for (const id of ids) {
        const r = await verifyOne(id);
        if (!r) continue;
        if (r.status === 'match') match++;
        else if (r.status === 'mismatch') mismatch++;
        else unavailable++;
      }
      pushToast(
        mismatch > 0 ? 'warning' : 'success',
        `Verifikasi selesai: ${match} cocok, ${mismatch} berbeda, ${unavailable} tidak dapat diverifikasi.`
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const verificationLabel = (participantId: string, sub: Submission | undefined): string => {
    const v = verification[participantId];
    if (!sub || !v || v.submittedAt !== sub.submittedAt) return 'belum diverifikasi';
    if (v.status === 'match') return 'cocok';
    if (v.status === 'mismatch') return `berbeda (nilai sebenarnya ${v.verifiedScore})`;
    return 'tidak tersedia';
  };

  const renderVerification = (participantId: string, sub: Submission) => {
    const v = verification[participantId];
    if (!v || v.submittedAt !== sub.submittedAt) return (
      <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground">{sub.ungraded ? 'Belum dinilai' : 'Belum diverifikasi'}</Badge>
    );
    if (v.status === 'match') {
      return (
        <Badge
          variant="outline"
          className="ml-2 gap-1 border-viz-green/40 bg-viz-green/10 text-[10px] text-viz-green"
          title="Penilaian ulang dari snapshot topologi siswa menghasilkan skor yang sama."
        >
          <ShieldCheck className="h-3 w-3" />
          Terverifikasi
        </Badge>
      );
    }
    if (v.status === 'mismatch') {
      return (
        <Badge
          variant="outline"
          className="ml-2 gap-1 border-viz-red/40 bg-viz-red/10 text-[10px] text-viz-red"
          title={`Skor yang diklaim siswa (${v.claimedScore}) berbeda dari hasil penilaian ulang (${v.verifiedScore}).`}
        >
          <XCircle className="h-3 w-3" />
          Sebenarnya {v.verifiedScore}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground" title={v.reason}>
        Tak terverifikasi
      </Badge>
    );
  };

  // Handler Guru: Ekspor Nilai Peserta ke CSV
  const handleExportGradesCsv = () => {
    if (participants.length === 0) {
      pushToast('info', 'Belum ada data peserta untuk diekspor.');
      return;
    }

    const headers = ['No', 'Ronde', 'Nama Siswa', 'Status', 'Skor', 'Skor per Soal', 'Target Tercapai', 'Feedback Evaluasi', 'Waktu Submit', 'Verifikasi'];
    const titleById = new Map<string, string>();
    for (const ex of [...(session?.activeExercises ?? []), ...exercises]) titleById.set(ex.id, ex.title);
    for (const h of history) for (const ex of h.exercises) titleById.set(ex.id, ex.title);

    // Satu blok per ronde: ronde yang sudah diarsipkan lebih dulu, lalu ronde berjalan.
    const rounds: Array<{
      round: number;
      participants: Array<{ id: string; nickname: string; status: string }>;
      submissions: Record<string, Submission>;
    }> = [
      ...history.map((h) => ({ round: h.round, participants: h.participants.map((p) => ({ ...p, status: 'submitted' })), submissions: h.submissions })),
      { round: session?.round ?? 0, participants, submissions },
    ];

    let no = 0;
    const rows: string[] = [];
    for (const r of rounds) {
      for (const p of r.participants) {
        const sub = r.submissions[p.id];
        if (!sub && r.round !== (session?.round ?? 0)) continue; // ronde lama: hanya yang mengumpulkan
        no++;
        const evals = sub?.evaluations && Object.keys(sub.evaluations).length > 0
          ? Object.values(sub.evaluations)
          : sub
          ? [sub.evaluation]
          : [];
        const total = evals.reduce((n, ev) => n + ev.checks.length, 0);
        const passed = evals.reduce((n, ev) => n + ev.checks.filter((c) => c.passed).length, 0);
        const perExercise = sub?.exerciseScores && !sub.ungraded
          ? Object.entries(sub.exerciseScores).map(([id, s]) => `${titleById.get(id) ?? id}: ${s}`).join('; ')
          : '-';
        rows.push(
          [
            no,
            r.round,
            csvCell(p.nickname),
            csvCell(sub?.ungraded ? 'ungraded' : sub ? sub.status : p.status),
            sub && !sub.ungraded ? sub.score : '',
            csvCell(perExercise),
            csvCell(sub && !sub.ungraded ? `${passed}/${total}` : '-'),
            csvCell(sub?.ungraded ? 'Belum dinilai oleh guru.' : sub ? sub.evaluation.feedback : '-'),
            csvCell(sub ? new Date(sub.submittedAt).toLocaleTimeString() : '-'),
            csvCell(sub && r.round === (session?.round ?? 0) ? verificationLabel(p.id, sub) : '-'),
          ].join(',')
        );
      }
    }

    // BOM UTF-8 agar Excel membaca nama berakses/emoji dengan benar.
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rekap-nilai-${session?.classCode || 'kelas'}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    pushToast('success', 'Rekap nilai kelas berhasil diunduh dalam format CSV.');
  };

  // Handler Siswa: Muat Starter Template ke Kanvas
  const handleLoadStarterTemplate = () => {
    const doLoad = () => {
      // Selalu lewat pembersih yang sama dengan HUD: IP, rute, dan VLAN sasaran penilaian dikosongkan.
      const prepared = activeExercise ? prepareStarterTopology(activeExercise) : null;
      if (prepared) {
        loadTopology({ nodes: prepared.nodes, edges: prepared.edges });
        pushToast(
          'success',
          prepared.source.kind === 'template'
            ? `Template "${prepared.source.name}" diterapkan ke kanvas (konfigurasi dikosongkan untuk latihan).`
            : 'Topologi soal dari guru berhasil dimuat ke kanvas Anda (konfigurasi dikosongkan untuk latihan).'
        );
        handleModalClose(); // Tutup modal agar siswa langsung melihat kanvas
        return;
      }

      pushToast('info', 'Soal ini dirancang untuk dirakit dari awal pada kanvas kosong.');
    };

    if (nodes.length > 0) {
      requestConfirm({
        title: 'Muat Topologi Soal?',
        message: 'Memuat topologi ini akan menimpa seluruh node dan koneksi yang ada di kanvas Anda saat ini. Lanjutkan?',
        confirmLabel: 'Muat Topologi',
        onConfirm: doLoad,
      });
    } else {
      doLoad();
    }
  };

  // Siswa: Kirim Jawaban hanya sekali per ronde, dengan konfirmasi (sama dengan HUD).
  const mySubmitted = Boolean(joinedParticipant && submissions[joinedParticipant.id]);
  const confirmSubmitWork = () => {
    if (!activeExercise || !joinedParticipant || !session || isEvaluating) return;
    if (classroomHub.getMySubmission()) {
      pushToast('info', 'Jawaban sudah dikirim untuk ronde ini dan tidak dapat diubah.');
      return;
    }
    requestConfirm({
      title: 'Kirim Jawaban?',
      message:
        'Jawaban hanya dapat dikirim SATU KALI untuk ronde ini dan tidak dapat diubah setelah terkirim. ' +
        (session.allowSelfCheck === false
          ? 'Periksa kembali pekerjaan Anda sebelum mengirim.'
          : 'Gunakan Cek Mandiri terlebih dahulu bila ingin memeriksa pekerjaan.'),
      confirmLabel: 'Ya, Kirim Jawaban',
      onConfirm: () => void handleSubmitWork(),
    });
  };

  // Handler Siswa: Submit Jawaban & Evaluasi Otomatis
  const handleSubmitWork = async () => {
    if (!activeExercise || !joinedParticipant || !session) return;
    if (classroomHub.getMySubmission()) return;
    setIsEvaluating(true);

    try {
      // Sama dengan HUD: seluruh soal dalam paket dinilai, skor akhir = rata-rata.
      const active = classroomHub.getActiveExercises();
      const packetExercises = active.length > 0 ? active : [activeExercise];
      const scope = `${session.id}:${joinedParticipant.id}:${session.round ?? 0}`;
      const stored = studentWorkspace.read(scope);
      const focusId = stored.selectedExerciseId ?? activeExercise.id;
      studentWorkspace.save(scope, focusId, useAppStore.getState());
      const topologies = studentWorkspace.read(scope).topologies;
      const packet = await evaluatePacket(packetExercises, nodes, edges, {}, topologies);
      const evaluation = packet.evaluations[activeExercise.id] ?? Object.values(packet.evaluations)[0];
      setMyEvaluation(evaluation);

      const submission = buildPacketSubmission(joinedParticipant, packetExercises, activeExercise.id, packet);
      if (!classroomHub.submitWork(session.classCode, submission, { ...compactTopology(nodes, edges), exerciseTopologies: topologies })) {
        pushToast('info', 'Jawaban sudah dikirim untuk ronde ini dan tidak dapat diubah.');
        return;
      }

      pushToast(
        packet.status === 'passed' ? 'success' : 'info',
        packetExercises.length > 1
          ? `Nilai rata-rata: ${packet.averageScore}/100 (${packetExercises.length} soal).`
          : `Nilai: ${evaluation.score}/100. ${evaluation.feedback}`
      );
    } catch (err) {
      pushToast('error', `Evaluasi gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const copyClassCode = async () => {
    if (!session) return;
    const ok = await copyText(session.classCode);
    if (!ok) {
      pushToast('warning', `Gagal menyalin otomatis. Salin manual kode kelas: ${session.classCode}`);
      return;
    }
    setIsCopiedCode(true);
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setIsCopiedCode(false);
      copyTimerRef.current = null;
    }, 2000);
  };
  const renderExerciseCatalog = (isActiveSession: boolean) => {
    const activeExamIds =
      session?.activeExercises?.map((x) => x.id) ||
      (session?.activeExerciseId ? [session.activeExerciseId] : []);

    return (
      <Card className="flex flex-col gap-3.5 p-4 border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {isActiveSession
                    ? 'Katalog & Kontrol Paket Ujian Kelas'
                    : 'Katalog Bank Soal Praktikum'}
                </h4>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40 font-mono">
                  {selectedExamExerciseIds.length} dari {exercises.length} Soal Terpilih
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {isActiveSession
                  ? 'Centang soal yang ingin diujikan ke siswa. Anda dapat mengujikan 1 soal saja atau banyak soal sekaligus.'
                  : 'Pilih dan persiapkan soal latihan sebelum membuka kelas. Perubahan di bank soal tidak akan mengganggu ujian yang sedang berjalan.'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectAllForExam}
              className="h-7 gap-1 text-[11px]"
            >
              <Check className="h-3 w-3" />
              Pilih Semua
            </Button>

            {isActiveSession && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUpdateClassExercises}
                  className="h-7 gap-1.5 text-xs text-viz-green border-viz-green/40"
                  title="Kirim pembaruan/penambahan soal ke siswa tanpa mereset lembar kerja atau nilai siswa"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Perbarui Soal Kelas ({selectedExamExerciseIds.length})
                </Button>
                <Button
                  size="sm"
                  onClick={handleBroadcastExamPacket}
                  className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  <Sparkles className="h-3.5 w-3.5 text-viz-gold" />
                  Siarkan Paket Ujian ({selectedExamExerciseIds.length} Soal)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearActiveExercises}
                  className="h-7 gap-1.5 text-xs text-viz-red border-viz-red/40"
                  title="Tarik atau kosongkan seluruh soal aktif dari kelas"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Kosongkan Soal
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 gap-1 text-[11px] text-viz-blue"
              title="Pilih file JSON topologi (mis. openpacket-topology-*.json)"
            >
              <Upload className="h-3 w-3" />
              Impor Topologi
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateFromCanvas}
              className="h-7 gap-1 text-[11px] text-viz-blue"
              title="Ubah topologi yang sedang aktif di kanvas menjadi soal praktikum"
            >
              <Sparkles className="h-3 w-3" />
              Dari Kanvas
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateNewExercise}
              className="h-7 gap-1 text-[11px] text-viz-green"
            >
              <Plus className="h-3 w-3" />
              Buat Soal
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => selectedExercise && exportLabPackageFile(selectedExercise)}
              disabled={!selectedExercise}
              className="h-7 gap-1 text-[11px] text-viz-gold disabled:opacity-40"
              title="Ekspor soal yang dipilih sebagai paket praktikum mandiri (.oplab) untuk dibagikan ke siswa"
            >
              <Download className="h-3 w-3" />
              Paket (.oplab)
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleExportAllExercises}
              disabled={exercises.length === 0}
              title="Unduh seluruh bank soal dalam file JSON"
              className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Download className="h-3 w-3" />
              Ekspor Semua
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleClearExerciseBank}
              disabled={exercises.length === 0}
              className="h-7 gap-1 text-[11px] text-viz-red hover:bg-viz-red/10 border-viz-red/50 font-semibold disabled:opacity-40"
              title="Kosongkan seluruh bank soal praktikum"
            >
              <Trash2 className="h-3 w-3" />
              Kosongkan Bank Soal
            </Button>
          </div>
        </div>

        {exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-8 text-center bg-muted/20">
            <BookOpen className="h-8 w-8 text-muted-foreground/60" />
            <div className="flex flex-col gap-1 max-w-sm">
              <span className="text-xs font-bold text-foreground">Bank Soal Masih Kosong</span>
              <span className="text-[11px] text-muted-foreground">
                Bank soal dimulai dari nol. Buat soal praktikum baru, ubah topologi kanvas menjadi soal, atau impor berkas soal (.json).
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Button
                size="sm"
                onClick={handleCreateNewExercise}
                className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Buat Soal Baru
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateFromCanvas}
                className="h-7 gap-1.5 text-xs text-viz-blue"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ubah Dari Kanvas
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex, idx) => {
            const isSelectedForExam = selectedExamExerciseIds.includes(ex.id);
            const isCurrentlyRunning = isActiveSession && activeExamIds.includes(ex.id);

            return (
              <div
                key={ex.id}
                className={`flex flex-col justify-between rounded-lg border p-3 transition-all ${
                  isCurrentlyRunning
                    ? 'border-viz-green/70 bg-viz-green/5 shadow-xs'
                    : isSelectedForExam
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-border bg-background/50 hover:border-muted-foreground/40'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSelectedForExam}
                        onChange={() => handleToggleSelectExerciseForExam(ex.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                      <span className="text-xs font-bold text-foreground line-clamp-1" title={ex.title}>
                        {idx + 1}. {ex.title.split(':')[0]}
                      </span>
                    </label>

                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                        {ex.difficulty}
                      </Badge>
                      {isCurrentlyRunning ? (
                        <span className="rounded-full bg-viz-green/20 px-1.5 py-0.5 text-[9px] font-semibold text-viz-green">
                          Sedang Diuji
                        </span>
                      ) : isSelectedForExam ? (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                          Masuk Paket
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {ex.instructions}
                  </p>

                  <span className="text-[10px] text-muted-foreground/70">
                    {ex.targets.length} Kriteria Evaluasi
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant={isSelectedForExam ? 'default' : 'outline'}
                      onClick={() => handleToggleSelectExerciseForExam(ex.id)}
                      className="h-6 text-[10px] px-2"
                    >
                      {isSelectedForExam ? 'Terpilih (✓)' : '+ Pilih'}
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSelectOnlyThisForExam(ex, isActiveSession)}
                      className="h-6 text-[10px] px-2"
                      title="Uji hanya soal ini saja"
                    >
                      Hanya Ini
                    </Button>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleEditExercise(e, ex)}
                      title="Sunting Teks & Target Soal"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-viz-blue"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        exportExercisesToJsonFile(ex);
                      }}
                      title="Unduh Soal (.json)"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-viz-green"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleDeleteExercise(e, ex.id)}
                      title="Hapus Soal"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-viz-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleModalClose(); }}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-primary/20 p-2 text-primary shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight">
                  Portal Kelas &amp; Praktikum Jaringan
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground line-clamp-1 sm:line-clamp-none">
                  Ruang kelas interaktif tanpa akun: guru memandu soal, evaluasi otomatis deterministik.
                </DialogDescription>
              </div>
            </div>

            {/* Status Peran */}
            {lockedRole ? (
              <Badge
                variant="outline"
                className="flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold shrink-0"
              >
                {lockedRole === 'teacher' ? (
                  <>
                    <GraduationCap className="h-3.5 w-3.5 text-primary" />
                    <span>Mode Guru Aktif</span>
                  </>
                ) : (
                  <>
                    <Users className="h-3.5 w-3.5 text-viz-blue" />
                    <span>Mode Siswa Aktif</span>
                  </>
                )}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs text-muted-foreground shrink-0">
                Pilih Peran Anda
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          {/* ======================= GERBANG PEMILIHAN PERAN (ROLE GATE) ======================= */}
          {lockedRole === null && (
            <ClassroomRoleGate onSelectRole={handleSelectRole} />
          )}

          {/* ======================= TAMPILAN GURU ======================= */}
          {lockedRole === 'teacher' && (
            <div className="flex flex-col gap-5">
              {!session ? (
                <div className="flex flex-col gap-5">
                  {/* Bar Kontrol Guru (Belum Buka Kelas) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-3.5 sm:px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">Panel Administrasi Guru</span>
                        <span className="text-[11px] text-muted-foreground">
                          Siapkan bank soal atau langsung buka sesi kelas baru di bawah
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExitTeacherMode}
                      className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive font-medium"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Keluar Mode Guru
                    </Button>
                  </div>

                  {/* Form Buat Kelas Baru */}
                  <Card className="p-5">
                    <div className="mb-4 flex flex-col gap-1">
                      <h3 className="text-sm font-bold">Buat Sesi Kelas Baru</h3>
                      <p className="text-xs text-muted-foreground">
                        Kelas berjalan langsung secara lokal/jaringan. Siswa cukup memasukkan kode kelas untuk terhubung.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="cls-title" className="text-xs">Judul Kelas</Label>
                        <Input
                          id="cls-title"
                          value={classTitle}
                          onChange={(e) => setClassTitle(e.target.value)}
                          placeholder="e.g. Praktikum Jaringan TKJ 1"
                          className="text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="cls-code" className="text-xs">
                          Kode Kelas Kustom <span className="text-muted-foreground font-normal">(opsional)</span>
                        </Label>
                        <Input
                          id="cls-code"
                          value={customCode}
                          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                          placeholder="Otomatis jika kosong (e.g. NET-5021)"
                          className="font-mono text-xs uppercase"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <Button onClick={() => void handleCreateClass()} disabled={isCreatingClass} className="gap-2">
                        <Play className="h-4 w-4" />
                        {isCreatingClass ? 'Memeriksa kode kelas…' : 'Mulai Buka Kelas'}
                      </Button>
                    </div>
                  </Card>

                  {/* Bank Soal Praktikum Siap Pakai */}
                  {renderExerciseCatalog(false)}
                </div>
              ) : (
                /* Kelas Sedang Aktif (Dashboard Guru) */
                <div className="flex flex-col gap-5">
                  {/* Banner Informasi Kelas */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                          Kode Akses Kelas
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xl font-extrabold tracking-wider text-primary">
                            {session.classCode}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={copyClassCode}
                            className="h-7 w-7 p-0 text-muted-foreground"
                          >
                            {isCopiedCode ? (
                              <Check className="h-3.5 w-3.5 text-viz-green" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-border" />

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                          Status Sesi
                        </span>
                        <Badge
                          variant={session.status === 'open' ? 'default' : 'secondary'}
                          className="w-fit text-[10px]"
                        >
                          {session.status === 'open' ? 'Aktif Terbuka' : 'Terkunci'}
                        </Badge>
                      </div>

                      <div className="h-8 w-px bg-border" />

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                          Total Peserta
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {participants.length} Siswa
                        </span>
                      </div>
                    </div>

                    {/* Kontrol Guru */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleToggleSelfCheck}
                        className={`gap-1.5 text-xs ${
                          session.allowSelfCheck === false
                            ? 'border-viz-gold/50 text-viz-gold hover:bg-viz-gold/10'
                            : 'border-viz-green/50 text-viz-green hover:bg-viz-green/10'
                        }`}
                        title={
                          session.allowSelfCheck === false
                            ? 'Klik untuk mengizinkan murid cek mandiri'
                            : 'Klik untuk menonaktifkan cek mandiri murid (mode ujian ketat)'
                        }
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        <span>
                          {session.allowSelfCheck === false
                            ? 'Cek Mandiri: Nonaktif (Ujian)'
                            : 'Cek Mandiri: Aktif'}
                        </span>
                      </Button>

                      {/* Batas Cek Mandiri */}
                      <div className="flex items-center gap-1.5 rounded-md border border-input bg-input/30 px-2 py-1">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">Batas Cek</span>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={session.selfCheckLimit ?? 5}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isNaN(val)) return;
                            const safe = Math.max(1, Math.min(99, Math.floor(val)));
                            setSession({ ...session, selfCheckLimit: safe });
                          }}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            const safe = Number.isNaN(val)
                              ? 5
                              : Math.max(1, Math.min(99, Math.floor(val)));
                            classroomHub.setSelfCheckLimit(session.classCode, safe);
                            pushToast('info', `Batas cek mandiri diatur ke ${safe} kali per soal.`);
                          }}
                          className="w-12 bg-transparent text-xs font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          title="Berapa kali siswa boleh melakukan cek mandiri per soal"
                        />
                        <span className="text-[11px] text-muted-foreground">kali</span>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleToggleLock}
                        className="gap-1.5 text-xs"
                      >
                        {session.status === 'open' ? (
                          <>
                            <Lock className="h-3.5 w-3.5 text-viz-gold" />
                            Kunci Sesi
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3.5 w-3.5 text-viz-green" />
                            Buka Sesi
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCloseClass}
                        className="gap-1.5 text-xs"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Tutup Kelas
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExitTeacherMode}
                        className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive font-medium"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Keluar Mode Guru
                      </Button>
                    </div>
                  </div>

                  {/* Pemilihan & Penyiaran Soal Aktif */}
                  {renderExerciseCatalog(true)}

                  {/* Tabel Monitoring Nilai Siswa */}
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-viz-green" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Daftar Peserta &amp; Penilaian Langsung ({participants.length})
                        </h4>
                        {(session.round ?? 0) > 0 && (
                          <Badge variant="outline" className="font-mono text-[10px]" title="Soal baru yang disiarkan memulai ronde baru; nilai ronde lama diarsipkan dan ikut di CSV.">
                            Ronde {session.round}
                            {history.length > 0 ? ` · ${history.length} diarsipkan` : ''}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => opsubInputRef.current?.click()}
                          className="h-7 gap-1.5 text-xs text-viz-blue"
                          title="Impor berkas lembar jawaban siswa (.opsub) secara massal"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Impor Jawaban (.opsub)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleVerifyAll()}
                          disabled={isVerifying || Object.keys(submissions).length === 0}
                          className="h-7 gap-1.5 text-xs text-viz-teal"
                          title="Nilai ulang topologi setiap siswa di perangkat ini untuk memastikan skor yang dikirim memang hasil jawabannya"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {isVerifying ? 'Memverifikasi…' : 'Verifikasi Semua'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleExportGradesCsv}
                          disabled={participants.length === 0}
                          className="h-7 gap-1.5 text-xs"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Ekspor Nilai (CSV)
                        </Button>
                        <span className="hidden text-[11px] text-muted-foreground sm:inline">
                          Terhubung via Realtime Channel
                        </span>
                      </div>
                    </div>

                    {participants.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="mb-2 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-xs font-medium text-muted-foreground">
                          Belum ada siswa yang bergabung.
                        </p>
                        <p className="text-[11px] text-muted-foreground/70">
                          Minta siswa memasukkan kode <b>{session.classCode}</b> pada Mode Siswa.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b bg-muted/60">
                            <tr>
                              <th className="p-2.5 font-bold">No</th>
                              <th className="p-2.5 font-bold">Nama Siswa</th>
                              <th className="p-2.5 font-bold">Waktu Bergabung</th>
                              <th className="p-2.5 font-bold">Status</th>
                              <th className="p-2.5 font-bold">Skor Nilai</th>
                              <th className="p-2.5 font-bold text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-background/50">
                            {participants.map((p, idx) => {
                              const sub = submissions[p.id];
                              return (
                                <tr key={p.id} className="hover:bg-muted/30">
                                  <td className="p-2.5 text-muted-foreground">{idx + 1}</td>
                                  <td className="p-2.5 font-semibold text-foreground">
                                    {p.nickname}
                                  </td>
                                  <td className="p-2.5 text-muted-foreground">
                                    {new Date(p.joinedAt).toLocaleTimeString()}
                                  </td>
                                  <td className="p-2.5">
                                    {p.status === 'left' ? (
                                      <Badge variant="outline" className="text-muted-foreground">
                                        Keluar{sub ? ' (nilai tersimpan)' : ''}
                                      </Badge>
                                    ) : sub ? (
                                      <Badge
                                        variant="outline"
                                        className="border-viz-green/40 bg-viz-green/10 text-viz-green"
                                      >
                                        Terkumpul
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="border-viz-gold/40 bg-viz-gold/10 text-viz-gold"
                                      >
                                        Mengerjakan
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    {sub && !sub.ungraded ? (
                                      <span
                                        className={`font-mono font-bold ${
                                          sub.score === 100
                                            ? 'text-viz-green'
                                            : sub.score >= 70
                                            ? 'text-viz-gold'
                                            : 'text-viz-red'
                                        }`}
                                      >
                                        {sub.score} / 100
                                      </span>
                                    ) : (
                                      <span className="font-mono text-muted-foreground">-</span>
                                    )}
                                    {sub && renderVerification(p.id, sub)}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {sub ? (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => void handleVerifyOne(p.id)}
                                            disabled={isVerifying}
                                            className="h-7 gap-1 text-[11px] text-viz-teal"
                                            title="Nilai ulang topologi siswa ini dan bandingkan dengan skor yang dikirim"
                                          >
                                            <ShieldCheck className="h-3 w-3" />
                                            Verifikasi
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setReviewedSubmission(sub)}
                                            className="h-7 gap-1 text-[11px] text-viz-blue"
                                          >
                                            <Eye className="h-3 w-3" />
                                            Review
                                          </Button>
                                        </>
                                      ) : (
                                        <span className="text-[11px] text-muted-foreground/60 italic">
                                          Menunggu…
                                        </span>
                                      )}
                                      {session && session.status !== 'closed' && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            requestConfirm({
                                              title: `Keluarkan ${p.nickname}?`,
                                              message: `Siswa ${p.nickname} akan dikeluarkan dari sesi kelas dan tidak dapat melanjutkan pengerjaan. Tindakan ini tidak bisa dibatalkan.`,
                                              confirmLabel: 'Keluarkan Siswa',
                                              onConfirm: () => {
                                                classroomHub.kickParticipant(
                                                  session.classCode,
                                                  p.id
                                                );
                                                setParticipants((prev) =>
                                                  prev.filter((x) => x.id !== p.id)
                                                );
                                                pushToast(
                                                  'info',
                                                  `${p.nickname} telah dikeluarkan dari kelas.`
                                                );
                                              },
                                            })
                                          }
                                          className="h-7 gap-1 text-[11px] text-viz-red"
                                          title={`Keluarkan ${p.nickname} dari kelas`}
                                        >
                                          <UserMinus className="h-3 w-3" />
                                          Keluarkan
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  {/* Modal Detail Review Hasil Siswa */}
                  {reviewedSubmission && (
                    <Card className="border-primary/50 bg-primary/5 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-viz-green" />
                          <h4 className="text-xs font-bold text-foreground">
                            Detail Lembar Kerja: {reviewedSubmission.nickname}
                          </h4>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReviewedSubmission(null)}
                          className="h-6 text-xs text-muted-foreground"
                        >
                          Tutup
                        </Button>
                      </div>

                      {(() => {
                        // Paket ujian multi-soal: tampilkan rincian PER SOAL (skor akhir = rata-rata semua soal).
                        const perExercise = reviewedSubmission.evaluations
                          ? Object.entries(reviewedSubmission.evaluations)
                          : [];
                        const titleOf = (id: string) =>
                          [...(session?.activeExercises ?? []), ...exercises].find((x) => x.id === id)?.title ??
                          history.flatMap((h) => h.exercises).find((x) => x.id === id)?.title ??
                          id;
                        const blocks: Array<{ key: string; heading: string | null; ev: ExerciseEvaluation }> =
                          perExercise.length > 0
                            ? perExercise.map(([id, ev]) => ({ key: id, heading: titleOf(id), ev }))
                            : [{ key: 'single', heading: null, ev: reviewedSubmission.evaluation }];
                        return (
                          <div className="flex flex-col gap-3">
                            {blocks.map(({ key, heading, ev }) => (
                              <div key={key} className="flex flex-col gap-1.5">
                                <p className="text-xs text-muted-foreground">
                                  {heading && <b className="text-foreground">{heading} — {ev.score}/100. </b>}
                                  {ev.feedback}
                                </p>
                                <div className="flex flex-col gap-1.5 rounded-lg border bg-background/80 p-3">
                                  {ev.checks.map((chk) => (
                                    <div key={chk.targetId} className="flex items-start gap-2 text-xs">
                                      {chk.passed ? (
                                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-green" />
                                      ) : (
                                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-red" />
                                      )}
                                      <div className="flex flex-col">
                                        <span className={chk.passed ? 'font-medium text-foreground' : 'text-foreground/90'}>
                                          {chk.title}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                          {chk.reason}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ======================= TAMPILAN SISWA ======================= */}
          {lockedRole === 'student' && (
            <div className="flex flex-col gap-5">
              {!joinedParticipant ? (
                /* Form Gabung Kelas */
                <Card className="p-5">
                  <div className="mb-4 flex flex-col gap-1">
                    <h3 className="text-sm font-bold">Bergabung ke Kelas</h3>
                    <p className="text-xs text-muted-foreground">
                      Masukkan kode kelas yang dibagikan oleh guru untuk mulai mengerjakan tantangan praktikum.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="stu-code" className="text-xs">Kode Kelas</Label>
                      <Input
                        id="stu-code"
                        value={studentClassCode}
                        onChange={(e) => setStudentClassCode(e.target.value.toUpperCase())}
                        placeholder="e.g. NET-5021"
                        className="font-mono text-xs uppercase"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="stu-name" className="text-xs">Nama Lengkap / Nickname</Label>
                      <Input
                        id="stu-name"
                        value={studentNickname}
                        onChange={(e) => setStudentNickname(e.target.value)}
                        placeholder="e.g. Budi Santoso"
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => oplabInputRef.current?.click()}
                        className="gap-2 text-xs text-viz-gold"
                        title="Buka file paket praktikum tugas mandiri (.oplab atau .json)"
                      >
                        <Upload className="h-4 w-4" />
                        Buka Tugas Mandiri (.oplab)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleExitStudentMode}
                        className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive font-medium"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Keluar Mode Siswa
                      </Button>
                    </div>

                    <Button onClick={() => void handleJoinClass()} disabled={isJoining} className="gap-2">
                      <Users className="h-4 w-4" />
                      {isJoining ? 'Memeriksa kelas…' : 'Masuk ke Ruang Kelas'}
                    </Button>
                  </div>
                </Card>
              ) : (
                /* Ruang Pengerjaan Siswa */
                <div className="flex flex-col gap-5">
                  {/* Bar Info Siswa */}
                  <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/20 p-2 text-primary">
                        <GraduationCap className="h-5 w-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">
                          {joinedParticipant.nickname}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Tergabung di Kelas <b className="font-mono text-foreground">{session?.classCode || studentClassCode}</b>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Kirim PARTICIPANT_LEFT ke guru (sebelumnya hanya menghapus peserta secara lokal).
                          classroomHub.leaveCurrentClass();
                          setJoinedParticipant(null);
                          setActiveExercise(null);
                          setSession(null);
                          pushToast('info', 'Anda telah keluar dari ruang kelas.');
                        }}
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Keluar Kelas
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExitStudentMode}
                        className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive font-medium"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Keluar Mode Siswa
                      </Button>
                    </div>
                  </div>
                  {/* Soal Aktif */}
                  {activeExercise ? (
                    <Card className="flex flex-col gap-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground">
                              {activeExercise.title}
                            </h3>
                            <Badge variant="outline" className="text-[10px] text-primary">
                              {activeExercise.difficulty}
                            </Badge>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {activeExercise.instructions}
                          </p>
                        </div>

                        {(activeExercise.starterTopology || activeExercise.starterTemplateId) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleLoadStarterTemplate}
                            className="shrink-0 gap-1.5 text-xs border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            <Play className="h-3.5 w-3.5" />
                            {activeExercise.starterTopology
                              ? 'Muat Topologi Guru ke Kanvas'
                              : 'Muat Topologi Awal'}
                          </Button>
                        )}
                      </div>

                      {/* Daftar Target Checklist */}
                      <div className="flex flex-col gap-2 rounded-lg border bg-background/50 p-4">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Kriteria Target Penilaian:
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {activeExercise.targets.map((tgt, idx) => (
                            <div key={tgt.id} className="flex items-center gap-2 text-xs">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-muted-foreground">
                                {idx + 1}
                              </span>
                              <span className="text-foreground/90">{tgt.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tombol Submit */}
                      <div className="flex items-center justify-between border-t pt-3">
                        <p className="text-[11px] text-muted-foreground">
                          Susun topologi di kanvas, konfigurasi IP port, lalu klik Submit untuk dinilai otomatis.
                        </p>
                        <Button
                          onClick={confirmSubmitWork}
                          disabled={isEvaluating || mySubmitted}
                          className="gap-2"
                          title={mySubmitted ? 'Jawaban sudah dikirim untuk ronde ini' : 'Jawaban hanya dapat dikirim satu kali per ronde'}
                        >
                          <Send className="h-4 w-4" />
                          {mySubmitted ? 'Jawaban Terkirim' : isEvaluating ? 'Mengevaluasi…' : 'Kirim Jawaban (Submit)'}
                        </Button>
                      </div>
                    </Card>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Guru belum memulai soal latihan. Harap tunggu aba-aba dari guru.
                    </div>
                  )}

                  {/* Hasil Evaluasi Siswa */}
                  {myEvaluation && (
                    <Card
                      className={`p-5 border ${
                        myEvaluation.status === 'passed'
                          ? 'border-viz-green/40 bg-viz-green/10'
                          : myEvaluation.status === 'partial'
                          ? 'border-viz-gold/40 bg-viz-gold/10'
                          : 'border-viz-red/40 bg-viz-red/10'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {myEvaluation.status === 'passed' ? (
                            <CheckCircle2 className="h-5 w-5 text-viz-green" />
                          ) : (
                            <HelpCircle className="h-5 w-5 text-viz-gold" />
                          )}
                          <span className="text-sm font-bold text-foreground">
                            Hasil Evaluasi Otomatis
                          </span>
                        </div>
                        <span
                          className={`font-mono text-xl font-extrabold ${
                            myEvaluation.score === 100
                              ? 'text-viz-green'
                              : myEvaluation.score >= 70
                              ? 'text-viz-gold'
                              : 'text-viz-red'
                          }`}
                        >
                          {myEvaluation.score} / 100
                        </span>
                      </div>

                      <p className="mb-4 text-xs text-foreground/90">
                        {myEvaluation.feedback}
                      </p>

                      <div className="flex flex-col gap-2 rounded-lg border bg-background/80 p-3.5">
                        {myEvaluation.checks.map((chk) => (
                          <div key={chk.targetId} className="flex items-start gap-2.5 text-xs">
                            {chk.passed ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-green" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-red" />
                            )}
                            <div className="flex flex-col">
                              <span className={chk.passed ? 'font-semibold text-foreground' : 'text-foreground'}>
                                {chk.title}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {chk.reason}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hidden File Input for JSON import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".json,application/json"
          className="hidden"
        />

        {/* Hidden File Input for OPLAB import (Siswa) */}
        <input
          type="file"
          ref={oplabInputRef}
          onChange={handleImportOplab}
          accept=".oplab,.json,application/json"
          className="hidden"
        />

        {/* Hidden File Input for OPSUB import (Guru - multiple) */}
        <input
          type="file"
          ref={opsubInputRef}
          onChange={handleImportOpsub}
          accept=".opsub,.json,application/json"
          multiple
          className="hidden"
        />

        {/* Editor Soal Guru */}
        <ExerciseEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          initialExercise={editingExercise}
          onSave={handleSaveExercise}
        />
      </DialogContent>
    </Dialog>
  );
}
