import { X, Pin, ScanLine } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type ArpPacket, type IcmpPacket } from '../../types/protocol';

function HeaderRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-200 break-all text-right">{value}</span>
    </div>
  );
}

function isArp(seg: ArpPacket | IcmpPacket | undefined): seg is ArpPacket {
  return seg !== undefined && (seg as ArpPacket).opcode !== undefined;
}

/**
 * PDU Inspector Drawer (PLANNING.md: "Inspector[PDU / Packet Inspector Drawer]"):
 * menampilkan header berlapis Frame (L2) → Packet (L3) → Segment (L4) untuk
 * event simulasi yang dipilih, mengikuti token warna paket DSD.
 */
export function PduInspectorDrawer() {
  const { inspectorOpen, inspectorEvent, setInspectorOpen, setInspectorAutoFollow, inspectorAutoFollow } =
    useAppStore();

  if (!inspectorOpen) return null;

  const pdu = inspectorEvent?.pdu;

  return (
    <div className="absolute right-2 top-2 bottom-2 z-20 flex w-80 flex-col rounded-lg border border-violet-800/60 bg-[#0B0F19]/95 shadow-2xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b border-gray-800 px-3">
        <div className="flex items-center gap-2">
          <ScanLine className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-200">
            PDU Inspector
          </span>
          {inspectorEvent && (
            <span className="rounded bg-gray-800 px-1.5 py-0.2 text-[9px] font-mono text-gray-400">
              seq #{inspectorEvent.seq} · t={inspectorEvent.simTimeMs}ms
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setInspectorAutoFollow(!inspectorAutoFollow)}
            title={inspectorAutoFollow ? 'Auto-follow aktif (ikuti paket berjalan)' : 'Auto-follow mati — klik event untuk memilih manual'}
            className={`rounded p-1 transition-colors ${
              inspectorAutoFollow
                ? 'text-violet-300 bg-violet-950/60'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setInspectorOpen(false)}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-[11px]">
        {!inspectorEvent ? (
          <div className="text-gray-500 italic text-center py-4">
            Klik event di tab Simulasi untuk menginspeksi PDU-nya.
          </div>
        ) : !pdu ? (
          <div className="text-gray-500 italic text-center py-4">
            Event ini bukan paket (log internal). Pilih event ARP_REQ/ARP_REP/ICMP_REQ/ICMP_REP.
          </div>
        ) : (
          <>
            {pdu.note && (
              <div className="rounded bg-violet-950/50 border border-violet-800/60 p-2 text-violet-200">
                {pdu.note}
              </div>
            )}

            {/* L2 — Ethernet Frame */}
            <div className="rounded border border-emerald-800/60 bg-black/40 p-2.5">
              <div className="text-[10px] font-bold uppercase text-emerald-400 mb-1.5">
                L2 · Ethernet Frame
              </div>
              <HeaderRow label="Src MAC" value={pdu.frame.srcMac} />
              <HeaderRow
                label="Dst MAC"
                value={
                  pdu.frame.dstMac === 'FF:FF:FF:FF:FF:FF'
                    ? 'FF:FF:FF:FF:FF:FF (broadcast)'
                    : pdu.frame.dstMac
                }
              />
              <HeaderRow label="Ethertype" value={`0x${pdu.frame.ethertype === 'ARP' ? '0806' : '0800'} (${pdu.frame.ethertype})`} />
            </div>

            {/* L3 — IPv4 Packet */}
            {pdu.packet && (
              <div className="rounded border border-violet-800/60 bg-black/40 p-2.5">
                <div className="text-[10px] font-bold uppercase text-violet-400 mb-1.5">
                  L3 · IPv4 Packet
                </div>
                <HeaderRow label="Src IP" value={pdu.packet.srcIp} />
                <HeaderRow label="Dst IP" value={pdu.packet.dstIp} />
                <HeaderRow label="TTL" value={pdu.packet.ttl} />
                <HeaderRow label="Protocol" value={`${pdu.packet.protocol} (1)`} />
                <HeaderRow label="Identification" value={`0x${pdu.packet.id.toString(16).padStart(4, '0')}`} />
              </div>
            )}

            {/* L4 — ARP / ICMP */}
            {pdu.segment && isArp(pdu.segment) ? (
              <div className="rounded border border-cyan-800/60 bg-black/40 p-2.5">
                <div className="text-[10px] font-bold uppercase text-cyan-400 mb-1.5">
                  L4 payload · ARP (RFC 826)
                </div>
                <HeaderRow
                  label="Opcode"
                  value={pdu.segment.opcode === 1 ? '1 (Request)' : '2 (Reply)'}
                />
                <HeaderRow label="Sender" value={`${pdu.segment.senderIp} @ ${pdu.segment.senderMac}`} />
                <HeaderRow
                  label="Target"
                  value={`${pdu.segment.targetIp} @ ${pdu.segment.targetMac ?? '(belum diketahui)'}`}
                />
              </div>
            ) : pdu.segment ? (
              <div className="rounded border border-cyan-800/60 bg-black/40 p-2.5">
                <div className="text-[10px] font-bold uppercase text-cyan-400 mb-1.5">
                  L4 payload · ICMP (RFC 792)
                </div>
                <HeaderRow
                  label="Type"
                  value={(pdu.segment as IcmpPacket).type === 8 ? '8 (Echo Request)' : '0 (Echo Reply)'}
                />
                <HeaderRow label="Code" value={(pdu.segment as IcmpPacket).code} />
                <HeaderRow label="Identifier" value={`0x${(pdu.segment as IcmpPacket).identifier.toString(16).padStart(4, '0')}`} />
                <HeaderRow label="Sequence" value={(pdu.segment as IcmpPacket).sequence} />
                <HeaderRow label="Payload" value={`${(pdu.segment as IcmpPacket).payloadBytes} bytes`} />
              </div>
            ) : null}

            {/* DHCP (UDP 67/68) */}
            {pdu.dhcp && (
              <div className="rounded border border-amber-800/60 bg-black/40 p-2.5">
                <div className="text-[10px] font-bold uppercase text-amber-400 mb-1.5">
                  L4 payload · DHCP (UDP 67/68)
                </div>
                <HeaderRow
                  label="Message"
                  value={
                    { 1: '1 (Discover)', 2: '2 (Offer)', 3: '3 (Request)', 5: '5 (Ack)' }[
                      pdu.dhcp.messageType
                    ] ?? String(pdu.dhcp.messageType)
                  }
                />
                <HeaderRow label="Client MAC" value={pdu.dhcp.clientId} />
                {pdu.dhcp.yiaddr && <HeaderRow label="yiaddr (IP)" value={pdu.dhcp.yiaddr} />}
                {pdu.dhcp.serverId && <HeaderRow label="Server ID" value={pdu.dhcp.serverId} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
