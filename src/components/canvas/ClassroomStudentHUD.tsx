import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  Send,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CheckCheck,
  AlertCircle,
  Download,
  Clock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAppStore } from '../../store/useAppStore';
import { classroomHub } from '../../features/classroom/classroomHub';
import { evaluateExercise } from '../../features/classroom/exerciseEvaluator';
import { exportSubmissionPackageFile } from '../../features/classroom/exerciseParser';
import { TOPOLOGY_TEMPLATES } from '../../data/topologyTemplates';
import type {
  ClassSession,
  Participant,
  Exercise,
  ExerciseEvaluation,
  Submission,
} from '../../features/classroom/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ClassroomStudentHUD() {
  const { nodes, edges, loadTopology, pushToast, requestConfirm } = useAppStore();
  const inspectorOpen = useAppStore((s) => s.inspectorOpen);

  const [session, setSession] = useState<ClassSession | null>(() => classroomHub.getSession());
  const [participant, setParticipant] = useState<Participant | null>(() =>
    classroomHub.getCurrentParticipant()
  );
  const [activeExercises, setActiveExercises] = useState<Exercise[]>(() =>
    classroomHub.getActiveExercises()
  );
  const [selectedExerciseIndex, setSelectedExerciseIndex] = useState<number>(0);
  const [evaluationsByExerciseId, setEvaluationsByExerciseId] = useState<
    Record<string, ExerciseEvaluation>
  >({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  // Soal yang sedang dipilih oleh siswa
  const activeExercise: Exercise | null =
    activeExercises[selectedExerciseIndex] || activeExercises[0] || null;

  // Evaluasi soal aktif saat ini
  const evaluation: ExerciseEvaluation | null =
    activeExercise && evaluationsByExerciseId[activeExercise.id]
      ? evaluationsByExerciseId[activeExercise.id]
      : null;

  // Handler Keluar Kelas
  const handleLeaveClass = useCallback(
    (confirm = true) => {
      const doLeave = () => {
        classroomHub.setCurrentParticipant(null);
        classroomHub.setLockedRole(null);
        setParticipant(null);
        setEvaluationsByExerciseId({});
        pushToast('info', 'Anda telah keluar dari ruang kelas.');
      };

      if (confirm) {
        requestConfirm({
          title: 'Keluar dari Kelas?',
          message:
            'Anda akan keluar dari sesi praktikum kelas ini. Anda dapat bergabung kembali kapan saja menggunakan kode kelas.',
          confirmLabel: 'Keluar Kelas',
          onConfirm: doLeave,
        });
      } else {
        doLeave();
      }
    },
    [pushToast, requestConfirm]
  );

  // Sinkronisasi realtime event
  useEffect(() => {
    const unsub = classroomHub.subscribe((event) => {
      switch (event.type) {
        case 'CLASS_CREATED':
          setSession(classroomHub.getSession());
          setActiveExercises(classroomHub.getActiveExercises());
          break;

        case 'SYNC_RESPONSE':
          setSession(event.session);
          if (event.activeExercises) {
            setActiveExercises(event.activeExercises);
          }
          break;

        case 'EXERCISES_UPDATED':
          if (event.exercises && event.exercises.length > 0) {
            setActiveExercises(event.exercises);
            pushToast(
              'info',
              `Guru memperbarui paket soal (${event.exercises.length} soal aktif). Pengerjaan Anda tetap aman tersimpan.`
            );
          }
          break;

        case 'EXERCISE_STARTED':
          if (event.exercises && event.exercises.length > 0) {
            setActiveExercises(event.exercises);
            setSelectedExerciseIndex(0);
          } else if (event.exercise) {
            setActiveExercises([event.exercise]);
            setSelectedExerciseIndex(0);
          }
          setEvaluationsByExerciseId({});
          pushToast(
            'info',
            event.exercises && event.exercises.length > 1
              ? `Paket ujian baru dimulai (${event.exercises.length} soal).`
              : `Materi baru dimulai: "${event.exercise?.title || 'Praktikum'}"`
          );
          break;

        case 'CLASS_STATUS_CHANGED':
          if (session && session.classCode === event.classCode) {
            setSession({ ...session, status: event.status });
          }
          break;

        case 'CLASS_CLOSED':
          if (session && session.classCode === event.classCode) {
            pushToast('warning', 'Sesi kelas telah diakhiri oleh guru.');
            handleLeaveClass(false);
          }
          break;
      }
    });

    return () => {
      unsub();
    };
  }, [session, handleLeaveClass, pushToast]);

  // Pantau perubahan participant lokal dan sinkronkan dengan server secara berkala
  useEffect(() => {
    const interval = setInterval(() => {
      const current = classroomHub.getCurrentParticipant();
      if (current?.id !== participant?.id) {
        setParticipant(current);
      }
      const curSess = classroomHub.getSession();
      if (curSess && curSess.classCode) {
        void classroomHub.syncWithServer(curSess.classCode);
        const latest = classroomHub.getActiveExercises();
        if (latest && latest.length !== activeExercises.length) {
          setActiveExercises(latest);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [participant, activeExercises.length]);

  // Evaluasi topologi kanvas untuk satu soal
  const runEvaluationForExercise = async (
    ex: Exercise
  ): Promise<ExerciseEvaluation | null> => {
    const devices = nodes.map((n) => n.data);
    const links = edges.map((e) => ({
      sourceNodeId: e.source,
      sourcePortId: e.sourceHandle!,
      targetNodeId: e.target,
      targetPortId: e.targetHandle!,
    }));

    return await evaluateExercise(ex, devices, links);
  };

  // Handler Cek Mandiri (Self-Check untuk soal aktif saat ini)
  const handleSelfCheck = async () => {
    if (!activeExercise) return;
    setIsEvaluating(true);
    try {
      const evalResult = await runEvaluationForExercise(activeExercise);
      if (!evalResult) return;

      setEvaluationsByExerciseId((prev) => ({
        ...prev,
        [activeExercise.id]: evalResult,
      }));

      if (evalResult.status === 'passed') {
        pushToast(
          'success',
          `Hebat! Kriteria "${activeExercise.title.split(':')[0]}" terpenuhi (Skor 100).`
        );
      } else {
        pushToast(
          'info',
          `Cek Mandiri (${activeExercise.title.split(':')[0]}): ${evalResult.feedback}`
        );
      }
    } catch (err) {
      pushToast(
        'error',
        `Gagal mengevaluasi: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handler Kirim Jawaban (Submit resmi seluruh soal ke Guru)
  const handleSubmitWork = async () => {
    if (!session || !participant || activeExercises.length === 0) return;
    setIsEvaluating(true);

    try {
      const updatedEvals: Record<string, ExerciseEvaluation> = {
        ...evaluationsByExerciseId,
      };
      const exerciseScores: Record<string, number> = {};

      // Evaluasi otomatis seluruh soal dalam paket ujian
      for (const ex of activeExercises) {
        const res = await runEvaluationForExercise(ex);
        if (res) {
          updatedEvals[ex.id] = res;
          exerciseScores[ex.id] = res.score;
        } else {
          exerciseScores[ex.id] = 0;
        }
      }

      setEvaluationsByExerciseId(updatedEvals);

      // Hitung skor rata-rata paket ujian
      const scores = Object.values(exerciseScores);
      const totalScore = scores.reduce((a, b) => a + b, 0);
      const avgScore =
        scores.length > 0 ? Math.round(totalScore / scores.length) : 0;
      const overallStatus =
        avgScore === 100 ? 'passed' : avgScore > 0 ? 'partial' : 'failed';

      const currentEval = activeExercise
        ? updatedEvals[activeExercise.id]
        : Object.values(updatedEvals)[0];

      const submission: Submission = {
        participantId: participant.id,
        nickname: participant.nickname,
        exerciseId: activeExercise?.id || activeExercises[0].id,
        score: avgScore,
        status: overallStatus,
        evaluation: currentEval || {
          status: overallStatus,
          score: avgScore,
          feedback: `Pengerjaan selesai dengan skor rata-rata ${avgScore}/100.`,
          evaluatedAt: new Date().toLocaleTimeString(),
          checks: [],
        },
        evaluations: updatedEvals,
        exerciseScores,
        submittedAt: Date.now(),
      };

      classroomHub.submitWork(session.classCode, submission);

      if (avgScore === 100) {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          confetti({ particleCount: 160, spread: 80, origin: { y: 0.5, x: 0.8 } });
        }
        pushToast(
          'success',
          'Luar biasa! Seluruh soal ujian terselesaikan dengan skor sempurna 100 dan terkirim ke guru.'
        );
      } else {
        pushToast(
          'info',
          `Lembar kerja dikirim ke guru dengan skor rata-rata ${avgScore}/100 (${activeExercises.length} soal).`
        );
      }
    } catch (err) {
      pushToast(
        'error',
        `Gagal mengirim jawaban: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handler Ekspor Lembar Jawaban (.opsub)
  const handleExportSubmissionFile = async () => {
    if (!participant || !activeExercise) return;
    setIsEvaluating(true);
    try {
      let currentEval = evaluation;
      if (!currentEval) {
        currentEval = await runEvaluationForExercise(activeExercise);
        if (currentEval) {
          setEvaluationsByExerciseId((prev) => ({
            ...prev,
            [activeExercise.id]: currentEval!,
          }));
        }
      }
      if (!currentEval) return;

      const sub: Submission = {
        participantId: participant.id,
        nickname: participant.nickname,
        exerciseId: activeExercise.id,
        score: currentEval.score,
        status: currentEval.status,
        evaluation: currentEval,
        evaluations: evaluationsByExerciseId,
        submittedAt: Date.now(),
      };

      const topoDevices = nodes;
      const topoEdges = edges;
      exportSubmissionPackageFile(sub, { nodes: topoDevices, edges: topoEdges });
      pushToast(
        'success',
        'Berkas lembar jawaban (.opsub) berhasil diunduh. Anda dapat menyerahkannya ke guru.'
      );
    } catch (err) {
      pushToast(
        'error',
        `Gagal mengekspor berkas: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  // Handler Muat Topologi Guru
  const handleLoadStarterTopology = () => {
    if (!activeExercise) return;
    const doLoad = () => {
      if (activeExercise.starterTopology) {
        loadTopology({
          nodes: activeExercise.starterTopology.nodes,
          edges: activeExercise.starterTopology.edges,
        });
        pushToast('success', 'Topologi soal dari guru berhasil dimuat ke kanvas Anda.');
        return;
      }

      if (activeExercise.starterTemplateId) {
        const tpl = TOPOLOGY_TEMPLATES.find((t) => t.id === activeExercise.starterTemplateId);
        if (tpl) {
          loadTopology({ nodes: tpl.nodes, edges: tpl.edges });
          pushToast('success', `Template "${tpl.name}" diterapkan ke kanvas.`);
          return;
        }
      }

      pushToast('info', 'Soal ini dirancang untuk dirakit dari awal pada kanvas kosong.');
    };

    if (nodes.length > 0) {
      requestConfirm({
        title: 'Muat Topologi Guru?',
        message:
          'Memuat topologi ini akan menimpa seluruh perangkat dan koneksi kabel di kanvas Anda saat ini. Lanjutkan?',
        confirmLabel: 'Muat Topologi',
        onConfirm: doLoad,
      });
    } else {
      doLoad();
    }
  };

  // Jika siswa belum bergabung, jangan tampilkan HUD
  if (!participant) {
    return null;
  }

  // Posisi dinamis: jika PDU Inspector terbuka di kanan, geser HUD ke kirinya pada layar lebar agar tidak bertumpukan
  const positionClass = inspectorOpen
    ? 'right-2 sm:right-4 md:right-[336px]'
    : 'right-2 sm:right-4';

  // Jika siswa sudah terhubung tetapi belum ada soal yang disiarkan oleh guru
  if (!activeExercise || activeExercises.length === 0) {
    return (
      <Card
        className={cn(
          'absolute top-3 z-30 flex flex-col border border-primary/40 bg-background/95 shadow-2xl backdrop-blur transition-all duration-200 w-[calc(100vw-1rem)] sm:w-[380px] max-w-[380px]',
          positionClass
        )}
      >
        <div className="flex items-center justify-between border-b bg-muted/40 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold text-foreground">
                {session?.classCode || 'KELAS'}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {participant.nickname} • Terhubung
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleLeaveClass(true)}
            className="h-7 px-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Keluar
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
          <Clock className="h-8 w-8 text-amber-400 animate-pulse" />
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-bold text-foreground">Menunggu Soal dari Guru</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Anda telah terhubung ke ruang kelas. Begitu guru menyiarkan materi ujian atau latihan, lembar instruksi dan target praktikum akan otomatis muncul di sini.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Tampilan Minimized (Floating Pill)
  if (isMinimized) {
    return (
      <div
        className={cn(
          'absolute top-3 z-30 flex items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3 py-1.5 shadow-2xl backdrop-blur transition-all duration-200 max-w-[calc(100vw-1rem)]',
          positionClass
        )}
      >
        <div className="flex items-center gap-1.5 text-xs truncate">
          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          <span className="font-mono font-bold text-foreground shrink-0">
            {session?.classCode || 'KELAS'}
          </span>
          <span className="text-muted-foreground truncate">• {participant?.nickname || 'Siswa'}</span>
          {activeExercises.length > 1 && (
            <span className="text-[10px] text-primary font-mono shrink-0">
              ({selectedExerciseIndex + 1}/{activeExercises.length})
            </span>
          )}
        </div>

        {evaluation && (
          <Badge
            variant="outline"
            className={`text-[10px] font-bold shrink-0 ${
              evaluation.score === 100
                ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300'
                : 'border-amber-800 bg-amber-950/60 text-amber-300'
            }`}
          >
            {evaluation.score}/100
          </Badge>
        )}

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsMinimized(false)}
          className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
          title="Buka Lembar Kerja"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Tampilan Expanded (HUD Floating Card)
  return (
    <Card
      className={cn(
        'absolute top-3 z-30 flex max-h-[80vh] w-[calc(100vw-1rem)] sm:w-[380px] max-w-[380px] flex-col overflow-hidden border-border/80 bg-background/95 shadow-2xl backdrop-blur transition-all duration-200',
        positionClass
      )}
    >
      {/* Header HUD */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/20 p-1.5 text-primary">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-foreground">
                {session?.classCode || 'KELAS'}
              </span>
              <Badge variant="outline" className="text-[10px] text-primary py-0 px-1">
                {activeExercise?.difficulty || 'Menengah'}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Peserta: <b className="text-foreground">{participant?.nickname || 'Siswa'}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsMinimized(true)}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Kecilkan Tampilan (Minimize)"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleLeaveClass(true)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Keluar dari Kelas"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Navigasi Multi-Soal (Bebas Pilih Mana Dulu yang Ingin Dikerjakan) */}
      {activeExercises.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-muted/25 px-3 py-2 scrollbar-none">
          <span className="text-[10px] font-bold uppercase text-muted-foreground shrink-0 mr-1">
            Pilih Soal:
          </span>
          {activeExercises.map((ex, idx) => {
            const isSelected = idx === selectedExerciseIndex;
            const exEval = evaluationsByExerciseId[ex.id];
            return (
              <button
                key={ex.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedExerciseIndex(idx);
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all shrink-0 cursor-pointer select-none border touch-manipulation pointer-events-auto active:scale-95',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'border-border/60 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span>Soal {idx + 1}</span>
                {exEval ? (
                  <span
                    className={cn(
                      'rounded px-1 text-[9px] font-bold',
                      exEval.score === 100
                        ? isSelected
                          ? 'bg-emerald-300 text-black'
                          : 'bg-emerald-500/15 text-emerald-400'
                        : isSelected
                        ? 'bg-amber-300 text-black'
                        : 'bg-amber-500/15 text-amber-400'
                    )}
                  >
                    {exEval.score}%
                  </span>
                ) : (
                  <span className="text-[9px] opacity-60">-</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Konten Scrollable */}
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 text-xs">
        {/* Detail Soal Aktif */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <h3 className="font-bold text-foreground line-clamp-1">{activeExercise?.title}</h3>
            {activeExercises.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() => setSelectedExerciseIndex((prev) => Math.max(0, prev - 1))}
                  disabled={selectedExerciseIndex === 0}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30 touch-manipulation"
                  title="Soal Sebelumnya"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                  {selectedExerciseIndex + 1}/{activeExercises.length}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setSelectedExerciseIndex((prev) =>
                      Math.min(activeExercises.length - 1, prev + 1)
                    )
                  }
                  disabled={selectedExerciseIndex === activeExercises.length - 1}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground disabled:opacity-30 touch-manipulation"
                  title="Soal Selanjutnya"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {activeExercise?.instructions}
          </p>

          {(activeExercise?.starterTopology || activeExercise?.starterTemplateId) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLoadStarterTopology}
              className="mt-1 h-7 self-start gap-1.5 border-primary/40 bg-primary/10 text-[11px] text-primary hover:bg-primary/20"
            >
              <Play className="h-3 w-3" />
              {activeExercise?.starterTopology
                ? 'Muat Topologi Guru ke Kanvas'
                : 'Muat Topologi Awal'}
            </Button>
          )}
        </div>

        {/* Daftar Target Penilaian */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Target Praktikum ({activeExercise?.targets?.length ?? 0})
            </span>
            {evaluation && (
              <span
                className={`font-mono text-xs font-bold ${
                  evaluation.score === 100
                    ? 'text-emerald-400'
                    : evaluation.score >= 70
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {evaluation.score}/100
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {(activeExercise?.targets ?? []).map((tgt, idx) => {
              const check = evaluation?.checks.find((c) => c.targetId === tgt.id);
              return (
                <div
                  key={tgt.id}
                  className="flex flex-col gap-0.5 rounded border border-border/50 bg-background/60 p-2 text-[11px]"
                >
                  <div className="flex items-start gap-2">
                    {check ? (
                      check.passed ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                      )
                    ) : (
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                        {idx + 1}
                      </span>
                    )}

                    <div className="flex flex-1 flex-col">
                      <span
                        className={
                          check?.passed
                            ? 'font-medium text-emerald-300'
                            : 'font-medium text-foreground/90'
                        }
                      >
                        {tgt.title}
                      </span>
                      {check && (
                        <span
                          className={`text-[10px] leading-tight ${
                            check.passed ? 'text-muted-foreground' : 'text-rose-400/90'
                          }`}
                        >
                          {check.reason}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ulasan Singkat Evaluasi */}
        {evaluation && (
          <div
            className={`rounded-lg border p-2.5 text-[11px] ${
              evaluation.status === 'passed'
                ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300'
                : 'border-amber-800/60 bg-amber-950/20 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {evaluation.status === 'passed' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-400" />
              )}
              {evaluation.status === 'passed' ? 'Tuntas Sempurna' : 'Perlu Diperbaiki'}
            </div>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              {evaluation.feedback}
            </p>
          </div>
        )}
      </div>

      {/* Footer Aksi */}
      <div className="flex flex-col gap-2 border-t bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSelfCheck}
            disabled={isEvaluating}
            className="h-8 gap-1.5 text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {isEvaluating ? 'Mengecek…' : 'Cek Mandiri'}
          </Button>

          <Button
            size="sm"
            onClick={handleSubmitWork}
            disabled={isEvaluating}
            className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90"
          >
            <Send className="h-3.5 w-3.5" />
            {isEvaluating
              ? 'Mengevaluasi…'
              : activeExercises.length > 1
              ? 'Kirim Semua Jawaban'
              : 'Kirim Jawaban'}
          </Button>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={handleExportSubmissionFile}
          disabled={isEvaluating}
          className="h-7 w-full gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          title="Unduh file hasil pengerjaan untuk diserahkan ke guru (.opsub)"
        >
          <Download className="h-3 w-3" />
          Ekspor Lembar Jawaban (.opsub)
        </Button>

        {activeExercises.length > 1 && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
            <button
              type="button"
              onClick={() => setSelectedExerciseIndex((prev) => Math.max(0, prev - 1))}
              disabled={selectedExerciseIndex === 0}
              className="flex items-center gap-1 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed touch-manipulation active:scale-95"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Soal Sebelumnya
            </button>
            <span className="font-mono text-[10px] text-primary font-semibold">
              {selectedExerciseIndex + 1} dari {activeExercises.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedExerciseIndex((prev) =>
                  Math.min(activeExercises.length - 1, prev + 1)
                )
              }
              disabled={selectedExerciseIndex === activeExercises.length - 1}
              className="flex items-center gap-1 hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed touch-manipulation active:scale-95"
            >
              Soal Selanjutnya
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
