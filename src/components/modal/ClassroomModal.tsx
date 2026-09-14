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
  UserPlus,
  Eye,
  LogOut,
  HelpCircle,
  FileCheck2,
  Upload,
  Download,
  Plus,
  Pencil,
  Trash2,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const { nodes, edges, loadTopology, pushToast } = useAppStore();

  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('teacher');

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

  // Student State
  const [studentClassCode, setStudentClassCode] = useState('');
  const [studentNickname, setStudentNickname] = useState('');
  const [joinedParticipant, setJoinedParticipant] = useState<Participant | null>(null);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);
  const [myEvaluation, setMyEvaluation] = useState<ExerciseEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

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
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handler Guru: Buat Kelas Baru
  const handleCreateClass = () => {
    const newSession = classroomHub.createClass(classTitle, customCode);
    setSession(newSession);
    setParticipants([]);
    setSubmissions({});
    const activeToUse = selectedExercise || exercises[0] || DEFAULT_EXERCISES[0];
    setSelectedExercise(activeToUse);
    classroomHub.startExercise(newSession.classCode, activeToUse);
    pushToast(
      'success',
      `Kelas dibuat! Kode Kelas: ${newSession.classCode}. Bagikan kode ini ke siswa.`
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
        if (session) {
          classroomHub.startExercise(session.classCode, newItems[0]);
        }
        // Buka editor agar guru dapat langsung mereview atau menyesuaikan teks instruksi
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

    if (selectedExercise.id === savedExercise.id || idx < 0) {
      setSelectedExercise(savedExercise);
      if (session) {
        classroomHub.startExercise(session.classCode, savedExercise);
      }
    }

    pushToast('success', `Soal "${savedExercise.title}" berhasil disimpan.`);
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
    if (selectedExercise.id === exId) {
      setSelectedExercise(updated[0]);
      if (session) {
        classroomHub.startExercise(session.classCode, updated[0]);
      }
    }
    pushToast('info', 'Soal telah dihapus.');
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

  // Handler Guru: Siarkan Soal Baru
  const handleStartExercise = (exercise: Exercise) => {
    if (!session) return;
    classroomHub.startExercise(session.classCode, exercise);
    setSelectedExercise(exercise);
    pushToast('success', `Tantangan "${exercise.title}" disiarkan ke siswa.`);
  };

  // Handler Guru: Simulasikan Siswa Join & Submit
  const handleSimulateStudent = () => {
    if (!session) return;
    classroomHub.simulateSyntheticStudent(session.classCode);
    pushToast('info', 'Siswa simulasi bergabung dan sedang mengerjakan soal...');
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
      pushToast('success', `Selamat datang, ${participant.nickname}!`);
    }
  };

  // Handler Siswa: Muat Starter Template ke Kanvas
  const handleLoadStarterTemplate = () => {
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

  const renderExerciseCatalog = (isActiveSession: boolean) => (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="flex flex-col">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {isActiveSession ? 'Materi / Soal Latihan Aktif di Kelas' : 'Katalog Bank Soal Praktikum'}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              {isActiveSession
                ? 'Guru dapat memilih soal aktif untuk disiarkan atau menyunting instruksi & target secara langsung.'
                : 'Pilih dan persiapkan soal latihan sebelum membuka kelas. Anda dapat mengimpor file JSON guru.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 gap-1 text-[11px] text-sky-400 hover:text-sky-300"
            title="Pilih file JSON topologi (mis. openpacket-topology-*.json)"
          >
            <Upload className="h-3 w-3" />
            Impor Topologi (.json)
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {exercises.map((ex) => {
          const isCurrent = ex.id === selectedExercise.id;
          return (
            <div
              key={ex.id}
              className={`flex flex-col justify-between rounded-lg border p-3 transition-all ${
                isCurrent
                  ? 'border-primary bg-primary/10 shadow-xs'
                  : 'border-border bg-background/50 hover:border-muted-foreground/40'
              }`}
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold line-clamp-1 text-foreground" title={ex.title}>
                    {ex.title.split(':')[0]}
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                      {ex.difficulty}
                    </Badge>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                        Aktif
                      </span>
                    )}
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
                <Button
                  size="sm"
                  variant={isCurrent ? 'default' : 'secondary'}
                  onClick={() => {
                    setSelectedExercise(ex);
                    if (isActiveSession) {
                      handleStartExercise(ex);
                    }
                  }}
                  className="h-6 text-[10px] px-2"
                >
                  {isCurrent ? (isActiveSession ? 'Sedang Diuji' : 'Dipilih') : 'Pilih Soal'}
                </Button>

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-primary/20 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight">
                  Portal Kelas &amp; Praktikum Jaringan
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Ruang kelas interaktif tanpa akun: guru memandu soal, evaluasi otomatis deterministik.
                </DialogDescription>
              </div>
            </div>

            {/* Role Switcher */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'teacher' | 'student')}>
              <TabsList className="h-8">
                <TabsTrigger value="teacher" className="gap-1.5 text-xs">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Mode Guru
                </TabsTrigger>
                <TabsTrigger value="student" className="gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  Mode Siswa
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {/* ======================= TAB GURU ======================= */}
          {activeTab === 'teacher' && (
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
                        onClick={handleSimulateStudent}
                        className="gap-1.5 text-xs text-sky-400"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Simulasikan Siswa
                      </Button>

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
                      <span className="text-[11px] text-muted-foreground">
                        Terhubung via Realtime Channel
                      </span>
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

          {/* ======================= TAB SISWA ======================= */}
          {activeTab === 'student' && (
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

                  <div className="mt-5 flex justify-end">
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
