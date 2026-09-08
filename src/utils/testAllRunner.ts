import { HeadlessSimulationEngine } from '../engine/simulationEngine';
import {
  type DeviceData,
  type TopologyLink,
  isHostType,
} from '../types/network';

/** Suite tes yang bisa dipilih di panel Test All. */
export type TestSuiteId = 'ping' | 'gateway' | 'dhcp' | 'rip';

export const TEST_SUITES: Array<{ id: TestSuiteId; title: string; hint: string }> = [
  { id: 'ping', title: 'Ping Matrix', hint: 'Setiap host ber-IP ping ke semua IP lain' },
  { id: 'gateway', title: 'Gateway', hint: 'Setiap host ping default gateway-nya' },
  { id: 'dhcp', title: 'DHCP', hint: 'Status port dhcpEnabled: sudah dapat IP / belum' },
  { id: 'rip', title: 'RIP', hint: 'Konvergensi RIPv2 di semua router ripEnabled' },
];

export interface PingPair {
  sourceId: string;
  sourceLabel: string;
  sourceIp: string;
  targetIp: string;
  targetLabel: string | null;
}

export interface GatewayTarget {
  sourceId: string;
  sourceLabel: string;
  sourceIp: string;
  gateway: string;
}

export interface DhcpTarget {
  nodeId: string;
  label: string;
  portId: string;
  portName: string;
}

/** Daftar pasangan ping untuk suite Ping Matrix (dibangun dari snapshot terbaru). */
export function buildPingPairs(devices: DeviceData[]): PingPair[] {
  const owners = collectIpOwners(devices);
  const pairs: PingPair[] = [];
  for (const src of owners) {
    const srcDev = devices.find((d) => d.id === src.deviceId);
    if (!srcDev || !(isHostType(srcDev.type) || srcDev.type === 'router')) continue;
    for (const dst of owners) {
      if (src.ip === dst.ip) continue;
      pairs.push({
        sourceId: src.deviceId,
        sourceLabel: src.label,
        sourceIp: src.ip,
        targetIp: dst.ip,
        targetLabel: dst.label,
      });
    }
  }
  return pairs;
}

/** Daftar target gateway untuk suite Gateway (dibangun dari snapshot terbaru). */
export function buildGatewayTargets(devices: DeviceData[]): GatewayTarget[] {
  const targets: GatewayTarget[] = [];
  for (const dev of devices) {
    if (dev.nodeKind && dev.nodeKind !== 'device') continue;
    if (!isHostType(dev.type) || !dev.defaultGateway) continue;
    const srcPort = dev.ports.find((p) => p.ipAddress);
    if (!srcPort?.ipAddress) continue;
    targets.push({
      sourceId: dev.id,
      sourceLabel: dev.label,
      sourceIp: srcPort.ipAddress,
      gateway: dev.defaultGateway,
    });
  }
  return targets;
}

/** Daftar port DHCP yang belum dapat IP (dibangun dari snapshot terbaru). */
export function buildDhcpTargets(devices: DeviceData[]): DhcpTarget[] {
  const targets: DhcpTarget[] = [];
  for (const dev of devices) {
    if (dev.nodeKind && dev.nodeKind !== 'device') continue;
    for (const p of dev.ports) {
      if (p.dhcpEnabled && !p.ipAddress) {
        targets.push({ nodeId: dev.id, label: dev.label, portId: p.id, portName: p.name });
      }
    }
  }
  return targets;
}
export interface PingMatrixRow {
  sourceId: string;
  sourceLabel: string;
  sourceIp: string;
  targetIp: string;
  targetLabel: string | null;
  success: boolean;
  rttMs: number;
  ttl: number;
  error: string | null;
}

export interface GatewayRow {
  sourceId: string;
  sourceLabel: string;
  sourceIp: string;
  gateway: string;
  success: boolean;
  error: string | null;
}

export interface DhcpRow {
  nodeId: string;
  label: string;
  portId: string;
  portName: string;
  status: 'ok' | 'missing-ip' | 'static';
  ipAddress?: string;
}

export interface TestAllResult {
  pingRows: PingMatrixRow[];
  gatewayRows: GatewayRow[];
  dhcpRows: DhcpRow[];
  ripRoutesAdded: number | null;
  ripOutput: string[];
  pingPass: number;
  pingFail: number;
  gatewayPass: number;
  gatewayFail: number;
}

interface IpOwner {
  deviceId: string;
  label: string;
  ip: string;
}

/** Kumpulkan semua IP unik milik perangkat (port + sub-interface). */
function collectIpOwners(devices: DeviceData[]): IpOwner[] {
  const owners: IpOwner[] = [];
  const seen = new Set<string>();
  for (const dev of devices) {
    if (dev.nodeKind && dev.nodeKind !== 'device') continue;
    for (const p of dev.ports) {
      if (p.ipAddress && !seen.has(p.ipAddress)) {
        seen.add(p.ipAddress);
        owners.push({ deviceId: dev.id, label: dev.label, ip: p.ipAddress });
      }
      for (const s of p.subInterfaces ?? []) {
        if (s.ipAddress && !seen.has(s.ipAddress)) {
          seen.add(s.ipAddress);
          owners.push({ deviceId: dev.id, label: `${dev.label}.${s.vlanId}`, ip: s.ipAddress });
        }
      }
    }
  }
  return owners;
}

