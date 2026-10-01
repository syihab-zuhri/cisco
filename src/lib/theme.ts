import { useSyncExternalStore } from 'react';

/**
 * Preferensi tema tampilan: terang, gelap, atau mengikuti sistem operasi.
 * Preferensi disimpan di localStorage (100% offline, INV-008) dan diterapkan
 * sebagai kelas `dark` pada <html>. Skrip kecil di index.html memasang kelas
 * yang sama sebelum render pertama agar tidak berkedip; logikanya harus tetap
 * sama dengan `parseThemePreference` + `resolveTheme` di bawah.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'openpacket-theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Nilai tak dikenal (storage rusak/kosong) jatuh ke `system`. */
export function parseThemePreference(raw: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

function readStoredPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

let preference: ThemePreference = readStoredPreference();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Pasang kelas `dark` + color-scheme pada <html> sesuai preferensi saat ini. */
export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(preference, systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage diblokir (mode privat dsb.): tema tetap berlaku untuk sesi ini.
  }
  applyTheme();
  notify();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Panggil sekali sebelum render: terapkan tema dan ikuti perubahan OS/tab lain. */
export function initTheme(): void {
  if (typeof window === 'undefined') return;
  preference = readStoredPreference();
  applyTheme();

  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener('change', () => {
      if (preference === 'system') applyTheme();
    });
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    preference = parseThemePreference(event.newValue);
    applyTheme();
    notify();
  });
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, getThemePreference, () => 'system' as const);
}
