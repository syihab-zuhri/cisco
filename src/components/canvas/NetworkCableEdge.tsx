import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { X, Zap } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';


const PROTOCOL_COLORS: Record<string, string> = {
  ARP: '#10B981',
  ICMP: '#06B6D4',
  DHCP: '#F59E0B',
  RIP: '#A78BFA',
};
const packetColor = (protocol: string | undefined): string =>
  PROTOCOL_COLORS[protocol ?? ''] ?? '#06B6D4';

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

  const { activePackets, disconnectEdge } = useAppStore();

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
        stroke={
          activePacket
            ? packetColor(activePacket.currentProtocol)
            : selected
            ? '#34D399'
            : '#059669'
        }
        strokeWidth={isEmphasized ? 8 : 6}
        strokeOpacity={isEmphasized ? 0.6 : 0.25}
        className="pointer-events-none transition-all duration-200"
      />

      {/* Primary visible cable line */}
      <BaseEdge
        id={pathId}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: activePacket
            ? packetColor(activePacket.currentProtocol)
            : selected
            ? '#34D399'
            : '#10B981',
          strokeWidth: isEmphasized ? 4 : 3,
          strokeDasharray: activePacket ? '8 4' : '6 3',
        }}
      />

      {/* FLYING ENVELOPE / PACKET ANIMATION ALONG SVG PATH */}
      {activePacket && (
        <g className="pointer-events-none">
          <circle r="7" fill={packetColor(activePacket.currentProtocol)}>
            <animateMotion
              path={edgePath}
              dur="0.8s"
              repeatCount="indefinite"
              keyPoints={isForwardDirection ? '0;1' : '1;0'}
              keyTimes="0;1"
            />
          </circle>

          {/* Amplop surat penanda paket PDU */}
          <g>
            <animateMotion
              path={edgePath}
              dur="0.8s"
              repeatCount="indefinite"
              keyPoints={isForwardDirection ? '0;1' : '1;0'}
              keyTimes="0;1"
            />
            <rect
              x="-11"
              y="-8"
              width="22"
              height="16"
              rx="3"
              fill="#0F172A"
              stroke={packetColor(activePacket.currentProtocol)}
              strokeWidth="2"
            />
            <line
              x1="-9"
              y1="-6"
              x2="0"
              y2="1"
              stroke={packetColor(activePacket.currentProtocol)}
              strokeWidth="1.5"
            />
            <line
              x1="9"
              y1="-6"
              x2="0"
              y2="1"
              stroke={packetColor(activePacket.currentProtocol)}
              strokeWidth="1.5"
            />
          </g>
        </g>
      )}

      {/* Interactive Label badge on the cable (SHOWS ON CLICK/SELECTED OR IN-FLIGHT) */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: shouldShowBadge ? 1 : 0,
            pointerEvents: shouldShowBadge ? 'all' : 'none',
            transformOrigin: 'center center',
          }}
          className={`nodrag nopan flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono text-gray-200 border-2 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer ${
            activePacket
              ? 'bg-blue-950/95 border-cyan-400 scale-110 shadow-cyan-500/50'
              : 'bg-[#111827]/95 border-emerald-500/80'
          }`}
        >
          <span
            className={`flex h-2 w-2 rounded-full ${
              activePacket ? 'bg-emerald-400 animate-ping' : 'bg-emerald-400 animate-pulse'
            }`}
          />
          {activePacket ? (
            <span className="font-bold text-xs text-cyan-300 font-sans tracking-wide">
              {activePacket.type}
            </span>
          ) : (
            <>
              <span className="text-emerald-300 font-bold">
                {sourcePortName || 'Port'}
              </span>
              <Zap className="h-3 w-3 text-amber-400" />
              <span className="text-emerald-300 font-bold">
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
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-950/80 text-red-300 hover:bg-red-600 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
