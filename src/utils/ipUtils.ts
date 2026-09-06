export function generateMacAddress(): string {
  const hex = '0123456789ABCDEF';
  let mac = '00:50:79';
  for (let i = 0; i < 3; i++) {
    mac += `:${hex[Math.floor(Math.random() * 16)]}${hex[Math.floor(Math.random() * 16)]}`;
  }
  return mac;
}

export function ipToNumber(ip: string): number {
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

export function isSameSubnet(ip1: string, ip2: string, mask: string): boolean {
  try {
    const num1 = ipToNumber(ip1);
    const num2 = ipToNumber(ip2);
    const numMask = ipToNumber(mask);
    return (num1 & numMask) === (num2 & numMask);
  } catch {
    return false;
  }
}

export function isValidIp(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

export function isValidSubnetMask(mask: string): boolean {
  if (!isValidIp(mask)) return false;
  const num = ipToNumber(mask);
  // Valid subnet mask has contiguous 1s followed by 0s
  const inverted = (~num) >>> 0;
  return ((inverted + 1) & inverted) === 0;
}

export function prefixLength(mask: string): number {
  let count = 0;
  for (const octet of mask.split('.')) {
    let bits = parseInt(octet, 10);
    while (bits > 0) {
      count += bits & 1;
      bits >>= 1;
    }
  }
  return count;
}

export function networkAddress(ip: string, mask: string): string {
  return numberToIp((ipToNumber(ip) & ipToNumber(mask)) >>> 0);
}

/** Apakah IP termasuk rentang privat RFC 1918 (10/8, 172.16/12, 192.168/16). */
export function isPrivateIp(ip: string): boolean {
  if (!isValidIp(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
