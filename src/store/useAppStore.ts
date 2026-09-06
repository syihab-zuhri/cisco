import { create } from 'zustand';
import {
  type Node,
  type Edge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import {
  type DeviceData,
  type DeviceType,
  type PhysicalPort,
  type SimulationEventLog,
  type SimulationStatus,
  type SimulationSpeed,
  type PacketHopPayload,
  type RoutingEntry,
} from '../types/network';
import { generateMacAddress } from '../utils/ipUtils';
import { type SimEvent } from '../types/protocol';
import { LAB_SCENARIOS, evaluateLab, type LabScenario } from '../data/labs';

export interface ToastItem {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface AppStoreState {
  // Canvas State
  nodes: Node<DeviceData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  activeConfigModalNodeId: string | null;
  activeCliModalNodeId: string | null;

  // Simulation State
  simulationStatus: SimulationStatus;
  simulationSpeed: SimulationSpeed;
  simulationLogs: SimulationEventLog[];
  activePackets: PacketHopPayload[];

  // Topology Actions
  onNodesChange: (changes: NodeChange<Node<DeviceData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  addDevice: (type: DeviceType, position: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setActiveConfigModalNodeId: (id: string | null) => void;
  setActiveCliModalNodeId: (id: string | null) => void;

  // Port and Device Config Actions
  updatePortConfig: (
    nodeId: string,
    portId: string,
    updates: Partial<PhysicalPort>
  ) => void;
  updateDeviceConfig: (
    nodeId: string,
    updates: Partial<Omit<DeviceData, 'ports' | 'id' | 'type'>>
  ) => void;
  connectPorts: (
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ) => boolean;
  /** Asosiasi WiFi: klien (wla0) ke radio Access Point — validasi SSID & kardinalitas. */
  associateWireless: (
    clientNodeId: string,
    clientPortId: string,
    apNodeId: string,
    apPortId: string
  ) => boolean;
  /** Setelah SSID klien berubah: putus asosiasi lama & cari AP dengan SSID cocok. */
  syncWirelessAssociation: (nodeId: string, portId: string) => void;
  /** Setelah SSID AP berubah: validasi ulang semua klien yang terasosiasi. */
  revalidateWirelessClients: () => void;
  disconnectEdge: (edgeId: string) => void;
  addStaticRoute: (nodeId: string, route: RoutingEntry) => void;
  removeStaticRoute: (nodeId: string, index: number) => void;

  // Simulation Actions
  setSimulationStatus: (status: SimulationStatus) => void;
  setSimulationSpeed: (speed: SimulationSpeed) => void;
  addSimulationLog: (type: SimulationEventLog['type'], message: string) => void;
  clearSimulationLogs: () => void;
  setActivePackets: (packets: PacketHopPayload[]) => void;

  // Simulation Mode (v1.2.0): timeline event, step mode, PDU inspector
  stepMode: boolean;
  setStepMode: (enabled: boolean) => void;
  simPlan: SimEvent[];
  simPlayedUpTo: number;
  setSimPlan: (events: SimEvent[]) => void;
  markSimEventPlayed: (event: SimEvent) => void;
  inspectorEvent: SimEvent | null;
  inspectorOpen: boolean;
  inspectorAutoFollow: boolean;
  setInspectorEvent: (event: SimEvent | null) => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorAutoFollow: (value: boolean) => void;

  // Mode Lab Praktikum (P1): topologi terkunci + verifikasi otomatis
  activeLabId: string | null;
  labCompleted: Record<string, boolean>;
  lastPingResult: { sourceNodeId: string; targetIp: string; success: boolean } | null;
  startLab: (lab: LabScenario) => void;
  stopLab: () => void;
  setLastPingResult: (result: { sourceNodeId: string; targetIp: string; success: boolean }) => void;
  checkLabObjectives: () => void;

  // Anotasi kanvas (v1.4.0): square & teks custom di belakang perangkat
  addSquare: (position: { x: number; y: number }) => void;
  addText: (position: { x: number; y: number }) => void;
  updateAnnotation: (
    nodeId: string,
    updates: Partial<Pick<DeviceData, 'fill' | 'stroke' | 'width' | 'height' | 'text' | 'fontSize'>>
  ) => void;

  // Import / Export / Reset
  /** Naik setiap kali topologi baru dimuat (template/import/lab) — pemicu fitView kanvas. */
  topologyVersion: number;
  loadTopology: (data: { nodes: Node<DeviceData>[]; edges: Edge[] }) => void;
  resetTopology: () => void;

  // Toast ringan (ganti alert()) & konfirmasi aksi destruktif
  toasts: ToastItem[];
  pushToast: (type: ToastItem['type'], message: string, durationMs?: number) => void;
  dismissToast: (id: string) => void;
  confirmRequest: ConfirmRequest | null;
  requestConfirm: (req: ConfirmRequest) => void;
  cancelConfirm: () => void;
}

const createDefaultPorts = (type: DeviceType): PhysicalPort[] => {
  if (type === 'pc' || type === 'laptop' || type === 'server') {
    const ports: PhysicalPort[] = [
      {
        id: 'fa0',
        name: 'FastEthernet 0',
        status: 'down',
        kind: 'ethernet',
        macAddress: generateMacAddress(),
      },
    ];
    // PC & Laptop punya adapter WiFi; server hanya kabel
    if (type === 'pc' || type === 'laptop') {
      ports.push({
        id: 'wla0',
        name: 'Wireless Adapter',
        status: 'down',
        kind: 'wireless',
        macAddress: generateMacAddress(),
        ssid: '',
      });
    }
    return ports;
  }
  if (type === 'switch' || type === 'hub') {
    return Array.from({ length: 8 }, (_, i) => ({
      id: `fa0/${i + 1}`,
      name: `FastEthernet 0/${i + 1}`,
      status: 'down' as const,
      kind: 'ethernet' as const,
      macAddress: generateMacAddress(),
    }));
  }
  if (type === 'accessPoint') {
    return [
      {
        id: 'radio0',
        name: 'Radio 0 (2.4 GHz)',
        status: 'up',
        kind: 'wireless',
        macAddress: generateMacAddress(),
        ssid: 'OpenPacket-WiFi',
      },
      {
        id: 'fa0',
        name: 'FastEthernet 0 (Uplink)',
        status: 'down',
        kind: 'ethernet',
        macAddress: generateMacAddress(),
      },
    ];
  }
  if (type === 'cloud') {
    return [
      { id: 'wan0', name: 'WAN 0', status: 'down', kind: 'ethernet', macAddress: generateMacAddress() },
      { id: 'wan1', name: 'WAN 1', status: 'down', kind: 'ethernet', macAddress: generateMacAddress() },
    ];
  }
  // Router
  return [
    {
      id: 'fa0/0',
      name: 'FastEthernet 0/0',
      status: 'down',
      kind: 'ethernet',
      macAddress: generateMacAddress(),
    },
    {
      id: 'fa0/1',
      name: 'FastEthernet 0/1',
      status: 'down',
      kind: 'ethernet',
      macAddress: generateMacAddress(),
    },
    {
      id: 'fa0/2',
      name: 'FastEthernet 0/2',
      status: 'down',
      kind: 'ethernet',
      macAddress: generateMacAddress(),
    },
  ];
};

const DEVICE_LABEL_PREFIX: Record<DeviceType, string> = {
  pc: 'PC',
  laptop: 'Laptop',
  server: 'Server',
  switch: 'Switch',
  hub: 'Hub',
  accessPoint: 'AP',
  cloud: 'Cloud',
  router: 'Router',
};

const EMPTY_DEVICE_COUNTERS: Record<DeviceType, number> = {
  pc: 0,
  laptop: 0,
  server: 0,
  switch: 0,
  hub: 0,
  accessPoint: 0,
  cloud: 0,
  router: 0,
};

let deviceCounters: Record<DeviceType, number> = { ...EMPTY_DEVICE_COUNTERS };

export const useAppStore = create<AppStoreState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  activeConfigModalNodeId: null,
  activeCliModalNodeId: null,

  simulationStatus: 'idle',
  simulationSpeed: 1,
  simulationLogs: [],
  activePackets: [],

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    // Check if any edges are being removed to bring down port status
    const removedEdgeIds = changes
      .filter((c) => c.type === 'remove')
      .map((c) => c.id);

    if (removedEdgeIds.length > 0) {
      removedEdgeIds.forEach((edgeId) => {
        get().disconnectEdge(edgeId);
      });
    }

    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  addDevice: (type, position) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — tidak bisa menambah perangkat.');
      return;
    }
    deviceCounters[type] += 1;
    const label = `${DEVICE_LABEL_PREFIX[type]}-${deviceCounters[type]}`;
    const id = `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newNode: Node<DeviceData> = {
      id,
      type: 'deviceNode',
      position,
      data: {
        id,
        label,
        type,
        ports: createDefaultPorts(type),
        routes: type === 'router' ? [] : undefined,
        macTable: type === 'switch' ? {} : undefined,
        arpTable: {},
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));

    get().addSimulationLog('INFO', `Perangkat baru ditambahkan: ${label}`);
  },

  deleteNode: (nodeId) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — tidak bisa menghapus perangkat.');
      return;
    }
    const node = get().nodes.find((n) => n.id === nodeId);
    const connectedEdges = get().edges.filter(
      (e) => e.source === nodeId || e.target === nodeId
    );
    // Lepas kabel dulu agar port perangkat lawan kembali ke DOWN...
    connectedEdges.forEach((edge) => get().disconnectEdge(edge.id));

    // ...lalu hapus node dari STATE TERKINI (bukan snapshot lama),
    // supaya reset status port tidak tertimpa data basi.
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
    }));
    get().addSimulationLog('INFO', `Perangkat ${node?.data.label ?? nodeId} dihapus.`);
  },

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setActiveConfigModalNodeId: (id) => set({ activeConfigModalNodeId: id }),
  setActiveCliModalNodeId: (id) => set({ activeCliModalNodeId: id }),

  updatePortConfig: (nodeId, portId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ports: node.data.ports.map((port) =>
              port.id === portId ? { ...port, ...updates } : port
            ),
          },
        };
      }),
    }));
  },

  updateDeviceConfig: (nodeId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...updates,
          },
        };
      }),
    }));
  },

  connectPorts: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — kabel tidak bisa diubah.');
      return false;
    }
    const { nodes, edges } = get();
    if (sourceNodeId === targetNodeId) return false;

    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!sourceNode || !targetNode) return false;

    const sPort = sourceNode.data.ports.find((p) => p.id === sourcePortId);
    const tPort = targetNode.data.ports.find((p) => p.id === targetPortId);
    if (!sPort || !tPort) return false;

    if (sPort.kind === 'wireless' || tPort.kind === 'wireless') {
      get().addSimulationLog(
        'ERROR',
        'Port nirkabel tidak bisa dikabel — gunakan asosiasi WiFi (SSID harus cocok).'
      );
      return false;
    }

    if (sPort.connectedEdgeId || tPort.connectedEdgeId) {
      return false; // Port already bound (INV-003)
    }

    const edgeId = `edge-${sourceNodeId}-${sourcePortId}-${targetNodeId}-${targetPortId}`;

    // Update port states to Link UP
    get().updatePortConfig(sourceNodeId, sourcePortId, {
      status: 'up',
      connectedEdgeId: edgeId,
      connectedToNodeId: targetNodeId,
      connectedToPortId: targetPortId,
    });

    get().updatePortConfig(targetNodeId, targetPortId, {
      status: 'up',
      connectedEdgeId: edgeId,
      connectedToNodeId: sourceNodeId,
      connectedToPortId: sourcePortId,
    });

    const newEdge: Edge = {
      id: edgeId,
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: sourcePortId,
      targetHandle: targetPortId,
      type: 'networkCable',
      data: {
        sourcePortName: sPort.name,
        targetPortName: tPort.name,
      },
      style: { stroke: '#10B981', strokeWidth: 2 },
    };

    set({ edges: [...edges, newEdge] });
    get().addSimulationLog(
      'INFO',
      `Kabel terhubung: ${sourceNode.data.label} (${sPort.name}) <--> ${targetNode.data.label} (${tPort.name})`
    );
    return true;
  },

  associateWireless: (clientNodeId, clientPortId, apNodeId, apPortId) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — asosiasi WiFi tidak bisa diubah.');
      return false;
    }
    const { nodes } = get();
    const clientNode = nodes.find((n) => n.id === clientNodeId);
    const apNode = nodes.find((n) => n.id === apNodeId);
    if (!clientNode || !apNode) return false;

    const clientPort = clientNode.data.ports.find((p) => p.id === clientPortId);
    const apPort = apNode.data.ports.find((p) => p.id === apPortId);
    if (!clientPort || !apPort) return false;

    if (clientPort.kind !== 'wireless' || apPort.kind !== 'wireless') {
      get().addSimulationLog('ERROR', 'Asosiasi WiFi hanya berlaku untuk port nirkabel.');
      return false;
    }
    if (apNode.data.type !== 'accessPoint') {
      get().addSimulationLog('ERROR', `${apNode.data.label} bukan Access Point.`);
      return false;
    }
    if ((clientPort.ssid ?? '') !== (apPort.ssid ?? '')) {
      get().addSimulationLog(
        'ERROR',
        `SSID tidak cocok: klien "${clientPort.ssid ?? ''}" vs AP "${apPort.ssid ?? ''}".`
      );
      return false;
    }

    // INV-003 (amandemen): klien 1-to-1 (asosiasi lama diputus otomatis),
    // radio AP bersifat 1-ke-N dan tidak menyimpan binding.
    if (clientPort.connectedEdgeId) {
      get().disconnectEdge(clientPort.connectedEdgeId);
    }

    const edgeId = `wifi-${clientNodeId}-${clientPortId}-${apNodeId}-${apPortId}`;
    get().updatePortConfig(clientNodeId, clientPortId, {
      status: 'up',
      connectedEdgeId: edgeId,
      connectedToNodeId: apNodeId,
      connectedToPortId: apPortId,
    });

    const newEdge: Edge = {
      id: edgeId,
      source: clientNodeId,
      target: apNodeId,
      sourceHandle: clientPortId,
      targetHandle: apPortId,
      type: 'wirelessLink',
      data: {
        sourcePortName: clientPort.name,
        targetPortName: apPort.name,
        ssid: apPort.ssid ?? '',
      },
    };
    set({ edges: [...get().edges, newEdge] });
    get().addSimulationLog(
      'SUCCESS',
      `${clientNode.data.label} terasosiasi ke ${apNode.data.label} (SSID: ${apPort.ssid}).`
    );
    return true;
  },

  syncWirelessAssociation: (nodeId, portId) => {
    const { nodes } = get();
    const node = nodes.find((n) => n.id === nodeId);
    const port = node?.data.ports.find((p) => p.id === portId);
    if (!node || !port || port.kind !== 'wireless') return;

    if (port.connectedEdgeId) {
      get().disconnectEdge(port.connectedEdgeId);
    }

    const ssid = (port.ssid ?? '').trim();
    if (!ssid) {
      get().addSimulationLog('INFO', `${node.data.label}: WiFi terputus (SSID kosong).`);
      return;
    }

    for (const other of nodes) {
      if (other.id === nodeId || other.data.type !== 'accessPoint') continue;
      const radio = other.data.ports.find((p) => p.kind === 'wireless');
      if (radio && (radio.ssid ?? '') === ssid) {
        get().associateWireless(nodeId, portId, other.id, radio.id);
        return;
      }
    }
    get().addSimulationLog(
      'ERROR',
      `${node.data.label}: Tidak ada Access Point dengan SSID "${ssid}".`
    );
  },

  revalidateWirelessClients: () => {
    const { edges } = get();
    const boundClients = edges
      .filter((e) => e.type === 'wirelessLink')
      .map((e) => ({ nodeId: e.source, portId: e.sourceHandle as string }));
    for (const { nodeId, portId } of boundClients) {
      get().syncWirelessAssociation(nodeId, portId);
    }
  },

  disconnectEdge: (edgeId) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — kabel tidak bisa dilepas.');
      return;
    }
    const { edges } = get();
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;

    const isWireless = edge.type === 'wirelessLink';

    // Sisi klien/kabel sumber selalu direset.
    if (edge.source && edge.sourceHandle) {
      get().updatePortConfig(edge.source, edge.sourceHandle, {
        status: 'down',
        connectedEdgeId: undefined,
        connectedToNodeId: undefined,
        connectedToPortId: undefined,
      });
    }

    // Kabel: kedua sisi turun. Asosiasi WiFi: radio AP tetap menyala (1-ke-N).
    if (!isWireless && edge.target && edge.targetHandle) {
      get().updatePortConfig(edge.target, edge.targetHandle, {
        status: 'down',
        connectedEdgeId: undefined,
        connectedToNodeId: undefined,
        connectedToPortId: undefined,
      });
    }

    set({ edges: edges.filter((e) => e.id !== edgeId) });
    get().addSimulationLog(
      'INFO',
      isWireless ? `Asosiasi ${edge.id} diputus.` : `Kabel ${edge.id} dilepas. Link DOWN.`
    );
  },

  addStaticRoute: (nodeId, route) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const currentRoutes = node.data.routes || [];
        return {
          ...node,
          data: {
            ...node.data,
            routes: [...currentRoutes, route],
          },
        };
      }),
    }));
    get().addSimulationLog(
      'INFO',
      `Route baru ditambahkan pada ${nodeId}: ${route.network}/${route.subnetMask} via ${route.nextHop}`
    );
  },

  removeStaticRoute: (nodeId, index) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const currentRoutes = [...(node.data.routes || [])];
        currentRoutes.splice(index, 1);
        return {
          ...node,
          data: {
            ...node.data,
            routes: currentRoutes,
          },
        };
      }),
    }));
  },

  setSimulationStatus: (status) => set({ simulationStatus: status }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
  addSimulationLog: (type, message) => {
    const log: SimulationEventLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      message,
    };
    set((state) => ({
      simulationLogs: [log, ...state.simulationLogs].slice(0, 100),
    }));
  },
  clearSimulationLogs: () => set({ simulationLogs: [] }),
  setActivePackets: (packets) => set({ activePackets: packets }),

  stepMode: false,
  setStepMode: (enabled) => set({ stepMode: enabled }),
  simPlan: [],
  simPlayedUpTo: 0,
  setSimPlan: (events) =>
    set({
      simPlan: events,
      simPlayedUpTo: 0,
      inspectorAutoFollow: true,
      inspectorEvent: events[0] ?? null,
    }),
  markSimEventPlayed: (event) => {
    set((state) => {
      const next: Partial<AppStoreState> = { simPlayedUpTo: event.seq };
      if (state.inspectorAutoFollow) next.inspectorEvent = event;
      return next;
    });

    // Terapkan efek tabel (CAM/ARP) agar Table Viewer hidup selama playback
    const effects = event.effects ?? [];
    if (effects.length > 0) {
      set((state) => ({
        nodes: state.nodes.map((node) => {
          const nodeEffects = effects.filter((e) => e.nodeId === node.id);
          if (nodeEffects.length === 0) return node;
          let ports = node.data.ports;
          let arpTable = node.data.arpTable;
          let macTable = node.data.macTable;
          for (const eff of nodeEffects) {
            if (eff.type === 'CAM_LEARN') {
              macTable = { ...(macTable ?? {}), [eff.mac]: eff.portId };
            } else if (eff.type === 'ARP_LEARN') {
              arpTable = { ...(arpTable ?? {}), [eff.ip]: eff.mac };
            } else if (eff.type === 'DHCP_LEASE') {
              ports = node.data.ports.map((p) =>
                p.id === eff.portId
                  ? { ...p, ipAddress: eff.ipAddress, subnetMask: eff.subnetMask }
                  : p
              );
              return {
                ...node,
                data: { ...node.data, ports, defaultGateway: eff.gateway },
              };
            } else if (eff.type === 'NAT_TRANSLATE') {
              return {
                ...node,
                data: {
                  ...node.data,
                  natTable: [
                    ...(node.data.natTable ?? []).slice(-49),
                    {
                      insideIp: eff.insideIp,
                      globalIp: eff.globalIp,
                      icmpId: eff.icmpId,
                      echoSeq: eff.echoSeq,
                    },
                  ],
                },
              };
            } else if (eff.type === 'ROUTE_LEARN') {
              const routes = [...(node.data.routes ?? [])];
              const idx = routes.findIndex(
                (r) => r.network === eff.network && r.subnetMask === eff.subnetMask
              );
              const nextRoute = {
                network: eff.network,
                subnetMask: eff.subnetMask,
                nextHop: eff.nextHop,
                interfaceId: eff.interfaceId,
                metric: eff.metric,
                source: 'rip' as const,
              };
              if (idx >= 0) {
                if ((routes[idx].metric ?? 99) > eff.metric) routes[idx] = nextRoute;
              } else {
                routes.push(nextRoute);
              }
              return { ...node, data: { ...node.data, routes } };
            }
          }
          return { ...node, data: { ...node.data, arpTable, macTable } };
        }),
      }));
    }
  },
  inspectorEvent: null,
  inspectorOpen: false,
  inspectorAutoFollow: true,
  setInspectorEvent: (event) =>
    set({ inspectorEvent: event, inspectorAutoFollow: false }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setInspectorAutoFollow: (value) => set({ inspectorAutoFollow: value }),

  activeLabId: null,
  labCompleted: {},
  lastPingResult: null,
  startLab: (lab) => {
    const nodes = JSON.parse(JSON.stringify(lab.nodes));
    const edges = JSON.parse(JSON.stringify(lab.edges));
    get().loadTopology({ nodes, edges });
    set({ activeLabId: lab.id, labCompleted: {}, lastPingResult: null });
    get().addSimulationLog('INFO', `Lab dimulai: ${lab.title} — topologi terkunci.`);
  },
  stopLab: () => {
    set({ activeLabId: null, labCompleted: {} });
    get().addSimulationLog('INFO', 'Lab dihentikan. Kanvas terbuka kembali.');
  },
  setLastPingResult: (result) => {
    set({ lastPingResult: result });
    get().checkLabObjectives();
  },
  checkLabObjectives: () => {
    const { activeLabId, nodes, lastPingResult, labCompleted } = get();
    if (!activeLabId) return;
    const lab = LAB_SCENARIOS.find((l) => l.id === activeLabId);
    if (!lab) return;
    const result = evaluateLab(lab, { nodes, lastPing: lastPingResult });
    // Monoton: objektif yang pernah terverifikasi tetap tercentang
    const merged = { ...labCompleted };
    let changed = false;
    for (const [key, value] of Object.entries(result)) {
      if (value && !merged[key]) {
        merged[key] = true;
        changed = true;
        const objective = lab.objectives.find((o) => o.id === key);
        get().addSimulationLog('SUCCESS', `Lab: objektif tercapai — ${objective?.description ?? key}`);
      }
    }
    if (changed) set({ labCompleted: merged });
  },

  addSquare: (position) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — tidak bisa menambah anotasi.');
      return;
    }
    const id = `square-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newNode: Node<DeviceData> = {
      id,
      type: 'squareNode',
      position,
      zIndex: -1, // selalu di belakang perangkat
      data: {
        id,
        label: '',
        type: 'pc',
        nodeKind: 'square',
        ports: [],
        fill: 'rgba(59,130,246,0.16)',
        stroke: '#3B82F6',
        width: 260,
        height: 160,
      },
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  addText: (position) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — tidak bisa menambah anotasi.');
      return;
    }
    const id = `text-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newNode: Node<DeviceData> = {
      id,
      type: 'textNoteNode',
      position,
      zIndex: 10, // teks di atas perangkat agar selalu terbaca
      data: {
        id,
        label: '',
        type: 'pc',
        nodeKind: 'text',
        ports: [],
        text: 'Catatan',
        fontSize: 14,
      },
    };
    set((state) => ({ nodes: [...state.nodes, newNode] }));
  },

  updateAnnotation: (nodeId, updates) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node
      ),
    }));
  },

  loadTopology: (data) => {
    if (get().activeLabId) {
      get().addSimulationLog('ERROR', 'Topologi lab terkunci — tidak bisa memuat topologi/template lain.');
      return;
    }
    // Sinkronkan counter penamaan dengan label yang dimuat agar tidak ada nama duplikat.
    const counters: Record<DeviceType, number> = { ...EMPTY_DEVICE_COUNTERS };
    for (const n of data.nodes) {
      const match = n.data.label.match(/-(\d+)\s*$/);
      if (match && n.data.type in counters) {
        counters[n.data.type] = Math.max(counters[n.data.type], parseInt(match[1], 10));
      }
    }
    deviceCounters = counters;

    // Migrasi topologi lama: PC/Laptop tanpa adapter WiFi mendapat port wla0.
    const nodes = data.nodes.map((n) => {
      if (
        (n.data.type === 'pc' || n.data.type === 'laptop') &&
        !n.data.ports.some((p) => p.id === 'wla0')
      ) {
        return {
          ...n,
          data: {
            ...n.data,
            ports: [
              ...n.data.ports,
              {
                id: 'wla0',
                name: 'Wireless Adapter',
                status: 'down' as const,
                kind: 'wireless' as const,
                macAddress: generateMacAddress(),
                ssid: '',
              },
            ],
          },
        };
      }
      return n;
    });

    set({
      nodes,
      edges: data.edges,
      selectedNodeId: null,
      topologyVersion: get().topologyVersion + 1,
    });
    get().addSimulationLog('SUCCESS', 'Topologi berhasil dimuat.');
  },

  topologyVersion: 0,

  resetTopology: () => {
    deviceCounters = { ...EMPTY_DEVICE_COUNTERS };
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      activeConfigModalNodeId: null,
      activeCliModalNodeId: null,
      simulationLogs: [],
      activePackets: [],
      simulationStatus: 'idle',
      simPlan: [],
      simPlayedUpTo: 0,
      inspectorEvent: null,
      inspectorOpen: false,
    });
    get().addSimulationLog('INFO', 'Kanvas topologi dibersihkan.');
  },

  toasts: [],
  pushToast: (type, message, durationMs) => {
    const ttl = durationMs ?? (type === 'error' ? 6000 : 4000);
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, type, message }] }));
    window.setTimeout(() => {
      useAppStore.getState().dismissToast(id);
    }, ttl);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  confirmRequest: null,
  requestConfirm: (req) => set({ confirmRequest: req }),
  cancelConfirm: () => set({ confirmRequest: null }),
}));
