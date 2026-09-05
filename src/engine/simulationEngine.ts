import {
  type DeviceData,
  type PhysicalPort,
  type TopologyLink,
  isL2Intermediate,
} from '../types/network';
import { isSameSubnet, prefixLength } from '../utils/ipUtils';
import { type WorkerUIMessage } from '../types/ipc';

type LogLevel = 'INFO' | 'ARP' | 'ICMP' | 'ERROR' | 'SUCCESS';

/** TTL awal Windows/iOS default (Packet Tracer memakai 128). */
const INITIAL_TTL = 128;

interface L2Hop {
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface PingOptions {
  /** Jumlah ICMP echo (Windows default 4, IOS default 5). */
  echoCount?: number;
  /** Format output: 'windows' (PC) atau 'ios' (terminal Cisco). */
  outputStyle?: 'windows' | 'ios';
}

export interface PingSummary {
  success: boolean;
  rttMs: number;
  ttl: number;
  logs: string[];
  outputLines: string[];
  sent: number;
  received: number;
}

interface EchoOutcome {
  ok: boolean;
  rttMs: number;
  replyTtl: number;
  error?: string;
}

export class HeadlessSimulationEngine {
  private devices: Map<string, DeviceData> = new Map();
  private links: TopologyLink[] = [];
  private packetSeq = 0;
  private onHopCallback?: (event: WorkerUIMessage) => Promise<void> | void;
  private onLogCallback?: (level: LogLevel, message: string) => void;

  constructor(
    onHop?: (event: WorkerUIMessage) => Promise<void> | void,
    onLog?: (level: LogLevel, message: string) => void
  ) {
    this.onHopCallback = onHop;
    this.onLogCallback = onLog;
  }

  public setTopology(nodes: DeviceData[], links: TopologyLink[]): void {
    this.devices.clear();
    for (const n of nodes) {
      this.devices.set(n.id, {
        ...n,
        arpTable: { ...(n.arpTable || {}) },
        macTable: { ...(n.macTable || {}) },
      });
    }
    this.links = links.map((l) => ({ ...l }));
  }

  public getDevices(): DeviceData[] {
    return Array.from(this.devices.values());
  }

  private log(level: LogLevel, message: string) {
    this.onLogCallback?.(level, message);
  }

  private async emitHop(
    hop: L2Hop,
    type: 'ARP_REQ' | 'ARP_REP' | 'ICMP_REQ' | 'ICMP_REP',
    currentProtocol: 'ARP' | 'ICMP',
    summary: string
  ): Promise<void> {
    if (!this.onHopCallback) return;
    await this.onHopCallback({
      type: 'SIMULATION_STEP',
      payload: {
        packetId: `pkt-${++this.packetSeq}`,
        sourceNodeId: hop.fromNodeId,
        targetNodeId: hop.toNodeId,
        sourcePortId: hop.fromPortId,
        targetPortId: hop.toPortId,
        type,
        currentProtocol,
        summary,
      },
    });
  }

  private findLink(nodeId: string, portId: string): TopologyLink | null {
    for (const link of this.links) {
      if (link.sourceNodeId === nodeId && link.sourcePortId === portId) return link;
      if (link.targetNodeId === nodeId && link.targetPortId === portId) return link;
    }
    return null;
  }

  /** Membalik arah jalur L2 (hop endpoint ditukar), untuk transmisi balik. */
  private reversePath(path: L2Hop[]): L2Hop[] {
    return [...path]
      .reverse()
      .map((h) => ({
        fromNodeId: h.toNodeId,
        fromPortId: h.toPortId,
        toNodeId: h.fromNodeId,
        toPortId: h.fromPortId,
      }));
  }

