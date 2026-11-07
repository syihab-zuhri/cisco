import type { DeviceData, RoutingEntry } from '../types/network';
import { isValidIp, isValidSubnetMask, networkAddress } from './ipUtils';

/** Connected routes diturunkan dari konfigurasi aktif, tidak disimpan dua kali di state. */
export function getDeviceRoutes(device: DeviceData): RoutingEntry[] {
  const connected: RoutingEntry[] = [];
  for (const port of device.ports) {
    if (port.status !== 'up') continue;
    const interfaces = [
      { ipAddress: port.ipAddress, subnetMask: port.subnetMask, interfaceId: port.id },
      ...(port.subInterfaces ?? []).map((s) => ({ ...s, interfaceId: `${port.id}.${s.vlanId}` })),
    ];
    for (const iface of interfaces) {
      if (!iface.ipAddress || !iface.subnetMask || !isValidIp(iface.ipAddress) || !isValidSubnetMask(iface.subnetMask)) continue;
      connected.push({
        network: networkAddress(iface.ipAddress, iface.subnetMask),
        subnetMask: iface.subnetMask,
        nextHop: 'Directly Connected',
        interfaceId: iface.interfaceId,
        source: 'connected',
      });
    }
  }
  return [...connected, ...(device.routes ?? []).filter((r) => r.source !== 'connected')];
}

export function routeInterfaceName(device: DeviceData, interfaceId: string): string {
  const direct = device.ports.find((p) => p.id === interfaceId);
  if (direct) return direct.name;
  const parent = device.ports.find((p) => interfaceId.startsWith(`${p.id}.`));
  return parent ? `${parent.name}${interfaceId.slice(parent.id.length)}` : interfaceId;
}
