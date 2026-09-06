import { useState } from 'react';
import {
  Cable,
  Cloud,
  Laptop,
  Monitor,
  Network,
  Router,
  Server,
  Plus,
  LayoutTemplate,
  Layers,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type DeviceType } from '../../types/network';
import { TOPOLOGY_TEMPLATES, type TopologyTemplate } from '../../data/topologyTemplates';

interface DevicePaletteProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DevicePalette({ isOpen, onToggle }: DevicePaletteProps) {
  const { addDevice, loadTopology, addSimulationLog } = useAppStore();
  const labLocked = useAppStore((s) => s.activeLabId !== null);
  const [activeTab, setActiveTab] = useState<'devices' | 'templates'>('devices');

  const handleAdd = (type: DeviceType) => {
    const x = 200 + Math.random() * 150;
    const y = 150 + Math.random() * 150;
    addDevice(type, { x, y });
  };

  const handleApplyTemplate = (template: TopologyTemplate) => {
    const nodes = JSON.parse(JSON.stringify(template.nodes));
    const edges = JSON.parse(JSON.stringify(template.edges));
    loadTopology({ nodes, edges });
    addSimulationLog('SUCCESS', `Template "${template.name}" berhasil diterapkan ke kanvas!`);
  };

  if (!isOpen) {
    return (
      <div className="relative z-10 flex flex-col items-center border-r border-[#374151] bg-[#111827] py-3 px-1.5 select-none transition-all">
        <button
          onClick={onToggle}
          title="Buka Sidebar Panel"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#374151] bg-[#1F2937] text-gray-300 shadow-md hover:border-blue-500 hover:bg-[#374151] hover:text-white"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-6">
          <span
            style={{ writingMode: 'vertical-rl' }}
            className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 transform rotate-180"
          >
            Panel Alat
          </span>
        </div>
      </div>
    );
  }

  return (
    <aside className="relative flex w-64 flex-col border-r border-[#374151] bg-[#111827] text-gray-200 select-none transition-all duration-200">
      {/* Header with Close/Toggle Button */}
      <div className="flex h-10 items-center justify-between border-b border-[#374151] px-3 bg-[#111827]">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-300">
          Panel Navigasi
        </span>
        <button
          onClick={onToggle}
          title="Tutup Sidebar Panel"
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-[#374151] bg-[#0d121f]">
        <button
          onClick={() => setActiveTab('devices')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === 'devices'
              ? 'border-blue-500 bg-[#111827] text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Komponen</span>
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-semibold tracking-wide border-b-2 transition-all ${
            activeTab === 'templates'
              ? 'border-blue-500 bg-[#111827] text-white'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>Template</span>
        </button>
      </div>

      {/* Tab 1: Perangkat Standar */}
      {activeTab === 'devices' && (
        <div className="flex flex-1 flex-col p-3 overflow-y-auto">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Device Palette
            </h2>
            <p className="text-[11px] text-gray-500">Klik untuk menambah ke kanvas</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              disabled={labLocked}
              onClick={() => handleAdd('pc')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-sky-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-sky-950/60 p-1.5 border border-sky-800/50">
                  <Monitor className="h-4 w-4 text-sky-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">PC Host</span>
                  <span className="block text-[10px] text-gray-400">End Device (1 Port)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('laptop')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-cyan-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-cyan-950/60 p-1.5 border border-cyan-800/50">
                  <Laptop className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Laptop</span>
                  <span className="block text-[10px] text-gray-400">End Device (1 Port)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('server')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-violet-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-violet-950/60 p-1.5 border border-violet-800/50">
                  <Server className="h-4 w-4 text-violet-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Server</span>
                  <span className="block text-[10px] text-gray-400">End Device (1 Port)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('switch')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-emerald-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-emerald-950/60 p-1.5 border border-emerald-800/50">
                  <Network className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Switch L2</span>
                  <span className="block text-[10px] text-gray-400">8 FE Ports (CAM Learning)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('hub')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-orange-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-orange-950/60 p-1.5 border border-orange-800/50">
                  <Cable className="h-4 w-4 text-orange-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Hub</span>
                  <span className="block text-[10px] text-gray-400">8 FE Ports (Repeater Murni)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('accessPoint')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-fuchsia-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-fuchsia-950/60 p-1.5 border border-fuchsia-800/50">
                  <Wifi className="h-4 w-4 text-fuchsia-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Access Point</span>
                  <span className="block text-[10px] text-gray-400">Radio WiFi + Uplink</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('router')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-amber-500 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-amber-950/60 p-1.5 border border-amber-800/50">
                  <Router className="h-4 w-4 text-amber-400" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Router L3</span>
                  <span className="block text-[10px] text-gray-400">3 FE Ports (Routed)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>

            <button
              disabled={labLocked}
              onClick={() => handleAdd('cloud')}
              className="flex items-center justify-between rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed border-[#374151] bg-[#1F2937] p-2.5 transition-all hover:border-sky-400 hover:bg-[#374151]"
            >
              <div className="flex items-center gap-2.5">
                <div className="rounded bg-sky-950/60 p-1.5 border border-sky-800/50">
                  <Cloud className="h-4 w-4 text-sky-300" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-medium text-gray-100">Cloud Internet</span>
                  <span className="block text-[10px] text-gray-400">IP Publik Tersimulasi (8.8.8.8)</span>
                </div>
              </div>
              <Plus className="h-4 w-4 text-gray-400" />
            </button>
          </div>

          <div className="mt-6 border-t border-[#374151] pt-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Petunjuk Sambungan
            </h3>
            <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">
              Tarik handle port dari perangkat sumber ke target. Sambungan kabel otomatis terkunci 1-to-1.
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Template Siap Pakai */}
      {activeTab === 'templates' && (
        <div className="flex flex-1 flex-col p-3 overflow-y-auto">
          <div className="mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Template Topologi
            </h2>
            <p className="text-[11px] text-gray-500">
              Pilih arsitektur jaringan siap pakai untuk langsung dipelajari
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {TOPOLOGY_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="group relative flex flex-col rounded-lg border border-[#374151] bg-[#1F2937] p-3 transition-all hover:border-blue-500 hover:bg-[#253244]"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-100">
                    {tpl.name}
                  </span>
                  <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-400 border border-gray-700">
                    {tpl.category}
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 leading-snug line-clamp-3 mb-2.5">
                  {tpl.description}
                </p>

                <div className="flex items-center justify-between border-t border-gray-700/60 pt-2 text-[10px] text-gray-400">
                  <span>
                    {tpl.nodes.length} Nodes • {tpl.edges.length} Links
                  </span>
                  <button
                    onClick={() => handleApplyTemplate(tpl)}
                    className="rounded bg-blue-600 px-2.5 py-1 font-medium text-white shadow-sm hover:bg-blue-500"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
