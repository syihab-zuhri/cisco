import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * E2E happy path (TESTING.md §5): tambah perangkat, terapkan template,
 * ping antar-PC dengan animasi, konfigurasi dual-mode, tanpa console error.
 *
 * Catatan selector (UI sudah berevolusi — spec ini mengikuti struktur aktual):
 * - Palet memakai Tabs (role="tab"): "Komponen" | "Template".
 * - Pemilih host ping memakai Base UI Select (role="combobox"), bukan <select> native.
 * - Tombol kirim ping berlabel "Kirim" (desktop & mobile sama).
 * - Tab panel bawah: "Log" | "Simulasi" | "Tabel"; counter timeline = "N/M event".
 */

function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Buka tab Template di palet alat. */
async function openTemplatesTab(page: Page) {
  await page.getByRole('tab', { name: 'Template' }).click();
}

/** Terapkan template pertama yang tersedia (kelompok "Dasar" = Peer-to-Peer). */
async function applyFirstTemplate(page: Page) {
  await openTemplatesTab(page);
  await page.getByRole('button', { name: 'Terapkan' }).first().click();
}

/** Pilih host sumber pada pemilih ping (Base UI Select, bukan <select> native). */
async function selectPingHost(page: Page, hostLabel: string | RegExp) {
  const pingBar = page.locator('header').getByRole('combobox');
  await pingBar.click();
  await page.getByRole('option', { name: hostLabel }).click();
}

/** Isi target IP lalu tekan tombol Kirim. */
async function sendPing(page: Page, targetIp: string) {
  await page.getByPlaceholder(/Target IP/).fill(targetIp);
  await page.getByRole('button', { name: 'Kirim', exact: true }).click();
}

/**
 * Buka dropdown "Alat" di toolbar desktop, lalu klik item berdasarkan label.
 */
async function openToolsMenuItem(page: Page, itemLabel: string | RegExp) {
  await page.locator('button[title="Alat"]').click();
  // Base UI Menu expose item sebagai [role=menuitem]; tunggu popup muncul dulu
  const item = page.getByRole('menuitem', { name: itemLabel });
  await item.first().waitFor({ state: 'visible', timeout: 10_000 });
  await item.first().click();
}

/**
 * Buka modal konfigurasi sebuah node.
 * Action bar node (gear/CLI/hapus) baru aktif setelah node di-hover atau
 * terpilih — hover dulu agar bar-nya clickable, bukan menembus ke pane.
 */
async function openDeviceConfig(page: Page, node: Locator) {
  await node.hover();
  await node.locator('button[title="Konfigurasi Perangkat (GUI)"]').click();
}

/**
 * Klik "Simpan" di dalam modal (footer DeviceConfigModal).
 * Wajib di-scope ke dialog: toolbar juga punya tombol "Simpan" (ekspor JSON).
 */
async function saveConfigDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan', exact: true }).click();
}

