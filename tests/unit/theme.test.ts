import { describe, it, expect } from 'vitest';
import {
  THEME_PREFERENCES,
  parseThemePreference,
  resolveTheme,
} from '../../src/lib/theme';

/**
 * Logika tema harus identik dengan skrip anti-kedip di index.html:
 * nilai tersimpan 'light' / 'dark' dipakai apa adanya, selain itu mengikuti
 * preferensi sistem operasi.
 */
describe('theme — parseThemePreference', () => {
  it('menerima tiga preferensi yang valid', () => {
    for (const preference of THEME_PREFERENCES) {
      expect(parseThemePreference(preference)).toBe(preference);
    }
  });

  it.each([null, undefined, '', 'Dark', 'auto', 'blue', 0, {}, []])(
    'jatuh ke "system" untuk nilai tak dikenal: %s',
    (raw) => {
      expect(parseThemePreference(raw)).toBe('system');
    }
  );
});

describe('theme — resolveTheme', () => {
  it('preferensi eksplisit mengabaikan sistem operasi', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('"system" mengikuti preferensi sistem operasi', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
