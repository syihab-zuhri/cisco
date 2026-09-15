import React, { useState, useRef, useEffect } from 'react';
import {
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
  const setSelectedNodeId = useAppStore((s) => s.setSelectedNodeId);
  const nodes = useAppStore((s) => s.nodes);

  const isLogPanelOpen = useAppStore((s) => s.isLogPanelOpen);
  const setIsLogPanelOpen = useAppStore((s) => s.setIsLogPanelOpen);
  const logPanelActiveTab = useAppStore((s) => s.logPanelActiveTab);
  const setLogPanelActiveTab = useAppStore((s) => s.setLogPanelActiveTab);

  // State tinggi panel (dalam pixel) — default mobile 220px, desktop 180px
  const [height, setHeight] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 220 : 180
  );
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => !isLogPanelOpen);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Sync state dengan store global
  useEffect(() => {
    setIsCollapsed(!isLogPanelOpen);
  }, [isLogPanelOpen]);

  const activeTab = logPanelActiveTab;
  const setActiveTab = setLogPanelActiveTab;

  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);
  const simListRef = useRef<HTMLDivElement>(null);

  // Auto-scroll timeline mengikuti event yang sedang diputar
  useEffect(() => {
    if (activeTab === 'sim' && simListRef.current) {
      simListRef.current.scrollTop = simListRef.current.scrollHeight;
    }
  }, [simPlayedUpTo, activeTab]);

  const deviceNodes = nodes.filter((n) => n.type === 'deviceNode');
  const selectedDevice = nodes.find((n) => n.id === selectedNodeId)?.data;

  // Mouse Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = isCollapsed ? 40 : height;
  };

  // Touch Dragging (HP / Layar Sentuh)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartYRef.current = e.touches[0].clientY;
    dragStartHeightRef.current = isCollapsed ? 40 : height;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartYRef.current - e.clientY;
      const newHeight = Math.min(
        Math.max(dragStartHeightRef.current + deltaY, 40),
        window.innerHeight * 0.85
      );

      if (newHeight <= 50) {
        setIsCollapsed(true);
        setIsLogPanelOpen(false);
      } else {
        setIsCollapsed(false);
        setIsLogPanelOpen(true);
        setHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();
      const deltaY = dragStartYRef.current - e.touches[0].clientY;
      const newHeight = Math.min(
        Math.max(dragStartHeightRef.current + deltaY, 40),
        window.innerHeight * 0.85
      );

      if (newHeight <= 50) {
        setIsCollapsed(true);
        setIsLogPanelOpen(false);
      } else {
        setIsCollapsed(false);
        setIsLogPanelOpen(true);
        setHeight(newHeight);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isDragging, setIsLogPanelOpen]);

  const toggleCollapse = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    setIsLogPanelOpen(!nextCollapsed);
    if (!nextCollapsed && height < 120) {
      setHeight(typeof window !== 'undefined' && window.innerWidth < 768 ? 220 : 180);
    }
  };

  const handleMaximize = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsLogPanelOpen(true);
    }
    setHeight((prev) => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const maxHeight = Math.round(window.innerHeight * 0.75);
      const normalHeight = isMobile ? 220 : 180;
      return prev > 300 ? normalHeight : maxHeight;
    });
  };

  const handleSelectEvent = (event: SimEvent) => {
    setInspectorEvent(event);
    setInspectorOpen(true);
  };

  return (
    <div
      style={{ height: isCollapsed ? 40 : `${height}px` }}
      className={cn(
        'relative flex select-none flex-col border-t bg-card transition-[height]',
        isDragging ? 'transition-none' : 'duration-150'
      )}
    >
      {/* Resizer Handle Bar — mendukung Mouse dan Touch */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        title="Tarik ke atas/bawah untuk mengubah tinggi panel"
        className="group absolute -top-2 right-0 left-0 z-30 flex h-4 cursor-row-resize items-center justify-center hover:bg-primary/20 touch-none select-none"
      >
        <div className="flex h-1.5 w-16 items-center justify-center rounded-full bg-muted-foreground/50 transition-all group-hover:w-24 group-hover:bg-primary">
          <GripHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100" />
        </div>
      </div>

      {/* Header — Seluruh baris bisa diketuk untuk toggle buka/tutup */}
      <div
        onClick={toggleCollapse}
        className="flex h-10 sm:h-8 items-center justify-between border-b bg-muted/80 px-3 cursor-pointer select-none hover:bg-muted/95 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2 truncate">
          <ScrollText className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs sm:text-[11px] font-semibold tracking-wider uppercase text-foreground/90 truncate">
            <span className="hidden sm:inline">Log Simulasi &amp; Tabel Jaringan</span>
            <span className="sm:hidden">Log &amp; Tabel Simulasi</span>
          </span>
          <Badge variant="secondary" className="text-[10px] font-normal shrink-0 h-5 px-1.5">
            {simulationLogs.length}
          </Badge>
          {isCollapsed && (
            <span className="text-[11px] text-muted-foreground italic hidden xs:inline">
              (Ketuk untuk membuka)
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearSimulationLogs}
            title="Bersihkan Log"
            aria-label="Bersihkan Log"
            className="text-muted-foreground hover:text-red-400 h-7 w-7"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleMaximize}
            title={height > 300 ? 'Kecilkan Panel' : 'Perbesar Panel'}
            aria-label={height > 300 ? 'Kecilkan Panel' : 'Perbesar Panel'}
            className="text-muted-foreground h-7 w-7"
          >
            {height > 300 ? (
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
            className="text-muted-foreground h-7 w-7"
          >
            {isCollapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
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
          <div className="flex h-8 sm:h-7 items-stretch gap-1 border-b bg-card px-2">
            <TabsList variant="line" className="h-8 sm:h-7 gap-1 p-0">
              <TabsTrigger
                value="log"
                className="gap-1.5 px-3 text-xs sm:text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none touch-manipulation"
              >
                <ScrollText className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-sky-400" />
                <span>Log</span>
              </TabsTrigger>
              <TabsTrigger
                value="sim"
                className="gap-1.5 px-3 text-xs sm:text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none touch-manipulation"
              >
                <ListTree className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-violet-400" />
                <span>Simulasi</span>
              </TabsTrigger>
              <TabsTrigger
                value="tables"
                className="gap-1.5 px-3 text-xs sm:text-[11px] font-semibold tracking-wider uppercase after:hidden data-active:border-b-2 data-active:border-primary data-active:rounded-none touch-manipulation"
              >
                <Table2 className="h-3.5 w-3.5 sm:h-3 sm:w-3 text-emerald-400" />
                <span>Tabel</span>
              </TabsTrigger>
            </TabsList>
            {activeTab === 'sim' && simPlan.length > 0 && (
              <span className="ml-auto self-center font-mono text-[11px] text-muted-foreground truncate">
                {Math.min(simPlayedUpTo, simPlan.length)}/{simPlan.length} event
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
            {/* Device Selector Bar di Tab Tabel */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-foreground shrink-0">Perangkat:</span>
                {deviceNodes.length === 0 ? (
                  <span className="italic text-muted-foreground text-xs">Belum ada perangkat di kanvas</span>
                ) : (
                  <select
                    value={selectedNodeId || ''}
                    onChange={(e) => setSelectedNodeId(e.target.value || null)}
                    className="h-7 rounded border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary max-w-[220px]"
                  >
                    <option value="">-- Pilih Perangkat ({deviceNodes.length}) --</option>
                    {deviceNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.data.label} ({n.data.type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedDevice && (
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {selectedDevice.type} • {selectedDevice.label}
                </Badge>
              )}
            </div>

            {!selectedDevice ? (
              <div className="py-4 text-center italic text-muted-foreground">
                Pilih perangkat melalui menu dropdown di atas atau ketuk perangkat di kanvas untuk melihat tabel CAM, ARP, dan Routing secara real-time.
              </div>
            ) : selectedDevice.type === 'hub' ? (
              <div className="py-4 text-center italic text-muted-foreground">
                Hub adalah repeater Layer-1 murni — sinyal hanya diulang ke semua port, tidak ada tabel.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-2">
                {/* CAM Table — hanya switch (L2 MAC learning) */}
                {selectedDevice.type === 'switch' && (
                  <div className="rounded border bg-background/80 p-2 shadow-xs">
                    <div className="mb-1.5 flex items-center justify-between border-b border-border/50 pb-1">
                      <span className="text-[11px] font-bold uppercase text-emerald-400">
                        CAM Table (MAC)
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedDevice.label}
                      </span>
                    </div>
                    {Object.keys(selectedDevice.macTable ?? {}).length === 0 ? (
                      <div className="italic text-muted-foreground/60 py-1">(kosong — belum ada frame L2)</div>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(selectedDevice.macTable ?? {}).map(([mac, port]) => (
                          <div key={mac} className="flex items-center justify-between gap-1 text-foreground/90 bg-muted/30 px-1.5 py-0.5 rounded">
                            <span className="font-mono text-[11px]">{mac.toLowerCase()}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                              <span className="font-semibold text-emerald-400 font-mono">{port}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ARP Cache — perangkat ber-IP */}
                {selectedDevice.type !== 'switch' && (
                  <div className="rounded border bg-background/80 p-2 shadow-xs">
                    <div className="mb-1.5 flex items-center justify-between border-b border-border/50 pb-1">
                      <span className="text-[11px] font-bold uppercase text-cyan-400">
                        ARP Cache (IP ↔ MAC)
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedDevice.label}
                      </span>
                    </div>
                    {Object.keys(selectedDevice.arpTable ?? {}).length === 0 ? (
                      <div className="italic text-muted-foreground/60 py-1">(kosong — belum ada resolusi ARP)</div>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(selectedDevice.arpTable ?? {}).map(([ip, mac]) => (
                          <div key={ip} className="flex items-center justify-between gap-1 text-foreground/90 bg-muted/30 px-1.5 py-0.5 rounded">
                            <span className="font-mono text-[11px] text-foreground font-medium">{ip}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                              <span className="font-mono text-[11px] text-cyan-300">{mac.toLowerCase()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Routing Table — hanya router */}
                {selectedDevice.type === 'router' && (
                  <div className="rounded border bg-background/80 p-2 shadow-xs">
                    <div className="mb-1.5 flex items-center justify-between border-b border-border/50 pb-1">
                      <span className="text-[11px] font-bold uppercase text-amber-400">
                        Routing Table
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedDevice.label}
                      </span>
                    </div>
                    {(selectedDevice.routes ?? []).length === 0 ? (
                      <div className="italic text-muted-foreground/60 py-1">(kosong — belum ada rute statis)</div>
                    ) : (
                      <div className="space-y-1">
                        {(selectedDevice.routes ?? []).map((r, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-1 text-foreground/90 bg-muted/30 px-1.5 py-0.5 rounded">
                            <span className="font-mono text-[11px]">
                              {r.network}/{r.subnetMask}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                              <span className="font-semibold text-amber-300 font-mono">{r.nextHop}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* NAT Translations — hanya router */}
                {selectedDevice.type === 'router' && (
                  <div className="rounded border bg-background/80 p-2 shadow-xs">
                    <div className="mb-1.5 flex items-center justify-between border-b border-border/50 pb-1">
                      <span className="text-[11px] font-bold uppercase text-sky-400">
                        NAT Translations
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {selectedDevice.label}
                      </span>
                    </div>
                    {(selectedDevice.natTable ?? []).length === 0 ? (
                      <div className="italic text-muted-foreground/60 py-1">(kosong)</div>
                    ) : (
                      <div className="space-y-1">
                        {(selectedDevice.natTable ?? []).map((t, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-1 text-foreground/90 bg-muted/30 px-1.5 py-0.5 rounded">
                            <span className="font-mono text-[11px]">{t.insideIp}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/50" />
                              <span className="font-semibold text-sky-300 font-mono">{t.globalIp}</span>
                            </div>
                          </div>
                        ))}
                      </div>
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
