import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { PacketAnimation } from './PacketAnimation';
import { packetColor as protocolColor, SELECTED_LINK_COLOR } from './packetColors';

/**
 * Asosiasi nirkabel (klien WiFi <-> radio Access Point): garis putus-putus
 * dengan badge SSID. Animasi paket tetap berjalan di sepanjang asosiasi.
 */

const WIFI_COLOR = 'var(--viz-violet)';
const packetColor = (protocol: string | undefined): string => protocolColor(protocol, WIFI_COLOR);

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

  const { activePackets, disconnectEdge, simulationStatus } = useAppStore();

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
  const color = activePacket
    ? packetColor(activePacket.currentProtocol)
    : selected
    ? SELECTED_LINK_COLOR
    : WIFI_COLOR;

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
        stroke={color}
        strokeWidth={isEmphasized ? 8 : 6}
        strokeOpacity={isEmphasized ? 0.35 : 0.15}
        strokeDasharray="2 8"
        strokeLinecap="round"
        className="pointer-events-none transition-all duration-200"
      />

      <BaseEdge
        id={`wifi-path-${id}`}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: isEmphasized ? 3 : 2.5,
          strokeDasharray: '7 6',
        }}
      />

      {/* Paket berjalan di sepanjang asosiasi */}
      {activePacket && <PacketAnimation
        key={`${activePacket.packetId}:${activePacket.sourceNodeId}:${activePacket.targetNodeId}:${activePacket.sourcePortId}:${activePacket.targetPortId}`}
        path={edgePath}
        color={color}
        forward={Boolean(isForwardDirection)}
      />}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: shouldShowBadge ? 1 : 0,
            pointerEvents: shouldShowBadge ? 'all' : 'none',
            transformOrigin: 'center center',
            borderColor: color,
          }}
          className={`nodrag nopan flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] font-mono text-foreground border-2 shadow-xl transition-all duration-200 cursor-pointer ${
            activePacket ? 'scale-110' : ''
          }`}
        >
          <span
            className={`flex h-2 w-2 rounded-full ${activePacket ? (simulationStatus === 'paused' ? '' : 'animate-ping') : 'animate-pulse'}`}
            style={{ backgroundColor: color }}
          />
          <span className="font-bold font-sans tracking-wide" style={{ color: activePacket ? color : WIFI_COLOR }}>
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
