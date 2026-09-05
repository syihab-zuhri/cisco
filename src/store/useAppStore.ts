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
    return [
      {
        id: 'fa0',
        name: 'FastEthernet 0',
        status: 'down',
        macAddress: generateMacAddress(),
      },
    ];
  }
  if (type === 'switch' || type === 'hub') {
    return Array.from({ length: 8 }, (_, i) => ({
      id: `fa0/${i + 1}`,
      name: `FastEthernet 0/${i + 1}`,
      status: 'down',
      macAddress: generateMacAddress(),
    }));
  }
  // Router
  return [
    {
      id: 'fa0/0',
      name: 'FastEthernet 0/0',
      status: 'down',
      macAddress: generateMacAddress(),
    },
    {
      id: 'fa0/1',
      name: 'FastEthernet 0/1',
      status: 'down',
      macAddress: generateMacAddress(),
    },
    {
      id: 'fa0/2',
      name: 'FastEthernet 0/2',
      status: 'down',
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
  router: 'Router',
};

const EMPTY_DEVICE_COUNTERS: Record<DeviceType, number> = {
  pc: 0,
  laptop: 0,
  server: 0,
  switch: 0,
  hub: 0,
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
    const { nodes, edges } = get();
    // find connected edges
    const connectedEdges = edges.filter(
      (e) => e.source === nodeId || e.target === nodeId
    );
    connectedEdges.forEach((edge) => get().disconnectEdge(edge.id));

    set({
      nodes: nodes.filter((n) => n.id !== nodeId),
      edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
    get().addSimulationLog('INFO', `Perangkat ${nodeId} dihapus.`);
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

  disconnectEdge: (edgeId) => {
    const { edges } = get();
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;

    // Reset ports
    if (edge.source && edge.sourceHandle) {
      get().updatePortConfig(edge.source, edge.sourceHandle, {
        status: 'down',
        connectedEdgeId: undefined,
        connectedToNodeId: undefined,
        connectedToPortId: undefined,
      });
    }

    if (edge.target && edge.targetHandle) {
      get().updatePortConfig(edge.target, edge.targetHandle, {
        status: 'down',
        connectedEdgeId: undefined,
        connectedToNodeId: undefined,
        connectedToPortId: undefined,
      });
    }

    set({ edges: edges.filter((e) => e.id !== edgeId) });
    get().addSimulationLog('INFO', `Kabel ${edgeId} dilepas. Link DOWN.`);
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

    set({
      nodes: data.nodes,
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
