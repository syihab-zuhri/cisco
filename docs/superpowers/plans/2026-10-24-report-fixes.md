# OpenPacket Report Fixes Implementation Plan

**Goal:** Correct the confirmed classroom and simulator problems in the Zuhri report while keeping grading tied to the teacher's rubric.

**Architecture:** Keep the existing React/Zustand/Worker boundaries. Share pure routing and VLAN helpers where the UI and engine need the same decisions. End student sessions in ClassroomHub with an explicit local event carrying the reason, so UI cleanup cannot lose that reason.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Playwright, Vite.

**Spec:** `Laporan OpenPacket Zuhri.md`, the user's approved recommendations in this conversation, and `AGENTS.md`. Existing blueprint differences are acknowledged by the user; this task makes targeted corrections rather than replacing the architecture.

## Constraints

- Keep engine code independent of React and the DOM, typed Worker IPC, deterministic simulation, one cable per physical port, GUI/CLI synchronization, and offline simulation.
- Preserve scoring for configuration-only exercises; do not silently add connectivity requirements.
- Warn about duplicate IPs on the same physical L2 segment, including VLAN boundaries; keep isolated networks independent.
- Preserve student canvas work after a teacher closes the class or removes a student.
- Use existing confirmation dialogs, theme tokens, and accessible controls.
- Execute inline. Do not deploy or commit as part of this task.

## Task 1: Port diagnostics

Files: `src/engine/simulationEngine.ts`, `tests/unit/reportFixes.test.ts`.

- [x] Add regression cases for a connected disabled interface and an unplugged interface; assert the diagnostic explains the actual cause.
- [x] Run `npm test -- tests/unit/reportFixes.test.ts` and observe the disabled-interface case fail.
- [x] In the existing DOWN branch, use `findLink(sourceDev.id, sourcePort.id)` to distinguish `ADMIN DOWN` from an absent cable. Apply the same distinction to DHCP logs.
- [x] Run the focused tests again.

## Task 2: Connected routes

Files: `src/utils/routing.ts`, `src/engine/cli/cliEngine.ts`, `src/components/log/EventLogPanel.tsx`, `tests/unit/reportFixes.test.ts`.

- [x] Test connected networks, VLAN sub-interfaces, disabled ports, and retention of static/RIP routes through `getDeviceRoutes(device)`.
- [x] Observe failures before implementing the helper.
- [x] Return derived connected routes plus configured routes without mutating the device; consume this function in both CLI and the table panel.
- [x] Run focused tests and existing CLI tests.

## Task 3: Duplicate IP warnings

Files: `src/utils/l2.ts`, `src/utils/ipConflicts.ts`, `src/engine/simulationEngine.ts`, `src/store/useAppStore.ts`, `tests/unit/reportFixes.test.ts`.

- [x] Test `findIpConflicts(devices, links)` with same-segment duplicate addresses, disconnected segments, router boundaries, VLAN isolation, and tagged router sub-interfaces.
- [x] Observe failures before implementation.
- [x] Share the existing VLAN hop decision with the diagnostic traversal. Compare only address owners that share an L2 segment. Show one warning per newly detected conflict and retain an event log entry.
- [x] Exercise changes through the real store, including cabling two previously disconnected duplicate addresses and resolving a conflict.

## Task 4: Student session lifecycle

Files: `src/features/classroom/types.ts`, `src/features/classroom/classroomHub.ts`, `src/components/canvas/ClassroomStudentHUD.tsx`, `tests/unit/reportFixes.test.ts`, `e2e/report-fixes.spec.ts`.

- [x] Test close and kick through real hub subscriptions, preserving the reason after participant cleanup and never emitting a student-end event for the teacher.
- [x] Observe failures.
- [x] Add a local `STUDENT_SESSION_ENDED` event with `classCode`, `participantId`, and `reason: 'closed' | 'kicked'`. Exclude it from relay transmission. Handle relay polling and same-browser events consistently.
- [x] Display the reason once in the HUD; remove automatic calls to the voluntary student exit handler on teacher closure.

## Task 5: Protect work and explain assessment

Files: `src/components/palette/DevicePalette.tsx`, `src/features/classroom/exerciseEvaluator.ts`, `src/components/canvas/ClassroomStudentHUD.tsx`, `src/components/modal/ExerciseEditorModal.tsx`, `e2e/report-fixes.spec.ts`.

- [x] Add browser regressions that cancel template replacement and retain the canvas, confirm replacement, and verify that configuration-only scores explain that connectivity is not assessed.
- [x] Observe failures.
- [x] Wrap template application in the existing `requestConfirm` flow whenever nodes or edges exist.
- [x] Add assessment scope feedback and a visible rubric explanation; keep target types and scores unchanged.

## Task 6: Verification and documentation

- [x] Run focused tests, then `npm run type-check`, `npm test`, `npm run build`, and the relevant Playwright tests.
- [x] Inspect the app with agent-browser, including confirmation dialogs, route tables, student-end notices, and the mobile layout affected by new feedback.
- [x] Update `CHANGELOG.md` with the final behavior and verification results.
- [x] Inspect the diff and report any remaining deployment-specific checks separately.

## Results

- Completed inline with regression tests observed failing before the corresponding fixes.
- 455 unit tests passed; protocol engine line coverage: 90.96%.
- All 15 Playwright tests passed; TypeScript and the production build passed.
- Browser fixtures load the actual Vite module URL (including any HMR revision) so seeded test data uses the same singleton store as the UI.
- Existing CLI route fixtures now explicitly activate physical interfaces before expecting connected routes.
- No commit performed. After the implementation was verified, the user authorized VPS access for deployment; see `docs/deployments/2026-10-24-openpacket.md` for the subsequent production release and rollback procedure.
