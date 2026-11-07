import { test, expect as baseExpect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(90_000);
const expect = baseExpect.configure({ timeout: 30_000 });

async function configure(page: Page, gateway: string) {
  await page.evaluate(async (gateway) => {
    const url = performance.getEntriesByType('resource').map((x) => x.name).find((x) => new URL(x).pathname === '/src/store/useAppStore.ts')!;
    const { useAppStore } = await import(url);
    const store = useAppStore.getState();
    if (!store.nodes.length) store.addDevice('pc', { x: 150, y: 100 });
    const id = useAppStore.getState().nodes[0].id;
    store.updateDeviceConfig(id, { label: 'PC-1', defaultGateway: gateway });
    store.updatePortConfig(id, 'fa0', { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0', status: 'up' });
  }, gateway);
}

async function seedStudent(page: Page, allowSelfCheck = true) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toBeVisible();
  await page.evaluate(async (allowSelfCheck) => {
    const url = performance.getEntriesByType('resource').map((x) => x.name).find((x) => new URL(x).pathname === '/src/features/classroom/classroomHub.ts')!;
    const { classroomHub: hub } = await import(url);
    const exercises = ['192.168.1.1', '192.168.1.254'].map((gateway, i) => ({ id: `e${i}`, title: `Gateway ${gateway}`, instructions: 'Konfigurasi saja', difficulty: 'Dasar', targets: [{ id: `t${i}`, title: 'Gateway PC-1', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10', gateway }] }));
    hub.setLockedRole('student');
    hub.createClass('Audit lokal', 'AUDIT-LOCAL', undefined, exercises, { local: true });
    hub.joinClass('AUDIT-LOCAL', 'Siswa Audit');
    hub.startExercises('AUDIT-LOCAL', exercises);
    hub.toggleSelfCheck('AUDIT-LOCAL', allowSelfCheck);
  }, allowSelfCheck);
  await expect(page.getByRole('heading', { name: 'Gateway 192.168.1.1', exact: true })).toBeVisible();
}

test('canvas and shutdown configuration survive refresh', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /PC Host/ })).toBeVisible();
  await configure(page, '192.168.1.1');
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__node').getByText('192.168.1.10', { exact: true })).toBeVisible();
});

test('independent questions retain their gateways and submit two correct answers', async ({ page }) => {
  await seedStudent(page);
  await configure(page, '192.168.1.1');
  await page.getByRole('button', { name: /Cek Mandiri/ }).click();
  await expect(page.getByRole('button', { name: 'Soal 1 100%' })).toBeVisible();
  await page.getByRole('button', { name: 'Soal 2 -', exact: true }).click();
  await configure(page, '192.168.1.254');
  await page.getByRole('button', { name: /Cek Mandiri/ }).click();
  await expect(page.getByRole('button', { name: 'Soal 2 100%' })).toBeVisible();
  await page.getByRole('button', { name: 'Soal 1 100%' }).click();
  // Pekerjaan kedua soal bertahan setelah refresh, lalu dikirim SATU KALI (dengan konfirmasi) dan dinilai benar.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Gateway 192.168.1.1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kirim Semua Jawaban' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ya, Kirim Jawaban', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Soal 1 100%' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Soal 2 100%' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jawaban Terkirim', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Jawaban Terkirim', exact: true })).toBeDisabled(); // tetap terkunci
});

for (const allowSelfCheck of [true, false]) {
  test(`export is work-only and never leaks cached grade (self-check ${allowSelfCheck})`, async ({ page }) => {
    await seedStudent(page, allowSelfCheck);
    await configure(page, '192.168.1.1');
    if (allowSelfCheck) {
      await page.getByRole('button', { name: /Cek Mandiri/ }).click();
      await expect(page.getByRole('button', { name: 'Soal 1 100%' })).toBeVisible();
      await configure(page, '192.168.1.99');
      await expect(page.getByRole('button', { name: 'Soal 1 100%' })).toHaveCount(0);
    }
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Ekspor Lembar Jawaban (.opsub)' }).click();
    const file = await download;
    const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(data.format).toBe('openpacket_work');
    expect(JSON.stringify(data)).not.toMatch(/"(score|evaluation|evaluations|feedback)":/);
    if (!allowSelfCheck) await expect(page.getByRole('button', { name: 'Soal 1 -', exact: true })).toBeVisible();
  });
}

test('packet position freezes on pause and resumes once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /PC Host/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Template', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan', exact: true }).first().click();
  // Wait for the template's 300ms fitView, so camera movement cannot masquerade as packet movement.
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((x) => x.name).find((x) => new URL(x).pathname === '/src/store/useAppStore.ts')!;
    const { useAppStore } = await import(url);
    const s = useAppStore.getState();
    s.setSimulationSpeed(0.5);
    s.setSimulationStatus('paused');
    s.setActivePackets([{ packetId: 'audit-packet', sourceNodeId: 'pc-1', targetNodeId: 'pc-2', type: 'ICMP_REQ', currentProtocol: 'ICMP' }]);
  });
  const packet = page.locator('.react-flow__edge').locator('circle[r="7"]').first();
  await expect(packet).toBeVisible();
  const before = await packet.boundingBox();
  await page.waitForTimeout(300);
  const after = await packet.boundingBox();
  expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeLessThan(1);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((x) => x.name).find((x) => new URL(x).pathname === '/src/store/useAppStore.ts')!;
    const { useAppStore } = await import(url);
    useAppStore.getState().setSimulationStatus('running');
  });
  await page.waitForTimeout(200);
  const moving = await packet.boundingBox();
  expect(Math.abs(moving!.x - after!.x) + Math.abs(moving!.y - after!.y)).toBeGreaterThan(1);
  await page.waitForTimeout(1800);
  const finished = await packet.boundingBox();
  await page.waitForTimeout(300);
  const stillFinished = await packet.boundingBox();
  expect(Math.abs(stillFinished!.x - finished!.x) + Math.abs(stillFinished!.y - finished!.y)).toBeLessThan(1);
});

