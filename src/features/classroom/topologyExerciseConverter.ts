import type { Exercise, ExerciseTarget } from './types';
import type { DeviceType } from '../../types/network';

export interface TopologyData {
  nodes: any[];
  edges: any[];
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
export function cleanNodesForStarterTopology(nodes: any[]): any[] {
  return nodes.map((node) => {
    const cloned = JSON.parse(JSON.stringify(node));
    if (cloned.data) {
      delete cloned.data.defaultGateway;
      delete cloned.data.staticRoutes;
      delete cloned.data.ripEnabled;
      if (Array.isArray(cloned.data.ports)) {
        cloned.data.ports.forEach((p: any) => {
          delete p.ipAddress;
          delete p.subnetMask;
          if (Array.isArray(p.subInterfaces)) {
            p.subInterfaces.forEach((sub: any) => {
              delete sub.ipAddress;
              delete sub.subnetMask;
            });
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
    const label = n.data?.label || n.id || 'Perangkat';
    nodeLabelMap.set(n.id, label);

    const type = (n.data?.type || 'pc') as DeviceType;
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
    const label = n.data?.label || n.id || 'Perangkat';
    const ports = Array.isArray(n.data?.ports) ? n.data.ports : [];
    const defaultGw =
      typeof n.data?.defaultGateway === 'string' && n.data.defaultGateway.trim()
        ? n.data.defaultGateway.trim()
        : undefined;

    ports.forEach((p: any) => {
      if (p.ipAddress && typeof p.ipAddress === 'string' && p.ipAddress.trim()) {
        const mask = p.subnetMask || '255.255.255.0';
        targets.push({
          id: `tgt-ip-${n.id}-${p.id || 'port'}`,
          title: `Konfigurasi IP ${label} (${p.name || p.id}): ${p.ipAddress}`,
          type: 'device_config',
          deviceId: label,
          address: p.ipAddress.trim(),
          subnetMask: mask,
          gateway: defaultGw,
        });

        instructionsList.push(
          `${step++}. Atur IP Address pada ${label} (${p.name || p.id}) menjadi ${p.ipAddress} (mask: ${mask})${defaultGw ? ` dan Default Gateway: ${defaultGw}` : ''}.`
        );
      }

      // Sub-interfaces (Router-on-a-Stick)
      if (Array.isArray(p.subInterfaces)) {
        p.subInterfaces.forEach((sub: any) => {
          if (sub.ipAddress && typeof sub.ipAddress === 'string' && sub.ipAddress.trim()) {
            const subMask = sub.subnetMask || '255.255.255.0';
            targets.push({
              id: `tgt-ip-${n.id}-${p.id || 'port'}-vlan-${sub.vlanId}`,
              title: `Konfigurasi IP Sub-Interface ${label} (${p.name || p.id}.${sub.vlanId}): ${sub.ipAddress}`,
              type: 'device_config',
              deviceId: label,
              address: sub.ipAddress.trim(),
              subnetMask: subMask,
            });
            instructionsList.push(
              `${step++}. Atur IP Sub-Interface VLAN ${sub.vlanId} pada ${label} (${p.name || p.id}.${sub.vlanId}) menjadi ${sub.ipAddress} (mask: ${subMask}).`
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
      nodes: cleanNodesForStarterTopology(nodes),
      edges: JSON.parse(JSON.stringify(edges)),
    },
  };
}
