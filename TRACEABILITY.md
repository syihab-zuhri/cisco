# TRACEABILITY: Requirement Traceability Matrix (RTM)

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-TRACE-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & QA Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-SRS-001, DOC-TASKS-001, DOC-TEST-001  
> **Supersedes:** None  

---

## 1. Traceability Summary

- **Total Functional Requirements (P0):** 16
- **Total Requirements Covered:** 16
- **Coverage Rate:** **100% (16/16)**
- **Traceability Loop:** Closed (Setiap `FR` P0 tertaut ke minimal satu `PRD`, `Component`, `Task`, dan `Test`).

---

## 2. Traceability Matrix

| Req ID | Deskripsi Kebutuhan | Feature / PRD | UI / Module | Entity Data | Task ID | Test ID | Status |
|---|---|---|---|---|---|---|---|
| `FR-001` | Penambahan Perangkat (Router, Switch, PC) | `FEAT-CANVAS` | `DevicePalette`, `Canvas` | `NetworkNodeData` | `TASK-P0-004`, `005` | `AC-CANVAS-001` | Covered |
| `FR-002` | Manipulasi Posisi & Hapus Node | `FEAT-CANVAS` | `Canvas`, `NodeBox` | `NetworkNodeData` | `TASK-P0-005` | `AC-002` | Covered |
| `FR-003` | Pengkabelan Port (Link Connection) | `FEAT-CANVAS` | `CustomEdge`, `PortHandle`| `NetworkEdgeData` | `TASK-P0-006` | `AC-003` | Covered |
| `FR-004` | Navigasi Canvas (Pan, Zoom, Reset) | `FEAT-CANVAS` | `CanvasControls`, `Minimap`| `ViewportState` | `TASK-P0-004` | `AC-004` | Covered |
| `FR-005` | Modal Form Konfigurasi GUI | `FEAT-DEV-CONFIG` | `ModalConfigForm` | `DevicePort` | `TASK-P0-014` | `AC-005` | Covered |
| `FR-006` | Terminal Mini Cisco IOS CLI | `FEAT-DEV-CONFIG` | `TerminalEmulator` | `CliSessionState` | `TASK-P0-015`, `016` | `AC-CONFIG-001` | Covered |
| `FR-007` | Perintah Diagnostik CLI (`show`, `ping`) | `FEAT-DEV-CONFIG` | `TerminalEmulator` | `CliSessionState` | `TASK-P0-015`, `016` | `AC-CONFIG-002` | Covered |
| `FR-008` | Ethernet Switching & MAC Learning | `FEAT-SIM-ENGINE` | `SwitchEngine (Worker)` | `MacTableEntry` | `TASK-P0-008` | `TEST-L2-001`..`004` | Covered |
| `FR-009` | Resolusi Alamat ARP (RFC 826) | `FEAT-SIM-ENGINE` | `ArpHandler (Worker)` | `ArpEntry` | `TASK-P0-009` | `TEST-ARP-001`..`003`| Covered |
| `FR-010` | IPv4 Subnetting & Routing (RFC 791) | `FEAT-SIM-ENGINE` | `RouterEngine (Worker)` | `RouteEntry` | `TASK-P0-010` | `TEST-IP-001`..`004` | Covered |
| `FR-011` | Simulasi ICMP Echo Ping (RFC 792) | `FEAT-SIM-ENGINE` | `IcmpHandler (Worker)` | `IcmpPacket` | `TASK-P0-010` | `TEST-ICMP-001`..`002`| Covered |
| `FR-012` | Visualisasi Aliran Animasi Paket | `FEAT-SIM-ENGINE` | `CustomEdge (SVG/CSS)` | `EthernetFrame` | `TASK-P0-012` | `AC-012` | Covered |
| `FR-013` | Kontrol Simulasi (Speed, Play, Pause) | `FEAT-SIM-ENGINE` | `SimulationToolbar` | `SimulationState` | `TASK-P0-013` | `AC-013` | Covered |
| `FR-014` | Ekspor Topologi ke File JSON | `FEAT-CANVAS` | `HeaderToolbar` | `TopologyJsonSchema` | `TASK-P0-017`, `018` | `AC-CANVAS-002` | Covered |
| `FR-015` | Impor Topologi dari File JSON | `FEAT-CANVAS` | `HeaderToolbar` | `TopologyJsonSchema` | `TASK-P0-017`, `018` | `AC-CANVAS-002` | Covered |
| `FR-016` | Standalone Desktop Windows Build | `FEAT-CANVAS` | `Tauri Rust Wrapper` | N/A | `TASK-P0-002`, `019` | `AC-016` | Covered |
