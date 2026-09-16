import type { Edge, Node } from '@xyflow/react';
import type { DeviceData, DeviceType } from '../../types/network';
import type { Exercise, ExerciseTarget } from './types';

export interface TopologyNode {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface TopologyEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [key: string]: unknown;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export function isTopologyJson(json: unknown): json is TopologyData {
  if (!json || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

/**
 * Membersihkan seluruh konfigurasi IP, subnet mask, gateway, dan routing dari nodes
 * agar starter topology hanya menyediakan komponen/perangkat dan koneksi fisik tanpa konfigurasi IP.
 */
export function cleanNodesForStarterTopology<T extends { data?: Record<string, unknown> }>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const cloned: T = JSON.parse(JSON.stringify(node));
    const d = cloned.data as Record<string, unknown> | undefined;
    if (d) {
      delete d.defaultGateway;
      delete d.staticRoutes;
      delete d.ripEnabled;
      d.arpTable = {};
      d.macTable = {};
      d.routes = [];
      if (Array.isArray(d.ports)) {
        d.ports.forEach((p: unknown) => {
          if (p && typeof p === 'object') {
            const portObj = p as Record<string, unknown>;
            delete portObj.ipAddress;
            delete portObj.subnetMask;
            if (Array.isArray(portObj.subInterfaces)) {
              portObj.subInterfaces.forEach((sub: unknown) => {
                if (sub && typeof sub === 'object') {
                  const subObj = sub as Record<string, unknown>;
                  delete subObj.ipAddress;
                  delete subObj.subnetMask;
                }
              });
            }
          }
        });
      }
    }
    return cloned;
  });
}

/**
 * Mengonversi data topologi OpenPacket (file openpacket-topology-*.json)
 * menjadi objek Exercise yang siap digunakan untuk tugas praktikum siswa.
 */
