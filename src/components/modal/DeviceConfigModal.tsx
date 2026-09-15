import { useState } from 'react';
import type { Node } from '@xyflow/react';
import {
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
import { isValidIp, isValidSubnetMask, networkAddress, ipToNumber, prefixLength, isSameSubnet } from '../../utils/ipUtils';
import { type DeviceData } from '../../types/network';
import { requestDhcp, requestRip } from '../../hooks/useSimulationEngine';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Separator } from '@/components/ui/separator';

export function DeviceConfigModal() {
  const activeConfigModalNodeId = useAppStore((s) => s.activeConfigModalNodeId);
  const nodes = useAppStore((s) => s.nodes);

  const node = nodes.find((n) => n.id === activeConfigModalNodeId);
  if (!activeConfigModalNodeId || !node) return null;

  return <DeviceConfigModalContent key={node.id} node={node} />;
}

function DeviceConfigModalContent({ node }: { node: Node<DeviceData> }) {
  const { setActiveConfigModalNodeId, updatePortConfig, updateDeviceConfig, addSimulationLog, syncWirelessAssociation, revalidateWirelessClients, addStaticRoute, removeStaticRoute } = useAppStore();

  const device = node.data;
  const [selectedPortId, setSelectedPortId] = useState<string>(device.ports[0]?.id || '');
  const selectedPort = device.ports.find((p) => p.id === selectedPortId);
  const isWirelessPort = selectedPort?.kind === 'wireless';

  const [ipAddress, setIpAddress] = useState<string>(selectedPort?.ipAddress || '');
  const [subnetMask, setSubnetMask] = useState<string>(selectedPort?.subnetMask || '255.255.255.0');
  const [ssid, setSsid] = useState<string>(selectedPort?.ssid || '');
  const [defaultGateway, setDefaultGateway] = useState<string>(device.defaultGateway || '');
  const [label, setLabel] = useState<string>(device.label);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // DHCP klien & pool/NAT router
  const [dhcpClient, setDhcpClient] = useState<boolean>(selectedPort?.dhcpEnabled ?? false);
  const routerPool = device.dhcpPools?.[selectedPortId];
  const [poolEnabled, setPoolEnabled] = useState<boolean>(routerPool?.enabled ?? false);
  const [poolNetwork, setPoolNetwork] = useState<string>(routerPool?.network ?? '');
  const [poolMask, setPoolMask] = useState<string>(routerPool?.mask ?? '255.255.255.0');
  const [poolStartIp, setPoolStartIp] = useState<string>(routerPool?.startIp ?? '');
  const [poolMaxClients, setPoolMaxClients] = useState<number>(routerPool?.maxClients ?? 50);
  const [natEnabled, setNatEnabled] = useState<boolean>(selectedPort?.natEnabled ?? false);

  // VLAN (switch port) & sub-interface (router port)
  const [portVlan, setPortVlan] = useState<number>(selectedPort?.vlanId ?? 1);
  const [portMode, setPortMode] = useState<'access' | 'trunk'>(selectedPort?.portMode ?? 'access');
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
    const net = routeNetwork.trim();
    const mask = routeMask.trim();
    const isDefaultRoute = net === '0.0.0.0' && (mask === '0.0.0.0' || mask === '0');
    if (!isValidIp(net) || (!isValidSubnetMask(mask) && !isDefaultRoute)) {
      setErrorMsg('Format network/subnet mask route tidak valid!');
      return;
    }
    if (!isValidIp(routeNextHop.trim())) {
      setErrorMsg('Format next-hop route tidak valid!');
      return;
    }
    addStaticRoute(device.id, {
      network: net,
      subnetMask: isDefaultRoute ? '0.0.0.0' : mask,
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
      const net = networkAddress(ipAddress.trim(), subnetMask.trim());
      const netNum = ipToNumber(net);
      const maskNum = ipToNumber(subnetMask.trim());
      const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;
      const ipNum = ipToNumber(ipAddress.trim());
      const cidr = prefixLength(subnetMask.trim());
      if (ipNum === netNum || ipNum === bcastNum) {
        setErrorMsg(`% Bad mask /${cidr} for address ${ipAddress.trim()}`);
        return;
      }
    }

    if (defaultGateway.trim()) {
      if (!isValidIp(defaultGateway.trim())) {
        setErrorMsg('Format Default Gateway tidak valid!');
        return;
      }
      const hostIp = ipAddress.trim() || selectedPort?.ipAddress;
      const hostMask = subnetMask.trim() || selectedPort?.subnetMask;
      if (hostIp && hostMask && isValidIp(hostIp) && isValidSubnetMask(hostMask)) {
        if (!isSameSubnet(hostIp, defaultGateway.trim(), hostMask)) {
          setErrorMsg(
            `Default Gateway (${defaultGateway.trim()}) harus berada dalam subnet yang sama dengan IP port (${hostIp}/${hostMask})!`
          );
          return;
        }
      }
    }

    if (poolEnabled) {
      if (!isValidIp(poolNetwork) || !isValidSubnetMask(poolMask) || !isValidIp(poolStartIp)) {
        setErrorMsg('Pool DHCP: network/mask/start IP tidak valid!');
        return;
      }
      // BUG-3: startIp wajib berada di dalam network pool (hindari alokasi lintas subnet)
      if (networkAddress(poolStartIp.trim(), poolMask.trim()) !== networkAddress(poolNetwork.trim(), poolMask.trim())) {
        setErrorMsg('Pool DHCP: Start IP berada di luar network pool!');
        return;
      }
    }

    for (const s of subIfs) {
      if (!isValidIp(s.ipAddress) || !isValidSubnetMask(s.subnetMask)) {
        setErrorMsg(`Sub-interface VLAN ${s.vlanId}: IP/mask tidak valid!`);
        return;
      }
      const net = networkAddress(s.ipAddress.trim(), s.subnetMask.trim());
      const netNum = ipToNumber(net);
      const maskNum = ipToNumber(s.subnetMask.trim());
      const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;
      const ipNum = ipToNumber(s.ipAddress.trim());
      const cidr = prefixLength(s.subnetMask.trim());
      if (ipNum === netNum || ipNum === bcastNum) {
        setErrorMsg(`Sub-interface VLAN ${s.vlanId}: % Bad mask /${cidr} for address ${s.ipAddress.trim()}`);
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
          addSimulationLog('INFO', `${label}: SSID radio diubah menjadi "${ssid.trim()}".`);
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
          ...(device.type === 'switch' ? { vlanId: portVlan, portMode } : {}),
        });
        if (dhcpClient) {
          addSimulationLog('INFO', `Meminta IP via DHCP pada ${selectedPort.name}...`);
          void requestDhcp(device.id, selectedPort.id).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            addSimulationLog(
              'ERROR',
              message === 'SIM_BUSY' ? 'Simulasi lain sedang berjalan — ulangi permintaan DHCP.' : `DHCP gagal: ${message}`
            );
          });
        }
      }
    }

    addSimulationLog('SUCCESS', `Konfigurasi tersimpan untuk ${label} (${selectedPort?.name || ''})`);
    setActiveConfigModalNodeId(null);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setActiveConfigModalNodeId(null); }}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-[540px] flex-col gap-0 p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b px-4 sm:px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-5 w-5 text-sky-400" />
            Konfigurasi Perangkat ({device.type.toUpperCase()})
          </DialogTitle>
          <DialogDescription className="sr-only">
            Ubah konfigurasi perangkat {label}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {errorMsg && (
            <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cfg-hostname" className="text-xs">
              Nama Perangkat (Hostname)
            </Label>
            <Input
              id="cfg-hostname"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Tab Port Selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Pilih Port Antarmuka</Label>
            <ToggleGroup
              value={[selectedPortId]}
              onValueChange={(groupValue: string[]) => {
                const next = groupValue[groupValue.length - 1];
                if (next && next !== selectedPortId) handlePortChange(next);
              }}
              className="flex-wrap"
              spacing={4}
            >
              {device.ports.map((port) => (
                <ToggleGroupItem key={port.id} value={port.id} size="sm" className="font-mono">
                  {port.id}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Port Settings Form */}
          {selectedPort && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Port Name:</span>
                <span className="font-mono font-semibold text-emerald-400">{selectedPort.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">MAC Address:</span>
                <span className="font-mono text-foreground">{selectedPort.macAddress}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Link Status:</span>
                <span className={`font-mono font-semibold uppercase ${selectedPort.status === 'up' ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {selectedPort.status}
                </span>
              </div>

              {isWirelessPort ? (
                /* Konfigurasi port nirkabel: SSID */
                <>
                  <Separator />
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cfg-ssid" className="flex items-center gap-1.5 text-xs text-violet-300">
                      <Wifi className="h-3.5 w-3.5" />
                      {device.type === 'accessPoint' ? 'SSID yang Di-broadcast' : 'SSID Access Point Tujuan'}
                    </Label>
                    <Input
                      id="cfg-ssid"
                      type="text"
                      placeholder={device.type === 'accessPoint' ? 'e.g. KantorWiFi' : 'e.g. KantorWiFi (harus sama dengan AP)'}
                      value={ssid}
                      onChange={(e) => setSsid(e.target.value)}
                      className="border-violet-800/60 font-mono text-xs focus-visible:border-violet-500"
                    />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {device.type === 'accessPoint'
                        ? 'Simpan untuk mengubah SSID radio — semua klien yang terasosiasi akan divalidasi ulang otomatis.'
                        : 'Simpan untuk mencari & berasosiasi otomatis dengan AP ber-SSID yang sama. Kosongkan untuk memutus WiFi.'}
                    </p>
                  </div>
                </>
              ) : (
                device.type !== 'switch' &&
                device.type !== 'hub' &&
                device.type !== 'cloud' && (
                  <>
                    {/* DHCP klien: PC/Laptop/Server */}
                    {['pc', 'laptop', 'server'].includes(device.type) && (
                      <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-foreground">
                        <Checkbox checked={dhcpClient} onCheckedChange={(checked) => setDhcpClient(checked === true)} />
                        <Server className="h-3.5 w-3.5 text-sky-400" />
                        Obtain IP via DHCP (otomatis dari router)
                      </label>
                    )}

                    {!dhcpClient && (
                      <>
                        <Separator />
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="cfg-ip" className="text-xs">IPv4 Address</Label>
                          <Input
                            id="cfg-ip"
                            type="text"
                            placeholder="e.g. 192.168.1.10"
                            value={ipAddress}
                            onChange={(e) => setIpAddress(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="cfg-mask" className="text-xs">Subnet Mask</Label>
                          <Input
                            id="cfg-mask"
                            type="text"
                            placeholder="255.255.255.0"
                            value={subnetMask}
                            onChange={(e) => setSubnetMask(e.target.value)}
                            className="font-mono text-xs"
                          />
                        </div>
                      </>
                    )}

                    {/* Router: NAT + DHCP pool per interface */}
                    {device.type === 'router' && (
                      <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-2.5">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <Checkbox checked={natEnabled} onCheckedChange={(checked) => setNatEnabled(checked === true)} />
                          <Globe className="h-3.5 w-3.5 text-sky-400" />
                          NAT/PAT keluar pada interface ini (WAN)
                        </label>

                        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                          <Checkbox checked={poolEnabled} onCheckedChange={(checked) => setPoolEnabled(checked === true)} />
                          <Server className="h-3.5 w-3.5 text-emerald-400" />
                          DHCP Server pada interface ini
                        </label>

                        {poolEnabled && (
                          <div className="grid grid-cols-2 gap-1.5">
                            <Input
                              type="text"
                              aria-label="Network pool DHCP"
                              placeholder="Network (192.168.1.0)"
                              value={poolNetwork}
                              onChange={(e) => setPoolNetwork(e.target.value)}
                              className="font-mono text-[11px]"
                            />
                            <Input
                              type="text"
                              aria-label="Subnet mask pool DHCP"
                              placeholder="Mask (255.255.255.0)"
                              value={poolMask}
                              onChange={(e) => setPoolMask(e.target.value)}
                              className="font-mono text-[11px]"
                            />
                            <Input
                              type="text"
                              aria-label="IP awal pool DHCP"
                              placeholder="Start IP (192.168.1.100)"
                              value={poolStartIp}
                              onChange={(e) => setPoolStartIp(e.target.value)}
                              className="font-mono text-[11px]"
                            />
                            <Input
                              type="number"
                              aria-label="Jumlah maksimum klien pool DHCP"
                              min={1}
                              max={254}
                              placeholder="Max clients"
                              value={poolMaxClients}
                              onChange={(e) => setPoolMaxClients(Number(e.target.value))}
                              className="font-mono text-[11px]"
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
            <div className="rounded-lg border bg-muted/30 p-3.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <Network className="h-3.5 w-3.5" />
                VLAN 802.1Q — {selectedPort.name}
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cfg-vlan-mode" className="text-[11px] text-muted-foreground">Mode Port</Label>
                  <Select value={portMode} onValueChange={(value) => setPortMode(value as 'access' | 'trunk')}>
                    <SelectTrigger id="cfg-vlan-mode" className="w-full font-mono text-xs">
                      <SelectValue>
                        {(value: string | null) => (value === 'trunk' ? 'trunk (semua VLAN)' : value ?? 'access')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="access">access</SelectItem>
                      <SelectItem value="trunk">trunk (semua VLAN)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cfg-vlan-id" className="text-[11px] text-muted-foreground">VLAN ID</Label>
                  <Input
                    id="cfg-vlan-id"
                    type="number"
                    min={1}
                    max={4094}
                    disabled={portMode === 'trunk'}
                    value={portVlan}
                    onChange={(e) => setPortVlan(Number(e.target.value))}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Port access hanya berkomunikasi dengan port se-VLAN; port trunk membawa semua VLAN.
              </p>
            </div>
          )}

          {/* Sub-interface router (router-on-a-stick) */}
          {selectedPort && device.type === 'router' && (
            <div className="rounded-lg border bg-muted/30 p-3.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                <Network className="h-3.5 w-3.5" />
                Sub-interface VLAN (router-on-a-stick) — {selectedPort.name}
              </Label>
              {subIfs.length === 0 && (
                <div className="mb-1.5 mt-2 text-[11px] text-muted-foreground">Belum ada sub-interface.</div>
              )}
              <div className="mb-2 flex flex-col gap-1">
                {subIfs.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-md border bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
                  >
                    <span>
                      VLAN {s.vlanId}: {s.ipAddress}/{s.subnetMask}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Hapus sub-interface VLAN ${s.vlanId}`}
                      onClick={() => setSubIfs(subIfs.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Input
                  type="number"
                  aria-label="VLAN ID sub-interface"
                  min={1}
                  max={4094}
                  placeholder="VLAN"
                  value={subVlan}
                  onChange={(e) => setSubVlan(e.target.value)}
                  className="font-mono text-[11px]"
                />
                <Input
                  type="text"
                  aria-label="IP sub-interface"
                  placeholder="IP (192.168.10.1)"
                  value={subIp}
                  onChange={(e) => setSubIp(e.target.value)}
                  className="font-mono text-[11px]"
                />
                <Input
                  type="text"
                  aria-label="Subnet mask sub-interface"
                  placeholder="Mask"
                  value={subMask}
                  onChange={(e) => setSubMask(e.target.value)}
                  className="font-mono text-[11px]"
                />
              </div>
              <Button
                variant="secondary"
                size="xs"
                className="mt-2 text-sky-300"
                onClick={() => {
                  const vlan = Number(subVlan);
                  if (!vlan || vlan < 1 || vlan > 4094 || !isValidIp(subIp) || !isValidSubnetMask(subMask)) {
                    setErrorMsg('Sub-interface: VLAN/IP/mask tidak valid!');
                    return;
                  }
                  const net = networkAddress(subIp.trim(), subMask.trim());
                  const netNum = ipToNumber(net);
                  const maskNum = ipToNumber(subMask.trim());
                  const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;
                  const ipNum = ipToNumber(subIp.trim());
                  const cidr = prefixLength(subMask.trim());
                  if (ipNum === netNum || ipNum === bcastNum) {
                    setErrorMsg(`Sub-interface VLAN ${vlan}: % Bad mask /${cidr} for address ${subIp.trim()}`);
                    return;
                  }
                  setSubIfs([...subIfs, { vlanId: vlan, ipAddress: subIp.trim(), subnetMask: subMask.trim() }]);
                  setSubVlan('');
                  setSubIp('');
                  setErrorMsg('');
                }}
              >
                <Plus data-icon="inline-start" />
                Tambah Sub-interface
              </Button>
            </div>
          )}

          {/* Default Gateway untuk end device */}
          {['pc', 'laptop', 'server'].includes(device.type) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cfg-gateway" className="text-xs">
                Default Gateway
              </Label>
              <Input
                id="cfg-gateway"
                type="text"
                placeholder="e.g. 192.168.1.1"
                value={defaultGateway}
                onChange={(e) => setDefaultGateway(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Static Route editor (router) */}
          {device.type === 'router' && (
            <div className="rounded-lg border bg-muted/30 p-3.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-sky-300">
                <Route className="h-3.5 w-3.5" />
                Static Route (termasuk default route 0.0.0.0/0 untuk internet)
              </Label>
              <div className="mb-2.5 mt-2 flex flex-col gap-1.5">
                {(device.routes ?? []).length === 0 && (
                  <span className="text-[11px] text-muted-foreground">Belum ada static route.</span>
                )}
                {(device.routes ?? []).map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-md border bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground"
                  >
                    <span>
                      {r.network}/{r.subnetMask} → {r.nextHop}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Hapus route"
                      onClick={() => removeStaticRoute(device.id, idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Input
                  type="text"
                  aria-label="Network static route"
                  placeholder="Network"
                  value={routeNetwork}
                  onChange={(e) => setRouteNetwork(e.target.value)}
                  className="font-mono text-[11px]"
                />
                <Input
                  type="text"
                  aria-label="Subnet mask static route"
                  placeholder="Mask"
                  value={routeMask}
                  onChange={(e) => setRouteMask(e.target.value)}
                  className="font-mono text-[11px]"
                />
                <Input
                  type="text"
                  aria-label="Next-hop static route"
                  placeholder="Next-hop"
                  value={routeNextHop}
                  onChange={(e) => setRouteNextHop(e.target.value)}
                  className="font-mono text-[11px]"
                />
              </div>
              <Button variant="secondary" size="xs" className="mt-2 text-sky-300" onClick={handleAddRoute}>
                <Plus data-icon="inline-start" />
                Tambah Route
              </Button>

              {/* RIPv2 */}
              <div className="mt-3 border-t pt-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <Checkbox checked={ripEnabled} onCheckedChange={(checked) => setRipEnabled(checked === true)} />
                  <Route className="h-3.5 w-3.5 text-violet-400" />
                  Aktifkan RIPv2 pada router ini
                </label>
                {ripEnabled && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="mt-2 text-violet-300"
                    onClick={() => {
                      addSimulationLog('INFO', 'Menjalankan konvergensi RIPv2...');
                      void requestRip().catch((err: unknown) => {
                        const message = err instanceof Error ? err.message : String(err);
                        addSimulationLog('ERROR', message === 'SIM_BUSY' ? 'Simulasi lain sedang berjalan.' : `RIP gagal: ${message}`);
                      });
                    }}
                  >
                    Jalankan Konvergensi RIP
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => setActiveConfigModalNodeId(null)}>
            Batal
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save data-icon="inline-start" />
            Simpan Konfigurasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
