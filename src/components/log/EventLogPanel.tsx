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
      return 'text-gray-400 bg-gray-800 border-gray-700';
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
    ? (EVENT_KIND_COLORS[event.kind] ?? 'text-gray-400 bg-gray-800 border-gray-700')
    : getBadgeColor(event.level);
  return (
    <button
      onClick={() => onSelect(event)}
      className={`w-full flex items-start gap-2 leading-relaxed px-1 py-0.5 rounded text-left ${
        isCurrent ? 'bg-violet-950/50 ring-1 ring-violet-700/60' : 'hover:bg-gray-900/60'
      } ${isPlayed ? '' : 'opacity-40'}`}
    >
      <span className="text-gray-500 shrink-0 font-mono text-[10px] w-14">
        t={event.simTimeMs}ms
      </span>
      <span className={`rounded px-1.5 py-0.2 text-[10px] font-semibold border shrink-0 ${color}`}>
        {isHop ? event.kind : event.level}
      </span>
      <span className="text-gray-300 break-words">{event.message}</span>
      {event.effects && event.effects.length > 0 && (
        <span
          className="ml-auto shrink-0 rounded bg-amber-950/60 border border-amber-800/60 px-1 text-[9px] text-amber-300"
          title="Event ini mengubah tabel (CAM/ARP)"
        >
          table
        </span>
      )}
    </button>
  );
}

