import { test, expect, type Page } from '@playwright/test';

/**
 * E2E happy path (TESTING.md §5): tambah perangkat, terapkan template,
 * ping antar-PC dengan animasi, konfigurasi dual-mode, tanpa console error.
 */

function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
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

    await page.getByRole('button', { name: 'Template' }).click();
    await page.getByRole('button', { name: 'Terapkan' }).first().click();
    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();
    await expect(page.getByText('PC-2', { exact: true })).toBeVisible();

    // Ping cepat dari Toolbar: PC-1 -> 192.168.1.20
    await page.locator('select').selectOption('pc-1');
    await page.getByPlaceholder(/Target IP/).fill('192.168.1.20');
    await page.getByRole('button', { name: 'Send Ping' }).click();

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
    await page.locator('button[title="Konfigurasi Perangkat (GUI)"]').first().click();

    await page.getByPlaceholder('e.g. 192.168.1.10').fill('192.168.1.77');
    await page.getByRole('button', { name: 'Simpan Konfigurasi' }).click();

    await expect(page.getByText('192.168.1.77', { exact: true })).toBeVisible();
  });

  test('terminal CLI: mode IOS, show ip int br, dan ping dari CLI', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    await page.getByRole('button', { name: 'Template' }).click();
    await page.getByRole('button', { name: 'Terapkan' }).first().click();
    await expect(page.getByText('PC-1', { exact: true })).toBeVisible();

    await page.locator('button[title="Terminal CLI Cisco"]').first().click();
    const input = page.locator('div.fixed input');

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

    await page.getByRole('button', { name: 'Template' }).click();
    const hotspotCard = page.locator('div.group', { hasText: 'WiFi Hotspot Rumah' });
    await hotspotCard.getByRole('button', { name: 'Terapkan' }).click();

    await expect(page.getByText('Laptop-1', { exact: true })).toBeVisible();
    await expect(page.getByText('Cloud', { exact: true })).toBeVisible();

    // Ping dari laptop (via WiFi) ke IP publik tersimulasi
    await page.locator('select').selectOption('lap-rumah');
    await page.getByPlaceholder(/Target IP/).fill('8.8.8.8');
    await page.getByRole('button', { name: 'Send Ping' }).click();

    await expect(page.getByText(/Ping ke 8\.8\.8\.8 selesai: 4\/4/)).toBeVisible({
      timeout: 60_000,
    });
  });

  test('lab 1: perbaiki gateway lalu ping lintas subnet terverifikasi otomatis', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');

    await page.getByRole('button', { name: /^Lab$/ }).click();
    await page.getByText('Lab 1 · Perbaiki Gateway yang Salah').click();
    await page.getByRole('button', { name: /Mulai Lab/ }).click();
    await expect(page.getByText('PC-Staff', { exact: true })).toBeVisible();

    // Perbaiki gateway PC-Staff lewat form konfigurasi
    const pcNode = page.locator('.react-flow__node', { hasText: 'PC-Staff' });
    await pcNode.locator('button[title="Konfigurasi Perangkat (GUI)"]').click();
    await page.getByPlaceholder('e.g. 192.168.1.1', { exact: true }).fill('192.168.1.1');
    await page.getByRole('button', { name: 'Simpan Konfigurasi' }).click();

    // Ping lintas subnet — kedua objektif lab harus tercentang otomatis
    await page.locator('select').selectOption('pc-1');
    await page.getByPlaceholder(/Target IP/).fill('192.168.2.20');
    await page.getByRole('button', { name: 'Send Ping' }).click();

    await page.getByRole('button', { name: /Lab Aktif/ }).click();
    await expect(page.getByText(/Semua objektif tercapai/)).toBeVisible({ timeout: 30_000 });
  });

  test('kabel: klik untuk memilih → badge + tombol hapus muncul → kabel terlepas', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Template' }).click();
    await page.getByRole('button', { name: 'Terapkan' }).first().click();
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
});