test.describe('OpenPacket happy path', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = watchConsoleErrors(page);
  });

  test.afterEach(async () => {
    expect(errors, 'Tidak boleh ada console/page error').toEqual([]);
  });

  test('menambah perangkat dari palet ke kanvas', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('OpenPacket')).toBeVisible();

    await page.getByRole('button', { name: /PC Host/ }).click();
    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Switch L2/ }).click();
    await expect(page.getByText('Switch-1', { exact: true })).toBeVisible();

    await expect(page.getByText('Perangkat baru ditambahkan: PC-1')).toBeVisible();
  });

  test('menerapkan template lalu ping antar-PC dengan animasi paket', async ({ page }) => {
    await page.goto('/');
    await applyFirstTemplate(page);

    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();
    await expect(page.getByText('PC-2', { exact: true })).toBeVisible();

    // Ping cepat dari Toolbar: PC-1 -> 192.168.1.20
    await selectPingHost(page, /PC-1/);
    await sendPing(page, '192.168.1.20');

    // Fase ARP cold-start tampil sebagai banner paket berjalan
    await expect(page.getByText(/ARP Request: Who has 192\.168\.1\.20/)).toBeVisible({
      timeout: 5_000,
    });

    // Ping selesai sukses (4/4 echo reply)
    await expect(page.getByText(/Ping ke 192\.168\.1\.20 selesai: 4\/4/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('modal konfigurasi GUI menyimpan IP dan tampil di node', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /PC Host/ }).click();
    const pcNode = page.locator('.react-flow__node', { hasText: 'PC-1' });
    await openDeviceConfig(page, pcNode);

    await page.getByPlaceholder('e.g. 192.168.1.10').fill('192.168.1.77');
    await saveConfigDialog(page);

    await expect(page.getByText('192.168.1.77', { exact: true })).toBeVisible();
  });

  test('terminal CLI: mode IOS, show ip int br, dan ping dari CLI', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await applyFirstTemplate(page);

    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();

    const node = page.locator('.react-flow__node').filter({ hasText: 'PC-1' }).first();
    await node.hover();
    await page.locator('button[title="Terminal CLI Cisco"]').first().click({ force: true });
    // Input prompt aktif di dalam dialog (bukan input Target IP di toolbar).
    const input = page.getByRole('dialog').locator('input[type="text"]');

    await input.fill('enable');
    await input.press('Enter');
    await expect(page.getByText('PC-1#')).toBeVisible();

    await input.fill('sh ip int br');
    await input.press('Enter');
    await expect(page.getByText(/FastEthernet 0\s+192\.168\.1\.10/)).toBeVisible();

    // ping dari CLI memakai format IOS dan melewati engine penuh
    await input.fill('ping 192.168.1.20');
    await input.press('Enter');
    await expect(page.getByText(/Success rate is 100 percent \(5\/5\)/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test('template hotspot rumah: ping 8.8.8.8 dari laptop via WiFi + cloud', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await openTemplatesTab(page);

    const hotspotCard = page.locator('div.group', { hasText: 'WiFi Hotspot Rumah' });
    await hotspotCard.getByRole('button', { name: 'Terapkan' }).click();

    await expect(page.getByText('Laptop-1', { exact: true })).toBeVisible();
    await expect(page.getByText('Cloud', { exact: true })).toBeVisible();

    // Ping dari laptop (via WiFi) ke IP publik tersimulasi
    await selectPingHost(page, /Laptop-1/);
    await sendPing(page, '8.8.8.8');

    await expect(page.getByText(/Ping ke 8\.8\.8\.8 selesai: 4\/4/)).toBeVisible({
      timeout: 60_000,
    });
  });

  test('lab 1: perbaiki gateway lalu ping lintas subnet terverifikasi otomatis', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    await openToolsMenuItem(page, /Lab Praktikum/);
    await page.getByText('Lab 1 · Perbaiki Gateway yang Salah').click();
    await page.getByRole('button', { name: /Mulai Lab/ }).click();
    await expect(page.getByText('PC-Staff', { exact: true })).toBeVisible();

    // Perbaiki gateway PC-Staff lewat form konfigurasi
    const pcNode = page.locator('.react-flow__node', { hasText: 'PC-Staff' });
    await openDeviceConfig(page, pcNode);
    await page.getByPlaceholder('e.g. 192.168.1.1', { exact: true }).fill('192.168.1.1');
    await saveConfigDialog(page);

    // Ping lintas subnet — kedua objektif lab harus tercentang otomatis
    await selectPingHost(page, /PC-Staff/);
    await sendPing(page, '192.168.2.20');

    await openToolsMenuItem(page, /Lab Aktif/);
    await expect(page.getByText(/Semua objektif tercapai/)).toBeVisible({ timeout: 30_000 });
  });

  test('kabel: klik untuk memilih → badge + tombol hapus muncul → kabel terlepas', async ({ page }) => {
    await page.goto('/');
    await applyFirstTemplate(page);

    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();

    // Klik kabel → terpilih → badge + tombol ✕ muncul (tanpa hover).
    // Kabel lurus punya bounding box setinggi 0px — klik via koordinat mouse.
    const edgeBox = await page.locator('.react-flow__edge-interaction').first().boundingBox();
    await page.mouse.click(edgeBox!.x + edgeBox!.width / 2, edgeBox!.y);
    await expect(page.getByLabel('Lepas kabel')).toBeVisible();

    await page.getByLabel('Lepas kabel').click();

    // Kabel lepas: kedua port kembali DOWN + log konfirmasi
    await expect(page.getByText(/Link DOWN/)).toBeVisible();
  });

  test('anotasi: square & teks custom bisa ditambah, dipilih, dan diwarnai', async ({ page }) => {
    await page.goto('/');

    // Square muncul di kanvas → klik untuk memilih → swatch warna muncul
    await page.getByRole('button', { name: /^Square$/ }).click();
    const squareNode = page.locator('.react-flow__node-squareNode');
    await expect(squareNode).toBeVisible();
    await squareNode.click();
    await expect(page.getByTitle('Warna Merah')).toBeVisible();
    await page.getByTitle('Warna Merah').click();

    // Teks custom: default "Catatan" tampil di kanvas
    await page.getByRole('button', { name: /^Teks$/ }).click();
    const textNode = page.locator('.react-flow__node-textNoteNode');
    await expect(textNode).toBeVisible();
    await expect(textNode.getByText('Catatan')).toBeVisible();
  });

  test('step mode: klik Next memutar tepat satu event per klik', async ({ page }) => {
    await page.goto('/');

    // Aktifkan Step Mode SEBELUM ping
    await page.getByRole('button', { name: /^Step$/ }).click();
    await applyFirstTemplate(page);
    await selectPingHost(page, /PC-1/);
    await sendPing(page, '192.168.1.20');

    // Buka tab Simulasi lebih dulu untuk membaca counter timeline
    await page.getByRole('tab', { name: 'Simulasi' }).click();
    const counter = page.getByText(/^\d+\/\d+ event$/);

    // Satu klik Next = tepat satu event diputar (regresi bug "Next tidak berfungsi")
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(counter).toHaveText(/^1\/\d+ event$/, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(counter).toHaveText(/^2\/\d+ event$/);
  });
});
