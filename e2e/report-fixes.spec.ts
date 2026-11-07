import { test, expect, type Page } from '@playwright/test';

async function applyTemplate(page: Page) {
  await page.getByRole('tab', { name: 'Template', exact: true }).click();
  await page.getByRole('button', { name: 'Terapkan', exact: true }).first().click();
}

async function startTeacher(page: Page, code: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toBeVisible();
  await page.evaluate(async (classCode) => {
    const hubUrl = performance.getEntriesByType('resource').map((e) => e.name).reverse()
      .find((url) => new URL(url).pathname === '/src/features/classroom/classroomHub.ts') ?? '/src/features/classroom/classroomHub.ts';
    const { classroomHub } = await import(hubUrl);
    classroomHub.setLockedRole('teacher');
    classroomHub.createClass('Kelas Regresi', classCode, undefined, [{
      id: 'ip-only', title: 'Konfigurasi IP', instructions: 'Atur IP PC-1.', difficulty: 'Dasar',
      targets: [{ id: 'ip', title: 'IP PC-1', type: 'device_config', deviceId: 'PC-1', address: '192.168.1.10', prefix: 24 }],
    }]);
  }, code);
  await expect.poll(async () => (await (await page.request.get(`/api/classroom/state?code=${code}`)).json()).success).toBe(true);
}

async function joinStudent(page: Page, code: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Kelas', exact: true })).toBeVisible();
  await page.evaluate(async (classCode) => {
    const loaded = performance.getEntriesByType('resource').map((e) => e.name).reverse();
    const hubUrl = loaded.find((url) => new URL(url).pathname === '/src/features/classroom/classroomHub.ts') ?? '/src/features/classroom/classroomHub.ts';
    const storeUrl = loaded.find((url) => new URL(url).pathname === '/src/store/useAppStore.ts') ?? '/src/store/useAppStore.ts';
    const [{ classroomHub }, { useAppStore }] = await Promise.all([import(hubUrl), import(storeUrl)]);
    useAppStore.getState().addDevice('pc', { x: 120, y: 120 });
    const node = useAppStore.getState().nodes[0];
    useAppStore.getState().updatePortConfig(node.id, 'fa0', { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' });
    classroomHub.setLockedRole('student');
    classroomHub.joinClass(classCode, 'Ani');
  }, code);
  await expect(page.getByText(/Target Praktikum/)).toBeVisible({ timeout: 20_000 });
}

test('template meminta konfirmasi; batal mempertahankan pekerjaan dan konfirmasi mengganti kanvas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /PC Host/ }).click();
  await applyTemplate(page);
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Terapkan', exact: true }).first().click();
  await confirmation.getByRole('button', { name: 'Muat Template', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});

test('panel routing menampilkan connected route yang aktif', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Router L3/ })).toBeVisible();
  await page.evaluate(async () => {
    const storeUrl = performance.getEntriesByType('resource').map((e) => e.name).reverse()
      .find((url) => new URL(url).pathname === '/src/store/useAppStore.ts') ?? '/src/store/useAppStore.ts';
    const { useAppStore } = await import(storeUrl);
    useAppStore.getState().addDevice('router', { x: 150, y: 100 });
    const node = useAppStore.getState().nodes[0];
    useAppStore.getState().updatePortConfig(node.id, 'fa0/0', { ipAddress: '192.168.10.1', subnetMask: '255.255.255.0', status: 'up' });
    useAppStore.getState().setSelectedNodeId(node.id);
  });
  await page.getByRole('tab', { name: 'Tabel', exact: true }).click();
  await expect(page.getByText('C 192.168.10.0/24', { exact: true })).toBeVisible();
  await expect(page.getByText(/Terhubung langsung.*FastEthernet 0\/0/)).toBeVisible();
});

test('konfigurasi GUI memperingatkan IP duplikat pada jaringan yang terkabel', async ({ page }) => {
  await page.goto('/');
  await applyTemplate(page);
  const secondPc = page.locator('.react-flow__node').filter({ hasText: 'PC-2' });
  await secondPc.hover();
  await secondPc.getByRole('button', { name: 'Konfigurasi PC-2', exact: true }).click();
  await page.getByPlaceholder('e.g. 192.168.1.10').fill('192.168.1.10');
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Notifications' }).getByText(/Konflik IP 192\.168\.1\.10/)).toBeVisible();
});

for (const reason of ['closed', 'kicked'] as const) {
  test(`siswa menerima alasan ${reason}, kanvas tetap ada, guru tidak mendapat pesan Mode Siswa`, async ({ page: teacher, browser }) => {
    const studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const student = await studentContext.newPage();
      const code = `REPORT-${reason}-${Date.now().toString(36)}`.toUpperCase();
      await startTeacher(teacher, code);
      await joinStudent(student, code);
      await teacher.locator('header').getByRole('button', { name: /Kelas/ }).click();
      if (reason === 'closed') {
        await teacher.getByRole('button', { name: 'Tutup Kelas', exact: true }).click();
        await teacher.getByRole('alertdialog').getByRole('button', { name: 'Tutup & Hapus', exact: true }).click();
      } else {
        await teacher.getByRole('button', { name: 'Keluarkan', exact: true }).click();
        await teacher.getByRole('alertdialog').getByRole('button', { name: 'Keluarkan Siswa', exact: true }).click();
      }
      await expect(student.getByText(reason === 'closed' ? /Kelas .* ditutup oleh guru/ : /Anda dikeluarkan dari kelas .* oleh guru/)).toBeVisible({ timeout: 15_000 });
      await expect(student.getByText(/Target Praktikum/)).toHaveCount(0);
      await expect(student.locator('.react-flow__node')).toHaveCount(1);
      await expect(teacher.getByText(/Berhasil keluar dari Mode Siswa/)).toHaveCount(0);
    } finally {
      await studentContext.close();
    }
  });
}

