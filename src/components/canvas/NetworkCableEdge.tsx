import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { PacketAnimation } from './PacketAnimation';
import { packetColor as protocolColor, SELECTED_LINK_COLOR } from './packetColors';

const packetColor = (protocol: string | undefined): string =>
  protocolColor(protocol, 'var(--pkt-icmp)');

const CABLE_COLOR = 'var(--fg-secondary)';

export function NetworkCableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  source,
  target,
  selected,
  interactionWidth = 28,
}: EdgeProps & { interactionWidth?: number }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { activePackets, disconnectEdge, simulationStatus } = useAppStore();

  const sourcePortName = data?.sourcePortName as string | undefined;
  const targetPortName = data?.targetPortName as string | undefined;

  // Cek apakah ada paket yang sedang meluncur di kabel ini
  const activePacket = (activePackets || []).find((pkt) => {
    if (!pkt) return false;
    const isForward = pkt.sourceNodeId === source && pkt.targetNodeId === target;
    const isReverse = pkt.sourceNodeId === target && pkt.targetNodeId === source;
    return isForward || isReverse;
  });

  const isForwardDirection = activePacket && activePacket.sourceNodeId === source;

  // Badge tampil HANYA jika kabel diklik (terpilih) atau ada paket aktif — tanpa hover
  const shouldShowBadge = Boolean(activePacket || selected);
  const isEmphasized = Boolean(activePacket || selected);
  const cableColor = activePacket
    ? packetColor(activePacket.currentProtocol)
    : selected
    ? SELECTED_LINK_COLOR
    : CABLE_COLOR;

  // SVG Unique Path ID untuk <animateMotion> agar aman di semua browser
  const pathId = `cable-path-${id}`;

  return (
    <>
      {/* Invisible wide interaction path (klik untuk memilih kabel) */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={interactionWidth}
        className="react-flow__edge-interaction cursor-pointer"
      />

      {/* Glow shadow layer for cable visibility */}
      <path
        d={edgePath}
        fill="none"
        stroke={cableColor}
        strokeWidth={isEmphasized ? 8 : 6}
        strokeOpacity={isEmphasized ? 0.35 : 0.12}
        className="pointer-events-none transition-all duration-200"
      />

      {/* Primary visible cable line */}
      <BaseEdge
        id={pathId}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: cableColor,
          strokeWidth: isEmphasized ? 4 : 3,
          strokeDasharray: activePacket ? '8 4' : '6 3',
        }}
      />

      {/* FLYING ENVELOPE / PACKET ANIMATION ALONG SVG PATH */}
      {activePacket && <PacketAnimation
        key={`${activePacket.packetId}:${activePacket.sourceNodeId}:${activePacket.targetNodeId}:${activePacket.sourcePortId}:${activePacket.targetPortId}`}
        path={edgePath}
        color={packetColor(activePacket.currentProtocol)}
        forward={Boolean(isForwardDirection)}
      />}

      {/* Interactive Label badge on the cable (SHOWS ON CLICK/SELECTED OR IN-FLIGHT) */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: shouldShowBadge ? 1 : 0,
            pointerEvents: shouldShowBadge ? 'all' : 'none',
            transformOrigin: 'center center',
            borderColor: activePacket ? cableColor : undefined,
          }}
          className={`nodrag nopan flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-mono text-foreground border-2 shadow-xl transition-all duration-200 cursor-pointer ${
            activePacket ? 'scale-110' : 'border-line-strong'
          }`}
        >
          <span
            className={`flex h-2 w-2 rounded-full ${
              activePacket ? `bg-viz-green ${simulationStatus === 'paused' ? '' : 'animate-ping'}` : 'bg-viz-green animate-pulse'
            }`}
          />
          {activePacket ? (
            <span className="font-bold text-xs font-sans tracking-wide" style={{ color: cableColor }}>
              {activePacket.type}
            </span>
          ) : (
            <>
              <span className="text-foreground font-bold">
                {sourcePortName || 'Port'}
              </span>
              <Zap className="h-3 w-3 text-viz-gold" />
              <span className="text-foreground font-bold">
                {targetPortName || 'Port'}
              </span>
            </>
          )}
          {/* Tombol hapus kabel — hanya saat kabel dipilih */}
          {selected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                disconnectEdge(id);
              }}
              title="Lepas kabel ini"
              aria-label="Lepas kabel"
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-viz-red/10 text-viz-red hover:bg-viz-red hover:text-on-viz"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
