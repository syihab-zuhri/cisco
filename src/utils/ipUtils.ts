let macSeq = 1;

/** Reset counter generator MAC untuk determinisme (INV-004). */
export function resetMacGenerator(seed = 1): void {
  macSeq = seed;
}

export function generateMacAddress(): string {
  const seq = macSeq++;
  const b1 = (seq >>> 16) & 0xff;
  const b2 = (seq >>> 8) & 0xff;
  const b3 = seq & 0xff;
  const toHex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
  return `00:50:79:${toHex(b1)}:${toHex(b2)}:${toHex(b3)}`;
}

export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

export function ipToNumber(ip: string): number {
  if (!isValidIp(ip)) {
    throw new Error(`Invalid IPv4 address: "${ip}"`);
  }
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function isValidSubnetMask(mask: string): boolean {
  if (!isValidIp(mask)) return false;
  const num = ipToNumber(mask);
  // 0.0.0.0 (/0) bukan mask interface yang valid; /32 (host route) valid secara
  // umum tapi ditolak khusus untuk IP interface di cliEngine (Bad mask check).
  if (num === 0) return false;
  // Valid subnet mask memiliki bit 1 kontinu yang diikuti bit 0 kontinu
  const inverted = (~num) >>> 0;
  return ((inverted + 1) & inverted) === 0;
}

export function isSameSubnet(ip1: string, ip2: string, mask: string): boolean {
  if (!isValidIp(ip1) || !isValidIp(ip2) || !isValidSubnetMask(mask)) {
    return false;
  }
  try {
    const num1 = ipToNumber(ip1);
    const num2 = ipToNumber(ip2);
    const numMask = ipToNumber(mask);
    return (num1 & numMask) === (num2 & numMask);
  } catch {
    return false;
  }
}

export function prefixLength(mask: string): number {
  if (!isValidSubnetMask(mask)) return 0;
  const num = ipToNumber(mask);
  let count = 0;
  for (let i = 31; i >= 0; i--) {
    if (((num >>> i) & 1) === 1) count++;
    else break;
  }
  return count;
}

export function networkAddress(ip: string, mask: string): string {
  if (!isValidIp(ip) || !isValidSubnetMask(mask)) return '0.0.0.0';
  return numberToIp((ipToNumber(ip) & ipToNumber(mask)) >>> 0);
}

/**
 * Apakah IP termasuk rentang privat / non-routable public internet
 * (RFC 1918, Loopback RFC 1122, Link-Local RFC 3927, Multicast RFC 5771).
 */
export function isPrivateIp(ip: string): boolean {
  if (!isValidIp(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  // Loopback (127.0.0.0/8) & 'This host' (0.0.0.0/8)
  if (a === 127 || a === 0) return true;
  // RFC 1918 Private ranges
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Link-Local APIPA (169.254.0.0/16)
  if (a === 169 && b === 254) return true;
  // Multicast (224.0.0.0/4) & Reserved (240.0.0.0/4)
  if (a >= 224) return true;
  return false;
}
