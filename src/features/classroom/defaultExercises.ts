import type { Exercise } from './types';

export const DEFAULT_EXERCISES: Exercise[] = [
  {
    id: 'ex-01-lan-basic',
    title: 'Tantangan 01: Koneksi LAN Dasar (PC ke Switch & Server)',
    instructions:
      'Hubungkan PC-1 dan Server-1 ke Switch-1. Atur IP PC-1 ke 192.168.1.10 (mask 255.255.255.0) dan Server-1 ke 192.168.1.50 (mask 255.255.255.0). Pastikan ping dari PC-1 ke Server-1 berhasil.',
    difficulty: 'Dasar',
    starterTemplateId: 'tpl-single-switch-lan',
    targets: [
      {
        id: 'tgt-pc1-ip',
        title: 'Konfigurasi IP PC-1 (192.168.1.10/24)',
        type: 'device_config',
        deviceId: 'pc-1',
        address: '192.168.1.10',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-srv1-ip',
        title: 'Konfigurasi IP Server-1 (192.168.1.50/24)',
        type: 'device_config',
        deviceId: 'server-1',
        address: '192.168.1.50',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-link-pc-sw',
        title: 'Kabel fisik PC-1 terhubung ke Switch-1',
        type: 'link_exists',
        fromDeviceId: 'pc-1',
        toDeviceId: 'sw-1',
      },
      {
        id: 'tgt-ping-pc-srv',
        title: 'Ping berhasil: PC-1 menjangkau Server-1 (ICMP 100%)',
        type: 'reachability',
        sourceDeviceId: 'pc-1',
        destinationDeviceId: 'server-1',
      },
    ],
  },
  {
    id: 'ex-02-router-gateway',
    title: 'Tantangan 02: Routing Lintas Subnet dengan Default Gateway',
    instructions:
      'Hubungkan dua subnet berbeda melalui Router-1. Subnet A (192.168.1.0/24) untuk PC-1 dengan gateway 192.168.1.1. Subnet B (192.168.2.0/24) untuk PC-2 dengan gateway 192.168.2.1. Uji ping lintas segmen.',
    difficulty: 'Menengah',
    starterTemplateId: 'tpl-classic-router-direct',
    targets: [
      {
        id: 'tgt-pc1-ip',
        title: 'Konfigurasi IP PC-1 (192.168.1.10/24)',
        type: 'device_config',
        deviceId: 'pc-1',
        address: '192.168.1.10',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-pc2-ip',
        title: 'Konfigurasi IP PC-2 (192.168.2.20/24)',
        type: 'device_config',
        deviceId: 'pc-2',
        address: '192.168.2.20',
        subnetMask: '255.255.255.0',
      },
      {
        id: 'tgt-ping-cross-subnet',
        title: 'Ping lintas subnet: PC-1 ke PC-2 melalui Router',
        type: 'reachability',
        sourceDeviceId: 'pc-1',
        destinationDeviceId: 'pc-2',
      },
    ],
  },
  {
    id: 'ex-03-vlan-segmentation',
    title: 'Tantangan 03: Isolasi Keamanan Jaringan dengan VLAN',
    instructions:
      'Lakukan segmentasi port pada Switch-1. Kelompokkan port PC-1 ke dalam VLAN 10 dan PC-2 ke dalam VLAN 20. Pastikan kedua host yang berbeda VLAN tidak dapat saling membocorkan trafik.',
    difficulty: 'Menengah',
    starterTemplateId: 'tpl-single-switch-lan',
    targets: [
      {
        id: 'tgt-vlan-pc1',
        title: 'Port PC-1 berada pada VLAN 10 (Access)',
        type: 'vlan_config',
        deviceId: 'sw-1',
        portId: 'fa0/1',
        vlanId: 10,
        mode: 'access',
      },
      {
        id: 'tgt-vlan-pc2',
        title: 'Port PC-2 berada pada VLAN 20 (Access)',
        type: 'vlan_config',
        deviceId: 'sw-1',
        portId: 'fa0/2',
        vlanId: 20,
        mode: 'access',
      },
      {
        id: 'tgt-link-sw-pc1',
        title: 'Koneksi fisik PC-1 ke Switch-1',
        type: 'link_exists',
        fromDeviceId: 'pc-1',
        toDeviceId: 'sw-1',
      },
    ],
  },
  {
    id: 'ex-04-wifi-hotspot',
    title: 'Tantangan 04: Infrastruktur Nirkabel (WiFi SSID & AP)',
    instructions:
      'Hubungkan Laptop-1 secara nirkabel ke AccessPoint-1 menggunakan SSID yang sesuai. Pastikan konfigurasi IP nirkabel valid dan dapat mencapai Server-1 di jaringan kabel.',
    difficulty: 'Lanjutan',
    targets: [
      {
        id: 'tgt-req-ap',
        title: 'Terdapat minimal 1 unit Access Point di kanvas',
        type: 'required_device_count',
        deviceType: 'accessPoint',
        count: 1,
      },
      {
        id: 'tgt-link-wifi',
        title: 'Laptop terasosiasi nirkabel dengan Access Point',
        type: 'link_exists',
        fromDeviceId: 'laptop-1',
        toDeviceId: 'ap-1',
      },
      {
        id: 'tgt-ping-wifi-server',
        title: 'Ping berhasil: Laptop-1 menjangkau Server-1 via WiFi',
        type: 'reachability',
        sourceDeviceId: 'laptop-1',
        destinationDeviceId: 'server-1',
      },
    ],
  },
];
