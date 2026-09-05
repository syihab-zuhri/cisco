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

  // Import / Export / Reset
  loadTopology: (data: { nodes: Node<DeviceData>[]; edges: Edge[] }) => void;
  resetTopology: () => void;
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

  loadTopology: (data) => {
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
    });
    get().addSimulationLog('SUCCESS', 'Topologi berhasil dimuat.');
  },

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
    });
    get().addSimulationLog('INFO', 'Kanvas topologi dibersihkan.');
  },
}));
