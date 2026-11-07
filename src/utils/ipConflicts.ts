import { type DeviceData, type PhysicalPort, type TopologyLink, isL2Intermediate } from '../types/network';
import { isValidIp } from './ipUtils';
import { checkL2VlanHop } from './l2';

interface AddressOwner {
  nodeId: string;
  label: string;
  portId: string;
  vlanId?: number;
}

export interface IpConflict {
  key: string;
  address: string;
  first: AddressOwner;
  second: AddressOwner;
}

/**
 * Konflik konfigurasi pada domain L2 yang sama. Port DOWN tetap diperiksa
 * karena interface nonaktif masih dapat menyimpan alamat yang bertabrakan.
 * Penelusuran berhenti di router dan tidak mengubah data perangkat.
 */
export function findIpConflicts(devices: DeviceData[], links: TopologyLink[]): IpConflict[] {
  const byId = new Map(devices.filter((d) => (d.nodeKind ?? 'device') === 'device').map((d) => [d.id, d]));
  const byAddress = new Map<string, AddressOwner[]>();
  for (const device of byId.values()) {
    for (const port of device.ports) {
      const addresses = [
        { ipAddress: port.ipAddress, vlanId: port.vlanId },
        ...(port.subInterfaces ?? []),
      ];
      for (const address of addresses) {
        if (!address.ipAddress || !isValidIp(address.ipAddress)) continue;
        const ip = address.ipAddress.trim();
        const owners = byAddress.get(ip) ?? [];
        owners.push({ nodeId: device.id, label: device.label, portId: port.id, vlanId: address.vlanId });
        byAddress.set(ip, owners);
      }
    }
  }

  const byPort = new Map<string, TopologyLink[]>();
  const portKey = (nodeId: string, portId: string) => JSON.stringify([nodeId, portId]);
  for (const link of links) {
    for (const [nodeId, portId] of [[link.sourceNodeId, link.sourcePortId], [link.targetNodeId, link.targetPortId]]) {
      const key = portKey(nodeId, portId);
      const list = byPort.get(key) ?? [];
      list.push(link);
      byPort.set(key, list);
    }
  }

  const sharesSegment = (source: AddressOwner, target: AddressOwner): boolean => {
    const queue: Array<{ nodeId: string; portId: string; vlanId?: number }> = [source];
    const visited = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      const visitKey = JSON.stringify([current.nodeId, current.portId, current.vlanId]);
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);
      const device = byId.get(current.nodeId);
      const port = device?.ports.find((p) => p.id === current.portId);
      if (!device || !port) continue;
      for (const link of byPort.get(portKey(device.id, port.id)) ?? []) {
        const forward = link.sourceNodeId === device.id && link.sourcePortId === port.id;
        const peer = byId.get(forward ? link.targetNodeId : link.sourceNodeId);
        const peerPort: PhysicalPort | undefined = peer?.ports.find((p) => p.id === (forward ? link.targetPortId : link.sourcePortId));
        if (!peer || !peerPort) continue;
        if (port.ssid && peerPort.ssid && port.ssid.trim() !== peerPort.ssid.trim()) continue;
        const hop = checkL2VlanHop(device, port, peer, peerPort, current.vlanId);
        if (!hop.allowed) continue;
        if (peer.id === target.nodeId && peerPort.id === target.portId && (target.vlanId === undefined || hop.nextVlan === target.vlanId)) return true;
        if (isL2Intermediate(peer.type)) {
          for (const out of peer.ports) queue.push({ nodeId: peer.id, portId: out.id, vlanId: hop.nextVlan });
        }
      }
    }
    return false;
  };

  const ownerKey = (owner: AddressOwner) => JSON.stringify([owner.nodeId, owner.portId, owner.vlanId]);
  const conflicts: IpConflict[] = [];
  for (const [address, owners] of byAddress) {
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const first = owners[i];
        const second = owners[j];
        if (sharesSegment(first, second)) {
          conflicts.push({ key: JSON.stringify([address, ...[ownerKey(first), ownerKey(second)].sort()]), address, first, second });
        }
      }
    }
  }
  return conflicts;
}
