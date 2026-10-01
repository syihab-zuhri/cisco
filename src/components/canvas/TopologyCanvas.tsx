import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../../store/useAppStore';
import { DeviceNode } from './DeviceNode';
import { NetworkCableEdge } from './NetworkCableEdge';
import { WirelessLinkEdge } from './WirelessLinkEdge';
import { SquareNode } from './SquareNode';
import { TextNoteNode } from './TextNoteNode';

const nodeTypes = {
  deviceNode: DeviceNode,
  squareNode: SquareNode,
  textNoteNode: TextNoteNode,
};

const edgeTypes = {
  networkCable: NetworkCableEdge,
  wirelessLink: WirelessLinkEdge,
};

/** Pasang ulang fitView setiap kali topologi baru dimuat (template/import/lab). */
function FitViewOnTopologyLoad() {
  const topologyVersion = useAppStore((s) => s.topologyVersion);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (topologyVersion === 0) return;
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.15, duration: 300 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [topologyVersion, fitView]);

  return null;
}

export function TopologyCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connectPorts,
    associateWireless,
    setSelectedNodeId,
    setActiveConfigModalNodeId,
    activePackets,
  } = useAppStore();

  const isValidConnection = (connection: Connection | Edge): boolean => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      return false;
    }
    if (connection.source === connection.target) return false;
    if (useAppStore.getState().activeLabId) return false;

    const state = useAppStore.getState();
    const sNode = state.nodes.find((n) => n.id === connection.source);
    const tNode = state.nodes.find((n) => n.id === connection.target);
    if (!sNode || !tNode) return false;

    const sPort = sNode.data.ports.find((p) => p.id === connection.sourceHandle);
    const tPort = tNode.data.ports.find((p) => p.id === connection.targetHandle);
    if (!sPort || !tPort) return false;

    if (sPort.kind === 'wireless' || tPort.kind === 'wireless') {
      if (sPort.kind !== 'wireless' || tPort.kind !== 'wireless') return false;
      const sIsAp = sNode.data.type === 'accessPoint';
      const tIsAp = tNode.data.type === 'accessPoint';
      return sIsAp !== tIsAp;
    }

    if (sPort.connectedEdgeId || tPort.connectedEdgeId) return false;
    return !state.edges.some(
      (e) =>
        e.type !== 'wirelessLink' &&
        ((e.source === connection.source && e.sourceHandle === connection.sourceHandle) ||
          (e.target === connection.source && e.targetHandle === connection.sourceHandle) ||
          (e.source === connection.target && e.sourceHandle === connection.targetHandle) ||
          (e.target === connection.target && e.targetHandle === connection.targetHandle))
    );
  };

  const handleConnect = (params: Connection) => {
    if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) {
      return;
    }

    const state = useAppStore.getState();
    const findPort = (nodeId: string, portId: string) =>
      state.nodes.find((n) => n.id === nodeId)?.data.ports.find((p) => p.id === portId);

    const sourcePort = findPort(params.source, params.sourceHandle);
    const targetPort = findPort(params.target, params.targetHandle);
    const sourceIsWireless = sourcePort?.kind === 'wireless';
    const targetIsWireless = targetPort?.kind === 'wireless';

    // Asosiasi WiFi: port nirkabel hanya boleh ke radio Access Point
    if (sourceIsWireless || targetIsWireless) {
      if (!(sourceIsWireless && targetIsWireless)) {
        state.addSimulationLog(
          'ERROR',
          'Port nirkabel hanya bisa terhubung ke radio Access Point.'
        );
        state.pushToast(
          'error',
          'Port nirkabel hanya bisa terhubung ke radio Access Point.'
        );
        return;
      }
      const sourceNode = state.nodes.find((n) => n.id === params.source);
      const targetNode = state.nodes.find((n) => n.id === params.target);
      const sourceIsAp = sourceNode?.data.type === 'accessPoint';
      const targetIsAp = targetNode?.data.type === 'accessPoint';
      if (sourceIsAp === targetIsAp) {
        state.addSimulationLog('ERROR', 'Asosiasi WiFi butuh satu sisi Access Point.');
        state.pushToast(
          'error',
          'Asosiasi WiFi butuh satu sisi Access Point — sisi lainnya harus PC/Laptop/Server.'
        );
        return;
      }
      const ap = sourceIsAp
        ? { nodeId: params.source, portId: params.sourceHandle }
        : { nodeId: params.target, portId: params.targetHandle };
      const client = sourceIsAp
        ? { nodeId: params.target, portId: params.targetHandle }
        : { nodeId: params.source, portId: params.sourceHandle };
      const associated = associateWireless(
        client.nodeId,
        client.portId,
        ap.nodeId,
        ap.portId
      );
      if (!associated) {
        state.pushToast(
          'error',
          'Asosiasi WiFi gagal — SSID klien dan radio AP harus cocok. Detail di tab Simulasi.'
        );
      }
      return;
    }

    const connected = connectPorts(
      params.source,
      params.sourceHandle,
      params.target,
      params.targetHandle
    );
    if (!connected) {
      state.pushToast(
        'error',
        'Koneksi kabel gagal — port mungkin sudah terpakai (1 kabel per port). Detail di tab Simulasi.'
      );
    }
  };

  return (
    <div className="relative h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onNodeDoubleClick={(_, node) => {
          if (node.type === 'deviceNode') setActiveConfigModalNodeId(node.id);
        }}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'networkCable',
        }}
      >
        <Background
          color="var(--line)"
          gap={20}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />
        {/* Anak langsung <ReactFlow> sudah berada di dalam provider-nya */}
        <FitViewOnTopologyLoad />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.nodeKind === 'square') return 'var(--line-control)';
            if (n.data?.nodeKind === 'text') return 'var(--viz-blue)';
            if (n.data?.type === 'pc') return 'var(--viz-blue)';
            if (n.data?.type === 'laptop') return 'var(--viz-teal)';
            if (n.data?.type === 'server') return 'var(--viz-violet)';
            if (n.data?.type === 'switch') return 'var(--viz-green)';
            if (n.data?.type === 'hub') return 'var(--viz-orange)';
            if (n.data?.type === 'accessPoint') return 'var(--viz-plum)';
            if (n.data?.type === 'cloud') return 'var(--viz-blue)';
            return 'var(--gold-hover)';
          }}
          className="!hidden sm:!block !border-border !bg-popover"
        />
      </ReactFlow>

      {/* Packet In-Flight Indicators / Notification banner */}
      {activePackets.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-viz-green/50 bg-card px-4 py-1.5 shadow-lg">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-viz-green opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-viz-green"></span>
          </span>
          <span className="text-xs font-medium text-foreground">
            {activePackets[0]?.summary || 'Paket sedang dikirim...'}
          </span>
        </div>
      )}
    </div>
  );
}
