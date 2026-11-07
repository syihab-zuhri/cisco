import { describe, expect, it } from 'vitest';
import { createWorkPackage, parseSubmissionJson } from '../../src/features/classroom/exerciseParser';
import { gradeImportedWork } from '../../src/features/classroom/verification';
import type { Exercise, StarterTopology } from '../../src/features/classroom/types';

const snapshot: StarterTopology = { nodes: [{ id: 'pc', type: 'deviceNode', position: { x: 1, y: 1 }, data: { id: 'pc', label: 'PC-1', type: 'pc', ports: [{ id: 'fa0', name: 'Fa0', macAddress: '02:00:00:00:00:01', status: 'up', ipAddress: '192.168.1.99' }] } }], edges: [] };
const ex: Exercise = { id: 'ex', title: 'IP', difficulty: 'Dasar', instructions: 'Konfigurasi', targets: [{ id: 't', title: 'IP benar', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10' }] };

describe('work-only answer file', () => {
  it('exports actual work without any grade or feedback and parses for teacher grading', () => {
    const file = createWorkPackage({ id: 's', nickname: 'Siswa', joinedAt: 0, status: 'in_progress' }, 'ex', ['ex'], snapshot);
    const json = JSON.stringify(file);
    expect(json).not.toMatch(/"(score|evaluation|evaluations|feedback)":/);
    const parsed = parseSubmissionJson(json);
    expect(parsed.success).toBe(true);
    expect(parsed.submission?.ungraded).toBe(true);
    expect(parsed.topology?.nodes[0].data.ports[0].ipAddress).toBe('192.168.1.99');
  });

  it('teacher grades actual snapshot rather than a stale legacy passing score', async () => {
    const legacy = { participantId: 's', nickname: 'Siswa', exerciseId: 'ex', score: 100, status: 'passed', evaluation: { score: 100, status: 'passed', checks: [], feedback: 'Salah klaim', evaluatedAt: 'old' }, submittedAt: 1 };
    const parsed = parseSubmissionJson(JSON.stringify({ format: 'openpacket_submission', submission: legacy, topology: snapshot }));
    const graded = await gradeImportedWork(parsed.submission!, parsed.topology!, [ex]);
    expect(graded.score).toBe(0);
    expect(graded.ungraded).toBe(false);
    expect(graded.evaluation.checks[0].passed).toBe(false);
  });

  it('does not present unknown exercise or missing snapshot as a real zero or passing grade', async () => {
    const parsed = parseSubmissionJson(JSON.stringify(createWorkPackage({ id: 's', nickname: 'Siswa', joinedAt: 0, status: 'in_progress' }, 'ex', ['ex'], snapshot)));
    expect((await gradeImportedWork(parsed.submission!, snapshot, [])).ungraded).toBe(true);
    expect((await gradeImportedWork(parsed.submission!, null, [ex])).ungraded).toBe(true);
  });
});
