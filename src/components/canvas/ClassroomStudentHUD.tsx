import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useAppStore } from '../../store/useAppStore';
import { classroomHub } from '../../features/classroom/classroomHub';
import { exportWorkPackageFile } from '../../features/classroom/exerciseParser';
import { gradingKey, studentWorkspace } from '../../features/classroom/studentWorkspace';
import { workTopology } from '../../features/workspace/draft';
import type {
  ClassSession,
  Participant,
  Exercise,
  ExerciseEvaluation,
  StarterTopology,
  Submission,
} from '../../features/classroom/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Mesin penilaian (HeadlessSimulationEngine, evaluator, template topologi) cukup besar dan baru
// dibutuhkan saat siswa mengecek/mengirim jawaban, jadi dimuat sesuai kebutuhan, bukan di bundel awal.
const loadGrading = () =>
  Promise.all([
    import('../../features/classroom/exerciseEvaluator'),
    import('../../features/classroom/submissionBuilder'),
    import('../../features/classroom/verification'),
    import('../../features/classroom/starterTopology'),
  ]).then(([evaluator, builder, verification, starter]) => ({ ...evaluator, ...builder, ...verification, ...starter }));

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
  // Jawaban resmi ronde ini (satu kali kirim). Dibaca ulang dari hub pada setiap event kelas.
  const [mySubmission, setMySubmission] = useState<Submission | null>(() => classroomHub.getMySubmission());
  const workspaceScope = session && participant ? `${session.id}:${participant.id}:${session.round ?? 0}` : null;
  const workspaceRef = useRef<{ scope: string; exerciseId: string } | null>(null);
  const switchingRef = useRef(false);
  const exerciseIds = activeExercises.map((e) => e.id).join('|');
  const rubricKey = JSON.stringify(activeExercises);
  const currentRubricRef = useRef(rubricKey);
  currentRubricRef.current = rubricKey;

  useEffect(() => { setEvaluationsByExerciseId({}); }, [workspaceScope, rubricKey]);

  useEffect(() => {
    if (!workspaceScope || activeExercises.length === 0) return;
    const work = studentWorkspace.read(workspaceScope);
    const previous = workspaceRef.current;
    if (previous?.scope !== workspaceScope || !activeExercises.some((e) => e.id === previous.exerciseId)) {
      const index = Math.max(0, activeExercises.findIndex((e) => e.id === work.selectedExerciseId));
      const exerciseId = activeExercises[index].id;
      workspaceRef.current = { scope: workspaceScope, exerciseId };
      setSelectedExerciseIndex(index);
      const saved = work.topologies[exerciseId];
      if (saved) loadTopology(saved);
      else if (previous) loadTopology({ nodes: [], edges: [] });
    }
    const save = () => {
      const current = workspaceRef.current;
      if (current?.scope === workspaceScope) studentWorkspace.save(workspaceScope, current.exerciseId, useAppStore.getState());
    };
    save();
    return useAppStore.subscribe((state, old) => {
      if (state.nodes === old.nodes && state.edges === old.edges) return;
      save();
      if (!switchingRef.current && gradingKey(state) !== gradingKey(old)) {
        const id = workspaceRef.current?.exerciseId;
        if (id) setEvaluationsByExerciseId((prior) => {
          if (!prior[id]) return prior;
          const next = { ...prior }; delete next[id]; return next;
        });
      }
    });
  }, [workspaceScope, exerciseIds, loadTopology]);

  const selectExercise = (index: number) => {
    if (!workspaceScope || isEvaluating || index === selectedExerciseIndex) return;
    const next = activeExercises[index];
    if (!next) return;
    const current = workspaceRef.current;
    if (current?.scope === workspaceScope) studentWorkspace.save(workspaceScope, current.exerciseId, useAppStore.getState());
    const saved = studentWorkspace.read(workspaceScope).topologies[next.id];
    workspaceRef.current = { scope: workspaceScope, exerciseId: next.id };
    switchingRef.current = true;
    try { loadTopology(saved ?? { nodes: [], edges: [] }); }
    finally { switchingRef.current = false; }
    studentWorkspace.save(workspaceScope, next.id, useAppStore.getState());
    setSelectedExerciseIndex(index);
  };

  const captureWork = (): StarterTopology => {
    const current = workTopology(useAppStore.getState());
    if (!workspaceScope || !activeExercise) return current;
    studentWorkspace.save(workspaceScope, activeExercise.id, current);
    const stored = studentWorkspace.read(workspaceScope).topologies;
    return { ...current, exerciseTopologies: Object.fromEntries(activeExercises.map((ex) => [ex.id, stored[ex.id] ?? { nodes: [], edges: [] }])) };
  };
  // Kuota cek mandiri disimpan di hub (sessionStorage): tidak hilang saat refresh dan otomatis
  // kembali penuh pada ronde baru. State ini hanya memicu render ulang.
  const [, setSelfCheckTick] = useState(0);
  // Pelacak perubahan soal/ronde dari polling (siswa lintas perangkat tidak menerima event realtime).
  const lastRoundRef = useRef<number>(classroomHub.getSession()?.round ?? 0);
  const lastExerciseKeyRef = useRef<string>(classroomHub.getActiveExercises().map((x) => x.id).join('|'));
  const syncedOnceRef = useRef<boolean>(false);
  const [isMinimized, setIsMinimized] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  // Pastikan jika daftar soal kosong, seluruh status penilaian & indeks soal segera direset
  useEffect(() => {
    if (activeExercises.length === 0) {
      setSelectedExerciseIndex(0);
      setEvaluationsByExerciseId({});
      setIsEvaluating(false);
    }
  }, [activeExercises.length]);

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
        classroomHub.leaveClass();
        setParticipant(null);
        setActiveExercises([]);
        setSelectedExerciseIndex(0);
        setEvaluationsByExerciseId({});
        setIsEvaluating(false);
        setSession(null);
        pushToast('info', 'Berhasil keluar dari Mode Siswa.');
      };

      if (confirm) {
        requestConfirm({
          title: 'Keluar Mode Siswa?',
          message:
            'Keluar Mode Siswa? Anda akan keluar dari peran siswa dan sesi praktikum kelas.',
          confirmLabel: 'Keluar Mode Siswa',
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
      setMySubmission(classroomHub.getMySubmission());
      switch (event.type) {
        case 'CLASS_CREATED':
          setSession(classroomHub.getSession());
          setActiveExercises(classroomHub.getActiveExercises());
          break;

        case 'SYNC_RESPONSE':
          setSession(event.session);
          if (!event.session || event.session.status === 'closed') {
            break;
          }
          {
            const nextList =
              event.activeExercises && event.activeExercises.length > 0
                ? event.activeExercises
                : event.activeExercise
                ? [event.activeExercise]
                : [];
            const nextKey = nextList.map((x) => x.id).join('|');
            const nextRound = event.session?.round ?? 0;
            // Polling menggantikan event realtime untuk perangkat lain: bangkitkan notifikasi yang sama.
            if (syncedOnceRef.current) {
              if (nextList.length > 0 && nextRound !== lastRoundRef.current) {
                setEvaluationsByExerciseId({});
                setSelectedExerciseIndex(0);
                pushToast(
                  'info',
                  nextList.length > 1
                    ? `Paket ujian baru dimulai (${nextList.length} soal).`
                    : `Materi baru dimulai: "${nextList[0].title || 'Praktikum'}"`
                );
              } else if (nextKey !== lastExerciseKeyRef.current) {
                pushToast(
                  'info',
                  nextList.length === 0
                    ? 'Materi/soal aktif telah ditiadakan oleh guru.'
                    : `Guru memperbarui paket soal (${nextList.length} soal aktif). Pengerjaan Anda tetap aman tersimpan.`
                );
              }
            }
            syncedOnceRef.current = true;
            lastRoundRef.current = nextRound;
            lastExerciseKeyRef.current = nextKey;

            if (nextList.length > 0) {
              setActiveExercises(nextList);
              setSelectedExerciseIndex((prev) => (prev >= nextList.length ? 0 : prev));
            } else {
              setActiveExercises([]);
              setSelectedExerciseIndex(0);
              setEvaluationsByExerciseId({});
              setIsEvaluating(false);
            }
          }
          break;

        case 'EXERCISES_UPDATED':
          lastExerciseKeyRef.current = (event.exercises ?? []).map((x) => x.id).join('|');
          if (event.exercises && event.exercises.length > 0) {
            setActiveExercises(event.exercises);
            setSelectedExerciseIndex((prev) => (prev >= event.exercises.length ? 0 : prev));
            pushToast(
              'info',
              `Guru memperbarui paket soal (${event.exercises.length} soal aktif). Pengerjaan Anda tetap aman tersimpan.`
            );
          } else {
            setActiveExercises([]);
            setSelectedExerciseIndex(0);
            setEvaluationsByExerciseId({});
            setIsEvaluating(false);
            pushToast('info', 'Materi/soal aktif telah ditiadakan oleh guru.');
          }
          break;

        case 'EXERCISE_STARTED':
          // Soal baru → kuota cek mandiri otomatis kembali penuh (kunci kuota memuat nomor ronde)
          lastRoundRef.current = classroomHub.getSession()?.round ?? lastRoundRef.current;
          lastExerciseKeyRef.current = (event.exercises ?? (event.exercise ? [event.exercise] : [])).map((x) => x.id).join('|');
          setSelfCheckTick((t) => t + 1);
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

        case 'CLASS_SETTINGS_CHANGED':
          if (session && session.classCode === event.classCode) {
            setSession({ ...session, allowSelfCheck: event.allowSelfCheck });
            pushToast(
              'info',
              event.allowSelfCheck
                ? 'Guru mengizinkan fitur Cek Mandiri.'
                : 'Guru menonaktifkan fitur Cek Mandiri (Mode Ujian).'
            );
          }
          break;

        case 'STUDENT_SESSION_ENDED':
          setParticipant(null);
          setActiveExercises([]);
          setSelectedExerciseIndex(0);
          setEvaluationsByExerciseId({});
          setIsEvaluating(false);
          setSession(null);
          pushToast(
            'warning',
            event.reason === 'kicked'
              ? `Anda dikeluarkan dari kelas ${event.classCode} oleh guru. Topologi Anda tetap ada di kanvas.`
              : event.reason === 'replaced'
              ? `Kelas Anda sudah berakhir; kode ${event.classCode} kini dipakai kelas lain. Sesi Anda diakhiri dan jawaban tidak dikirim ke kelas tersebut; topologi tetap ada di kanvas.`
              : `Kelas ${event.classCode} ditutup oleh guru. Sesi Anda telah berakhir; topologi tetap ada di kanvas.`,
            8000
          );
          break;

        case 'ROLE_CHANGED':
          if (event.role !== 'student') {
            setParticipant(null);
            setActiveExercises([]);
            setSelectedExerciseIndex(0);
            setEvaluationsByExerciseId({});
            setSession(null);
          }
          break;

        case 'PARTICIPANT_CHANGED':
          setParticipant(event.participant);
          if (!event.participant) {
            setActiveExercises([]);
            setSelectedExerciseIndex(0);
            setEvaluationsByExerciseId({});
            setSession(null);
          }
          break;

        case 'RELAY_REJECTED':
          pushToast('error', event.message);
          break;

        case 'RELAY_RESTORED':
          pushToast('info', 'Server kelas sempat restart — Anda tersambung kembali otomatis.');
          break;
      }
    });

    return () => {
      unsub();
    };
  }, [session, handleLeaveClass, pushToast]);

  // Sinkronisasi otomatis terpadu dengan server relay saat partisipan aktif
  useEffect(() => {
    if (!participant) return;
    const unsub = classroomHub.startAutoSync();
    return unsub;
  }, [participant]);

  // Bergabung ke kelas baru: polling pertama hanya menetapkan acuan (tanpa notifikasi "soal baru").
  const participantId = participant?.id ?? null;
  useEffect(() => {
    syncedOnceRef.current = false;
  }, [participantId]);

  // Evaluasi topologi kanvas untuk satu soal
  const runEvaluationForExercise = async (
    ex: Exercise
  ): Promise<ExerciseEvaluation | null> => {
    const { evaluateExercise, edgesToLinks } = await loadGrading();
    const devices = nodes.map((n) => n.data);
    return await evaluateExercise(ex, devices, edgesToLinks(edges));
  };

  // Handler Cek Mandiri (Self-Check untuk soal aktif saat ini)
  const handleSelfCheck = async () => {
    if (!activeExercise) return;
    if (session?.allowSelfCheck === false) {
      pushToast('warning', 'Fitur cek mandiri dinonaktifkan oleh guru untuk sesi ini.');
      return;
    }
    const limit = session?.selfCheckLimit ?? 5;
    const used = classroomHub.getSelfCheckCount(activeExercise.id);
    if (used >= limit) {
      pushToast('warning', `Kuota cek mandiri untuk soal ini sudah habis (${limit}/${limit}).`);
      return;
    }
    setIsEvaluating(true);
    const originalKey = gradingKey(useAppStore.getState());
    const originalRubric = rubricKey;
    try {
      const evalResult = await runEvaluationForExercise(activeExercise);
      if (!evalResult) return;
      if (originalKey !== gradingKey(useAppStore.getState()) || originalRubric !== currentRubricRef.current) {
        pushToast('info', 'Pekerjaan berubah saat diperiksa. Jalankan Cek Mandiri lagi.');
        return;
      }

      // Increment counter (persisten per ronde)
      classroomHub.incrementSelfCheckCount(activeExercise.id);
      setSelfCheckTick((t) => t + 1);

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

  useEffect(() => { setMySubmission(classroomHub.getMySubmission()); }, [participant, workspaceScope]);

  // Kirim Jawaban: hanya sekali per ronde, dengan konfirmasi (klik Kirim → klik "Ya, Kirim Jawaban").
  const confirmSubmitWork = () => {
    if (!session || !participant || activeExercises.length === 0 || isEvaluating) return;
    if (classroomHub.getMySubmission()) {
      pushToast('info', 'Jawaban sudah dikirim untuk ronde ini dan tidak dapat diubah.');
      return;
    }
    const count = activeExercises.length;
    requestConfirm({
      title: count > 1 ? 'Kirim Semua Jawaban?' : 'Kirim Jawaban?',
      message:
        `Jawaban hanya dapat dikirim SATU KALI untuk ronde ini${count > 1 ? ` (seluruh ${count} soal sekaligus)` : ''} ` +
        'dan tidak dapat diubah setelah terkirim. ' +
        (session.allowSelfCheck === false
          ? 'Periksa kembali pekerjaan Anda sebelum mengirim.'
          : 'Gunakan Cek Mandiri terlebih dahulu bila ingin memeriksa pekerjaan.'),
      confirmLabel: 'Ya, Kirim Jawaban',
      onConfirm: () => void handleSubmitWork(),
    });
  };

  // Handler Kirim Jawaban (Submit resmi seluruh soal ke Guru)
  const handleSubmitWork = async () => {
    if (!session || !participant || activeExercises.length === 0) return;
    if (classroomHub.getMySubmission()) return;
    setIsEvaluating(true);

    try {
      // Evaluasi otomatis seluruh soal dalam paket ujian; skor akhir = rata-rata.
      const { evaluatePacket, buildPacketSubmission, compactTopology } = await loadGrading();
      const snapshot = captureWork();
      const originalKey = gradingKey(useAppStore.getState());
      const originalRubric = rubricKey;
      const packet = await evaluatePacket(activeExercises, snapshot.nodes, snapshot.edges, {}, snapshot.exerciseTopologies);
      if (originalKey !== gradingKey(useAppStore.getState()) || originalRubric !== currentRubricRef.current) {
        pushToast('warning', 'Pekerjaan berubah saat dinilai. Kirim ulang jawaban.'); return;
      }
      const avgScore = packet.averageScore;
      setEvaluationsByExerciseId(packet.evaluations);

      const submission = buildPacketSubmission(participant, activeExercises, activeExercise?.id, packet);
      // Snapshot topologi ikut dikirim agar guru dapat menilai ulang dan memverifikasi skor ini.
      const sent = classroomHub.submitWork(session.classCode, submission, { ...compactTopology(snapshot.nodes, snapshot.edges), exerciseTopologies: snapshot.exerciseTopologies });
      setMySubmission(classroomHub.getMySubmission());
      if (!sent) {
        pushToast('info', 'Jawaban sudah dikirim untuk ronde ini dan tidak dapat diubah.');
        return;
      }

      if (avgScore === 100) {
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          void import('canvas-confetti')
            .then(({ default: confetti }) => confetti({ particleCount: 160, spread: 80, origin: { y: 0.5, x: 0.8 } }))
            .catch(() => undefined);
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
      exportWorkPackageFile(participant, activeExercise.id, activeExercises.map((ex) => ex.id), captureWork());
      pushToast(
        'success',
        'Pekerjaan diekspor tanpa nilai. Guru akan menilai topologi di dalam berkas .opsub.'
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

  // Handler Muat Topologi Guru (Hanya komponen dan kabel fisik, seluruh IP dibersihkan agar siswa mengonfigurasi mandiri)
  const handleLoadStarterTopology = () => {
    if (!activeExercise) return;
    const doLoad = async () => {
      let prepared: ReturnType<Awaited<ReturnType<typeof loadGrading>>['prepareStarterTopology']>;
      try {
        prepared = (await loadGrading()).prepareStarterTopology(activeExercise);
      } catch (err) {
        pushToast('error', `Gagal memuat topologi: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (prepared) {
        loadTopology({ nodes: prepared.nodes, edges: prepared.edges });
        pushToast(
          'success',
          prepared.source.kind === 'template'
            ? `Template "${prepared.source.name}" diterapkan ke kanvas (konfigurasi kosong untuk latihan).`
            : 'Topologi perangkat guru berhasil dimuat (konfigurasi kosong untuk latihan).'
        );
        return;
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
      void doLoad();
    }
  };

  // Jika siswa belum bergabung atau sesi kelas ditutup, jangan tampilkan HUD
  if (!participant || !session || session.status === 'closed') {
    return null;
  }
  // Posisi dinamis: jika PDU Inspector terbuka di kanan, geser HUD ke kirinya pada layar lebar agar tidak bertumpukan
  const positionClass = inspectorOpen
    ? 'right-2 sm:right-4 md:right-[336px]'
    : 'right-2 sm:right-4';

  // Tampilan Minimized (Floating Pill)
  if (isMinimized) {
    return (
      <div
        className={cn(
          'absolute top-3 z-30 flex items-center gap-2 rounded-full border border-primary/40 bg-card px-3 py-1.5 shadow-2xl transition-all duration-200 max-w-[calc(100vw-1rem)]',
          positionClass
        )}
      >
        <div className="flex items-center gap-1.5 text-xs truncate">
          <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          <span className="font-mono font-bold text-foreground shrink-0">
            {session?.classCode || 'KELAS'}
          </span>
          <span className="text-muted-foreground truncate">• {participant?.nickname || 'Siswa'}</span>
          {activeExercises.length > 1 ? (
            <span className="text-[10px] text-primary font-mono shrink-0">
              ({selectedExerciseIndex + 1}/{activeExercises.length})
            </span>
          ) : activeExercises.length === 0 ? (
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">
              (Menunggu Soal)
            </span>
          ) : null}
        </div>

        {evaluation && activeExercise && (
          <Badge
            variant="outline"
            className={`text-[10px] font-bold shrink-0 ${
              evaluation.score === 100
                ? 'border-viz-green/40 bg-viz-green/10 text-viz-green'
                : 'border-viz-gold/40 bg-viz-gold/10 text-viz-gold'
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

  // Jika siswa sudah terhubung tetapi belum ada soal yang disiarkan oleh guru
  if (!activeExercise || activeExercises.length === 0) {
    return (
      <Card
        className={cn(
          'absolute top-3 z-30 flex flex-col border border-primary/40 bg-card shadow-2xl transition-all duration-200 w-[calc(100vw-1rem)] sm:w-[380px] max-w-[380px]',
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
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsMinimized(true)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              title="Kecilkan HUD"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleLeaveClass(true)}
              className="h-7 px-2 text-xs text-viz-red hover:bg-viz-red/10"
            >
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Keluar
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
          <Clock className="h-8 w-8 text-viz-gold animate-pulse" />
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

  // Tampilan Expanded (HUD Floating Card)
  return (
    <Card
      className={cn(
        'absolute top-3 z-30 flex max-h-[calc(100%_-_1.5rem)] w-[calc(100vw-1rem)] sm:w-[380px] max-w-[380px] flex-col overflow-hidden border-border/80 bg-card shadow-2xl transition-all duration-200',
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
                  selectExercise(idx);
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
                          ? 'bg-viz-green text-on-viz'
                          : 'bg-viz-green/15 text-viz-green'
                        : isSelected
                        ? 'bg-viz-gold text-on-viz'
                        : 'bg-viz-gold/15 text-viz-gold'
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

      <p className="shrink-0 border-b px-3 py-1.5 text-[10px] text-muted-foreground">Kanvas terpisah per soal. Draft dipulihkan setelah refresh pada tab ini; ekspor berkas sebelum menutup tab.</p>

      {/* Konten Scrollable */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4 text-xs">
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
                  onClick={() => selectExercise(Math.max(0, selectedExerciseIndex - 1))}
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
                    selectExercise(Math.min(activeExercises.length - 1, selectedExerciseIndex + 1))
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
          <p className="text-xs leading-relaxed text-muted-foreground">
            {activeExercise?.targets.some((target) => target.type === 'reachability')
              ? 'Nilai mengikuti target rubrik di bawah, termasuk uji konektivitas pada target Ping.'
              : 'Konektivitas tidak diuji oleh rubrik ini. Nilai 100 menunjukkan semua target yang tercantum terpenuhi.'}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Target Praktikum ({activeExercise?.targets?.length ?? 0})
            </span>
            {evaluation && (
              <span
                className={`font-mono text-xs font-bold ${
                  evaluation.score === 100
                    ? 'text-viz-green'
                    : evaluation.score >= 70
                    ? 'text-viz-gold'
                    : 'text-viz-red'
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
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-green" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-red" />
                      )
                    ) : (
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                        {idx + 1}
                      </span>
                    )}

                    <div className="flex flex-1 flex-col">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {tgt.type === 'reachability' ? 'Konektivitas (Ping)'
                          : tgt.type === 'link_exists' ? 'Sambungan kabel'
                          : tgt.type === 'device_config' ? 'Konfigurasi IP'
                          : tgt.type === 'vlan_config' ? 'Konfigurasi VLAN' : 'Jumlah perangkat'}
                      </span>
                      <span
                        className={
                          check?.passed
                            ? 'font-medium text-viz-green'
                            : 'font-medium text-foreground/90'
                        }
                      >
                        {tgt.title}
                      </span>
                      {check && (
                        <span
                          className={`text-[10px] leading-tight ${
                            check.passed ? 'text-muted-foreground' : 'text-viz-red/90'
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
                ? 'border-viz-green/40 bg-viz-green/10 text-viz-green'
                : 'border-viz-gold/40 bg-viz-gold/10 text-viz-gold'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold">
              {evaluation.status === 'passed' ? (
                <CheckCircle2 className="h-4 w-4 text-viz-green" />
              ) : (
                <AlertCircle className="h-4 w-4 text-viz-gold" />
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
        <div className="flex items-center justify-between gap-2">
          {session?.allowSelfCheck === false ? (
            <div
              className="flex items-center gap-1.5 text-[11px] font-medium text-viz-gold bg-viz-gold/10 px-2.5 py-1.5 rounded border border-viz-gold/20"
              title="Guru menonaktifkan fitur cek mandiri untuk sesi ujian ini."
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Cek Mandiri Dinonaktifkan (Ujian)</span>
            </div>
          ) : (() => {
            const limit = session?.selfCheckLimit ?? 5;
            const used = activeExercise ? classroomHub.getSelfCheckCount(activeExercise.id) : 0;
            const remaining = Math.max(0, limit - used);
            const exhausted = remaining <= 0;
            return (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSelfCheck}
                disabled={isEvaluating || exhausted}
                className="h-8 gap-1.5 text-xs"
                title={exhausted ? `Kuota cek mandiri habis (${limit}/${limit})` : `Sisa ${remaining}/${limit} cek mandiri`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {isEvaluating
                  ? 'Mengecek…'
                  : exhausted
                  ? `Cek Habis (${limit}/${limit})`
                  : `Cek Mandiri (${used}/${limit})`}
              </Button>
            );
          })()}

          <Button
            size="sm"
            onClick={confirmSubmitWork}
            disabled={isEvaluating || Boolean(mySubmission)}
            className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90"
            title={mySubmission ? 'Jawaban sudah dikirim untuk ronde ini' : 'Jawaban hanya dapat dikirim satu kali per ronde'}
          >
            {mySubmission ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {mySubmission
              ? 'Jawaban Terkirim'
              : isEvaluating
              ? 'Mengevaluasi…'
              : activeExercises.length > 1
              ? 'Kirim Semua Jawaban'
              : 'Kirim Jawaban'}
          </Button>
        </div>
        {mySubmission && (
          <p className="text-[11px] text-muted-foreground" role="status">
            Jawaban sudah dikirim dan dikunci untuk ronde ini. Bila perlu mengirim ulang, minta guru memulai ronde baru.
          </p>
        )}

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
              onClick={() => selectExercise(Math.max(0, selectedExerciseIndex - 1))}
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
                selectExercise(Math.min(activeExercises.length - 1, selectedExerciseIndex + 1))
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
