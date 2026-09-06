import { type TopologyTemplate } from './topologyTemplates';

/**
 * Template topologi klasik (Star/Bus/Ring/Daisy Chain/Hybrid) — dipisah dari
 * topologyTemplates.ts agar berkas utama tetap ringan, lalu di-spread ke
 * TOPOLOGY_TEMPLATES.
 */

export const CLASSIC_TEMPLATES: TopologyTemplate[] = [
  // Topologi Bus (backbone bersama dimodelkan Hub)
  {
    id: 'topologi-bus',
    name: 'Topologi Bus',
    category: 'Dasar',
    description: '4 PC menumpang satu backbone bersama (dimodelkan Hub). Semua frame menyebar ke seluruh backbone — ciri khas topologi bus.',
    nodes: [
      {
        id: 'hub-bus', type: 'deviceNode', position: { x: 380, y: 130 },
        data: {
          id: 'hub-bus', label: 'Bus (Hub)', type: 'hub',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TB:01:01', connectedEdgeId: 'edge-bus-pc1', connectedToNodeId: 'pc-bus1', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TB:01:02', connectedEdgeId: 'edge-bus-pc2', connectedToNodeId: 'pc-bus2', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TB:01:03', connectedEdgeId: 'edge-bus-pc3', connectedToNodeId: 'pc-bus3', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TB:01:04', connectedEdgeId: 'edge-bus-pc4', connectedToNodeId: 'pc-bus4', connectedToPortId: 'fa0' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TB:01:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TB:01:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TB:01:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TB:01:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-bus1', type: 'deviceNode', position: { x: 100, y: 320 },
        data: { id: 'pc-bus1', label: 'PC-1', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.11', subnetMask: '255.255.255.0', macAddress: '00:50:79:TB:02:01', connectedEdgeId: 'edge-bus-pc1', connectedToNodeId: 'hub-bus', connectedToPortId: 'fa0/1' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TB:02:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-bus2', type: 'deviceNode', position: { x: 290, y: 320 },
        data: { id: 'pc-bus2', label: 'PC-2', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.12', subnetMask: '255.255.255.0', macAddress: '00:50:79:TB:03:01', connectedEdgeId: 'edge-bus-pc2', connectedToNodeId: 'hub-bus', connectedToPortId: 'fa0/2' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TB:03:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-bus3', type: 'deviceNode', position: { x: 480, y: 320 },
        data: { id: 'pc-bus3', label: 'PC-3', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.13', subnetMask: '255.255.255.0', macAddress: '00:50:79:TB:04:01', connectedEdgeId: 'edge-bus-pc3', connectedToNodeId: 'hub-bus', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TB:04:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-bus4', type: 'deviceNode', position: { x: 670, y: 320 },
        data: { id: 'pc-bus4', label: 'PC-4', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.14', subnetMask: '255.255.255.0', macAddress: '00:50:79:TB:05:01', connectedEdgeId: 'edge-bus-pc4', connectedToNodeId: 'hub-bus', connectedToPortId: 'fa0/4' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TB:05:02', ssid: '' } ], arpTable: {} },
      },
    ],
    edges: [
      { id: 'edge-bus-pc1', source: 'pc-bus1', target: 'hub-bus', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1' } },
      { id: 'edge-bus-pc2', source: 'pc-bus2', target: 'hub-bus', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-bus-pc3', source: 'pc-bus3', target: 'hub-bus', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-bus-pc4', source: 'pc-bus4', target: 'hub-bus', sourceHandle: 'fa0', targetHandle: 'fa0/4', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/4' } },
    ],
  },

  // Topologi Ring (cincin 4 switch tertutup)
  {
    id: 'topologi-ring',
    name: 'Topologi Ring (Cincin)',
    category: 'Dasar',
    description: '4 Switch tersambung melingkar membentuk cincin tertutup, masing-masing dengan 1 PC. Engine memilih jalur terpendek (BFS) antar sisi cincin.',
    nodes: [
      {
        id: 'sw-ring1', type: 'deviceNode', position: { x: 380, y: 90 },
        data: { id: 'sw-ring1', label: 'Switch-1', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:01:01', connectedEdgeId: 'edge-ring-12', connectedToNodeId: 'sw-ring2', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:01:02', connectedEdgeId: 'edge-ring-41', connectedToNodeId: 'sw-ring4', connectedToPortId: 'fa0/2' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:01:03', connectedEdgeId: 'edge-ring-pc1', connectedToNodeId: 'pc-ring1', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:01:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:01:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:01:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:01:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:01:08' },
        ], macTable: {} },
      },
      {
        id: 'sw-ring2', type: 'deviceNode', position: { x: 680, y: 260 },
        data: { id: 'sw-ring2', label: 'Switch-2', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:02:01', connectedEdgeId: 'edge-ring-12', connectedToNodeId: 'sw-ring1', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:02:02', connectedEdgeId: 'edge-ring-23', connectedToNodeId: 'sw-ring3', connectedToPortId: 'fa0/1' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:02:03', connectedEdgeId: 'edge-ring-pc2', connectedToNodeId: 'pc-ring2', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:02:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:02:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:02:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:02:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:02:08' },
        ], macTable: {} },
      },
      {
        id: 'sw-ring3', type: 'deviceNode', position: { x: 380, y: 430 },
        data: { id: 'sw-ring3', label: 'Switch-3', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:03:01', connectedEdgeId: 'edge-ring-23', connectedToNodeId: 'sw-ring2', connectedToPortId: 'fa0/2' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:03:02', connectedEdgeId: 'edge-ring-34', connectedToNodeId: 'sw-ring4', connectedToPortId: 'fa0/1' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:03:03', connectedEdgeId: 'edge-ring-pc3', connectedToNodeId: 'pc-ring3', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:03:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:03:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:03:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:03:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:03:08' },
        ], macTable: {} },
      },
      {
        id: 'sw-ring4', type: 'deviceNode', position: { x: 80, y: 260 },
        data: { id: 'sw-ring4', label: 'Switch-4', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:04:01', connectedEdgeId: 'edge-ring-34', connectedToNodeId: 'sw-ring3', connectedToPortId: 'fa0/2' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:04:02', connectedEdgeId: 'edge-ring-41', connectedToNodeId: 'sw-ring1', connectedToPortId: 'fa0/2' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:TR:04:03', connectedEdgeId: 'edge-ring-pc4', connectedToNodeId: 'pc-ring4', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:04:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:04:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:04:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:04:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:TR:04:08' },
        ], macTable: {} },
      },
      {
        id: 'pc-ring1', type: 'deviceNode', position: { x: 380, y: 230 },
        data: { id: 'pc-ring1', label: 'PC-1', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.11', subnetMask: '255.255.255.0', macAddress: '00:50:79:TR:05:01', connectedEdgeId: 'edge-ring-pc1', connectedToNodeId: 'sw-ring1', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TR:05:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-ring2', type: 'deviceNode', position: { x: 700, y: 330 },
        data: { id: 'pc-ring2', label: 'PC-2', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.12', subnetMask: '255.255.255.0', macAddress: '00:50:79:TR:06:01', connectedEdgeId: 'edge-ring-pc2', connectedToNodeId: 'sw-ring2', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TR:06:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-ring3', type: 'deviceNode', position: { x: 380, y: 560 },
        data: { id: 'pc-ring3', label: 'PC-3', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.13', subnetMask: '255.255.255.0', macAddress: '00:50:79:TR:07:01', connectedEdgeId: 'edge-ring-pc3', connectedToNodeId: 'sw-ring3', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TR:07:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-ring4', type: 'deviceNode', position: { x: 60, y: 330 },
        data: { id: 'pc-ring4', label: 'PC-4', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.14', subnetMask: '255.255.255.0', macAddress: '00:50:79:TR:08:01', connectedEdgeId: 'edge-ring-pc4', connectedToNodeId: 'sw-ring4', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:TR:08:02', ssid: '' } ], arpTable: {} },
      },
    ],
    edges: [
      { id: 'edge-ring-12', source: 'sw-ring1', target: 'sw-ring2', sourceHandle: 'fa0/1', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/1', targetPortName: 'fa0/1' } },
      { id: 'edge-ring-23', source: 'sw-ring2', target: 'sw-ring3', sourceHandle: 'fa0/2', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/1' } },
      { id: 'edge-ring-34', source: 'sw-ring3', target: 'sw-ring4', sourceHandle: 'fa0/2', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/1' } },
      { id: 'edge-ring-41', source: 'sw-ring4', target: 'sw-ring1', sourceHandle: 'fa0/2', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/2' } },
      { id: 'edge-ring-pc1', source: 'pc-ring1', target: 'sw-ring1', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-ring-pc2', source: 'pc-ring2', target: 'sw-ring2', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-ring-pc3', source: 'pc-ring3', target: 'sw-ring3', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-ring-pc4', source: 'pc-ring4', target: 'sw-ring4', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },

  // Topologi Daisy Chain (switch dirangkai seri, tanpa loop)
  {
    id: 'topologi-daisy-chain',
    name: 'Topologi Daisy Chain',
    category: 'Dasar',
    description: '3 Switch dirangkai seri tanpa loop (rangkaian terbuka), masing-masing dengan 1 PC — pola umum di gedung bertingkat dan industri.',
    nodes: [
      {
        id: 'sw-d1', type: 'deviceNode', position: { x: 120, y: 140 },
        data: { id: 'sw-d1', label: 'Switch-1', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:01:01', connectedEdgeId: 'edge-dc-12', connectedToNodeId: 'sw-d2', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:01:02', connectedEdgeId: 'edge-dc-pc1', connectedToNodeId: 'pc-d1', connectedToPortId: 'fa0' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:03' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:01:08' },
        ], macTable: {} },
      },
      {
        id: 'sw-d2', type: 'deviceNode', position: { x: 380, y: 140 },
        data: { id: 'sw-d2', label: 'Switch-2', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:02:01', connectedEdgeId: 'edge-dc-12', connectedToNodeId: 'sw-d1', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:02:02', connectedEdgeId: 'edge-dc-23', connectedToNodeId: 'sw-d3', connectedToPortId: 'fa0/1' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:02:03', connectedEdgeId: 'edge-dc-pc2', connectedToNodeId: 'pc-d2', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:02:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:02:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:02:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:02:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:02:08' },
        ], macTable: {} },
      },
      {
        id: 'sw-d3', type: 'deviceNode', position: { x: 640, y: 140 },
        data: { id: 'sw-d3', label: 'Switch-3', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:03:01', connectedEdgeId: 'edge-dc-23', connectedToNodeId: 'sw-d2', connectedToPortId: 'fa0/2' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:DC:03:02', connectedEdgeId: 'edge-dc-pc3', connectedToNodeId: 'pc-d3', connectedToPortId: 'fa0' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:03' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:DC:03:08' },
        ], macTable: {} },
      },
      {
        id: 'pc-d1', type: 'deviceNode', position: { x: 120, y: 330 },
        data: { id: 'pc-d1', label: 'PC-1', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.11', subnetMask: '255.255.255.0', macAddress: '00:50:79:DC:04:01', connectedEdgeId: 'edge-dc-pc1', connectedToNodeId: 'sw-d1', connectedToPortId: 'fa0/2' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:DC:04:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-d2', type: 'deviceNode', position: { x: 380, y: 330 },
        data: { id: 'pc-d2', label: 'PC-2', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.12', subnetMask: '255.255.255.0', macAddress: '00:50:79:DC:05:01', connectedEdgeId: 'edge-dc-pc2', connectedToNodeId: 'sw-d2', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:DC:05:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-d3', type: 'deviceNode', position: { x: 640, y: 330 },
        data: { id: 'pc-d3', label: 'PC-3', type: 'pc', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.1.13', subnetMask: '255.255.255.0', macAddress: '00:50:79:DC:06:01', connectedEdgeId: 'edge-dc-pc3', connectedToNodeId: 'sw-d3', connectedToPortId: 'fa0/2' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:DC:06:02', ssid: '' } ], arpTable: {} },
      },
    ],
    edges: [
      { id: 'edge-dc-12', source: 'sw-d1', target: 'sw-d2', sourceHandle: 'fa0/1', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/1', targetPortName: 'fa0/1' } },
      { id: 'edge-dc-23', source: 'sw-d2', target: 'sw-d3', sourceHandle: 'fa0/2', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/1' } },
      { id: 'edge-dc-pc1', source: 'pc-d1', target: 'sw-d1', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-dc-pc2', source: 'pc-d2', target: 'sw-d2', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-dc-pc3', source: 'pc-d3', target: 'sw-d3', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
    ],
  },

  // Topologi Hybrid (star + bus disatukan router)
  {
    id: 'topologi-hybrid',
    name: 'Topologi Hybrid (Campuran)',
    category: 'Enterprise',
    description: 'Gabungan dua topologi: LAN Star (switch) + segmen Bus (hub) disatukan router. Ping PC-Star → PC-Bus membuktikan hybrid berfungsi lintas subnet.',
    nodes: [
      {
        id: 'r-hyb', type: 'deviceNode', position: { x: 380, y: 80 },
        data: { id: 'r-hyb', label: 'Router-1', type: 'router', ports: [
          { id: 'fa0/0', name: 'FastEthernet 0/0 (LAN Star)', status: 'up', ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:01:01', connectedEdgeId: 'edge-hyb-r-sw', connectedToNodeId: 'sw-hyb', connectedToPortId: 'fa0/1' },
          { id: 'fa0/1', name: 'FastEthernet 0/1 (LAN Bus)', status: 'up', ipAddress: '192.168.20.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:01:02', connectedEdgeId: 'edge-hyb-r-hub', connectedToNodeId: 'hub-hyb', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:01:03' },
        ], routes: [], arpTable: {} },
      },
      {
        id: 'sw-hyb', type: 'deviceNode', position: { x: 160, y: 230 },
        data: { id: 'sw-hyb', label: 'Switch (Star)', type: 'switch', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:02:01', connectedEdgeId: 'edge-hyb-r-sw', connectedToNodeId: 'r-hyb', connectedToPortId: 'fa0/0' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:02:02', connectedEdgeId: 'edge-hyb-pc1', connectedToNodeId: 'pc-hyb1', connectedToPortId: 'fa0' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:02:03', connectedEdgeId: 'edge-hyb-pc2', connectedToNodeId: 'pc-hyb2', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:02:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:02:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:02:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:02:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:02:08' },
        ], macTable: {} },
      },
      {
        id: 'hub-hyb', type: 'deviceNode', position: { x: 620, y: 230 },
        data: { id: 'hub-hyb', label: 'Hub (Bus)', type: 'hub', ports: [
          { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:03:01', connectedEdgeId: 'edge-hyb-r-hub', connectedToNodeId: 'r-hyb', connectedToPortId: 'fa0/1' },
          { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:03:02', connectedEdgeId: 'edge-hyb-pc3', connectedToNodeId: 'pc-hyb3', connectedToPortId: 'fa0' },
          { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', kind: 'ethernet', macAddress: '00:50:79:HY:03:03', connectedEdgeId: 'edge-hyb-pc4', connectedToNodeId: 'pc-hyb4', connectedToPortId: 'fa0' },
          { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:03:04' },
          { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:03:05' },
          { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:03:06' },
          { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:03:07' },
          { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', kind: 'ethernet', macAddress: '00:50:79:HY:03:08' },
        ], macTable: {} },
      },
      {
        id: 'pc-hyb1', type: 'deviceNode', position: { x: 60, y: 420 },
        data: { id: 'pc-hyb1', label: 'PC-Star1', type: 'pc', defaultGateway: '192.168.10.1', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.10.11', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:04:01', connectedEdgeId: 'edge-hyb-pc1', connectedToNodeId: 'sw-hyb', connectedToPortId: 'fa0/2' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:HY:04:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-hyb2', type: 'deviceNode', position: { x: 250, y: 420 },
        data: { id: 'pc-hyb2', label: 'PC-Star2', type: 'pc', defaultGateway: '192.168.10.1', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.10.12', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:05:01', connectedEdgeId: 'edge-hyb-pc2', connectedToNodeId: 'sw-hyb', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:HY:05:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-hyb3', type: 'deviceNode', position: { x: 530, y: 420 },
        data: { id: 'pc-hyb3', label: 'PC-Bus1', type: 'pc', defaultGateway: '192.168.20.1', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.20.11', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:06:01', connectedEdgeId: 'edge-hyb-pc3', connectedToNodeId: 'hub-hyb', connectedToPortId: 'fa0/2' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:HY:06:02', ssid: '' } ], arpTable: {} },
      },
      {
        id: 'pc-hyb4', type: 'deviceNode', position: { x: 720, y: 420 },
        data: { id: 'pc-hyb4', label: 'PC-Bus2', type: 'pc', defaultGateway: '192.168.20.1', ports: [ { id: 'fa0', name: 'FastEthernet 0', status: 'up', kind: 'ethernet', ipAddress: '192.168.20.12', subnetMask: '255.255.255.0', macAddress: '00:50:79:HY:07:01', connectedEdgeId: 'edge-hyb-pc4', connectedToNodeId: 'hub-hyb', connectedToPortId: 'fa0/3' }, { id: 'wla0', name: 'Wireless Adapter', status: 'down', kind: 'wireless', macAddress: '00:50:79:HY:07:02', ssid: '' } ], arpTable: {} },
      },
    ],
    edges: [
      { id: 'edge-hyb-r-sw', source: 'r-hyb', target: 'sw-hyb', sourceHandle: 'fa0/0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/0 (LAN Star)', targetPortName: 'fa0/1' } },
      { id: 'edge-hyb-r-hub', source: 'r-hyb', target: 'hub-hyb', sourceHandle: 'fa0/1', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/1 (LAN Bus)', targetPortName: 'fa0/1' } },
      { id: 'edge-hyb-pc1', source: 'pc-hyb1', target: 'sw-hyb', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-hyb-pc2', source: 'pc-hyb2', target: 'sw-hyb', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-hyb-pc3', source: 'pc-hyb3', target: 'hub-hyb', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-hyb-pc4', source: 'pc-hyb4', target: 'hub-hyb', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },
];
