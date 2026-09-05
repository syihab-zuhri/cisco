# PROJECT MANIFEST: OpenPacket (Cisco-Pocket-Op)

> **Project:** OpenPacket — Lightweight Educational Network Simulator  
> **Document ID:** DOC-MANIFEST-001  
> **Version:** 1.0.0  
> **Status:** Draft  
> **Owner:** Software Architect & Project Planning Lead  
> **Last Updated:** 2026-09-05  
> **Depends On:** None  
> **Supersedes:** None  

---

## 1. Document Registry

| Document ID | Filename | Version | Status | Authoritative Domain | Dependencies | Action Plan |
|---|---|---|---|---|---|---|
| `DOC-MANIFEST-001` | `PROJECT_MANIFEST.md` | 1.0.0 | Draft | Document Registry & Governance | None | ✅ Dibuat (Batch 1) |
| `DOC-PLANNING-001` | `PLANNING.md` | 1.0.0 | Draft | Product & Project Strategy | `PROJECT_MANIFEST.md` | ✅ Dibuat (Batch 1) |
| `DOC-SRS-001` | `SRS.md` | 1.0.0 | Draft | Functional & Non-Functional Requirements | `PLANNING.md` | ✅ Dibuat (Batch 1) |
| `DOC-PRD-INDEX-001` | `PRD/_INDEX.md` | 1.0.0 | Draft | PRD Registry & Feature Index | `SRS.md` | ✅ Dibuat (Batch 2) |
| `DOC-PRD-001` | `PRD/PRD-001-CANVAS-TOPOLOGY.md` | 1.0.0 | Draft | Canvas, Nodes, Cables, & Port Management | `SRS.md` | ✅ Dibuat (Batch 2) |
| `DOC-PRD-002` | `PRD/PRD-002-SIMULATION-ENGINE.md` | 1.0.0 | Draft | Discrete-Event Engine (ARP, ICMP, L2/L3) | `SRS.md` | ✅ Dibuat (Batch 2) |
| `DOC-PRD-003` | `PRD/PRD-003-DEVICE-CONFIG-CLI.md` | 1.0.0 | Draft | Dual-mode Config (GUI Modal & Cisco CLI) | `SRS.md` | ✅ Dibuat (Batch 2) |
| `DOC-ARCH-001` | `ARCHITECTURE.md` | 1.0.0 | Draft | System Topology, Worker Engine, Data Flow | `SRS.md`, `PRD/` | ✅ Dibuat (Batch 2) |
| `DOC-ADR-001` | `ADR/ADR-001-TAURI-REACT-DESKTOP.md` | 1.0.0 | Draft | Decision Record: Tauri v2 vs Electron | `ARCHITECTURE.md` | ✅ Dibuat (Batch 3) |
| `DOC-ADR-002` | `ADR/ADR-002-REACT-FLOW-CANVAS.md` | 1.0.0 | Draft | Decision Record: React Flow vs Canvas/Konva | `ARCHITECTURE.md` | ✅ Dibuat (Batch 3) |
| `DOC-DSD-001` | `DSD.md` | 1.0.0 | Draft | Design System, UI Tokens, Components | `PRD/`, `ARCHITECTURE.md` | ✅ Dibuat (Batch 3) |
| `DOC-TEST-001` | `TESTING.md` | 1.0.0 | Draft | Test Strategy, RFC Verification, & UAT | `SRS.md`, `PRD/` | ✅ Dibuat (Batch 4) |
| `DOC-TASKS-001` | `TASKS.md` | 1.0.0 | Draft | Work Breakdown Structure & Sprint Tasks | `SRS.md`, `ARCHITECTURE.md` | ✅ Dibuat (Batch 4) |
| `DOC-ENV-001` | `ENVIRONMENT.md` | 1.0.0 | Draft | Dev Environment & Tauri Build Pipeline | `ARCHITECTURE.md` | ✅ Dibuat (Batch 4) |
| `DOC-AGENTS-001` | `AGENTS.md` | 1.0.0 | Draft | Handoff Rules, Invariants & Context Packs | All Documents | ✅ Dibuat (Batch 4) |
| `DOC-TRACE-001` | `TRACEABILITY.md` | 1.0.0 | Draft | Traceability Matrix (FR -> Test) | `SRS.md`, `TASKS.md`, `TESTING.md` | ✅ Dibuat (Batch 4) |
| `DOC-CHANGELOG-001`| `CHANGELOG.md` | 1.0.0 | Draft | Documentation Change Log | All Documents | ✅ Dibuat (Batch 4) |

