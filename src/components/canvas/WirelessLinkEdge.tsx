import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Asosiasi nirkabel (klien WiFi <-> radio Access Point): garis putus-putus
 * dengan badge SSID. Animasi paket tetap berjalan di sepanjang asosiasi.
 */

const PROTOCOL_COLORS: Record<string, string> = {
  ARP: '#10B981',
  ICMP: '#06B6D4',
  DHCP: '#F59E0B',
  RIP: '#A78BFA',
};
const packetColor = (protocol: string | undefined): string =>
  PROTOCOL_COLORS[protocol ?? ''] ?? '#8B5CF6';

export function WirelessLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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

  const ssid = (data?.ssid as string | undefined) ?? 'WiFi';

  const activePacket = (activePackets || []).find((pkt) => {
    if (!pkt) return false;
    const isForward = pkt.sourceNodeId === source && pkt.targetNodeId === target;
    const isReverse = pkt.sourceNodeId === target && pkt.targetNodeId === source;
    return isForward || isReverse;
  });

  const isForwardDirection = activePacket && activePacket.sourceNodeId === source;
  // Badge tampil HANYA jika asosiasi diklik (terpilih) atau ada paket aktif — tanpa hover
  const shouldShowBadge = Boolean(activePacket || selected);
  const isEmphasized = Boolean(activePacket || selected);
  const color = activePacket ? packetColor(activePacket.currentProtocol) : '#8B5CF6';

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={interactionWidth}
        className="react-flow__edge-interaction cursor-pointer"
      />

      {/* Halo sinyal */}
      <path
        d={edgePath}
        fill="none"
        stroke={activePacket ? color : selected ? '#A78BFA' : '#8B5CF6'}
        strokeWidth={isEmphasized ? 8 : 6}
        strokeOpacity={isEmphasized ? 0.5 : 0.15}
        strokeDasharray="2 8"
        strokeLinecap="round"
        className="pointer-events-none transition-all duration-200"
      />

      <BaseEdge
        id={`wifi-path-${id}`}
        path={edgePath}
        style={{
          stroke: activePacket ? color : selected ? '#A78BFA' : '#8B5CF6',
          strokeWidth: isEmphasized ? 3 : 2.5,
          strokeDasharray: '7 6',
        }}
      />

      {/* Paket berjalan di sepanjang asosiasi */}
      {activePacket && (
        <g className="pointer-events-none">
          <circle r="7" fill={color}>
            <animateMotion
              path={edgePath}
              dur="0.8s"
              repeatCount="indefinite"
              keyPoints={isForwardDirection ? '0;1' : '1;0'}
              keyTimes="0;1"
            />
          </circle>
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
              stroke={color}
              strokeWidth="2"
            />
            <line x1="-9" y1="-6" x2="0" y2="1" stroke={color} strokeWidth="1.5" />
            <line x1="9" y1="-6" x2="0" y2="1" stroke={color} strokeWidth="1.5" />
          </g>
        </g>
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: shouldShowBadge ? 1 : 0,
            pointerEvents: shouldShowBadge ? 'all' : 'none',
            transformOrigin: 'center center',
          }}
          className={`nodrag nopan flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono text-gray-100 border-2 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer ${
            activePacket
              ? 'bg-violet-950/95 border-violet-400 scale-110 shadow-violet-500/50'
              : 'bg-[#111827]/95 border-violet-500/80'
          }`}
        >
          <span
            className={`flex h-2 w-2 rounded-full ${
              activePacket ? 'bg-violet-300 animate-ping' : 'bg-violet-400 animate-pulse'
            }`}
          />
          <span className="font-bold text-violet-300 font-sans tracking-wide">
            {activePacket ? activePacket.type : `WiFi: ${ssid}`}
          </span>
          {/* Tombol putus asosiasi — hanya saat dipilih */}
          {selected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                disconnectEdge(id);
              }}
              title="Putus asosiasi WiFi ini"
              aria-label="Putus asosiasi WiFi"
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
