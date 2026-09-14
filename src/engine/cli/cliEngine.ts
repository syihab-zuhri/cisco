import { type DeviceData, type PhysicalPort } from '../../types/network';
import { isValidIp, isValidSubnetMask, networkAddress, prefixLength, ipToNumber, isSameSubnet } from '../../utils/ipUtils';

export type CliMode = 'user' | 'priv' | 'config' | 'config-if';

export interface PingOutcome {
  success: boolean;
  outputLines: string[];
}

export interface CliSessionDeps {
  /** Data perangkat terbaru (selalu dibaca dari store — INV-006). */
  getDevice: () => DeviceData;
  setHostname: (name: string) => void;
  setPortConfig: (
    portId: string,
    updates: { ipAddress?: string; subnetMask?: string; status?: 'up' | 'down' }
  ) => void;
  /** Menjalankan ping penuh lewat simulation engine (format output IOS). */
  requestPing: (targetIp: string) => Promise<PingOutcome>;
}

/**
 * 10 perintah P0 kanonik (keputusan resolusi kontradiksi, lihat CHANGELOG):
 *   1. enable                    6. no shutdown
 *   2. configure terminal        7. shutdown
 *   3. hostname <name>           8. show ip interface brief
 *   4. interface <id>            9. show ip route
 *   5. ip address <ip> <mask>   10. ping <ip>
 * `exit`/`end` adalah navigasi mode; `show mac-address-table` & `show arp`
 * adalah ekstensi yang sudah ada sebelumnya dan dipertahankan.
 */
export class CliSession {
  mode: CliMode = 'user';
  currentInterface: string | null = null;
  closeRequested = false;

  constructor(private deps: CliSessionDeps) {}

  public prompt(): string {
    const hostname = this.deps.getDevice().label;
    switch (this.mode) {
      case 'user':
        return `${hostname}>`;
      case 'priv':
        return `${hostname}#`;
      case 'config':
        return `${hostname}(config)#`;
      case 'config-if':
        return `${hostname}(config-if)#`;
    }
  }

  private invalid(message: string): string[] {
    return [`% ${message}`];
  }

  private findPort(identifier: string) {
    const device = this.deps.getDevice();
    const clean = identifier.toLowerCase().replace(/\s+/g, '');
    const direct = device.ports.find((p) => {
      const pId = p.id.toLowerCase().replace(/\s+/g, '');
      const pName = p.name.toLowerCase().replace(/\s+/g, '');
      return (
        pId === clean ||
        pName === clean ||
        pId.replace(/^fastethernet/, 'fa') === clean ||
        pName.replace(/^fastethernet/, 'fa') === clean ||
        clean.replace(/^fastethernet/, 'fa') === pId ||
        clean.replace(/^fastethernet/, 'fa') === pName ||
        clean.replace(/^f(\d)/, 'fa$1') === pId
      );
    });
    if (direct) return direct;

    // Cek sub-interface (contoh: fa0/0.10)
    for (const p of device.ports) {
      for (const s of p.subInterfaces ?? []) {
        const sId = `${p.id}.${s.vlanId}`.toLowerCase().replace(/\s+/g, '');
        const sName = `${p.name}.${s.vlanId}`.toLowerCase().replace(/\s+/g, '');
        if (
          sId === clean ||
          sName === clean ||
          sId.replace(/^fastethernet/, 'fa') === clean ||
          sName.replace(/^fastethernet/, 'fa') === clean
        ) {
          return {
            id: sId,
            name: sName,
            status: p.status,
            kind: p.kind,
            ipAddress: s.ipAddress,
            subnetMask: s.subnetMask,
            macAddress: p.macAddress,
            vlanId: s.vlanId,
          } as PhysicalPort;
        }
      }
    }
    return undefined;
  }

