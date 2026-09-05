import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { isValidIp, isValidSubnetMask } from '../../utils/ipUtils';
import { type DeviceData } from '../../types/network';

export function DeviceConfigModal() {
  const activeConfigModalNodeId = useAppStore((s) => s.activeConfigModalNodeId);
  const nodes = useAppStore((s) => s.nodes);

  const node = nodes.find((n) => n.id === activeConfigModalNodeId);
  if (!activeConfigModalNodeId || !node) return null;

  return <DeviceConfigModalContent key={node.id} node={node} />;
}

function DeviceConfigModalContent({ node }: { node: Node<DeviceData> }) {
  const {
    setActiveConfigModalNodeId,
    updatePortConfig,
    updateDeviceConfig,
    addSimulationLog,
  } = useAppStore();

  const device = node.data;
  const [selectedPortId, setSelectedPortId] = useState<string>(
    device.ports[0]?.id || ''
  );
  const selectedPort = device.ports.find((p) => p.id === selectedPortId);

  const [ipAddress, setIpAddress] = useState<string>(
    selectedPort?.ipAddress || ''
  );
  const [subnetMask, setSubnetMask] = useState<string>(
    selectedPort?.subnetMask || '255.255.255.0'
  );
  const [defaultGateway, setDefaultGateway] = useState<string>(
    device.defaultGateway || ''
  );
  const [label, setLabel] = useState<string>(device.label);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handlePortChange = (portId: string) => {
    setSelectedPortId(portId);
    const p = device.ports.find((pr) => pr.id === portId);
    setIpAddress(p?.ipAddress || '');
    setSubnetMask(p?.subnetMask || '255.255.255.0');
    setErrorMsg('');
  };

  const handleSave = () => {
    setErrorMsg('');

    // Validasi jika IP diisi
    if (ipAddress.trim()) {
      if (!isValidIp(ipAddress)) {
        setErrorMsg('Format IPv4 tidak valid! Contoh: 192.168.1.10');
        return;
      }
      if (!isValidSubnetMask(subnetMask)) {
        setErrorMsg('Format Subnet Mask tidak valid! Contoh: 255.255.255.0');
        return;
      }
    }

    if (defaultGateway.trim() && !isValidIp(defaultGateway)) {
      setErrorMsg('Format Default Gateway tidak valid!');
      return;
    }

    // Simpan label & gateway
    updateDeviceConfig(device.id, {
      label,
      defaultGateway: defaultGateway.trim() || undefined,
    });

    // Simpan port config
    if (selectedPort) {
      updatePortConfig(device.id, selectedPort.id, {
        ipAddress: ipAddress.trim() || undefined,
        subnetMask: subnetMask.trim() || undefined,
      });
    }

    addSimulationLog(
      'SUCCESS',
      `Konfigurasi tersimpan untuk ${label} (${selectedPort?.name || ''})`
    );
    setActiveConfigModalNodeId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="flex w-[480px] flex-col rounded-xl border border-[#374151] bg-[#1F2937] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#374151] px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
            <span className="font-semibold text-gray-100">
              Konfigurasi Perangkat ({device.type.toUpperCase()})
            </span>
          </div>
          <button
            onClick={() => setActiveConfigModalNodeId(null)}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 p-5">
          {errorMsg && (
            <div className="rounded-lg bg-red-950/60 p-2.5 text-xs text-red-300 border border-red-800/60">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Nama Perangkat (Hostname)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md bg-[#111827] px-3 py-1.5 text-sm text-gray-100 border border-[#374151] focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Tab Port Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Pilih Port Antarmuka Fisik
            </label>
            <div className="flex flex-wrap gap-1.5">
              {device.ports.map((port) => (
                <button
                  key={port.id}
                  onClick={() => handlePortChange(port.id)}
                  className={`rounded px-2.5 py-1 text-xs font-mono border ${
                    selectedPortId === port.id
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-[#111827] text-gray-400 border-[#374151] hover:text-gray-200'
                  }`}
                >
                  {port.id}
                </button>
              ))}
            </div>
          </div>

          {/* Port Settings Form */}
          {selectedPort && (
            <div className="rounded-lg bg-[#111827]/70 p-3.5 border border-[#374151] flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Port Name:</span>
                <span className="font-mono text-emerald-400 font-semibold">{selectedPort.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">MAC Address:</span>
                <span className="font-mono text-gray-300">{selectedPort.macAddress}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Link Status:</span>
                <span className={`font-mono uppercase font-semibold ${selectedPort.status === 'up' ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {selectedPort.status}
                </span>
              </div>

              {device.type !== 'switch' && device.type !== 'hub' && (
                <>
                  <div className="pt-2 border-t border-gray-800">
                    <label className="block text-xs text-gray-300 mb-1">
                      IPv4 Address
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.1.10"
                      value={ipAddress}
                      onChange={(e) => setIpAddress(e.target.value)}
                      className="w-full rounded bg-[#1F2937] px-3 py-1.5 font-mono text-xs text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      Subnet Mask
                    </label>
                    <input
                      type="text"
                      placeholder="255.255.255.0"
                      value={subnetMask}
                      onChange={(e) => setSubnetMask(e.target.value)}
                      className="w-full rounded bg-[#1F2937] px-3 py-1.5 font-mono text-xs text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Default Gateway untuk end device (PC/Laptop/Server) */}
          {['pc', 'laptop', 'server'].includes(device.type) && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Default Gateway
              </label>
              <input
                type="text"
                placeholder="e.g. 192.168.1.1"
                value={defaultGateway}
                onChange={(e) => setDefaultGateway(e.target.value)}
                className="w-full rounded-md bg-[#111827] px-3 py-1.5 font-mono text-xs text-gray-100 border border-[#374151] focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-[#374151] px-5 py-3 bg-[#111827]">
          <button
            onClick={() => setActiveConfigModalNodeId(null)}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-white"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 shadow-md"
          >
            <Save className="h-3.5 w-3.5" />
            Simpan Konfigurasi
          </button>
        </div>
      </div>
    </div>
  );
}
