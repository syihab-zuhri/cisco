import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  Send,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  ChevronUp,
  LogOut,
  CheckCheck,
  AlertCircle,
  Download,
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

export function ClassroomStudentHUD() {
  const { nodes, edges, loadTopology, pushToast, requestConfirm } = useAppStore();

  const [session, setSession] = useState<ClassSession | null>(() => classroomHub.getSession());
  const [participant, setParticipant] = useState<Participant | null>(() =>
    classroomHub.getCurrentParticipant()
  );
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(() =>
    classroomHub.getActiveExercise()
  );
  const [evaluation, setEvaluation] = useState<ExerciseEvaluation | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Handler Keluar Kelas
  const handleLeaveClass = useCallback(
    (confirm = true) => {
      const doLeave = () => {
        classroomHub.setCurrentParticipant(null);
        setParticipant(null);
        setEvaluation(null);
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
        case 'SYNC_RESPONSE':
          setSession(classroomHub.getSession());
          setActiveExercise(classroomHub.getActiveExercise());
          break;

        case 'EXERCISE_STARTED':
          setActiveExercise(event.exercise);
          setEvaluation(null);
          pushToast('info', `Materi baru dimulai: "${event.exercise.title}"`);
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

  // Pantau perubahan local participant
  useEffect(() => {
    const interval = setInterval(() => {
      const current = classroomHub.getCurrentParticipant();
      if (current?.id !== participant?.id) {
        setParticipant(current);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [participant]);

  // Evaluasi topologi kanvas saat ini
  const runEvaluation = async (): Promise<ExerciseEvaluation | null> => {
    if (!activeExercise) return null;
    const devices = nodes.map((n) => n.data);
    const links = edges.map((e) => ({
      sourceNodeId: e.source,
      sourcePortId: e.sourceHandle!,
      targetNodeId: e.target,
      targetPortId: e.targetHandle!,
    }));

    return await evaluateExercise(activeExercise, devices, links);
  };

  // Handler Cek Mandiri (Self-Check tanpa submit resmi)
  const handleSelfCheck = async () => {
    if (!activeExercise) return;
    setIsEvaluating(true);
    try {
      const evalResult = await runEvaluation();
      if (!evalResult) return;
      setEvaluation(evalResult);

      if (evalResult.status === 'passed') {
        pushToast(
          'success',
          'Hebat! Seluruh kriteria praktikum terpenuhi (Skor 100). Klik "Kirim Jawaban" untuk mengumpulkan ke guru.'
        );
      } else {
        pushToast('info', `Cek Mandiri: ${evalResult.feedback}`);
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

  // Handler Kirim Jawaban (Submit resmi ke Guru)
  const handleSubmitWork = async () => {
    if (!session || !participant || !activeExercise) return;
    setIsEvaluating(true);

    try {
      const evalResult = await runEvaluation();
      if (!evalResult) return;
      setEvaluation(evalResult);

      const submission: Submission = {
        participantId: participant.id,
        nickname: participant.nickname,
        exerciseId: activeExercise.id,
        score: evalResult.score,
        status: evalResult.status,
        evaluation: evalResult,
        submittedAt: Date.now(),
      };

      classroomHub.submitWork(session.classCode, submission);

      if (evalResult.score === 100) {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          confetti({ particleCount: 160, spread: 80, origin: { y: 0.5, x: 0.8 } });
        }
        pushToast(
          'success',
          'Luar biasa! Lembar kerja dengan skor sempurna 100 berhasil dikirim ke guru.'
        );
      } else {
        pushToast('info', `Lembar kerja dikirim ke guru dengan skor ${evalResult.score}/100.`);
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
        currentEval = await runEvaluation();
        if (currentEval) setEvaluation(currentEval);
      }
      if (!currentEval) return;

      const sub: Submission = {
        participantId: participant.id,
        nickname: participant.nickname,
        exerciseId: activeExercise.id,
        score: currentEval.score,
        status: currentEval.status,
        evaluation: currentEval,
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
  if (!participant || !activeExercise) {
    return null;
  }

  // Tampilan Minimized (Floating Pill)
  if (isMinimized) {
    return (
      <div className="absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full border border-primary/40 bg-background/90 px-3.5 py-1.5 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-1.5 text-xs">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span className="font-mono font-bold text-foreground">
            {session?.classCode || 'KELAS'}
          </span>
          <span className="text-muted-foreground">• {participant.nickname}</span>
        </div>

        {evaluation && (
          <Badge
            variant="outline"
            className={`text-[10px] font-bold ${
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
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Buka Lembar Kerja"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Tampilan Expanded (HUD Floating Card)
  return (
    <Card className="absolute right-4 top-4 z-30 flex max-h-[82vh] w-[390px] flex-col overflow-hidden border-border/80 bg-background/95 shadow-2xl backdrop-blur">
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
                {activeExercise.difficulty}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Peserta: <b className="text-foreground">{participant.nickname}</b>
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

      {/* Konten Scrollable */}
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4 text-xs">
        {/* Detail Soal Aktif */}
        <div className="flex flex-col gap-1.5">
          <h3 className="font-bold text-foreground">{activeExercise.title}</h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {activeExercise.instructions}
          </p>

          {(activeExercise.starterTopology || activeExercise.starterTemplateId) && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleLoadStarterTopology}
              className="mt-1 h-7 self-start gap-1.5 border-primary/40 bg-primary/10 text-[11px] text-primary hover:bg-primary/20"
            >
              <Play className="h-3 w-3" />
              {activeExercise.starterTopology
                ? 'Muat Topologi Guru ke Kanvas'
                : 'Muat Topologi Awal'}
            </Button>
          )}
        </div>

        {/* Daftar Target Penilaian */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Target Praktikum ({activeExercise.targets.length})
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
            {activeExercise.targets.map((tgt, idx) => {
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
            {isEvaluating ? 'Mengevaluasi…' : 'Kirim Jawaban'}
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
      </div>
    </Card>
  );
}
