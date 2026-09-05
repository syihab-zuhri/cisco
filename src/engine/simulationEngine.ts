import {
  type DeviceData,
  type PhysicalPort,
  type TopologyLink,
  isL2Intermediate,
  learnsCam,
} from '../types/network';
import { isSameSubnet, prefixLength, ipToNumber, numberToIp, networkAddress } from '../utils/ipUtils';
import { type WorkerUIMessage } from '../types/ipc';
import {
  type ArpPacket,
  type DhcpPacket,
  type IcmpPacket,
  type IPv4Packet,
  type PduSnapshot,
  type SimEvent,
} from '../types/protocol';
import { SimEventQueue } from './eventQueue';

type LogLevel = 'INFO' | 'ARP' | 'ICMP' | 'ERROR' | 'SUCCESS' | 'DHCP' | 'RIP';

type EventKind =
  | 'ARP_REQ'
  | 'ARP_REP'
  | 'ICMP_REQ'
  | 'ICMP_REP'
  | 'DHCP_DISCOVER'
  | 'DHCP_OFFER'
  | 'DHCP_REQUEST'
  | 'DHCP_ACK'
  | 'RIP_UPDATE'
  | 'LOG';

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
    kind: EventKind,
    summary: string,
    pdu: PduSnapshot,
    effects?: SimEvent['effects']
  ): SimEvent {
    ctx.simTimeMs += 1;
    const event: SimEvent = {
      seq: ++ctx.seq,
      simTimeMs: ctx.simTimeMs,
      kind,
      level: kind.startsWith('ARP')
        ? 'ARP'
        : kind.startsWith('ICMP')
        ? 'ICMP'
        : kind.startsWith('DHCP')
        ? 'DHCP'
        : kind.startsWith('RIP')
        ? 'RIP'
        : 'INFO',
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

  /** Port trunk membawa semua VLAN (port switch trunk atau port router ber-sub-interface). */
  private isTrunkPort(p: PhysicalPort): boolean {
    return p.portMode === 'trunk' || (p.subInterfaces?.length ?? 0) > 0;
  }

  /** Segmen VLAN 802.1Q: dua port access hanya bertetangga bila VLAN-nya sama. */
  private vlanAllows(a: PhysicalPort, b: PhysicalPort): boolean {
    if (this.isTrunkPort(a) || this.isTrunkPort(b)) return true;
    return (a.vlanId ?? 1) === (b.vlanId ?? 1);
  }

  private buildFramePdu(
    hop: L2Hop,
    kind: 'ARP_REQ' | 'ARP_REP' | 'ICMP_REQ' | 'ICMP_REP',
    opts: { arp?: ArpPacket; packet?: IPv4Packet; icmp?: IcmpPacket; dhcp?: DhcpPacket; note?: string }
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
        const peerDev = this.devices.get(peerNodeId);
        if (!peerDev) continue;

        // Segmen VLAN 802.1Q: link ditolak bila kedua port access berbeda VLAN
        const peerPort = peerDev.ports.find((pp) => pp.id === peerPortId);
        if (peerPort && !this.vlanAllows(p, peerPort)) continue;

        const hop: L2Hop = {
          fromNodeId: currentNodeId,
          fromPortId: p.id,
          toNodeId: peerNodeId,
          toPortId: peerPortId,
          kind: link.kind ?? 'ethernet',
        };

        if (peerNodeId === targetNodeId) return [...path, hop];

        if (isL2Intermediate(peerDev.type) && !visited.has(peerDev.id)) {
          visited.add(peerDev.id);
          queue.push({ currentNodeId: peerDev.id, path: [...path, hop] });
        }
      }
    }
    return null;
  }

  private resolveOwner(ip: string): { dev: DeviceData; port: PhysicalPort } | null {
    for (const dev of this.devices.values()) {
      for (const port of dev.ports) {
        if (port.ipAddress === ip) return { dev, port };
        // IP sub-interface (router-on-a-stick) dimiliki port fisiknya
        if (port.subInterfaces?.some((s) => s.ipAddress === ip)) return { dev, port };
      }
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
        // Connected network via sub-interface (router-on-a-stick) — cek semua port
        for (const s of p.subInterfaces ?? []) {
          if (isSameSubnet(s.ipAddress, targetIp, s.subnetMask)) {
            const prefix = prefixLength(s.subnetMask);
            if (!best || prefix > best.prefix) best = { nextHopIp: targetIp, prefix };
          }
        }
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

      // NAT/PAT: segmen keluar router melalui port natEnabled menuju IP publik —
      // src IP di-rewrite menjadi IP WAN dan translasi dicatat di tabel router.
      let natInfo: { routerId: string; globalIp: string; insideIp: string } | null = null;
      const egressPort = sender.dev.ports.find((p) => p.id === path[0].fromPortId);
      if (
        sender.dev.type === 'router' &&
        (CLOUD_PUBLIC_IPS as readonly string[]).includes(targetIp) &&
        egressPort?.natEnabled &&
        egressPort.ipAddress
      ) {
        natInfo = { routerId: sender.dev.id, globalIp: egressPort.ipAddress, insideIp: source.port.ipAddress! };
        sender.dev.natTable = [
          ...(sender.dev.natTable ?? []).slice(-49),
          {
            insideIp: natInfo.insideIp,
            globalIp: natInfo.globalIp,
            icmpId: ICMP_IDENTIFIER,
            echoSeq: echoIndex + 1,
          },
        ];
      }

      if (animate) {
        path.forEach((hop, hopIdx) => {
          const fromPort = this.portOf(hop.fromNodeId, hop.fromPortId);
          const toPort = this.portOf(hop.toNodeId, hop.toPortId);
          const notes: string[] = [];
          if (natInfo) {
            if (hopIdx === 0) notes.push(`NAT: src ${natInfo.insideIp} di-rewrite ke ${natInfo.globalIp} (TTL ${ttlAtHop})`);
          } else if (depth > 0) {
            notes.push(`Diteruskan router ${sender.dev.label} (TTL diturunkan menjadi ${ttlAtHop})`);
          }
          if ((fromPort && this.isTrunkPort(fromPort)) || (toPort && this.isTrunkPort(toPort))) {
            notes.push('802.1Q: frame ter-tag di trunk');
          }
          const packet: IPv4Packet = {
            srcIp: natInfo ? natInfo.globalIp : source.port.ipAddress!,
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
          const effects: NonNullable<SimEvent['effects']> | undefined =
            hopIdx === 0 && natInfo
              ? [
                  {
                    type: 'NAT_TRANSLATE',
                    nodeId: sender.dev.id,
                    insideIp: natInfo.insideIp,
                    globalIp: natInfo.globalIp,
                    icmpId: ICMP_IDENTIFIER,
                    echoSeq: echoIndex + 1,
                  },
                ]
              : undefined;
          this.recordHop(
            ctx,
            hop,
            'ICMP_REQ',
            `ICMP Echo Request: ${natInfo ? natInfo.globalIp : source.port.ipAddress} -> ${targetIp}${depth > 0 ? ' (diteruskan router)' : ''}`,
            this.buildFramePdu(hop, 'ICMP_REQ', { packet, icmp, note: notes.length > 0 ? notes.join(' · ') : undefined }),
            effects
          );
        });
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
            this.emitReplyHops(ctx, returnPath, source, targetIp, echoIndex, natInfo);
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
          this.emitReplyHops(ctx, returnPath, source, targetIp, echoIndex, natInfo);
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
          this.emitReplyHops(ctx, this.reversePath(requestPath), source, targetIp, echoIndex, natInfo);
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

  /** Hop ICMP Reply dengan TTL menurun per router & pembalikan NAT pada jalur balik. */
  private emitReplyHops(
    ctx: PlanContext,
    returnPath: L2Hop[],
    source: { dev: DeviceData; port: PhysicalPort },
    targetIp: string,
    echoIndex: number,
    nat?: { routerId: string; globalIp: string; insideIp: string } | null
  ): void {
    let ttlReply = INITIAL_TTL;
    let unNatted = !nat;
    for (const hop of returnPath) {
      const packet: IPv4Packet = {
        srcIp: targetIp,
        dstIp: unNatted ? source.port.ipAddress! : nat!.globalIp,
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
      const note =
        nat && unNatted && hop.fromNodeId === nat.routerId
          ? `NAT: dst dikembalikan ke ${nat.insideIp}`
          : undefined;
      this.recordHop(
        ctx,
        hop,
        'ICMP_REP',
        `ICMP Echo Reply: ${targetIp} -> ${source.port.ipAddress}`,
        this.buildFramePdu(hop, 'ICMP_REP', { packet, icmp, note })
      );
      const arrivedDev = this.devices.get(hop.toNodeId);
      if (arrivedDev?.type === 'router') {
        ttlReply -= 1;
      }
      if (nat && hop.toNodeId === nat.routerId) {
        unNatted = true;
      }
    }
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
   * Cakupan broadcast Layer-2 dari sebuah node: semua perangkat yang terjangkau
   * melewati switch/hub/AP, beserta jalur hop ke masing-masing (urutan BFS deterministik).
   */
  private broadcastPaths(startNodeId: string): Array<{ dev: DeviceData; path: L2Hop[] }> {
    const results: Array<{ dev: DeviceData; path: L2Hop[] }> = [];
    const visited = new Set<string>([startNodeId]);
    const queue: Array<{ currentNodeId: string; path: L2Hop[] }> = [
      { currentNodeId: startNodeId, path: [] },
    ];

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
        const peerDev = this.devices.get(peerNodeId);
        if (!peerDev || visited.has(peerNodeId)) continue;

        // Segmen VLAN 802.1Q: link ditolak bila kedua port access berbeda VLAN
        const peerPort = peerDev.ports.find((pp) => pp.id === peerPortId);
        if (peerPort && !this.vlanAllows(p, peerPort)) continue;

        const hop: L2Hop = {
          fromNodeId: currentNodeId,
          fromPortId: p.id,
          toNodeId: peerNodeId,
          toPortId: peerPortId,
          kind: link.kind ?? 'ethernet',
        };
        results.push({ dev: peerDev, path: [...path, hop] });

        if (isL2Intermediate(peerDev.type)) {
          visited.add(peerNodeId);
          queue.push({ currentNodeId: peerNodeId, path: [...path, hop] });
        }
      }
    }
    return results;
  }

  /**
   * Merencanakan aliran DHCP (DORA: Discover → Offer → Request → Ack) untuk
   * klien yang meminta IP. Router sebagai server (blueprint P1); alokasi
   * deterministik dari pool interface yang satu segmen dengan klien.
   */
  public planDhcp(clientNodeId: string, portId: string): SimulationPlan {
    const ctx: PlanContext = { queue: new SimEventQueue(), seq: 0, simTimeMs: 0 };
    const summary = this.runDhcp(ctx, clientNodeId, portId);
    return { events: ctx.queue.snapshot(), summary };
  }

  private runDhcp(ctx: PlanContext, clientNodeId: string, portId: string): PingSummary {
    const client = this.devices.get(clientNodeId);
    const port = client?.ports.find((p) => p.id === portId);
    if (!client || !port) {
      this.record(ctx, 'ERROR', `Klien ${clientNodeId}/${portId} tidak ditemukan.`);
      return { success: false, rttMs: 0, ttl: 0, logs: [], outputLines: [], sent: 0, received: 0 };
    }

    this.record(
      ctx,
      'DHCP',
      `${client.label}: Memulai DHCP Discover pada ${port.name} (UDP 68 → 67)...`
    );

    // Cari kandidat server: router dalam cakupan broadcast dengan pool aktif
    const scope = this.broadcastPaths(clientNodeId);
    let chosen: {
      router: DeviceData;
      iface: PhysicalPort;
      pool: { network: string; mask: string; startIp: string; maxClients: number };
      path: L2Hop[];
    } | null = null;
    for (const { dev, path } of scope) {
      if (dev.type !== 'router') continue;
      for (const iface of dev.ports) {
        const pool = dev.dhcpPools?.[iface.id];
        if (
          pool?.enabled &&
          iface.ipAddress &&
          isSameSubnet(iface.ipAddress, pool.network, pool.mask)
        ) {
          chosen = { router: dev, iface, pool, path };
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      this.record(ctx, 'ERROR', 'DHCP: Tidak ada server DHCP (pool aktif) di segmen ini.');
      return {
        success: false,
        rttMs: 0,
        ttl: 0,
        logs: [],
        outputLines: ['DHCP: tidak ada server DHCP di segmen ini.'],
        sent: 0,
        received: 0,
      };
    }

    // Alokasi deterministik: IP pertama yang bebas mulai dari pool.startIp
    const occupied = new Set<string>();
    for (const dev of this.devices.values()) {
      for (const p of dev.ports) if (p.ipAddress) occupied.add(p.ipAddress);
    }
    let offeredIp: string | null = null;
    const base = ipToNumber(chosen.pool.startIp);
    for (let i = 0; i < chosen.pool.maxClients; i++) {
      const candidate = numberToIp(base + i);
      if (!occupied.has(candidate)) {
        offeredIp = candidate;
        break;
      }
    }
    if (!offeredIp) {
      this.record(ctx, 'ERROR', `DHCP: Pool ${chosen.router.label} (${chosen.iface.id}) penuh.`);
      return {
        success: false,
        rttMs: 0,
        ttl: 0,
        logs: [],
        outputLines: ['DHCP: pool server penuh.'],
        sent: 0,
        received: 0,
      };
    }

    const backwardPath = this.reversePath(chosen.path);
    const recordDhcpHops = (
      hops: L2Hop[],
      messageType: DhcpPacket['messageType'],
      label: string,
      kind: EventKind
    ) => {
      for (const hop of hops) {
        const dhcp: DhcpPacket = {
          messageType,
          clientId: port.macAddress,
          yiaddr: messageType === 1 ? undefined : offeredIp!,
          serverId: messageType === 1 ? undefined : chosen!.iface.ipAddress,
        };
        this.recordHop(
          ctx,
          hop,
          kind,
          `DHCP ${label}: ${client.label} <-> ${chosen!.router.label} (offer ${offeredIp})`,
          this.buildFramePdu(hop, 'ARP_REQ', {
            arp: {
              opcode: 1,
              senderIp: port.ipAddress ?? '0.0.0.0',
              senderMac: port.macAddress,
              targetIp: '255.255.255.255',
            },
            dhcp,
            note: 'UDP 68 → 67 (broadcast)',
          })
        );
      }
    };

    // DORA
    this.record(
      ctx,
      'DHCP',
      `${chosen.router.label}: DHCP Offer ${offeredIp}/${chosen.pool.mask} (server ${chosen.iface.ipAddress})`
    );
    recordDhcpHops(chosen.path, 1, 'Discover', 'DHCP_DISCOVER');
    recordDhcpHops(backwardPath, 2, 'Offer', 'DHCP_OFFER');
    recordDhcpHops(chosen.path, 3, 'Request', 'DHCP_REQUEST');
    const ackEvents = backwardPath.map((hop) =>
      this.recordHop(
        ctx,
        hop,
        'DHCP_ACK',
        `DHCP Ack: ${offeredIp} dikirim ke ${client.label}`,
        this.buildFramePdu(hop, 'ARP_REQ', {
          arp: {
            opcode: 2,
            senderIp: chosen!.iface.ipAddress!,
            senderMac: chosen!.iface.macAddress,
            targetIp: offeredIp!,
          },
          dhcp: {
            messageType: 5,
            clientId: port.macAddress,
            yiaddr: offeredIp!,
            serverId: chosen!.iface.ipAddress,
          },
          note: 'UDP 67 → 68',
        })
      )
    );

    // Terapkan lease di engine & jadwalkan efek untuk UI
    port.ipAddress = offeredIp;
    port.subnetMask = chosen.pool.mask;
    client.defaultGateway = chosen.iface.ipAddress;
    const lastAck = ackEvents.at(-1);
    if (lastAck) {
      lastAck.effects = [
        ...(lastAck.effects ?? []),
        {
          type: 'DHCP_LEASE',
          nodeId: client.id,
          portId: port.id,
          ipAddress: offeredIp,
          subnetMask: chosen.pool.mask,
          gateway: chosen.iface.ipAddress!,
        },
      ];
    }

    this.record(
      ctx,
      'SUCCESS',
      `DHCP: ${client.label} memperoleh ${offeredIp}/${chosen.pool.mask} (gateway ${chosen.iface.ipAddress}).`
    );

    return {
      success: true,
      rttMs: 0,
      ttl: 0,
      logs: [],
      outputLines: [
        `DHCP: ${offeredIp}/${chosen.pool.mask} diperoleh dari ${chosen.router.label} (gateway ${chosen.iface.ipAddress})`,
      ],
      sent: 1,
      received: 1,
    };
  }

  /**
   * Konvergensi RIPv2 sederhana (deterministik): ronde update distance-vector
   * antar router bertetangga langsung. Connected metric 1; learned = metric
   * pengirim + 1; split-horizon sederhana (jangan iklankan balik lewat interface
   * tempat route itu berasal); maksimal 8 ronde.
   */
  public planRip(): SimulationPlan {
    const ctx: PlanContext = { queue: new SimEventQueue(), seq: 0, simTimeMs: 0 };
    const summary = this.runRip(ctx);
    return { events: ctx.queue.snapshot(), summary };
  }

  private runRip(ctx: PlanContext): PingSummary {
    const fail = (msg: string): PingSummary => ({
      success: false, rttMs: 0, ttl: 0, logs: [], outputLines: [msg], sent: 0, received: 0,
    });

    const routers = this.getDevices()
      .filter((d) => d.type === 'router' && d.ripEnabled)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (routers.length < 2) {
      this.record(ctx, 'ERROR', 'RIP: butuh minimal 2 router dengan RIP aktif.');
      return fail('RIP: butuh minimal 2 router dengan RIP aktif.');
    }

    interface RipRoute {
      network: string;
      mask: string;
      metric: number;
      nextHop: string;
      interfaceId: string;
      learned: boolean;
    }
    const state = new Map<string, Map<string, RipRoute>>();
    const seedConnected = (dev: DeviceData): Map<string, RipRoute> => {
      const m = new Map<string, RipRoute>();
      for (const p of dev.ports) {
        if (p.ipAddress && p.subnetMask) {
          const network = networkAddress(p.ipAddress, p.subnetMask);
          m.set(`${network}/${p.subnetMask}`, {
            network, mask: p.subnetMask, metric: 1, nextHop: '0.0.0.0', interfaceId: p.id, learned: false,
          });
        }
        for (const s of p.subInterfaces ?? []) {
          const network = networkAddress(s.ipAddress, s.subnetMask);
          m.set(`${network}/${s.subnetMask}`, {
            network, mask: s.subnetMask, metric: 1, nextHop: '0.0.0.0', interfaceId: p.id, learned: false,
          });
        }
      }
      // Static route juga diiklankan (sebagai route statis)
      for (const r of dev.routes ?? []) {
        if (r.source !== 'rip' && !m.has(`${r.network}/${r.subnetMask}`)) {
          m.set(`${r.network}/${r.subnetMask}`, {
            network: r.network, mask: r.subnetMask, metric: r.metric ?? 1,
            nextHop: r.nextHop, interfaceId: r.interfaceId, learned: false,
          });
        }
      }
      return m;
    };
    for (const r of routers) state.set(r.id, seedConnected(r));

    let routesAdded = 0;
    const MAX_ROUNDS = 8;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      let changed = false;

      for (const r of routers) {
        const rState = state.get(r.id)!;

        for (const link of this.links) {
          let nId: string | null = null;
          let pr: PhysicalPort | undefined;
          let pn: PhysicalPort | undefined;
          if (link.sourceNodeId === r.id) {
            pr = this.portOf(r.id, link.sourcePortId);
            pn = this.portOf(link.targetNodeId, link.targetPortId);
            nId = link.targetNodeId;
          } else if (link.targetNodeId === r.id) {
            pr = this.portOf(r.id, link.targetPortId);
            pn = this.portOf(link.sourceNodeId, link.sourcePortId);
            nId = link.sourceNodeId;
          }
          if (!nId || !pr || !pn || pr.status !== 'up' || pn.status !== 'up') continue;
          if (!this.vlanAllows(pr, pn)) continue;
          const neighbor = this.devices.get(nId);
          if (!neighbor || neighbor.type !== 'router' || !neighbor.ripEnabled) continue;

          const nState = state.get(nId)!;
          const nextHopIp = pr.ipAddress;
          if (!nextHopIp) continue;

          for (const [key, route] of rState) {
            // Split horizon sederhana: jangan iklankan lewat interface asal route
            if (route.interfaceId === pr.id) continue;
            const newMetric = route.metric + 1;
            const existing = nState.get(key);
            if (existing && (existing.metric <= newMetric || !existing.learned)) continue;

            nState.set(key, {
              network: route.network,
              mask: route.mask,
              metric: newMetric,
              nextHop: nextHopIp,
              interfaceId: pn.id,
              learned: true,
            });
            changed = true;
            routesAdded += 1;

            const hop: L2Hop = {
              fromNodeId: r.id,
              fromPortId: pr.id,
              toNodeId: nId,
              toPortId: pn.id,
              kind: link.kind ?? 'ethernet',
            };
            const event = this.recordHop(
              ctx,
              hop,
              'RIP_UPDATE',
              `RIPv2 ronde ${round}: ${r.label} mengirim ${route.network}/${route.mask} (metric ${route.metric}) ke ${neighbor.label} → metric ${newMetric}`,
              this.buildFramePdu(hop, 'ICMP_REQ', {
                note: `RIPv2: ${route.network}/${route.mask} metric ${newMetric} via ${nextHopIp}`,
              })
            );
            event.effects = [
              {
                type: 'ROUTE_LEARN',
                nodeId: nId,
                network: route.network,
                subnetMask: route.mask,
                nextHop: nextHopIp,
                interfaceId: pn.id,
                metric: newMetric,
              },
            ];
          }
        }
      }
      if (!changed) break;
    }

    // Terapkan hasil konvergensi ke device state (rute RIP menggantikan rute RIP lama)
    for (const r of routers) {
      const ripRoutes = [...(state.get(r.id) ?? new Map<string, RipRoute>())]
        .filter(([, v]) => v.learned)
        .map(([, v]) => ({
          network: v.network,
          subnetMask: v.mask,
          nextHop: v.nextHop,
          interfaceId: v.interfaceId,
          metric: v.metric,
          source: 'rip' as const,
        }));
      const statics = (r.routes ?? []).filter((rt) => rt.source !== 'rip');
      r.routes = [...statics, ...ripRoutes];
    }

    this.record(
      ctx,
      'RIP',
      `RIP: konvergensi selesai — ${routesAdded} route baru dipelajari.`
    );

    return {
      success: true,
      rttMs: 0,
      ttl: 0,
      logs: [],
      outputLines: [`RIP: konvergensi selesai dalam ${routesAdded} route baru.`],
      sent: 1,
      received: 1,
    };
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
