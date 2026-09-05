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

const nodeTypes = {
  deviceNode: DeviceNode,
};

const edgeTypes = {
  networkCable: NetworkCableEdge,
};

export function TopologyCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    connectPorts,
    setSelectedNodeId,
    activePackets,
  } = useAppStore();

  const handleConnect = (params: Connection) => {
    if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) {
      return;
    }
    connectPorts(
      params.source,
      params.sourceHandle,
      params.target,
      params.targetHandle
    );
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
        <Controls className="!border-[#374151] !bg-[#1F2937] !text-gray-200" />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.type === 'pc') return '#38BDF8';
            if (n.data?.type === 'switch') return '#10B981';
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
