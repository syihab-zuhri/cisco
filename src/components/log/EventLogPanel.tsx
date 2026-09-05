import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Trash2,
  GripHorizontal,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function EventLogPanel() {
  const { simulationLogs, clearSimulationLogs } = useAppStore();

  // State tinggi panel (dalam pixel)
  const [height, setHeight] = useState<number>(160);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);

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

      {/* Log items stream */}
      {!isCollapsed && (
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
    </div>
  );
}
