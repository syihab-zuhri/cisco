import { useEffect, useRef } from 'react';
import { useAppStore, type ToastItem } from '../../store/useAppStore';
import { toast, Toaster } from '@/components/ui/toast';

const TOAST_TITLES: Record<ToastItem['type'], string> = {
  success: 'Berhasil',
  error: 'Error',
  warning: 'Peringatan',
  info: 'Info',
};

/**
 * Jembatan antara store (pushToast/dismissToast) dan toast manager Base UI.
 * Store tetap menjadi satu-satunya sumber kebenaran; komponen ini hanya
 * meneruskan toast baru ke manager (UI murni renderer).
 */
export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const pushedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of toasts) {
      if (pushedIdsRef.current.has(t.id)) continue;
      pushedIdsRef.current.add(t.id);
      toast.add({
        title: TOAST_TITLES[t.type],
        description: t.message,
        type: t.type,
      });
    }
  }, [toasts]);

  return <Toaster toastManager={toast} />;
}
