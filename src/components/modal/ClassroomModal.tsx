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
  ArrowLeftRight,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TOPOLOGY_TEMPLATES } from '../../data/topologyTemplates';
import {
  classroomHub,
} from '../../features/classroom/classroomHub';
import {
  DEFAULT_EXERCISES,
} from '../../features/classroom/defaultExercises';
import {
  evaluateExercise,
} from '../../features/classroom/exerciseEvaluator';
import {
  loadExercises,
  saveExercises,
  parseExerciseJson,
  exportExercisesToJsonFile,
  exportLabPackageFile,
  parseSubmissionJson,
} from '../../features/classroom/exerciseParser';
import { convertTopologyToExercise } from '../../features/classroom/topologyExerciseConverter';
import { ExerciseEditorModal } from './ExerciseEditorModal';
import type {
  ClassSession,
  Participant,
  Exercise,
  Submission,
  ExerciseEvaluation,
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
    classroomHub.setLockedRole(role);
    setLockedRole(role);
    if (role === 'teacher') {
      pushToast('info', 'Mode Guru aktif. Akses siswa dinonaktifkan di perangkat ini.');
    } else {
      pushToast('info', 'Mode Siswa aktif. Akses administrasi guru dinonaktifkan di perangkat ini.');
    }
  };

  const handleSwitchRole = () => {
    requestConfirm({
      title: 'Ganti Peran Pengguna?',
      message:
        lockedRole === 'teacher'
          ? 'Anda akan keluar dari Mode Guru. Sesi administrasi guru pada perangkat ini akan dilepas.'
          : 'Anda akan keluar dari Mode Siswa. Anda akan dikeluarkan dari sesi kelas siswa aktif saat ini.',
      confirmLabel: 'Ganti Peran',
      onConfirm: () => {
        if (lockedRole === 'student') {
          classroomHub.setCurrentParticipant(null);
          setJoinedParticipant(null);
          setActiveExercise(null);
        }
        classroomHub.setLockedRole(null);
        setLockedRole(null);
        pushToast('info', 'Silakan tentukan peran baru yang ingin Anda masuki.');
      },
    });
  };

  // Teacher State
  const [session, setSession] = useState<ClassSession | null>(null);
  const [classTitle, setClassTitle] = useState('Praktikum Jaringan Komputer');
  const [customCode, setCustomCode] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [exercises, setExercises] = useState<Exercise[]>(() => loadExercises());
  const [selectedExercise, setSelectedExercise] = useState<Exercise>(() => {
    const list = loadExercises();
    return list[0] || DEFAULT_EXERCISES[0];
  });
  const [reviewedSubmission, setReviewedSubmission] = useState<Submission | null>(null);
  const [isCopiedCode, setIsCopiedCode] = useState(false);

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
  const [selectedExamExerciseIds, setSelectedExamExerciseIds] = useState<string[]>(() => {
    const sess = classroomHub.getSession();
    if (sess?.activeExercises && sess.activeExercises.length > 0) {
      return sess.activeExercises.map((x) => x.id);
    }
    const exList = loadExercises();
    return exList.length > 0 ? [exList[0].id] : [];
  });

  // Inisialisasi state dari storage
  useEffect(() => {
    const existingSession = classroomHub.getSession();
    if (existingSession) {
      setSession(existingSession);
      setParticipants(classroomHub.getParticipants());
      setSubmissions(classroomHub.getSubmissions());
      const activeEx = classroomHub.getActiveExercise();
      if (activeEx) {
        setSelectedExercise(activeEx);
        setActiveExercise(activeEx);
      }
      const activeList = classroomHub.getActiveExercises();
      if (activeList && activeList.length > 0) {
        setSelectedExamExerciseIds(activeList.map((x) => x.id));
      }
    }
  }, []);

  // Langganan event realtime BroadcastChannel
  useEffect(() => {
    const unsubscribe = classroomHub.subscribe((event) => {
      switch (event.type) {
        case 'CLASS_CREATED':
          setSession(event.session);
          setParticipants([]);
          setSubmissions({});
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

        case 'EXERCISE_STARTED':
          setSelectedExercise(event.exercise);
          setActiveExercise(event.exercise);
          setMyEvaluation(null);
          if (event.exercises && event.exercises.length > 0) {
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

        case 'CLASS_CLOSED':
          setSession((prev) => (prev ? { ...prev, status: 'closed' } : null));
          break;

        case 'SYNC_RESPONSE':
          setSession(event.session);
          setParticipants(event.participants);
          setSubmissions(event.submissions);
          if (event.activeExercise) {
            setSelectedExercise(event.activeExercise);
            setActiveExercise(event.activeExercise);
          }
          if (event.activeExercises && event.activeExercises.length > 0) {
            setSelectedExamExerciseIds(event.activeExercises.map((x) => x.id));
          }
          break;
      }
    });

    return () => {
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
      classroomHub.startExercises(session.classCode, [ex]);
      pushToast('success', `Tantangan "${ex.title}" disiarkan sebagai satu-satunya soal ujian.`);
    } else {
      pushToast('info', `Soal "${ex.title}" dipilih untuk ujian.`);
    }
  };

  // Handler Guru: Siarkan Paket Ujian Terpilih (Multi atau Single)
  const handleBroadcastExamPacket = () => {
    if (!session) return;
    const chosen = exercises.filter((e) => selectedExamExerciseIds.includes(e.id));
    if (chosen.length === 0) {
      pushToast('warning', 'Pilih minimal 1 soal untuk diujikan.');
      return;
    }
    classroomHub.startExercises(session.classCode, chosen);
    setSelectedExercise(chosen[0]);
    pushToast(
      'success',
      `Paket ujian dengan ${chosen.length} soal berhasil disiarkan ke seluruh siswa!`
    );
  };

  // Handler Guru: Buat Kelas Baru
  const handleCreateClass = () => {
    const chosen = exercises.filter((e) => selectedExamExerciseIds.includes(e.id));
    const toUse =
      chosen.length > 0
        ? chosen
        : [selectedExercise || exercises[0] || DEFAULT_EXERCISES[0]];
    const newSession = classroomHub.createClass(
      classTitle,
      customCode,
      undefined,
      toUse
    );
    setSession(newSession);
    setParticipants([]);
    setSubmissions({});
    setSelectedExercise(toUse[0]);
    pushToast(
      'success',
      `Kelas dibuka dengan ${toUse.length} soal ujian! Kode Kelas: ${newSession.classCode}.`
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
    if (exercises.length <= 1) {
      pushToast('warning', 'Minimal harus ada 1 soal latihan pada daftar.');
      return;
    }
    const updated = exercises.filter((x) => x.id !== exId);
    setExercises(updated);
    saveExercises(updated);
    setSelectedExamExerciseIds((prev) => prev.filter((id) => id !== exId));
    if (selectedExercise.id === exId) {
      setSelectedExercise(updated[0]);
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
    if (!session) return;
    classroomHub.closeClass(session.classCode);
    setSession(null);
    setParticipants([]);
    setSubmissions({});
    classroomHub.clearAll();
    pushToast('info', 'Sesi kelas telah diakhiri.');
  };

  // Handler Siswa: Gabung Kelas
  const handleJoinClass = () => {
    if (!studentClassCode.trim()) {
      pushToast('warning', 'Masukkan kode kelas yang diberikan oleh guru.');
      return;
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
      onClose(); // Tutup modal agar siswa langsung melihat kanvas dan HUD
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

      // Pastikan ada sesi lokal
      let sess = classroomHub.getSession();
      if (!sess) {
        sess = classroomHub.createClass('Praktikum Mandiri', code);
      }
      setSession(sess);

      // Mulai soal dan join sebagai peserta
      classroomHub.startExercise(code, exercise);
      const participant = classroomHub.joinClass(code, nickname);
      if (participant) {
        setJoinedParticipant(participant);
        setActiveExercise(exercise);
        pushToast('success', `Paket tugas "${exercise.title}" berhasil dimuat! Lembar kerja aktif di kanvas.`);
        onClose();
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  // Handler Guru: Impor Massal Berkas Jawaban Siswa (.opsub)
  const handleImportOpsub = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let successCount = 0;
    const newParticipants = [...participants];
    const newSubmissions = { ...submissions };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const res = parseSubmissionJson(text);
        if (res.success && res.submission) {
          const sub = res.submission;
          let p = newParticipants.find(
            (item) => item.id === sub.participantId || item.nickname === sub.nickname
          );
          if (!p) {
            p = {
              id: sub.participantId || `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              nickname: sub.nickname,
              joinedAt: sub.submittedAt || Date.now(),
              status: 'submitted',
            };
            newParticipants.push(p);
          } else {
            p.status = 'submitted';
          }
          newSubmissions[p.id] = { ...sub, participantId: p.id };
          successCount++;
        }
      } catch (err) {
        console.warn('Gagal membaca file submission:', err);
      }
    }

    if (successCount > 0) {
      setParticipants(newParticipants);
      setSubmissions(newSubmissions);
      classroomHub.saveParticipants(newParticipants);
      classroomHub.saveSubmissions(newSubmissions);
      pushToast('success', `${successCount} berkas lembar jawaban siswa (.opsub) berhasil diimpor dan dinilai!`);
    } else {
      pushToast('error', 'Tidak ada berkas lembar jawaban .opsub yang valid.');
    }

    if (e.target) e.target.value = '';
  };

  // Handler Guru: Ekspor Nilai Peserta ke CSV
  const handleExportGradesCsv = () => {
    if (participants.length === 0) {
      pushToast('info', 'Belum ada data peserta untuk diekspor.');
      return;
    }

    const headers = ['No', 'Nama Siswa', 'Status', 'Skor', 'Target Tercapai', 'Feedback Evaluasi', 'Waktu Submit'];
    const rows = participants.map((p, idx) => {
      const sub = submissions[p.id];
      const score = sub ? sub.score : 0;
      const status = sub ? sub.status : p.status;
      const passedTargets = sub
        ? `${sub.evaluation.checks.filter((c) => c.passed).length}/${sub.evaluation.checks.length}`
        : '0';
      const feedback = sub ? sub.evaluation.feedback.replace(/"/g, '""') : '-';
      const time = sub ? new Date(sub.submittedAt).toLocaleTimeString() : '-';

      return [
        idx + 1,
        `"${p.nickname.replace(/"/g, '""')}"`,
        `"${status}"`,
        score,
        `"${passedTargets}"`,
        `"${feedback}"`,
        `"${time}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
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
      if (activeExercise?.starterTopology) {
        loadTopology({
          nodes: activeExercise.starterTopology.nodes,
          edges: activeExercise.starterTopology.edges,
        });
        pushToast('success', 'Topologi soal dari guru berhasil dimuat ke kanvas Anda.');
        onClose(); // Tutup modal agar siswa langsung melihat kanvas
        return;
      }

      if (activeExercise?.starterTemplateId) {
        const tpl = TOPOLOGY_TEMPLATES.find(
          (t) => t.id === activeExercise.starterTemplateId
        );
        if (tpl) {
          loadTopology({ nodes: tpl.nodes, edges: tpl.edges });
          pushToast('success', `Template "${tpl.name}" diterapkan ke kanvas.`);
          onClose(); // Tutup modal agar siswa langsung melihat kanvas
          return;
        }
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

  // Handler Siswa: Submit Jawaban & Evaluasi Otomatis
  const handleSubmitWork = async () => {
    if (!activeExercise || !joinedParticipant || !session) return;
    setIsEvaluating(true);

    try {
      const devices = nodes.map((n) => n.data);
      const links = edges.map((e) => ({
        sourceNodeId: e.source,
        sourcePortId: e.sourceHandle!,
        targetNodeId: e.target,
        targetPortId: e.targetHandle!,
      }));

      const evaluation = await evaluateExercise(activeExercise, devices, links);
      setMyEvaluation(evaluation);

      const submission: Submission = {
        participantId: joinedParticipant.id,
        nickname: joinedParticipant.nickname,
        exerciseId: activeExercise.id,
        score: evaluation.score,
        status: evaluation.status,
        evaluation,
        submittedAt: Date.now(),
      };

      classroomHub.submitWork(session.classCode, submission);

      pushToast(
        evaluation.status === 'passed' ? 'success' : 'info',
        `Nilai: ${evaluation.score}/100. ${evaluation.feedback}`
      );
    } catch (err) {
      pushToast('error', `Evaluasi gagal: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const copyClassCode = () => {
    if (!session) return;
    navigator.clipboard.writeText(session.classCode);
    setIsCopiedCode(true);
    setTimeout(() => setIsCopiedCode(false), 2000);
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
              <Button
                size="sm"
                onClick={handleBroadcastExamPacket}
                className="h-7 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                Siarkan Paket Ujian ({selectedExamExerciseIds.length} Soal)
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 gap-1 text-[11px] text-sky-400 hover:text-sky-300"
              title="Pilih file JSON topologi (mis. openpacket-topology-*.json)"
            >
              <Upload className="h-3 w-3" />
              Impor Topologi
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateFromCanvas}
              className="h-7 gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
              title="Ubah topologi yang sedang aktif di kanvas menjadi soal praktikum"
            >
              <Sparkles className="h-3 w-3" />
              Dari Kanvas
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateNewExercise}
              className="h-7 gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
            >
              <Plus className="h-3 w-3" />
              Buat Soal
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => exportLabPackageFile(selectedExercise)}
              className="h-7 gap-1 text-[11px] text-amber-400 hover:text-amber-300"
              title="Ekspor soal yang dipilih sebagai paket praktikum mandiri (.oplab) untuk dibagikan ke siswa"
            >
              <Download className="h-3 w-3" />
              Paket (.oplab)
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleExportAllExercises}
              title="Unduh seluruh bank soal dalam file JSON"
              className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              Ekspor Semua
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {exercises.map((ex, idx) => {
            const isSelectedForExam = selectedExamExerciseIds.includes(ex.id);
            const isCurrentlyRunning = isActiveSession && activeExamIds.includes(ex.id);

            return (
              <div
                key={ex.id}
                className={`flex flex-col justify-between rounded-lg border p-3 transition-all ${
                  isCurrentlyRunning
                    ? 'border-emerald-500/70 bg-emerald-500/5 shadow-xs'
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
                        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
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
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-sky-400"
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
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-emerald-400"
                    >
                      <Download className="h-3 w-3" />
                    </Button>
                    {exercises.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDeleteExercise(e, ex.id)}
                        title="Hapus Soal"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
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

            {/* Status Peran / Aksi Ganti Peran */}
            {lockedRole ? (
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant="outline"
                  className="flex items-center gap-1.5 py-1 px-2.5 text-xs font-semibold"
                >
                  {lockedRole === 'teacher' ? (
                    <>
                      <GraduationCap className="h-3.5 w-3.5 text-primary" />
                      <span>Mode Guru Aktif</span>
                    </>
                  ) : (
                    <>
                      <Users className="h-3.5 w-3.5 text-sky-400" />
                      <span>Mode Siswa Aktif</span>
                    </>
                  )}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSwitchRole}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Keluar dari peran saat ini untuk berganti peran"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Ganti Peran
                </Button>
              </div>
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
            <div className="flex flex-col items-center justify-center py-6 gap-6 max-w-2xl mx-auto w-full my-auto">
              <div className="text-center flex flex-col gap-1.5">
                <h3 className="text-lg font-bold text-foreground">
                  Pilih Peran di Ruang Kelas
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                  Untuk menjaga independensi pengerjaan ujian, satu perangkat hanya dapat memegang satu peran aktif (Guru atau Siswa) dalam satu waktu.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {/* Pilihan 1: Guru */}
                <div
                  onClick={() => handleSelectRole('teacher')}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-primary hover:shadow-lg cursor-pointer hover:bg-primary/5"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">
                        Masuk Sebagai Guru
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Buka sesi kelas baru, kelola dan siarkan paket soal ujian ke siswa, pantau skor secara live, dan unduh rekap nilai ke CSV.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/50">
                    <Button className="w-full gap-2 text-xs font-semibold">
                      <Play className="h-3.5 w-3.5" />
                      Pilih Mode Guru
                    </Button>
                  </div>
                </div>

                {/* Pilihan 2: Siswa */}
                <div
                  onClick={() => handleSelectRole('student')}
                  className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-sky-500 hover:shadow-lg cursor-pointer hover:bg-sky-500/5"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">
                        Masuk Sebagai Siswa
                      </h4>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        Bergabung ke kelas dengan kode dari guru, buka paket tugas praktikum mandiri (.oplab), dan rakit topologi di kanvas.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-3 border-t border-border/50">
                    <Button variant="secondary" className="w-full gap-2 text-xs font-semibold">
                      <Play className="h-3.5 w-3.5" />
                      Pilih Mode Siswa
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================= TAMPILAN GURU ======================= */}
          {lockedRole === 'teacher' && (
            <div className="flex flex-col gap-5">
              {!session ? (
                <div className="flex flex-col gap-5">
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
                      <Button onClick={handleCreateClass} className="gap-2">
                        <Play className="h-4 w-4" />
                        Mulai Buka Kelas
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
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleToggleLock}
                        className="gap-1.5 text-xs"
                      >
                        {session.status === 'open' ? (
                          <>
                            <Lock className="h-3.5 w-3.5 text-amber-400" />
                            Kunci Sesi
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3.5 w-3.5 text-emerald-400" />
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
                    </div>
                  </div>

                  {/* Pemilihan & Penyiaran Soal Aktif */}
                  {renderExerciseCatalog(true)}

                  {/* Tabel Monitoring Nilai Siswa */}
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-emerald-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          Daftar Peserta &amp; Penilaian Langsung ({participants.length})
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => opsubInputRef.current?.click()}
                          className="h-7 gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                          title="Impor berkas lembar jawaban siswa (.opsub) secara massal"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Impor Jawaban (.opsub)
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
                          Minta siswa memasukkan kode <b>{session.classCode}</b> pada Mode Siswa, atau klik &quot;Simulasikan Siswa&quot;.
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
                                    {sub ? (
                                      <Badge
                                        variant="outline"
                                        className="border-emerald-800 bg-emerald-950/60 text-emerald-300"
                                      >
                                        Terkumpul
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-800 bg-amber-950/60 text-amber-300"
                                      >
                                        Mengerjakan
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    {sub ? (
                                      <span
                                        className={`font-mono font-bold ${
                                          sub.score === 100
                                            ? 'text-emerald-400'
                                            : sub.score >= 70
                                            ? 'text-amber-400'
                                            : 'text-rose-400'
                                        }`}
                                      >
                                        {sub.score} / 100
                                      </span>
                                    ) : (
                                      <span className="font-mono text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {sub ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setReviewedSubmission(sub)}
                                        className="h-7 gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                                      >
                                        <Eye className="h-3 w-3" />
                                        Review
                                      </Button>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground/60 italic">
                                        Menunggu…
                                      </span>
                                    )}
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
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
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

                      <p className="mb-3 text-xs text-muted-foreground">
                        {reviewedSubmission.evaluation.feedback}
                      </p>

                      <div className="flex flex-col gap-1.5 rounded-lg border bg-background/80 p-3">
                        {reviewedSubmission.evaluation.checks.map((chk) => (
                          <div key={chk.targetId} className="flex items-start gap-2 text-xs">
                            {chk.passed ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => oplabInputRef.current?.click()}
                      className="gap-2 text-xs text-amber-400 hover:text-amber-300"
                      title="Buka file paket praktikum tugas mandiri (.oplab atau .json)"
                    >
                      <Upload className="h-4 w-4" />
                      Buka Tugas Mandiri (.oplab)
                    </Button>

                    <Button onClick={handleJoinClass} className="gap-2">
                      <Users className="h-4 w-4" />
                      Masuk ke Ruang Kelas
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

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setJoinedParticipant(null)}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Keluar Kelas
                    </Button>
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
                          onClick={handleSubmitWork}
                          disabled={isEvaluating}
                          className="gap-2"
                        >
                          <Send className="h-4 w-4" />
                          {isEvaluating ? 'Mengevaluasi…' : 'Kirim Jawaban (Submit)'}
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
                          ? 'border-emerald-700/60 bg-emerald-950/20'
                          : myEvaluation.status === 'partial'
                          ? 'border-amber-700/60 bg-amber-950/20'
                          : 'border-rose-700/60 bg-rose-950/20'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {myEvaluation.status === 'passed' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <HelpCircle className="h-5 w-5 text-amber-400" />
                          )}
                          <span className="text-sm font-bold text-foreground">
                            Hasil Evaluasi Otomatis
                          </span>
                        </div>
                        <span
                          className={`font-mono text-xl font-extrabold ${
                            myEvaluation.score === 100
                              ? 'text-emerald-400'
                              : myEvaluation.score >= 70
                              ? 'text-amber-400'
                              : 'text-rose-400'
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
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
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
