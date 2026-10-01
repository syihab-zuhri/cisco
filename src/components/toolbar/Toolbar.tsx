import React, { useEffect, useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Save,
  FolderOpen,
  Activity,
  Send,
  StepForward,
  ChevronLast,
  GraduationCap,
  Users,
  Menu,
  ScrollText,
  Table2,
  Wrench,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { pauseSimulation, resumeSimulation, simStepNext } from '../../hooks/useSimulationEngine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { classroomHub } from '@/features/classroom/classroomHub';
import type { Participant, ClassSession } from '@/features/classroom/types';
import { cn } from '@/lib/utils';
import { ThemeMenu, ThemeToggleGroup } from './ThemeToggle';

interface ToolbarProps {
  onTriggerPing: (sourceNodeId: string, targetIp: string) => void;
  onOpenDocs: () => void;
  onOpenLabs: () => void;
  onOpenClassroom: () => void;
}

export function Toolbar({ onTriggerPing, onOpenDocs, onOpenLabs, onOpenClassroom }: ToolbarProps) {
  const {
    nodes,
    edges,
    resetTopology,
    loadTopology,
    simulationSpeed,
    setSimulationSpeed,
    simulationStatus,
    stepMode,
    setStepMode,
    activeLabId,
    addSimulationLog,
    pushToast,
    requestConfirm,
    isLogPanelOpen,
    toggleLogPanel,
    openLogPanelTab,
    simulationLogs,
  } = useAppStore();

  const [pingSource, setPingSource] = useState<string>('');
  const [pingTargetIp, setPingTargetIp] = useState<string>('');
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(() =>
    classroomHub.getCurrentParticipant()
  );
  const [currentSession, setCurrentSession] = useState<ClassSession | null>(() =>
    classroomHub.getSession()
  );
  const [lockedRole, setLockedRole] = useState<'teacher' | 'student' | null>(() =>
    classroomHub.getLockedRole()
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePingOpen, setMobilePingOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = classroomHub.subscribe(() => {
      setCurrentParticipant(classroomHub.getCurrentParticipant());
      setCurrentSession(classroomHub.getSession());
      setLockedRole(classroomHub.getLockedRole());
    });
    return unsub;
  }, []);

  // M7: reset dropdown bila node sumber hilang dari topologi (ganti template/reset)
  useEffect(() => {
    if (pingSource && !nodes.some((n) => n.id === pingSource)) {
      setPingSource('');
    }
  }, [nodes, pingSource]);

  const getNodeDisplayIp = (n: (typeof nodes)[number]): string => {
    const directIp = n.data?.ports?.find((p) => p.ipAddress)?.ipAddress;
    if (directIp) return directIp;
    for (const p of n.data?.ports ?? []) {
      const subIp = p.subInterfaces?.find((s) => s.ipAddress)?.ipAddress;
      if (subIp) return subIp;
    }
    return '';
  };

  const pingableNodes = nodes.filter((n) =>
    n.data?.ports?.some((p) => p.ipAddress || (p.subInterfaces && p.subInterfaces.some((s) => s.ipAddress)))
  );

  const handleExportJson = () => {
    const dataStr = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openpacket-topology-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addSimulationLog('SUCCESS', 'Topologi diekspor ke file JSON.');
  };

  // Siswa yang sedang mengikuti kelas tidak boleh memuat topologi jadi dari berkas (jalan pintas jawaban).
  const importLocked = Boolean(currentParticipant);

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (classroomHub.getCurrentParticipant()) {
      pushToast('warning', 'Memuat topologi dari berkas dinonaktifkan selama Anda mengikuti kelas.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!Array.isArray(json.nodes) || !Array.isArray(json.edges)) {
          pushToast(
            'error',
            'Format file JSON tidak valid! "nodes" dan "edges" harus berupa array.'
          );
          return;
        }
        // Validasi node & port
        for (const n of json.nodes) {
          if (!n.id || !n.data?.type || !Array.isArray(n.data?.ports)) {
            pushToast('error', `Node "${n.id ?? 'tanpa-id'}" tidak valid dalam format JSON.`);
            return;
          }
        }
        // Validasi INV-003: 1 port ethernet hanya terhubung ke 1 kabel
        const portConnections = new Set<string>();
        for (const edge of json.edges) {
          if (edge.type !== 'wirelessLink') {
            const srcKey = `${edge.source}:${edge.sourceHandle}`;
            const dstKey = `${edge.target}:${edge.targetHandle}`;
            if (portConnections.has(srcKey) || portConnections.has(dstKey)) {
              pushToast(
                'error',
                'File JSON melanggar INV-003: Terdeteksi lebih dari satu kabel pada port fisik yang sama.'
              );
              return;
            }
            portConnections.add(srcKey);
            portConnections.add(dstKey);
          }
        }
        loadTopology(json);
      } catch {
        pushToast('error', 'Gagal membaca file JSON! File tidak dapat di-parse.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecutePing = () => {
    if (!pingSource || !pingTargetIp.trim()) {
      pushToast(
        'warning',
        'Pilih host sumber pada dropdown dan ketikkan IP tujuan terlebih dahulu!'
      );
      return;
    }
    onTriggerPing(pingSource, pingTargetIp.trim());
  };

  return (
    <>
      <header className="df-inverse flex h-13 shrink-0 items-center justify-between px-3 sm:px-4 select-none">
        {/* Left: Brand & Desktop Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-md bg-gold text-on-gold"
            >
              <Activity className="size-5" />
            </span>
            <span className="text-base sm:text-lg font-bold tracking-tight text-foreground">
              OpenPacket
            </span>
          </div>

          <Separator orientation="vertical" className="hidden md:block mx-1 !h-4" />

          {/* Desktop/Tablet Speed Controls */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-mono uppercase">Kecepatan:</span>
            <ToggleGroup
              value={[String(simulationSpeed)]}
              onValueChange={(groupValue: string[]) => {
                const next = groupValue[groupValue.length - 1];
                if (next) setSimulationSpeed(Number(next) as 0.5 | 1 | 2);
              }}
              spacing={1}
            >
              {([0.5, 1, 2] as const).map((spd) => (
                <ToggleGroupItem key={spd} value={String(spd)} size="sm">
                  {spd}x
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Desktop/Tablet Pause/Resume/Step */}
          <div className="hidden md:flex items-center gap-1">
            {simulationStatus !== 'idle' && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={simulationStatus === 'paused' ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={simulationStatus === 'paused' ? resumeSimulation : pauseSimulation}
                    >
                      {simulationStatus === 'paused' ? (
                        <>
                          <Play data-icon="inline-start" />
                          <span className="hidden xl:inline">Lanjutkan</span>
                        </>
                      ) : (
                        <>
                          <Pause data-icon="inline-start" />
                          <span className="hidden xl:inline">Jeda</span>
                        </>
                      )}
                    </Button>
                  }
                />
                <TooltipContent>
                  {simulationStatus === 'paused' ? 'Lanjutkan Simulasi' : 'Jeda Simulasi'}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant={stepMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setStepMode(!stepMode)}
                  >
                    <StepForward data-icon="inline-start" />
                    <span className="hidden xl:inline">Step</span>
                  </Button>
                }
              />
              <TooltipContent>
                Step Mode: putar simulasi satu event per langkah
              </TooltipContent>
            </Tooltip>
            {stepMode && simulationStatus === 'running' && (
              <Button variant="secondary" size="sm" onClick={simStepNext}>
                <ChevronLast data-icon="inline-start" />
                <span className="hidden xl:inline">Next</span>
              </Button>
            )}
          </div>
        </div>

        {/* Center: Desktop Ping Quick Action */}
        <div className="hidden xl:flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium text-foreground">Ping:</span>
          <Select value={pingSource || null} onValueChange={(value) => setPingSource(value ?? '')}>
            <SelectTrigger className="w-40 xl:w-48">
              <SelectValue placeholder="-- Pilih Host --">
                {(value: string | null) => {
                  if (!value) return '-- Pilih Host --';
                  const selected = pingableNodes.find((n) => n.id === value);
                  if (!selected) return value;
                  const ip = getNodeDisplayIp(selected);
                  return ip ? `${selected.data.label} (${ip})` : selected.data.label;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pingableNodes.map((n) => {
                const ip = getNodeDisplayIp(n);
                return (
                  <SelectItem key={n.id} value={n.id}>
                    {n.data.label}{ip ? ` (${ip})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground">→</span>

          <Input
            type="text"
            placeholder="Target IP (e.g. 192.168.1.20)"
            value={pingTargetIp}
            onChange={(e) => setPingTargetIp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExecutePing();
            }}
            className="w-36 font-mono text-xs"
          />

          <Button size="sm" onClick={handleExecutePing} disabled={simulationStatus === 'running'}>
            <Send data-icon="inline-start" />
            Kirim
          </Button>
        </div>

        {/* Right Section: Kelas Button + Desktop Actions + Mobile Menu Trigger */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Ping Launcher for screens < xl */}
          <Button
            variant={mobilePingOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setMobilePingOpen((prev) => !prev)}
            className="xl:hidden h-8 px-2 sm:px-2.5 text-xs text-primary gap-1"
            title="Buka panel Ping Cepat"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-semibold">Ping</span>
          </Button>

          {/* Classroom Button (Always visible on all screens) */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={currentParticipant || (currentSession && currentSession.status !== 'closed') ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={onOpenClassroom}
                  className={cn(
                    'h-8 text-xs font-semibold px-2.5 sm:px-3',
                    currentParticipant
                      ? 'border-primary/50 bg-primary/15 text-primary font-bold hover:bg-primary/25'
                      : currentSession && currentSession.status !== 'closed'
                      ? 'border-viz-green/40 bg-viz-green/10 text-viz-green hover:bg-viz-green/10'
                      : 'text-primary hover:text-primary/90'
                  )}
                >
                  <Users data-icon="inline-start" />
                  <span className="hidden sm:inline">
                    {currentParticipant
                      ? `Kelas (${currentParticipant.nickname})`
                      : currentSession && currentSession.status !== 'closed'
                      ? `Kelas: ${currentSession.classCode}`
                      : lockedRole === 'teacher'
                      ? 'Kelas (Guru)'
                      : lockedRole === 'student'
                      ? 'Kelas (Siswa)'
                      : 'Kelas'}
                  </span>
                  <span className="sm:hidden">Kelas</span>
                </Button>
              }
            />
            <TooltipContent>Portal Kelas &amp; Praktikum</TooltipContent>
          </Tooltip>

          {/* Desktop/Tablet Tools — dropdown "Alat" */}
          <div className="hidden md:flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-1.5" title="Alat">
                    <Wrench className="size-3.5" data-icon="inline-start" />
                    <span className="hidden xl:inline">Alat</span>
                  </Button>
                }
              />
              <DropdownMenuContent side="bottom" align="end" sideOffset={6} className="min-w-[200px]">
                <DropdownMenuItem
                  onClick={onOpenLabs}
                  className={activeLabId ? 'text-viz-gold font-semibold' : ''}
                >
                  <GraduationCap className="size-4 mr-2 text-viz-gold" />
                  {activeLabId ? 'Lab Aktif' : 'Mode Lab Praktikum'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenDocs}>
                  <Activity className="size-4 mr-2 text-viz-blue" />
                  Pusat Bantuan OpenPacket
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLocked}
                >
                  <FolderOpen className="size-4 mr-2 text-muted-foreground" />
                  Muat Topologi (.json){importLocked ? ' — dikunci saat kelas' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportJson}>
                  <Save className="size-4 mr-2 text-muted-foreground" />
                  Simpan Topologi (.json)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    requestConfirm({
                      title: 'Reset Topologi',
                      message:
                        'Seluruh perangkat, kabel, tabel, dan log simulasi akan dihapus dari kanvas. Tindakan ini tidak bisa dibatalkan.',
                      confirmLabel: 'Reset',
                      onConfirm: resetTopology,
                    })
                  }
                >
                  <RotateCcw className="size-4 mr-2" />
                  Reset Topologi
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ThemeMenu />
            {/* Hidden file input for Muat Topologi */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
          </div>

          {/* Quick Toggle Log & Tabel Bawah */}
          <Button
            variant={isLogPanelOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={toggleLogPanel}
            className="h-8 gap-1.5 text-xs px-2 sm:px-2.5 font-medium shrink-0"
            title="Buka/Tutup Panel Log Simulasi & Tabel Bawah"
          >
            <ScrollText className="h-3.5 w-3.5 text-gold" />
            <span className="hidden sm:inline">Log &amp; Tabel</span>
            <span className="text-[10px] font-mono rounded bg-muted/80 px-1 py-0.5 leading-none">
              {simulationLogs.length}
            </span>
          </Button>

          {/* Mobile Sheet Menu Trigger (Mobile only) */}
          <div className="md:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger
                render={
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Menu Aplikasi">
                    <Menu className="h-4 w-4" />
                  </Button>
                }
              />
              <SheetContent side="right" className="w-[85vw] sm:max-w-xs flex flex-col p-4">
                <SheetHeader className="pb-3 border-b">
                  <SheetTitle className="text-sm font-bold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span>Menu OpenPacket</span>
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground">
                    Kontrol simulasi &amp; berkas jaringan
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-3">
                  {/* Kecepatan Simulasi */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Kecepatan Simulasi
                    </span>
                    <ToggleGroup
                      value={[String(simulationSpeed)]}
                      onValueChange={(groupValue: string[]) => {
                        const next = groupValue[groupValue.length - 1];
                        if (next) setSimulationSpeed(Number(next) as 0.5 | 1 | 2);
                      }}
                      className="w-full justify-stretch"
                    >
                      {([0.5, 1, 2] as const).map((spd) => (
                        <ToggleGroupItem key={spd} value={String(spd)} className="flex-1 text-xs">
                          {spd}x
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>

                  {/* Play / Pause / Step Controls */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Status Simulasi
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={simulationStatus === 'paused' ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={simulationStatus === 'paused' ? resumeSimulation : pauseSimulation}
                        className="text-xs gap-1.5"
                      >
                        {simulationStatus === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {simulationStatus === 'paused' ? 'Lanjutkan' : 'Jeda'}
                      </Button>
                      <Button
                        variant={stepMode ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => setStepMode(!stepMode)}
                        className="text-xs gap-1.5"
                      >
                        <StepForward className="h-3.5 w-3.5" />
                        Step Mode
                      </Button>
                    </div>
                  </div>

                  {/* Tema Tampilan */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Tema Tampilan
                    </span>
                    <ThemeToggleGroup />
                  </div>

                  <Separator />

                  {/* Fitur & Navigasi */}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant={activeLabId ? 'secondary' : 'outline'}
                      className="justify-start gap-2 text-xs"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenLabs();
                      }}
                    >
                      <GraduationCap className="h-4 w-4 text-viz-gold" />
                      <span>Mode Lab Praktikum</span>
                    </Button>

                    <Button
                      variant="outline"
                      className="justify-start gap-2 text-xs"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenDocs();
                      }}
                    >
                      <Activity className="h-4 w-4 text-viz-blue" />
                      <span>Pusat Bantuan OpenPacket</span>
                    </Button>
                  </div>

                  <Separator />

                  {/* Inspeksi Log & Tabel Jaringan */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Inspeksi &amp; Data Jaringan
                    </span>
                    <Button
                      variant="outline"
                      className="justify-between text-xs h-9"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        openLogPanelTab('log');
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ScrollText className="h-4 w-4 text-viz-blue" />
                        <span>Log Simulasi</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
                        {simulationLogs.length}
                      </Badge>
                    </Button>

                    <Button
                      variant="outline"
                      className="justify-between text-xs h-9"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        openLogPanelTab('tables');
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-viz-green" />
                        <span>Tabel ARP / CAM / Routing</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Real-time</span>
                    </Button>
                  </div>

                  <Separator />

                  {/* Berkas Topologi */}
                  <div className="flex flex-col gap-2">
                    <label
                      aria-disabled={importLocked}
                      className={cn(
                        'flex h-9 cursor-pointer items-center justify-start gap-2 rounded-[min(var(--radius-md),12px)] border border-input bg-card px-3 text-xs font-medium hover:bg-muted',
                        importLocked && 'pointer-events-none opacity-50'
                      )}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span>Muat File Topologi (.json){importLocked ? ' — dikunci saat kelas' : ''}</span>
                      <input
                        type="file"
                        accept=".json"
                        disabled={importLocked}
                        onChange={(e) => {
                          setMobileMenuOpen(false);
                          handleImportJson(e);
                        }}
                        className="hidden"
                      />
                    </label>

                    <Button
                      variant="outline"
                      className="justify-start gap-2 text-xs"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleExportJson();
                      }}
                    >
                      <Save className="h-4 w-4 text-muted-foreground" />
                      <span>Simpan File Topologi (.json)</span>
                    </Button>

                    <Button
                      variant="destructive"
                      className="justify-start gap-2 text-xs mt-2"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        requestConfirm({
                          title: 'Reset Topologi',
                          message:
                            'Seluruh perangkat, kabel, tabel, dan log simulasi akan dihapus dari kanvas. Tindakan ini tidak bisa dibatalkan.',
                          confirmLabel: 'Reset',
                          onConfirm: resetTopology,
                        });
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Reset Seluruh Kanvas</span>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Collapsible Mobile Ping Bar */}
      {mobilePingOpen && (
        <div className="xl:hidden flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-2 text-xs">
          <span className="font-semibold text-foreground">Ping:</span>
          <Select value={pingSource || null} onValueChange={(value) => setPingSource(value ?? '')}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Host Sumber">
                {(value: string | null) => {
                  if (!value) return 'Host Sumber';
                  const selected = pingableNodes.find((n) => n.id === value);
                  if (!selected) return value;
                  const ip = getNodeDisplayIp(selected);
                  return ip ? `${selected.data.label} (${ip})` : selected.data.label;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pingableNodes.map((n) => {
                const ip = getNodeDisplayIp(n);
                return (
                  <SelectItem key={n.id} value={n.id}>
                    {n.data.label}{ip ? ` (${ip})` : ''}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground">→</span>

          <Input
            type="text"
            placeholder="Target IP"
            value={pingTargetIp}
            onChange={(e) => setPingTargetIp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExecutePing();
            }}
            className="w-32 h-8 font-mono text-xs"
          />

          <Button size="sm" className="h-8 text-xs" onClick={handleExecutePing} disabled={simulationStatus === 'running'}>
            <Send data-icon="inline-start" />
            Kirim
          </Button>
        </div>
      )}
    </>
  );
}
