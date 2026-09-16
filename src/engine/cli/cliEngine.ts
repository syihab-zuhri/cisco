import { type DeviceData, type PhysicalPort, type RoutingEntry } from '../../types/network';
import {
  isValidIp,
  isValidSubnetMask,
  networkAddress,
  prefixLength,
  ipToNumber,
  numberToIp,
  isSameSubnet,
} from '../../utils/ipUtils';

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
    updates: Partial<PhysicalPort>
  ) => void;
  /** Menjalankan ping penuh lewat simulation engine (format output IOS). */
  requestPing: (targetIp: string) => Promise<PingOutcome>;
  addStaticRoute?: (route: RoutingEntry) => void;
  removeStaticRoute?: (index: number) => void;
  setDefaultGateway?: (gw: string | undefined) => void;
  saveConfig?: () => void;
  setSubInterfaceConfig?: (
    parentPortId: string,
    vlanId: number,
    updates: { ipAddress?: string; subnetMask?: string }
  ) => void;
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
  currentSubInterface: { parentPortId: string; vlanId: number } | null = null;
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
        return this.currentSubInterface
          ? `${hostname}(config-subif)#`
          : `${hostname}(config-if)#`;
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
        this.currentSubInterface = null;
      } else if (this.mode === 'config') {
        this.mode = 'priv';
      } else if (this.mode === 'priv') {
        this.mode = 'user';
        this.closeRequested = true;
      }
      return [];
    }

    if (primary === 'end') {
      if (this.mode === 'config' || this.mode === 'config-if') {
        this.mode = 'priv';
        this.currentInterface = null;
        this.currentSubInterface = null;
        return [];
      }
      return this.invalid(`Perintah "end" hanya berlaku di configuration mode.`);
    }

    if (primary === 'help' || primary === '?') {
      return [
        'Daftar perintah Cisco IOS yang didukung:',
        '  enable                  - Masuk ke privileged EXEC mode',
        '  configure terminal      - Masuk ke global configuration mode (alias: conf t)',
        '  hostname <name>         - Mengubah nama host perangkat',
        '  interface <id>[.subif]  - Konfigurasi port / sub-interface (alias: int)',
        '  ip address <ip> <mask>  - Konfigurasi IPv4 antarmuka',
        '  no shutdown / shutdown  - Mengaktifkan / mematikan antarmuka (alias: no shut)',
        '  ip route <net> <mask> <hop> - Konfigurasi static route (router)',
        '  no ip route <net> <mask>    - Menghapus static route',
        '  switchport mode <access|trunk> - Konfigurasi mode port switch',
        '  switchport access vlan <id>    - Menetapkan VLAN access port switch',
        '  switchport trunk allowed vlan  - Mengatur VLAN trunk port switch',
        '  encapsulation dot1q <vlanId>   - Enkapsulasi 802.1Q sub-interface',
        '  ip default-gateway <ip>        - Menetapkan gateway switch/host',
        '  show running-config / sh run   - Menampilkan konfigurasi aktif',
        '  write memory / copy run start  - Menyimpan konfigurasi (alias: wr)',
        '  show ip interface brief        - Status ringkas port (alias: sh ip int br)',
        '  show ip route / show vlan      - Tabel routing L3 / VLAN L2',
        '  show mac-address-table / show arp - Tabel MAC L2 / cache ARP',
        '  ping <ip>                      - ICMP echo (5 paket, gaya Cisco IOS)',
        '  exit / end                     - Navigasi mode / keluar',
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
    if (
      cmd === 'show running-config' ||
      cmd === 'sh run' ||
      cmd === 'show run' ||
      cmd === 'sh running-config'
    ) {
      return this.showRunningConfig();
    }

    if (
      cmd === 'write memory' ||
      cmd === 'write' ||
      cmd === 'wr' ||
      cmd === 'copy running-config startup-config' ||
      cmd === 'copy run start'
    ) {
      this.deps.saveConfig?.();
      return ['Building configuration...', '[OK]'];
    }

    if (
      cmd === 'show vlan brief' ||
      cmd === 'sh vlan br' ||
      cmd === 'show vlan' ||
      cmd === 'sh vlan'
    ) {
      return this.showVlan();
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
    const cmd = lowerTokens.join(' ');
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
      // Cek sub-interface (contoh: int fa0/0.10)
      if (target.includes('.')) {
        const dotIdx = target.lastIndexOf('.');
        const parentTarget = target.slice(0, dotIdx);
        const subIdStr = target.slice(dotIdx + 1);
        const vlanId = parseInt(subIdStr, 10);
        const parentPort = this.findPort(parentTarget);
        if (parentPort && !isNaN(vlanId) && vlanId >= 1 && vlanId <= 4094) {
          this.currentInterface = parentPort.id;
          this.currentSubInterface = { parentPortId: parentPort.id, vlanId };
          this.deps.setSubInterfaceConfig?.(parentPort.id, vlanId, {});
          this.mode = 'config-if';
          return [];
        }
      }

      const port = this.findPort(target);
      if (!port) {
        const available = this.deps.getDevice().ports.map((p) => p.id).join(', ');
        return this.invalid(`Invalid interface "${target}". Port yang ada: ${available}`);
      }
      this.currentInterface = port.id;
      this.currentSubInterface = null;
      this.mode = 'config-if';
      return [];
    }

    // ip route <network> <subnet-mask> <next-hop>
    if (lowerTokens[0] === 'ip' && lowerTokens[1] === 'route') {
      const dev = this.deps.getDevice();
      if (dev.type !== 'router') {
        return this.invalid('IP routing hanya dapat dikonfigurasi pada router.');
      }
      const net = rawTokens[2];
      const maskOrPrefix = rawTokens[3];
      const nextHop = rawTokens[4];
      if (!net || !maskOrPrefix || !nextHop) {
        return this.invalid('Incomplete command. Format: ip route <network> <subnet-mask> <next-hop>');
      }
      if (!isValidIp(net)) {
        return this.invalid(`Invalid destination network IP: "${net}"`);
      }
      let mask = maskOrPrefix;
      if (mask.startsWith('/') || /^\d+$/.test(mask)) {
        const prefix = parseInt(mask.replace('/', ''), 10);
        if (prefix >= 0 && prefix <= 32) {
          const maskNum = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1)) >>> 0;
          mask = numberToIp(maskNum);
        } else {
          return this.invalid(`Invalid prefix length: "${maskOrPrefix}"`);
        }
      } else if (!isValidSubnetMask(mask) && !(net === '0.0.0.0' && mask === '0.0.0.0')) {
        return this.invalid(`Invalid subnet mask: "${maskOrPrefix}"`);
      }

      let egressInterfaceId = dev.ports[0]?.id ?? 'fa0/0';
      if (isValidIp(nextHop)) {
        const matchingPort = dev.ports.find((p) => p.ipAddress && isSameSubnet(p.ipAddress, nextHop, p.subnetMask ?? '255.255.255.0'));
        if (matchingPort) egressInterfaceId = matchingPort.id;
      } else {
        const namedPort = this.findPort(nextHop);
        if (namedPort) egressInterfaceId = namedPort.id;
      }

      const routeEntry: RoutingEntry = {
        network: net,
        subnetMask: mask,
        nextHop,
        interfaceId: egressInterfaceId,
        source: 'static',
      };
      this.deps.addStaticRoute?.(routeEntry);
      return [];
    }

    // no ip route <network> <subnet-mask> [next-hop]
    if (lowerTokens[0] === 'no' && lowerTokens[1] === 'ip' && lowerTokens[2] === 'route') {
      const dev = this.deps.getDevice();
      if (dev.type !== 'router') {
        return this.invalid('IP routing hanya dapat dikonfigurasi pada router.');
      }
      const net = rawTokens[3];
      const mask = rawTokens[4];
      const nextHop = rawTokens[5];
      if (!net || !mask) {
        return this.invalid('Incomplete command. Format: no ip route <network> <subnet-mask> [next-hop]');
      }
      const routes = dev.routes ?? [];
      const idx = routes.findIndex((r) => r.network === net && r.subnetMask === mask && (!nextHop || r.nextHop === nextHop));
      if (idx !== -1) {
        this.deps.removeStaticRoute?.(idx);
        return [];
      }
      return this.invalid(`Route ${net}/${mask} tidak ditemukan.`);
    }

    // ip default-gateway <ip>
    if (lowerTokens[0] === 'ip' && lowerTokens[1] === 'default-gateway') {
      const gw = rawTokens[2];
      if (!gw) {
        return this.invalid('Incomplete command. Format: ip default-gateway <IP>');
      }
      if (!isValidIp(gw)) {
        return this.invalid(`Invalid gateway IP address: "${gw}"`);
      }
      this.deps.setDefaultGateway?.(gw);
      return [];
    }

    if (cmd === 'no ip default-gateway') {
      this.deps.setDefaultGateway?.(undefined);
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
      if (this.currentSubInterface) {
        this.deps.setSubInterfaceConfig?.(this.currentSubInterface.parentPortId, this.currentSubInterface.vlanId, {
          ipAddress: undefined,
          subnetMask: undefined,
        });
      } else {
        this.deps.setPortConfig(this.currentInterface!, { ipAddress: undefined, subnetMask: undefined });
      }
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
      if (this.currentSubInterface) {
        this.deps.setSubInterfaceConfig?.(this.currentSubInterface.parentPortId, this.currentSubInterface.vlanId, {
          ipAddress: ip,
          subnetMask: mask,
        });
        return [
          `% IP Address ${ip} ${mask} berhasil dikonfigurasi pada ${this.currentInterface}.${this.currentSubInterface.vlanId}`,
        ];
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


    // switchport mode {access|trunk}
    if (lowerTokens[0] === 'switchport' && lowerTokens[1] === 'mode') {
      const dev = this.deps.getDevice();
      if (dev.type !== 'switch') {
        return this.invalid('Perintah switchport hanya berlaku pada Switch.');
      }
      const mode = lowerTokens[2];
      if (mode !== 'access' && mode !== 'trunk') {
        return this.invalid('Format tidak valid. Pilihan: switchport mode access | switchport mode trunk');
      }
      this.deps.setPortConfig(this.currentInterface!, { portMode: mode });
      return [];
    }

    // switchport access vlan <vlanId>
    if (lowerTokens[0] === 'switchport' && lowerTokens[1] === 'access' && lowerTokens[2] === 'vlan') {
      const dev = this.deps.getDevice();
      if (dev.type !== 'switch') {
        return this.invalid('Perintah switchport hanya berlaku pada Switch.');
      }
      const vlanId = parseInt(rawTokens[3], 10);
      if (isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
        return this.invalid(`Invalid VLAN ID "${rawTokens[3]}". Rentang valid: 1-4094.`);
      }
      this.deps.setPortConfig(this.currentInterface!, { portMode: 'access', vlanId });
      return [];
    }

    // switchport trunk allowed vlan
    if (
      lowerTokens[0] === 'switchport' &&
      lowerTokens[1] === 'trunk' &&
      lowerTokens[2] === 'allowed' &&
      lowerTokens[3] === 'vlan'
    ) {
      const dev = this.deps.getDevice();
      if (dev.type !== 'switch') {
        return this.invalid('Perintah switchport hanya berlaku pada Switch.');
      }
      this.deps.setPortConfig(this.currentInterface!, { portMode: 'trunk' });
      return [];
    }

    // encapsulation dot1q <vlanId>
    if (lowerTokens[0] === 'encapsulation' && (lowerTokens[1] === 'dot1q' || lowerTokens[1] === 'dot1Q')) {
      const vlanId = parseInt(rawTokens[2], 10);
      if (isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
        return this.invalid(`Invalid VLAN ID "${rawTokens[2]}". Rentang valid: 1-4094.`);
      }
      if (this.currentSubInterface) {
        this.currentSubInterface.vlanId = vlanId;
        this.deps.setSubInterfaceConfig?.(this.currentSubInterface.parentPortId, vlanId, {});
      } else {
        this.deps.setPortConfig(this.currentInterface!, { vlanId });
      }
      return [];
    }
    return this.invalid(`Perintah tidak dikenal di interface mode: "${cmd}"`);
  }
  private showRunningConfig(): string[] {
    const device = this.deps.getDevice();
    const lines: string[] = [
      'Building configuration...',
      '',
      'Current configuration : 1024 bytes',
      '!',
      'version 15.1',
      'no service timestamps log datetime msec',
      'no service password-encryption',
      '!',
      `hostname ${device.label}`,
      '!',
    ];

    if (device.ripEnabled) {
      lines.push('router rip', ' version 2', '!');
    }

    for (const port of device.ports) {
      lines.push(`interface ${port.name}`);
      if (device.type === 'switch') {
        const mode = port.portMode ?? 'access';
        lines.push(` switchport mode ${mode}`);
        if (mode === 'access' && (port.vlanId ?? 1) > 1) {
          lines.push(` switchport access vlan ${port.vlanId}`);
        }
      } else {
        if (port.ipAddress && port.subnetMask) {
          lines.push(` ip address ${port.ipAddress} ${port.subnetMask}`);
        } else {
          lines.push(' no ip address');
        }
      }
      if (port.status === 'down') {
        lines.push(' shutdown');
      }
      lines.push(' duplex auto', ' speed auto', '!');

      for (const sub of port.subInterfaces ?? []) {
        lines.push(`interface ${port.name}.${sub.vlanId}`);
        lines.push(` encapsulation dot1Q ${sub.vlanId}`);
        if (sub.ipAddress && sub.subnetMask) {
          lines.push(` ip address ${sub.ipAddress} ${sub.subnetMask}`);
        } else {
          lines.push(' no ip address');
        }
        lines.push('!');
      }
    }

    if (device.defaultGateway) {
      lines.push(`ip default-gateway ${device.defaultGateway}`);
    }

    for (const r of device.routes ?? []) {
      if (r.source !== 'connected') {
        lines.push(`ip route ${r.network} ${r.subnetMask} ${r.nextHop}`);
      }
    }

    lines.push('!', 'end');
    return lines;
  }

  private showVlan(): string[] {
    const device = this.deps.getDevice();
    if (device.type !== 'switch') {
      return this.invalid('Perintah show vlan hanya berlaku pada Switch.');
    }
    const lines = [
      'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------',
    ];

    const vlanMap = new Map<number, string[]>();
    for (const p of device.ports) {
      if (p.portMode === 'trunk') continue;
      const v = p.vlanId ?? 1;
      if (!vlanMap.has(v)) vlanMap.set(v, []);
      vlanMap.get(v)!.push(p.name);
    }
    if (!vlanMap.has(1)) vlanMap.set(1, []);

    const sortedVlans = [...vlanMap.keys()].sort((a, b) => a - b);
    for (const v of sortedVlans) {
      const name = v === 1 ? 'default' : `VLAN${String(v).padStart(4, '0')}`;
      const ports = (vlanMap.get(v) ?? []).join(', ');
      lines.push(`${String(v).padEnd(5)}${name.padEnd(33)}active    ${ports}`);
    }
    return lines;
  }
}
