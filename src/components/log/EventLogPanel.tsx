import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Trash2,
  GripHorizontal,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  ListTree,
  Table2,
  ScrollText,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type SimEvent } from '../../types/protocol';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PanelTab = 'log' | 'sim' | 'tables';

const EVENT_KIND_COLORS: Record<string, string> = {
  ARP_REQ: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60',
  ARP_REP: 'text-emerald-200 bg-emerald-900/60 border-emerald-700/60',
  ICMP_REQ: 'text-cyan-300 bg-cyan-950/60 border-cyan-800/60',
  ICMP_REP: 'text-cyan-200 bg-cyan-900/60 border-cyan-700/60',
};

const getBadgeColor = (type: string) => {
  switch (type) {
    case 'ARP':
      return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60';
    case 'ICMP':
      return 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60';
    case 'ERROR':
      return 'text-red-400 bg-red-950/60 border-red-800/60';
    case 'SUCCESS':
      return 'text-green-400 bg-green-950/60 border-green-800/60';
    default:
      return 'text-muted-foreground bg-muted border-border';
  }
};

function SimTimelineRow({ event, isPlayed, isCurrent, onSelect }: {
  event: SimEvent;
  isPlayed: boolean;
  isCurrent: boolean;
  onSelect: (event: SimEvent) => void;
}) {
  const isHop = event.kind !== 'LOG';
  const color = isHop
    ? (EVENT_KIND_COLORS[event.kind] ?? 'text-muted-foreground bg-muted border-border')
    : getBadgeColor(event.level);
  return (
    <button
      onClick={() => onSelect(event)}
      className={cn(
        'flex w-full items-start gap-2 rounded px-1 py-0.5 text-left leading-relaxed',
        isCurrent ? 'bg-violet-950/50 ring-1 ring-violet-700/60' : 'hover:bg-muted/50',
        !isPlayed && 'opacity-40'
      )}
    >
      <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
        t={event.simTimeMs}ms
      </span>
      <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold', color)}>
        {isHop ? event.kind : event.level}
      </span>
      <span className="break-words text-foreground/90">{event.message}</span>
      {event.effects && event.effects.length > 0 && (
        <span
          className="ml-auto shrink-0 rounded border border-amber-800/60 bg-amber-950/60 px-1 text-[11px] text-amber-300"
          title="Event ini mengubah tabel (CAM/ARP)"
        >
          table
        </span>
      )}
    </button>
  );
}

