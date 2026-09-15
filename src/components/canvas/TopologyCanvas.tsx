import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  BackgroundVariant,
  ConnectionMode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Terminal, Settings, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    selectedNodeId,
    setSelectedNodeId,
    setActiveConfigModalNodeId,
    setActiveCliModalNodeId,
    deleteNode,
    requestConfirm,
    activePackets,
  } = useAppStore();

  const selectedNode = nodes.find(
    (n) => n.id === selectedNodeId && n.type === 'deviceNode'
  );

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
          color="var(--color-border)"
          gap={20}
          size={1.5}
          variant={BackgroundVariant.Dots}
        />
        {/* Anak langsung <ReactFlow> sudah berada di dalam provider-nya */}
        <FitViewOnTopologyLoad />
        <Controls />
        <MiniMap
          maskColor="rgb(11 15 25 / 0.72)"
          nodeColor={(n) => {
            if (n.data?.nodeKind === 'square') return '#64748B';
            if (n.data?.nodeKind === 'text') return '#93C5FD';
            if (n.data?.type === 'pc') return '#38BDF8';
            if (n.data?.type === 'laptop') return '#22D3EE';
            if (n.data?.type === 'server') return '#A78BFA';
            if (n.data?.type === 'switch') return '#10B981';
            if (n.data?.type === 'hub') return '#FB923C';
            if (n.data?.type === 'accessPoint') return '#E879F9';
            if (n.data?.type === 'cloud') return '#60A5FA';
            return '#F59E0B';
          }}
          className="!hidden sm:!block !border-border !bg-popover"
        />
      </ReactFlow>

      {/* Floating Action Bar untuk Perangkat Terpilih (Sangat mudah dijangkau di Mobile & Layar Sentuh) */}
      {selectedNode && (
        <div className="absolute bottom-12 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 rounded-full border border-primary/50 bg-background/95 px-3 sm:px-4 py-1.5 sm:py-2 shadow-2xl backdrop-blur-md max-w-[95vw] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-1.5 pr-2 border-r border-border text-xs font-bold text-foreground shrink-0">
            <span className="font-mono text-xs truncate max-w-[90px] sm:max-w-none">
              {(selectedNode.data as any)?.label || 'Perangkat'}
            </span>
            <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1 py-0 hidden xs:inline-flex">
              {(selectedNode.data as any)?.type}
            </Badge>
          </div>

          <Button
            size="sm"
            onClick={() => setActiveCliModalNodeId(selectedNode.id)}
            className="h-7 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0 shadow-xs touch-manipulation cursor-pointer"
            title="Buka Terminal CLI Cisco"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Terminal CLI</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveConfigModalNodeId(selectedNode.id)}
            className="h-7 gap-1.5 text-xs shrink-0 touch-manipulation cursor-pointer"
            title="Konfigurasi Perangkat (GUI)"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Konfigurasi</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const devLabel = (selectedNode.data as any)?.label || 'perangkat';
              requestConfirm({
                title: 'Hapus Perangkat',
                message: `Hapus ${devLabel}? Kabel yang terhubung juga akan dilepas.`,
                confirmLabel: 'Hapus',
                onConfirm: () => {
                  deleteNode(selectedNode.id);
                  setSelectedNodeId(null);
                },
              });
            }}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 shrink-0 touch-manipulation cursor-pointer"
            title="Hapus Perangkat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedNodeId(null)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0 touch-manipulation cursor-pointer"
            title="Tutup Bar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Packet In-Flight Indicators / Notification banner */}
      {activePackets.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-emerald-500/50 bg-popover/90 px-4 py-1.5 shadow-lg backdrop-blur-sm">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-foreground">
            {activePackets[0]?.summary || 'Paket sedang dikirim...'}
          </span>
        </div>
      )}
    </div>
  );
}
