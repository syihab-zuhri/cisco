import { describe, it, expect } from 'vitest';
import { createPauseGate, createStepGate } from '../../src/engine/gates';

/**
 * Regresi bug Step Mode (dilaporkan pengguna: "klik Next tidak terjadi apa-apa"):
 * implementasi lama memakai while-loop yang re-arm sendiri karena stepMode
 * tetap true — satu klik Next hanya memindahkan antrean waiter, event tidak
 * pernah diputar. Kontrak yang benar: satu next() = tepat satu wait() lepas.
 */
describe('createStepGate', () => {
  it('satu next() melepaskan TEPAT SATU waiter (regresi bug klik Next)', async () => {
    const gate = createStepGate();
    gate.setEnabled(true);

    let released = 0;
    const p1 = gate.wait().then(() => { released += 1; });
    const p2 = gate.wait().then(() => { released += 2; });

    gate.next();
    await p1;
    expect(released).toBe(1); // implementasi lama: tetap 0 selamanya

    gate.next();
    await p2;
    expect(released).toBe(3);
  });

  it('next() tanpa waiter tidak meledak dan tidak bocor ke klik berikutnya', async () => {
    const gate = createStepGate();
    gate.setEnabled(true);

    gate.next();
    gate.next(); // dua klik berlebih tanpa event yang menunggu

    let released = 0;
    const p = gate.wait().then(() => { released += 1; });
    // klik berlebih tadi TIDAK boleh melepas waiter baru
    await Promise.race([p, new Promise((r) => setTimeout(r, 20))]);
    expect(released).toBe(0);

    gate.next();
    await p;
    expect(released).toBe(1);
  });

  it('menonaktifkan step mode melepaskan semua waiter (playback normal lanjut)', async () => {
    const gate = createStepGate();
    gate.setEnabled(true);

    const waiters = Promise.all([gate.wait(), gate.wait(), gate.wait()]);
    let settled = false;
    void waiters.then(() => { settled = true; });

    gate.setEnabled(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(true);
  });

  it('wait() langsung lewat saat step mode tidak aktif', async () => {
    const gate = createStepGate();
    await gate.wait(); // tidak boleh menggantung
    expect(true).toBe(true);
  });
});

describe('createPauseGate', () => {
  it('pause menahan, resume melepas semua waiter', async () => {
    const gate = createPauseGate();
    gate.pause();

    let released = 0;
    const all = Promise.all([gate.wait(), gate.wait()]).then(() => { released += 1; });
    await new Promise((r) => setTimeout(r, 20));
    expect(released).toBe(0);

    gate.resume();
    await all;
    expect(released).toBe(1);
  });
});
