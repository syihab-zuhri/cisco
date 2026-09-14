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
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { pauseSimulation, resumeSimulation, simStepNext } from '../../hooks/useSimulationEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  } = useAppStore();

  const [pingSource, setPingSource] = useState<string>('');
  const [pingTargetIp, setPingTargetIp] = useState<string>('');

  // M7: reset dropdown bila node sumber hilang dari topologi (ganti template/reset)
  useEffect(() => {
    if (pingSource && !nodes.some((n) => n.id === pingSource)) {
      setPingSource('');
    }
  }, [nodes, pingSource]);

  const pingableNodes = nodes.filter((n) =>
    n.data.ports.some((p) => p.ipAddress)
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

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-card px-4 py-1 select-none">
      {/* Brand & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-wider text-foreground">
            OpenPacket
          </span>
        </div>

        <Separator orientation="vertical" className="mx-1 !h-4" />

        {/* Speed Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-mono uppercase">Speed:</span>
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

        {/* Pause / Resume */}
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
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause data-icon="inline-start" />
                      Pause
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

        {/* Step Mode (v1.2.0): maju satu event per klik */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={stepMode ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setStepMode(!stepMode)}
              >
                <StepForward data-icon="inline-start" />
                Step
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
            Next
          </Button>
        )}
      </div>

      {/* Ping Quick Action */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
        <span className="text-xs font-medium text-foreground">Ping:</span>
        <Select value={pingSource || null} onValueChange={(value) => setPingSource(value ?? '')}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="-- Pilih Host --">
              {(value: string | null) => {
                if (!value) return '-- Pilih Host --';
                const selected = pingableNodes.find((n) => n.id === value);
                if (!selected) return value;
                const ip = selected.data.ports.find((p) => p.ipAddress)?.ipAddress;
                return ip ? `${selected.data.label} (${ip})` : selected.data.label;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pingableNodes.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.data.label} ({n.data.ports.find((p) => p.ipAddress)?.ipAddress})
              </SelectItem>
            ))}
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
          className="w-32 font-mono text-xs lg:w-44"
        />

        <Button size="sm" onClick={handleExecutePing} disabled={simulationStatus === 'running'}>
          <Send data-icon="inline-start" />
          Send Ping
        </Button>
      </div>

      {/* Persistence & Tools */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenClassroom}
                className="text-primary hover:text-primary/90"
              >
                <Users data-icon="inline-start" />
                <span className="hidden font-semibold lg:inline">Kelas</span>
              </Button>
            }
          />
          <TooltipContent>Portal Kelas &amp; Praktikum</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={activeLabId ? 'secondary' : 'outline'}
                size="sm"
                onClick={onOpenLabs}
                className={activeLabId ? 'text-amber-300' : 'text-amber-300/80'}
              >
                <GraduationCap data-icon="inline-start" />
                <span className="hidden font-semibold lg:inline">
                  {activeLabId ? 'Lab Aktif' : 'Lab'}
                </span>
              </Button>
            }
          />
          <TooltipContent>Mode Lab Praktikum</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" onClick={onOpenDocs} className="text-sky-300">
                <Activity data-icon="inline-start" />
                <span className="hidden font-semibold lg:inline">Docs & Porting</span>
              </Button>
            }
          />
          <TooltipContent>Panduan Lengkap & Porting</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-input bg-input/30 px-2.5 text-[0.8rem] font-medium hover:bg-input/50">
                <FolderOpen className="size-3.5 text-muted-foreground" data-icon="inline-start" />
                <span className="hidden lg:inline">Load</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </label>
            }
          />
          <TooltipContent>Muat Topologi dari file JSON</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="sm" onClick={handleExportJson}>
                <Save data-icon="inline-start" />
                <span className="hidden lg:inline">Save</span>
              </Button>
            }
          />
          <TooltipContent>Simpan Topologi ke file JSON</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  requestConfirm({
                    title: 'Reset Topologi',
                    message:
                      'Seluruh perangkat, kabel, tabel, dan log simulasi akan dihapus dari kanvas. Tindakan ini tidak bisa dibatalkan.',
                    confirmLabel: 'Reset',
                    onConfirm: resetTopology,
                  })
                }
                className="text-destructive"
              >
                <RotateCcw data-icon="inline-start" />
                <span className="hidden lg:inline">Reset</span>
              </Button>
            }
          />
          <TooltipContent>Reset Topologi</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