export function EventLogPanel() {
  const { simulationLogs, clearSimulationLogs } = useAppStore();
  const {
    simPlan,
    simPlayedUpTo,
    setInspectorEvent,
    setInspectorOpen,
    selectedNodeId,
    nodes,
  } = useAppStore();

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

  const tabs: Array<{ id: PanelTab; label: string; icon: React.ReactNode }> = [
    { id: 'log', label: 'Log', icon: <ScrollText className="h-3 w-3" /> },
    { id: 'sim', label: 'Simulasi', icon: <ListTree className="h-3 w-3" /> },
    { id: 'tables', label: 'Tabel', icon: <Table2 className="h-3 w-3" /> },
  ];

  return (
    <div
      style={{ height: isCollapsed ? 32 : `${height}px` }}
      className={`relative flex flex-col border-t border-[#374151] bg-[#0d121f] select-none transition-[height] ${
        isDragging ? 'transition-none' : 'duration-150'
      }`}
    >
      {/* Resizer Handle Bar */}
      <div
        onMouseDown={handleMouseDown}
        title="Tarik ke atas/bawah untuk mengubah tinggi terminal"
        className="group absolute -top-1.5 left-0 right-0 z-30 flex h-3 cursor-row-resize items-center justify-center hover:bg-blue-500/20"
      >
        <div className="flex h-1.5 w-16 items-center justify-center rounded-full bg-gray-600 group-hover:bg-blue-400 group-hover:w-24 transition-all">
          <GripHorizontal className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100" />
        </div>
      </div>

      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-[#374151] px-3 bg-[#111827]">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">
            Network Event Log & PDU Inspection
          </span>
          <span className="rounded bg-gray-800 px-1.5 py-0.2 text-[10px] text-gray-400">
            {simulationLogs.length} events
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={clearSimulationLogs}
            title="Bersihkan Log"
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleMaximize}
            title={height > 350 ? 'Kecilkan Panel' : 'Perbesar Panel'}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {height > 350 ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            onClick={toggleCollapse}
            title={isCollapsed ? 'Buka Panel' : 'Sembunyikan Panel'}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            {isCollapsed ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      {!isCollapsed && (
        <div className="flex h-7 items-stretch border-b border-[#374151] bg-[#0d121f] px-2 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          {activeTab === 'sim' && simPlan.length > 0 && (
            <span className="ml-auto self-center text-[10px] text-gray-500 font-mono">
              {Math.min(simPlayedUpTo, simPlan.length)}/{simPlan.length} event diputar
            </span>
          )}
        </div>
      )}

      {/* Panel content */}
      {!isCollapsed && activeTab === 'log' && (
        <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-1 bg-[#090D16]">
          {simulationLogs.length === 0 ? (
            <div className="text-gray-500 italic py-2 text-center">
              Belum ada aktivitas simulasi. Kirim ping atau terapkan template untuk melihat inspeksi alur paket real-time.
            </div>
          ) : (
            simulationLogs.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2.5 leading-relaxed hover:bg-gray-900/60 px-1 py-0.5 rounded"
                >
                  <span className="text-gray-500 shrink-0 font-mono text-[10px]">
                    {timeStr}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-semibold border shrink-0 ${getBadgeColor(
                      log.type
                    )}`}
                  >
                    {log.type}
                  </span>
                  <span className="text-gray-300 break-words">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {!isCollapsed && activeTab === 'sim' && (
        <div
          ref={simListRef}
          className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] space-y-0.5 bg-[#090D16]"
        >
          {simPlan.length === 0 ? (
            <div className="text-gray-500 italic py-2 text-center">
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
        </div>
      )}

      {!isCollapsed && activeTab === 'tables' && (
        <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] bg-[#090D16]">
          {!selectedDevice ? (
            <div className="text-gray-500 italic py-2 text-center">
              Pilih perangkat di kanvas untuk melihat tabel CAM, ARP, dan Routing secara real-time.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {/* CAM Table */}
              <div className="rounded border border-gray-800 bg-black/40 p-2">
                <div className="text-[10px] font-bold uppercase text-emerald-400 mb-1">
                  CAM Table — {selectedDevice.label}
                </div>
                {Object.keys(selectedDevice.macTable ?? {}).length === 0 ? (
                  <div className="text-gray-600 italic">(kosong)</div>
                ) : (
                  Object.entries(selectedDevice.macTable ?? {}).map(([mac, port]) => (
                    <div key={mac} className="flex items-center gap-1 text-gray-300">
                      <span className="truncate">{mac.toLowerCase()}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-gray-600 shrink-0" />
                      <span className="text-emerald-300">{port}</span>
                    </div>
                  ))
                )}
              </div>

              {/* ARP Cache */}
              <div className="rounded border border-gray-800 bg-black/40 p-2">
                <div className="text-[10px] font-bold uppercase text-cyan-400 mb-1">
                  ARP Cache — {selectedDevice.label}
                </div>
                {Object.keys(selectedDevice.arpTable ?? {}).length === 0 ? (
                  <div className="text-gray-600 italic">(kosong)</div>
                ) : (
                  Object.entries(selectedDevice.arpTable ?? {}).map(([ip, mac]) => (
                    <div key={ip} className="flex items-center gap-1 text-gray-300">
                      <span>{ip}</span>
                      <ArrowRight className="h-2.5 w-2.5 text-gray-600 shrink-0" />
                      <span className="text-cyan-300 truncate">{mac.toLowerCase()}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Routing Table */}
              <div className="rounded border border-gray-800 bg-black/40 p-2">
                <div className="text-[10px] font-bold uppercase text-amber-400 mb-1">
                  Routing — {selectedDevice.label}
                </div>
                {selectedDevice.type !== 'router' ? (
                  <div className="text-gray-600 italic">bukan router</div>
                ) : (selectedDevice.routes ?? []).length === 0 ? (
                  <div className="text-gray-600 italic">(kosong)</div>
                ) : (
                  (selectedDevice.routes ?? []).map((r, idx) => (
                    <div key={idx} className="text-gray-300 truncate">
                      {r.network}/{r.subnetMask} → <span className="text-amber-300">{r.nextHop}</span>
                    </div>
                  ))
                )}
              </div>

              {/* NAT Translations */}
              <div className="rounded border border-gray-800 bg-black/40 p-2">
                <div className="text-[10px] font-bold uppercase text-sky-400 mb-1">
                  NAT Table — {selectedDevice.label}
                </div>
                {(selectedDevice.natTable ?? []).length === 0 ? (
                  <div className="text-gray-600 italic">(kosong)</div>
                ) : (
                  (selectedDevice.natTable ?? []).map((t, idx) => (
                    <div key={idx} className="text-gray-300 truncate">
                      {t.insideIp} → <span className="text-sky-300">{t.globalIp}</span>
                      <span className="text-gray-600"> (id {t.icmpId}#{t.echoSeq})</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