export function convertTopologyToExercise(
  topology: TopologyData,
  customTitle?: string,
  customInstructions?: string
): Exercise {
  const { nodes, edges } = topology;

  // Peta ID node ke Label perangkat (mis. "pc-1234" -> "PC-1")
  const nodeLabelMap = new Map<string, string>();
  const nodeTypeCount = new Map<DeviceType, number>();
  nodes.forEach((n) => {
    const rawLabel = n.data?.label;
    const label: string =
      typeof rawLabel === 'string' && rawLabel.trim()
        ? rawLabel.trim()
        : n.id || 'Perangkat';
    nodeLabelMap.set(n.id, label);
    const type = ((n.data?.type as string) || 'pc') as DeviceType;
    nodeTypeCount.set(type, (nodeTypeCount.get(type) || 0) + 1);
  });

  const targets: ExerciseTarget[] = [];
  const instructionsList: string[] = [];
  let step = 1;

  // 1. Ekstrak Target Kabel (link_exists)
  const recordedLinks = new Set<string>();
  edges.forEach((edge, idx) => {
    const srcLabel = nodeLabelMap.get(edge.source) || edge.source;
    const dstLabel = nodeLabelMap.get(edge.target) || edge.target;

    const linkKey = [srcLabel, dstLabel].sort().join('<->');
    if (!recordedLinks.has(linkKey)) {
      recordedLinks.add(linkKey);

      targets.push({
        id: `tgt-link-${idx + 1}`,
        title: `Sambungkan kabel fisik antara ${srcLabel} dan ${dstLabel}`,
        type: 'link_exists',
        fromDeviceId: srcLabel,
        toDeviceId: dstLabel,
      });

      instructionsList.push(
        `${step++}. Hubungkan kabel jaringan antara ${srcLabel} dan ${dstLabel}.`
      );
    }
  });

  // 2. Ekstrak Target Konfigurasi IP (device_config)
  nodes.forEach((n) => {
    const rawLabel = n.data?.label;
    const label: string =
      typeof rawLabel === 'string' && rawLabel.trim()
        ? rawLabel.trim()
        : n.id || 'Perangkat';
    const rawPorts = Array.isArray(n.data?.ports) ? n.data.ports : [];
    const defaultGw =
      typeof n.data?.defaultGateway === 'string' && (n.data.defaultGateway as string).trim()
        ? (n.data.defaultGateway as string).trim()
        : undefined;
    rawPorts.forEach((rawP) => {
      const p = rawP as Record<string, unknown>;
      if (p.ipAddress && typeof p.ipAddress === 'string' && p.ipAddress.trim()) {
        const mask = (p.subnetMask as string) || '255.255.255.0';
        targets.push({
          id: `tgt-ip-${n.id}-${(p.id as string) || 'port'}`,
          title: `Konfigurasi IP ${label} (${(p.name as string) || (p.id as string)}): ${p.ipAddress}`,
          type: 'device_config',
          deviceId: label,
          address: p.ipAddress.trim(),
          subnetMask: mask,
          gateway: defaultGw,
        });

        instructionsList.push(
          `${step++}. Atur IP Address pada ${label} (${(p.name as string) || (p.id as string)}) menjadi ${p.ipAddress} (mask: ${mask})${defaultGw ? ` dan Default Gateway: ${defaultGw}` : ''}.`
        );
      }

      // Sub-interfaces (Router-on-a-Stick)
      if (Array.isArray(p.subInterfaces)) {
        p.subInterfaces.forEach((sub: Record<string, unknown>) => {
          if (sub.ipAddress && typeof sub.ipAddress === 'string' && sub.ipAddress.trim()) {
            const subMask = (sub.subnetMask as string) || '255.255.255.0';
            targets.push({
              id: `tgt-ip-${n.id}-${(p.id as string) || 'port'}-vlan-${sub.vlanId}`,
              title: `Konfigurasi IP Sub-Interface ${label} (${(p.name as string) || (p.id as string)}.${sub.vlanId}): ${sub.ipAddress}`,
              type: 'device_config',
              deviceId: label,
              address: sub.ipAddress.trim(),
              subnetMask: subMask,
            });
            instructionsList.push(
              `${step++}. Atur IP Sub-Interface VLAN ${sub.vlanId} pada ${label} (${(p.name as string) || (p.id as string)}.${sub.vlanId}) menjadi ${sub.ipAddress} (mask: ${subMask}).`
            );
          }
        });
      }
    });
  });

  // 3. Ekstrak Kuota Perangkat (required_device_count) jika belum ada target lain
  if (targets.length === 0) {
    nodeTypeCount.forEach((count, devType) => {
      targets.push({
        id: `tgt-count-${devType}`,
        title: `Tempatkan ${count} perangkat tipe ${devType.toUpperCase()}`,
        type: 'required_device_count',
        deviceType: devType,
        count,
      });
      instructionsList.push(
        `${step++}. Letakkan ${count} unit ${devType.toUpperCase()} pada kanvas simulasi.`
      );
    });
  }

  // Ringkasan Perangkat untuk Judul Otomatis
  const deviceSummaryParts: string[] = [];
  nodeTypeCount.forEach((count, type) => {
    deviceSummaryParts.push(`${count} ${type.toUpperCase()}`);
  });
  const summaryStr = deviceSummaryParts.join(' + ') || 'Jaringan Dasar';

  const title =
    customTitle?.trim() || `Tantangan Topologi Guru: ${summaryStr}`;

  const instructions =
    customInstructions?.trim() ||
    `Panduan Tugas Praktikum:\n${instructionsList.length > 0 ? instructionsList.join('\n') : 'Susun perangkat sesuai topologi yang diarahkan oleh guru.'}\n\nSetelah selesai, klik tombol "Kirim Jawaban (Submit)" untuk dinilai secara otomatis.`;

  return {
    id: `ex-topo-${Date.now()}`,
    title,
    instructions,
    difficulty: 'Menengah',
    targets,
    starterTopology: {
      nodes: cleanNodesForStarterTopology(nodes as unknown as Node<DeviceData>[]),
      edges: JSON.parse(JSON.stringify(edges)) as Edge[],
    },
  };
}