export function EventLogPanel() {
  const simulationLogs = useAppStore((s) => s.simulationLogs);
  const clearSimulationLogs = useAppStore((s) => s.clearSimulationLogs);
  const simPlan = useAppStore((s) => s.simPlan);
  const simPlayedUpTo = useAppStore((s) => s.simPlayedUpTo);
  const setInspectorEvent = useAppStore((s) => s.setInspectorEvent);
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const nodes = useAppStore((s) => s.nodes);

  // State tinggi panel (dalam pixel)
  const [height, setHeight] = useState<number>(160);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('log');

  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);
  const simListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline mengikuti event yang sedang diputar
  useEffect(() => {
    if (activeTab === 'sim' && simListRef.current) {
      simListRef.current.scrollTop = simListRef.current.scrollHeight;
    }
  }, [simPlayedUpTo, activeTab]);

  const selectedDevice = nodes.find((n) => n.id === selectedNodeId)?.data;

  // Dragging event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = isCollapsed ? 32 : height;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartYRef.current - e.clientY;
      const newHeight = Math.min(
        Math.max(dragStartHeightRef.current + deltaY, 40),
        window.innerHeight * 0.8
      );

      if (newHeight <= 45) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
        setHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const toggleCollapse = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setHeight(180);
    } else {
      setIsCollapsed(true);
    }
  };

  const handleMaximize = () => {
    if (isCollapsed) setIsCollapsed(false);
    setHeight((prev) => (prev > 350 ? 160 : 420));
  };

  const handleSelectEvent = (event: SimEvent) => {
    setInspectorEvent(event);
    setInspectorOpen(true);
  };

  return (
    <div
      style={{ height: isCollapsed ? 32 : `${height}px` }}
      className={cn(
        'relative flex select-none flex-col border-t bg-card transition-[height]',
        isDragging ? 'transition-none' : 'duration-150'
      )}
    >
      {/* Resizer Handle Bar */}
      <div
        onMouseDown={handleMouseDown}
        title="Tarik ke atas/bawah untuk mengubah tinggi terminal"
        className="group absolute -top-1.5 right-0 left-0 z-30 flex h-3 cursor-row-resize items-center justify-center hover:bg-primary/20"
      >
        <div className="flex h-1.5 w-16 items-center justify-center rounded-full bg-muted-foreground/50 transition-all group-hover:w-24 group-hover:bg-primary">
          <GripHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100" />
        </div>
      </div>

      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b bg-muted/60 px-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-foreground/90">
            Network Event Log &amp; PDU Inspection
          </span>
          <Badge variant="secondary" className="text-[11px] font-normal">
            {simulationLogs.length} events
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSimulationLogs}
            title="Bersihkan Log"
            aria-label="Bersihkan Log"
            className="text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleMaximize}
            title={height > 350 ? 'Kecilkan Panel' : 'Perbesar Panel'}
            aria-label={height > 350 ? 'Kecilkan Panel' : 'Perbesar Panel'}
            className="text-muted-foreground"
          >
            {height > 350 ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleCollapse}
            title={isCollapsed ? 'Buka Panel' : 'Sembunyikan Panel'}
            aria-label={isCollapsed ? 'Buka Panel' : 'Sembunyikan Panel'}
            className="text-muted-foreground"
          >
            {isCollapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Tab bar + Panel content */}
      {!isCollapsed && (
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as PanelTab)}
          className="min-h-0 flex-1 flex-col gap-0"
        >
          <div className="flex h-7 items-stretch gap-1 border-b bg-card px-2">
            <TabsList variant="line" className="h-7 gap-1 p-0">
              <TabsTrigger value="log" className="gap-1.5 px-2.5 text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none">
                <ScrollText className="h-3 w-3" />
                Log
              </TabsTrigger>
              <TabsTrigger value="sim" className="gap-1.5 px-2.5 text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none">
                <ListTree className="h-3 w-3" />
                Simulasi
              </TabsTrigger>
              <TabsTrigger value="tables" className="gap-1.5 px-2.5 text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none">
                <Table2 className="h-3 w-3" />
                Tabel
              </TabsTrigger>
            </TabsList>
            {activeTab === 'sim' && simPlan.length > 0 && (
              <span className="ml-auto self-center font-mono text-[11px] text-muted-foreground">
                {Math.min(simPlayedUpTo, simPlan.length)}/{simPlan.length} event diputar
              </span>
            )}
          </div>

          <TabsContent value="log" className="flex min-h-0 flex-col gap-1 overflow-y-auto bg-background/60 p-2.5 font-mono text-[11px]">
            {simulationLogs.length === 0 ? (
              <div className="py-2 text-center italic text-muted-foreground">
                Belum ada aktivitas simulasi. Kirim ping atau terapkan template untuk melihat inspeksi alur paket real-time.
              </div>
            ) : (
              simulationLogs.map((log) => {
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2.5 rounded px-1 py-0.5 leading-relaxed hover:bg-muted/50"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {timeStr}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold',
                        getBadgeColor(log.type)
                      )}
                    >
                      {log.type}
                    </span>
                    <span className="break-words text-foreground/90">{log.message}</span>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent
            value="sim"
            className="flex min-h-0 flex-col gap-0.5 overflow-y-auto bg-background/60 p-2.5 font-mono text-[11px]"
          >
            {simPlan.length === 0 ? (
              <div className="py-2 text-center italic text-muted-foreground">
                Belum ada rencana simulasi. Kirim ping — seluruh aliran event akan direncanakan di sini
                (event redup = belum diputar). Klik event untuk membuka PDU Inspector.
              </div>
            ) : (
              simPlan.map((event) => (
                <SimTimelineRow
                  key={event.seq}
                  event={event}
                  isPlayed={event.seq <= simPlayedUpTo}
                  isCurrent={event.seq === simPlayedUpTo}
                  onSelect={handleSelectEvent}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="tables" className="min-h-0 overflow-y-auto bg-background/60 p-2.5 font-mono text-[11px]">
            {!selectedDevice ? (
              <div className="py-2 text-center italic text-muted-foreground">
                Pilih perangkat di kanvas untuk melihat tabel CAM, ARP, dan Routing secara real-time.
              </div>
            ) : selectedDevice.type === 'hub' ? (
              <div className="py-2 text-center italic text-muted-foreground">
                Hub adalah repeater Layer-1 murni — sinyal hanya diulang ke semua port, tidak ada tabel.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {/* CAM Table — hanya switch (L2 MAC learning) */}
                {selectedDevice.type === 'switch' && (
                  <div className="rounded border bg-background/60 p-2">
                    <div className="mb-1 text-[11px] font-bold uppercase text-emerald-400">
                      CAM Table — {selectedDevice.label}
                    </div>
                    {Object.keys(selectedDevice.macTable ?? {}).length === 0 ? (
                      <div className="italic text-muted-foreground/60">(kosong)</div>
                    ) : (
                      Object.entries(selectedDevice.macTable ?? {}).map(([mac, port]) => (
                        <div key={mac} className="flex items-center gap-1 text-foreground/90">
                          <span className="truncate">{mac.toLowerCase()}</span>
                          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                          <span className="text-emerald-300">{port}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ARP Cache — perangkat ber-IP */}
                {selectedDevice.type !== 'switch' && (
                  <div className="rounded border bg-background/60 p-2">
                    <div className="mb-1 text-[11px] font-bold uppercase text-cyan-400">
                      ARP Cache — {selectedDevice.label}
                    </div>
                    {Object.keys(selectedDevice.arpTable ?? {}).length === 0 ? (
                      <div className="italic text-muted-foreground/60">(kosong)</div>
                    ) : (
                      Object.entries(selectedDevice.arpTable ?? {}).map(([ip, mac]) => (
                        <div key={ip} className="flex items-center gap-1 text-foreground/90">
                          <span>{ip}</span>
                          <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                          <span className="truncate text-cyan-300">{mac.toLowerCase()}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Routing Table — hanya router */}
                {selectedDevice.type === 'router' && (
                  <div className="rounded border bg-background/60 p-2">
                    <div className="mb-1 text-[11px] font-bold uppercase text-amber-400">
                      Routing — {selectedDevice.label}
                    </div>
                    {(selectedDevice.routes ?? []).length === 0 ? (
                      <div className="italic text-muted-foreground/60">(kosong)</div>
                    ) : (
                      (selectedDevice.routes ?? []).map((r, idx) => (
                        <div key={idx} className="truncate text-foreground/90">
                          {r.network}/{r.subnetMask} → <span className="text-amber-300">{r.nextHop}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* NAT Translations — hanya router */}
                {selectedDevice.type === 'router' && (
                  <div className="rounded border bg-background/60 p-2">
                    <div className="mb-1 text-[11px] font-bold uppercase text-sky-400">
                      NAT Table — {selectedDevice.label}
                    </div>
                    {(selectedDevice.natTable ?? []).length === 0 ? (
                      <div className="italic text-muted-foreground/60">(kosong)</div>
                    ) : (
                      (selectedDevice.natTable ?? []).map((t, idx) => (
                        <div key={idx} className="truncate text-foreground/90">
                          {t.insideIp} → <span className="text-sky-300">{t.globalIp}</span>
                          <span className="text-muted-foreground/60"> (id {t.icmpId}#{t.echoSeq})</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
