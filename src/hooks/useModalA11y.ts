import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseModalA11yOptions {
  onClose: () => void;
  enabled?: boolean;
}

/**
 * Escape route & focus management untuk semua modal (WCAG 2.1.2):
 * - Escape menutup modal.
 * - Tab/Shift+Tab terjebak di dalam dialog (focus trap).
 * - Fokus awal: elemen yang sudah auto-focus dipertahankan, jika tidak
 *   maka elemen fokusable pertama di dalam dialog.
 * - Saat modal ditutup, fokus dikembalikan ke elemen yang memicunya.
 */
export function useModalA11y({ onClose, enabled = true }: UseModalA11yOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const activeNow = document.activeElement;
    if (!(dialogRef.current && dialogRef.current.contains(activeNow))) {
      dialogRef.current
        ?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]
        ?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [enabled]);

  return dialogRef;
}
