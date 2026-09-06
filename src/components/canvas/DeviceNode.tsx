import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Cable,
  Cloud,
  Laptop,
  Monitor,
  Network,
  Router,
  Server,
  Settings,
  Terminal,
  Trash2,
  Wifi,
} from 'lucide-react';
import { type DeviceData } from '../../types/network';
import { useAppStore } from '../../store/useAppStore';

export function DeviceNode({ id, data, selected }: NodeProps) {
  const deviceData = data as unknown as DeviceData;
  const {
    deleteNode,
    setActiveConfigModalNodeId,
    setActiveCliModalNodeId,
    requestConfirm,
  } = useAppStore();

  const getDeviceIcon = () => {
    switch (deviceData.type) {
      case 'pc':
        return <Monitor className="h-6 w-6 text-sky-400" />;
      case 'laptop':
        return <Laptop className="h-6 w-6 text-cyan-400" />;
      case 'server':
        return <Server className="h-6 w-6 text-violet-400" />;
      case 'switch':
        return <Network className="h-6 w-6 text-emerald-400" />;
      case 'hub':
        return <Cable className="h-6 w-6 text-orange-400" />;
      case 'accessPoint':
        return <Wifi className="h-6 w-6 text-fuchsia-400" />;
      case 'cloud':
        return <Cloud className="h-6 w-6 text-sky-300" />;
      case 'router':
        return <Router className="h-6 w-6 text-amber-400" />;
    }
  };

  const hasConfiguredIp = deviceData.ports.some((p) => p.ipAddress);

  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border-2 bg-[#1F2937] p-3.5 shadow-xl transition-colors min-w-[150px] cursor-grab active:cursor-grabbing select-none ${
        selected
          ? 'border-blue-500 shadow-blue-500/30 ring-2 ring-blue-500/20'
          : 'border-[#374151] hover:border-gray-500'
      }`}
    >
      {/* Action buttons — muncul saat node DIKLIK (terpilih), bukan hover.
          Tetap nodrag/nopan agar klik tombol tidak menyeret node. */}
      <div
        className={`nodrag nopan absolute -top-8 right-0 flex items-center gap-1 rounded bg-[#111827] p-1 border border-[#374151] shadow-md z-30 transition-all duration-150 ${
          selected ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveConfigModalNodeId(id);
          }}
          title="Konfigurasi Perangkat (GUI)"
          aria-label={`Konfigurasi ${deviceData.label}`}
          className="rounded p-1 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveCliModalNodeId(id);
          }}
          title="Terminal CLI Cisco"
          aria-label={`Buka terminal CLI ${deviceData.label}`}
          className="rounded p-1 text-gray-300 hover:bg-gray-700 hover:text-green-400"
        >
          <Terminal className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            requestConfirm({
              title: 'Hapus Perangkat',
              message: `Hapus ${deviceData.label}? Kabel yang terhubung juga akan dilepas.`,
              confirmLabel: 'Hapus',
              onConfirm: () => deleteNode(id),
            });
          }}
          title="Hapus Perangkat"
          aria-label={`Hapus ${deviceData.label}`}
          className="rounded p-1 text-gray-300 hover:bg-red-950/60 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Device Header - Drag target */}
      <div className="flex items-center gap-2.5 pointer-events-none">
        <div className="rounded-lg bg-gray-800/90 p-2 border border-gray-700/80 shadow-inner">
          {getDeviceIcon()}
        </div>
        <div>
          <span className="block text-xs font-bold text-gray-100">{deviceData.label}</span>
          <span className="block text-[11px] text-gray-400 uppercase tracking-wider font-mono">
            {deviceData.type}
          </span>
        </div>
      </div>

      {/* IP / Info Tag */}
      {hasConfiguredIp && (
        <div className="mt-2 text-[11px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60 font-semibold shadow-xs pointer-events-none">
          {deviceData.ports.find((p) => p.ipAddress)?.ipAddress}
        </div>
      )}

      {/* Physical Ports Handles */}
      <div className="mt-3 flex w-full flex-wrap justify-around gap-2 border-t border-gray-700/60 pt-2.5 nodrag">
        {deviceData.ports.map((port, idx) => {
          const isUp = port.status === 'up';
          const isWireless = port.kind === 'wireless';
          const handleColor = isWireless
            ? '!bg-violet-400 shadow-violet-500/50 ring-2 ring-violet-500/40'
            : isUp
            ? '!bg-emerald-400 shadow-emerald-500/50 ring-2 ring-emerald-500/30'
            : '!bg-amber-500 hover:!bg-amber-400 ring-1 ring-amber-500/20';
          return (
            <div key={port.id} className="relative flex flex-col items-center">
              {/* React Flow Handles: Source and Target */}
              <Handle
                type="source"
                position={Position.Bottom}
                id={port.id}
                className={`!h-3.5 !w-3.5 !rounded-full !border-2 !border-gray-900 transition-all shadow-md cursor-crosshair ${handleColor} ${
                  isWireless && !isUp ? 'opacity-50' : ''
                }`}
                title={`${port.name}${port.ssid ? ` (SSID: ${port.ssid})` : ''} (${isUp ? 'Link UP' : 'Link DOWN'})`}
              />
              <Handle
                type="target"
                position={Position.Bottom}
                id={port.id}
                className="!h-3.5 !w-3.5 !rounded-full !border-0 !opacity-0 !pointer-events-none"
              />
              <span className="mt-1 text-[11px] font-mono font-medium text-gray-400 pointer-events-none">
                {isWireless
                  ? 'wifi'
                  : deviceData.type === 'switch' || deviceData.type === 'hub'
                  ? `f${idx + 1}`
                  : port.id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