/**
 * Jalankan semua suite yang dipilih secara sinkron memakai engine headless
 * langsung (tanpa worker/antrean animasi) sehingga ratusan pasangan bisa
 * diuji dalam sekali klik. State CAM/ARP terakumulasi antar pasangan seperti
 * jaringan nyata. Tidak memutasi store — hanya membaca snapshot topologi.
 */
export function runTestAll(
  devices: DeviceData[],
  links: TopologyLink[],
  suites: TestSuiteId[]
): TestAllResult {
  const result: TestAllResult = {
    pingRows: [],
    gatewayRows: [],
    dhcpRows: [],
    ripRoutesAdded: null,
    ripOutput: [],
    pingPass: 0,
    pingFail: 0,
    gatewayPass: 0,
    gatewayFail: 0,
  };

  const engine = new HeadlessSimulationEngine();
  engine.setTopology(devices, links);

  // Jalankan konvergensi routing (RIP) terlebih dahulu agar rute terisi sebelum pengujian konektivitas
  if (suites.includes('rip')) {
    const hasRip = devices.some((d) => d.type === 'router' && d.ripEnabled);
    if (hasRip) {
      const plan = engine.planRip();
      result.ripRoutesAdded = Number(/(\d+)/.exec(plan.summary.outputLines[0])?.[1] ?? 0);
      result.ripOutput = plan.summary.outputLines;
    } else {
      result.ripOutput = ['Tidak ada router dengan RIP aktif — suite dilewati.'];
    }
  }

  if (suites.includes('dhcp')) {
    for (const dev of devices) {
      if (dev.nodeKind && dev.nodeKind !== 'device') continue;
      for (const p of dev.ports) {
        if (p.dhcpEnabled) {
          result.dhcpRows.push({
            nodeId: dev.id,
            label: dev.label,
            portId: p.id,
            portName: p.name,
            status: p.ipAddress ? 'ok' : 'missing-ip',
            ipAddress: p.ipAddress,
          });
        } else if (!p.ipAddress && isHostType(dev.type) && (p.kind ?? 'ethernet') === 'ethernet') {
          // Host tanpa IP statis maupun DHCP = konfigurasi belum lengkap.
          result.dhcpRows.push({
            nodeId: dev.id,
            label: dev.label,
            portId: p.id,
            portName: p.name,
            status: 'static',
          });
        }
      }
    }
  }

  if (suites.includes('gateway')) {
    for (const dev of devices) {
      if (dev.nodeKind && dev.nodeKind !== 'device') continue;
      if (!isHostType(dev.type) || !dev.defaultGateway) continue;
      const srcPort = dev.ports.find((p) => p.ipAddress);
      if (!srcPort?.ipAddress) continue;
      const plan = engine.planPing(dev.id, dev.defaultGateway, {
        echoCount: 1,
        outputStyle: 'windows',
      });
      const ok = plan.summary.success;
      if (ok) result.gatewayPass += 1;
      else result.gatewayFail += 1;
      result.gatewayRows.push({
        sourceId: dev.id,
        sourceLabel: dev.label,
        sourceIp: srcPort.ipAddress,
        gateway: dev.defaultGateway,
        success: ok,
        error: ok ? null : (plan.summary.outputLines.at(-1) ?? 'Gateway tak terjangkau'),
      });
    }
  }

  if (suites.includes('ping')) {
    const owners = collectIpOwners(devices);
    const sources = owners.filter((o) => {
      const dev = devices.find((d) => d.id === o.deviceId);
      return dev && (isHostType(dev.type) || dev.type === 'router');
    });
    for (const src of sources) {
      for (const dst of owners) {
        if (src.ip === dst.ip) continue;
        const plan = engine.planPing(
          findNodeByIp(devices, src.ip) ?? src.deviceId,
          dst.ip,
          { echoCount: 1, outputStyle: 'windows' }
        );
        const ok = plan.summary.success;
        if (ok) result.pingPass += 1;
        else result.pingFail += 1;
        result.pingRows.push({
          sourceId: src.deviceId,
          sourceLabel: src.label,
          sourceIp: src.ip,
          targetIp: dst.ip,
          targetLabel: dst.label,
          success: ok,
          rttMs: plan.summary.rttMs,
          ttl: plan.summary.ttl,
          error: ok ? null : (plan.summary.outputLines.at(-1) ?? 'Ping gagal'),
        });
      }
    }
  }

  return result;
}

/** Cari node pemilik IP (untuk source ping matrix multi-IP). */
function findNodeByIp(devices: DeviceData[], ip: string): string | null {
  for (const dev of devices) {
    if (
      dev.ports.some(
        (p) => p.ipAddress === ip || p.subInterfaces?.some((s) => s.ipAddress === ip)
      )
    ) {
      return dev.id;
    }
  }
  return null;
}
