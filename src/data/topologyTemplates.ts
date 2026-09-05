import { type Node, type Edge } from '@xyflow/react';
import { type DeviceData } from '../types/network';

export interface TopologyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Dasar' | 'LAN' | 'Routing L3' | 'Enterprise';
  nodes: Node<DeviceData>[];
  edges: Edge[];
}

export const TOPOLOGY_TEMPLATES: TopologyTemplate[] = [
  // 1. Peer-to-Peer
  {
    id: 'peer-to-peer',
    name: 'Peer-to-Peer (P2P)',
    category: 'Dasar',
    description: '2 PC terhubung langsung dengan kabel crossover/auto-MDIX (Subnet 192.168.1.0/24).',
    nodes: [
      {
        id: 'pc-1',
        type: 'deviceNode',
        position: { x: 150, y: 220 },
        data: {
          id: 'pc-1',
          label: 'PC-1',
          type: 'pc',
          ports: [
            {
              id: 'fa0',
              name: 'FastEthernet 0',
              status: 'up',
              ipAddress: '192.168.1.10',
              subnetMask: '255.255.255.0',
              macAddress: '00:50:79:66:68:01',
              connectedEdgeId: 'edge-pc1-pc2',
              connectedToNodeId: 'pc-2',
              connectedToPortId: 'fa0',
            },
          ],
          arpTable: {},
        },
      },
      {
        id: 'pc-2',
        type: 'deviceNode',
        position: { x: 500, y: 220 },
        data: {
          id: 'pc-2',
          label: 'PC-2',
          type: 'pc',
          ports: [
            {
              id: 'fa0',
              name: 'FastEthernet 0',
              status: 'up',
              ipAddress: '192.168.1.20',
              subnetMask: '255.255.255.0',
              macAddress: '00:50:79:66:68:02',
              connectedEdgeId: 'edge-pc1-pc2',
              connectedToNodeId: 'pc-1',
              connectedToPortId: 'fa0',
            },
          ],
          arpTable: {},
        },
      },
    ],
    edges: [
      {
        id: 'edge-pc1-pc2',
        source: 'pc-1',
        target: 'pc-2',
        sourceHandle: 'fa0',
        targetHandle: 'fa0',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0' },
        style: { stroke: '#10B981', strokeWidth: 3 },
      },
    ],
  },

  // 2. Single LAN Star
  {
    id: 'single-lan-star',
    name: 'Single LAN Star (Switch)',
    category: 'LAN',
    description: '3 PC host terhubung ke 1 Switch L2. Cocok untuk uji coba ARP broadcast flooding dan CAM table.',
    nodes: [
      {
        id: 'sw-1',
        type: 'deviceNode',
        position: { x: 350, y: 120 },
        data: {
          id: 'sw-1',
          label: 'Switch-1',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:AA:01:01', connectedEdgeId: 'edge-pc1-sw1', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:AA:01:02', connectedEdgeId: 'edge-pc2-sw1', connectedToNodeId: 'pc-2', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:AA:01:03', connectedEdgeId: 'edge-pc3-sw1', connectedToNodeId: 'pc-3', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:AA:01:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:AA:01:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:AA:01:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:AA:01:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:AA:01:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-1',
        type: 'deviceNode',
        position: { x: 120, y: 320 },
        data: {
          id: 'pc-1',
          label: 'PC-1',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:01:01', connectedEdgeId: 'edge-pc1-sw1', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/1' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-2',
        type: 'deviceNode',
        position: { x: 350, y: 340 },
        data: {
          id: 'pc-2',
          label: 'PC-2',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:01:02', connectedEdgeId: 'edge-pc2-sw1', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-3',
        type: 'deviceNode',
        position: { x: 580, y: 320 },
        data: {
          id: 'pc-3',
          label: 'PC-3',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.30', subnetMask: '255.255.255.0', macAddress: '00:50:79:10:01:03', connectedEdgeId: 'edge-pc3-sw1', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      {
        id: 'edge-pc1-sw1',
        source: 'pc-1',
        target: 'sw-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/1',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0/1' },
      },
      {
        id: 'edge-pc2-sw1',
        source: 'pc-2',
        target: 'sw-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/2',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0/2' },
      },
      {
        id: 'edge-pc3-sw1',
        source: 'pc-3',
        target: 'sw-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/3',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0/3' },
      },
    ],
  },

  // 3. Dual LAN Router
  {
    id: 'dual-lan-router',
    name: 'Dual LAN Routed (Gateway)',
    category: 'Routing L3',
    description: '2 Subnet terpisah (192.168.1.0/24 & 192.168.2.0/24) dihubungkan oleh 1 Router Cisco sebagai Default Gateway.',
    nodes: [
      {
        id: 'router-1',
        type: 'deviceNode',
        position: { x: 380, y: 70 },
        data: {
          id: 'router-1',
          label: 'Router-1',
          type: 'router',
          ports: [
            {
              id: 'fa0/0',
              name: 'FastEthernet 0/0',
              status: 'up',
              ipAddress: '192.168.1.1',
              subnetMask: '255.255.255.0',
              macAddress: '00:50:79:RT:01:00',
              connectedEdgeId: 'edge-rt1-sw1',
              connectedToNodeId: 'sw-1',
              connectedToPortId: 'fa0/1',
            },
            {
              id: 'fa0/1',
              name: 'FastEthernet 0/1',
              status: 'up',
              ipAddress: '192.168.2.1',
              subnetMask: '255.255.255.0',
              macAddress: '00:50:79:RT:01:01',
              connectedEdgeId: 'edge-rt1-sw2',
              connectedToNodeId: 'sw-2',
              connectedToPortId: 'fa0/1',
            },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', macAddress: '00:50:79:RT:01:02' },
          ],
          arpTable: {},
        },
      },
      {
        id: 'sw-1',
        type: 'deviceNode',
        position: { x: 180, y: 220 },
        data: {
          id: 'sw-1',
          label: 'Switch-LAN1',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:S1:00:01', connectedEdgeId: 'edge-rt1-sw1', connectedToNodeId: 'router-1', connectedToPortId: 'fa0/0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:S1:00:02', connectedEdgeId: 'edge-pc1-sw1', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'down', macAddress: '00:50:79:S1:00:03' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:S1:00:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:S1:00:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:S1:00:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:S1:00:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:S1:00:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'sw-2',
        type: 'deviceNode',
        position: { x: 580, y: 220 },
        data: {
          id: 'sw-2',
          label: 'Switch-LAN2',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:S2:00:01', connectedEdgeId: 'edge-rt1-sw2', connectedToNodeId: 'router-1', connectedToPortId: 'fa0/1' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:S2:00:02', connectedEdgeId: 'edge-pc2-sw2', connectedToNodeId: 'pc-2', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'down', macAddress: '00:50:79:S2:00:03' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:S2:00:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:S2:00:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:S2:00:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:S2:00:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:S2:00:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-1',
        type: 'deviceNode',
        position: { x: 180, y: 400 },
        data: {
          id: 'pc-1',
          label: 'PC-LAN1',
          type: 'pc',
          defaultGateway: '192.168.1.1',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:L1:00:01', connectedEdgeId: 'edge-pc1-sw1', connectedToNodeId: 'sw-1', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-2',
        type: 'deviceNode',
        position: { x: 580, y: 400 },
        data: {
          id: 'pc-2',
          label: 'PC-LAN2',
          type: 'pc',
          defaultGateway: '192.168.2.1',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.2.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:L2:00:01', connectedEdgeId: 'edge-pc2-sw2', connectedToNodeId: 'sw-2', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      {
        id: 'edge-rt1-sw1',
        source: 'router-1',
        target: 'sw-1',
        sourceHandle: 'fa0/0',
        targetHandle: 'fa0/1',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0/0', targetPortName: 'FastEthernet 0/1' },
      },
      {
        id: 'edge-rt1-sw2',
        source: 'router-1',
        target: 'sw-2',
        sourceHandle: 'fa0/1',
        targetHandle: 'fa0/1',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0/1', targetPortName: 'FastEthernet 0/1' },
      },
      {
        id: 'edge-pc1-sw1',
        source: 'pc-1',
        target: 'sw-1',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/2',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0/2' },
      },
      {
        id: 'edge-pc2-sw2',
        source: 'pc-2',
        target: 'sw-2',
        sourceHandle: 'fa0',
        targetHandle: 'fa0/2',
        type: 'networkCable',
        data: { sourcePortName: 'FastEthernet 0', targetPortName: 'FastEthernet 0/2' },
      },
    ],
  },

  // 4. Two Routers Back-to-Back (WAN Link Point-to-Point)
  {
    id: 'two-routers-wan',
    name: 'Dual Router Point-to-Point (WAN Link)',
    category: 'Routing L3',
    description: '2 Router terhubung via link point-to-point (Subnet WAN 10.0.0.0/30) dengan static route — demo ping antar-site dengan TTL berkurang 2.',
    nodes: [
      {
        id: 'r1-sitea',
        type: 'deviceNode',
        position: { x: 220, y: 160 },
        data: {
          id: 'r1-sitea',
          label: 'Router-SiteA',
          type: 'router',
          ports: [
            { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '10.0.0.1', subnetMask: '255.255.255.252', macAddress: '00:50:79:W1:00:01', connectedEdgeId: 'edge-r1-r2', connectedToNodeId: 'r2-siteb', connectedToPortId: 'fa0/0' },
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:W1:00:02', connectedEdgeId: 'edge-pca-r1', connectedToNodeId: 'pc-sitea', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', macAddress: '00:50:79:W1:00:03' },
          ],
          routes: [{ network: '192.168.20.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.2', interfaceId: 'fa0/0' }],
          arpTable: {},
        },
      },
      {
        id: 'r2-siteb',
        type: 'deviceNode',
        position: { x: 550, y: 160 },
        data: {
          id: 'r2-siteb',
          label: 'Router-SiteB',
          type: 'router',
          ports: [
            { id: 'fa0/0', name: 'FastEthernet 0/0', status: 'up', ipAddress: '10.0.0.2', subnetMask: '255.255.255.252', macAddress: '00:50:79:W2:00:01', connectedEdgeId: 'edge-r1-r2', connectedToNodeId: 'r1-sitea', connectedToPortId: 'fa0/0' },
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', ipAddress: '192.168.20.1', subnetMask: '255.255.255.0', macAddress: '00:50:79:W2:00:02', connectedEdgeId: 'edge-pcb-r2', connectedToNodeId: 'pc-siteb', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'down', macAddress: '00:50:79:W2:00:03' },
          ],
          routes: [{ network: '192.168.10.0', subnetMask: '255.255.255.0', nextHop: '10.0.0.1', interfaceId: 'fa0/0' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-sitea',
        type: 'deviceNode',
        position: { x: 220, y: 360 },
        data: {
          id: 'pc-sitea',
          label: 'Client-SiteA',
          type: 'pc',
          defaultGateway: '192.168.10.1',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:PA:00:01', connectedEdgeId: 'edge-pca-r1', connectedToNodeId: 'r1-sitea', connectedToPortId: 'fa0/1' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-siteb',
        type: 'deviceNode',
        position: { x: 550, y: 360 },
        data: {
          id: 'pc-siteb',
          label: 'Client-SiteB',
          type: 'pc',
          defaultGateway: '192.168.20.1',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.20.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:PB:00:01', connectedEdgeId: 'edge-pcb-r2', connectedToNodeId: 'r2-siteb', connectedToPortId: 'fa0/1' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      { id: 'edge-r1-r2', source: 'r1-sitea', target: 'r2-siteb', sourceHandle: 'fa0/0', targetHandle: 'fa0/0', type: 'networkCable', data: { sourcePortName: 'fa0/0 (WAN)', targetPortName: 'fa0/0 (WAN)' } },
      { id: 'edge-pca-r1', source: 'pc-sitea', target: 'r1-sitea', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1' } },
      { id: 'edge-pcb-r2', source: 'pc-siteb', target: 'r2-siteb', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1' } },
    ],
  },

  // 5. Hierarchical Tree Topology (Core - Distribution - Access)
  {
    id: 'hierarchical-tree',
    name: 'Hierarchical Campus Network (Tree)',
    category: 'Enterprise',
    description: 'Arsitektur bertingkat standar Cisco (Core Switch ➔ 2 Distribution/Access Switch ➔ 4 Host PC).',
    nodes: [
      {
        id: 'core-sw',
        type: 'deviceNode',
        position: { x: 380, y: 60 },
        data: {
          id: 'core-sw',
          label: 'Core-Switch',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:CS:00:01', connectedEdgeId: 'edge-core-dist1', connectedToNodeId: 'dist-sw1', connectedToPortId: 'fa0/1' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:CS:00:02', connectedEdgeId: 'edge-core-dist2', connectedToNodeId: 'dist-sw2', connectedToPortId: 'fa0/1' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'down', macAddress: '00:50:79:CS:00:03' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:CS:00:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:CS:00:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:CS:00:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:CS:00:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:CS:00:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'dist-sw1',
        type: 'deviceNode',
        position: { x: 180, y: 200 },
        data: {
          id: 'dist-sw1',
          label: 'Access-SW1',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:D1:00:01', connectedEdgeId: 'edge-core-dist1', connectedToNodeId: 'core-sw', connectedToPortId: 'fa0/1' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:D1:00:02', connectedEdgeId: 'edge-p1-d1', connectedToNodeId: 'pc-t1', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:D1:00:03', connectedEdgeId: 'edge-p2-d1', connectedToNodeId: 'pc-t2', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:D1:00:04' },
          ],
          macTable: {},
        },
      },
      {
        id: 'dist-sw2',
        type: 'deviceNode',
        position: { x: 580, y: 200 },
        data: {
          id: 'dist-sw2',
          label: 'Access-SW2',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:D2:00:01', connectedEdgeId: 'edge-core-dist2', connectedToNodeId: 'core-sw', connectedToPortId: 'fa0/2' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:D2:00:02', connectedEdgeId: 'edge-p3-d2', connectedToNodeId: 'pc-t3', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:D2:00:03', connectedEdgeId: 'edge-p4-d2', connectedToNodeId: 'pc-t4', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:D2:00:04' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-t1',
        type: 'deviceNode',
        position: { x: 80, y: 380 },
        data: {
          id: 'pc-t1',
          label: 'PC-Finance-1',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.0.10', subnetMask: '255.255.0.0', macAddress: '00:50:79:F1:00:01', connectedEdgeId: 'edge-p1-d1', connectedToNodeId: 'dist-sw1', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-t2',
        type: 'deviceNode',
        position: { x: 260, y: 380 },
        data: {
          id: 'pc-t2',
          label: 'PC-Finance-2',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.0.20', subnetMask: '255.255.0.0', macAddress: '00:50:79:F1:00:02', connectedEdgeId: 'edge-p2-d1', connectedToNodeId: 'dist-sw1', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-t3',
        type: 'deviceNode',
        position: { x: 480, y: 380 },
        data: {
          id: 'pc-t3',
          label: 'PC-Marketing-1',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.0.30', subnetMask: '255.255.0.0', macAddress: '00:50:79:M1:00:01', connectedEdgeId: 'edge-p3-d2', connectedToNodeId: 'dist-sw2', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-t4',
        type: 'deviceNode',
        position: { x: 670, y: 380 },
        data: {
          id: 'pc-t4',
          label: 'PC-Marketing-2',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '172.16.0.40', subnetMask: '255.255.0.0', macAddress: '00:50:79:M1:00:02', connectedEdgeId: 'edge-p4-d2', connectedToNodeId: 'dist-sw2', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      { id: 'edge-core-dist1', source: 'core-sw', target: 'dist-sw1', sourceHandle: 'fa0/1', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/1', targetPortName: 'fa0/1' } },
      { id: 'edge-core-dist2', source: 'core-sw', target: 'dist-sw2', sourceHandle: 'fa0/2', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/1' } },
      { id: 'edge-p1-d1', source: 'pc-t1', target: 'dist-sw1', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-p2-d1', source: 'pc-t2', target: 'dist-sw1', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
      { id: 'edge-p3-d2', source: 'pc-t3', target: 'dist-sw2', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-p4-d2', source: 'pc-t4', target: 'dist-sw2', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },

  // 6. Redundant Ring Mesh
  {
    id: 'mesh-redundant-switch',
    name: 'Redundant Ring/Mesh Switch',
    category: 'LAN',
    description: 'Topologi cincin 3 Switch L2. Engine memilih jalur terpendek (BFS) tanpa STP — cocok untuk mengamati redundansi jalur.',
    nodes: [
      {
        id: 'sw-a',
        type: 'deviceNode',
        position: { x: 380, y: 100 },
        data: {
          id: 'sw-a',
          label: 'Switch-A',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:A1:00:01', connectedEdgeId: 'edge-swa-swb', connectedToNodeId: 'sw-b', connectedToPortId: 'fa0/1' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:A1:00:02', connectedEdgeId: 'edge-swa-swc', connectedToNodeId: 'sw-c', connectedToPortId: 'fa0/1' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:A1:00:03', connectedEdgeId: 'edge-pca-swa', connectedToNodeId: 'pc-a', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:A1:00:04' },
          ],
          macTable: {},
        },
      },
      {
        id: 'sw-b',
        type: 'deviceNode',
        position: { x: 180, y: 280 },
        data: {
          id: 'sw-b',
          label: 'Switch-B',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:B1:00:01', connectedEdgeId: 'edge-swa-swb', connectedToNodeId: 'sw-a', connectedToPortId: 'fa0/1' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:B1:00:02', connectedEdgeId: 'edge-swb-swc', connectedToNodeId: 'sw-c', connectedToPortId: 'fa0/2' },
          ],
          macTable: {},
        },
      },
      {
        id: 'sw-c',
        type: 'deviceNode',
        position: { x: 580, y: 280 },
        data: {
          id: 'sw-c',
          label: 'Switch-C',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:C1:00:01', connectedEdgeId: 'edge-swa-swc', connectedToNodeId: 'sw-a', connectedToPortId: 'fa0/2' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:C1:00:02', connectedEdgeId: 'edge-swb-swc', connectedToNodeId: 'sw-b', connectedToPortId: 'fa0/2' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-a',
        type: 'deviceNode',
        position: { x: 380, y: 440 },
        data: {
          id: 'pc-a',
          label: 'Host-PC',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '10.0.0.10', subnetMask: '255.0.0.0', macAddress: '00:50:79:CC:00:01', connectedEdgeId: 'edge-pca-swa', connectedToNodeId: 'sw-a', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      { id: 'edge-swa-swb', source: 'sw-a', target: 'sw-b', sourceHandle: 'fa0/1', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/1', targetPortName: 'fa0/1' } },
      { id: 'edge-swa-swc', source: 'sw-a', target: 'sw-c', sourceHandle: 'fa0/2', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/1' } },
      { id: 'edge-swb-swc', source: 'sw-b', target: 'sw-c', sourceHandle: 'fa0/2', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0/2', targetPortName: 'fa0/2' } },
      { id: 'edge-pca-swa', source: 'pc-a', target: 'sw-a', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },

  // 7. Small Office LAN with Server & Laptop (komponen baru)
  {
    id: 'small-office-server',
    name: 'Kantor Kecil: Server + Laptop + PC',
    category: 'LAN',
    description: 'LAN kantor kecil: File Server, Laptop, dan PC Host berbagi satu subnet 192.168.1.0/24 via Switch L2 — demo ARP & warm-cache antar 3 host.',
    nodes: [
      {
        id: 'sw-office',
        type: 'deviceNode',
        position: { x: 380, y: 140 },
        data: {
          id: 'sw-office',
          label: 'Switch-1',
          type: 'switch',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:OF:01:01', connectedEdgeId: 'edge-srv-sw', connectedToNodeId: 'srv-1', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:OF:01:02', connectedEdgeId: 'edge-lap-sw', connectedToNodeId: 'lap-1', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:OF:01:03', connectedEdgeId: 'edge-pc-sw', connectedToNodeId: 'pc-1', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:OF:01:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:OF:01:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:OF:01:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:OF:01:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:OF:01:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'srv-1',
        type: 'deviceNode',
        position: { x: 120, y: 320 },
        data: {
          id: 'srv-1',
          label: 'File-Server',
          type: 'server',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.50', subnetMask: '255.255.255.0', macAddress: '00:50:79:SV:01:01', connectedEdgeId: 'edge-srv-sw', connectedToNodeId: 'sw-office', connectedToPortId: 'fa0/1' }],
          arpTable: {},
        },
      },
      {
        id: 'lap-1',
        type: 'deviceNode',
        position: { x: 400, y: 340 },
        data: {
          id: 'lap-1',
          label: 'Laptop-1',
          type: 'laptop',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:LP:01:01', connectedEdgeId: 'edge-lap-sw', connectedToNodeId: 'sw-office', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-1',
        type: 'deviceNode',
        position: { x: 660, y: 320 },
        data: {
          id: 'pc-1',
          label: 'PC-1',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:PC:01:01', connectedEdgeId: 'edge-pc-sw', connectedToNodeId: 'sw-office', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      { id: 'edge-srv-sw', source: 'srv-1', target: 'sw-office', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1' } },
      { id: 'edge-lap-sw', source: 'lap-1', target: 'sw-office', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-pc-sw', source: 'pc-1', target: 'sw-office', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },

  // 8. Hub Lab (repeater murni — tanpa CAM learning)
  {
    id: 'hub-collision-lab',
    name: 'Lab Hub (Repeater Murni)',
    category: 'Dasar',
    description: '3 PC terhubung via Hub 8 port. Bandingkan dengan Switch: hub tidak belajar CAM table — semua frame hanya di-repeat, cocok untuk demo collision domain.',
    nodes: [
      {
        id: 'hub-1',
        type: 'deviceNode',
        position: { x: 380, y: 140 },
        data: {
          id: 'hub-1',
          label: 'Hub-1',
          type: 'hub',
          ports: [
            { id: 'fa0/1', name: 'FastEthernet 0/1', status: 'up', macAddress: '00:50:79:HB:01:01', connectedEdgeId: 'edge-hub-pc1', connectedToNodeId: 'pc-hub-1', connectedToPortId: 'fa0' },
            { id: 'fa0/2', name: 'FastEthernet 0/2', status: 'up', macAddress: '00:50:79:HB:01:02', connectedEdgeId: 'edge-hub-pc2', connectedToNodeId: 'pc-hub-2', connectedToPortId: 'fa0' },
            { id: 'fa0/3', name: 'FastEthernet 0/3', status: 'up', macAddress: '00:50:79:HB:01:03', connectedEdgeId: 'edge-hub-pc3', connectedToNodeId: 'pc-hub-3', connectedToPortId: 'fa0' },
            { id: 'fa0/4', name: 'FastEthernet 0/4', status: 'down', macAddress: '00:50:79:HB:01:04' },
            { id: 'fa0/5', name: 'FastEthernet 0/5', status: 'down', macAddress: '00:50:79:HB:01:05' },
            { id: 'fa0/6', name: 'FastEthernet 0/6', status: 'down', macAddress: '00:50:79:HB:01:06' },
            { id: 'fa0/7', name: 'FastEthernet 0/7', status: 'down', macAddress: '00:50:79:HB:01:07' },
            { id: 'fa0/8', name: 'FastEthernet 0/8', status: 'down', macAddress: '00:50:79:HB:01:08' },
          ],
          macTable: {},
        },
      },
      {
        id: 'pc-hub-1',
        type: 'deviceNode',
        position: { x: 120, y: 330 },
        data: {
          id: 'pc-hub-1',
          label: 'PC-1',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', macAddress: '00:50:79:H1:01:01', connectedEdgeId: 'edge-hub-pc1', connectedToNodeId: 'hub-1', connectedToPortId: 'fa0/1' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-hub-2',
        type: 'deviceNode',
        position: { x: 400, y: 330 },
        data: {
          id: 'pc-hub-2',
          label: 'PC-2',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '00:50:79:H1:02:01', connectedEdgeId: 'edge-hub-pc2', connectedToNodeId: 'hub-1', connectedToPortId: 'fa0/2' }],
          arpTable: {},
        },
      },
      {
        id: 'pc-hub-3',
        type: 'deviceNode',
        position: { x: 660, y: 330 },
        data: {
          id: 'pc-hub-3',
          label: 'PC-3',
          type: 'pc',
          ports: [{ id: 'fa0', name: 'FastEthernet 0', status: 'up', ipAddress: '192.168.1.30', subnetMask: '255.255.255.0', macAddress: '00:50:79:H1:03:01', connectedEdgeId: 'edge-hub-pc3', connectedToNodeId: 'hub-1', connectedToPortId: 'fa0/3' }],
          arpTable: {},
        },
      },
    ],
    edges: [
      { id: 'edge-hub-pc1', source: 'pc-hub-1', target: 'hub-1', sourceHandle: 'fa0', targetHandle: 'fa0/1', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/1' } },
      { id: 'edge-hub-pc2', source: 'pc-hub-2', target: 'hub-1', sourceHandle: 'fa0', targetHandle: 'fa0/2', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/2' } },
      { id: 'edge-hub-pc3', source: 'pc-hub-3', target: 'hub-1', sourceHandle: 'fa0', targetHandle: 'fa0/3', type: 'networkCable', data: { sourcePortName: 'fa0', targetPortName: 'fa0/3' } },
    ],
  },
];