  public async handle(raw: string): Promise<string[]> {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const rawTokens = trimmed.split(/\s+/);
    const lowerTokens = rawTokens.map((t) => t.toLowerCase());
    const primary = lowerTokens[0];
    const cmd = lowerTokens.join(' ');

    // --- Navigasi mode ---
    if (primary === 'exit') {
      if (this.mode === 'config-if') {
        this.mode = 'config';
        this.currentInterface = null;
      } else if (this.mode === 'config') {
        this.mode = 'priv';
      } else if (this.mode === 'priv') {
        this.mode = 'user';
      } else {
        this.closeRequested = true;
      }
      return [];
    }

    if (primary === 'end') {
      if (this.mode === 'config' || this.mode === 'config-if') {
        this.mode = 'priv';
        this.currentInterface = null;
        return [];
      }
      return this.invalid(`Perintah "end" hanya berlaku di configuration mode.`);
    }

    if (primary === 'help' || primary === '?') {
      return [
        'Daftar perintah P0 yang didukung:',
        '  enable                  - Masuk ke privileged EXEC mode',
        '  configure terminal      - Masuk ke global configuration mode (alias: conf t)',
        '  hostname <name>         - Mengubah nama host perangkat',
        '  interface <id>          - Masuk ke konfigurasi port (alias: int)',
        '  ip address <ip> <mask>  - Konfigurasi IPv4 antarmuka',
        '  no shutdown             - Mengaktifkan antarmuka (alias: no shut)',
        '  shutdown                - Menonaktifkan antarmuka (alias: shut)',
        '  show ip interface brief - Status ringkas port (alias: sh ip int br)',
        '  show ip route           - Menampilkan tabel routing',
        '  ping <ip>               - ICMP echo (5 paket, gaya Cisco IOS)',
        '  show mac-address-table / show arp - Ekstensi tabel L2/L3',
        '  exit / end              - Kembali ke mode sebelumnya',
      ];
    }

    switch (this.mode) {
      case 'user':
        return this.handleUser(primary);
      case 'priv':
        return this.handlePriv(lowerTokens, rawTokens, cmd);
      case 'config':
        return this.handleConfig(lowerTokens, rawTokens);
      case 'config-if':
        return this.handleConfigIf(lowerTokens, rawTokens, cmd);
    }
  }

  private handleUser(primary: string): string[] {
    if (primary === 'enable' || primary === 'en') {
      this.mode = 'priv';
      return [];
    }
    return this.invalid(`Perintah tidak dikenal di User mode. Coba "enable".`);
  }

  private async handlePriv(
    lowerTokens: string[],
    rawTokens: string[],
    cmd: string
  ): Promise<string[]> {
    if (
      cmd === 'configure terminal' ||
      cmd === 'conf t' ||
      cmd === 'config t' ||
      cmd === 'conf term' ||
      cmd === 'config terminal' ||
      cmd === 'configure t'
    ) {
      this.mode = 'config';
      return [];
    }

    if (lowerTokens[0] === 'ping') {
      return this.handlePing(rawTokens);
    }

    if (
      (lowerTokens[0] === 'show' || lowerTokens[0] === 'sh') &&
      lowerTokens[1] === 'ip' &&
      (lowerTokens[2] === 'interface' || lowerTokens[2] === 'int') &&
      (lowerTokens[3] === 'brief' || lowerTokens[3] === 'br')
    ) {
      return this.showIpInterfaceBrief();
    }

    if (lowerTokens[0] === 'show' || lowerTokens[0] === 'sh') {
      if (
        (lowerTokens[1] === 'ip' && (lowerTokens[2] === 'route' || lowerTokens[2] === 'ro'))
      ) {
        return this.showIpRoute();
      }
      if (cmd === 'show mac-address-table' || cmd === 'sh mac-address-table' || cmd === 'sh mac' || cmd === 'show mac') {
        return this.showMacTable();
      }
      if (cmd === 'show arp' || cmd === 'sh arp') {
        return this.showArp();
      }
    }

    return this.invalid(`Perintah tidak dikenal: "${cmd}"`);
  }

