/**
 * Warna paket PDU per protokol. Nilainya merujuk token tema (`--pkt-*` di
 * src/index.css) sehingga satu-satunya sumber warna tetap berada di CSS.
 */
const PROTOCOL_COLORS: Record<string, string> = {
  ARP: 'var(--pkt-arp)',
  ICMP: 'var(--pkt-icmp)',
  DHCP: 'var(--pkt-dhcp)',
  RIP: 'var(--pkt-rip)',
};

export const packetColor = (protocol: string | undefined, fallback: string): string =>
  PROTOCOL_COLORS[protocol ?? ''] ?? fallback;

/** Warna sorot (kabel/asosiasi terpilih): emas aksen DiagramForge. */
export const SELECTED_LINK_COLOR = 'var(--gold-hover)';
