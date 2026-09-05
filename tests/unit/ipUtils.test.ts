import { describe, it, expect } from 'vitest';
import {
  generateMacAddress,
  isSameSubnet,
  isValidIp,
  isValidSubnetMask,
  networkAddress,
  numberToIp,
  ipToNumber,
  prefixLength,
} from '../../src/utils/ipUtils';

describe('ipUtils (RFC 791 IPv4)', () => {
  it('isValidIp menerima IPv4 yang valid dan menolak yang tidak', () => {
    expect(isValidIp('192.168.1.10')).toBe(true);
    expect(isValidIp('0.0.0.0')).toBe(true);
    expect(isValidIp('255.255.255.255')).toBe(true);
    expect(isValidIp('256.1.1.1')).toBe(false);
    expect(isValidIp('192.168.1')).toBe(false);
    expect(isValidIp('192.168.1.1.1')).toBe(false);
    expect(isValidIp('abc')).toBe(false);
    expect(isValidIp('01.2.3.4')).toBe(false); // leading zero ditolak
  });

  it('isValidSubnetMask hanya menerima mask dengan bit 1 kontinu', () => {
    expect(isValidSubnetMask('255.255.255.0')).toBe(true);
    expect(isValidSubnetMask('255.0.0.0')).toBe(true);
    expect(isValidSubnetMask('255.255.255.252')).toBe(true);
    expect(isValidSubnetMask('255.0.255.0')).toBe(false);
    expect(isValidSubnetMask('256.0.0.0')).toBe(false);
  });

  it('isSameSubnet menghitung AND mask dengan benar', () => {
    expect(isSameSubnet('192.168.1.10', '192.168.1.20', '255.255.255.0')).toBe(true);
    expect(isSameSubnet('192.168.1.10', '192.168.2.20', '255.255.255.0')).toBe(false);
    expect(isSameSubnet('10.0.5.1', '10.0.9.1', '255.255.240.0')).toBe(true); // /20
    expect(isSameSubnet('10.0.5.1', '10.0.16.1', '255.255.240.0')).toBe(false);
  });

  it('konversi IP <-> number bersifat dua arah', () => {
    expect(ipToNumber('192.168.1.10')).toBe(3232235786);
    expect(numberToIp(3232235786)).toBe('192.168.1.10');
    expect(numberToIp(ipToNumber('1.2.3.4'))).toBe('1.2.3.4');
  });

  it('prefixLength & networkAddress mendukung longest-prefix match routing', () => {
    expect(prefixLength('255.255.255.0')).toBe(24);
    expect(prefixLength('255.255.0.0')).toBe(16);
    expect(prefixLength('255.255.255.252')).toBe(30);
    expect(networkAddress('192.168.1.10', '255.255.255.0')).toBe('192.168.1.0');
    expect(networkAddress('10.1.2.3', '255.0.0.0')).toBe('10.0.0.0');
  });
});

describe('ipUtils tambahan', () => {
  it('generateMacAddress menghasilkan MAC berformat OUI 00:50:79 yang unik', () => {
    const mac = generateMacAddress();
    expect(mac).toMatch(/^00:50:79:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}$/);
    const set = new Set(Array.from({ length: 50 }, () => generateMacAddress()));
    expect(set.size).toBe(50);
  });

  it('isSameSubnet mengembalikan false untuk IP tidak valid (catch branch)', () => {
    expect(isSameSubnet('bukan.ip', '192.168.1.1', '255.255.255.0')).toBe(false);
  });
});