  /**
   * Menemukan rute Layer 2 antar host/switch menggunakan BFS.
   * Hanya switch yang bisa menjadi hop antara (sesuai skoped P0: 1 router).
   */
  private findL2Path(startNodeId: string, targetNodeId: string): L2Hop[] | null {
    if (startNodeId === targetNodeId) return [];

    const queue: Array<{ currentNodeId: string; path: L2Hop[] }> = [
      { currentNodeId: startNodeId, path: [] },
    ];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const { currentNodeId, path } = queue.shift()!;
      const dev = this.devices.get(currentNodeId);
      if (!dev) continue;

      for (const p of dev.ports) {
        if (p.status !== 'up') continue;
        const link = this.findLink(currentNodeId, p.id);
        if (!link) continue;

        const peerNodeId =
          link.sourceNodeId === currentNodeId ? link.targetNodeId : link.sourceNodeId;
        const peerPortId =
          link.sourceNodeId === currentNodeId ? link.targetPortId : link.sourcePortId;
        const hop: L2Hop = {
          fromNodeId: currentNodeId,
          fromPortId: p.id,
          toNodeId: peerNodeId,
          toPortId: peerPortId,
        };

        if (peerNodeId === targetNodeId) return [...path, hop];

        const peerDev = this.devices.get(peerNodeId);
        // Switch maupun hub dapat menjadi hop antara di jalur Layer-2
        if (peerDev && isL2Intermediate(peerDev.type) && !visited.has(peerDev.id)) {
          visited.add(peerDev.id);
          queue.push({ currentNodeId: peerDev.id, path: [...path, hop] });
        }
      }
    }
    return null;
  }

  private resolveOwner(ip: string): { dev: DeviceData; port: PhysicalPort } | null {
    for (const dev of this.devices.values()) {
      const port = dev.ports.find((p) => p.ipAddress === ip);
      if (port) return { dev, port };
    }
    return null;
  }

  private chooseSourcePort(dev: DeviceData, targetIp: string): PhysicalPort | null {
    const configured = dev.ports.filter((p) => p.ipAddress && p.subnetMask);
    if (configured.length === 0) return null;
    return (
      configured.find((p) => isSameSubnet(p.ipAddress!, targetIp, p.subnetMask!)) ??
      configured[0]
    );
  }

  /**
   * Keputusan L3 perangkat pengirim: langsung, via gateway, atau (router)
   * via routing table (longest-prefix match atas connected network + static route).
   */
  private resolveNextHopIp(
    dev: DeviceData,
    fromPort: PhysicalPort,
    targetIp: string
  ): { nextHopIp: string } | { error: string } {
    if (dev.type === 'router') {
      let best: { nextHopIp: string; prefix: number } | null = null;
      for (const p of dev.ports) {
        if (!p.ipAddress || !p.subnetMask || p.status !== 'up') continue;
        if (isSameSubnet(p.ipAddress, targetIp, p.subnetMask)) {
          const prefix = prefixLength(p.subnetMask);
          if (!best || prefix > best.prefix) best = { nextHopIp: targetIp, prefix };
        }
      }
      for (const r of dev.routes ?? []) {
        if (isSameSubnet(targetIp, r.network, r.subnetMask)) {
          const prefix = prefixLength(r.subnetMask);
          if (!best || prefix > best.prefix) best = { nextHopIp: r.nextHop, prefix };
        }
      }
      if (!best) {
        return {
          error: `${dev.label}: No route to host ${targetIp} (tidak ada connected network / static route). Destination Unreachable.`,
        };
      }
      return { nextHopIp: best.nextHopIp };
    }

    // Host (PC / switch management)
    if (isSameSubnet(fromPort.ipAddress!, targetIp, fromPort.subnetMask!)) {
      return { nextHopIp: targetIp };
    }
    if (!dev.defaultGateway) {
      return {
        error: `${dev.label}: Destination host ${targetIp} di luar subnet, dan Default Gateway belum dikonfigurasi!`,
      };
    }
    return { nextHopIp: dev.defaultGateway };
  }

