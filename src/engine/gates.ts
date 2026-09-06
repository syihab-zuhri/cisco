/**
 * Gerbang pacing playback (pause & step mode). Dipisah dari worker agar
 * logika antreannya bisa di-unit test secara langsung.
 */

/** Gerbang PAUSE: menahan semua event sampai di-resume (semua waiter dilepas). */
export function createPauseGate() {
  let armed = false;
  let waiters: Array<() => void> = [];
  return {
    pause() {
      armed = true;
    },
    resume() {
      armed = false;
      const pending = waiters;
      waiters = [];
      pending.forEach((wake) => wake());
    },
    async wait(): Promise<void> {
      // while-loop di sini BENAR: resume() melepas semua waiter sekaligus
      while (armed) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

/**
 * Gerbang STEP: satu sinyal `next()` melepaskan TEPAT SATU event.
 * Perhatian: tunggu sekali (if), BUKAN while — while akan re-arm sendiri
 * karena stepMode tetap true, sehingga klik Next tidak pernah memutar event
 * (bug yang dilaporkan pengguna).
 */
export function createStepGate() {
  let enabled = false;
  let waiters: Array<() => void> = [];
  return {
    setEnabled(value: boolean) {
      enabled = value;
      // Mematikan step mode di tengah antrean: lepaskan semua waiter agar
      // playback berjalan normal (dengan pacing) lagi.
      if (!enabled) {
        const pending = waiters;
        waiters = [];
        pending.forEach((wake) => wake());
      }
    },
    isEnabled(): boolean {
      return enabled;
    },
    async wait(): Promise<void> {
      if (!enabled) return; // sekali tunggu per event — bukan while
      await new Promise<void>((resolve) => waiters.push(resolve));
    },
    next() {
      const wake = waiters.shift();
      wake?.();
    },
  };
}
