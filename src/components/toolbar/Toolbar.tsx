import React, { useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Save,
  FolderOpen,
  Activity,
  Send,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { pauseSimulation, resumeSimulation } from '../../hooks/useSimulationEngine';

interface ToolbarProps {
  onTriggerPing: (sourceNodeId: string, targetIp: string) => void;
  onOpenDocs: () => void;
}

export function Toolbar({ onTriggerPing, onOpenDocs }: ToolbarProps) {
  const {
    nodes,
    edges,
    resetTopology,
    loadTopology,
    simulationSpeed,
    setSimulationSpeed,
    simulationStatus,
    addSimulationLog,
  } = useAppStore();

  const [pingSource, setPingSource] = useState<string>('');
  const [pingTargetIp, setPingTargetIp] = useState<string>('');

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
        if (json.nodes && json.edges) {
          loadTopology(json);
        } else {
          alert('Format file JSON tidak valid!');
        }
      } catch (err) {
        alert('Gagal membaca file JSON!');
      }
    };
    reader.readAsText(file);
  };

  const handleExecutePing = () => {
    if (!pingSource || !pingTargetIp.trim()) {
      alert('Pilih source PC dan ketikkan IP tujuan!');
      return;
    }
    onTriggerPing(pingSource, pingTargetIp.trim());
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-[#374151] bg-[#111827] px-4 select-none">
      {/* Brand & Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-500" />
          <span className="text-lg font-bold tracking-wider text-white">
            OpenPacket
          </span>
          <span className="rounded bg-blue-950/60 px-2 py-0.5 text-xs text-blue-400 border border-blue-800/50">
            v1.0.0
          </span>
        </div>

        <div className="h-4 w-px bg-gray-700 mx-1" />

        {/* Speed Controls */}
        <div className="flex items-center gap-1 bg-[#1F2937] p-1 rounded border border-[#374151]">
          <span className="text-[10px] text-gray-400 px-1 font-mono uppercase">Speed:</span>
          {([0.5, 1, 2] as const).map((spd) => (
            <button
              key={spd}
              onClick={() => setSimulationSpeed(spd)}
              className={`px-1.5 py-0.5 text-xs font-mono rounded ${
                simulationSpeed === spd
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Pause / Resume */}
        {simulationStatus !== 'idle' && (
          <button
            onClick={simulationStatus === 'paused' ? resumeSimulation : pauseSimulation}
            title={simulationStatus === 'paused' ? 'Lanjutkan Simulasi' : 'Jeda Simulasi'}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border ${
              simulationStatus === 'paused'
                ? 'bg-amber-600/80 text-white border-amber-500 hover:bg-amber-500'
                : 'bg-[#1F2937] text-gray-300 border-[#374151] hover:bg-[#374151]'
            }`}
          >
            {simulationStatus === 'paused' ? (
              <>
                <Play className="h-3 w-3" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" />
                Pause
              </>
            )}
          </button>
        )}
      </div>

      {/* Ping Quick Action */}
      <div className="flex items-center gap-2 rounded-lg bg-[#1F2937] px-3 py-1.5 border border-[#374151]">
        <span className="text-xs font-medium text-gray-300">Ping:</span>
        <select
          value={pingSource}
          onChange={(e) => setPingSource(e.target.value)}
          className="rounded bg-[#111827] px-2 py-1 text-xs text-gray-200 border border-[#374151] focus:outline-none focus:border-blue-500"
        >
          <option value="">-- Pilih Host --</option>
          {pingableNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.data.label} ({n.data.ports.find((p) => p.ipAddress)?.ipAddress})
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-500">→</span>

        <input
          type="text"
          placeholder="Target IP (e.g. 192.168.1.20)"
          value={pingTargetIp}
          onChange={(e) => setPingTargetIp(e.target.value)}
          className="w-44 rounded bg-[#111827] px-2 py-1 text-xs font-mono text-gray-200 border border-[#374151] placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        <button
          onClick={handleExecutePing}
          disabled={simulationStatus === 'running'}
          className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          Send Ping
        </button>
      </div>

      {/* Persistence & Tools */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenDocs}
          className="flex items-center gap-1.5 rounded bg-blue-600/30 px-2.5 py-1.5 text-xs text-blue-300 border border-blue-500/50 hover:bg-blue-600 hover:text-white transition-colors"
          title="Panduan Lengkap & Porting"
        >
          <Activity className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-semibold">Docs & Porting</span>
        </button>

        <label className="flex cursor-pointer items-center gap-1.5 rounded bg-[#1F2937] px-2.5 py-1.5 text-xs text-gray-300 border border-[#374151] hover:bg-[#374151]">
          <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
          <span>Load</span>
          <input
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
        </label>

        <button
          onClick={handleExportJson}
          className="flex items-center gap-1.5 rounded bg-[#1F2937] px-2.5 py-1.5 text-xs text-gray-300 border border-[#374151] hover:bg-[#374151]"
        >
          <Save className="h-3.5 w-3.5 text-gray-400" />
          <span>Save</span>
        </button>

        <button
          onClick={resetTopology}
          className="flex items-center gap-1.5 rounded bg-[#1F2937] px-2.5 py-1.5 text-xs text-red-400 border border-[#374151] hover:bg-red-950/40"
          title="Reset Topologi"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
}