for (const format of ['openpacket_work', 'openpacket_submission']) {
  test(`teacher import grades actual work instead of trusting a claim: ${format}`, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((x) => x.name).find((x) => new URL(x).pathname === '/src/features/classroom/classroomHub.ts')!;
      const { classroomHub: hub } = await import(url);
      hub.setLockedRole('teacher');
      hub.createClass('Impor QA', 'IMPORT-QA', undefined, [{ id: 'ex', title: 'IP PC', instructions: 'Konfigurasi IP', difficulty: 'Dasar', targets: [{ id: 'ip', title: 'IP benar', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10' }] }], { local: true });
    });
    await page.locator('header').getByRole('button', { name: /Kelas/ }).click();
    const file = {
      format, version: '1.0', studentNickname: 'Siswa Impor', participantId: 'import-stu', exerciseId: 'ex', exerciseIds: ['ex'], submittedAt: 1,
      topology: { nodes: [{ id: 'pc', type: 'deviceNode', position: { x: 100, y: 100 }, data: { id: 'pc', label: 'PC-1', type: 'pc', ports: [{ id: 'fa0', name: 'Fa0', status: 'up', macAddress: '02:00:00:00:00:01', ipAddress: '192.168.1.99' }] } }], edges: [] },
      ...(format === 'openpacket_submission' ? { submission: { participantId: 'import-stu', nickname: 'Siswa Impor', exerciseId: 'ex', score: 100, status: 'passed', evaluation: { score: 100, status: 'passed', checks: [], feedback: 'Stale claim', evaluatedAt: 'old' }, submittedAt: 1 } } : {}),
    };
    await page.locator('input[accept=".opsub,.json,application/json"]').setInputFiles({ name: 'jawaban.opsub', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    const row = page.getByRole('row').filter({ hasText: 'Siswa Impor' });
    await expect(row.getByText('0 / 100', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Verifikasi', exact: true }).click();
    await expect(row.getByText('Terverifikasi', { exact: true })).toBeVisible();
  });
}
