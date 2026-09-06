import { useState } from 'react';
import type { Node } from '@xyflow/react';
import {
  X,
  Save,
  ShieldCheck,
  Trash2,
  Plus,
  Wifi,
  Route,
  Globe,
  Server,
  Network,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { isValidIp, isValidSubnetMask } from '../../utils/ipUtils';
import { type DeviceData } from '../../types/network';
import { requestDhcp, requestRip } from '../../hooks/useSimulationEngine';
import { useModalA11y } from '../../hooks/useModalA11y';

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
    syncWirelessAssociation,
    revalidateWirelessClients,
    addStaticRoute,
    removeStaticRoute,
  } = useAppStore();

  const dialogRef = useModalA11y({
    onClose: () => setActiveConfigModalNodeId(null),
  });

  const device = node.data;
  const [selectedPortId, setSelectedPortId] = useState<string>(
    device.ports[0]?.id || ''
  );
  const selectedPort = device.ports.find((p) => p.id === selectedPortId);
  const isWirelessPort = selectedPort?.kind === 'wireless';

  const [ipAddress, setIpAddress] = useState<string>(
    selectedPort?.ipAddress || ''
  );
  const [subnetMask, setSubnetMask] = useState<string>(
    selectedPort?.subnetMask || '255.255.255.0'
  );
  const [ssid, setSsid] = useState<string>(selectedPort?.ssid || '');
  const [defaultGateway, setDefaultGateway] = useState<string>(
    device.defaultGateway || ''
  );
  const [label, setLabel] = useState<string>(device.label);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // DHCP klien & pool/NAT router
  const [dhcpClient, setDhcpClient] = useState<boolean>(
    selectedPort?.dhcpEnabled ?? false
  );
  const routerPool = device.dhcpPools?.[selectedPortId];
  const [poolEnabled, setPoolEnabled] = useState<boolean>(routerPool?.enabled ?? false);
  const [poolNetwork, setPoolNetwork] = useState<string>(routerPool?.network ?? '');
  const [poolMask, setPoolMask] = useState<string>(routerPool?.mask ?? '255.255.255.0');
  const [poolStartIp, setPoolStartIp] = useState<string>(routerPool?.startIp ?? '');
  const [poolMaxClients, setPoolMaxClients] = useState<number>(
    routerPool?.maxClients ?? 50
  );
  const [natEnabled, setNatEnabled] = useState<boolean>(
    selectedPort?.natEnabled ?? false
  );

  // VLAN (switch port) & sub-interface (router port)
  const [portVlan, setPortVlan] = useState<number>(selectedPort?.vlanId ?? 1);
  const [portMode, setPortMode] = useState<'access' | 'trunk'>(
    selectedPort?.portMode ?? 'access'
  );
  const [subIfs, setSubIfs] = useState<Array<{ vlanId: number; ipAddress: string; subnetMask: string }>>(
    selectedPort?.subInterfaces ? [...selectedPort.subInterfaces] : []
  );
  const [subVlan, setSubVlan] = useState<string>('');
  const [subIp, setSubIp] = useState<string>('');
  const [subMask, setSubMask] = useState<string>('255.255.255.0');
  const [ripEnabled, setRipEnabled] = useState<boolean>(device.ripEnabled ?? false);

  // Editor static route (router)
  const [routeNetwork, setRouteNetwork] = useState<string>('');
  const [routeMask, setRouteMask] = useState<string>('255.255.255.0');
  const [routeNextHop, setRouteNextHop] = useState<string>('');

  const handlePortChange = (portId: string) => {
    setSelectedPortId(portId);
    const p = device.ports.find((pr) => pr.id === portId);
    setIpAddress(p?.ipAddress || '');
    setSubnetMask(p?.subnetMask || '255.255.255.0');
    setSsid(p?.ssid || '');
    setDhcpClient(p?.dhcpEnabled ?? false);
    setNatEnabled(p?.natEnabled ?? false);
    setPortVlan(p?.vlanId ?? 1);
    setPortMode(p?.portMode ?? 'access');
    setSubIfs(p?.subInterfaces ? [...p.subInterfaces] : []);
    setRipEnabled(device.ripEnabled ?? false);
    const pool = device.dhcpPools?.[portId];
    setPoolEnabled(pool?.enabled ?? false);
    setPoolNetwork(pool?.network ?? '');
    setPoolMask(pool?.mask ?? '255.255.255.0');
    setPoolStartIp(pool?.startIp ?? '');
    setPoolMaxClients(pool?.maxClients ?? 50);
    setErrorMsg('');
  };

  const handleAddRoute = () => {
    if (!isValidIp(routeNetwork.trim()) || !isValidSubnetMask(routeMask.trim())) {
      setErrorMsg('Format network/subnet mask route tidak valid!');
      return;
    }
    if (!isValidIp(routeNextHop.trim())) {
      setErrorMsg('Format next-hop route tidak valid!');
      return;
    }
    addStaticRoute(device.id, {
      network: routeNetwork.trim(),
      subnetMask: routeMask.trim(),
      nextHop: routeNextHop.trim(),
      interfaceId: device.ports[0]?.id ?? 'fa0/0',
    });
    setRouteNetwork('');
    setRouteMask('255.255.255.0');
    setRouteNextHop('');
    setErrorMsg('');
  };

  const handleSave = () => {
    setErrorMsg('');

    // Validasi jika IP diisi (hanya port ethernet yang ber-IP)
    if (!isWirelessPort && ipAddress.trim() && !dhcpClient) {
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

    if (poolEnabled) {
      if (!isValidIp(poolNetwork) || !isValidSubnetMask(poolMask) || !isValidIp(poolStartIp)) {
        setErrorMsg('Pool DHCP: network/mask/start IP tidak valid!');
        return;
      }
    }

    for (const s of subIfs) {
      if (!isValidIp(s.ipAddress) || !isValidSubnetMask(s.subnetMask)) {
        setErrorMsg(`Sub-interface VLAN ${s.vlanId}: IP/mask tidak valid!`);
        return;
      }
    }

    // Simpan label & gateway
    updateDeviceConfig(device.id, {
      label,
      defaultGateway: defaultGateway.trim() || undefined,
      ...(device.type === 'router' ? { ripEnabled } : {}),
    });

    if (selectedPort) {
      if (isWirelessPort) {
        // Simpan SSID lalu sinkronkan asosiasi WiFi
        updatePortConfig(device.id, selectedPort.id, { ssid: ssid.trim() });
        if (device.type === 'accessPoint') {
          revalidateWirelessClients();
          addSimulationLog(
            'INFO',
            `${label}: SSID radio diubah menjadi "${ssid.trim()}".`
          );
        } else {
          syncWirelessAssociation(device.id, selectedPort.id);
        }
      } else if (device.type === 'router') {
        // Router: NAT per port + pool DHCP per interface + sub-interface VLAN
        updatePortConfig(device.id, selectedPort.id, {
          natEnabled,
          subInterfaces: subIfs.length > 0 ? subIfs : undefined,
        });
        const pools = { ...(device.dhcpPools ?? {}) };
        pools[selectedPort.id] = {
          enabled: poolEnabled,
          network: poolNetwork.trim(),
          mask: poolMask.trim(),
          startIp: poolStartIp.trim(),
          maxClients: Math.max(1, poolMaxClients),
        };
        updateDeviceConfig(device.id, { dhcpPools: pools });
        updatePortConfig(device.id, selectedPort.id, {
          ipAddress: ipAddress.trim() || undefined,
          subnetMask: subnetMask.trim() || undefined,
        });
        addSimulationLog(
          'INFO',
          `${label}: ${selectedPort.id} — NAT ${natEnabled ? 'AKTIF' : 'nonaktif'}, DHCP server ${poolEnabled ? 'AKTIF' : 'nonaktif'}.`
        );
      } else {
        updatePortConfig(device.id, selectedPort.id, {
          dhcpEnabled: dhcpClient,
          ipAddress: dhcpClient ? undefined : ipAddress.trim() || undefined,
          subnetMask: dhcpClient ? undefined : subnetMask.trim() || undefined,
          ...(device.type === 'switch'
            ? { vlanId: portVlan, portMode }
            : {}),
        });
        if (dhcpClient) {
          addSimulationLog('INFO', `Meminta IP via DHCP pada ${selectedPort.name}...`);
          void requestDhcp(device.id, selectedPort.id).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            addSimulationLog(
              'ERROR',
              message === 'SIM_BUSY'
                ? 'Simulasi lain sedang berjalan — ulangi permintaan DHCP.'
                : `DHCP gagal: ${message}`
            );
          });
        }
      }
    }

    addSimulationLog(
      'SUCCESS',
      `Konfigurasi tersimpan untuk ${label} (${selectedPort?.name || ''})`
    );
    setActiveConfigModalNodeId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) setActiveConfigModalNodeId(null);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-config-title"
        className="flex max-h-[90vh] w-[520px] flex-col rounded-xl border border-[#374151] bg-[#1F2937] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#374151] px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
            <span
              id="device-config-title"
              className="font-semibold text-gray-100"
            >
              Konfigurasi Perangkat ({device.type.toUpperCase()})
            </span>
          </div>
          <button
            onClick={() => setActiveConfigModalNodeId(null)}
            aria-label="Tutup konfigurasi"
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
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
              Pilih Port Antarmuka
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

              {isWirelessPort ? (
                /* Konfigurasi port nirkabel: SSID */
                <div className="pt-2 border-t border-gray-800">
                  <label className="flex items-center gap-1.5 block text-xs text-violet-300 mb-1">
                    <Wifi className="h-3.5 w-3.5" />
                    {device.type === 'accessPoint' ? 'SSID yang Di-broadcast' : 'SSID Access Point Tujuan'}
                  </label>
                  <input
                    type="text"
                    placeholder={device.type === 'accessPoint' ? 'e.g. KantorWiFi' : 'e.g. KantorWiFi (harus sama dengan AP)'}
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    className="w-full rounded bg-[#1F2937] px-3 py-1.5 font-mono text-xs text-gray-100 border border-violet-800/60 focus:outline-none focus:border-violet-500"
                  />
                  <p className="mt-1.5 text-[10px] text-gray-500 leading-relaxed">
                    {device.type === 'accessPoint'
                      ? 'Simpan untuk mengubah SSID radio — semua klien yang terasosiasi akan divalidasi ulang otomatis.'
                      : 'Simpan untuk mencari & berasosiasi otomatis dengan AP ber-SSID yang sama. Kosongkan untuk memutus WiFi.'}
                  </p>
                </div>
              ) : (
                device.type !== 'switch' &&
                device.type !== 'hub' &&
                device.type !== 'cloud' && (
                  <>
                    {/* DHCP klien: PC/Laptop/Server */}
                    {['pc', 'laptop', 'server'].includes(device.type) && (
                      <label className="flex items-center gap-2 pt-2 border-t border-gray-800 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dhcpClient}
                          onChange={(e) => setDhcpClient(e.target.checked)}
                          className="accent-blue-500"
                        />
                        <Server className="h-3.5 w-3.5 text-blue-400" />
                        Obtain IP via DHCP (otomatis dari router)
                      </label>
                    )}

                    {!dhcpClient && (
                      <>
                        <div className="pt-2 border-t border-gray-800">
                          <label className="block text-xs text-gray-300 mb-1">IPv4 Address</label>
                          <input
                            type="text"
                            placeholder="e.g. 192.168.1.10"
                            value={ipAddress}
                            onChange={(e) => setIpAddress(e.target.value)}
                            className="w-full rounded bg-[#1F2937] px-3 py-1.5 font-mono text-xs text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-300 mb-1">Subnet Mask</label>
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

                    {/* Router: NAT + DHCP pool per interface */}
                    {device.type === 'router' && (
                      <div className="rounded bg-black/30 border border-gray-800 p-2.5 space-y-2">
                        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={natEnabled}
                            onChange={(e) => setNatEnabled(e.target.checked)}
                            className="accent-sky-500"
                          />
                          <Globe className="h-3.5 w-3.5 text-sky-400" />
                          NAT/PAT keluar pada interface ini (WAN)
                        </label>

                        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={poolEnabled}
                            onChange={(e) => setPoolEnabled(e.target.checked)}
                            className="accent-emerald-500"
                          />
                          <Server className="h-3.5 w-3.5 text-emerald-400" />
                          DHCP Server pada interface ini
                        </label>

                        {poolEnabled && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              placeholder="Network (192.168.1.0)"
                              value={poolNetwork}
                              onChange={(e) => setPoolNetwork(e.target.value)}
                              className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="text"
                              placeholder="Mask (255.255.255.0)"
                              value={poolMask}
                              onChange={(e) => setPoolMask(e.target.value)}
                              className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="text"
                              placeholder="Start IP (192.168.1.100)"
                              value={poolStartIp}
                              onChange={(e) => setPoolStartIp(e.target.value)}
                              className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                            />
                            <input
                              type="number"
                              min={1}
                              max={254}
                              placeholder="Max clients"
                              value={poolMaxClients}
                              onChange={(e) => setPoolMaxClients(Number(e.target.value))}
                              className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}

          {/* VLAN untuk port switch */}
          {selectedPort && device.type === 'switch' && (
            <div className="rounded-lg bg-[#111827]/70 p-3.5 border border-[#374151]">
              <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 mb-2">
                <Network className="h-3.5 w-3.5" />
                VLAN 802.1Q — {selectedPort.name}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Mode Port</label>
                  <select
                    value={portMode}
                    onChange={(e) => setPortMode(e.target.value as 'access' | 'trunk')}
                    className="w-full rounded bg-[#1F2937] px-2 py-1 font-mono text-xs text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="access">access</option>
                    <option value="trunk">trunk (semua VLAN)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">VLAN ID</label>
                  <input
                    type="number"
                    min={1}
                    max={4094}
                    disabled={portMode === 'trunk'}
                    value={portVlan}
                    onChange={(e) => setPortVlan(Number(e.target.value))}
                    className="w-full rounded bg-[#1F2937] px-2 py-1 font-mono text-xs text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500 disabled:opacity-40"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-gray-500">
                Port access hanya berkomunikasi dengan port se-VLAN; port trunk membawa semua VLAN.
              </p>
            </div>
          )}

          {/* Sub-interface router (router-on-a-stick) */}
          {selectedPort && device.type === 'router' && (
            <div className="rounded-lg bg-[#111827]/70 p-3.5 border border-[#374151]">
              <label className="flex items-center gap-1.5 text-xs font-medium text-sky-300 mb-2">
                <Network className="h-3.5 w-3.5" />
                Sub-interface VLAN (router-on-a-stick) — {selectedPort.name}
              </label>
              {(subIfs.length === 0) && (
                <div className="text-[10px] text-gray-500 mb-1.5">Belum ada sub-interface.</div>
              )}
              <div className="flex flex-col gap-1 mb-2">
                {subIfs.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-gray-300 border border-gray-800">
                    <span>
                      VLAN {s.vlanId}: {s.ipAddress}/{s.subnetMask}
                    </span>
                    <button
                      onClick={() => setSubIfs(subIfs.filter((_, i) => i !== idx))}
                      className="rounded p-0.5 text-gray-500 hover:bg-red-950/60 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={4094}
                  placeholder="VLAN"
                  value={subVlan}
                  onChange={(e) => setSubVlan(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="IP (192.168.10.1)"
                  value={subIp}
                  onChange={(e) => setSubIp(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Mask"
                  value={subMask}
                  onChange={(e) => setSubMask(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => {
                  const vlan = Number(subVlan);
                  if (!vlan || vlan < 1 || vlan > 4094 || !isValidIp(subIp) || !isValidSubnetMask(subMask)) {
                    setErrorMsg('Sub-interface: VLAN/IP/mask tidak valid!');
                    return;
                  }
                  setSubIfs([...subIfs, { vlanId: vlan, ipAddress: subIp.trim(), subnetMask: subMask.trim() }]);
                  setSubVlan('');
                  setSubIp('');
                  setErrorMsg('');
                }}
                className="mt-2 flex items-center gap-1 rounded bg-sky-600/80 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-sky-500"
              >
                <Plus className="h-3 w-3" />
                Tambah Sub-interface
              </button>
            </div>
          )}

          {/* Default Gateway untuk end device */}
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

          {/* Static Route editor (router) */}
          {device.type === 'router' && (
            <div className="rounded-lg bg-[#111827]/70 p-3.5 border border-[#374151]">
              <label className="flex items-center gap-1.5 text-xs font-medium text-sky-300 mb-2">
                <Route className="h-3.5 w-3.5" />
                Static Route (termasuk default route 0.0.0.0/0 untuk internet)
              </label>
              <div className="flex flex-col gap-1.5 mb-2.5">
                {(device.routes ?? []).length === 0 && (
                  <span className="text-[10px] text-gray-500">Belum ada static route.</span>
                )}
                {(device.routes ?? []).map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-gray-300 border border-gray-800">
                    <span>
                      {r.network}/{r.subnetMask} → {r.nextHop}
                    </span>
                    <button
                      onClick={() => removeStaticRoute(device.id, idx)}
                      title="Hapus route"
                      className="rounded p-0.5 text-gray-500 hover:bg-red-950/60 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="text"
                  placeholder="Network"
                  value={routeNetwork}
                  onChange={(e) => setRouteNetwork(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Mask"
                  value={routeMask}
                  onChange={(e) => setRouteMask(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Next-hop"
                  value={routeNextHop}
                  onChange={(e) => setRouteNextHop(e.target.value)}
                  className="rounded bg-[#1F2937] px-2 py-1 font-mono text-[10px] text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleAddRoute}
                className="mt-2 flex items-center gap-1 rounded bg-sky-600/80 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-sky-500"
              >
                <Plus className="h-3 w-3" />
                Tambah Route
              </button>

              {/* RIPv2 */}
              <div className="mt-3 pt-2.5 border-t border-gray-800">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ripEnabled}
                    onChange={(e) => setRipEnabled(e.target.checked)}
                    className="accent-violet-500"
                  />
                  <Route className="h-3.5 w-3.5 text-violet-400" />
                  Aktifkan RIPv2 pada router ini
                </label>
                {ripEnabled && (
                  <button
                    onClick={() => {
                      addSimulationLog('INFO', 'Menjalankan konvergensi RIPv2...');
                      void requestRip().catch((err: unknown) => {
                        const message = err instanceof Error ? err.message : String(err);
                        addSimulationLog('ERROR', message === 'SIM_BUSY' ? 'Simulasi lain sedang berjalan.' : `RIP gagal: ${message}`);
                      });
                    }}
                    className="mt-2 rounded bg-violet-600/90 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-violet-500"
                  >
                    Jalankan Konvergensi RIP
                  </button>
                )}
              </div>
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