  private async handlePing(tokens: string[]): Promise<string[]> {
    const target = tokens[1];
    if (!target) {
      return this.invalid('Incomplete command. Format: ping <IP tujuan>');
    }
    if (!isValidIp(target)) {
      return this.invalid(`Invalid IP address: "${target}". Contoh: ping 192.168.1.20`);
    }
    try {
      const outcome = await this.deps.requestPing(target);
      return outcome.outputLines;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SIM_BUSY') {
        return this.invalid('Ping lain sedang berjalan. Tunggu hingga selesai.');
      }
      return this.invalid(`Ping gagal dijalankan: ${message}`);
    }
  }

  private showIpInterfaceBrief(): string[] {
    const lines = [
      'Interface              IP-Address      OK? Status                Protocol',
    ];
    for (const p of this.deps.getDevice().ports) {
      const ip = p.ipAddress || 'unassigned';
      const status = p.status === 'up' ? 'up' : 'administratively down';
      lines.push(
        `${p.name.padEnd(23)}${ip.padEnd(16)}YES ${status.padEnd(22)}${p.status}`
      );
      for (const s of p.subInterfaces ?? []) {
        const sIp = s.ipAddress || 'unassigned';
        const sName = `${p.name}.${s.vlanId}`;
        lines.push(
          `${sName.padEnd(23)}${sIp.padEnd(16)}YES ${status.padEnd(22)}${p.status}`
        );
      }
    }
    return lines;
  }

  private showIpRoute(): string[] {
    const device = this.deps.getDevice();
    if (device.type !== 'router') {
      return this.invalid('IP routing not enabled pada perangkat ini.');
    }
    const lines = ['Codes: C - connected, S - static, R - RIP', 'Gateway of last resort is not set'];
    for (const p of device.ports) {
      if (!p.ipAddress || !p.subnetMask) continue;
      const network = networkAddress(p.ipAddress, p.subnetMask);
      lines.push(`C       ${network}/${prefixLength(p.subnetMask)} is directly connected, ${p.name}`);
    }
    for (const s of device.ports) {
      for (const sub of s.subInterfaces ?? []) {
        const network = networkAddress(sub.ipAddress, sub.subnetMask);
        lines.push(`C       ${network}/${prefixLength(sub.subnetMask)} is directly connected, ${s.name}.${sub.vlanId}`);
      }
    }
    for (const r of device.routes ?? []) {
      if (r.source === 'rip') {
        lines.push(`R       ${r.network}/${r.subnetMask} [${r.metric ?? 1}/1] via ${r.nextHop}, ${r.interfaceId}`);
      } else {
        lines.push(`S       ${r.network}/${r.subnetMask} via ${r.nextHop}, ${r.interfaceId}`);
      }
    }
    if (lines.length === 2) {
      lines.push('(Tidak ada route. Konfigurasi IP pada interface terlebih dahulu.)');
    }
    return lines;
  }

  private showMacTable(): string[] {
    const device = this.deps.getDevice();
    const lines = [
      '          Mac Address Table',
      '-------------------------------------------',
      'Vlan    Mac Address       Type        Ports',
      '----    -----------       --------    -----',
    ];
    for (const [mac, port] of Object.entries(device.macTable ?? {})) {
      const matchPort = device.ports.find((p) => p.id === port || p.name === port);
      const vlan = matchPort?.vlanId ?? 1;
      lines.push(`${String(vlan).padEnd(8)}${mac.toLowerCase()}    DYNAMIC     ${port}`);
    }
    return lines;
  }

  private showArp(): string[] {
    const device = this.deps.getDevice();
    const lines = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
    for (const [ip, mac] of Object.entries(device.arpTable ?? {})) {
      const matchPort =
        device.ports.find((p) => p.ipAddress && isSameSubnet(p.ipAddress, ip, p.subnetMask ?? '255.255.255.0')) ??
        device.ports[0];
      lines.push(
        `Internet  ${ip.padEnd(16)} -          ${mac.toLowerCase()}  ARPA   ${matchPort?.name ?? '-'}`
      );
    }
    return lines;
  }

  private async handleConfig(lowerTokens: string[], rawTokens: string[]): Promise<string[]> {
    if (lowerTokens[0] === 'do' && lowerTokens.length > 1) {
      return this.handlePriv(
        lowerTokens.slice(1),
        rawTokens.slice(1),
        lowerTokens.slice(1).join(' ')
      );
    }

    if (lowerTokens[0] === 'hostname' && rawTokens[1]) {
      const name = rawTokens[1];
      if (!/^\S+$/.test(name)) {
        return this.invalid('Hostname tidak boleh mengandung spasi.');
      }
      this.deps.setHostname(name);
      return [`Hostname diubah menjadi ${name}`];
    }

    if (lowerTokens[0] === 'interface' || lowerTokens[0] === 'int') {
      const target = rawTokens.slice(1).join(' ');
      if (!target) {
        return this.invalid('Incomplete command. Format: interface <id> (contoh: int fa0/0)');
      }
      const port = this.findPort(target);
      if (!port) {
        const available = this.deps.getDevice().ports.map((p) => p.id).join(', ');
        return this.invalid(`Invalid interface "${target}". Port yang ada: ${available}`);
      }
      this.currentInterface = port.id;
      this.mode = 'config-if';
      return [];
    }

    return this.invalid(`Perintah tidak dikenal di global config mode: "${rawTokens.join(' ')}"`);
  }

  private async handleConfigIf(
    lowerTokens: string[],
    rawTokens: string[],
    cmd: string
  ): Promise<string[]> {
    if (lowerTokens[0] === 'do' && lowerTokens.length > 1) {
      return this.handlePriv(
        lowerTokens.slice(1),
        rawTokens.slice(1),
        lowerTokens.slice(1).join(' ')
      );
    }

    if (cmd === 'no ip address' || cmd === 'no ip addr') {
      this.deps.setPortConfig(this.currentInterface!, { ipAddress: undefined, subnetMask: undefined });
      return [];
    }

    if (lowerTokens[0] === 'ip' && lowerTokens[1] === 'address') {
      const ip = rawTokens[2];
      const mask = rawTokens[3];
      if (!ip || !mask) {
        return this.invalid('Incomplete command. Format: ip address <IP> <SUBNET>');
      }
      if (!isValidIp(ip)) {
        return this.invalid(`Invalid IP address: "${ip}". Contoh: 192.168.1.1`);
      }
      if (!isValidSubnetMask(mask)) {
        return this.invalid(`Invalid subnet mask: "${mask}". Contoh: 255.255.255.0`);
      }
      const net = networkAddress(ip, mask);
      const netNum = ipToNumber(net);
      const maskNum = ipToNumber(mask);
      const bcastNum = (netNum | (~maskNum >>> 0)) >>> 0;
      const ipNum = ipToNumber(ip);
      const cidr = prefixLength(mask);
      if (ipNum === netNum || ipNum === bcastNum) {
        return this.invalid(`Bad mask /${cidr} for address ${ip}`);
      }
      this.deps.setPortConfig(this.currentInterface!, { ipAddress: ip, subnetMask: mask });
      return [
        `% IP Address ${ip} ${mask} berhasil dikonfigurasi pada ${this.currentInterface}`,
      ];
    }

    if (cmd === 'no shutdown' || cmd === 'no shut' || cmd === 'no sh') {
      this.deps.setPortConfig(this.currentInterface!, { status: 'up' });
      return [`% LINK-5-CHANGED: Interface ${this.currentInterface}, changed state to up`];
    }

    if (cmd === 'shutdown' || cmd === 'shut') {
      this.deps.setPortConfig(this.currentInterface!, { status: 'down' });
      return [`% Interface ${this.currentInterface}, changed state to administratively down`];
    }

    return this.invalid(`Perintah tidak dikenal di interface mode: "${cmd}"`);
  }
}
