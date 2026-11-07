# OpenPacket audit fixes implementation plan

> **For agentic workers:** Implement each task inline with test-driven-development and verification-before-completion. No delegation is needed for this execution.

**Goal:** Resolve the five reproducible findings in `audit-output/2026-10-24/report.md`.

**Architecture:** Keep the existing Zustand canvas and DOM-free simulation engine. Add browser draft persistence, independent student workspaces, and packet snapshots that teacher verification can grade per exercise. Export work without invoking self-check; imported work is graded on the teacher side.

**Tech Stack:** React 19, Zustand 5, TypeScript, Vitest, Playwright, existing Node relay.

**Spec:** `audit-output/2026-10-24/report.md`; user instruction “gas perbaiki”. Multi-exercise default: independent workspaces, as recommended in the clarification question; accept steering if it arrives.

## Global constraints

- Preserve AGENTS.md INV-001 through INV-008 and prior uncommitted repairs.
- No new dependencies, CLI commands, external database, or running/startup-config split.
- Drafts contain topology and work only; no auth credentials. Session draft storage isolates browser tabs and survives refresh; clearly describe this lifetime.
- Old submissions and single-topology snapshots remain readable.
- New packet snapshots keep existing relay size/authentication limits.
- UX skill search yielded no specific match for unsaved-work recovery; use existing DSD conventions and explicit save-status feedback as general guidance.

### Task 1: recover canvas drafts

Files: `src/features/workspace/draft.ts`, `src/main.tsx`, `src/components/terminal/DeviceCliModal.tsx`, `tests/unit/workspaceDraft.test.ts`.

- [x] Test draft recovery using a real store, including reset, blocked/corrupt storage, and idle restoration.
- [x] Run failing tests before adding draft serialization and synchronous store subscription.
- [x] Restore via the existing loadTopology normalization; preserve port shutdown, lab state, and device counters. Do not restore running animations or open dialogs.
- [x] Make write memory explicitly save the tab draft and report failure truthfully.

### Task 2: independent exercise work and valid grading snapshots

Files: `src/features/classroom/studentWorkspace.ts`, `types.ts`, `submissionBuilder.ts`, `verification.ts`, `classroomHub.ts`, `src/components/canvas/ClassroomStudentHUD.tsx`, `src/components/modal/ClassroomModal.tsx`, `scripts/classroom-relay-core.mjs`.

- [x] Test two conflicting gateway exercises with two real snapshots: both evaluate to 100 and teacher verification matches.
- [x] Test missing per-exercise snapshot is unavailable, never silently graded using another exercise's canvas.
- [x] Store selected exercise and its canvas under participant/class/round identity. Switching exercises saves current work and restores the selected work, including after refresh.
- [x] Invalidate displayed results on configuration changes and rubric/round changes; reject async results for changed work.
- [x] Send packet snapshots through the existing private snapshot channel and sanitize bounded per-exercise maps at the relay.

### Task 3: export work and grade on teacher import

Files: `exerciseParser.ts`, `ClassroomStudentHUD.tsx`, `ClassroomModal.tsx`, parser/verification unit tests and browser tests.

- [x] Add an ungraded work-file format with optional evaluation fields compatible with legacy graded files.
- [x] Export snapshots without evaluator calls or cached scores, even when self-check is disabled or exhausted.
- [x] Teacher imports evaluate the actual snapshot using available exercises. Display unavailable grades explicitly, never as a passing score; label unverified legacy claims.
- [x] Cover stale-score export and disabled-self-check behavior with regression tests.

### Task 4: pause and step animation

Files: `src/components/canvas/PacketAnimation.tsx`, `NetworkCableEdge.tsx`, `WirelessLinkEdge.tsx`, browser regression tests.

- [x] Observe rendered packet position changing during pause in a failing browser test.
- [x] Share a single finite packet animation between cable types; freeze position on pause, use speed, and advance once in step mode.
- [x] Honor reduced motion and retain the engine's typed IPC boundary.

### Task 5: verification and release

- [x] Run targeted regression tests; then `npm test`, `npm run type-check`, `npm run build`, and complete Playwright suite.
- [x] Browser smoke test refresh, question switching, exports, teacher verification, and pause.
- [x] Update changelog and deployment notes; deploy using the previously authorized backup/release/rollback workflow once all checks pass.
- [x] Verify public release and relay health; close synthetic QA classes.
