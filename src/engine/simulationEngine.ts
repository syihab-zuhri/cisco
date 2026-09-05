import {
  type DeviceData,
  type PhysicalPort,
  type TopologyLink,
  isL2Intermediate,
  learnsCam,
} from '../types/network';
import { isSameSubnet, prefixLength } from '../utils/ipUtils';
import { type WorkerUIMessage } from '../types/ipc';
import {
  type ArpPacket,
  type IcmpPacket,
  type IPv4Packet,
  type PduSnapshot,
  type SimEvent,
} from '../types/protocol';
import { SimEventQueue } from './eventQueue';

type LogLevel = 'INFO' | 'ARP' | 'ICMP' | 'ERROR' | 'SUCCESS';

/** TTL awal Windows/iOS default (Packet Tracer memakai 128). */
const INITIAL_TTL = 128;

/**
 * IP publik tersimulasi yang "dimiliki" Cloud Internet (INV-008: 100% offline —
 * tidak ada request jaringan sungguhan, cloud menjawab secara deterministik).
 */
export const CLOUD_PUBLIC_IPS = ['8.8.8.8', '1.1.1.1'] as const;

const ICMP_IDENTIFIER = 0x0001;
const ICMP_PAYLOAD_BYTES = 32;
const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

interface L2Hop {
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  kind: 'ethernet' | 'wireless';
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

/** Konteks perencanaan satu aliran simulasi (deterministik, INV-004). */
interface PlanContext {
  queue: SimEventQueue;
  seq: number;
  simTimeMs: number;
}

export interface SimulationPlan {
  events: SimEvent[];
  summary: PingSummary;
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

  // ------------------------------------------------------------------
  // Perencanaan aliran event (plan-then-playback)
  // ------------------------------------------------------------------

  private record(ctx: PlanContext, level: LogLevel, message: string): void {
    ctx.queue.push({
      seq: ++ctx.seq,
      simTimeMs: ctx.simTimeMs,
      kind: 'LOG',
      level,
      message,
    });
  }

  private recordHop(
    ctx: PlanContext,
    hop: L2Hop,
    kind: 'ARP_REQ' | 'ARP_REP' | 'ICMP_REQ' | 'ICMP_REP',
    summary: string,
    pdu: PduSnapshot,
    effects?: SimEvent['effects']
  ): SimEvent {
    ctx.simTimeMs += 1;
    const event: SimEvent = {
      seq: ++ctx.seq,
      simTimeMs: ctx.simTimeMs,
      kind,
      level: kind.startsWith('ARP') ? 'ARP' : 'ICMP',
      message: summary,
      hop: {
        sourceNodeId: hop.fromNodeId,
        sourcePortId: hop.fromPortId,
        targetNodeId: hop.toNodeId,
        targetPortId: hop.toPortId,
        kind: hop.kind,
      },
      pdu,
      effects,
    };
    ctx.queue.push(event);
    return event;
  }

  private portOf(nodeId: string, portId: string): PhysicalPort | undefined {
    return this.devices.get(nodeId)?.ports.find((p) => p.id === portId);
  }

  private buildFramePdu(
    hop: L2Hop,
    kind: 'ARP_REQ' | 'ARP_REP' | 'ICMP_REQ' | 'ICMP_REP',
    opts: { arp?: ArpPacket; packet?: IPv4Packet; icmp?: IcmpPacket; note?: string }
  ): PduSnapshot {
    const fromPort = this.portOf(hop.fromNodeId, hop.fromPortId);
    const toPort = this.portOf(hop.toNodeId, hop.toPortId);
    return {
      frame: {
        srcMac: fromPort?.macAddress ?? '00:00:00:00:00:00',
        dstMac:
          kind === 'ARP_REQ' ? BROADCAST_MAC : (toPort?.macAddress ?? '00:00:00:00:00:00'),
        ethertype: kind.startsWith('ARP') ? 'ARP' : 'IPv4',
      },
      packet: opts.packet,
      segment: opts.arp ?? opts.icmp,
      note: opts.note,
    };
  }

  private toHopPayload(ev: SimEvent) {
    return {
      packetId: `pkt-${++this.packetSeq}`,
      sourceNodeId: ev.hop!.sourceNodeId,
      targetNodeId: ev.hop!.targetNodeId,
      sourcePortId: ev.hop!.sourcePortId,
      targetPortId: ev.hop!.targetPortId,
      type: ev.kind as Exclude<SimEvent['kind'], 'LOG'>,
      currentProtocol: ev.kind.startsWith('ARP') ? ('ARP' as const) : ('ICMP' as const),
      summary: ev.message,
    };
  }

