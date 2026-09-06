import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  BackgroundVariant,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../../store/useAppStore';
import { DeviceNode } from './DeviceNode';
import { NetworkCableEdge } from './NetworkCableEdge';
import { WirelessLinkEdge } from './WirelessLinkEdge';

const nodeTypes = {
  deviceNode: DeviceNode,
};

const edgeTypes = {
  networkCable: NetworkCableEdge,
  wirelessLink: WirelessLinkEdge,
};

export function TopologyCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connectPorts,
    associateWireless,
    setSelectedNodeId,
    activePackets,
  } = useAppStore();

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
          'Asosiasi WiFi gagal — SSID klien dan radio AP harus cocok. Detail di Log Event.'
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
        'Koneksi kabel gagal — port mungkin sudah terpakai (1 kabel per port). Detail di Log Event.'
      );
    }
  };

  return (
    <div className="relative h-full w-full bg-[#0B0F19]">
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
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'networkCable',
        }}
      >
        <Background
          color="#374151"
          gap={20}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />
        <Controls />
        <MiniMap
          maskColor="rgb(11 15 25 / 0.72)"
          nodeColor={(n) => {
            if (n.data?.type === 'pc') return '#38BDF8';
            if (n.data?.type === 'laptop') return '#22D3EE';
            if (n.data?.type === 'server') return '#A78BFA';
            if (n.data?.type === 'switch') return '#10B981';
            if (n.data?.type === 'hub') return '#FB923C';
            if (n.data?.type === 'accessPoint') return '#E879F9';
            if (n.data?.type === 'cloud') return '#60A5FA';
            return '#F59E0B';
          }}
          className="!border-[#374151] !bg-[#111827]"
        />
      </ReactFlow>

      {/* Packet In-Flight Indicators / Notification banner */}
      {activePackets.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-emerald-500/50 bg-[#111827]/90 px-4 py-1.5 shadow-lg backdrop-blur-sm">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-gray-200">
            {activePackets[0]?.summary || 'Paket sedang dikirim...'}
          </span>
        </div>
      )}
    </div>
  );
}
