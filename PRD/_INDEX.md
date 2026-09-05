# PRD INDEX: Product Requirements Document Registry

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-PRD-INDEX-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Project Planning Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** DOC-SRS-001  
> **Supersedes:** None  

---

## 1. Feature Registry & Traceability

Berikut adalah inventaris seluruh Product Requirements Document (PRD) yang merinci implementasi fitur P0 (MVP) untuk sistem **OpenPacket**:

| Feature ID | Document Path | Priority | Scope / Module | Status | Functional Requirements Mapped |
|---|---|---|---|---|---|
| `FEAT-CANVAS` | `PRD/PRD-001-CANVAS-TOPOLOGY.md` | P0 | Interaksi Canvas, Node Drag-and-Drop, Pengkabelan Port, Serialisasi Topologi | ✅ Draft | `FR-001`, `FR-002`, `FR-003`, `FR-004`, `FR-014`, `FR-015` |
| `FEAT-SIM-ENGINE` | `PRD/PRD-002-SIMULATION-ENGINE.md` | P0 | Discrete-Event Network Simulator (L2 Switch MAC, RFC 826 ARP, RFC 791 IPv4, RFC 792 ICMP Ping) & Animasi PDU | ✅ Draft | `FR-008`, `FR-009`, `FR-010`, `FR-011`, `FR-012`, `FR-013` |
| `FEAT-DEV-CONFIG` | `PRD/PRD-003-DEVICE-CONFIG-CLI.md` | P0 | Antarmuka Konfigurasi Dual-Mode: Form GUI Modal & Mini Terminal Cisco IOS CLI Parser | ✅ Draft | `FR-005`, `FR-006`, `FR-007` |

---

## 2. Shared Domain Rules & Invariants

1. **State Isolation**: Logika perhitungan protokol jaringan (`FEAT-SIM-ENGINE`) tidak boleh mengakses DOM atau bergantung langsung pada komponen React UI canvas (`FEAT-CANVAS`). Komunikasi antar-keduanya wajib menggunakan pola *event-driven message passing*.
2. **Unified Data Model**: Konfigurasi perangkat yang diubah via Form GUI harus langsung terefleksi di Terminal CLI, dan sebaliknya (*Bi-directional State Synchronization* pada `FEAT-DEV-CONFIG`).
3. **No Phantom Links**: Kabel tidak dapat eksis tanpa terikat pada dua port valid di dua perangkat berbeda. Menghapus salah satu perangkat wajib menghapus seluruh kabel terkait secara atomik.
4. **Offline Resilience**: Seluruh state fitur harus dapat diserialisasi ke dalam format JSON mandiri tanpa referensi URL cloud eksternal.
