import { type DeviceData } from '../../types/network';
import { isValidIp, isValidSubnetMask } from '../../utils/ipUtils';

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
    return device.ports.find(
      (p) => p.id === identifier || p.name.toLowerCase() === identifier.toLowerCase()
    );
  }

  public async handle(raw: string): Promise<string[]> {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    const tokens = trimmed.split(/\s+/);
    const primary = tokens[0].toLowerCase();

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
        return this.handlePriv(primary, tokens, trimmed);
      case 'config':
        return this.handleConfig(tokens);
      case 'config-if':
        return this.handleConfigIf(tokens, trimmed);
    }
  }

  private handleUser(primary: string): string[] {
    if (primary === 'enable') {
      this.mode = 'priv';
      return [];
    }
    return this.invalid(`Perintah tidak dikenal di User mode. Coba "enable".`);
  }

  private async handlePriv(
    primary: string,
    tokens: string[],
    trimmed: string
  ): Promise<string[]> {
    if (trimmed === 'configure terminal' || trimmed === 'conf t') {
      this.mode = 'config';
      return [];
    }

    if (primary === 'ping') {
      return this.handlePing(tokens);
    }

    if (
      trimmed.startsWith('show ip interface brief') ||
      trimmed === 'sh ip int br'
    ) {
      return this.showIpInterfaceBrief();
    }

    if (primary === 'show' || primary === 'sh') {
      if (trimmed.startsWith('show ip route') || trimmed === 'sh ip route') {
        return this.showIpRoute();
      }
      if (trimmed.startsWith('show mac-address-table') || trimmed === 'sh mac') {
        return this.showMacTable();
      }
      if (trimmed.startsWith('show arp') || trimmed === 'sh arp') {
        return this.showArp();
      }
    }

    return this.invalid(`Perintah tidak dikenal: "${trimmed}"`);
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
    }
    return lines;
  }

  private showIpRoute(): string[] {
    const device = this.deps.getDevice();
    if (device.type !== 'router') {
      return this.invalid('IP routing not enabled pada perangkat ini.');
    }
    const lines = ['Codes: C - connected, S - static', 'Gateway of last resort is not set'];
    for (const p of device.ports) {
      if (!p.ipAddress || !p.subnetMask) continue;
      const network = p.ipAddress.split('.').slice(0, 3).join('.') + '.0';
      lines.push(`C       ${network} is directly connected, ${p.name}`);
    }
    for (const r of device.routes ?? []) {
      lines.push(`S       ${r.network} via ${r.nextHop}, ${r.interfaceId}`);
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
      lines.push(`1       ${mac.toLowerCase()}    DYNAMIC     ${port}`);
    }
    return lines;
  }

  private showArp(): string[] {
    const device = this.deps.getDevice();
    const lines = ['Protocol  Address          Age (min)  Hardware Addr   Type   Interface'];
    for (const [ip, mac] of Object.entries(device.arpTable ?? {})) {
      lines.push(
        `Internet  ${ip.padEnd(16)} -          ${mac.toLowerCase()}  ARPA   ${device.ports[0]?.name ?? '-'}`
      );
    }
    return lines;
  }

  private handleConfig(tokens: string[]): string[] {
    if (tokens[0] === 'hostname' && tokens[1]) {
      const name = tokens[1];
      if (!/^\S+$/.test(name)) {
        return this.invalid('Hostname tidak boleh mengandung spasi.');
      }
      this.deps.setHostname(name);
      return [`Hostname diubah menjadi ${name}`];
    }

    if (tokens[0] === 'interface' || tokens[0] === 'int') {
      const target = tokens[1];
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

    return this.invalid(`Perintah tidak dikenal di global config mode: "${tokens.join(' ')}"`);
  }

  private handleConfigIf(tokens: string[], trimmed: string): string[] {
    if (tokens[0] === 'ip' && tokens[1] === 'address') {
      const ip = tokens[2];
      const mask = tokens[3];
      if (!ip || !mask) {
        return this.invalid('Incomplete command. Format: ip address <IP> <SUBNET>');
      }
      if (!isValidIp(ip)) {
        return this.invalid(`Invalid IP address: "${ip}". Contoh: 192.168.1.1`);
      }
      if (!isValidSubnetMask(mask)) {
        return this.invalid(`Invalid subnet mask: "${mask}". Contoh: 255.255.255.0`);
      }
      this.deps.setPortConfig(this.currentInterface!, { ipAddress: ip, subnetMask: mask });
      return [
        `% IP Address ${ip} ${mask} berhasil dikonfigurasi pada ${this.currentInterface}`,
      ];
    }

    if (trimmed === 'no shutdown' || trimmed === 'no shut') {
      this.deps.setPortConfig(this.currentInterface!, { status: 'up' });
      return [`% LINK-5-CHANGED: Interface ${this.currentInterface}, changed state to up`];
    }

    if (trimmed === 'shutdown' || trimmed === 'shut') {
      this.deps.setPortConfig(this.currentInterface!, { status: 'down' });
      return [`% Interface ${this.currentInterface}, changed state to administratively down`];
    }

    return this.invalid(`Perintah tidak dikenal di interface mode: "${trimmed}"`);
  }
}
