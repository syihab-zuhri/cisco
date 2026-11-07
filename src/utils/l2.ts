import { type DeviceData, type PhysicalPort, isL2Intermediate } from '../types/network';

export function isTrunkPort(port: PhysicalPort): boolean {
  return port.portMode === 'trunk' || (port.subInterfaces?.length ?? 0) > 0;
}

/** Aturan VLAN yang sama untuk simulasi dan diagnostik konfigurasi. */
export function checkL2VlanHop(
  srcDev: DeviceData,
  srcPort: PhysicalPort,
  dstDev: DeviceData,
  dstPort: PhysicalPort,
  currentVlan?: number
): { allowed: boolean; nextVlan?: number } {
  let wireVlan = currentVlan;

  // Larangan isolasi: dua port access switch dengan VLAN berbeda saling menolak
  if (
    srcDev.type === 'switch' &&
    dstDev.type === 'switch' &&
    !isTrunkPort(srcPort) &&
    !isTrunkPort(dstPort) &&
    (srcPort.vlanId ?? 1) !== (dstPort.vlanId ?? 1)
  ) {
    return { allowed: false };
  }

  // 1. Egress dari srcDev
  if (srcDev.type === 'switch') {
    const isTrunk = isTrunkPort(srcPort);
    if (isTrunk) {
      wireVlan = currentVlan;
    } else {
      const accessVlan = srcPort.vlanId ?? 1;
      // Frame hanya boleh keluar dari access port yang VLAN-nya cocok
      if (currentVlan !== undefined && currentVlan !== accessVlan) {
        return { allowed: false };
      }
      // Access port melepas tag 802.1Q saat keluar ke kabel
      wireVlan = undefined;
    }
  } else {
    // Non-switch (Host / Router):
    if (wireVlan === undefined && srcPort.vlanId) {
      wireVlan = srcPort.vlanId;
    }
  }

  // 2. Ingress ke dstDev
  if (dstDev.type === 'switch') {
    const isTrunk = isTrunkPort(dstPort);
    if (isTrunk) {
      const ingressVlan = wireVlan !== undefined ? wireVlan : (dstPort.vlanId ?? 1);
      return { allowed: true, nextVlan: ingressVlan };
    } else {
      const accessVlan = dstPort.vlanId ?? 1;
      // Port access switch menolak frame ber-tag yang berbeda VLAN
      if (wireVlan !== undefined && wireVlan !== accessVlan) {
        return { allowed: false };
      }
      // Frame untagged dimasukkan ke VLAN access port
      return { allowed: true, nextVlan: accessVlan };
    }
  }

  // L2 intermediate non-switch (hub, AP): transparan
  if (isL2Intermediate(dstDev.type)) {
    return { allowed: true, nextVlan: wireVlan };
  }

  // Host tujuan atau Router (dengan sub-interfaces / trunk)
  if (isTrunkPort(dstPort)) {
    return { allowed: true, nextVlan: wireVlan };
  }

  // Host biasa (PC / Laptop / Server):
  if (dstPort.vlanId && wireVlan !== undefined && dstPort.vlanId !== wireVlan) {
    return { allowed: false };
  }

  return { allowed: true, nextVlan: wireVlan };
}