test('nilai 100 pada konfigurasi saja tetap menjelaskan bahwa konektivitas tidak diuji', async ({ page: teacher, browser }) => {
  const studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const student = await studentContext.newPage();
    const code = `REPORT-GRADE-${Date.now().toString(36)}`.toUpperCase();
    await startTeacher(teacher, code);
    await joinStudent(student, code);
    await expect(student.getByText(/Konektivitas tidak diuji oleh rubrik ini/).first()).toBeVisible();
    await student.getByRole('button', { name: /Cek Mandiri/ }).click();
    await expect(student.getByText('100/100', { exact: true }).first()).toBeVisible();
    await expect(student.getByText(/Konektivitas tidak diuji oleh rubrik ini/).first()).toBeVisible();
    await expect(student.locator('.react-flow__edge')).toHaveCount(0);
  } finally {
    await studentContext.close();
  }
});

test('kode kelas kustom yang masih aktif milik guru lain ditolak sebelum kelas dibuka (tanpa notifikasi sukses palsu)', async ({ page: guruA, browser }) => {
  const guruBContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const code = `IPA-${Date.now().toString(36)}`.toUpperCase();
    await startTeacher(guruA, code);

    const guruB = await guruBContext.newPage();
    await guruB.goto('/');
    await guruB.locator('header').getByRole('button', { name: /Kelas/ }).click();
    await guruB.getByRole('button', { name: 'Pilih Mode Guru', exact: true }).click();
    await guruB.locator('#cls-title').fill('Kelas IPA 5 Guru B');
    await guruB.locator('#cls-code').fill(code.toLowerCase());
    await guruB.getByRole('button', { name: 'Mulai Buka Kelas', exact: true }).click();

    const toasts = guruB.getByRole('region', { name: 'Notifications' });
    await expect(toasts.getByText(new RegExp(`Kode kelas ${code} sedang dipakai kelas lain`))).toBeVisible();
    await expect(toasts.getByText(/Kelas dibuka/)).toHaveCount(0);
    await expect(guruB.getByRole('button', { name: 'Mulai Buka Kelas', exact: true })).toBeVisible(); // tetap di form
    const room = await (await guruB.request.get(`/api/classroom/state?code=${code}`)).json();
    expect(room.session.title).toBe('Kelas Regresi'); // kelas guru A tidak tersentuh
  } finally {
    await guruBContext.close();
  }
});

test('siswa hanya dapat mengirim jawaban sekali: konfirmasi dua langkah, lalu tombol terkunci', async ({ page: teacher, browser }) => {
  const studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const student = await studentContext.newPage();
    const code = `ONCE-${Date.now().toString(36)}`.toUpperCase();
    await startTeacher(teacher, code);
    await joinStudent(student, code);
    const submissionCount = async () =>
      Object.keys((await (await teacher.request.get(`/api/classroom/state?code=${code}`, {
        headers: { 'X-Host-Token': await teacher.evaluate(() => JSON.parse(localStorage.getItem('openpacket_class_session') ?? '{}').hostToken) },
      })).json()).submissions ?? {}).length;

    // Klik pertama hanya membuka konfirmasi; Batal tidak mengirim apa pun.
    await student.getByRole('button', { name: 'Kirim Jawaban', exact: true }).click();
    const dialog = student.getByRole('alertdialog');
    await expect(dialog.getByText(/hanya dapat dikirim SATU KALI/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    await student.waitForTimeout(500);
    expect(await submissionCount()).toBe(0);

    // Klik kedua + konfirmasi = terkirim; tombol berubah dan terkunci.
    await student.getByRole('button', { name: 'Kirim Jawaban', exact: true }).click();
    await student.getByRole('alertdialog').getByRole('button', { name: 'Ya, Kirim Jawaban', exact: true }).click();
    const sentButton = student.getByRole('button', { name: 'Jawaban Terkirim', exact: true });
    await expect(sentButton).toBeVisible({ timeout: 15_000 });
    await expect(sentButton).toBeDisabled();
    await expect(student.getByText(/Jawaban sudah dikirim dan dikunci untuk ronde ini/)).toBeVisible();
    await expect.poll(submissionCount).toBe(1);

    // Tetap terkunci setelah polling relay (bukan hanya state lokal sesaat).
    await student.waitForTimeout(2500);
    await expect(sentButton).toBeDisabled();
  } finally {
    await studentContext.close();
  }
});