  /**
   * Resolusi RFC 826: cek ARP cache, kalau miss pancarkan ARP Request
   * sepanjang jalur L2 (switch belajar CAM), hanya pemilik IP yang membalas.
   */
  private async resolveArp(
    sender: { dev: DeviceData; port: PhysicalPort },
    nextHopIp: string,
    owner: { dev: DeviceData; port: PhysicalPort },
    path: L2Hop[],
    animate: boolean
  ): Promise<void> {
    sender.dev.arpTable = sender.dev.arpTable || {};
    const cached = sender.dev.arpTable[nextHopIp];
    if (cached) {
      if (animate) {
        this.log('ARP', `${sender.dev.label}: ARP Cache HIT: ${nextHopIp} -> ${cached}`);
      }
      return;
    }

    this.log(
      'ARP',
      `${sender.dev.label}: ARP Cache MISS untuk IP ${nextHopIp}. Memancarkan ARP Request (Broadcast)...`
    );

    if (animate) {
      for (const hop of path) {
        await this.emitHop(
          hop,
          'ARP_REQ',
          'ARP',
          `ARP Request: Who has ${nextHopIp}? Tell ${sender.port.ipAddress}`
        );
      }
    }

    for (const hop of path) {
      const sw = this.devices.get(hop.toNodeId);
      if (sw && sw.type === 'switch') {
        sw.macTable = sw.macTable || {};
        if (!sw.macTable[sender.port.macAddress]) {
          sw.macTable[sender.port.macAddress] = hop.toPortId;
          if (animate) {
            this.log(
              'INFO',
              `${sw.label}: CAM Table belajar MAC ${sender.port.macAddress} pada port ${hop.toPortId}`
            );
          }
        }
      }
    }

    owner.dev.arpTable = owner.dev.arpTable || {};
    owner.dev.arpTable[sender.port.ipAddress!] = sender.port.macAddress;

    if (animate) {
      this.log('ARP', `${owner.dev.label}: IP cocok (${nextHopIp})! Mengirimkan ARP Reply (Unicast)...`);
      const backwardPath = this.reversePath(path);
      for (const hop of backwardPath) {
        await this.emitHop(
          hop,
          'ARP_REP',
          'ARP',
          `ARP Reply: ${nextHopIp} is at ${owner.port.macAddress}`
        );
        const sw = this.devices.get(hop.toNodeId);
        if (sw && sw.type === 'switch') {
          sw.macTable = sw.macTable || {};
          sw.macTable[owner.port.macAddress] = sw.macTable[owner.port.macAddress] ?? hop.toPortId;
          this.log(
            'INFO',
            `${sw.label}: CAM Table belajar MAC ${owner.port.macAddress} pada port ${hop.toPortId}`
          );
        }
      }
    }

    sender.dev.arpTable[nextHopIp] = owner.port.macAddress;
    this.log('ARP', `${sender.dev.label}: ARP Cache diperbarui: ${nextHopIp} -> ${owner.port.macAddress}`);
  }

  /** Satu siklus ICMP Echo Request -> Reply (bolak-balik), dengan TTL & hop router. */
  private async echoOnce(
    source: { dev: DeviceData; port: PhysicalPort },
    targetIp: string,
    animate: boolean
  ): Promise<EchoOutcome> {
    // Ping ke IP sendiri (loopback interface)
    if (source.port.ipAddress === targetIp) {
      return { ok: true, rttMs: 0, replyTtl: INITIAL_TTL };
    }

    let sender = source;
    let ttl = INITIAL_TTL;
    const visitedRouters = new Set<string>();
    const requestPath: L2Hop[] = [];

    // Fase request: bisa melewati beberapa router (max depth dijaga visitedRouters)
    for (let depth = 0; depth < 8; depth++) {
      const next = this.resolveNextHopIp(sender.dev, sender.port, targetIp);
      if ('error' in next) return { ok: false, rttMs: 0, replyTtl: 0, error: next.error };

      const owner = this.resolveOwner(next.nextHopIp);
      if (!owner) {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `ARP Request timeout: Destination IP ${next.nextHopIp} tidak ditemukan di topologi.`,
        };
      }

      const path = this.findL2Path(sender.dev.id, owner.dev.id);
      if (!path) {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `Tidak ada jalur fisik/Layer-2 antara ${sender.dev.label} dan ${owner.dev.label}.`,
        };
      }