---

## 2. Skipped Documents & Justification

| Document Name | Justification for Skipping |
|---|---|
| `PERMISSION.md` | Aplikasi beroperasi secara *single-user* lokal tanpa multi-tenant atau server role-based authorization. |
| `ERD.md` | Tidak ada database server relasional/SQL. Model data topologi adalah *in-memory graph* yang diserialisasi sebagai JSON schema di `ARCHITECTURE.md`. |
| `API.md` / `openapi.yaml` | Tidak ada backend REST/GraphQL API. Interaksi modular berupa *message passing* via Web Worker API di client-side. |
| `SECURITY.md` | Aplikasi tidak menyimpan data PII, credential, atau data finansial; zero attack surface dari sisi backend network listener. Aspek keamanan dasar dibahas di `SRS.md`. |
| `AI_FEATURES.md` | Sistem simulasi mengacu murni pada deterministik Computer Networking RFCs (L2/L3 protocols), tanpa komponen AI/LLM. |
| `ANALYTICS.md` | Aplikasi akademik offline tanpa tracker telemetri privasi. Evaluasi diukur melalui skenario UAT langsung di `TESTING.md`. |
| `MIGRATION.md` | Tidak ada database schema migration; skema JSON backward-compatibility ditangani langsung di deserializer. |
| `RUNBOOK.md` | Tidak ada production server deployment 24/7; deployment murni static web hosting dan standalone installer. |
| `RELEASE_CHECKLIST.md` | Digabungkan langsung ke dalam kriteria *Definition of MVP Success* di `PLANNING.md` dan `TESTING.md`. |

---

## 3. Batch Plan & Execution Progress

- **Batch 1 (Core Product & Requirements)**:
  - `PROJECT_MANIFEST.md` — [✅ Dibuat]
  - `PLANNING.md` — [✅ Dibuat]
  - `SRS.md` — [✅ Dibuat]
- **Batch 2 (Features PRD & System Architecture)**:
  - `PRD/_INDEX.md` — [✅ Dibuat]
  - `PRD/PRD-001-CANVAS-TOPOLOGY.md` — [✅ Dibuat]
  - `PRD/PRD-002-SIMULATION-ENGINE.md` — [✅ Dibuat]
  - `PRD/PRD-003-DEVICE-CONFIG-CLI.md` — [✅ Dibuat]
  - `ARCHITECTURE.md` — [✅ Dibuat]
- **Batch 3 (Architecture Decisions & Design System)**:
  - `ADR/ADR-001-TAURI-REACT-DESKTOP.md` — [✅ Dibuat]
  - `ADR/ADR-002-REACT-FLOW-CANVAS.md` — [✅ Dibuat]
  - `DSD.md` — [✅ Dibuat]
- **Batch 4 (Quality Assurance, Execution Tasks, & Agent Handoff)**:
  - `TESTING.md` — [✅ Dibuat]
  - `TASKS.md` — [✅ Dibuat]
  - `ENVIRONMENT.md` — [✅ Dibuat]
  - `AGENTS.md` — [✅ Dibuat]
  - `TRACEABILITY.md` — [✅ Dibuat]
  - `CHANGELOG.md` — [✅ Dibuat]

---

## 4. Governance & Quality Status

- **Current Gate:** `Gate C — Blueprint Generated, Awaiting Review`
- **Blocking Open Questions:** 0
- **Total P0 Coverage:** 100% (16/16 Functional Requirements tervalidasi di TRACEABILITY.md)
- **Readiness Score:** 94/100 (Memenuhi syarat untuk Handoff ke Coding Agent)