  // ------------------------------------------------------------------
  // Topologi & helper L2/L3
  // ------------------------------------------------------------------

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
        kind: h.kind,
      }));
  }

  /**
   * Menemukan rute Layer 2 antar host menggunakan BFS. Switch, hub, dan
   * Access Point dapat menjadi hop antara.
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
          kind: link.kind ?? 'ethernet',
        };

        if (peerNodeId === targetNodeId) return [...path, hop];

        const peerDev = this.devices.get(peerNodeId);
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
    // IP publik tersimulasi dimiliki oleh perangkat Cloud Internet
    if ((CLOUD_PUBLIC_IPS as readonly string[]).includes(ip)) {
      for (const dev of this.devices.values()) {
        if (dev.type === 'cloud') {
          const port = dev.ports.find((p) => p.status === 'up') ?? dev.ports[0];
          if (port) return { dev, port };
        }
      }
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

    // Host (PC / Laptop / Server / switch management)
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
   * Resolusi RFC 826 sebagai bagian perencanaan: cek ARP cache, kalau miss
   * jadwalkan ARP Request (broadcast, MAC tujuan FF:FF:FF:FF:FF:FF) sepanjang
   * jalur L2 — switch/AP belajar CAM (effect) — dan hanya pemilik IP yang membalas.
   */
  private planArp(
    ctx: PlanContext,
    sender: { dev: DeviceData; port: PhysicalPort },
    nextHopIp: string,
    owner: { dev: DeviceData; port: PhysicalPort },
    path: L2Hop[],
    animate: boolean
  ): void {
    sender.dev.arpTable = sender.dev.arpTable || {};
    const cached = sender.dev.arpTable[nextHopIp];
    if (cached) {
      if (animate) {
        this.record(ctx, 'ARP', `${sender.dev.label}: ARP Cache HIT: ${nextHopIp} -> ${cached}`);
      }
      return;
    }

    this.record(
      ctx,
      'ARP',
      `${sender.dev.label}: ARP Cache MISS untuk IP ${nextHopIp}. Memancarkan ARP Request (Broadcast)...`
    );

    if (animate) {
      for (const hop of path) {
        const arp: ArpPacket = {
          opcode: 1,
          senderIp: sender.port.ipAddress!,
          senderMac: sender.port.macAddress,
          targetIp: nextHopIp,
        };
        this.recordHop(
          ctx,
          hop,
          'ARP_REQ',
          `ARP Request: Who has ${nextHopIp}? Tell ${sender.port.ipAddress}`,
          this.buildFramePdu(hop, 'ARP_REQ', { arp })
        );
      }
    }

    for (const hop of path) {
      const sw = this.devices.get(hop.toNodeId);
      if (sw && learnsCam(sw.type)) {
        sw.macTable = sw.macTable || {};
        if (!sw.macTable[sender.port.macAddress]) {
          sw.macTable[sender.port.macAddress] = hop.toPortId;
          if (animate) {
            this.record(
              ctx,
              'INFO',
              `${sw.label}: CAM Table belajar MAC ${sender.port.macAddress} pada port ${hop.toPortId}`
            );
            // Tempelkan efek CAM_LEARN ke event hop ARP_REQ yang tiba di switch ini
            const hopEvent = ctx.queue
              .snapshot()
              .reverse()
              .find((e) => e.hop && e.hop.targetNodeId === sw.id && e.kind === 'ARP_REQ');
            if (hopEvent) {
              hopEvent.effects = [
                ...(hopEvent.effects ?? []),
                {
                  type: 'CAM_LEARN',
                  nodeId: sw.id,
                  mac: sender.port.macAddress,
                  portId: hop.toPortId,
                  vlan: 1,
                },
              ];
            }
          }
        }
      }
    }

    owner.dev.arpTable = owner.dev.arpTable || {};
    owner.dev.arpTable[sender.port.ipAddress!] = sender.port.macAddress;

    if (animate) {
      this.record(
        ctx,
        'ARP',
        `${owner.dev.label}: IP cocok (${nextHopIp})! Mengirimkan ARP Reply (Unicast)...`
      );
      const backwardPath = this.reversePath(path);
      backwardPath.forEach((hop, idx) => {
        const arp: ArpPacket = {
          opcode: 2,
          senderIp: nextHopIp,
          senderMac: owner.port.macAddress,
          targetIp: sender.port.ipAddress!,
          targetMac: sender.port.macAddress,
        };
        const effects: NonNullable<SimEvent['effects']> = [];
        if (idx === 0) {
          effects.push({
            type: 'ARP_LEARN',
            nodeId: owner.dev.id,
            ip: sender.port.ipAddress!,
            mac: sender.port.macAddress,
          });
        }
        this.recordHop(
          ctx,
          hop,
          'ARP_REP',
          `ARP Reply: ${nextHopIp} is at ${owner.port.macAddress}`,
          this.buildFramePdu(hop, 'ARP_REP', { arp }),
          effects
        );
        const sw = this.devices.get(hop.toNodeId);
        if (sw && learnsCam(sw.type)) {
          sw.macTable = sw.macTable || {};
          sw.macTable[owner.port.macAddress] =
            sw.macTable[owner.port.macAddress] ?? hop.toPortId;
          this.record(
            ctx,
            'INFO',
            `${sw.label}: CAM Table belajar MAC ${owner.port.macAddress} pada port ${hop.toPortId}`
          );
          const hopEvent = ctx.queue.snapshot().at(-1);
          hopEvent?.effects?.push({
            type: 'CAM_LEARN',
            nodeId: sw.id,
            mac: owner.port.macAddress,
            portId: hop.toPortId,
            vlan: 1,
          });
        }
        if (idx === backwardPath.length - 1) {
          const lastEvent = ctx.queue.snapshot().at(-1);
          lastEvent?.effects?.push({
            type: 'ARP_LEARN',
            nodeId: sender.dev.id,
            ip: nextHopIp,
            mac: owner.port.macAddress,
          });
        }
      });
    }

    sender.dev.arpTable[nextHopIp] = owner.port.macAddress;
    this.record(
      ctx,
      'ARP',
      `${sender.dev.label}: ARP Cache diperbarui: ${nextHopIp} -> ${owner.port.macAddress}`
    );
  }

  // Dipakai untuk log di luar event hop saat perencanaan (dengan efek samping callback langsung)

  /** Satu siklus ICMP Echo Request -> Reply (bolak-balik), dengan TTL & hop router. */
  private planEchoOnce(
    ctx: PlanContext,
    source: { dev: DeviceData; port: PhysicalPort },
    targetIp: string,
    echoIndex: number,
    animate: boolean
  ): EchoOutcome {
    // Ping ke IP sendiri (loopback interface)
    if (source.port.ipAddress === targetIp) {
      return { ok: true, rttMs: 0, replyTtl: INITIAL_TTL };
    }

    let sender = source;
    let ttl = INITIAL_TTL;
    let ttlAtHop = INITIAL_TTL;
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

      this.planArp(ctx, sender, next.nextHopIp, owner, path, animate);

      if (animate) {
        for (const hop of path) {
          const packet: IPv4Packet = {
            srcIp: source.port.ipAddress!,
            dstIp: targetIp,
            ttl: ttlAtHop,
            protocol: 'ICMP',
            id: ICMP_IDENTIFIER,
          };
          const icmp: IcmpPacket = {
            type: 8,
            code: 0,
            identifier: ICMP_IDENTIFIER,
            sequence: echoIndex + 1,
            payloadBytes: ICMP_PAYLOAD_BYTES,
          };
          const note =
            depth > 0
              ? `Diteruskan router ${sender.dev.label} (TTL diturunkan menjadi ${ttlAtHop})`
              : undefined;
          this.recordHop(
            ctx,
            hop,
            'ICMP_REQ',
            `ICMP Echo Request: ${source.port.ipAddress} -> ${targetIp}${depth > 0 ? ' (diteruskan router)' : ''}`,
            this.buildFramePdu(hop, 'ICMP_REQ', { packet, icmp, note })
          );
        }
      }
      requestPath.push(...path);

      if (next.nextHopIp === targetIp) {
        // Sampai di perangkat tujuan
        const routerCount = this.countInteriorRouters(requestPath);
        const returnPath = this.reversePath(requestPath);

        // Cloud Internet menjawab untuk IP publik tersimulasi (TTL/RTT termasuk hop WAN)
        if (owner.dev.type === 'cloud') {
          const replyTtl = INITIAL_TTL - routerCount - 1;
          const rttMs = routerCount + 1;
          this.record(
            ctx,
            'ICMP',
            `${owner.dev.label}: Menerima paket untuk IP publik ${targetIp}. Membalas ICMP Echo Reply...`
          );
          if (animate) {
            this.emitReplyHops(ctx, returnPath, source, targetIp, echoIndex, replyTtl, 'cloud');
          }
          return { ok: true, rttMs, replyTtl };
        }

        const replyTtl = INITIAL_TTL - routerCount;
        this.record(
          ctx,
          'ICMP',
          `${owner.dev.label}: Menerima Echo Request. Membalas dengan ICMP Echo Reply...`
        );
        if (animate) {
          this.emitReplyHops(ctx, returnPath, source, targetIp, echoIndex, replyTtl, 'host');
        }
        return { ok: true, rttMs: routerCount, replyTtl };
      }

      // Transit: pemilik nextHopIp haruslah router — atau Cloud untuk IP publik
      const router = owner.dev;
      if (router.type === 'cloud') {
        if (!(CLOUD_PUBLIC_IPS as readonly string[]).includes(targetIp)) {
          return {
            ok: false,
            rttMs: 0,
            replyTtl: 0,
            error: `${router.label}: IP ${targetIp} tidak dikenal di internet tersimulasi.`,
          };
        }
        const routerCount = this.countInteriorRouters(requestPath);
        const replyTtl = INITIAL_TTL - routerCount - 1;
        const rttMs = routerCount + 1;
        this.record(
          ctx,
          'ICMP',
          `${router.label}: Menerima paket untuk IP publik ${targetIp}. Membalas ICMP Echo Reply...`
        );
        if (animate) {
          this.emitReplyHops(ctx, this.reversePath(requestPath), source, targetIp, echoIndex, replyTtl, 'cloud');
        }
        return { ok: true, rttMs, replyTtl };
      }
      if (router.type !== 'router') {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `${router.label} bukan router dan bukan tujuan — paket di-drop.`,
        };
      }
      if (visitedRouters.has(router.id)) {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `Routing loop terdeteksi di ${router.label}.`,
        };
      }
      visitedRouters.add(router.id);
      ttl -= 1;
      ttlAtHop = ttl;
      if (ttl <= 0) {
        return {
          ok: false,
          rttMs: 0,
          replyTtl: 0,
          error: `TTL terlampaui (Time Exceeded) di ${router.label}.`,
        };
      }
      this.record(
        ctx,
        'ICMP',
        `${router.label}: Menerima paket (TTL sisa ${ttl}). Meneruskan ke subnet tujuan...`
      );
      sender = { dev: router, port: owner.port };
    }

    return { ok: false, rttMs: 0, replyTtl: 0, error: 'Hop routing melebihi batas kedalaman.' };
  }

  /** Hop ICMP Reply dengan TTL yang menurun di setiap router pada jalur balik. */
  private emitReplyHops(
    ctx: PlanContext,
    returnPath: L2Hop[],
    source: { dev: DeviceData; port: PhysicalPort },
    targetIp: string,
    echoIndex: number,
    _replyTtlFinal: number,
    replier: 'host' | 'cloud'
  ): void {
    let ttlReply = INITIAL_TTL;
    for (const hop of returnPath) {
      const packet: IPv4Packet = {
        srcIp: targetIp,
        dstIp: source.port.ipAddress!,
        ttl: ttlReply,
        protocol: 'ICMP',
        id: ICMP_IDENTIFIER,
      };
      const icmp: IcmpPacket = {
        type: 0,
        code: 0,
        identifier: ICMP_IDENTIFIER,
        sequence: echoIndex + 1,
        payloadBytes: ICMP_PAYLOAD_BYTES,
      };
      this.recordHop(
        ctx,
        hop,
        'ICMP_REP',
        `ICMP Echo Reply: ${targetIp} -> ${source.port.ipAddress}`,
        this.buildFramePdu(hop, 'ICMP_REP', { packet, icmp })
      );
      const arrivedDev = this.devices.get(hop.toNodeId);
      if (arrivedDev?.type === 'router') {
        ttlReply -= 1;
      }
    }
    void replier;
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

  // ------------------------------------------------------------------
  // API publik: planPing (untuk worker/timeline) & executePing (kompatibel test)
  // ------------------------------------------------------------------

  /**
   * Merencanakan seluruh aliran ping menjadi daftar SimEvent deterministik.
   * Mutasi tabel (CAM/ARP) diterapkan saat perencanaan; efek juga ditempel pada
   * event agar GUI memperbarui tabel secara live selama playback.
   */
  public planPing(
    sourceNodeId: string,
    targetIp: string,
    options: PingOptions = {}
  ): SimulationPlan {
    const ctx: PlanContext = { queue: new SimEventQueue(), seq: 0, simTimeMs: 0 };
    const summary = this.runPing(ctx, sourceNodeId, targetIp, options);
    return { events: ctx.queue.snapshot(), summary };
  }

  /** Kompatibilitas: jalankan ping secara langsung (tanpa pacing) melalui callback. */
  public async executePing(
    sourceNodeId: string,
    targetIp: string,
    options: PingOptions = {}
  ): Promise<PingSummary> {
    const plan = this.planPing(sourceNodeId, targetIp, options);
    const logs: string[] = [];

    for (const ev of plan.events) {
      if (ev.kind === 'LOG') {
        logs.push(`[${ev.level}] ${ev.message}`);
        this.onLogCallback?.(ev.level, ev.message);
      }
      if (ev.hop) {
        await this.onHopCallback?.({
          type: 'SIMULATION_STEP',
          payload: this.toHopPayload(ev),
        });
      }
    }

    return { ...plan.summary, logs };
  }

  private runPing(
    ctx: PlanContext,
    sourceNodeId: string,
    targetIp: string,
    options: PingOptions
  ): PingSummary {
    const echoCount = Math.max(1, options.echoCount ?? 1);
    const style = options.outputStyle ?? 'windows';

    const sourceDev = this.devices.get(sourceNodeId);
    if (!sourceDev) {
      this.record(ctx, 'ERROR', `Source node ${sourceNodeId} tidak ditemukan.`);
      return {
        success: false, rttMs: 0, ttl: 0, logs: [], outputLines: [], sent: 0, received: 0,
      };
    }

    const sourcePort = this.chooseSourcePort(sourceDev, targetIp);
    if (!sourcePort) {
      this.record(ctx, 'ERROR', `${sourceDev.label}: Port belum memiliki konfigurasi IP/Subnet.`);
      return {
        success: false, rttMs: 0, ttl: 0, logs: [], outputLines: [], sent: 0, received: 0,
      };
    }

    if (sourcePort.status !== 'up') {
      this.record(ctx, 'ERROR', `${sourceDev.label}: Kabel tidak terhubung (Link DOWN).`);
      return {
        success: false, rttMs: 0, ttl: 0, logs: [], outputLines: [], sent: 0, received: 0,
      };
    }

    this.record(
      ctx,
      'INFO',
      `Memulai PING dari ${sourceDev.label} (${sourcePort.ipAddress}) ke ${targetIp}...`
    );

    const outcomes: EchoOutcome[] = [];
    for (let i = 0; i < echoCount; i++) {
      if (i > 0) this.record(ctx, 'ICMP', `Echo #${i + 1} ke ${targetIp}...`);
      const outcome = this.planEchoOnce(
        ctx,
        { dev: sourceDev, port: sourcePort },
        targetIp,
        i,
        i === 0
      );
      outcomes.push(outcome);
      if (!outcome.ok) {
        this.record(ctx, 'ERROR', outcome.error ?? 'Ping gagal tanpa alasan yang diketahui.');
        break; // kondisi gagal bersifat deterministik — tidak perlu mengulang
      }
    }

    const received = outcomes.filter((o) => o.ok).length;
    const firstOk = outcomes.find((o) => o.ok);

    if (firstOk) {
      const time = firstOk.rttMs === 0 ? '<1ms' : `${firstOk.rttMs}ms`;
      this.record(
        ctx,
        'SUCCESS',
        `Ping reply diterima dari ${targetIp}: bytes=32 time=${time} TTL=${firstOk.replyTtl}.`
      );
    }

    return {
      success: received > 0 && received === outcomes.length,
      rttMs: firstOk?.rttMs ?? 0,
      ttl: firstOk?.replyTtl ?? 0,
      logs: [],
      outputLines: this.buildOutputLines(style, targetIp, outcomes),
      sent: outcomes.length,
      received,
    };
  }
}