      await this.resolveArp(sender, next.nextHopIp, owner, path, animate);

      if (animate) {
        for (const hop of path) {
          await this.emitHop(
            hop,
            'ICMP_REQ',
            'ICMP',
            `ICMP Echo Request: ${source.port.ipAddress} -> ${targetIp}${depth > 0 ? ' (diteruskan router)' : ''}`
          );
        }
      }
      requestPath.push(...path);

      if (next.nextHopIp === targetIp) {
        // Sampai di host tujuan — buat Echo Reply
        const routerCount = this.countInteriorRouters(requestPath);
        const replyTtl = INITIAL_TTL - routerCount;
        const returnPath = this.reversePath(requestPath);

        this.log('ICMP', `${owner.dev.label}: Menerima Echo Request. Membalas dengan ICMP Echo Reply...`);
        if (animate) {
          for (const hop of returnPath) {
            await this.emitHop(
              hop,
              'ICMP_REP',
              'ICMP',
              `ICMP Echo Reply: ${targetIp} -> ${source.port.ipAddress}`
            );
          }
        }
        return { ok: true, rttMs: routerCount, replyTtl };
      }

      // Transit: pemilik nextHopIp haruslah router
      const router = owner.dev;
      if (router.type !== 'router') {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `${router.label} bukan router dan bukan tujuan — paket di-drop.`,
        };
      }
      if (visitedRouters.has(router.id)) {
        return { ok: false, rttMs: 0, replyTtl: 0, error: `Routing loop terdeteksi di ${router.label}.` };
      }
      visitedRouters.add(router.id);
      ttl -= 1;
      if (ttl <= 0) {
        return { ok: false, rttMs: 0, replyTtl: 0, error: `TTL terlampaui (Time Exceeded) di ${router.label}.` };
      }
      this.log(
        'ICMP',
        `${router.label}: Menerima paket (TTL sisa ${ttl}). Meneruskan ke subnet tujuan...`
      );
      sender = { dev: router, port: owner.port };
    }

    return { ok: false, rttMs: 0, replyTtl: 0, error: 'Hop routing melebihi batas kedalaman.' };
  }

  private countInteriorRouters(path: L2Hop[]): number {
    const interiors = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      interiors.add(path[i].toNodeId);
    }
    let count = 0;
    for (const id of interiors) {
      const dev = this.devices.get(id);
      if (dev && dev.type === 'router') count += 1;
    }
    return count;
  }

  private buildOutputLines(
    style: 'windows' | 'ios',
    targetIp: string,
    outcomes: EchoOutcome[]
  ): string[] {
    const received = outcomes.filter((o) => o.ok).length;
    const lines: string[] = [];

    if (style === 'windows') {
      lines.push(`Pinging ${targetIp} with 32 bytes of data:`);
      for (const o of outcomes) {
        if (o.ok) {
          const time = o.rttMs === 0 ? 'time<1ms' : `time=${o.rttMs}ms`;
          lines.push(`Reply from ${targetIp}: bytes=32 ${time} TTL=${o.replyTtl}`);
        } else {
          lines.push(`Request timed out. (${o.error ?? 'unknown error'})`);
        }
      }
      const lost = outcomes.length - received;
      lines.push('');
      lines.push(`Ping statistics for ${targetIp}:`);
      lines.push(
        `    Packets: Sent = ${outcomes.length}, Received = ${received}, Lost = ${lost} (${Math.round((lost / outcomes.length) * 100)}% loss),`
      );
      return lines;
    }

    // IOS style
    lines.push('Type escape sequence to abort.');
    lines.push(
      `Sending ${outcomes.length}, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:`
    );
    lines.push(outcomes.map((o) => (o.ok ? '!' : '.')).join(''));
    const pct = Math.round((received / outcomes.length) * 100);
    let rate = `Success rate is ${pct} percent (${received}/${outcomes.length})`;
    if (received > 0) {
      const rtt = outcomes.find((o) => o.ok)!.rttMs || 1;
      rate += `, round-trip min/avg/max = ${rtt}/${rtt}/${rtt} ms`;
    }
    lines.push(rate);
    if (received === 0) {
      const firstError = outcomes.find((o) => o.error)?.error;
      if (firstError) lines.push(firstError);
    }
    return lines;
  }

  /**
   * Eksekusi Ping lengkap dari sourceNodeId ke targetIp.
   * Echo pertama dianimasikan hop-per-hop; echo berikutnya hanya log (deterministik).
   */
  public async executePing(
    sourceNodeId: string,
    targetIp: string,
    options: PingOptions = {}
  ): Promise<PingSummary> {
    const echoCount = Math.max(1, options.echoCount ?? 1);
    const style = options.outputStyle ?? 'windows';
    const logs: string[] = [];

    // Cermin: seluruh log internal engine ikut terkumpul di logs[] hasil ping
    // (selain dikirim ke callback untuk Event Log Panel).
    const outerLog = this.onLogCallback;
    this.onLogCallback = (level, message) => {
      logs.push(`[${level}] ${message}`);
      outerLog?.(level, message);
    };

    try {
      return await this.runPing(sourceNodeId, targetIp, { echoCount, style, logs });
    } finally {
      this.onLogCallback = outerLog;
    }
  }

  private async runPing(
    sourceNodeId: string,
    targetIp: string,
    ctx: {
      echoCount: number;
      style: 'windows' | 'ios';
      logs: string[];
    }
  ): Promise<PingSummary> {
    const { echoCount, style, logs } = ctx;

    const sourceDev = this.devices.get(sourceNodeId);
    if (!sourceDev) {
      this.log('ERROR', `Source node ${sourceNodeId} tidak ditemukan.`);
      return { success: false, rttMs: 0, ttl: 0, logs, outputLines: [], sent: 0, received: 0 };
    }

    const sourcePort = this.chooseSourcePort(sourceDev, targetIp);
    if (!sourcePort) {
      this.log('ERROR', `${sourceDev.label}: Port belum memiliki konfigurasi IP/Subnet.`);
      return { success: false, rttMs: 0, ttl: 0, logs, outputLines: [], sent: 0, received: 0 };
    }

    if (sourcePort.status !== 'up') {
      this.log('ERROR', `${sourceDev.label}: Kabel tidak terhubung (Link DOWN).`);
      return { success: false, rttMs: 0, ttl: 0, logs, outputLines: [], sent: 0, received: 0 };
    }

    this.log(
      'INFO',
      `Memulai PING dari ${sourceDev.label} (${sourcePort.ipAddress}) ke ${targetIp}...`
    );

    const outcomes: EchoOutcome[] = [];
    for (let i = 0; i < echoCount; i++) {
      if (i > 0) this.log('ICMP', `Echo #${i + 1} ke ${targetIp}...`);
      const outcome = await this.echoOnce(
        { dev: sourceDev, port: sourcePort },
        targetIp,
        i === 0
      );
      outcomes.push(outcome);
      if (!outcome.ok) {
        this.log('ERROR', outcome.error ?? 'Ping gagal tanpa alasan yang diketahui.');
        break; // kondisi gagal bersifat deterministik — tidak perlu mengulang
      }
    }

    const received = outcomes.filter((o) => o.ok).length;
    const firstOk = outcomes.find((o) => o.ok);

    if (firstOk) {
      const time = firstOk.rttMs === 0 ? '<1ms' : `${firstOk.rttMs}ms`;
      this.log(
        'SUCCESS',
        `Ping reply diterima dari ${targetIp}: bytes=32 time=${time} TTL=${firstOk.replyTtl}.`
      );
    }

    return {
      success: received > 0 && received === outcomes.length,
      rttMs: firstOk?.rttMs ?? 0,
      ttl: firstOk?.replyTtl ?? 0,
      logs,
      outputLines: this.buildOutputLines(style, targetIp, outcomes),
      sent: outcomes.length,
      received,
    };
  }
}
